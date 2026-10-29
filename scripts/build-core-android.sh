#!/usr/bin/env bash
# Builds the Rust core for Android and drops libfilecore.so where the Expo
# module picks it up (modules/filecore/android/src/main/jniLibs/<abi>/).
#
# Requires: rustup targets, the Android NDK and cargo-ndk.
#   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
#   cargo install cargo-ndk
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/modules/filecore/android/src/main/jniLibs"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found — install Rust from https://rustup.rs" >&2
  exit 1
fi
if ! cargo ndk --version >/dev/null 2>&1; then
  echo "cargo-ndk not found — run: cargo install cargo-ndk" >&2
  exit 1
fi
if [[ -z "${ANDROID_NDK_HOME:-}${ANDROID_NDK_ROOT:-}${ANDROID_HOME:-}" ]]; then
  echo "No Android NDK found — set ANDROID_NDK_HOME or ANDROID_HOME" >&2
  exit 1
fi

echo "▸ cargo ndk build (arm64-v8a, armeabi-v7a, x86_64) -> $OUT"
# cargo-ndk runs `cargo metadata` in the working directory, so build from the
# crate root rather than passing --manifest-path.
cd "$ROOT/rust"
cargo ndk \
  -t arm64-v8a \
  -t armeabi-v7a \
  -t x86_64 \
  -o "$OUT" \
  build --release --features jni

ls -l "$OUT"/*/libfilecore.so
