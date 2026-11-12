use serde_json::Value;
use std::time::Duration;

// Filmographie d'un acteur, pour la liste « films disponibles avec … » de la
// fiche d'un film. Données : Wikidata (libre, sans clé). Seul le NOM de l'acteur
// est envoyé, et seulement quand l'utilisateur clique sur ce nom.

const USER_AGENT: &str = "LAMAYNE-IPTV/0.1 (https://github.com/lamayne/lamayne-iptv)";
const MAX_RESPONSE_BYTES: usize = 3 * 1024 * 1024;
const MAX_FILMS: usize = 400;
const MAX_TITLES_PER_FILM: usize = 8;

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FilmographyEntry {
    titles: Vec<String>,
    year: Option<i32>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| "Impossible d'initialiser le client réseau.".to_string())
}

async fn get_json(client: &reqwest::Client, url: reqwest::Url) -> Result<Value, String> {
    let mut response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| "Impossible de contacter le service de filmographie.".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Le service de filmographie a répondu avec le statut HTTP {}.",
            response.status().as_u16()
        ));
    }
    let mut bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Le téléchargement a été interrompu.".to_string())?
    {
        if chunk.len() > MAX_RESPONSE_BYTES.saturating_sub(bytes.len()) {
            return Err("Réponse inattendue du service de filmographie.".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "Réponse inattendue du service de filmographie.".to_string())
}

fn is_entity_id(id: &str) -> bool {
    id.len() >= 2 && id.starts_with('Q') && id[1..].bytes().all(|b| b.is_ascii_digit())
}

fn search_url(name: &str) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse("https://www.wikidata.org/w/api.php")
        .map_err(|_| "Nom d'acteur invalide.".to_string())?;
    // Q33999 = « acteur » : on ne retient que les personnes qui ont ce métier.
    let search = format!("{} haswbstatement:P106=Q33999", name.replace('"', " "));
    url.query_pairs_mut()
        .append_pair("action", "query")
        .append_pair("list", "search")
        .append_pair("srsearch", &search)
        .append_pair("srnamespace", "0")
        .append_pair("srlimit", "3")
        .append_pair("format", "json");
    Ok(url)
}

fn first_entity_id(value: &Value) -> Option<String> {
    value
        .get("query")?
        .get("search")?
        .as_array()?
        .iter()
        .filter_map(|item| item.get("title")?.as_str())
        .find(|id| is_entity_id(id))
        .map(|id| id.to_string())
}

// Les films (et leurs sous-types : drame, comédie, court métrage…) où l'acteur
// figure à la distribution, avec leurs titres en français, en anglais et en
// version originale, et l'année de sortie.
fn sparql_query(id: &str) -> String {
    format!(
        r#"SELECT ?film (MIN(?year) AS ?y) (GROUP_CONCAT(DISTINCT ?label; separator="|") AS ?labels) WHERE {{
  ?film wdt:P161 wd:{id} .
  ?film wdt:P31/wdt:P279* wd:Q11424 .
  OPTIONAL {{ ?film wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }}
  {{ ?film rdfs:label ?label . FILTER(LANG(?label) IN ("fr", "en")) }}
  UNION {{ ?film skos:altLabel ?label . FILTER(LANG(?label) IN ("fr", "en")) }}
  UNION {{ ?film wdt:P1476 ?label . }}
}}
GROUP BY ?film
LIMIT {limit}"#,
        id = id,
        limit = MAX_FILMS
    )
}

fn parse_entries(value: &Value) -> Vec<FilmographyEntry> {
    let Some(rows) = value
        .get("results")
        .and_then(|results| results.get("bindings"))
        .and_then(|bindings| bindings.as_array())
    else {
        return Vec::new();
    };
    let mut entries = Vec::new();
    for row in rows.iter().take(MAX_FILMS) {
        let labels = row
            .get("labels")
            .and_then(|v| v.get("value"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mut titles: Vec<String> = Vec::new();
        for label in labels.split('|') {
            let label = label.trim();
            if label.is_empty() || label.len() > 200 || is_entity_id(label) {
                continue;
            }
            if !titles.iter().any(|title| title == label) {
                titles.push(label.to_string());
            }
            if titles.len() >= MAX_TITLES_PER_FILM {
                break;
            }
        }
        if titles.is_empty() {
            continue;
        }
        let year = row
            .get("y")
            .and_then(|v| v.get("value"))
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<i32>().ok());
        entries.push(FilmographyEntry { titles, year });
    }
    entries
}

#[tauri::command]
pub(crate) async fn fetch_filmography(name: String) -> Result<Vec<FilmographyEntry>, String> {
    let name = name.trim().to_string();
    let length = name.chars().count();
    if !(2..=80).contains(&length) || name.chars().any(|c| c.is_control()) {
        return Err("Nom d'acteur invalide.".to_string());
    }
    let client = client()?;
    let found = get_json(&client, search_url(&name)?).await?;
    // Acteur inconnu de Wikidata : pas d'erreur, simplement aucun résultat.
    let Some(id) = first_entity_id(&found) else {
        return Ok(Vec::new());
    };
    let mut url = reqwest::Url::parse("https://query.wikidata.org/sparql")
        .map_err(|_| "Nom d'acteur invalide.".to_string())?;
    url.query_pairs_mut()
        .append_pair("format", "json")
        .append_pair("query", &sparql_query(&id));
    let result = get_json(&client, url).await?;
    Ok(parse_entries(&result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_first_entity_id() {
        let value: Value =
            serde_json::from_str(r#"{"query":{"search":[{"title":"Q35332"},{"title":"Q1"}]}}"#)
                .unwrap();
        assert_eq!(first_entity_id(&value), Some("Q35332".to_string()));
        let none: Value = serde_json::from_str(r#"{"query":{"search":[]}}"#).unwrap();
        assert_eq!(first_entity_id(&none), None);
    }

    #[test]
    fn recognises_entity_ids_only() {
        assert!(is_entity_id("Q35332"));
        assert!(!is_entity_id("Q"));
        assert!(!is_entity_id("Fight Club"));
        assert!(!is_entity_id("Q12x"));
    }

    #[test]
    fn parses_rows_into_entries() {
        let value: Value = serde_json::from_str(
            r#"{"results":{"bindings":[
              {"film":{"value":"a"},"y":{"value":"1999"},"labels":{"value":"Fight Club|Fight Club|Fight Club (film)"}},
              {"film":{"value":"b"},"labels":{"value":""}},
              {"film":{"value":"c"},"labels":{"value":"Se7en|Seven"}}
            ]}}"#,
        )
        .unwrap();
        let entries = parse_entries(&value);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].year, Some(1999));
        assert_eq!(
            entries[0].titles,
            vec!["Fight Club".to_string(), "Fight Club (film)".to_string()]
        );
        assert_eq!(entries[1].year, None);
    }

    #[test]
    fn query_targets_the_actor() {
        let query = sparql_query("Q35332");
        assert!(query.contains("wd:Q35332"));
        assert!(query.contains("LIMIT"));
    }

    #[test]
    fn search_url_asks_for_actors_only() {
        let url = search_url("Brad Pitt").unwrap();
        assert!(url.as_str().contains("haswbstatement"));
    }
}
