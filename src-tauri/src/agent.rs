//! Detección de agentes de línea de comandos (FR-33, FR-34) y su ejecución
//! (FR-35, FR-38).
//!
//! Busca binarios de agente conocidos en el `PATH` y en las rutas habituales
//! de cada sistema operativo, sin que el usuario tenga que escribir una ruta.
//! Ausencia total no es error: `detect()` devuelve una lista vacía y el resto
//! de la app sigue funcionando.
//!
//! `send()` lanza el agente configurado como subproceso y transmite su salida
//! por un `Channel` tipado a medida que llega; `cancel()` lo corta siempre.
//! Éste es el único camino a ejecutar un proceso desde la interfaz: la
//! decisión D8 le saca el permiso de shell a la webview justo para eso.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Deserialize;
use tauri::ipc::Channel;

use crate::{AgentEvent, AgentInfo};

struct Candidate {
    binary: &'static str,
    name: &'static str,
}

const CANDIDATES: &[Candidate] = &[
    Candidate {
        binary: "claude",
        name: "Claude Code",
    },
    Candidate {
        binary: "codex",
        name: "Codex",
    },
    Candidate {
        binary: "gemini",
        name: "Gemini CLI",
    },
];

pub fn detect() -> Vec<AgentInfo> {
    CANDIDATES
        .iter()
        .filter_map(|c| find(c.binary).map(|path| info(c.name, path)))
        .collect()
}

fn info(name: &str, path: PathBuf) -> AgentInfo {
    let available = is_executable(&path);
    // Cara sólo si ya sabemos que corre: barato de verdad.
    let version = available.then(|| version_of(&path)).flatten();
    AgentInfo {
        name: name.to_string(),
        path: path.display().to_string(),
        version,
        available,
    }
}

fn find(binary: &str) -> Option<PathBuf> {
    search_dirs().into_iter().find_map(|dir| {
        let candidate = dir.join(exe_name(binary));
        candidate.is_file().then_some(candidate)
    })
}

#[cfg(windows)]
fn exe_name(binary: &str) -> String {
    format!("{binary}.exe")
}

#[cfg(not(windows))]
fn exe_name(binary: &str) -> String {
    binary.to_string()
}

fn search_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    dirs.extend(extra_dirs());
    dirs
}

/// Rutas habituales donde termina un CLI de agente instalado vía npm/brew.
///
/// ponytail: hace falta porque una app de escritorio en macOS no hereda el
/// `PATH` completo de la shell del usuario (nvm, homebrew) — sólo el `PATH`
/// mínimo del sistema. Sin esto, un agente instalado pero lanzado fuera de
/// una terminal no aparecería nunca.
///
/// `REVERON_AGENT_ONLY_PATH` las desactiva; los tests la usan para no
/// depender de lo que haya instalado en la máquina que corre la suite.
fn extra_dirs() -> Vec<PathBuf> {
    if std::env::var_os("REVERON_AGENT_ONLY_PATH").is_some() {
        return Vec::new();
    }
    let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) else {
        return Vec::new();
    };
    let home = PathBuf::from(home);
    let mut dirs = vec![
        home.join(".local").join("bin"),
        home.join(".npm-global").join("bin"),
    ];
    #[cfg(target_os = "macos")]
    dirs.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    #[cfg(target_os = "linux")]
    dirs.push(PathBuf::from("/usr/local/bin"));
    #[cfg(windows)]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    dirs
}

fn version_of(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path)
            .map(|meta| meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

// ── lanzamiento y transmisión (FR-35, FR-38) ──────────────────────────────

/// Lo que el usuario eligió en Ajustes → Agentes (F6.4.T1): qué binario,
/// dónde corre y con qué argumentos (modelo y modo de permisos ya resueltos).
#[derive(Deserialize)]
struct Config {
    /// La única ruta que se puede ejecutar. Ver `validate()`.
    binary: String,
    /// Directorio de trabajo del agente, visible y modificable (FR-38).
    #[serde(default)]
    workdir: Option<String>,
    #[serde(default)]
    args: Vec<String>,
}

struct Running {
    id: u64,
    child: Child,
    /// Para que `cancel()` pueda cerrar el canal sin esperar al lector: si el
    /// agente dejó nietos vivos, el lector sigue bloqueado en un stdout que
    /// nadie cierra y la interfaz se queda girando.
    on_event: Channel<AgentEvent>,
}

fn running() -> &'static Mutex<Option<Running>> {
    static RUNNING: OnceLock<Mutex<Option<Running>>> = OnceLock::new();
    RUNNING.get_or_init(Default::default)
}

/// Toma el candado tolerando el envenenamiento.
///
/// Si un hilo entra en pánico con el candado puesto, `lock().unwrap()` hace
/// que **toda sesión posterior de chat falle para siempre** — un agente que
/// muere feo dejaría el Chat muerto hasta reiniciar la app. Acá el dato
/// protegido es un `Option<Running>`: lo peor que puede pasar es que quede un
/// hijo sin cosechar, y eso se resuelve reemplazándolo. Seguir es
/// estrictamente mejor que morir.
fn running_lock() -> std::sync::MutexGuard<'static, Option<Running>> {
    running().lock().unwrap_or_else(|e| e.into_inner())
}

/// Lanza el agente configurado y devuelve enseguida: la salida viaja por
/// `on_event` desde un hilo, línea a línea, mientras el proceso sigue vivo.
pub fn send(
    prompt: String,
    refs: Vec<String>,
    on_event: Channel<AgentEvent>,
) -> Result<(), String> {
    let config = config()?;
    let binary = validate(&config.binary)?;

    let mut command = Command::new(&binary);
    command
        .args(if config.args.is_empty() {
            default_args(&binary)
        } else {
            config.args.clone()
        })
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Grupo propio para que `kill()` pueda llevarse también a los nietos: un
    // agente que lanza subprocesos los deja vivos si sólo se mata al padre.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    if let Some(dir) = config.workdir.as_deref().filter(|d| !d.is_empty()) {
        if !Path::new(dir).is_dir() {
            return Err(format!("el directorio de trabajo no existe: {dir}"));
        }
        command.current_dir(dir);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("no pude lanzar {}: {e}", binary.display()))?;

    // El mensaje va por stdin: sin límite de largo y sin comillas que escapar,
    // que es la otra mitad de D8 — el texto del prompt nunca es un argumento.
    // Va en su propio hilo porque un mensaje más grande que el buffer de la
    // tubería bloquearía hasta que el agente lo lea. El `drop` le marca el fin.
    let mut stdin = child.stdin.take().ok_or("el agente no aceptó stdin")?;
    let text = message(&prompt, &refs);
    std::thread::spawn(move || {
        let _ = stdin.write_all(text.as_bytes());
    });

    let stdout = child.stdout.take().ok_or("el agente no dio stdout")?;
    let stderr = child.stderr.take().ok_or("el agente no dio stderr")?;

    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    // Una sesión por vez: la anterior se corta antes de empezar la nueva.
    // El `let` antes del `if` suelta el candado; matar no se hace con él puesto.
    let previous = running_lock().replace(Running {
        id,
        child,
        on_event: on_event.clone(),
    });
    if let Some(previous) = previous {
        kill(previous.child);
    }

    // stderr se junta aparte para poder contar *por qué* murió el agente.
    let errors = Arc::new(Mutex::new(String::new()));
    let collector = {
        let errors = Arc::clone(&errors);
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let mut buffer = errors.lock().unwrap();
                buffer.push_str(&line);
                buffer.push('\n');
            }
        })
    };

    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            // Canal cerrado (se fue la ventana): dejamos de leer y cerramos.
            if on_event.send(parse(&line)).is_err() {
                break;
            }
        }
        // Sólo reclamamos el hijo si sigue siendo el nuestro: si `cancel()` o
        // un `send()` posterior ya se lo llevó, no es nuestro para esperarlo.
        let mine = {
            let mut slot = running_lock();
            match slot.as_ref() {
                Some(r) if r.id == id => slot.take().map(|r| r.child),
                _ => None,
            }
        };
        let Some(mut child) = mine else {
            // Lo cortó el usuario: la interfaz no se queda esperando.
            let _ = on_event.send(AgentEvent::Done);
            return;
        };
        let status = child.wait();
        let _ = collector.join();
        let _ = match status {
            Ok(status) if status.success() => on_event.send(AgentEvent::Done),
            Ok(status) => on_event.send(AgentEvent::Error {
                message: reason(&errors, status.code()),
            }),
            Err(e) => on_event.send(AgentEvent::Error {
                message: format!("perdí al agente: {e}"),
            }),
        };
    });

    Ok(())
}

/// Corta el subproceso aunque haya dejado de responder, y nunca falla: no
/// haber nada corriendo es el estado normal, no un error.
pub fn cancel() -> Result<(), String> {
    let current = running_lock().take();
    if let Some(current) = current {
        let on_event = current.on_event.clone();
        kill(current.child);
        // El lector emitiría `Done` al ver que el hijo ya no es suyo, pero si
        // el agente dejó nietos vivos sigue bloqueado en un stdout que nadie
        // cierra. Cerramos acá: un `Done` de más es inofensivo, una interfaz
        // colgada no.
        let _ = on_event.send(AgentEvent::Done);
    }
    Ok(())
}

/// `kill()` es `SIGKILL` en unix y `TerminateProcess` en Windows: no hay
/// manejador que el agente pueda ignorar. El `wait()` es para no dejar zombi.
///
/// En unix mata primero el **grupo** de procesos: un agente que lanzó
/// subprocesos deja nietos vivos si sólo se mata al padre, y esos nietos
/// heredaron el stdout — el mismo problema de huérfanos que la decisión D10
/// resuelve para el sidecar. `send()` pone al hijo en su propio grupo.
fn kill(mut child: Child) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", child.id())])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// D8: el frontend no elige qué se ejecuta. Acá se comprueba que la ruta
/// configurada exista, sea ejecutable y sea uno de los agentes conocidos, para
/// que un archivo de configuración manipulado tampoco lo convierta en
/// ejecución arbitraria.
fn validate(binary: &str) -> Result<PathBuf, String> {
    let path = std::fs::canonicalize(binary)
        .map_err(|e| format!("el agente configurado no existe: {binary} ({e})"))?;
    if !path.is_file() || !is_executable(&path) {
        return Err(format!("el agente configurado no es ejecutable: {binary}"));
    }
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    if !CANDIDATES.iter().any(|c| exe_name(c.binary) == name) {
        return Err(format!(
            "{binary} no es un agente conocido: sólo se ejecuta el que elegiste en Ajustes"
        ));
    }
    Ok(path)
}

fn config() -> Result<Config, String> {
    let path = config_path().ok_or("no encontré el home del usuario")?;
    let text = std::fs::read_to_string(&path)
        .map_err(|_| "todavía no hay ningún agente configurado".to_string())?;
    serde_json::from_str(&text).map_err(|e| format!("{} está mal formado: {e}", path.display()))
}

fn config_path() -> Option<PathBuf> {
    // ponytail: REVERON_AGENT_CONFIG es para los tests; en producción, el
    // mismo directorio donde secrets.rs deja su respaldo.
    if let Some(path) = std::env::var_os("REVERON_AGENT_CONFIG") {
        return Some(PathBuf::from(path));
    }
    let home = std::env::var_os("REVERON_HOME")
        .or_else(|| std::env::var_os("HOME"))
        .or_else(|| std::env::var_os("USERPROFILE"))?;
    Some(
        Path::new(&home)
            .join(".config")
            .join("reveron")
            .join("agent.json"),
    )
}

/// ponytail: lo mínimo para que cada CLI conocido lea el mensaje por stdin y
/// conteste una vez. Ajustes escribe `args` y esto deja de usarse.
fn default_args(binary: &Path) -> Vec<String> {
    match binary
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .as_ref()
    {
        "codex" => vec!["exec".into(), "-".into()],
        "claude" => vec!["-p".into()],
        _ => Vec::new(),
    }
}

fn message(prompt: &str, refs: &[String]) -> String {
    if refs.is_empty() {
        return prompt.to_string();
    }
    let mut message = prompt.to_string();
    message.push_str("\n\nReferencias:\n");
    for reference in refs {
        message.push_str(&format!("- {reference}\n"));
    }
    message
}

fn reason(errors: &Mutex<String>, code: Option<i32>) -> String {
    let detail = errors.lock().unwrap().trim().to_string();
    if !detail.is_empty() {
        return detail;
    }
    match code {
        Some(code) => format!("el agente terminó con código {code}"),
        None => "el agente murió sin decir por qué".into(),
    }
}

/// ponytail: heurística deliberada. Los CLIs de agente escriben una línea JSON
/// por evento cuando corren en modo streaming; lo que no parsee es texto y
/// viaja como `Chunk`. Si mañana hay que soportar el formato exacto de cada
/// uno, acá es donde entra un match por binario.
fn parse(line: &str) -> AgentEvent {
    let Ok(json) = serde_json::from_str::<serde_json::Value>(line) else {
        return AgentEvent::Chunk {
            text: format!("{line}\n"),
        };
    };
    if let Some(usd) = json
        .get("total_cost_usd")
        .or_else(|| json.get("cost_usd"))
        .and_then(serde_json::Value::as_f64)
    {
        return AgentEvent::Cost { usd };
    }
    let is_tool = json.get("type").and_then(serde_json::Value::as_str) == Some("tool_use");
    if let Some(name) = json
        .get("name")
        .filter(|_| is_tool)
        .and_then(serde_json::Value::as_str)
    {
        return AgentEvent::ToolCall {
            name: name.to_string(),
            args: json
                .get("input")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
        };
    }
    let text = json
        .get("text")
        .or_else(|| json.get("result"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("{line}\n"));
    AgentEvent::Chunk { text }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_fake_binary(dir: &Path, binary: &str, script: &str) -> PathBuf {
        let path = dir.join(exe_name(binary));
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(script.as_bytes()).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        path
    }

    /// Aísla PATH/extra_dirs para que la suite no dependa de lo instalado en
    /// la máquina que corre los tests; restaura todo al salir del closure.
    fn with_isolated_path<T>(dir: &Path, run: impl FnOnce() -> T) -> T {
        let old_path = std::env::var_os("PATH");
        std::env::set_var("PATH", dir);
        std::env::set_var("REVERON_AGENT_ONLY_PATH", "1");
        let result = run();
        match old_path {
            Some(p) => std::env::set_var("PATH", p),
            None => std::env::remove_var("PATH"),
        }
        std::env::remove_var("REVERON_AGENT_ONLY_PATH");
        result
    }

    #[test]
    #[cfg(unix)]
    fn detecta_un_agente_instalado_en_el_path() {
        let dir = std::env::temp_dir().join(format!("reveron-agent-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        write_fake_binary(&dir, "claude", "#!/bin/sh\necho claude-code 1.2.3\n");

        let found = with_isolated_path(&dir, detect);

        let claude = found
            .iter()
            .find(|a| a.name == "Claude Code")
            .expect("no encontró el binario falso en el PATH");
        assert!(claude.available);
        assert_eq!(claude.version.as_deref(), Some("claude-code 1.2.3"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn sin_ningun_binario_devuelve_lista_vacia() {
        let dir = std::env::temp_dir().join(format!("reveron-agent-empty-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        assert!(with_isolated_path(&dir, detect).is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    // ── ejecución ─────────────────────────────────────────────────────────

    /// `REVERON_AGENT_CONFIG` y el proceso corriendo son globales del proceso
    /// de test: los casos de abajo corren de a uno.
    fn test_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(Default::default)
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("reveron-run-{name}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Escribe el agente falso y la configuración que lo elige, como la
    /// escribiría Ajustes.
    fn configure(dir: &Path, script: &str) -> PathBuf {
        let binary = write_fake_binary(dir, "claude", script);
        let config = dir.join("agent.json");
        std::fs::write(
            &config,
            serde_json::json!({
                "binary": binary.display().to_string(),
                "workdir": dir.display().to_string(),
                "args": ["ignorado"],
            })
            .to_string(),
        )
        .unwrap();
        std::env::set_var("REVERON_AGENT_CONFIG", &config);
        binary
    }

    fn recorder() -> (Channel<AgentEvent>, Arc<Mutex<Vec<String>>>) {
        let seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = Arc::clone(&seen);
        let channel = Channel::new(move |body: tauri::ipc::InvokeResponseBody| {
            if let tauri::ipc::InvokeResponseBody::Json(json) = body {
                sink.lock().unwrap().push(json);
            }
            Ok(())
        });
        (channel, seen)
    }

    fn wait_for(seen: &Mutex<Vec<String>>, needle: &str, ms: u64) -> bool {
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(ms);
        while std::time::Instant::now() < deadline {
            if seen.lock().unwrap().iter().any(|m| m.contains(needle)) {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        false
    }

    #[test]
    #[cfg(unix)]
    fn transmite_la_salida_en_trozos_y_cierra_con_done() {
        let _guard = test_lock();
        let dir = scratch("stream");
        // Escribe, duerme, escribe: si la salida llegara toda al final, el
        // primer trozo no podría estar acá antes de que el proceso termine.
        configure(
            &dir,
            "#!/bin/sh\ncat > prompt.txt\necho uno\nsleep 1\necho dos\n",
        );
        let (channel, seen) = recorder();

        send("hola".into(), vec!["/tmp/ref.png".into()], channel).unwrap();

        assert!(wait_for(&seen, "uno", 700), "el primer trozo llegó tarde");
        assert!(!wait_for(&seen, "Done", 100), "cerró antes de terminar");
        assert!(wait_for(&seen, "dos", 3000));
        assert!(wait_for(&seen, r#"{"event":"Done"}"#, 3000));
        // El prompt y sus referencias entran por stdin, no por argumentos.
        let sent = std::fs::read_to_string(dir.join("prompt.txt")).unwrap();
        assert!(sent.contains("hola") && sent.contains("/tmp/ref.png"));

        std::env::remove_var("REVERON_AGENT_CONFIG");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    #[cfg(unix)]
    fn un_agente_que_muere_a_mitad_emite_error() {
        let _guard = test_lock();
        let dir = scratch("muere");
        configure(
            &dir,
            "#!/bin/sh\necho parcial\necho 'se rompió' >&2\nexit 3\n",
        );
        let (channel, seen) = recorder();

        send("hola".into(), vec![], channel).unwrap();

        assert!(wait_for(&seen, "parcial", 3000));
        assert!(wait_for(&seen, "se rompió", 3000), "no explicó la muerte");
        assert!(
            !wait_for(&seen, "Done", 100),
            "una muerte no es un final feliz"
        );

        std::env::remove_var("REVERON_AGENT_CONFIG");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    #[cfg(unix)]
    fn cancel_corta_el_subproceso_y_libera_el_canal() {
        let _guard = test_lock();
        let dir = scratch("cancel");
        configure(&dir, "#!/bin/sh\necho arranco\nsleep 30\n");
        let (channel, seen) = recorder();

        send("hola".into(), vec![], channel).unwrap();
        assert!(wait_for(&seen, "arranco", 3000));
        let pid = running()
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .child
            .id()
            .to_string();

        cancel().unwrap();

        assert!(running_lock().is_none());
        assert!(
            !Command::new("kill")
                .args(["-0", pid.as_str()])
                .status()
                .unwrap()
                .success(),
            "el subproceso sobrevivió a la cancelación"
        );
        assert!(wait_for(&seen, "Done", 3000), "dejó la interfaz colgada");
        // Cancelar sin nada corriendo es el estado normal, no un error.
        cancel().unwrap();

        std::env::remove_var("REVERON_AGENT_CONFIG");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    #[cfg(unix)]
    fn no_ejecuta_un_binario_que_no_es_un_agente_conocido() {
        let _guard = test_lock();
        let dir = scratch("d8");
        let intruso = write_fake_binary(&dir, "rm-falso", "#!/bin/sh\necho pwned\n");

        let error = validate(&intruso.display().to_string()).unwrap_err();

        assert!(error.contains("no es un agente conocido"), "{error}");
        assert!(validate(&dir.join("no-existe").display().to_string()).is_err());

        std::fs::remove_dir_all(&dir).ok();
    }
}
