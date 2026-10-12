use crate::error::NextPadError;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::Path;

/// Project policy limit (SPEC §1), not a CodeMirror/Tauri constraint.
pub const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;

const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Eol {
    Lf,
    Crlf,
}

#[derive(Debug)]
pub struct DecodedDocument {
    /// Document content normalized to LF, with BOM stripped.
    pub content_lf: String,
    pub has_bom: bool,
    pub eol: Eol,
}

/// Rejects directories, symlinks, and oversized files before any content is read.
/// Cheapest checks first so we never pay for a read we're going to reject anyway.
pub fn validate_path_for_open(path: &Path) -> Result<(), NextPadError> {
    let symlink_meta = fs::symlink_metadata(path)?;
    if symlink_meta.file_type().is_symlink() {
        return Err(NextPadError::IsSymlink);
    }
    if symlink_meta.is_dir() {
        return Err(NextPadError::IsDirectory);
    }
    if symlink_meta.len() > MAX_FILE_BYTES {
        return Err(NextPadError::FileTooLarge);
    }
    Ok(())
}

/// Reads and validates a text file: rejects NUL bytes (binary heuristic) and invalid UTF-8,
/// detects BOM and dominant EOL style, and returns content normalized to LF.
pub fn read_text_file(path: &Path) -> Result<DecodedDocument, NextPadError> {
    validate_path_for_open(path)?;

    let bytes = fs::read(path)?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(NextPadError::FileTooLarge);
    }
    if bytes.contains(&0) {
        return Err(NextPadError::BinaryFile);
    }

    let has_bom = bytes.starts_with(&UTF8_BOM);
    let body = if has_bom { &bytes[UTF8_BOM.len()..] } else { &bytes[..] };

    let text = std::str::from_utf8(body).map_err(|_| NextPadError::InvalidUtf8)?;

    let eol = detect_eol(text);
    let content_lf = normalize_to_lf(text);

    Ok(DecodedDocument { content_lf, has_bom, eol })
}

/// Dominant-style detection: any CRLF pair present (and no bare LF elsewhere) -> CRLF,
/// otherwise LF. Mixed files are accepted and normalized to LF for editing (SPEC §4 accepts
/// this simplification in the lightweight build instead of a blocking confirmation dialog).
fn detect_eol(text: &str) -> Eol {
    let crlf_count = text.matches("\r\n").count();
    let lf_count = text.matches('\n').count();
    if crlf_count > 0 && crlf_count == lf_count {
        Eol::Crlf
    } else {
        Eol::Lf
    }
}

fn normalize_to_lf(text: &str) -> String {
    if !text.contains('\r') {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\r' {
            if chars.peek() == Some(&'\n') {
                chars.next();
            }
            out.push('\n');
        } else {
            out.push(c);
        }
    }
    out
}

/// Re-encodes an LF-normalized document back to its original EOL + BOM for writing to disk.
pub fn encode_for_save(content_lf: &str, eol: Eol, has_bom: bool) -> Vec<u8> {
    let body = match eol {
        Eol::Lf => content_lf.to_string(),
        Eol::Crlf => content_lf.replace('\n', "\r\n"),
    };
    let mut bytes = Vec::with_capacity(body.len() + 3);
    if has_bom {
        bytes.extend_from_slice(&UTF8_BOM);
    }
    bytes.extend_from_slice(body.as_bytes());
    bytes
}

/// Atomic replace: write to a temp file in the same directory, flush+fsync, then rename
/// over the target. Never truncates/deletes the original before the new bytes are durable.
/// Rejects if the target currently exists and is a symlink (SPEC §6 safe-save policy).
pub fn safe_write_atomic(target: &Path, bytes: &[u8]) -> Result<(), NextPadError> {
    if let Ok(meta) = fs::symlink_metadata(target) {
        if meta.file_type().is_symlink() {
            return Err(NextPadError::IsSymlink);
        }
    }

    let dir = target.parent().ok_or_else(|| NextPadError::Io("대상 디렉터리를 확인할 수 없습니다.".into()))?;

    let mut tmp = tempfile::Builder::new()
        .prefix(".nextpad-tmp-")
        .tempfile_in(dir)
        .map_err(|e| NextPadError::WriteFailed(e.to_string()))?;

    tmp.write_all(bytes)
        .and_then(|_| tmp.flush())
        .and_then(|_| tmp.as_file().sync_all())
        .map_err(|e| NextPadError::WriteFailed(e.to_string()))?;

    tmp.persist(target)
        .map_err(|e| NextPadError::WriteFailed(e.error.to_string()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_lf() {
        assert_eq!(detect_eol("a\nb\nc"), Eol::Lf);
    }

    #[test]
    fn detects_crlf() {
        assert_eq!(detect_eol("a\r\nb\r\nc"), Eol::Crlf);
    }

    #[test]
    fn mixed_eol_falls_back_to_lf() {
        assert_eq!(detect_eol("a\r\nb\nc"), Eol::Lf);
    }

    #[test]
    fn normalizes_crlf_and_lone_cr_to_lf() {
        assert_eq!(normalize_to_lf("a\r\nb\rc\nd"), "a\nb\nc\nd");
    }

    #[test]
    fn encode_round_trip_preserves_crlf_and_bom() {
        let original = b"\xEF\xBB\xBFhello\r\nworld\r\n";
        let text = std::str::from_utf8(&original[3..]).unwrap();
        let eol = detect_eol(text);
        let content_lf = normalize_to_lf(text);
        let encoded = encode_for_save(&content_lf, eol, true);
        assert_eq!(encoded.as_slice(), original);
    }

    #[test]
    fn encode_round_trip_preserves_lf_no_bom() {
        let original = b"hello\nworld\n";
        let text = std::str::from_utf8(original).unwrap();
        let eol = detect_eol(text);
        let content_lf = normalize_to_lf(text);
        let encoded = encode_for_save(&content_lf, eol, false);
        assert_eq!(encoded.as_slice(), original);
    }

    #[test]
    fn rejects_binary_nul_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("binary.bin");
        fs::write(&path, [0x41u8, 0x00, 0x42]).unwrap();
        let err = read_text_file(&path).unwrap_err();
        assert!(matches!(err, NextPadError::BinaryFile));
    }

    #[test]
    fn rejects_invalid_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("invalid.txt");
        fs::write(&path, [0xFF, 0xFE, 0x41]).unwrap();
        let err = read_text_file(&path).unwrap_err();
        assert!(matches!(err, NextPadError::InvalidUtf8));
    }

    #[test]
    fn rejects_oversized_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.txt");
        let big = vec![b'a'; (MAX_FILE_BYTES + 1) as usize];
        fs::write(&path, &big).unwrap();
        let err = read_text_file(&path).unwrap_err();
        assert!(matches!(err, NextPadError::FileTooLarge));
    }

    #[test]
    fn rejects_directory() {
        let dir = tempfile::tempdir().unwrap();
        let err = read_text_file(dir.path()).unwrap_err();
        assert!(matches!(err, NextPadError::IsDirectory));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("real.txt");
        fs::write(&target, "hello").unwrap();
        let link = dir.path().join("link.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let err = read_text_file(&link).unwrap_err();
        assert!(matches!(err, NextPadError::IsSymlink));
    }

    #[test]
    fn reads_korean_content_with_bom_and_crlf() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("한글 문서.txt");
        let mut bytes = UTF8_BOM.to_vec();
        bytes.extend_from_slice("안녕하세요\r\n반갑습니다\r\n".as_bytes());
        fs::write(&path, &bytes).unwrap();

        let decoded = read_text_file(&path).unwrap();
        assert!(decoded.has_bom);
        assert_eq!(decoded.eol, Eol::Crlf);
        assert_eq!(decoded.content_lf, "안녕하세요\n반갑습니다\n");
    }

    #[test]
    fn safe_write_atomic_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.txt");
        safe_write_atomic(&path, b"first").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"first");
        safe_write_atomic(&path, b"second, longer content").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"second, longer content");
    }

    #[cfg(unix)]
    #[test]
    fn safe_write_atomic_rejects_symlink_target() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real.txt");
        fs::write(&real, "hello").unwrap();
        let link = dir.path().join("link.txt");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let err = safe_write_atomic(&link, b"overwrite").unwrap_err();
        assert!(matches!(err, NextPadError::IsSymlink));
    }
}
