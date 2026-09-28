// ponytail: stubs only, every command below returns Err until its task lands.
#![allow(unused_variables)]

mod agent;
mod platform;
mod secrets;
mod sidecar;

use serde::Serialize;
use tauri::ipc::Channel;

const NOT_IMPLEMENTED: &str = "no implementado";

#[derive(Serialize)]
pub struct ServerStatus {
    pub port: Option<u16>,
    pub pid: Option<u32>,
    pub uptime_ms: u64,
    pub alive: bool,
    pub url: Option<String>,
    /// NFR-13: si el servidor no arrancó, la interfaz muestra por qué en vez
    /// de quedarse en blanco.
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct KeyStatus {
    pub provider: String,
    pub present: bool,
    pub suffix: Option<String>,
    pub source: String,
}

#[derive(Serialize)]
pub struct AgentInfo {
    pub name: String,
    pub path: String,
    pub version: Option<String>,
    pub available: bool,
}

#[derive(Serialize)]
#[serde(tag = "event", content = "data")]
pub enum AgentEvent {
    Chunk {
        text: String,
    },
    ToolCall {
        name: String,
        args: serde_json::Value,
    },
    Cost {
        usd: f64,
    },
    Done,
    Error {
        message: String,
    },
}

#[tauri::command]
fn server_status(app: tauri::AppHandle) -> Result<ServerStatus, String> {
    use tauri::Manager;
    let state = app
        .try_state::<sidecar::SidecarState>()
        .ok_or("el plugin del sidecar no está montado")?;
    let process = state.process.lock().unwrap();
    Ok(match process.as_ref() {
        Some(s) => ServerStatus {
            alive: true,
            port: Some(s.port),
            pid: Some(s.pid),
            uptime_ms: s.started.elapsed().as_millis() as u64,
            url: Some(s.url()),
            error: None,
        },
        None => ServerStatus {
            alive: false,
            port: None,
            pid: None,
            uptime_ms: 0,
            url: None,
            error: state.last_error.lock().unwrap().clone(),
        },
    })
}

#[tauri::command]
fn server_restart() -> Result<ServerStatus, String> {
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
fn server_stop() -> Result<(), String> {
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
fn secrets_list() -> Result<Vec<KeyStatus>, String> {
    Ok(secrets::list())
}

#[tauri::command]
async fn secrets_set(
    app: tauri::AppHandle,
    provider: String,
    value: String,
) -> Result<KeyStatus, String> {
    let status = secrets::set(&provider, &value)?;
    // D4: best-effort. La llave ya quedó guardada; si ni el PUT en caliente ni
    // el reinicio de respaldo funcionan, el próximo arranque la toma igual.
    if let Err(error) = sidecar::rotate_key(&app, &provider, &value).await {
        eprintln!("[sidecar] no pude rotar la llave en caliente: {error}");
    }
    Ok(status)
}

#[tauri::command]
fn secrets_delete(provider: String) -> Result<(), String> {
    secrets::delete(&provider)
}

#[tauri::command]
fn agent_detect() -> Result<Vec<AgentInfo>, String> {
    Ok(agent::detect())
}

#[tauri::command]
fn agent_send(
    prompt: String,
    refs: Vec<String>,
    on_event: Channel<AgentEvent>,
) -> Result<(), String> {
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
fn agent_cancel() -> Result<(), String> {
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
fn platform_info() -> Result<platform::PlatformInfo, String> {
    Ok(platform::platform_info())
}

#[tauri::command]
fn reveal_in_files(path: String) -> Result<(), String> {
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
fn pick_directory() -> Result<Option<String>, String> {
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
fn pick_files() -> Result<Option<Vec<String>>, String> {
    Err(NOT_IMPLEMENTED.into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Arranca el servidor Node y garantiza que muera con la app (D10).
        .plugin(sidecar::plugin())
        .setup(|app| {
            // D9: macOS keeps native decorations (titleBarStyle: Overlay in
            // tauri.conf.json draws the traffic lights over our bar); Windows
            // and Linux get no native chrome so Titlebar.tsx can draw its own.
            #[cfg(not(target_os = "macos"))]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window.set_decorations(false)?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            server_status,
            server_restart,
            server_stop,
            secrets_list,
            secrets_set,
            secrets_delete,
            agent_detect,
            agent_send,
            agent_cancel,
            platform_info,
            reveal_in_files,
            pick_directory,
            pick_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
