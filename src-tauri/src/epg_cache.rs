use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

// Passé à 2 : les noms de chaînes sont maintenant indexés sans accents.
const CACHE_VERSION: u32 = 2;
const REFRESH_SECONDS: u64 = 6 * 3600;
const MAX_STALE_SECONDS: u64 = 24 * 3600;
const RETRY_SECONDS: u64 = 300;
const MAX_COUNTRIES: usize = 6;
const MAX_XML: u64 = 256 * 1024 * 1024;
const MAX_INDEX: u64 = 96 * 1024 * 1024;
const MAX_DISK_FILE: u64 = 32 * 1024 * 1024;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct PublicEpgProgramme {
    title: String,
    start: u64,
    end: u64,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Guide {
    version: u32,
    country: String,
    fetched_at: u64,
    names: HashMap<String, Vec<String>>,
    programmes: HashMap<String, Vec<PublicEpgProgramme>>,
}

#[derive(Default)]
struct Slot {
    disk_checked: bool,
    guide: Option<Arc<Guide>>,
    retry_after: u64,
}

struct Entry {
    used_at: u64,
    slot: Arc<tokio::sync::Mutex<Slot>>,
}

static SLOTS: LazyLock<Mutex<HashMap<String, Entry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static DOWNLOADS: LazyLock<tokio::sync::Semaphore> =
    LazyLock::new(|| tokio::sync::Semaphore::new(2));

fn clock() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_secs())
        .map_err(|_| "Horloge système invalide.".to_string())
}

fn fold(c: char) -> char {
    match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ý' | 'ÿ' => 'y',
        other => other,
    }
}

// Nom comparable : minuscules, sans accents, sans espaces ni ponctuation.
fn normalize(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(fold)
        .filter(|c| c.is_alphanumeric())
        .collect()
}

// Mentions de qualité en fin de nom (« France 2 HD » = « France 2 »).
const NOISE_SUFFIXES: [&str; 6] = ["fhd", "uhd", "hevc", "4k", "hd", "sd"];

fn strip_noise(value: &str) -> String {
    let mut text = value.to_string();
    loop {
        let mut changed = false;
        for suffix in NOISE_SUFFIXES.iter() {
            if text.len() > suffix.len() + 1 && text.ends_with(*suffix) {
                let keep = text.len() - suffix.len();
                text.truncate(keep);
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    text
}

// Identifiants du guide qui correspondent à ce nom : d'abord le nom exact, puis
// le nom sans mention de qualité des deux côtés.
fn find_ids<'a>(guide: &'a Guide, wanted: &str) -> Vec<&'a String> {
    if let Some(ids) = guide.names.get(wanted) {
        return ids.iter().collect();
    }
    let target = strip_noise(wanted);
    if target.is_empty() {
        return Vec::new();
    }
    let mut found: Vec<&'a String> = Vec::new();
    for (key, ids) in guide.names.iter() {
        if strip_noise(key) == target {
            for id in ids.iter() {
                if !found.contains(&id) {
                    found.push(id);
                }
            }
        }
    }
    found
}

// Plusieurs identifiants pour un même nom (versions HD/SD, doublons) : on garde
// celui qui a un programme en cours, puis le plus de programmes à venir.
fn choose<'a>(
    guide: &'a Guide,
    ids: &[&'a String],
    now: u64,
) -> Option<(&'a String, &'a Vec<PublicEpgProgramme>)> {
    ids.iter()
        .filter_map(|id| guide.programmes.get(*id).map(|items| (*id, items)))
        .filter(|(_, items)| items.iter().any(|p| p.end > now))
        .max_by_key(|(_, items)| {
            (
                items.iter().any(|p| p.start <= now && p.end > now),
                items.iter().filter(|p| p.end > now).count(),
            )
        })
}

fn parse_time(value: &str) -> Option<u64> {
    use chrono::{DateTime, NaiveDateTime};
    let mut parts = value.split_whitespace();
    let date = parts.next()?;
    let offset = parts.next();
    if parts.next().is_some() {
        return None;
    }
    let format = match date.len() {
        14 => "%Y%m%d%H%M%S",
        12 => "%Y%m%d%H%M",
        _ => return None,
    };
    let timestamp = if let Some(zone) = offset {
        let zone = if ["UTC", "GMT", "Z"]
            .iter()
            .any(|s| zone.eq_ignore_ascii_case(s))
        {
            "+0000"
        } else {
            zone
        };
        DateTime::parse_from_str(&format!("{} {}", date, zone), &format!("{} %z", format))
            .ok()?
            .timestamp()
    } else {
        NaiveDateTime::parse_from_str(date, format)
            .ok()?
            .and_utc()
            .timestamp()
    };
    u64::try_from(timestamp).ok()
}

fn slot_for(country: &str, now: u64) -> Result<Arc<tokio::sync::Mutex<Slot>>, String> {
    let mut slots = SLOTS
        .lock()
        .map_err(|_| "Cache EPG indisponible.".to_string())?;
    if let Some(entry) = slots.get_mut(country) {
        entry.used_at = now;
        return Ok(entry.slot.clone());
    }
    if slots.len() >= MAX_COUNTRIES {
        let oldest = slots
            .iter()
            .filter(|(_, entry)| Arc::strong_count(&entry.slot) == 1)
            .min_by_key(|(_, entry)| entry.used_at)
            .map(|(key, _)| key.clone());
        if let Some(key) = oldest {
            slots.remove(&key);
        } else {
            return Err("Trop de guides EPG en cours de chargement. Réessayez.".to_string());
        }
    }
    let slot = Arc::new(tokio::sync::Mutex::new(Slot::default()));
    slots.insert(
        country.to_string(),
        Entry {
            used_at: now,
            slot: slot.clone(),
        },
    );
    Ok(slot)
}

fn usable(guide: &Guide, country: &str, now: u64, max_age: u64) -> bool {
    guide.version == CACHE_VERSION
        && guide.country == country
        && guide.fetched_at <= now.saturating_add(300)
        && now.saturating_sub(guide.fetched_at) < max_age
        && guide
            .programmes
            .values()
            .any(|items| items.iter().any(|p| p.end > now))
}

fn read_disk(path: &Path, country: &str, now: u64) -> Option<Guide> {
    let file = std::fs::File::open(path).ok()?;
    if file.metadata().ok()?.len() > MAX_DISK_FILE {
        return None;
    }
    let mut data = Vec::new();
    flate2::read::GzDecoder::new(file)
        .take(MAX_INDEX + 1)
        .read_to_end(&mut data)
        .ok()?;
    if data.len() as u64 > MAX_INDEX {
        return None;
    }
    let guide: Guide = serde_json::from_slice(&data).ok()?;
    usable(&guide, country, now, MAX_STALE_SECONDS).then_some(guide)
}

fn prune_disk(directory: &Path, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let mut files: Vec<_> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !name.starts_with("guide-v1-") || !name.ends_with(".json.gz") {
                return None;
            }
            let meta = entry.metadata().ok()?;
            Some((path, meta.modified().ok()?, meta.len()))
        })
        .collect();
    files.sort_by_key(|(_, time, _)| *time);
    let mut total: u64 = files.iter().map(|(_, _, size)| *size).sum();
    let mut count = files.len();
    for (path, _, size) in files {
        if count <= 16 && total <= 256 * 1024 * 1024 {
            break;
        }
        if path == keep {
            continue;
        }
        if std::fs::remove_file(path).is_ok() {
            total = total.saturating_sub(size);
            count = count.saturating_sub(1);
        }
    }
}

fn write_disk(path: &Path, guide: &Guide) -> Result<(), String> {
    let directory = path.parent().ok_or("Chemin cache invalide.")?;
    std::fs::create_dir_all(directory).map_err(|_| "Création du cache impossible.".to_string())?;
    let data =
        serde_json::to_vec(guide).map_err(|_| "Sérialisation EPG impossible.".to_string())?;
    if data.len() as u64 > MAX_INDEX {
        return Err("Index EPG trop volumineux.".to_string());
    }
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    encoder
        .write_all(&data)
        .map_err(|_| "Compression EPG impossible.".to_string())?;
    let compressed = encoder
        .finish()
        .map_err(|_| "Compression EPG impossible.".to_string())?;
    if compressed.len() as u64 > MAX_DISK_FILE {
        return Err("Cache EPG trop volumineux.".to_string());
    }
    let temp = path.with_extension(format!("tmp-{}", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(&compressed)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
        return Err("Écriture du cache EPG impossible ; le guide reste en mémoire.".to_string());
    }
    prune_disk(directory, path);
    Ok(())
}

fn parse_guide(bytes: Vec<u8>, country: String, now: u64) -> Result<Guide, String> {
    let mut xml = Vec::new();
    if bytes.starts_with(&[0x1f, 0x8b]) {
        flate2::read::GzDecoder::new(&bytes[..])
            .take(MAX_XML + 1)
            .read_to_end(&mut xml)
            .map_err(|_| "Guide gzip invalide.".to_string())?;
    } else {
        xml = bytes;
    }
    if xml.len() as u64 > MAX_XML {
        return Err("Guide XMLTV trop volumineux.".to_string());
    }
    let text = std::str::from_utf8(&xml).map_err(|_| "Guide XMLTV non UTF-8.".to_string())?;
    let document = roxmltree::Document::parse_with_options(
        text,
        roxmltree::ParsingOptions {
            allow_dtd: true,
            nodes_limit: 2_000_000,
        },
    )
    .map_err(|_| "Guide XMLTV invalide ou trop complexe.".to_string())?;
    if !document.root_element().has_tag_name("tv") {
        return Err("La réponse n'est pas un guide XMLTV.".to_string());
    }
    let mut guide = Guide {
        version: CACHE_VERSION,
        country,
        fetched_at: now,
        names: HashMap::new(),
        programmes: HashMap::new(),
    };
    for node in document
        .root_element()
        .children()
        .filter(|n| n.has_tag_name("channel"))
    {
        let Some(id) = node.attribute("id") else {
            continue;
        };
        for name in node.children().filter(|n| n.has_tag_name("display-name")) {
            let key = normalize(name.text().unwrap_or(""));
            if key.is_empty() {
                continue;
            }
            let ids = guide.names.entry(key).or_default();
            if !ids.iter().any(|item| item == id) {
                ids.push(id.to_string());
            }
        }
    }
    let mut count = 0usize;
    for node in document
        .root_element()
        .children()
        .filter(|n| n.has_tag_name("programme"))
    {
        let Some(id) = node.attribute("channel") else {
            continue;
        };
        let (Some(start), Some(end)) = (
            node.attribute("start").and_then(parse_time),
            node.attribute("stop").and_then(parse_time),
        ) else {
            continue;
        };
        if end <= start || end <= now.saturating_sub(3600) || start > now + 3 * 86400 {
            continue;
        }
        let title = node
            .children()
            .find(|n| n.has_tag_name("title"))
            .and_then(|n| n.text())
            .unwrap_or("")
            .trim();
        if title.is_empty() {
            continue;
        }
        count += 1;
        if count > 250_000 {
            return Err("Guide EPG trop volumineux après indexation.".to_string());
        }
        guide
            .programmes
            .entry(id.to_string())
            .or_default()
            .push(PublicEpgProgramme {
                title: title.to_string(),
                start,
                end,
            });
    }
    for items in guide.programmes.values_mut() {
        items.sort_by_key(|p| (p.start, p.end));
        items.dedup_by(|a, b| a.start == b.start && a.end == b.end && a.title == b.title);
    }
    if guide.names.is_empty() || !guide.programmes.values().any(|p| !p.is_empty()) {
        return Err("Guide sans chaînes ou sans programmes récents.".to_string());
    }
    Ok(guide)
}

// `force` ignore le guide récent et le délai d'attente après un échec : il sert à
// la mise à jour manuelle des Réglages.
async fn load_guide(
    app: tauri::AppHandle,
    country: String,
    force: bool,
) -> Result<Arc<Guide>, String> {
    let now = clock()?;
    let slot = slot_for(&country, now)?;
    let mut slot = slot.lock().await;
    let path: Option<PathBuf> = app.path().app_cache_dir().ok().map(|dir| {
        dir.join("epg-v1")
            .join(format!("guide-v1-{}.json.gz", country))
    });
    if !slot.disk_checked {
        slot.disk_checked = true;
        if let Some(path) = path.clone() {
            let code = country.clone();
            if let Ok(Some(guide)) =
                tauri::async_runtime::spawn_blocking(move || read_disk(&path, &code, now)).await
            {
                slot.guide = Some(Arc::new(guide));
                eprintln!("[EPG cache] {} chargé depuis le disque", country);
            }
        }
    }
    if !force {
        if let Some(guide) = &slot.guide {
            if usable(guide, &country, now, REFRESH_SECONDS) {
                return Ok(guide.clone());
            }
        }
        if now < slot.retry_after {
            return slot
                .guide
                .as_ref()
                .filter(|g| usable(g, &country, now, MAX_STALE_SECONDS))
                .cloned()
                .ok_or_else(|| {
                    "Guide EPG temporairement indisponible ; nouvelle tentative différée."
                        .to_string()
                });
        }
    }
    let result: Result<Guide, String> = async {
        let _permit = DOWNLOADS
            .acquire()
            .await
            .map_err(|_| "Chargement EPG arrêté.".to_string())?;
        eprintln!("[EPG cache] téléchargement du guide {}", country);
        let url = format!("https://epg.pw/xmltv/epg_{}.xml.gz", country.to_uppercase());
        let response = crate::network_client(90)?
            .get(url)
            .send()
            .await
            .map_err(|_| "Téléchargement EPG impossible.".to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Guide EPG indisponible : HTTP {}.",
                response.status().as_u16()
            ));
        }
        let bytes = crate::read_limited_response(
            response,
            80 * 1024 * 1024,
            "Guide EPG compressé trop volumineux.",
        )
        .await?;
        let code = country.clone();
        let fetched_at = clock()?;
        tauri::async_runtime::spawn_blocking(move || parse_guide(bytes, code, fetched_at))
            .await
            .map_err(|_| "Analyse du guide EPG interrompue.".to_string())?
    }
    .await;
    match result {
        Ok(guide) => {
            let guide = Arc::new(guide);
            slot.guide = Some(guide.clone());
            slot.retry_after = 0;
            if let Some(path) = path {
                let saving = guide.clone();
                let code = country.clone();
                // Le guide est utilisable avant la fin de l'écriture disque.
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(error) = write_disk(&path, &saving) {
                        eprintln!("[EPG cache] {} : {}", code, error);
                    }
                });
            }
            Ok(guide)
        }
        Err(error) => {
            slot.retry_after = clock()?.saturating_add(RETRY_SECONDS);
            eprintln!("[EPG cache] {} : {}", country, error);
            slot.guide
                .as_ref()
                .filter(|g| usable(g, &country, now, MAX_STALE_SECONDS))
                .cloned()
                .ok_or(error)
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_public_epg(
    app: tauri::AppHandle,
    country_code: String,
    channel_name: String,
) -> Result<Vec<PublicEpgProgramme>, String> {
    let country = country_code.trim().to_lowercase();
    if country.len() != 2 || !country.bytes().all(|b| b.is_ascii_alphabetic()) {
        return Err("Code pays invalide.".to_string());
    }
    let wanted = normalize(&channel_name);
    if wanted.is_empty() {
        return Ok(Vec::new());
    }
    let guide = load_guide(app, country, false).await?;
    let now = clock()?;
    let ids = find_ids(&guide, &wanted);
    let Some((_, items)) = choose(&guide, &ids, now) else {
        return Ok(Vec::new());
    };
    Ok(items
        .iter()
        .filter(|p| p.end > now)
        .take(8)
        .cloned()
        .collect())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EpgRefreshItem {
    country: String,
    ok: bool,
    fetched_at: u64,
    channels: usize,
    error: String,
}

// Mise à jour manuelle : retélécharge les guides publics des pays indiqués.
#[tauri::command]
pub(crate) async fn refresh_public_epg(
    app: tauri::AppHandle,
    countries: Vec<String>,
) -> Result<Vec<EpgRefreshItem>, String> {
    let mut report: Vec<EpgRefreshItem> = Vec::new();
    let mut done: Vec<String> = Vec::new();
    for code in countries.into_iter().take(MAX_COUNTRIES) {
        let country = code.trim().to_lowercase();
        if country.len() != 2
            || !country.bytes().all(|b| b.is_ascii_alphabetic())
            || done.contains(&country)
        {
            continue;
        }
        done.push(country.clone());
        match load_guide(app.clone(), country.clone(), true).await {
            Ok(guide) => report.push(EpgRefreshItem {
                country,
                ok: true,
                fetched_at: guide.fetched_at,
                channels: guide.programmes.len(),
                error: String::new(),
            }),
            Err(error) => report.push(EpgRefreshItem {
                country,
                ok: false,
                fetched_at: 0,
                channels: 0,
                error,
            }),
        }
    }
    Ok(report)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EpgDiagnosis {
    country: String,
    wanted: String,
    guide_age_minutes: u64,
    guide_channels: usize,
    matches: Vec<String>,
    similar: Vec<String>,
    chosen: String,
    has_current: bool,
    current_title: String,
    upcoming: usize,
}

// Explique pourquoi une chaîne a (ou n'a pas) ses programmes dans le guide public.
#[tauri::command]
pub(crate) async fn epg_diagnose(
    app: tauri::AppHandle,
    country_code: String,
    channel_name: String,
) -> Result<EpgDiagnosis, String> {
    let country = country_code.trim().to_lowercase();
    if country.len() != 2 || !country.bytes().all(|b| b.is_ascii_alphabetic()) {
        return Err("Code pays invalide.".to_string());
    }
    let wanted = normalize(&channel_name);
    let guide = load_guide(app, country.clone(), false).await?;
    let now = clock()?;
    let ids = find_ids(&guide, &wanted);
    let chosen = choose(&guide, &ids, now);
    let matches: Vec<String> = ids.iter().map(|id| (*id).clone()).collect();
    let mut similar: Vec<String> = if wanted.is_empty() {
        Vec::new()
    } else {
        guide
            .names
            .keys()
            .filter(|key| {
                **key != wanted
                    && (key.contains(wanted.as_str()) || wanted.contains(key.as_str()))
            })
            .take(200)
            .cloned()
            .collect()
    };
    similar.sort();
    similar.truncate(8);
    let (chosen_id, has_current, current_title, upcoming) = match chosen {
        Some((id, items)) => {
            let current = items.iter().find(|p| p.start <= now && p.end > now);
            (
                id.clone(),
                current.is_some(),
                current.map(|p| p.title.clone()).unwrap_or_default(),
                items.iter().filter(|p| p.end > now).count(),
            )
        }
        None => (String::new(), false, String::new(), 0),
    };
    Ok(EpgDiagnosis {
        country,
        wanted,
        guide_age_minutes: now.saturating_sub(guide.fetched_at) / 60,
        guide_channels: guide.programmes.len(),
        matches,
        similar,
        chosen: chosen_id,
        has_current,
        current_title,
        upcoming,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timezone_offsets() {
        assert_eq!(
            parse_time("20261018200000 +0200"),
            parse_time("20261018180000 +0000")
        );
        assert_eq!(
            parse_time("20261018180000"),
            parse_time("20261018180000 UTC")
        );
        assert_eq!(parse_time("20260230200000 +0000"), None);
    }
    #[test]
    fn accents_and_quality_suffixes() {
        assert_eq!(normalize("TF1 Séries Films"), "tf1seriesfilms");
        assert_eq!(strip_noise("france2hd"), "france2");
        assert_eq!(strip_noise("m6"), "m6");
        assert_eq!(strip_noise("hd"), "hd");
    }

    #[test]
    fn matching_tolerates_variants_and_duplicates() {
        let mut guide = Guide {
            version: CACHE_VERSION,
            country: "fr".into(),
            fetched_at: 0,
            names: HashMap::new(),
            programmes: HashMap::new(),
        };
        guide.names.insert("france2hd".into(), vec!["a".into()]);
        guide
            .names
            .insert("tf1".into(), vec!["b".into(), "c".into()]);
        let programme = |start, end| PublicEpgProgramme {
            title: "T".into(),
            start,
            end,
        };
        guide.programmes.insert("a".into(), vec![programme(0, 100)]);
        guide.programmes.insert("b".into(), vec![programme(0, 100)]);
        guide
            .programmes
            .insert("c".into(), vec![programme(0, 100), programme(100, 200)]);
        assert_eq!(find_ids(&guide, "france2").len(), 1);
        let ids = find_ids(&guide, "tf1");
        let (chosen, _) = choose(&guide, &ids, 50).unwrap();
        assert_eq!(chosen, "c");
    }

    #[test]
    fn xml_names_and_cdata() {
        let now = parse_time("20261018180000 +0000").unwrap();
        let xml = br#"<tv><channel id="one"><display-name>Test &amp; TV</display-name><display-name>Alias</display-name></channel><programme channel="one" start="20261018190000 +0200" stop="20261018210000 +0200"><title><![CDATA[Film & suite]]></title></programme></tv>"#;
        let guide = parse_guide(xml.to_vec(), "fr".into(), now).unwrap();
        assert!(guide.names.contains_key("testtv"));
        assert!(guide.names.contains_key("alias"));
        assert_eq!(guide.programmes["one"][0].title, "Film & suite");
    }
}
