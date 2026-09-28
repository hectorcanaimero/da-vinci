use serde::Serialize;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modifier_matches_current_os() {
        let info = platform_info();
        let expected = if cfg!(target_os = "macos") { "⌘" } else { "Ctrl" };
        assert_eq!(info.modifier_key, expected);
        assert_eq!(info.os, std::env::consts::OS);
    }
}
