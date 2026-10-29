# Architecture

```text
┌──────────────── Expo / React Native UI ───────────────┐
│ Files screen · Search screen · Insights screen        │
│ shared FileStore · filesystem provider interface      │
└───────────────────┬───────────────────────────────────┘
                    │ CoreApi (typed JSON data)
           ┌────────┴────────┐
           │                 │
     WebAssembly         TypeScript mirror
     Rust filecore       Hermes-safe native fallback
           │                 │
           └──── same result shapes ──────┘
```

## Filesystem boundary

The UI depends on `FsProvider`, not Expo APIs directly. `src/fs/mock.ts` supplies a seeded tree for web previews, including nested projects, duplicate candidates and text fixtures. `src/fs/device.ts` uses Expo FileSystem and DocumentPicker on iOS/Android. The device provider is scoped to the app's document directory; an explicit picker import is copied into `/Imports`.

## Core boundary

Screens call only `engine()` from `src/core`. `initCore()` selects Rust/WASM when a WebAssembly runtime is available, otherwise the TypeScript implementation. The Rust crate and TS mirror implement the same search, natural sort, insights, duplicates and size-formatting API. `scripts/test-core.mjs` compares their output against a pinned fixture corpus.

The generated `src/core/filecore.generated.ts` contains the optimized WASM binary as base64. Inlining avoids runtime network fetches and works in Expo's web bundle. Rebuild it after Rust changes with `npm run core`.

## No remote service

The app has no API client, login, analytics, or server-side index. Searches and file operations stay on the device. The web preview uses synthetic demo files only.
