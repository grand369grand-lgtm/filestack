# Native Rust bridge status

## What works today

- **Expo web:** the UI loads `filecore.wasm`, compiled from `rust/`. Rust performs the live search, directory sort, storage insights, duplicate detection and size formatting.
- **iOS / Android Expo:** the same `CoreApi` shape currently selects `fallbackCore` (TypeScript) on Hermes. This keeps the managed Expo app fully usable without a native Rust module. The Rust and TypeScript algorithms are parity-tested.
- **Rust library:** builds as both `cdylib` and `rlib`. `rust/src/ffi.rs` exports a compact C ABI (`fc_invoke_json` / `fc_free_json`) for native wrappers as well as the WASM ABI.

The native UI is not silently described as running Rust: its status badge shows `core: typescript` until a native module is registered.

## Why a native module is separate work

Expo Go and the managed Hermes runtime cannot load an arbitrary Rust `.so`/`.a` on their own. Native Rust on-device needs an Expo module plus platform build artifacts:

- Android: compile `filecore` for the supported Android ABIs and package the resulting shared library; expose a Kotlin `Function` that calls the JNI/C bridge.
- iOS: compile device and simulator slices into an XCFramework; call the C ABI from a Swift Expo module.
- JS: adapt that Expo module to `CoreApi` and select it in `src/core/index.ts` before the TypeScript fallback.

That requires a custom development client / EAS build (not Expo Go). The app's filesystem provider remains independent of this bridge.

## C ABI contract

`fc_invoke_json` accepts UTF-8 JSON with the same envelope used by WASM:

```json
{"op":"search","payload":{"entries":[],"query":"type:image"}}
```

It returns an allocated UTF-8 JSON envelope (`{"ok":true,"data":...}` or `{"ok":false,"error":"..."}`) and writes its byte length through `out_len`. The returned allocation must be released with `fc_free_json(ptr, len)`. The library does not retain request data.

Supported operations: `search`, `sort`, `insights`, `duplicates`, `formatSize`, `ping`.

## Build a native Rust library

Install the Android or iOS Rust targets for the host you build on, then compile the crate:

```sh
# Android (install cargo-ndk separately; Android NDK required)
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 build --release --manifest-path rust/Cargo.toml

# iOS (requires macOS + Xcode)
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
cargo build --release --manifest-path rust/Cargo.toml --target aarch64-apple-ios
cargo build --release --manifest-path rust/Cargo.toml --target aarch64-apple-ios-sim
```

These commands produce the Rust libraries; the Expo module and platform packaging are still required before enabling native Rust in the app.
