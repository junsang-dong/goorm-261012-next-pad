use serde::Serialize;

/// Error codes surfaced to the frontend, paired with a Korean user-facing message.
/// See SPEC §11: errors carry a stable code plus a Korean message.
#[derive(Debug)]
pub enum NextPadError {
    InvalidUtf8,
    FileTooLarge,
    IsDirectory,
    IsSymlink,
    BinaryFile,
    FileConflict,
    NotFound,
    PermissionDenied,
    WriteFailed(String),
    TokenNotFound,
    Io(String),
}

impl NextPadError {
    fn code(&self) -> &'static str {
        match self {
            NextPadError::InvalidUtf8 => "INVALID_UTF8",
            NextPadError::FileTooLarge => "FILE_TOO_LARGE",
            NextPadError::IsDirectory => "IS_DIRECTORY",
            NextPadError::IsSymlink => "IS_SYMLINK",
            NextPadError::BinaryFile => "BINARY_FILE",
            NextPadError::FileConflict => "FILE_CONFLICT",
            NextPadError::NotFound => "NOT_FOUND",
            NextPadError::PermissionDenied => "PERMISSION_DENIED",
            NextPadError::WriteFailed(_) => "WRITE_FAILED",
            NextPadError::TokenNotFound => "TOKEN_NOT_FOUND",
            NextPadError::Io(_) => "IO_ERROR",
        }
    }

    fn message(&self) -> String {
        match self {
            NextPadError::InvalidUtf8 => "UTF-8 텍스트 파일만 지원합니다.".to_string(),
            NextPadError::FileTooLarge => "파일 크기가 5MiB를 초과합니다.".to_string(),
            NextPadError::IsDirectory => "폴더는 열 수 없습니다.".to_string(),
            NextPadError::IsSymlink => "심볼릭 링크는 지원하지 않습니다.".to_string(),
            NextPadError::BinaryFile => "텍스트 파일만 지원합니다.".to_string(),
            NextPadError::FileConflict => "이미 다른 탭에서 열려 있는 파일입니다.".to_string(),
            NextPadError::NotFound => "파일을 찾을 수 없습니다.".to_string(),
            NextPadError::PermissionDenied => "파일 접근 권한이 없습니다.".to_string(),
            NextPadError::WriteFailed(detail) => format!("파일을 저장하지 못했습니다: {detail}"),
            NextPadError::TokenNotFound => "문서 정보를 찾을 수 없습니다. 다시 열어 주세요.".to_string(),
            NextPadError::Io(detail) => format!("파일 처리 중 오류가 발생했습니다: {detail}"),
        }
    }
}

impl Serialize for NextPadError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("NextPadError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.message())?;
        state.end()
    }
}

impl From<std::io::Error> for NextPadError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => NextPadError::NotFound,
            std::io::ErrorKind::PermissionDenied => NextPadError::PermissionDenied,
            _ => NextPadError::Io(err.to_string()),
        }
    }
}
