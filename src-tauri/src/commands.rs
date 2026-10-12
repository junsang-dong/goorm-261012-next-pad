use crate::error::NextPadError;
use crate::fs_safety::{encode_for_save, read_text_file, safe_write_atomic, Eol, MAX_FILE_BYTES};
use crate::registry::{FileRegistry, RegistryEntry};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const TEXT_EXTENSIONS: &[&str] =
    &["txt", "md", "markdown", "json", "html", "htm", "js", "mjs", "cjs"];

// NOTE: `rename_all` on the enum itself only camelCases the `status` tag value (e.g.
// `Opened` -> "opened"); it does NOT cascade into each struct-like variant's own fields, so
// every variant below repeats `rename_all = "camelCase"` for its fields too. Verified against
// serde's actual output — omitting this left fields like `display_path`/`has_utf8_bom`
// un-camelCased, which the frontend read as `undefined` and then crashed on.
#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum OpenResult {
    Cancelled,
    /// The chosen file's canonical path is already owned by another open tab; the frontend
    /// should activate that tab instead of creating a duplicate (SPEC §4 dedup rule).
    #[serde(rename_all = "camelCase")]
    AlreadyOpen { token: String },
    #[serde(rename_all = "camelCase")]
    Opened {
        token: String,
        display_path: String,
        content: String,
        has_utf8_bom: bool,
        eol: Eol,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub path: String,
    pub eol: Eol,
    pub has_utf8_bom: bool,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SaveAsResult {
    Cancelled,
    #[serde(rename_all = "camelCase")]
    Saved {
        token: String,
        path: String,
        eol: Eol,
        has_utf8_bom: bool,
    },
}

/// Resolves a path to a stable, comparable canonical form without requiring the leaf file
/// to exist (needed for Save As onto a not-yet-created file): canonicalize the parent
/// directory, then rejoin the file name.
fn canonical_path_for(path: &Path) -> Result<PathBuf, NextPadError> {
    let parent = path.parent().ok_or(NextPadError::NotFound)?;
    let canonical_parent = fs::canonicalize(parent)?;
    let file_name = path.file_name().ok_or(NextPadError::NotFound)?;
    Ok(canonical_parent.join(file_name))
}

fn join_blocking<T>(result: Result<Result<T, NextPadError>, tauri::Error>) -> Result<T, NextPadError> {
    result.map_err(|e| NextPadError::Io(e.to_string()))?
}

// `blocking_pick_file`/`blocking_save_file` must never run on the main thread (the dialog
// plugin's own docs say so explicitly) — doing so previously deadlocked the whole app, since
// the native panel's completion callback needs the main run loop free to fire. Every command
// that shows a dialog or touches the filesystem is therefore async and offloads its body to
// `spawn_blocking`, fetching the registry via `app.state()` inside the closure since `State`
// itself can't be moved into a `'static` closure (SPEC §11: IO must not block the UI thread).
#[tauri::command]
pub async fn open_document(app: AppHandle) -> Result<OpenResult, NextPadError> {
    join_blocking(
        tauri::async_runtime::spawn_blocking(move || -> Result<OpenResult, NextPadError> {
            let registry = app.state::<FileRegistry>();

            let mut builder = app.dialog().file().set_title("파일 열기");
            for ext in TEXT_EXTENSIONS {
                builder = builder.add_filter("텍스트 파일", &[ext]);
            }
            let builder = builder.add_filter("모든 파일", &["*"]);

            let Some(picked) = builder.blocking_pick_file() else {
                return Ok(OpenResult::Cancelled);
            };
            let raw_path = picked.into_path().map_err(|e| NextPadError::Io(e.to_string()))?;

            // Reject a symlinked leaf before resolving/canonicalizing anything.
            let symlink_meta = fs::symlink_metadata(&raw_path)?;
            if symlink_meta.file_type().is_symlink() {
                return Err(NextPadError::IsSymlink);
            }

            let canonical = fs::canonicalize(&raw_path)?;

            if let Some(existing_token) = registry.find_token_for_path(&canonical) {
                return Ok(OpenResult::AlreadyOpen { token: existing_token });
            }

            let decoded = read_text_file(&canonical)?;

            let token = registry.insert(RegistryEntry {
                canonical_path: canonical.clone(),
                eol: decoded.eol,
                has_bom: decoded.has_bom,
            });

            Ok(OpenResult::Opened {
                token,
                display_path: canonical.to_string_lossy().into_owned(),
                content: decoded.content_lf,
                has_utf8_bom: decoded.has_bom,
                eol: decoded.eol,
            })
        })
        .await,
    )
}

#[tauri::command]
pub async fn save_document(
    app: AppHandle,
    token: String,
    content: String,
) -> Result<SaveResult, NextPadError> {
    join_blocking(
        tauri::async_runtime::spawn_blocking(move || -> Result<SaveResult, NextPadError> {
            let registry = app.state::<FileRegistry>();
            let entry = registry.get(&token).ok_or(NextPadError::TokenNotFound)?;

            if content.len() as u64 > MAX_FILE_BYTES {
                return Err(NextPadError::FileTooLarge);
            }

            let bytes = encode_for_save(&content, entry.eol, entry.has_bom);
            if bytes.len() as u64 > MAX_FILE_BYTES {
                return Err(NextPadError::FileTooLarge);
            }

            safe_write_atomic(&entry.canonical_path, &bytes)?;

            Ok(SaveResult {
                path: entry.canonical_path.to_string_lossy().into_owned(),
                eol: entry.eol,
                has_utf8_bom: entry.has_bom,
            })
        })
        .await,
    )
}

#[tauri::command]
pub async fn save_document_as(
    app: AppHandle,
    existing_token: Option<String>,
    content: String,
    suggested_name: String,
) -> Result<SaveAsResult, NextPadError> {
    join_blocking(
        tauri::async_runtime::spawn_blocking(move || -> Result<SaveAsResult, NextPadError> {
            if content.len() as u64 > MAX_FILE_BYTES {
                return Err(NextPadError::FileTooLarge);
            }

            let registry = app.state::<FileRegistry>();

            let builder = app
                .dialog()
                .file()
                .set_title("다른 이름으로 저장")
                .set_file_name(&suggested_name);

            let Some(picked) = builder.blocking_save_file() else {
                return Ok(SaveAsResult::Cancelled);
            };
            let raw_path = picked.into_path().map_err(|e| NextPadError::Io(e.to_string()))?;

            if let Ok(meta) = fs::symlink_metadata(&raw_path) {
                if meta.file_type().is_symlink() {
                    return Err(NextPadError::IsSymlink);
                }
            }

            let canonical = canonical_path_for(&raw_path)?;

            if registry.is_path_owned_by_other(&canonical, existing_token.as_deref()) {
                return Err(NextPadError::FileConflict);
            }

            // Lightweight-scope simplification: Save As always writes fresh LF / no BOM, even
            // when overwriting an existing file, rather than sniffing that file's prior
            // EOL/BOM.
            let eol = Eol::Lf;
            let has_bom = false;
            let bytes = encode_for_save(&content, eol, has_bom);

            safe_write_atomic(&canonical, &bytes)?;

            if let Some(old_token) = &existing_token {
                registry.remove(old_token);
            }
            let new_token =
                registry.insert(RegistryEntry { canonical_path: canonical.clone(), eol, has_bom });

            Ok(SaveAsResult::Saved {
                token: new_token,
                path: canonical.to_string_lossy().into_owned(),
                eol,
                has_utf8_bom: has_bom,
            })
        })
        .await,
    )
}

#[tauri::command]
pub fn release_document(token: String, registry: State<FileRegistry>) -> Result<(), NextPadError> {
    registry.remove(&token);
    Ok(())
}

/// Called once the frontend's close/quit confirmation flow has resolved (save-all succeeded
/// or discard was chosen). Terminates the app directly, bypassing the CloseRequested /
/// ExitRequested guard rather than re-triggering it (SPEC §8 simplified: no request-ID
/// coordinator needed since this is a single-window, single-in-flight-flow app).
#[tauri::command]
pub fn approve_close(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for a bug where the frontend read `displayPath`/`hasUtf8Bom` as
    /// `undefined` because the enum's `rename_all` wasn't cascading into the struct variant's
    /// fields, crashing `titleFromPath()` on the open path (surfaced to the user as a generic
    /// "알 수 없는 오류가 발생했습니다." toast with no useful detail).
    #[test]
    fn open_result_opened_serializes_with_camel_case_fields() {
        let result = OpenResult::Opened {
            token: "t".into(),
            display_path: "/tmp/a.txt".into(),
            content: "hi".into(),
            has_utf8_bom: true,
            eol: Eol::Lf,
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["status"], "opened");
        assert_eq!(json["displayPath"], "/tmp/a.txt");
        assert_eq!(json["hasUtf8Bom"], true);
        assert!(json.get("display_path").is_none());
        assert!(json.get("has_utf8_bom").is_none());
    }

    #[test]
    fn save_as_result_saved_serializes_with_camel_case_fields() {
        let result = SaveAsResult::Saved {
            token: "t".into(),
            path: "/tmp/a.txt".into(),
            eol: Eol::Crlf,
            has_utf8_bom: false,
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["status"], "saved");
        assert_eq!(json["hasUtf8Bom"], false);
        assert!(json.get("has_utf8_bom").is_none());
    }
}
