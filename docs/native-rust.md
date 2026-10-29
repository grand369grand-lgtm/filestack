# Native Rust core

FileStack's compute and filesystem work runs in Rust, inside the app process.
There is no WebAssembly build and no TypeScript copy of the algorithms: the
Rust library is the only implementation, and the app talks to it over JNI.

## Pieces

| Piece | What it is |
| --- | --- |
| `rust/src/lib.rs` | search ranking, query parsing, sorting, insights, duplicates, size formatting |
| `rust/src/fsops.rs` | directory walking, text reads, mkdir / rename / copy / delete / exists |
| `rust/src/ffi.rs` | JSON envelope + the C ABI (`fc_invoke_json` / `fc_free_json`) kept for a future iOS build |
| `rust/src/jni_bridge.rs` | the one JNI symbol Android calls, built with `--features jni` |
| `modules/filecore` | Expo module: Kotlin wrapper, `jniLibs` for the `.so`, `index.ts` for JS |
| `src/core/native.ts` | the only JS door into the core |

## Protocol

Every call is one JSON envelope in, one JSON envelope out:

```json
{"op":"scan","payload":{"root":"/storage/emulated/0","max_depth":10,"max_entries":25000}}
{"ok":true,"data":[{"id":"/DCIM","name":"DCIM","path":"/DCIM","kind":"dir","size":0,"mtime":1750000000000,"starred":false}]}
```

On failure: `{"ok":false,"error":"..."}`. The JS side throws that message, so a
missing permission or an unreadable folder shows up as a normal error instead of
a crash.

Operations: `search`, `sort`, `insights`, `duplicates`, `formatSize`, `ping`,
`scan`, `read_text`, `mkdir`, `remove`, `rename`, `copy`, `exists`.

## Two entry points, on purpose

- `invoke` — synchronous, on the JS thread. Used for search, sort, insights,
  duplicates and ping: the answer is needed immediately and the call is cheap.
- `invokeAsync` — background thread, returns a Promise. Used for every
  filesystem operation so a slow directory walk never blocks the UI.

## Why the filesystem moved into Rust

The app used to call `expo-file-system` once per entry while walking a tree.
On a phone with 20 000 files that is 20 000 round trips through the JS bridge
before the first screen renders. Now `scan` is a single call: `std::fs` walks
the tree in Rust and returns one JSON array. The walk is capped (25 000 entries,
depth 10) and skips `Android/data`, `Android/obb`, `.thumbnails` and `LOST.DIR`.

## Building the library

Local machine:

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo install cargo-ndk
export ANDROID_NDK_HOME=/path/to/android-sdk/ndk/27.1.12297006
npm run core:android        # -> modules/filecore/android/src/main/jniLibs/<abi>/libfilecore.so
npx expo prebuild --platform android --clean
npx expo run:android
```

`npm run core:android` is `scripts/build-core-android.sh`; it runs
`cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 build --release --features jni`.

The `.so` files are **not** committed (see `.gitignore`). CI builds them on every
release, and the workflow fails if the APK does not contain
`lib/arm64-v8a/libfilecore.so`.

## Tests

`npm test` runs `cargo test`, which covers the algorithms and the new filesystem
operations (walking a nested temp tree, the entry cap, text reads, mkdir / copy /
rename / remove). There is no JS engine to compare against any more, so the old
parity suite is gone.

## Keeping the bridge intact

The JNI symbol is derived from the Kotlin class name:

```
Java_expo_modules_filecore_FileCoreNative_invoke   (rust/src/jni_bridge.rs)
expo.modules.filecore.FileCoreNative.invoke        (modules/filecore/.../FileCoreNative.kt)
```

Rename either side and the app fails at runtime with `UnsatisfiedLinkError`.
`System.loadLibrary("filecore")` finds `libfilecore.so` inside the APK, so the
file name and the library name must stay `filecore`.

## iOS

Not built. The C ABI in `ffi.rs` is still exported for the day an XCFramework is
wired into a Swift Expo module; until then the app targets Android only
(`expo.platforms` in `app.json`).
