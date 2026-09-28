//! Arranque del servidor Node y garantía de que muera.
//!
//! Contrato fijo (arch 002 → Interfaces → Sidecar ↔ servidor Node):
//!
//! ```text
//! argv:   <node> <recursos>/src/server/cli.mjs --port 0 --host 127.0.0.1
//! env:    DAVINCI_HOME=~/.reveron  REVERON_PARENT=1  <LLAVES…>
//! stdout: una línea JSON y nada antes de ella:
//!         {"event":"ready","port":20130,"url":"http://127.0.0.1:20130"}
//! ```
//!
//! El spawn ocurre acá, del lado de Rust: la D8 prohíbe darle permiso de shell
//! al frontend, así que no hay plugin de shell registrado en toda la app.
//!
//! ## D10 — comprobación manual de que no quedan huérfanos
//!
//! No es automatizable en CI: hace falta la app real corriendo, porque lo que
//! se prueba es justamente que matar al proceso padre a la fuerza —sin darle
//! chance de ejecutar `RunEvent::Exit`— igual deja el puerto libre. Eso lo
//! cubre la segunda defensa (`REVERON_PARENT=1` + cierre de stdin, F1.2.T1).
//!
//! ```sh
//! # 1. arrancar la app y dejarla abierta
//! npm run tauri dev
//!
//! # 2. en otra terminal: pid del servidor, puerto que anunció, y su padre
//! NODE_PID=$(pgrep -f 'server/cli.mjs')
//! PORT=$(lsof -nP -iTCP -sTCP:LISTEN -a -p "$NODE_PID" | awk 'NR==2 {sub(/.*:/,"",$9); print $9}')
//! APP_PID=$(ps -o ppid= -p "$NODE_PID" | tr -d ' ')
//!
//! # 3. matar al padre sin limpieza posible
//! kill -9 "$APP_PID"
//!
//! # 4. nadie escucha ese puerto: sin salida y exit 1
//! sleep 3; lsof -nP -iTCP:"$PORT" -sTCP:LISTEN; echo "exit=$?"
//! ```

// ponytail: port/pid/started los consume server_status en F1.3.T3.
#![allow(dead_code)]

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use tauri::path::BaseDirectory;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, RunEvent, Runtime};

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

pub struct Sidecar {
    pub port: u16,
    pub pid: u32,
    pub started: Instant,
    /// Se conserva entero a propósito: mientras `child.stdin` no se suelte, el
    /// pipe sigue abierto y el servidor no se cree huérfano (D10, 2ª defensa).
    child: Child,
}

impl Sidecar {
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn kill(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Lo que ve el resto de la app: o hay un servidor vivo, o hay un motivo por el
/// que no lo hay. Nunca las dos cosas.
#[derive(Default)]
pub struct SidecarState {
    pub process: Mutex<Option<Sidecar>>,
    pub last_error: Mutex<Option<String>>,
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("sidecar")
        .setup(|app, _api| {
            let state = SidecarState::default();
            match spawn(app) {
                Ok(sidecar) => {
                    if let Some(window) = app.get_webview_window("main") {
                        if let Ok(url) = sidecar.url().parse::<tauri::Url>() {
                            let _ = window.navigate(url);
                        }
                    }
                    *state.process.lock().unwrap() = Some(sidecar);
                }
                // NFR-13: que el servidor no arranque no cierra la app. La
                // ventana se queda en el frontend local y muestra el error.
                Err(error) => {
                    eprintln!("[sidecar] {error}");
                    *state.last_error.lock().unwrap() = Some(error);
                }
            }
            app.manage(state);
            Ok(())
        })
        // D10, 1ª defensa.
        .on_event(|app, event| {
            if matches!(event, RunEvent::Exit) {
                if let Some(state) = app.try_state::<SidecarState>() {
                    if let Some(sidecar) = state.process.lock().unwrap().take() {
                        sidecar.kill();
                    }
                }
            }
        })
        .build()
}

/// Lanza el servidor y espera su handshake. Bloquea hasta 10 s.
pub fn spawn<R: Runtime>(app: &AppHandle<R>) -> Result<Sidecar, String> {
    let node = node_binary();
    let cli = app
        .path()
        .resolve("../src/server/cli.mjs", BaseDirectory::Resource)
        .map_err(|e| format!("no encuentro los recursos del servidor: {e}"))?;
    if !cli.exists() {
        return Err(format!(
            "falta el servidor empaquetado en {}",
            cli.display()
        ));
    }
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("no encuentro el directorio del usuario: {e}"))?
        .join(".reveron");

    let mut child = Command::new(&node)
        .arg(&cli)
        .args(["--port", "0", "--host", "127.0.0.1"])
        .env("DAVINCI_HOME", &home)
        .env("REVERON_PARENT", "1")
        // ponytail: las llaves las inyecta secrets.rs cuando exista (F2.1.T1).
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("no pude lanzar {}: {e}", node.display()))?;

    let pid = child.id();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "el servidor no expuso stdout".to_string())?;

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut lines = BufReader::new(stdout).lines();
        let first = lines.next().and_then(|line| line.ok());
        let _ = tx.send(first.as_deref().and_then(parse_handshake));
        // Seguir drenando: con el pipe lleno, el servidor se bloquea al escribir.
        for line in lines.map_while(Result::ok) {
            eprintln!("[server] {line}");
        }
    });

    match rx.recv_timeout(HANDSHAKE_TIMEOUT) {
        Ok(Some(port)) => Ok(Sidecar {
            port,
            pid,
            started: Instant::now(),
            child,
        }),
        fallo => {
            let _ = child.kill();
            let _ = child.wait();
            Err(match fallo {
                Ok(None) => "el servidor arrancó pero no anunció su puerto".to_string(),
                _ => format!(
                    "el servidor no respondió en {} s",
                    HANDSHAKE_TIMEOUT.as_secs()
                ),
            })
        }
    }
}

fn parse_handshake(line: &str) -> Option<u16> {
    let event: serde_json::Value = serde_json::from_str(line).ok()?;
    if event.get("event")?.as_str()? != "ready" {
        return None;
    }
    event.get("port")?.as_u64()?.try_into().ok()
}

/// El Node empaquetado queda al lado del ejecutable: `tauri-build` lo copia al
/// directorio de target en dev y el bundler lo mete en el `.app`/`.deb`/`.exe`.
fn node_binary() -> PathBuf {
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    std::env::current_exe()
        .ok()
        .map(|exe| exe.with_file_name(name))
        .filter(|path| path.exists())
        // ponytail: sin Node empaquetado cae al del PATH, que es el caso de dev
        // antes de correr `scripts/fetch-node.mjs`. En un bundle real siempre está.
        .unwrap_or_else(|| PathBuf::from(name))
}

#[cfg(test)]
mod tests {
    use super::parse_handshake;

    #[test]
    fn solo_la_linea_de_handshake_da_puerto() {
        assert_eq!(
            parse_handshake(r#"{"event":"ready","port":20130,"url":"http://127.0.0.1:20130"}"#),
            Some(20130)
        );
        // El banner de start.mjs va por stderr, pero si alguna vez se filtra a
        // stdout no puede pasar por handshake.
        assert_eq!(
            parse_handshake("Da Vinci escuchando en http://127.0.0.1:20130"),
            None
        );
        assert_eq!(
            parse_handshake(r#"{"event":"listening","port":20130}"#),
            None
        );
        assert_eq!(parse_handshake(r#"{"event":"ready"}"#), None);
        assert_eq!(parse_handshake(r#"{"event":"ready","port":99999}"#), None);
    }
}
