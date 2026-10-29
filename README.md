# FileStack

An offline-first Android file manager built with **Expo / React Native** for the UI and a **native Rust core** for everything else — search, sorting, storage analysis and the filesystem walk itself.

The Rust core is compiled to a `cdylib`, packaged inside the APK and called over JNI by a local Expo module (`modules/filecore`). There is no WebAssembly build and no TypeScript copy of the algorithms: one implementation, one code path, no bridge-per-file overhead. See [`docs/native-rust.md`](docs/native-rust.md).

## Features

- Browse a nested file tree with breadcrumbs; switch list/grid views.
- File categories: images, video, audio, documents, spreadsheets, slides, archives, packages, code and other.
- Live fuzzy search with ranked results, typo tolerance, path matching and category/size/starred filters.
- Query operators: `type:image`, `ext:pdf`, `folder:true`, `min:50mb`, `starred:true`.
- Natural sorting by name, size, modified time or type; optionally keep folders first.
- Star favourites; create folders; import, rename and delete files; preview supported text files.
- Storage insights by category, largest/recent files and duplicate candidates with reclaimable bytes.
- Two storage roots: the app's private folder, or the whole device (Downloads, DCIM, WhatsApp, SD card) once you grant "All files access".
- No server, no cloud upload, no analytics.

## Run it

Requirements: Node 22, JDK 17, the Android SDK with an NDK, and Rust.

```sh
npm install
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo install cargo-ndk
export ANDROID_NDK_HOME=$ANDROID_HOME/ndk/27.1.12297006

npm run core:android        # build libfilecore.so for arm64-v8a, armeabi-v7a, x86_64
npx expo prebuild --platform android --clean
npm run android             # build + install on a device or emulator
```

`npm run core:android` must run before Gradle whenever the Rust code changes; the
`.so` files are gitignored, so a fresh clone has to build them once.

The storage pill at the top of the Files screen switches between **App storage**
(the private document directory) and **Internal storage** (`/storage/emulated/0`,
plus any SD card). Reading the real device needs the `MANAGE_EXTERNAL_STORAGE`
permission — Android calls it "All files access" and only lets the user grant it
from system settings, so the app shows a banner that opens that screen. Writes,
renames and deletes follow the active root. See
[`docs/android-storage.md`](docs/android-storage.md) for the permission list and
the Google Play declaration this requires.

## Android APK release (without EAS)

A GitHub Actions workflow in `.github/workflows/android-release.yml` cross-compiles
the Rust core with `cargo-ndk`, runs Expo Prebuild and Gradle on a GitHub runner,
signs the APK using repository secrets, uploads it as an Actions artifact, and
attaches it to GitHub Releases for `v*` tags. The build fails if `libfilecore.so`
is missing from the APK. Configure the persistent keystore secrets first; see
[`docs/android-release.md`](docs/android-release.md). The workflow uses the
built-in `GITHUB_TOKEN`, not a personal access token.

## Tests

```sh
npm test              # cargo test: algorithms + filesystem operations
npm run typecheck     # tsc --noEmit
```

The Rust tests cover fuzzy ranking, query parsing, sorting, insights, duplicate
detection and the native filesystem operations (nested walks, the entry cap, text
reads, mkdir / copy / rename / remove). Ranking tests use a pinned clock so scores
are deterministic.

## Search examples

```text
inv                         # fuzzy prefix / subsequence search
invoice pdf                 # every free-text term must match
type:image min:1mb          # category and size filters
ext:pdf                     # extension filter
type:image,audio            # multiple categories
folder:true                 # folders only
starred:true                # favourites only
rust native                 # multi-term fuzzy search
```

See [`docs/search.md`](docs/search.md) for the operator reference and ranking model.

## Project map

```text
App.tsx                     Expo app shell + tabs
src/screens/                Files, Search, Insights
src/fs/                     Filesystem provider (native scan, storage roots, permissions)
src/store/FileStore.tsx     Shared browsing state and file actions
src/core/                   Core API + the single JS door into Rust (native.ts)
src/core/display.ts         Render-time helpers (size text, category bucket)
rust/src/lib.rs             Search / sort / insights / duplicates
rust/src/fsops.rs           Native directory walk, read, mkdir, rename, copy, delete
rust/src/jni_bridge.rs      The one JNI symbol Android calls
modules/filecore/           Expo module: Kotlin wrapper + jniLibs + JS interface
scripts/build-core-android.sh   cargo-ndk build for the three Android ABIs
docs/                       Architecture, search syntax, storage and release notes
```
