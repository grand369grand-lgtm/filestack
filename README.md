# FileStack

An offline-first file manager built with **Expo / React Native** for the UI and a **Rust core** for search, sorting and storage analysis.

The project runs as an Expo web preview with the Rust core compiled to a small, zero-import WebAssembly module. On iOS and Android the UI uses the same API through a parity-tested TypeScript fallback, because Expo's Hermes runtime does not provide a portable WASM path by default. A C ABI is included for a future Expo native-module bridge; see [`docs/native-rust.md`](docs/native-rust.md).

## Features

- Browse a nested file tree with breadcrumbs; switch list/grid views.
- File categories: images, video, audio, documents, spreadsheets, slides, archives, packages, code and other.
- Live fuzzy search with ranked results, typo tolerance, path matching and category/size/starred filters.
- Query operators: `type:image`, `ext:pdf`, `folder:true`, `min:50mb`, `starred:true`.
- Natural sorting by name, size, modified time or type; optionally keep folders first.
- Star favourites; create folders; import, rename and delete files; preview supported text files.
- Storage insights by category, largest/recent files and duplicate candidates with reclaimable bytes.
- Demo filesystem on web; app-private documents directory on iOS/Android. No server or cloud upload.

## Run it

```sh
npm install
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
npm run core          # build Rust -> wasm -> inline into src/core/filecore.generated.ts
npm run web           # Expo web preview
```

Or start Expo on a simulator/device:

```sh
npm start
npm run ios           # requires macOS / Xcode
npm run android       # requires Android Studio / SDK
```

When running native, files are limited to the app's private document directory and files explicitly picked by the user. This is intentionally **not** a system-wide Android storage browser; it does not request all-files access.

## Android APK release (without EAS)

A GitHub Actions workflow in `.github/workflows/android-release.yml` runs Expo Prebuild and Gradle on a GitHub runner, signs the APK using repository secrets, uploads it as an Actions artifact, and attaches it to GitHub Releases for `v*` tags. Configure the persistent keystore secrets first; see [`docs/android-release.md`](docs/android-release.md). The workflow uses the built-in `GITHUB_TOKEN`, not a personal access token.

## Tests

```sh
npm test              # Rust unit tests + Rust/WASM vs TypeScript parity suite
npm run typecheck
npm run export:web
```

The parity suite runs the actual compiled WASM and compares its search, sorting, insights, duplicate and size-formatting results with the TypeScript mirror. The corpus uses a pinned clock so ranking tests are deterministic.

## Search examples

```text
inv                         # fuzzy prefix / subsequence search
invoice pdf                 # every free-text term must match
type:image min:1mb          # category and size filters
ext:pdf                     # extension filter
type:image,audio            # multiple categories
folder:true                 # folders only
starred:true                # favourites only
rust wasm                   # multi-term fuzzy search
```

See [`docs/search.md`](docs/search.md) for the operator reference and ranking model.

## Project map

```text
App.tsx                     Expo app shell + tabs
src/screens/                Files, Search, Insights
src/fs/                     Filesystem provider; demo and device implementations
src/store/FileStore.tsx     Shared browsing state and file actions
src/core/                   Core API, WASM loader, JS fallback, shared types
rust/src/lib.rs             Search/sort/insights/duplicates and Rust unit tests
rust/src/ffi.rs             WebAssembly and native C ABI entry points
scripts/build-core.mjs      Rust -> WASM -> generated TypeScript asset
scripts/test-core.mjs       Cross-engine parity checks
docs/                       Architecture, query syntax and native bridge notes
```
