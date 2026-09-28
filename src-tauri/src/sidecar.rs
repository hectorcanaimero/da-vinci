//! Arranque del servidor Node y su muerte garantizada.
//! Ver `docs/arch/002-reveron-desktop.md` → *Components → tauri/sidecar* y
//! *Interfaces → Sidecar ↔ servidor Node*.
//!
//! Contrato de arranque, fijo desde F1:
//!
//! ```text
//! argv:   <node> <resources>/src/server/cli.mjs --port 0 --host 127.0.0.1
//! env:    DAVINCI_HOME=~/.reveron  REVERON_PARENT=1
//! stdout: {"event":"ready","port":20130,"url":"http://127.0.0.1:20130"}
//! ```
//!
//! D8 — el spawn ocurre acá, en Rust. La webview no tiene permiso de shell y
//! este módulo nunca se expone al frontend.
//!
//! D10 — doble defensa contra servidores huérfanos. La primera es el `kill` de
//! [`kill`], llamado desde `RunEvent::Exit`. La segunda la trae F1.2.T1: con
//! `REVERON_PARENT=1` el servidor se apaga al detectar que su stdin se cerró,
//! y el stdin se cierra solo cuando el proceso padre muere.
//!
//! NFR-13 — si el arranque falla, [`setup`] no propaga el error: lo guarda en
//! [`Sidecar::last_error`] y lo emite por evento para que la interfaz lo
//! muestre. Un servidor caído no cierra la app.
//!
//! # Comprobación manual de la segunda defensa
//!
//! No es automatizable en CI (necesita la app empaquetada y una ventana). El
//! test de abajo cubre el handshake y el `kill` explícito; esto cubre el
//! `kill -9` al padre, que por definición no ejecuta ningún cierre propio:
//!
//! ```sh
//! npm run tauri build && open -a Reverón          # 1. abrir la app
//! lsof -nP -iTCP -sTCP:LISTEN -a -c node          # 2. anotar el PUERTO del hijo
//! pkill -9 -f 'Reverón.app/Contents/MacOS'        # 3. matar el padre a lo bestia
//! sleep 3; lsof -nP -iTCP:PUERTO -sTCP:LISTEN     # 4. sin salida = pasa
//! ```

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, Runtime};

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// Estado del sidecar, manejado por Tauri. F1.3.T3 lo lee para `server_status`.
#[derive(Default)]
pub struct Sidecar {
    pub running: Mutex<Option<Running>>,
    /// Último fallo de arranque, para que la interfaz lo muestre (NFR-13).
    pub last_error: Mutex<Option<String>>,
}

pub struct Running {
    pub child: Child,
    pub port: u16,
    #[allow(dead_code)] // lo consume `server_status` en F1.3.T3
    pub started: Instant,
}

/// Se llama desde el `setup` de la app. No devuelve error a propósito: NFR-13.
pub fn setup<R: Runtime>(app: &AppHandle<R>) {
    app.manage(Sidecar::default());
    match start(app) {
        Ok(port) => navigate_to_server(app, port),
        Err(message) => {
            eprintln!("sidecar: no arrancó el servidor: {message}");
            *app.state::<Sidecar>().last_error.lock().unwrap() = Some(message.clone());
            let _ = app.emit("sidecar://error", message);
        }
    }
}

/// Primera defensa de D10. Idempotente: se llama desde `RunEvent::Exit`.
pub fn kill<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<Sidecar>() else {
        return;
    };
    if let Some(mut running) = state.running.lock().unwrap().take() {
        let _ = running.child.kill();
        let _ = running.child.wait();
    }
}

fn start<R: Runtime>(app: &AppHandle<R>) -> Result<u16, String> {
    let node = node_binary(app)?;
    let cli = cli_script(app)?;
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("no pude resolver el home del usuario: {e}"))?
        .join(".reveron");

    let running = spawn(&node, &cli, &home)?;
    let port = running.port;
    *app.state::<Sidecar>().running.lock().unwrap() = Some(running);
    Ok(port)
}

/// Lanza el servidor y espera su línea de handshake. Núcleo sin Tauri para que
/// el test de abajo lo pueda ejercitar de verdad.
pub fn spawn(node: &Path, cli: &Path, home: &Path) -> Result<Running, String> {
    let mut child = Command::new(node)
        .arg(cli)
        .args(["--port", "0", "--host", "127.0.0.1"])
        .env("DAVINCI_HOME", home)
        .env("REVERON_PARENT", "1")
        // stdin heredado por el hijo y retenido por nosotros: al morir el padre
        // se cierra y el servidor se apaga solo (segunda defensa de D10).
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("no pude lanzar {}: {e}", node.display()))?;

    let stdout = child.stdout.take().expect("stdout pedido como piped");
    let (tx, rx) = mpsc::channel();
    // ponytail: el hilo manda el handshake y después sólo drena, para que el
    // servidor nunca se bloquee escribiendo en un pipe lleno. Si más adelante
    // hace falta mostrar los logs del servidor, se reemplaza el drenaje.
    // El contrato dice que la línea del handshake es la primera de stdout (el
    // banner del servidor va por stderr), pero buscamos la primera que parsee
    // para que un log suelto en stdout no impida que la app arranque.
    std::thread::spawn(move || {
        let mut announced = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if !announced && parse_handshake(&line).is_ok() {
                announced = true;
                let _ = tx.send(line);
            }
        }
    });

    let handshake = rx
        .recv_timeout(HANDSHAKE_TIMEOUT)
        // Disconnected significa que stdout se cerró sin handshake: el servidor
        // murió al arrancar. Timeout significa que no llegó en el límite.
        .map_err(|_| {
            format!(
                "el servidor no anunció su puerto (límite: {}s)",
                HANDSHAKE_TIMEOUT.as_secs()
            )
        })
        .and_then(|line| parse_handshake(&line));

    match handshake {
        Ok(port) => Ok(Running {
            child,
            port,
            started: Instant::now(),
        }),
        Err(message) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(message)
        }
    }
}

fn parse_handshake(line: &str) -> Result<u16, String> {
    let bad = || format!("handshake ilegible: {line}");
    let value: serde_json::Value = serde_json::from_str(line).map_err(|_| bad())?;
    if value["event"] != "ready" {
        return Err(bad());
    }
    value["port"]
        .as_u64()
        .and_then(|port| u16::try_from(port).ok())
        .ok_or_else(bad)
}

/// El `externalBin` de `tauri.conf.json` deja el Node junto al ejecutable de la
/// app, tanto en `tauri dev` como en el bundle.
fn node_binary<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    let beside_exe = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(name)));
    let in_resources = app.path().resource_dir().ok().map(|dir| dir.join(name));

    [beside_exe, in_resources]
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .ok_or_else(|| format!("no encontré el Node empaquetado ({name}); corré scripts/fetch-node.mjs"))
}

/// `resources` trae `../src/**/*`, y el bundler reemplaza el `..` por un
/// componente `_up_`. Probamos las dos formas y, de yapa, la raíz del repo para
/// `tauri dev` y para los tests.
fn cli_script<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let resources = app
        .path()
        .resource_dir()
        .map_err(|e| format!("no pude resolver el directorio de recursos: {e}"))?;

    [
        resources.join("_up_").join("src/server/cli.mjs"),
        resources.join("src/server/cli.mjs"),
        repo_root().join("src/server/cli.mjs"),
    ]
    .into_iter()
    .find(|path| path.is_file())
    .ok_or_else(|| {
        format!(
            "no encontré src/server/cli.mjs a partir de {}",
            resources.display()
        )
    })
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default()
}

fn navigate_to_server<R: Runtime>(app: &AppHandle<R>, port: u16) {
    // ponytail: en debug la webview se queda en el devUrl de Vite para no perder
    // el HMR; el puerto igual llega al frontend por `server_status`.
    if cfg!(debug_assertions) {
        return;
    }
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Ok(url) = format!("http://127.0.0.1:{port}").parse::<tauri::Url>() {
        let _ = window.navigate(url);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// El único check que importa acá: el handshake trae un puerto que está
    /// escuchando de verdad, y al matar el hijo ese puerto queda libre.
    /// Necesita `node` en el PATH — es un proyecto Node, siempre está.
    #[test]
    fn el_handshake_trae_un_puerto_vivo_y_el_kill_lo_libera() {
        let cli = repo_root().join("src/server/cli.mjs");
        let home = std::env::temp_dir().join("reveron-sidecar-test");
        let mut running = spawn(Path::new("node"), &cli, &home).expect("arranque del sidecar");
        let port = running.port;

        assert!(
            std::net::TcpStream::connect(("127.0.0.1", port)).is_ok(),
            "nadie escucha en el puerto {port} que anunció el handshake"
        );

        running.child.kill().expect("kill");
        running.child.wait().expect("wait");

        // el SO puede tardar un instante en soltar el listener
        for _ in 0..50 {
            if std::net::TcpStream::connect(("127.0.0.1", port)).is_err() {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("quedó algo escuchando en el puerto {port} después del kill");
    }

    #[test]
    fn el_handshake_roto_no_pasa_por_puerto() {
        assert_eq!(
            parse_handshake(r#"{"event":"ready","port":20130,"url":"x"}"#),
            Ok(20130)
        );
        assert!(parse_handshake(r#"{"event":"listening","port":20130}"#).is_err());
        assert!(parse_handshake("arrancando…").is_err());
        assert!(parse_handshake(r#"{"event":"ready","port":99999}"#).is_err());
    }
}
