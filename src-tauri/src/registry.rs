use crate::fs_safety::Eol;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

/// One entry per currently-open (saved-at-least-once) document. The frontend only ever
/// sees the opaque token; Rust owns the real path (SPEC §10/§11 token registry boundary).
#[derive(Clone)]
pub struct RegistryEntry {
    pub canonical_path: PathBuf,
    pub eol: Eol,
    pub has_bom: bool,
}

#[derive(Default)]
pub struct FileRegistry {
    entries: Mutex<HashMap<String, RegistryEntry>>,
}

impl FileRegistry {
    pub fn insert(&self, entry: RegistryEntry) -> String {
        let token = Uuid::new_v4().to_string();
        self.entries.lock().unwrap().insert(token.clone(), entry);
        token
    }

    pub fn get(&self, token: &str) -> Option<RegistryEntry> {
        self.entries.lock().unwrap().get(token).cloned()
    }

    pub fn remove(&self, token: &str) {
        self.entries.lock().unwrap().remove(token);
    }

    /// True if some other token already owns this canonical path. Used both to activate an
    /// already-open tab on duplicate "open" and to block Save As onto another open tab's file.
    pub fn is_path_owned_by_other(&self, canonical_path: &PathBuf, exclude_token: Option<&str>) -> bool {
        self.entries.lock().unwrap().iter().any(|(token, entry)| {
            Some(token.as_str()) != exclude_token && &entry.canonical_path == canonical_path
        })
    }

    /// Token of the tab (if any) that already owns this canonical path — used to let the
    /// frontend activate the existing tab instead of opening a duplicate.
    pub fn find_token_for_path(&self, canonical_path: &PathBuf) -> Option<String> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .find(|(_, entry)| &entry.canonical_path == canonical_path)
            .map(|(token, _)| token.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str) -> RegistryEntry {
        RegistryEntry { canonical_path: PathBuf::from(path), eol: Eol::Lf, has_bom: false }
    }

    #[test]
    fn duplicate_path_is_detected_and_excludes_self() {
        let registry = FileRegistry::default();
        let token_a = registry.insert(entry("/tmp/a.txt"));

        assert!(registry.is_path_owned_by_other(&PathBuf::from("/tmp/a.txt"), None));
        assert!(!registry.is_path_owned_by_other(&PathBuf::from("/tmp/a.txt"), Some(&token_a)));
        assert!(!registry.is_path_owned_by_other(&PathBuf::from("/tmp/b.txt"), None));
    }

    #[test]
    fn find_token_for_path_locates_existing_entry() {
        let registry = FileRegistry::default();
        let token = registry.insert(entry("/tmp/a.txt"));
        assert_eq!(registry.find_token_for_path(&PathBuf::from("/tmp/a.txt")), Some(token));
        assert_eq!(registry.find_token_for_path(&PathBuf::from("/tmp/missing.txt")), None);
    }

    #[test]
    fn remove_drops_the_entry() {
        let registry = FileRegistry::default();
        let token = registry.insert(entry("/tmp/a.txt"));
        registry.remove(&token);
        assert!(registry.get(&token).is_none());
    }
}
