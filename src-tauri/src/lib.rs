use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

mod cast;
mod epg_cache;

const MAX_PLAYLIST_BYTES: usize = 20 * 1024 * 1024;
const MAX_CATALOG_BYTES: usize = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 4 * 1024 * 1024;
const KEYRING_SERVICE: &str = "LAMAYNE.IPTV.Xtream";
// Ancien nom du coffre (versions de développement) : les comptes déjà enregistrés
// sont repris automatiquement, au moment où ils sont lus.
const LEGACY_KEYRING_SERVICE: &str = "MyStreamPlayer.Xtream";
const MAX_SAVED_SOURCES: usize = 20;
static VAULT_LOCK: Mutex<()> = Mutex::new(());
static SOURCE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(serde::Serialize, serde::Deserialize)]
struct StreamInfo {
    name: String,
    logo: Option<String>,
    group: String,
    stream_id: u32,
    stream_url: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedXtreamSource {
    id: String,
    name: String,
    server_url: String,
    username: String,
    password: String,
    created_at: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedXtreamSourceSummary {
    id: String,
    name: String,
    server_url: String,
    username: String,
    created_at: u64,
}

impl From<&SavedXtreamSource> for SavedXtreamSourceSummary {
    fn from(source: &SavedXtreamSource) -> Self {
        Self {
            id: source.id.clone(),
            name: source.name.clone(),
            server_url: source.server_url.clone(),
            username: source.username.clone(),
            created_at: source.created_at,
        }
    }
}

#[derive(Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedSourceIndex {
    source_ids: Vec<String>,
    last_used_source_id: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedXtreamSources {
    sources: Vec<SavedXtreamSourceSummary>,
    last_used_source_id: Option<String>,
}

fn network_client(timeout_seconds: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(timeout_seconds))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
        .build()
        .map_err(|_| "Impossible d'initialiser le client réseau.".to_string())
}

// Télécharge une image distante pour la webview quand elle refuse de la
// charger elle-même (contenu http, CSP, anti-hotlink du fournisseur).
// Retourne les octets bruts, sans encodage supplémentaire.
#[tauri::command]
async fn fetch_image(url: String) -> Result<tauri::ipc::Response, String> {
    let parsed =
        reqwest::Url::parse(url.trim()).map_err(|_| "Adresse d'image invalide.".to_string())?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Seules les adresses HTTP et HTTPS sont acceptées.".to_string());
    }

    if parsed.host_str().is_none() {
        return Err("Adresse d'image invalide.".to_string());
    }

    let client = network_client(20)?;

    let mut response = client
        .get(parsed)
        .header(reqwest::header::ACCEPT, "image/avif,image/webp,image/*,*/*;q=0.8")
        .send()
        .await
        .map_err(|_| "Image inaccessible.".to_string())?;

    if !response.status().is_success() {
        return Err("Image inaccessible.".to_string());
    }

    let is_image = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_ascii_lowercase().starts_with("image/"))
        .unwrap_or(false);

    if !is_image {
        return Err("Le fichier n'est pas une image.".to_string());
    }

    let mut bytes: Vec<u8> = Vec::new();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Le téléchargement de l'image a été interrompu.".to_string())?
    {
        if bytes.len() + chunk.len() > MAX_IMAGE_BYTES {
            return Err("Image trop volumineuse.".to_string());
        }

        bytes.extend_from_slice(&chunk);
    }

    Ok(tauri::ipc::Response::new(bytes))
}

// Détecte les liens franchement morts : beaucoup de catalogues IPTV listent des
// films dont le fichier n'existe plus. On ne télécharge pas le film : on
// demande seulement ses premiers octets.
//
// Retourne `false` uniquement quand le lien est certainement mort (erreur 404
// ou 410, ou page web à la place du film). Au moindre doute (erreur réseau,
// limite de connexions du fournisseur, refus 403, serveur occupé…) la réponse
// est `true` : mieux vaut proposer un film qui se lancera peut-être que de
// n'en proposer aucun.
#[tauri::command]
async fn probe_stream(url: String) -> Result<bool, String> {
    let parsed =
        reqwest::Url::parse(url.trim()).map_err(|_| "Adresse du flux invalide.".to_string())?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Seules les adresses HTTP et HTTPS sont acceptées.".to_string());
    }

    let client = network_client(12)?;

    let response = match client
        .get(parsed)
        .header(reqwest::header::RANGE, "bytes=0-1023")
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return Ok(true),
    };

    let status = response.status().as_u16();

    if status == 404 || status == 410 {
        return Ok(false);
    }

    if !response.status().is_success() {
        return Ok(true);
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_default();

    // Une page web (HTML, texte, JSON) à la place du film = lien mort.
    let looks_like_page = content_type.starts_with("text/")
        || content_type.contains("html")
        || content_type.contains("json")
        || content_type.contains("xml");

    Ok(!looks_like_page)
}

fn normalize_server_url(value: &str) -> Result<String, String> {
    let base = value.trim().trim_end_matches('/');
    let parsed =
        reqwest::Url::parse(base).map_err(|_| "Adresse du serveur Xtream invalide.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Le serveur doit utiliser HTTP ou HTTPS.".to_string());
    }
    if parsed.host_str().is_none() {
        return Err("Le serveur doit contenir un nom d'hôte valide.".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(
            "Utilisez les champs identifiant et mot de passe, pas des identifiants dans l'adresse."
                .to_string(),
        );
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(
            "Saisissez l'adresse de base du serveur, sans paramètres ni fragment.".to_string(),
        );
    }
    Ok(base.to_string())
}

fn json_text(value: Option<&serde_json::Value>) -> Option<String> {
    match value {
        Some(serde_json::Value::String(text)) => Some(text.clone()),
        Some(serde_json::Value::Number(number)) => Some(number.to_string()),
        _ => None,
    }
}

async fn read_limited_response(
    mut response: reqwest::Response,
    limit: usize,
    too_large_message: &str,
) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err(too_large_message.to_string());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Le téléchargement a été interrompu.".to_string())?
    {
        if chunk.len() > limit.saturating_sub(bytes.len()) {
            return Err(too_large_message.to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

#[tauri::command]
async fn fetch_m3u_playlist(url: String) -> Result<String, String> {
    let parsed_url =
        reqwest::Url::parse(url.trim()).map_err(|_| "Adresse de playlist invalide.".to_string())?;
    if !matches!(parsed_url.scheme(), "http" | "https") {
        return Err("Seules les adresses HTTP et HTTPS sont acceptées.".to_string());
    }
    let response = network_client(30)?
        .get(parsed_url)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "Le téléchargement a dépassé le délai autorisé.".to_string()
            } else {
                "Connexion impossible. Vérifiez l'adresse, le réseau et le fournisseur.".to_string()
            }
        })?;
    if !response.status().is_success() {
        return Err(format!(
            "Le fournisseur a répondu avec le statut HTTP {}.",
            response.status().as_u16()
        ));
    }
    let bytes = read_limited_response(
        response,
        MAX_PLAYLIST_BYTES,
        "Playlist trop volumineuse : limite de 20 Mio.",
    )
    .await?;
    let text = String::from_utf8(bytes)
        .map_err(|_| "La playlist doit être encodée en UTF-8.".to_string())?;
    if text.trim().is_empty() {
        return Err("Le fournisseur a renvoyé une playlist vide.".to_string());
    }
    Ok(text)
}

#[tauri::command]
async fn connect_xtream(
    server_url: String,
    username: String,
    password: String,
) -> Result<Vec<StreamInfo>, String> {
    let base = normalize_server_url(&server_url)?;
    let client = network_client(30)?;
    let mut streams_url = reqwest::Url::parse(&format!("{}/player_api.php", base))
        .map_err(|_| "Adresse du serveur invalide.".to_string())?;
    streams_url
        .query_pairs_mut()
        .append_pair("username", &username)
        .append_pair("password", &password)
        .append_pair("action", "get_live_streams");
    let response = client.get(streams_url).header("Accept", "application/json, text/plain, */*")
        .send().await.map_err(|error| {
            if error.is_timeout() {
                "La connexion au serveur Xtream a dépassé le délai autorisé.".to_string()
            } else {
                "Impossible de se connecter au serveur Xtream. Vérifiez l'adresse, le réseau et les identifiants.".to_string()
            }
        })?;
    if !response.status().is_success() {
        return Err(format!(
            "Le serveur Xtream a répondu avec le statut HTTP {}.",
            response.status().as_u16()
        ));
    }
    let bytes = read_limited_response(
        response,
        MAX_CATALOG_BYTES,
        "Liste de chaînes trop volumineuse : limite de 50 Mio.",
    )
    .await?;
    let streams_json: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Format de données invalide reçu du serveur Xtream.".to_string())?;
    let mut categories_url = reqwest::Url::parse(&format!("{}/player_api.php", base))
        .map_err(|_| "Adresse du serveur invalide.".to_string())?;
    categories_url
        .query_pairs_mut()
        .append_pair("username", &username)
        .append_pair("password", &password)
        .append_pair("action", "get_live_categories");
    let response = client
        .get(categories_url)
        .header("Accept", "application/json, text/plain, */*")
        .send()
        .await
        .map_err(|_| "Impossible de récupérer les catégories Xtream.".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "La récupération des catégories a échoué : HTTP {}.",
            response.status().as_u16()
        ));
    }
    let bytes = read_limited_response(
        response,
        MAX_CATALOG_BYTES,
        "Liste de catégories trop volumineuse.",
    )
    .await?;
    let categories_json: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Format invalide pour les catégories Xtream.".to_string())?;
    let categories = categories_json
        .as_array()
        .ok_or_else(|| "Le serveur n'a pas renvoyé une liste de catégories.".to_string())?;
    let mut category_names = HashMap::<String, String>::new();
    for category in categories {
        let Some(id) = json_text(category.get("category_id")) else {
            continue;
        };
        let Some(name) = category
            .get("category_name")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
        else {
            continue;
        };
        category_names.insert(id, name.to_string());
    }
    let streams_array = streams_json
        .as_array()
        .ok_or_else(|| "Le serveur Xtream n'a pas renvoyé une liste de chaînes.".to_string())?;
    let mut streams = Vec::new();
    for stream in streams_array {
        let Some(name) = stream.get("name").and_then(|v| v.as_str()) else {
            continue;
        };
        let stream_id = stream
            .get("stream_id")
            .and_then(|v| {
                v.as_u64()
                    .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
            })
            .and_then(|id| u32::try_from(id).ok());
        let Some(stream_id) = stream_id else {
            continue;
        };
        let logo = stream
            .get("stream_icon")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let group = json_text(stream.get("category_id"))
            .and_then(|id| category_names.get(&id).cloned())
            .unwrap_or_else(|| "Sans catégorie".to_string());
        let stream_url = format!(
            "{}/live/{}/{}/{}.ts",
            base,
            urlencoding::encode(&username),
            urlencoding::encode(&password),
            stream_id
        );
        streams.push(StreamInfo {
            name: name.to_string(),
            logo,
            group,
            stream_id,
            stream_url: Some(stream_url),
        });
    }
    if streams.is_empty() {
        return Err("Le serveur n'a renvoyé aucune chaîne exploitable.".to_string());
    }
    Ok(streams)
}

#[tauri::command]
async fn fetch_xtream_catalog(
    server_url: String,
    username: String,
    password: String,
    action: String,
    item_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let allowed_actions = [
        "get_vod_categories",
        "get_vod_streams",
        "get_vod_info",
        "get_series_categories",
        "get_series",
        "get_series_info",
        "get_short_epg",
    ];
    if !allowed_actions.contains(&action.as_str()) {
        return Err("Action de catalogue non autorisée.".to_string());
    }
    let base = normalize_server_url(&server_url)?;
    let mut url = reqwest::Url::parse(&format!("{}/player_api.php", base))
        .map_err(|_| "Adresse du serveur invalide.".to_string())?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("username", &username)
            .append_pair("password", &password)
            .append_pair("action", &action);
        if matches!(
            action.as_str(),
            "get_series_info" | "get_vod_info" | "get_short_epg"
        ) {
            let id = item_id
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Identifiant du contenu manquant.".to_string())?;
            let parameter = match action.as_str() {
                "get_series_info" => "series_id",
                "get_short_epg" => "stream_id",
                _ => "vod_id",
            };
            query.append_pair(parameter, id);
            if action == "get_short_epg" {
                query.append_pair("limit", "4");
            }
        }
    }
    let timeout = if action == "get_short_epg" { 15 } else { 60 };
    let response = network_client(timeout)?
        .get(url)
        .header("Accept", "application/json, text/plain, */*")
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "Le chargement du catalogue a dépassé le délai autorisé.".to_string()
            } else {
                "Impossible de contacter le serveur du catalogue.".to_string()
            }
        })?;
    if !response.status().is_success() {
        return Err(format!(
            "Le catalogue a répondu avec le statut HTTP {}.",
            response.status().as_u16()
        ));
    }
    let bytes = read_limited_response(
        response,
        MAX_CATALOG_BYTES,
        "Catalogue trop volumineux : limite de 50 Mio.",
    )
    .await?;
    let result: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Le serveur a renvoyé un catalogue JSON invalide.".to_string())?;
    if matches!(
        action.as_str(),
        "get_vod_categories" | "get_vod_streams" | "get_series_categories" | "get_series"
    ) && !result.is_array()
    {
        return Err("Le serveur n'a pas renvoyé la liste attendue.".to_string());
    }
    Ok(result)
}

fn profile_vault_key(profile_id: &str) -> Result<String, String> {
    if profile_id.is_empty() || profile_id.len() > 96 {
        return Err("Identifiant de profil invalide.".to_string());
    }
    let encoded: String = profile_id
        .as_bytes()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect();
    Ok(format!("profile-{}", encoded))
}
fn validate_source_id(source_id: &str) -> Result<(), String> {
    if source_id.len() != 32 || !source_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Identifiant de source invalide.".to_string());
    }
    Ok(())
}
fn vault_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, key)
        .map_err(|_| "Impossible d'accéder au gestionnaire d'identifiants Windows.".to_string())
}
fn legacy_entry(key: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(LEGACY_KEYRING_SERVICE, key).ok()
}
fn vault_read(key: &str) -> Result<Option<String>, String> {
    match vault_entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => {
            // Compte enregistré sous l'ancien nom : on le déplace vers le nouveau.
            if let Some(old) = legacy_entry(key) {
                if let Ok(value) = old.get_password() {
                    if vault_entry(key)?.set_password(&value).is_ok() {
                        let _ = old.delete_credential();
                    }
                    return Ok(Some(value));
                }
            }
            Ok(None)
        }
        Err(_) => Err(
            "Impossible de lire le coffre Windows. Vérifiez l'accès à votre session Windows."
                .to_string(),
        ),
    }
}
fn vault_write(key: &str, value: &str) -> Result<(), String> {
    if value.encode_utf16().count() > 1200 {
        return Err("L'enregistrement est trop long pour le coffre Windows. Raccourcissez le nom ou vérifiez les champs.".to_string());
    }
    vault_entry(key)?.set_password(value).map_err(|_| {
        "Impossible d'enregistrer les identifiants dans le coffre Windows.".to_string()
    })?;
    // Plus de copie sous l'ancien nom.
    if let Some(old) = legacy_entry(key) {
        let _ = old.delete_credential();
    }
    Ok(())
}
fn vault_delete(key: &str) -> Result<(), String> {
    if let Some(old) = legacy_entry(key) {
        let _ = old.delete_credential();
    }
    match vault_entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Impossible de supprimer les identifiants du coffre Windows.".to_string()),
    }
}
fn source_vault_key(profile_key: &str, source_id: &str) -> String {
    format!("{}-source-{}", profile_key, source_id)
}
fn read_source_index(profile_key: &str) -> Result<SavedSourceIndex, String> {
    match vault_read(&format!("{}-index", profile_key))? {
        Some(raw) => serde_json::from_str(&raw)
            .map_err(|_| "La liste des comptes enregistrés est illisible.".to_string()),
        None => Ok(SavedSourceIndex::default()),
    }
}
fn write_source_index(profile_key: &str, index: &SavedSourceIndex) -> Result<(), String> {
    let raw = serde_json::to_string(index)
        .map_err(|_| "Impossible de préparer la liste des comptes.".to_string())?;
    vault_write(&format!("{}-index", profile_key), &raw)
}
fn read_saved_source(
    profile_key: &str,
    source_id: &str,
) -> Result<Option<SavedXtreamSource>, String> {
    validate_source_id(source_id)?;
    match vault_read(&source_vault_key(profile_key, source_id))? {
        Some(raw) => {
            let source: SavedXtreamSource = serde_json::from_str(&raw)
                .map_err(|_| "Le compte enregistré est illisible.".to_string())?;
            if source.id != source_id {
                return Err("L'identifiant du compte enregistré est incohérent.".to_string());
            }
            Ok(Some(source))
        }
        None => Ok(None),
    }
}
fn new_source_id() -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "L'horloge système est invalide.".to_string())?
        .as_nanos();
    let counter = SOURCE_COUNTER.fetch_add(1, Ordering::Relaxed) as u128;
    Ok(format!("{:032x}", (nanos << 16) | (counter & 0xffff)))
}
fn current_timestamp() -> Result<u64, String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "L'horloge système est invalide.".to_string())?
        .as_millis();
    u64::try_from(millis).map_err(|_| "L'horloge système est invalide.".to_string())
}

#[tauri::command]
fn list_saved_xtream_sources(profile_id: String) -> Result<SavedXtreamSources, String> {
    let _guard = VAULT_LOCK
        .lock()
        .map_err(|_| "Le coffre est temporairement indisponible.".to_string())?;
    let profile_key = profile_vault_key(&profile_id)?;
    let mut index = read_source_index(&profile_key)?;
    let mut sources = Vec::new();
    let mut valid_ids = Vec::new();
    for id in &index.source_ids {
        if let Some(source) = read_saved_source(&profile_key, id)? {
            valid_ids.push(id.clone());
            sources.push(SavedXtreamSourceSummary::from(&source));
        }
    }
    let needs_cleanup = valid_ids != index.source_ids
        || index
            .last_used_source_id
            .as_ref()
            .is_some_and(|id| !valid_ids.contains(id));
    if needs_cleanup {
        index.source_ids = valid_ids;
        if index
            .last_used_source_id
            .as_ref()
            .is_some_and(|id| !index.source_ids.contains(id))
        {
            index.last_used_source_id = None;
        }
        write_source_index(&profile_key, &index)?;
    }
    Ok(SavedXtreamSources {
        sources,
        last_used_source_id: index.last_used_source_id,
    })
}

#[tauri::command]
fn save_xtream_source(
    profile_id: String,
    source_id: Option<String>,
    name: String,
    server_url: String,
    username: String,
    password: String,
) -> Result<SavedXtreamSourceSummary, String> {
    let _guard = VAULT_LOCK
        .lock()
        .map_err(|_| "Le coffre est temporairement indisponible.".to_string())?;
    let profile_key = profile_vault_key(&profile_id)?;
    let mut index = read_source_index(&profile_key)?;
    let name = name.trim().to_string();
    let server_url = normalize_server_url(&server_url)?;
    if name.is_empty() || name.chars().count() > 100 {
        return Err("Le nom de la source doit contenir entre 1 et 100 caractères.".to_string());
    }
    if username.trim().is_empty() || password.is_empty() {
        return Err("L'identifiant et le mot de passe sont obligatoires.".to_string());
    }
    let id = match source_id {
        Some(id) => {
            validate_source_id(&id)?;
            if !index.source_ids.contains(&id) {
                return Err("Ce compte n'appartient pas au profil sélectionné.".to_string());
            }
            id
        }
        None => {
            if index.source_ids.len() >= MAX_SAVED_SOURCES {
                return Err("Ce profil possède déjà 20 sources enregistrées.".to_string());
            }
            let id = new_source_id()?;
            if index.source_ids.contains(&id) {
                return Err("Impossible de générer un identifiant. Réessayez.".to_string());
            }
            id
        }
    };
    let key = source_vault_key(&profile_key, &id);
    let old_raw = vault_read(&key)?;
    let created_at = match &old_raw {
        Some(raw) => {
            let old: SavedXtreamSource = serde_json::from_str(raw)
                .map_err(|_| "Le compte existant est illisible.".to_string())?;
            old.created_at
        }
        None => current_timestamp()?,
    };
    let source = SavedXtreamSource {
        id: id.clone(),
        name,
        server_url,
        username,
        password,
        created_at,
    };
    let raw = serde_json::to_string(&source)
        .map_err(|_| "Impossible de préparer le compte.".to_string())?;
    vault_write(&key, &raw)?;
    if !index.source_ids.contains(&id) {
        index.source_ids.push(id.clone());
    }
    index.last_used_source_id = Some(id);
    if let Err(error) = write_source_index(&profile_key, &index) {
        let rollback = match old_raw {
            Some(previous) => vault_write(&key, &previous),
            None => vault_delete(&key),
        };
        return match rollback {
            Ok(()) => Err(error),
            Err(_) => Err("L'enregistrement a échoué et sa restauration n'a pas pu être confirmée dans le coffre Windows.".to_string()),
        };
    }
    Ok(SavedXtreamSourceSummary::from(&source))
}

#[tauri::command]
fn load_saved_xtream_source(
    profile_id: String,
    source_id: Option<String>,
) -> Result<Option<SavedXtreamSource>, String> {
    let _guard = VAULT_LOCK
        .lock()
        .map_err(|_| "Le coffre est temporairement indisponible.".to_string())?;
    let profile_key = profile_vault_key(&profile_id)?;
    let mut index = read_source_index(&profile_key)?;
    let id = match source_id {
        Some(id) => id,
        None => match index.last_used_source_id.clone() {
            Some(id) => id,
            None => return Ok(None),
        },
    };
    validate_source_id(&id)?;
    if !index.source_ids.contains(&id) {
        return Err("Ce compte n'appartient pas au profil sélectionné.".to_string());
    }
    let source = read_saved_source(&profile_key, &id)?;
    if source.is_none() {
        return Err(
            "Les identifiants de ce compte sont introuvables dans le coffre Windows.".to_string(),
        );
    }
    index.last_used_source_id = Some(id);
    write_source_index(&profile_key, &index)?;
    Ok(source)
}

#[tauri::command]
fn forget_xtream_source(profile_id: String, source_id: String) -> Result<(), String> {
    let _guard = VAULT_LOCK
        .lock()
        .map_err(|_| "Le coffre est temporairement indisponible.".to_string())?;
    let profile_key = profile_vault_key(&profile_id)?;
    validate_source_id(&source_id)?;
    let mut index = read_source_index(&profile_key)?;
    if !index.source_ids.contains(&source_id) {
        return Err("Ce compte n'appartient pas au profil sélectionné.".to_string());
    }
    vault_delete(&source_vault_key(&profile_key, &source_id))?;
    index.source_ids.retain(|id| id != &source_id);
    if index.last_used_source_id.as_ref() == Some(&source_id) {
        index.last_used_source_id = None;
    }
    write_source_index(&profile_key, &index)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_libmpv::init())
        .invoke_handler(tauri::generate_handler![
            fetch_m3u_playlist,
            connect_xtream,
            fetch_xtream_catalog,
            fetch_image,
            probe_stream,
            cast::cast_supported,
            cast::cast_discover,
            cast::cast_play,
            cast::cast_stop,
            epg_cache::fetch_public_epg,
            epg_cache::refresh_public_epg,
            epg_cache::epg_diagnose,
            list_saved_xtream_sources,
            save_xtream_source,
            load_saved_xtream_source,
            forget_xtream_source
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
