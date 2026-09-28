//! Detección de agentes de línea de comandos (FR-33, FR-34).
//!
//! Busca binarios de agente conocidos en el `PATH` y en las rutas habituales
//! de cada sistema operativo, sin que el usuario tenga que escribir una ruta.
//! Ausencia total no es error: `detect()` devuelve una lista vacía y el resto
//! de la app sigue funcionando.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::AgentInfo;

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
}
