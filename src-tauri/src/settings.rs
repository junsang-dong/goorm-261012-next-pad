use crate::error::NextPadError;
use crate::fs_safety::safe_write_atomic;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE_NAME: &str = "settings.json";
const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub schema_version: u32,
    pub theme: Theme,
    pub font_size: u32,
    pub word_wrap: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { schema_version: CURRENT_SCHEMA_VERSION, theme: Theme::Light, font_size: 14, word_wrap: true }
    }
}

impl Settings {
    /// Clamps/validates whatever was loaded so a hand-edited or stale file can't push the
    /// editor out of its supported range.
    fn normalized(mut self) -> Self {
        self.font_size = self.font_size.clamp(10, 28);
        self
    }
}

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<Settings, NextPadError> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Settings, NextPadError> {
        let path = settings_path(&app)?;
        let Ok(bytes) = fs::read(&path) else {
            return Ok(Settings::default());
        };
        match serde_json::from_slice::<Settings>(&bytes) {
            Ok(settings) => Ok(settings.normalized()),
            Err(_) => Ok(Settings::default()),
        }
    })
    .await
    .map_err(|e| NextPadError::Io(e.to_string()))?
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> Result<(), NextPadError> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), NextPadError> {
        let path = settings_path(&app)?;
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let bytes = serde_json::to_vec_pretty(&settings.normalized())
            .map_err(|e| NextPadError::Io(e.to_string()))?;
        safe_write_atomic(&path, &bytes)
    })
    .await
    .map_err(|e| NextPadError::Io(e.to_string()))?
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, NextPadError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| NextPadError::Io(e.to_string()))?;
    Ok(dir.join(SETTINGS_FILE_NAME))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_font_size_into_supported_range() {
        let too_small = Settings { font_size: 2, ..Settings::default() }.normalized();
        let too_large = Settings { font_size: 99, ..Settings::default() }.normalized();
        assert_eq!(too_small.font_size, 10);
        assert_eq!(too_large.font_size, 28);
    }

    #[test]
    fn corrupt_json_falls_back_to_defaults() {
        let result = serde_json::from_slice::<Settings>(b"not json");
        assert!(result.is_err());
    }
}
