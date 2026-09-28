//! Llavero del sistema con respaldo a archivo (FR-8, FR-9, decisión D3).
//!
//! Una entrada de `keyring` por proveedor bajo el servicio `reveron`. Cuando el
//! llavero no está disponible —típicamente un Linux sin servicio de secretos—
//! cae a `~/.config/reveron/.env` en modo `600`, que es una de las rutas que
//! `src/utils/secrets.mjs` ya sabe leer.
//!
//! Nada de acá devuelve una llave entera hacia afuera: `KeyStatus` sólo lleva
//! los últimos cuatro caracteres y el origen.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::KeyStatus;

const SERVICE: &str = "reveron";

pub const PROVIDERS: [&str; 7] = [
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "FAL_API_KEY",
    "KIE_API_KEY",
    "HEYGEN_API_KEY",
    "ELEVENLABS_API_KEY",
    "TRIPO_API_KEY",
];

// ── comandos ──────────────────────────────────────────────────────────────

pub fn list() -> Vec<KeyStatus> {
    PROVIDERS.iter().map(|p| status(p)).collect()
}

pub fn set(provider: &str, value: &str) -> Result<KeyStatus, String> {
    check(provider)?;
    let value = value.trim();
    if value.is_empty() {
        return Err("la llave viene vacía".into());
    }
    // El llavero manda; el archivo es lo que queda cuando el llavero no está.
    let source = match entry(provider).map(|e| e.set_password(value)) {
        Some(Ok(())) => "keyring",
        _ => {
            file_set(provider, Some(value))?;
            "file"
        }
    };
    Ok(KeyStatus {
        provider: provider.to_string(),
        present: true,
        suffix: Some(suffix(value)),
        source: source.to_string(),
    })
}

pub fn delete(provider: &str) -> Result<(), String> {
    check(provider)?;
    if let Some(e) = entry(provider) {
        match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(err) => return Err(err.to_string()),
        }
    }
    // El respaldo puede tener una copia vieja aunque el llavero ande.
    if env_path().is_some_and(|p| p.exists()) {
        file_set(provider, None)?;
    }
    Ok(())
}

/// Llaves enteras para el entorno del sidecar (F2.1.T2). No cruza el IPC.
#[allow(dead_code)] // la usa sidecar.rs en F2.1.T2
pub fn env_pairs() -> Vec<(String, String)> {
    PROVIDERS
        .iter()
        .filter_map(|p| lookup(p).0.map(|v| (p.to_string(), v)))
        .collect()
}

// ── interno ───────────────────────────────────────────────────────────────

fn check(provider: &str) -> Result<(), String> {
    if PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(format!("proveedor desconocido: {provider}"))
    }
}

fn status(provider: &str) -> KeyStatus {
    let (value, source) = lookup(provider);
    KeyStatus {
        provider: provider.to_string(),
        present: value.is_some(),
        suffix: value.as_deref().map(suffix),
        source: source.to_string(),
    }
}

fn lookup(provider: &str) -> (Option<String>, &'static str) {
    if let Some(v) = entry(provider).and_then(|e| e.get_password().ok()) {
        if !v.is_empty() {
            return (Some(v), "keyring");
        }
    }
    match file_get(provider) {
        Some(v) => (Some(v), "file"),
        None => (None, "none"),
    }
}

fn suffix(value: &str) -> String {
    let n = value.chars().count().saturating_sub(4);
    value.chars().skip(n).collect()
}

/// `None` = sin llavero utilizable; el que llama cae al archivo.
/// `REVERON_SECRETS_BACKEND=file` lo fuerza, que es como se prueba el respaldo
/// sin desarmar el servicio de secretos del sistema.
fn entry(provider: &str) -> Option<keyring::Entry> {
    if std::env::var("REVERON_SECRETS_BACKEND").as_deref() == Ok("file") {
        return None;
    }
    keyring::Entry::new(SERVICE, provider).ok()
}

fn env_path() -> Option<PathBuf> {
    // ponytail: REVERON_HOME es para los tests; en producción sólo HOME.
    let home = std::env::var_os("REVERON_HOME")
        .or_else(|| std::env::var_os("HOME"))
        .or_else(|| std::env::var_os("USERPROFILE"))?;
    Some(
        Path::new(&home)
            .join(".config")
            .join("reveron")
            .join(".env"),
    )
}

fn file_get(provider: &str) -> Option<String> {
    let text = fs::read_to_string(env_path()?).ok()?;
    parse(&text, provider)
}

fn file_set(provider: &str, value: Option<&str>) -> Result<(), String> {
    let path = env_path().ok_or("no encontré el home del usuario")?;
    let dir = path.parent().ok_or("ruta de respaldo inválida")?;
    fs::create_dir_all(dir).map_err(|e| format!("no pude crear {}: {e}", dir.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
    }
    let current = fs::read_to_string(&path).unwrap_or_default();
    write_600(&path, &upsert(&current, provider, value))
}

fn parse(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        if k.trim() == key {
            let v = v.trim().trim_matches(|c| c == '"' || c == '\'');
            return (!v.is_empty()).then(|| v.to_string());
        }
    }
    None
}

/// Reescribe (o borra, con `value: None`) una sola línea y deja el resto del
/// archivo como estaba: el `.env` puede tener llaves de otras cosas.
fn upsert(text: &str, key: &str, value: Option<&str>) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut done = false;
    for line in text.lines() {
        let hit = !line.trim_start().starts_with('#')
            && line.split_once('=').is_some_and(|(k, _)| k.trim() == key);
        if hit {
            if let (Some(v), false) = (value, done) {
                out.push(format!("{key}={v}"));
                done = true;
            }
            continue; // duplicados y el caso borrar se van
        }
        out.push(line.to_string());
    }
    if let (Some(v), false) = (value, done) {
        out.push(format!("{key}={v}"));
    }
    let mut body = out.join("\n");
    if !body.is_empty() {
        body.push('\n');
    }
    body
}

fn write_600(path: &Path, body: &str) -> Result<(), String> {
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts
        .open(path)
        .map_err(|e| format!("no pude escribir {}: {e}", path.display()))?;
    f.write_all(body.as_bytes())
        .map_err(|e| format!("no pude escribir {}: {e}", path.display()))?;
    // `mode` sólo aplica al crear: si el archivo ya existía con otros permisos,
    // acá se corrigen.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("no pude ajustar permisos de {}: {e}", path.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suffix_nunca_expone_la_llave() {
        assert_eq!(suffix("sk-proj-abcdwxyz"), "wxyz");
        assert_eq!(suffix("abc"), "abc"); // más corta que el sufijo: no entra en pánico
        assert_eq!(suffix("clavé-ñoño"), "ñoño"); // chars, no bytes
    }

    #[test]
    fn upsert_reemplaza_borra_y_respeta_lo_ajeno() {
        let base = "# mío\nOTRA=1\nOPENAI_API_KEY=viejo\n";
        let set = upsert(base, "OPENAI_API_KEY", Some("nuevo"));
        assert_eq!(set, "# mío\nOTRA=1\nOPENAI_API_KEY=nuevo\n");
        assert_eq!(parse(&set, "OPENAI_API_KEY").unwrap(), "nuevo");
        assert_eq!(parse(&set, "OTRA").unwrap(), "1");

        let borrado = upsert(&set, "OPENAI_API_KEY", None);
        assert_eq!(borrado, "# mío\nOTRA=1\n");
        assert_eq!(parse(&borrado, "OPENAI_API_KEY"), None);

        let nuevo = upsert("", "FAL_API_KEY", Some("xxx:yyy"));
        assert_eq!(nuevo, "FAL_API_KEY=xxx:yyy\n");
        assert_eq!(parse(&nuevo, "FAL_API_KEY").unwrap(), "xxx:yyy");
    }

    #[test]
    fn respaldo_guarda_lista_y_borra_con_permisos_600() {
        // Sin llavero y con un HOME propio: es el camino de Linux pelado.
        let home = std::env::temp_dir().join(format!("reveron-test-{}", std::process::id()));
        std::env::set_var("REVERON_HOME", &home);
        std::env::set_var("REVERON_SECRETS_BACKEND", "file");

        set("OPENAI_API_KEY", "sk-test-1234").unwrap();
        let st = list()
            .into_iter()
            .find(|k| k.provider == "OPENAI_API_KEY")
            .unwrap();
        assert!(st.present);
        assert_eq!(st.suffix.as_deref(), Some("1234"));
        assert_eq!(st.source, "file");

        let path = env_path().unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "el .env tiene que quedar en 600");
        }
        // El archivo sí guarda la llave entera; lo que sale al frontend, no.
        assert!(fs::read_to_string(&path).unwrap().contains("sk-test-1234"));

        delete("OPENAI_API_KEY").unwrap();
        assert!(!list()[0].present);
        assert_eq!(list()[0].source, "none");

        assert!(set("NO_EXISTE", "x").is_err());
        fs::remove_dir_all(&home).ok();
        std::env::remove_var("REVERON_HOME");
        std::env::remove_var("REVERON_SECRETS_BACKEND");
    }
}
