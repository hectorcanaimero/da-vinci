use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub modifier_key: String,
}

/// FR-40: the UI shows this modifier key everywhere shortcuts are hinted.
pub fn platform_info() -> PlatformInfo {
    let os = std::env::consts::OS.to_string();
    let modifier_key = if os == "macos" { "⌘" } else { "Ctrl" }.to_string();
    PlatformInfo { os, modifier_key }
}

/// Misma carpeta que `sidecar::spawn` le pasa al servidor como `DAVINCI_HOME`
/// (`~/.reveron`), acá sólo para acotar `reveal_in_files` — no lanza nada.
fn assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("no encuentro el directorio del usuario: {e}"))?
        .join(".reveron");
    Ok(home.join("assets"))
}

/// Resuelve `path` a una ruta absoluta y confirma que cae dentro de
/// `boundary`. Aparte de `reveal_in_files` para poder probarla sin un
/// `AppHandle` real.
fn resolve_within(path: &str, boundary: &Path) -> Result<PathBuf, String> {
    let target = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("no encuentro el archivo: {e}"))?;
    let boundary = boundary
        .canonicalize()
        .map_err(|e| format!("no encuentro la carpeta de assets: {e}"))?;
    if !target.starts_with(&boundary) {
        return Err("ese archivo está fuera de la carpeta de assets".into());
    }
    Ok(target)
}

/// FR-24: abre Finder/Explorador/el gestor de archivos de Linux con el
/// archivo seleccionado (no sólo su carpeta), vía `tauri-plugin-opener`.
///
/// El permiso `opener:allow-reveal-item-in-dir` no soporta acotar por ruta
/// (a diferencia de `opener:allow-open-path`), así que el límite a la carpeta
/// de assets se hace acá a mano: cualquier ruta fuera de ella se rechaza antes
/// de tocar el plugin.
pub fn reveal_in_files(app: &AppHandle, path: &str) -> Result<(), String> {
    let target = resolve_within(path, &assets_dir(app)?)?;
    app.opener()
        .reveal_item_in_dir(target)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn modifier_matches_current_os() {
        let info = platform_info();
        let expected = if cfg!(target_os = "macos") {
            "⌘"
        } else {
            "Ctrl"
        };
        assert_eq!(info.modifier_key, expected);
        assert_eq!(info.os, std::env::consts::OS);
    }

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("reveron-platform-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn accepts_file_inside_boundary() {
        let boundary = scratch_dir("inside");
        let file = boundary.join("artifact.png");
        fs::write(&file, b"x").unwrap();

        let resolved = resolve_within(file.to_str().unwrap(), &boundary).unwrap();
        assert_eq!(resolved, file.canonicalize().unwrap());
    }

    #[test]
    fn rejects_file_outside_boundary() {
        let boundary = scratch_dir("outside-boundary");
        let outsider_dir = scratch_dir("outside-file");
        let file = outsider_dir.join("secret.env");
        fs::write(&file, b"x").unwrap();

        let err = resolve_within(file.to_str().unwrap(), &boundary).unwrap_err();
        assert!(err.contains("fuera de la carpeta de assets"));
    }

    #[test]
    fn rejects_missing_file() {
        let boundary = scratch_dir("missing");
        let missing = boundary.join("no-existe.png");

        assert!(resolve_within(missing.to_str().unwrap(), &boundary).is_err());
    }
}
