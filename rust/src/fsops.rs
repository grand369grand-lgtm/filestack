//! Native filesystem operations.
//!
//! Everything the UI used to do through the JS bridge — walking the tree,
//! reading a text file, creating, renaming, copying and deleting — happens
//! here instead. One call returns the whole listing, so a phone with 20 000
//! files costs a single round trip rather than one per file, which is where
//! most of the perceived "slow file browser" time used to go.

use crate::{Entry, Kind};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const DEFAULT_MAX_DEPTH: u32 = 12;
const DEFAULT_MAX_ENTRIES: usize = 25_000;
const DEFAULT_MAX_TEXT_BYTES: usize = 512 * 1024;

fn default_depth() -> u32 {
    DEFAULT_MAX_DEPTH
}

fn default_entries() -> usize {
    DEFAULT_MAX_ENTRIES
}

fn default_max_text() -> usize {
    DEFAULT_MAX_TEXT_BYTES
}

#[derive(Debug, Deserialize)]
pub struct ScanRequest {
    /// Absolute path of the directory to walk, e.g. `/storage/emulated/0`.
    pub root: String,
    #[serde(default = "default_depth")]
    pub max_depth: u32,
    #[serde(default = "default_entries")]
    pub max_entries: usize,
    /// Relative path prefixes to skip, e.g. `/Android/data`.
    #[serde(default)]
    pub skip: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PathRequest {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct PathsRequest {
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct MoveRequest {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Deserialize)]
pub struct ReadTextRequest {
    pub path: String,
    #[serde(default = "default_max_text")]
    pub max_bytes: usize,
}

fn mtime_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `/storage/emulated/0/DCIM/a.jpg` -> `/DCIM/a.jpg`
fn relative(root: &str, path: &Path) -> String {
    let full = path.to_string_lossy();
    let rel = full.strip_prefix(root).unwrap_or(&full);
    let trimmed = rel.trim_start_matches('/');
    format!("/{trimmed}")
}

fn entry_for(name: String, meta: &fs::Metadata) -> Entry {
    let is_dir = meta.is_dir();
    Entry {
        id: String::new(), // filled in by the caller, which knows the root
        name,
        path: String::new(),
        kind: if is_dir { Kind::Dir } else { Kind::File },
        size: if is_dir { 0 } else { meta.len() },
        mtime: mtime_ms(meta),
        starred: false,
    }
}

fn skipped(rel: &str, name: &str, skip: &[String]) -> bool {
    // Names that are never useful to walk and are usually unreadable anyway.
    if name == ".thumbnails" || name == "LOST.DIR" {
        return true;
    }
    skip.iter().any(|prefix| {
        let prefix = prefix.trim_end_matches('/');
        !prefix.is_empty() && (rel == prefix || rel.starts_with(&format!("{prefix}/")))
    })
}

/// Depth-first listing of everything under `root`, capped by depth and count.
pub fn scan(req: &ScanRequest) -> Result<Vec<Entry>, String> {
    let root_path = PathBuf::from(&req.root);
    let root_meta = fs::metadata(&root_path)
        .map_err(|e| format!("cannot open {}: {e}", root_path.display()))?;
    if !root_meta.is_dir() {
        return Err(format!("not a directory: {}", root_path.display()));
    }

    let root = root_path
        .to_string_lossy()
        .trim_end_matches('/')
        .to_string();

    let mut out: Vec<Entry> = Vec::new();
    let mut stack: Vec<(PathBuf, u32)> = vec![(root_path, 0)];

    while let Some((dir, depth)) = stack.pop() {
        if depth >= req.max_depth || out.len() >= req.max_entries {
            continue;
        }
        let read = match fs::read_dir(&dir) {
            Ok(read) => read,
            Err(_) => continue, // unreadable folder: skip, never fail the scan
        };
        for dirent in read.flatten() {
            if out.len() >= req.max_entries {
                break;
            }
            let path = dirent.path();
            let name = dirent.file_name().to_string_lossy().to_string();
            let rel = relative(&root, &path);
            if skipped(&rel, &name, &req.skip) {
                continue;
            }
            let meta = match dirent.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            let is_dir = meta.is_dir();
            let mut entry = entry_for(name, &meta);
            entry.id = rel.clone();
            entry.path = rel;
            out.push(entry);
            if is_dir {
                stack.push((path, depth + 1));
            }
        }
    }

    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

pub fn read_text(req: &ReadTextRequest) -> Result<String, String> {
    let meta = fs::metadata(&req.path).map_err(|e| format!("{}: {e}", req.path))?;
    if !meta.is_file() {
        return Err(format!("not a file: {}", req.path));
    }
    if meta.len() as usize > req.max_bytes {
        return Err(format!("file too large to preview ({} bytes)", meta.len()));
    }
    fs::read_to_string(&req.path).map_err(|e| format!("{}: {e}", req.path))
}

pub fn mkdir(req: &PathRequest) -> Result<Entry, String> {
    fs::create_dir_all(&req.path).map_err(|e| format!("{}: {e}", req.path))?;
    let path = Path::new(&req.path);
    let meta = fs::metadata(path).map_err(|e| format!("{}: {e}", req.path))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| req.path.clone());
    let mut entry = entry_for(name, &meta);
    entry.id = req.path.clone();
    entry.path = req.path.clone();
    Ok(entry)
}

/// Deletes files and folders; missing paths are not an error.
pub fn remove(req: &PathsRequest) -> Result<usize, String> {
    let mut removed = 0usize;
    for target in &req.paths {
        let path = Path::new(target);
        let is_dir = fs::metadata(path).map(|m| m.is_dir()).unwrap_or(false);
        let result = if is_dir {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };
        match result {
            Ok(()) => removed += 1,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("{target}: {e}")),
        }
    }
    Ok(removed)
}

/// Does the path exist? Used by the importer to pick a free filename.
pub fn exists(req: &PathRequest) -> Result<bool, String> {
    Ok(Path::new(&req.path).exists())
}

pub fn rename(req: &MoveRequest) -> Result<String, String> {
    if req.from == req.to {
        return Ok(req.to.clone());
    }
    fs::rename(&req.from, &req.to).map_err(|e| format!("{} -> {}: {e}", req.from, req.to))?;
    Ok(req.to.clone())
}

/// Copies a file (used by the document-picker import) and returns the bytes written.
pub fn copy(req: &MoveRequest) -> Result<u64, String> {
    if let Some(parent) = Path::new(&req.to).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    fs::copy(&req.from, &req.to).map_err(|e| format!("{} -> {}: {e}", req.from, req.to))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("filecore-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn scan_walks_nested_folders_and_skips_noise() {
        let root = temp_root("scan");
        fs::create_dir_all(root.join("Documents/nested")).unwrap();
        fs::create_dir_all(root.join("Android/data/com.example")).unwrap();
        let mut file = fs::File::create(root.join("Documents/notes.md")).unwrap();
        file.write_all(b"hello").unwrap();
        drop(file);

        let entries = scan(&ScanRequest {
            root: root.to_string_lossy().to_string(),
            max_depth: 8,
            max_entries: 1000,
            skip: vec!["/Android/data".to_string()],
        })
        .unwrap();

        let paths: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        assert!(paths.contains(&"/Documents"));
        assert!(paths.contains(&"/Documents/nested"));
        assert!(paths.contains(&"/Documents/notes.md"));
        assert!(!paths.iter().any(|p| p.starts_with("/Android/data")));

        let notes = entries.iter().find(|e| e.path == "/Documents/notes.md").unwrap();
        assert_eq!(notes.size, 5);
        assert!(matches!(notes.kind, Kind::File));

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn scan_respects_the_entry_cap() {
        let root = temp_root("cap");
        for i in 0..20 {
            fs::File::create(root.join(format!("file-{i}.txt"))).unwrap();
        }
        let entries = scan(&ScanRequest {
            root: root.to_string_lossy().to_string(),
            max_depth: 4,
            max_entries: 5,
            skip: vec![],
        })
        .unwrap();
        assert_eq!(entries.len(), 5);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn read_text_round_trips_and_rejects_oversized_files() {
        let root = temp_root("read");
        let path = root.join("a.txt");
        fs::write(&path, b"native core").unwrap();
        let text = read_text(&ReadTextRequest {
            path: path.to_string_lossy().to_string(),
            max_bytes: 1024,
        })
        .unwrap();
        assert_eq!(text, "native core");

        let err = read_text(&ReadTextRequest {
            path: path.to_string_lossy().to_string(),
            max_bytes: 2,
        })
        .unwrap_err();
        assert!(err.contains("too large"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn mkdir_rename_copy_and_remove_round_trip() {
        let root = temp_root("ops");
        let folder = root.join("Imports");
        let made = mkdir(&PathRequest {
            path: folder.to_string_lossy().to_string(),
        })
        .unwrap();
        assert!(matches!(made.kind, Kind::Dir));

        let source = root.join("source.txt");
        fs::write(&source, b"123456").unwrap();
        let target = folder.join("copy.txt");
        let copied = copy(&MoveRequest {
            from: source.to_string_lossy().to_string(),
            to: target.to_string_lossy().to_string(),
        })
        .unwrap();
        assert_eq!(copied, 6);

        let renamed = rename(&MoveRequest {
            from: target.to_string_lossy().to_string(),
            to: folder.join("renamed.txt").to_string_lossy().to_string(),
        })
        .unwrap();
        assert!(renamed.ends_with("renamed.txt"));
        assert!(folder.join("renamed.txt").exists());

        let removed = remove(&PathsRequest {
            paths: vec![
                source.to_string_lossy().to_string(),
                folder.to_string_lossy().to_string(),
                root.join("does-not-exist").to_string_lossy().to_string(),
            ],
        })
        .unwrap();
        assert_eq!(removed, 2);
        assert!(!folder.exists());

        fs::remove_dir_all(&root).ok();
    }
}
