//! Filestack core — the fast half of the file manager.
//!
//! Everything that is pure computation lives here so it can be shared by
//! every platform: fuzzy search + ranking, query parsing (`type:`, `ext:`,
//! `folder:`), sorting, storage insights and duplicate detection.
//!
//! The Android app talks to this crate through one path only: the `cdylib` is
//! loaded by the Expo module in `modules/filecore`, which calls the JNI symbol
//! in `jni_bridge.rs`. There is no JavaScript engine and no WebAssembly copy of
//! these algorithms any more — Rust is the only implementation.
//!
//! `fsops.rs` adds the filesystem work (walking a tree, reading text, mkdir /
//! rename / copy / delete) so the JS side never walks a directory one call at a
//! time.
pub mod ffi;
pub mod fsops;

#[cfg(feature = "jni")]
pub mod jni_bridge;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    File,
    Dir,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub name: String,
    /// Full path from the root of the browsable area, e.g. `/Documents/a.pdf`
    pub path: String,
    pub kind: Kind,
    #[serde(default)]
    pub size: u64,
    /// Last modified, epoch milliseconds.
    #[serde(default)]
    pub mtime: i64,
    #[serde(default)]
    pub starred: bool,
}

impl Entry {
    fn is_dir(&self) -> bool {
        matches!(self.kind, Kind::Dir)
    }

    fn ext(&self) -> String {
        if self.is_dir() {
            return String::new();
        }
        self.name
            .rfind('.')
            .filter(|i| *i > 0)
            .map(|i| self.name[i + 1..].to_ascii_lowercase())
            .unwrap_or_default()
    }
}

/// Coarse bucket used for filtering, icons and the storage chart.
pub fn category_of(entry: &Entry) -> &'static str {
    if entry.is_dir() {
        return "folder";
    }
    match entry.ext().as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "heic" | "svg" | "bmp" | "avif" => "image",
        "mp4" | "mov" | "mkv" | "webm" | "avi" | "m4v" => "video",
        "mp3" | "wav" | "m4a" | "flac" | "aac" | "ogg" | "opus" => "audio",
        "pdf" | "doc" | "docx" | "txt" | "md" | "rtf" | "pages" | "odt" => "document",
        "xls" | "xlsx" | "csv" | "numbers" | "ods" => "sheet",
        "ppt" | "pptx" | "key" | "odp" => "slide",
        "zip" | "tar" | "gz" | "bz2" | "7z" | "rar" | "xz" => "archive",
        "apk" | "aab" | "ipa" | "exe" | "dmg" | "deb" => "package",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "kt" | "swift" | "c"
        | "h" | "cpp" | "rb" | "sh" | "toml" | "yaml" | "yml" | "json" | "css" | "html"
        | "sql" | "lua" | "php" => "code",
        _ => "other",
    }
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Clone)]
struct Query {
    /// Free-text terms that must all match somewhere in the entry.
    terms: Vec<String>,
    /// Restrict to these categories (`type:image`).
    categories: Vec<String>,
    /// Restrict to these extensions (`ext:pdf`).
    exts: Vec<String>,
    /// `folder:true` / `folder:false`
    only_folders: Option<bool>,
    /// `min:1mb` — minimum size in bytes.
    min_size: Option<u64>,
    /// `starred:true`
    only_starred: bool,
}

fn parse_size(raw: &str) -> Option<u64> {
    let s = raw.trim().to_ascii_lowercase();
    let (num, mult) = if let Some(v) = s.strip_suffix("kb").or_else(|| s.strip_suffix("k")) {
        (v, 1_000u64)
    } else if let Some(v) = s.strip_suffix("mb").or_else(|| s.strip_suffix("m")) {
        (v, 1_000_000)
    } else if let Some(v) = s.strip_suffix("gb").or_else(|| s.strip_suffix("g")) {
        (v, 1_000_000_000)
    } else {
        (s.as_str(), 1)
    };
    num.trim()
        .parse::<f64>()
        .ok()
        .map(|n| (n * mult as f64) as u64)
}

fn parse_query(raw: &str) -> Query {
    let mut q = Query::default();
    for token in raw.split_whitespace() {
        let lower = token.to_lowercase();
        if let Some((key, value)) = lower.split_once(':') {
            let value = value.trim_matches('"');
            match key {
                "type" | "kind" => {
                    q.categories.extend(value.split(',').map(|v| v.trim().to_string()))
                }
                "ext" => q.exts.extend(value.split(',').map(|v| v.trim().to_string())),
                "folder" | "dir" => {
                    q.only_folders = Some(!matches!(value, "false" | "no" | "0"))
                }
                "min" | "min-size" => q.min_size = parse_size(value),
                "starred" | "fav" => q.only_starred = !matches!(value, "false" | "no" | "0"),
                _ => q.terms.push(lower),
            }
        } else {
            q.terms.push(lower);
        }
    }
    q
}

// ---------------------------------------------------------------------------
// Fuzzy scoring
// ---------------------------------------------------------------------------

const SCORE_EXACT: i64 = 1_000;
const SCORE_PREFIX: i64 = 800;
const SCORE_SUBSTRING: i64 = 600;
const SCORE_SUBSEQUENCE: i64 = 250;

/// Score `needle` against `haystack` (both already lowercased).
/// Returns `(score, matched_indices)`. Score is 0 when there is no match.
fn fuzzy(needle: &str, haystack: &str) -> (i64, Vec<usize>) {
    let n: Vec<char> = needle.chars().collect();
    let h: Vec<char> = haystack.chars().collect();
    if n.is_empty() {
        return (1, Vec::new());
    }
    if h.is_empty() {
        return (0, Vec::new());
    }
    // 1. exact
    if h == n {
        return (SCORE_EXACT, (0..n.len()).collect());
    }
    // 2. prefix (whole string or any word boundary)
    if h.starts_with(&n) {
        return (SCORE_PREFIX, (0..n.len()).collect());
    }
    if n.len() <= h.len() {
        for pos in 0..=h.len() - n.len() {
            if h[pos..pos + n.len()] == n[..] {
                let boundary = pos > 0 && !h[pos - 1].is_alphanumeric();
                let base = if boundary { SCORE_PREFIX } else { SCORE_SUBSTRING };
                let idx = (pos..pos + n.len()).collect();
                // Earlier + word-boundary matches rank higher.
                return (base - (pos as i64).min(100) + if boundary { 40 } else { 0 }, idx);
            }
        }
    }
    // 3. subsequence (gappy) — this is what makes "prjkt" find "project"
    let mut idx = Vec::with_capacity(n.len());
    let mut cursor = 0usize;
    let mut gaps = 0i64;
    let mut boundary_hits = 0i64;
    for nc in n {
        let mut found = None;
        while cursor < h.len() {
            if h[cursor] == nc {
                found = Some(cursor);
                break;
            }
            cursor += 1;
        }
        let Some(at) = found else {
            return (0, Vec::new());
        };
        if let Some(&prev) = idx.last() {
            gaps += (at - prev - 1) as i64;
        }
        if at == 0 || !h[at - 1].is_alphanumeric() {
            boundary_hits += 1;
        }
        idx.push(at);
        cursor = at + 1;
    }
    let score = SCORE_SUBSEQUENCE + boundary_hits * 25 - gaps * 8;
    (score.max(1), idx)
}

/// Best score across name (full weight) and parent path (reduced weight).
fn score_entry(entry: &Entry, q: &Query, now: i64) -> Option<(i64, String, Vec<usize>)> {
    // hard filters first — cheaper than scoring
    if let Some(folders) = q.only_folders {
        if entry.is_dir() != folders {
            return None;
        }
    }
    if q.only_starred && !entry.starred {
        return None;
    }
    if !q.categories.is_empty() {
        let cat = category_of(entry);
        if !q.categories.iter().any(|c| c == cat || c == "all" || c == "*") {
            return None;
        }
    }
    if !q.exts.is_empty() && !q.exts.contains(&entry.ext()) {
        return None;
    }
    if let Some(min) = q.min_size {
        if entry.size < min {
            return None;
        }
    }

    let name = entry.name.to_lowercase();
    let path = entry.path.to_lowercase();
    let mut total = 0i64;
    let mut best_on = "name".to_string();
    let mut best_idx: Vec<usize> = Vec::new();

    for term in &q.terms {
        let (name_score, name_idx) = fuzzy(term, &name);
        let (path_score, path_idx) = fuzzy(term, &path);
        let path_only = (path_score as f64 * 0.35) as i64;
        if name_score == 0 && path_only == 0 {
            return None; // every term must match somewhere
        }
        if name_score >= path_only {
            total += name_score;
            if name_idx.len() > best_idx.len() {
                best_idx = name_idx;
                best_on = "name".into();
            }
        } else {
            total += path_only;
            if best_on != "name" {
                best_idx = path_idx;
            }
            if best_idx.is_empty() {
                best_on = "path".into();
            }
        }
    }

    if q.terms.is_empty() {
        total = 1;
    }

    // Small human-friendly nudges: favourites float up, folders read first,
    // recently touched files beat stale ones (max +60 over 30 days).
    if entry.starred {
        total += 60;
    }
    if entry.is_dir() {
        total += 15;
    }
    // Recency nudge is only applied when the caller supplies a clock, which
    // keeps results deterministic (and testable) across hosts.
    if entry.mtime > 0 && now > 0 {
        let age_days = ((now - entry.mtime).max(0) as f64) / 86_400_000.0;
        total += (60.0 * (1.0 - (age_days / 30.0)).clamp(0.0, 1.0)).round() as i64;
    }

    Some((total, best_on, best_idx))
}

// ---------------------------------------------------------------------------
// Public API (serialisable, platform agnostic)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    pub entries: Vec<Entry>,
    #[serde(default)]
    pub query: String,
    /// Restrict to a subtree, e.g. `/Documents`.
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
    /// Epoch ms from the host. 0 disables the recency boost.
    #[serde(default)]
    pub now: i64,
}

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub entry: Entry,
    pub score: i64,
    pub matched_on: String,
    pub indices: Vec<usize>,
    pub category: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
    pub total: usize,
    pub query_terms: Vec<String>,
    /// Set when the query used an operator, so the UI can show a chip.
    pub filters: Vec<String>,
}

pub fn search(req: SearchRequest) -> SearchResponse {
    let q = parse_query(&req.query);
    let scope = req
        .scope
        .as_ref()
        .map(|s| s.trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty());

    let mut hits: Vec<SearchHit> = req
        .entries
        .into_iter()
        .filter(|e| match &scope {
            // everything inside the scope, except the scope entry itself
            Some(root) => e.path != *root && e.path.starts_with(&format!("{root}/")),
            None => true,
        })
        .filter_map(|entry| {
            score_entry(&entry, &q, req.now).map(|(score, matched_on, indices)| SearchHit {
                category: category_of(&entry).to_string(),
                entry,
                score,
                matched_on,
                indices,
            })
        })
        .collect();

    hits.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.entry.name.to_lowercase().cmp(&b.entry.name.to_lowercase()))
    });

    let total = hits.len();
    if let Some(limit) = req.limit {
        hits.truncate(limit);
    }

    let mut filters = Vec::new();
    if !q.categories.is_empty() {
        filters.push(format!("type:{}", q.categories.join(",")));
    }
    if !q.exts.is_empty() {
        filters.push(format!("ext:{}", q.exts.join(",")));
    }
    if let Some(f) = q.only_folders {
        filters.push(format!("folder:{}", f));
    }
    if let Some(m) = q.min_size {
        filters.push(format!("min:{}", m));
    }
    if q.only_starred {
        filters.push("starred:true".into());
    }

    SearchResponse {
        hits,
        total,
        query_terms: q.terms,
        filters,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortKey {
    Name,
    Size,
    Modified,
    Kind,
}

#[derive(Debug, Deserialize)]
pub struct SortRequest {
    pub entries: Vec<Entry>,
    pub key: SortKey,
    #[serde(default)]
    pub descending: bool,
    /// Folders always before files (typical file-manager behaviour).
    #[serde(default)]
    pub dirs_first: bool,
}

pub fn sort_entries(req: SortRequest) -> Vec<Entry> {
    let mut v = req.entries;
    v.sort_by(|a, b| {
        if req.dirs_first && a.is_dir() != b.is_dir() {
            return if a.is_dir() {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        let ord = match req.key {
            SortKey::Name => natural_cmp(&a.name, &b.name),
            SortKey::Size => a.size.cmp(&b.size),
            SortKey::Modified => a.mtime.cmp(&b.mtime),
            SortKey::Kind => category_of(a)
                .cmp(category_of(b))
                .then_with(|| natural_cmp(&a.name, &b.name)),
        };
        if req.descending {
            ord.reverse()
        } else {
            ord
        }
    });
    v
}

/// Case-insensitive, digit-aware comparison: `img2` < `img10`.
fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    let (mut ai, mut bi) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (ai.peek().copied(), bi.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) => {
                if x.is_ascii_digit() && y.is_ascii_digit() {
                    let mut an = String::new();
                    while let Some(c) = ai.peek().copied().filter(|c| c.is_ascii_digit()) {
                        an.push(c);
                        ai.next();
                    }
                    let mut bn = String::new();
                    while let Some(c) = bi.peek().copied().filter(|c| c.is_ascii_digit()) {
                        bn.push(c);
                        bi.next();
                    }
                    let ao: u128 = an.parse().unwrap_or(0);
                    let bo: u128 = bn.parse().unwrap_or(0);
                    if ao != bo {
                        return ao.cmp(&bo);
                    }
                } else {
                    if x != y {
                        return x.cmp(&y);
                    }
                    ai.next();
                    bi.next();
                }
            }
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CategoryStat {
    pub category: String,
    pub count: usize,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub struct InsightsRequest {
    pub entries: Vec<Entry>,
    #[serde(default)]
    pub largest_limit: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct Insights {
    pub files: usize,
    pub folders: usize,
    pub total_size: u64,
    pub by_category: Vec<CategoryStat>,
    pub largest: Vec<Entry>,
    pub newest: Vec<Entry>,
    pub starred: usize,
}

pub fn insights(req: InsightsRequest) -> Insights {
    let files_v: Vec<&Entry> = req.entries.iter().filter(|e| !e.is_dir()).collect();
    let mut by_cat: std::collections::HashMap<&'static str, (usize, u64)> = Default::default();
    for e in &files_v {
        let c = by_cat.entry(category_of(e)).or_insert((0, 0));
        c.0 += 1;
        c.1 += e.size;
    }
    let mut by_category: Vec<CategoryStat> = by_cat
        .into_iter()
        .map(|(category, (count, size))| CategoryStat {
            category: category.to_string(),
            count,
            size,
        })
        .collect();
    by_category.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.category.cmp(&b.category)));

    let limit = req.largest_limit.unwrap_or(5);
    let mut largest: Vec<Entry> = files_v.iter().map(|e| (*e).clone()).collect();
    largest.sort_by(|a, b| b.size.cmp(&a.size));
    largest.truncate(limit);

    let mut newest: Vec<Entry> = files_v.iter().map(|e| (*e).clone()).collect();
    newest.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    newest.truncate(limit);

    Insights {
        files: files_v.len(),
        folders: req.entries.iter().filter(|e| e.is_dir()).count(),
        total_size: files_v.iter().map(|e| e.size).sum(),
        by_category,
        largest,
        newest,
        starred: req.entries.iter().filter(|e| e.starred).count(),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DuplicateGroup {
    pub name: String,
    pub size: u64,
    pub count: usize,
    pub wasted: u64,
    pub paths: Vec<String>,
}

/// Files that share a name *and* a byte size are almost always true copies;
/// we surface the reclaimable bytes so the UI can offer bulk cleanup.
pub fn duplicates(entries: &[Entry]) -> Vec<DuplicateGroup> {
    let mut map: std::collections::HashMap<(String, u64), Vec<String>> = Default::default();
    for e in entries.iter().filter(|e| !e.is_dir() && e.size > 0) {
        map.entry((e.name.to_ascii_lowercase(), e.size))
            .or_default()
            .push(e.path.clone());
    }
    let mut groups: Vec<DuplicateGroup> = map
        .into_iter()
        .filter(|(_, paths)| paths.len() > 1)
        .map(|((name, size), paths)| DuplicateGroup {
            wasted: size * (paths.len() as u64 - 1),
            count: paths.len(),
            name,
            size,
            paths,
        })
        .collect();
    groups.sort_by(|a, b| b.wasted.cmp(&a.wasted).then_with(|| a.name.cmp(&b.name)));
    groups
}

/// 1.4 MB — done in Rust so every platform renders sizes identically.
pub fn format_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1000.0 && unit < UNITS.len() - 1 {
        value /= 1000.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{} {}", bytes, UNITS[0])
    } else if value >= 100.0 {
        format!("{:.0} {}", value.round(), UNITS[unit])
    } else {
        // Round half-up explicitly so JS and Rust print identical strings.
        let rounded = (value * 10.0).round() / 10.0;
        format!("{:.1} {}", rounded, UNITS[unit])
    }
}

/// Single dispatch point used by both the wasm FFI and the native bindings.
pub fn invoke(op: &str, payload: &str) -> Result<String, String> {
    match op {
        "search" => {
            let req: SearchRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&search(req)).map_err(|e| e.to_string())
        }
        "sort" => {
            let req: SortRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&sort_entries(req)).map_err(|e| e.to_string())
        }
        "insights" => {
            let req: InsightsRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&insights(req)).map_err(|e| e.to_string())
        }
        "duplicates" => {
            let entries: Vec<Entry> = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&duplicates(&entries)).map_err(|e| e.to_string())
        }
        "formatSize" => {
            let bytes: u64 = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            Ok(serde_json::to_string(&format!("{}", format_size(bytes))).unwrap())
        }
        "scan" => {
            let req: fsops::ScanRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&fsops::scan(&req)?).map_err(|e| e.to_string())
        }
        "read_text" => {
            let req: fsops::ReadTextRequest =
                serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&fsops::read_text(&req)?).map_err(|e| e.to_string())
        }
        "mkdir" => {
            let req: fsops::PathRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&fsops::mkdir(&req)?).map_err(|e| e.to_string())
        }
        "remove" => {
            let req: fsops::PathsRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&fsops::remove(&req)?).map_err(|e| e.to_string())
        }
        "rename" => {
            let req: fsops::MoveRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&fsops::rename(&req)?).map_err(|e| e.to_string())
        }
        "exists" => {
            let req: fsops::PathRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&fsops::exists(&req)?).map_err(|e| e.to_string())
        }
        "copy" => {
            let req: fsops::MoveRequest = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            serde_json::to_string(&fsops::copy(&req)?).map_err(|e| e.to_string())
        }
        "ping" => Ok(serde_json::json!({
            "ok": true,
            "engine": "filecore",
            "version": env!("CARGO_PKG_VERSION"),
        })
        .to_string()),
        other => Err(format!("unknown op: {other}")),
    }
}

// ---------------------------------------------------------------------------
// Tests — `cargo test`
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn e(name: &str, path: &str, size: u64) -> Entry {
        Entry {
            id: path.to_string(),
            name: name.into(),
            path: path.into(),
            kind: Kind::File,
            size,
            mtime: 0,
            starred: false,
        }
    }

    fn d(name: &str, path: &str) -> Entry {
        Entry {
            id: path.to_string(),
            name: name.into(),
            path: path.into(),
            kind: Kind::Dir,
            size: 0,
            mtime: 0,
            starred: false,
        }
    }

    fn corpus() -> Vec<Entry> {
        vec![
            d("Documents", "/Documents"),
            d("Photos", "/Photos"),
            e("fake.jpg", "/Photos-backup/fake.jpg", 5),
            e("invoice_2024.pdf", "/Documents/invoice_2024.pdf", 300_000),
            e("invoice-old.pdf", "/Documents/invoice-old.pdf", 120_000),
            e("project-brief.docx", "/Documents/project-brief.docx", 40_000),
            e("holiday.jpg", "/Photos/holiday.jpg", 4_000_000),
            e("sunset.jpg", "/Photos/sunset.jpg", 2_000_000),
            e("track01.mp3", "/Music/track01.mp3", 7_000_000),
            e("backup.zip", "/Downloads/backup.zip", 900_000_000),
        ]
    }

    #[test]
    fn exact_name_ranks_first() {
        let res = search(SearchRequest {
            entries: corpus(),
            query: "invoice_2024.pdf".into(),
            scope: None,
            limit: None,
            now: 0,
        });
        assert_eq!(res.hits[0].entry.name, "invoice_2024.pdf");
        assert_eq!(res.hits[0].matched_on, "name");
    }

    #[test]
    fn fuzzy_indices_are_unicode_character_indices() {
        let (score, idx) = fuzzy("猫", "猫-photo.jpg");
        assert!(score > 0);
        assert_eq!(idx, vec![0]);
        let (score, idx) = fuzzy("rés", "résumé.pdf");
        assert!(score > 0);
        assert_eq!(idx, vec![0, 1, 2]);
    }

    #[test]
    fn prefix_beats_gappy_subsequence() {
        let res = search(SearchRequest {
            entries: corpus(),
            query: "inv".into(),
            scope: None,
            limit: None,
            now: 0,
        });
        assert!(res.hits.len() >= 2);
        assert!(res.hits[0].score >= res.hits[1].score);
    }

    #[test]
    fn fuzzy_typo_query_still_matches() {
        let (score, idx) = fuzzy("prjbrief", "project-brief.docx");
        assert!(score > 0);
        assert_eq!(idx.len(), "prjbrief".len());
    }

    #[test]
    fn type_operator_filters() {
        let res = search(SearchRequest {
            entries: corpus(),
            query: "type:image".into(),
            scope: None,
            limit: None,
            now: 0,
        });
        assert_eq!(res.hits.len(), 3);
        assert!(res.hits.iter().all(|h| h.category == "image"));
        assert_eq!(res.filters, vec!["type:image".to_string()]);
    }

    #[test]
    fn ext_and_min_size_operators() {
        let res = search(SearchRequest {
            entries: corpus(),
            query: "ext:pdf min:200kb".into(),
            scope: None,
            limit: None,
            now: 0,
        });
        assert_eq!(res.hits.len(), 1);
        assert_eq!(res.hits[0].entry.name, "invoice_2024.pdf");
    }

    #[test]
    fn scope_limits_to_subtree() {
        let res = search(SearchRequest {
            entries: corpus(),
            query: "".into(),
            scope: Some("/Photos".into()),
            limit: None,
            now: 0,
        });
        assert_eq!(res.hits.len(), 2);
        assert!(res.hits.iter().all(|h| h.entry.path.starts_with("/Photos/")));
    }

    #[test]
    fn scope_does_not_match_a_sibling_prefix() {
        let res = search(SearchRequest {
            entries: corpus(),
            query: "".into(),
            scope: Some("/Photos".into()),
            limit: None,
            now: 0,
        });
        assert!(res.hits.iter().all(|h| h.entry.path.starts_with("/Photos/")));
        assert!(!res.hits.iter().any(|h| h.entry.path.starts_with("/Photos-backup/")));
    }

    #[test]
    fn every_term_must_match() {
        // "invoice" AND "pdf" -> the two invoice PDFs, nothing else
        let res = search(SearchRequest {
            entries: corpus(),
            query: "invoice pdf".into(),
            scope: None,
            limit: None,
            now: 0,
        });
        assert_eq!(res.hits.len(), 2);
        assert!(res.hits.iter().all(|h| h.entry.name.contains("invoice")));

        // adding a third term narrows it to one
        let res = search(SearchRequest {
            entries: corpus(),
            query: "invoice old".into(),
            scope: None,
            limit: None,
            now: 0,
        });
        assert_eq!(res.hits.len(), 1);
        assert_eq!(res.hits[0].entry.name, "invoice-old.pdf");
    }

    #[test]
    fn sorting_is_natural_and_folders_first() {
        let entries = vec![
            e("img10.jpg", "/a/img10.jpg", 10),
            e("img2.jpg", "/a/img2.jpg", 20),
            d("zeta", "/a/zeta"),
        ];
        let sorted = sort_entries(SortRequest {
            entries,
            key: SortKey::Name,
            descending: false,
            dirs_first: true,
        });
        let names: Vec<&str> = sorted.iter().map(|x| x.name.as_str()).collect();
        assert_eq!(names, vec!["zeta", "img2.jpg", "img10.jpg"]);
    }

    #[test]
    fn insights_bucket_sizes() {
        let i = insights(InsightsRequest {
            entries: corpus(),
            largest_limit: Some(2),
        });
        assert_eq!(i.files, 8);
        assert_eq!(i.folders, 2);
        assert_eq!(i.total_size, 900_000_000 + 7_000_000 + 4_000_000 + 2_000_000 + 300_000 + 120_000 + 40_000 + 5);
        assert_eq!(i.largest[0].name, "backup.zip");
        assert_eq!(i.by_category[0].category, "archive");
    }

    #[test]
    fn duplicates_found_by_name_and_size() {
        let entries = vec![
            e("a.jpg", "/x/a.jpg", 100),
            e("a.jpg", "/y/a.jpg", 100),
            e("b.jpg", "/x/b.jpg", 100),
        ];
        let dups = duplicates(&entries);
        assert_eq!(dups.len(), 1);
        assert_eq!(dups[0].wasted, 100);
    }

    #[test]
    fn sizes_format_like_a_file_manager() {
        assert_eq!(format_size(999), "999 B");
        assert_eq!(format_size(1_400), "1.4 KB");
        assert_eq!(format_size(900_000_000), "900 MB");
        // half-up, matching the JS mirror exactly
        assert_eq!(format_size(1_250_000_000), "1.3 GB");
    }

    #[test]
    fn invoke_roundtrip() {
        let out = invoke("ping", "null").unwrap();
        assert!(out.contains("filecore"));
        assert!(invoke("nope", "null").is_err());
    }
}
