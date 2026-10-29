# Search syntax

Search is local to the indexed file list. It never sends a filename or query to a server.

## Free-text search

All free-text terms are ANDed: each term must match the file name or path. Matching is case-insensitive and ranked:

1. Exact name match
2. Name prefix / word-boundary match
3. Name substring
4. Gappy subsequence (so `prjbrief` can find `project-brief.docx`)
5. Parent-path matches, weighted below name matches

Starred files and folders get small ranking boosts. The UI passes the current clock to the engine so recently changed files can float up; tests omit that clock for deterministic scores.

## Operators

Operators are whitespace-delimited. Combine them with text or with one another.

| Operator | Example | Meaning |
|---|---|---|
| `type:` / `kind:` | `type:image` | Category: `folder`, `image`, `video`, `audio`, `document`, `sheet`, `slide`, `archive`, `package`, `code`, `other` |
| `type:` | `type:image,audio` | Match either comma-separated category |
| `ext:` | `ext:pdf` | File extension, with or without a leading dot |
| `folder:` / `dir:` | `folder:true` | Folders only; `folder:false` means files only |
| `min:` / `min-size:` | `min:50mb` | Minimum file size; accepts bytes, `kb`/`k`, `mb`/`m`, or `gb`/`g` |
| `starred:` / `fav:` | `starred:true` | Favourites only; `false` disables the filter |

Examples:

```text
invoice type:document
ext:pdf min:1mb
folder:true starred:true
rust wasm type:code
```

## Engine details

The web build calls the Rust core through WebAssembly. On native Expo/Hermes, `CoreApi` selects the TypeScript mirror until the Rust C ABI is connected through a local Expo module. `npm test` compares both engines on the same fixture corpus to prevent behavioural drift.
