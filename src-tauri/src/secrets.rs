//! Llaves de proveedor: llavero del sistema operativo con respaldo a archivo.
//!
//! D3 de `docs/arch/002-reveron-desktop.md`: el llavero nativo es el lugar
//! donde viven las llaves (Keychain / Credential Manager / Secret Service). Si
//! no hay servicio de llavero —un Linux sin `gnome-keyring`— se cae a
//! `~/.config/reveron/.env` en modo `600`, que es la misma ruta que
//! `src/utils/secrets.mjs` lee del lado de Node. El respaldo no necesita
//! formato propio: son líneas `VAR=valor`.
//!
//! Regla dura (FR-8): ninguna función pública que alimente al frontend
//! devuelve el valor de una llave. `status()` devuelve los últimos cuatro
//! caracteres y de dónde salió (FR-9). El valor entero sólo sale por
//! `all_env()`, que es para el sidecar y nunca cruza al webview.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use crate::KeyStatus;

/// Nombre del servicio bajo el que se guardan todas las entradas del llavero.
const SERVICE: &str = "reveron";

/// `(id de proveedor, variable de entorno)`. El id es el que usa la UI y el
/// `KEY_ENV` de `src/server/routes/api.mjs`; la variable nombra tanto la
/// entrada del llavero como la línea del archivo de respaldo.
pub const PROVIDERS: [(&str, &str); 7] = [
    ("openai", "OPENAI_API_KEY"),
    ("gemini", "GEMINI_API_KEY"),
    ("fal", "FAL_API_KEY"),
    ("kie", "KIE_API_KEY"),
    ("heygen", "HEYGEN_API_KEY"),
    ("elevenlabs", "ELEVENLABS_API_KEY"),
    ("tripo", "TRIPO_API_KEY"),
];

/// De dónde salió la llave que se está usando de verdad.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Source {
    Keyring,
    File,
    /// Heredada del entorno que lanzó la app. No la escribimos nosotros, pero
    /// el sidecar la ve, así que mentir acá sería reportar mal el FR-9.
    Env,
    None,
}

impl Source {
    fn as_str(self) -> &'static str {
        match self {
            Source::Keyring => "keyring",
            Source::File => "file",
            Source::Env => "env",
            Source::None => "none",
        }
    }
}

// ─── comandos ────────────────────────────────────────────────────────────────

pub fn list() -> Result<Vec<KeyStatus>, String> {
    PROVIDERS.iter().map(|(id, _)| status(id)).collect()
}

pub fn set(provider: &str, value: &str) -> Result<KeyStatus, String> {
    let var = env_var(provider)?;
    let value = validate(value)?;

    if !force_file() {
        match entry(var).and_then(|e| e.set_password(value)) {
            Ok(()) => {
                // Una llave vieja en el archivo taparía la nueva al listar y
                // quedaría en disco sin que nadie la vea. Se va.
                let _ = file_remove(var);
                return status(provider);
            }
            Err(e) if !is_unavailable(&e) => return Err(describe(e)),
            Err(_) => {}
        }
    }

    file_set(var, value)?;
    status(provider)
}

pub fn delete(provider: &str) -> Result<(), String> {
    let var = env_var(provider)?;

    // Se borra de los dos lados siempre: si sólo se borrara del llavero, una
    // línea vieja del archivo reviviría la llave en el próximo listado.
    if !force_file() {
        match entry(var).and_then(|e| e.delete_credential()) {
            Ok(()) => {}
            Err(keyring::Error::NoEntry) => {}
            Err(e) if is_unavailable(&e) => {}
            Err(e) => return Err(describe(e)),
        }
    }
    file_remove(var)
}

/// Estado publicable de un proveedor: si hay llave, sus últimos cuatro
/// caracteres, y el origen efectivo. Nunca el valor.
fn status(provider: &str) -> Result<KeyStatus, String> {
    let var = env_var(provider)?;
    let (value, source) = resolve(var);
    Ok(KeyStatus {
        provider: provider.to_string(),
        present: value.is_some(),
        suffix: value.as_deref().and_then(suffix),
        source: source.as_str().to_string(),
    })
}

/// Lo que el sidecar tiene que inyectar en el entorno del servidor (D4).
/// Devuelve valores completos: sólo para el proceso hijo, nunca para el
/// frontend.
#[allow(dead_code)] // lo consume `sidecar.rs` en F2.1.T2.
pub fn all_env() -> Vec<(&'static str, String)> {
    PROVIDERS
        .iter()
        .filter_map(|(_, var)| match resolve(var) {
            // Lo heredado del entorno ya está en el hijo; reinyectarlo no suma.
            (Some(v), Source::Keyring | Source::File) => Some((*var, v)),
            _ => None,
        })
        .collect()
}

// ─── resolución ──────────────────────────────────────────────────────────────

/// Precedencia: llavero, archivo, entorno heredado. Es el mismo orden en que
/// el sidecar pisa las variables, así que lo que se reporta es lo que se usa.
fn resolve(var: &str) -> (Option<String>, Source) {
    if !force_file() {
        if let Ok(v) = entry(var).and_then(|e| e.get_password()) {
            let v = v.trim().to_string();
            if !v.is_empty() {
                return (Some(v), Source::Keyring);
            }
        }
    }
    if let Some(v) = file_read().ok().and_then(|m| m.get(var).cloned()) {
        if !v.is_empty() {
            return (Some(v), Source::File);
        }
    }
    match std::env::var(var) {
        Ok(v) if !v.trim().is_empty() => (Some(v.trim().to_string()), Source::Env),
        _ => (None, Source::None),
    }
}

/// Últimos cuatro caracteres. `None` cuando la llave es tan corta que cuatro
/// caracteres serían casi toda la llave: mostrar no vale filtrar.
fn suffix(value: &str) -> Option<String> {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 8 {
        return None;
    }
    Some(chars[chars.len() - 4..].iter().collect())
}

fn env_var(provider: &str) -> Result<&'static str, String> {
    PROVIDERS
        .iter()
        .find(|(id, _)| *id == provider)
        .map(|(_, var)| *var)
        .ok_or_else(|| format!("proveedor desconocido: {provider}"))
}

/// Frontera de confianza: el valor viene del webview y termina en una línea de
/// un archivo `VAR=valor`. Un salto de línea acá inyectaría otra variable.
fn validate(value: &str) -> Result<&str, String> {
    let v = value.trim();
    if v.is_empty() {
        return Err("la llave está vacía".into());
    }
    if v.chars().any(|c| c.is_control()) {
        return Err("la llave tiene caracteres de control".into());
    }
    Ok(v)
}

// ─── llavero ─────────────────────────────────────────────────────────────────

fn entry(var: &str) -> Result<keyring::Entry, keyring::Error> {
    keyring::Entry::new(SERVICE, var)
}

/// Distingue "no hay servicio de llavero" de "el llavero dijo que no". Sólo lo
/// primero justifica caer al archivo; lo segundo es un error que el usuario
/// tiene que ver.
fn is_unavailable(e: &keyring::Error) -> bool {
    matches!(
        e,
        keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_)
    )
}

fn describe(e: keyring::Error) -> String {
    format!("llavero: {e}")
}

/// Fuerza el camino de respaldo. Es lo que permite probar el modo archivo en
/// una máquina que sí tiene llavero.
fn force_file() -> bool {
    matches!(std::env::var("REVERON_SECRETS_BACKEND").as_deref(), Ok("file"))
}

// ─── archivo de respaldo ─────────────────────────────────────────────────────

fn config_dir() -> Result<PathBuf, String> {
    if let Ok(d) = std::env::var("REVERON_CONFIG_DIR") {
        return Ok(PathBuf::from(d));
    }
    if let Ok(x) = std::env::var("XDG_CONFIG_HOME") {
        if !x.is_empty() {
            return Ok(PathBuf::from(x).join("reveron"));
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "no pude ubicar el directorio del usuario".to_string())?;
    Ok(PathBuf::from(home).join(".config").join("reveron"))
}

fn env_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join(".env"))
}

/// Parseo mínimo de `VAR=valor`, del subconjunto que escribe esta app más las
/// comillas que un usuario pudo haber puesto a mano.
fn file_read() -> Result<BTreeMap<String, String>, String> {
    let path = env_path()?;
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
        Err(e) => return Err(format!("no pude leer {}: {e}", path.display())),
    };
    Ok(raw
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (k, v) = line.split_once('=')?;
            let v = v.trim();
            let v = v
                .strip_prefix('"')
                .and_then(|s| s.strip_suffix('"'))
                .or_else(|| v.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')))
                .unwrap_or(v);
            Some((k.trim().to_string(), v.to_string()))
        })
        .collect())
}

fn file_set(var: &str, value: &str) -> Result<(), String> {
    edit_file(|lines| {
        let entry = format!("{var}={value}");
        match lines.iter_mut().find(|l| line_key(l) == Some(var)) {
            Some(l) => *l = entry,
            None => lines.push(entry),
        }
    })
}

fn file_remove(var: &str) -> Result<(), String> {
    if !env_path()?.exists() {
        return Ok(());
    }
    edit_file(|lines| lines.retain(|l| line_key(l) != Some(var)))
}

fn line_key(line: &str) -> Option<&str> {
    let line = line.trim();
    if line.starts_with('#') {
        return None;
    }
    line.split_once('=').map(|(k, _)| k.trim())
}

/// Lee, deja que `f` toque las líneas, y reescribe entero. Se preservan las
/// líneas ajenas porque el archivo puede ser del usuario, no nuestro.
fn edit_file(f: impl FnOnce(&mut Vec<String>)) -> Result<(), String> {
    let path = env_path()?;
    let dir = path.parent().unwrap().to_path_buf();
    fs::create_dir_all(&dir).map_err(|e| format!("no pude crear {}: {e}", dir.display()))?;
    restrict(&dir, 0o700)?;

    let mut lines: Vec<String> = match fs::read_to_string(&path) {
        Ok(s) => s.lines().map(str::to_string).collect(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(e) => return Err(format!("no pude leer {}: {e}", path.display())),
    };
    f(&mut lines);

    let mut body = lines.join("\n");
    if !body.is_empty() {
        body.push('\n');
    }

    // Se escribe en un temporal con los permisos finales y recién ahí se
    // renombra: nunca existe un `.env` a medio escribir ni uno legible por
    // todos, ni siquiera por un instante.
    let tmp = dir.join(".env.tmp");
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts
        .open(&tmp)
        .map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    file.write_all(body.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    drop(file);

    fs::rename(&tmp, &path).map_err(|e| format!("no pude escribir {}: {e}", path.display()))?;
    // Por si el archivo ya existía con permisos más laxos: el rename conserva
    // los del temporal, pero esto lo deja explícito y cubre el caso contrario.
    restrict(&path, 0o600)
}

#[cfg(unix)]
fn restrict(path: &std::path::Path, mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
        .map_err(|e| format!("no pude ajustar permisos de {}: {e}", path.display()))
}

// ponytail: en Windows el ACL heredado del perfil del usuario ya limita el
// acceso y no hay modo octal que aplicar.
#[cfg(not(unix))]
fn restrict(_path: &std::path::Path, _mode: u32) -> Result<(), String> {
    Ok(())
}

// ─── prueba ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Un solo test: las variables de entorno son del proceso entero, así que
    /// dos tests en paralelo se pisarían.
    #[test]
    fn respaldo_a_archivo() {
        let dir = std::env::temp_dir().join(format!("reveron-secrets-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        std::env::set_var("REVERON_CONFIG_DIR", &dir);
        std::env::set_var("REVERON_SECRETS_BACKEND", "file");
        // El shell de quien corre el test puede tener llaves exportadas.
        for (_, var) in PROVIDERS {
            std::env::remove_var(var);
        }

        // Vacío: ningún proveedor presente, ninguno filtra nada.
        let vacio = list().unwrap();
        assert_eq!(vacio.len(), PROVIDERS.len());
        assert!(vacio.iter().all(|k| !k.present && k.suffix.is_none()));
        assert!(vacio.iter().all(|k| k.source == "none"));

        // Guardar.
        let llave = "sk-proj-ABCDEFGHIJKLMNOP1234";
        let st = set("openai", llave).unwrap();
        assert!(st.present);
        assert_eq!(st.suffix.as_deref(), Some("1234"));
        assert_eq!(st.source, "file");

        let path = dir.join(".env");
        let raw = fs::read_to_string(&path).unwrap();
        assert_eq!(raw, format!("OPENAI_API_KEY={llave}\n"));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        }

        // Listar no devuelve la llave entera por ningún campo.
        let serializado = serde_json::to_string(&list().unwrap()).unwrap();
        assert!(!serializado.contains(llave), "secrets_list filtró la llave");

        // Rotar reemplaza la línea, no agrega otra.
        set("openai", "sk-proj-ZZZZZZZZZZZZZZZZ9999").unwrap();
        let raw = fs::read_to_string(&path).unwrap();
        assert_eq!(raw.lines().filter(|l| l.starts_with("OPENAI_API_KEY=")).count(), 1);

        // Líneas ajenas sobreviven a una escritura.
        fs::write(&path, format!("# mío\nOTRA=1\n{raw}")).unwrap();
        set("fal", "fal-1234567890abcdef").unwrap();
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("# mío") && raw.contains("OTRA=1"));

        // El sidecar sí ve el valor completo.
        assert_eq!(all_env().len(), 2);

        // Borrar.
        delete("openai").unwrap();
        let raw = fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("OPENAI_API_KEY"));
        assert!(!list().unwrap().iter().find(|k| k.provider == "openai").unwrap().present);

        // Entrada inválida.
        assert!(set("openai", "").is_err());
        assert!(set("openai", "sk-1234\nOTRA=inyectada").is_err());
        assert!(set("inexistente", "x").is_err());

        // El entorno heredado se reporta como tal.
        std::env::set_var("KIE_API_KEY", "kie-abcdefghij9876");
        let st = list().unwrap().into_iter().find(|k| k.provider == "kie").unwrap();
        assert_eq!(st.source, "env");
        assert_eq!(st.suffix.as_deref(), Some("9876"));
        std::env::remove_var("KIE_API_KEY");

        let _ = fs::remove_dir_all(&dir);
    }
}
