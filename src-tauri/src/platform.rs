use serde::Serialize;
use std::process::Command;

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

/// FR-46: selector de directorio nativo. Cada sistema ya trae el suyo por
/// línea de comandos, así que esto no suma un plugin nuevo — sólo lo invoca.
/// `Ok(None)` es cancelar el diálogo, no un error.
#[cfg(target_os = "macos")]
pub fn pick_directory(prompt: &str) -> Result<Option<String>, String> {
    let script = format!("POSIX path of (choose folder with prompt \"{prompt}\")");
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(None); // el usuario canceló
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!path.is_empty()).then_some(path))
}

#[cfg(target_os = "linux")]
pub fn pick_directory(_prompt: &str) -> Result<Option<String>, String> {
    for (cmd, args) in [
        ("zenity", ["--file-selection", "--directory"]),
        ("kdialog", ["--getexistingdirectory", "."]),
    ] {
        let Ok(output) = Command::new(cmd).args(args).output() else {
            continue;
        };
        if !output.status.success() {
            return Ok(None); // el diálogo corrió y el usuario canceló
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok((!path.is_empty()).then_some(path));
    }
    Err("no encontré zenity ni kdialog instalados".into())
}

#[cfg(target_os = "windows")]
pub fn pick_directory(_prompt: &str) -> Result<Option<String>, String> {
    let script = "Add-Type -AssemblyName System.Windows.Forms; \
        $f = New-Object System.Windows.Forms.FolderBrowserDialog; \
        if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }";
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!path.is_empty()).then_some(path))
}

/// FR-46: abrir una carpeta en el gestor de archivos del sistema. A
/// diferencia de `reveal_in_files` (FR-24, F4.3.T1) no selecciona un archivo
/// puntual, así que no comparten implementación.
pub fn open_path(path: &str) -> Result<(), String> {
    let (cmd, args): (&str, &[&str]) = if cfg!(target_os = "macos") {
        ("open", &[])
    } else if cfg!(target_os = "windows") {
        ("explorer", &[])
    } else {
        ("xdg-open", &[])
    };
    Command::new(cmd)
        .args(args)
        .arg(path)
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
