// Diffusion vers les appareils Google (Chromecast, Google TV, Android TV,
// enceintes et écrans Nest) du réseau local.

use serde::Serialize;
use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent};
use rust_cast::channels::media::{Media, StreamType};
use rust_cast::channels::receiver::CastDeviceApp;
use rust_cast::CastDevice;

const SERVICE_TYPE: &str = "_googlecast._tcp.local.";
const SCAN_DURATION: Duration = Duration::from_secs(4);
const RECEIVER_ID: &str = "receiver-0";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CastDeviceInfo {
    pub id: String,
    pub name: String,
    pub model: String,
    pub host: String,
    pub port: u16,
}

// Deux bibliothèques TLS (ring, via reqwest, et aws-lc-rs, via rust_cast)
// cohabitent dans l'application : rustls refuse alors de choisir tout seul et
// plante. On désigne donc explicitement celle de rust_cast avant toute
// connexion. L'appel est sans effet s'il a déjà été fait.
fn ensure_crypto_provider() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
}

// Seules les adresses du réseau local sont acceptées : la commande ne doit pas
// pouvoir servir à joindre un serveur sur Internet.
fn check_local(host: &str) -> Result<(), String> {
    let ip: IpAddr = host
        .parse()
        .map_err(|_| "Adresse de l'appareil invalide.".to_string())?;

    let local = match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        IpAddr::V6(v6) => v6.is_loopback(),
    };

    if local {
        Ok(())
    } else {
        Err("L'appareil doit être sur votre réseau local.".to_string())
    }
}

// Une erreur interne (panique) devient un message lisible au lieu d'un
// laconique « opération interrompue ».
fn guarded<T>(task: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    match catch_unwind(AssertUnwindSafe(task)) {
        Ok(result) => result,
        Err(payload) => {
            let detail = payload
                .downcast_ref::<&str>()
                .map(|text| text.to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "erreur inconnue".to_string());

            eprintln!("[cast] erreur interne : {detail}");

            Err(format!("Erreur interne de la diffusion : {detail}"))
        }
    }
}

fn discover_blocking() -> Result<Vec<CastDeviceInfo>, String> {
    let unavailable = || "Impossible de lancer la recherche sur le réseau.".to_string();

    let daemon = ServiceDaemon::new().map_err(|_| unavailable())?;
    let receiver = daemon.browse(SERVICE_TYPE).map_err(|_| unavailable())?;

    let deadline = Instant::now() + SCAN_DURATION;
    let mut seen: HashSet<String> = HashSet::new();
    let mut devices: Vec<CastDeviceInfo> = Vec::new();

    loop {
        let now = Instant::now();

        if now >= deadline {
            break;
        }

        match receiver.recv_timeout(deadline - now) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let host = info
                    .get_addresses()
                    .iter()
                    .filter_map(|address| address.to_string().parse::<Ipv4Addr>().ok())
                    .next();

                let Some(host) = host else {
                    continue;
                };

                let id = info
                    .get_property_val_str("id")
                    .map(str::to_string)
                    .unwrap_or_else(|| host.to_string());

                if !seen.insert(id.clone()) {
                    continue;
                }

                let name = info
                    .get_property_val_str("fn")
                    .map(str::to_string)
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| "Appareil Google".to_string());

                let model = info
                    .get_property_val_str("md")
                    .map(str::to_string)
                    .unwrap_or_default();

                devices.push(CastDeviceInfo {
                    id,
                    name,
                    model,
                    host: host.to_string(),
                    port: info.get_port(),
                });
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }

    let _ = daemon.shutdown();

    Ok(devices)
}

fn play_blocking(
    host: String,
    port: u16,
    url: String,
    content_type: String,
    live: bool,
) -> Result<(), String> {
    ensure_crypto_provider();

    let fail = |step: &str| format!("Diffusion impossible ({step}).");

    let device = CastDevice::connect_without_host_verification(host, port)
        .map_err(|_| fail("connexion refusée"))?;

    device
        .connection
        .connect(RECEIVER_ID)
        .map_err(|_| fail("connexion"))?;

    device.heartbeat.ping().map_err(|_| fail("connexion"))?;

    let app = device
        .receiver
        .launch_app(&CastDeviceApp::DefaultMediaReceiver)
        .map_err(|_| fail("lancement du lecteur"))?;

    device
        .connection
        .connect(app.transport_id.clone())
        .map_err(|_| fail("connexion au lecteur"))?;

    device
        .media
        .load(
            app.transport_id.clone(),
            app.session_id.clone(),
            &Media {
                content_id: url,
                stream_type: if live {
                    StreamType::Live
                } else {
                    StreamType::Buffered
                },
                content_type,
                metadata: None,
                duration: None,
            },
        )
        .map_err(|_| fail("format non pris en charge par l'appareil"))?;

    Ok(())
}

fn stop_blocking(host: String, port: u16) -> Result<(), String> {
    ensure_crypto_provider();

    let fail = |step: &str| format!("Arrêt impossible ({step}).");

    let device = CastDevice::connect_without_host_verification(host, port)
        .map_err(|_| fail("connexion refusée"))?;

    device
        .connection
        .connect(RECEIVER_ID)
        .map_err(|_| fail("connexion"))?;

    device.heartbeat.ping().map_err(|_| fail("connexion"))?;

    let status = device
        .receiver
        .get_status()
        .map_err(|_| fail("état de l'appareil"))?;

    if let Some(application) = status.applications.first() {
        device
            .receiver
            .stop_app(application.session_id.clone())
            .map_err(|_| fail("fermeture du lecteur"))?;
    }

    Ok(())
}

const INTERRUPTED: &str = "L'opération a été interrompue.";

#[tauri::command]
pub fn cast_supported() -> bool {
    true
}

#[tauri::command]
pub async fn cast_discover() -> Result<Vec<CastDeviceInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| guarded(discover_blocking))
        .await
        .map_err(|_| INTERRUPTED.to_string())?
}

#[tauri::command]
pub async fn cast_play(
    host: String,
    port: u16,
    url: String,
    content_type: String,
    live: bool,
) -> Result<(), String> {
    check_local(&host)?;

    let parsed =
        reqwest::Url::parse(url.trim()).map_err(|_| "Adresse du flux invalide.".to_string())?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Seules les adresses HTTP et HTTPS sont acceptées.".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        guarded(|| play_blocking(host, port, parsed.to_string(), content_type, live))
    })
    .await
    .map_err(|_| INTERRUPTED.to_string())?
}

#[tauri::command]
pub async fn cast_stop(host: String, port: u16) -> Result<(), String> {
    check_local(&host)?;

    tauri::async_runtime::spawn_blocking(move || guarded(|| stop_blocking(host, port)))
        .await
        .map_err(|_| INTERRUPTED.to_string())?
}
