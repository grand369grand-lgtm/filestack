# Architecture

```text
┌──────────────── Expo / React Native UI ───────────────┐
│ Files screen · Search screen · Insights screen        │
│ shared FileStore · filesystem provider interface      │
└───────────────────┬───────────────────────────────────┘
                    │ CoreApi + FsProvider (typed JSON)
                    ▼
        src/core/native.ts  ── JSON envelope ──┐
                    │                          │
        Expo module (Kotlin)                   │
        modules/filecore                       │
                    │  JNI                   │
                    ▼                        ▼
        libfilecore.so  ──►  rust/src/lib.rs   (search, sort, insights,
                             rust/src/fsops.rs   duplicates, directory walk,
                                                 read / mkdir / rename / delete)
```

## One engine

Rust is the only implementation. The UI reaches it through `src/core/native.ts`,
which sends one JSON envelope per call and unwraps `{"ok":true,"data":...}` or
throws `{"ok":false,"error":"..."}`. There is no WebAssembly build, no
TypeScript mirror and no runtime engine selection: if the native library is
missing, calls throw a message that points at `docs/native-rust.md` instead of
silently running something slower.

Two entry points, chosen per operation:

- `invoke` — synchronous, JS thread. Search, sort, insights, duplicates, ping.
- `invokeAsync` — background thread. Every filesystem operation, so a slow
  directory walk never blocks the UI.

`src/core/display.ts` keeps the three render-time helpers (`formatSize`,
`categoryOf`, `extOf`) in TypeScript: they run once per visible row, and a bridge
call per row would cost more than the work.

## Filesystem boundary

The UI depends on `FsProvider`, not Expo APIs directly. `src/fs/device.ts`
implements it over the native core plus three Expo modules that are genuinely
platform UI rather than file I/O: `expo-document-picker` (system picker),
`expo-intent-launcher` (the all-files-access settings screen) and
`expo-file-system` (only to read `documentDirectory`).

The provider exposes roots — the app's document directory, and on Android the
shared storage plus any SD card volume — and keeps paths relative to the active
root. `scan` returns the whole tree in one call: `std::fs` walks it in Rust, the
walk is capped at 25 000 entries and depth 10, and it skips `Android/data`,
`Android/obb`, `.thumbnails` and `LOST.DIR`.

## Packaging

`npm run core:android` cross-compiles `rust/` into
`modules/filecore/android/src/main/jniLibs/<abi>/libfilecore.so` for arm64-v8a,
armeabi-v7a and x86_64. Expo autolinking picks up the local module from
`modules/`, Gradle packages the shared libraries into the APK, and the release
workflow fails if `lib/arm64-v8a/libfilecore.so` is not inside the built APK.

## No remote service

The app has no API client, login, analytics, or server-side index. Searches and
file operations stay on the device.
