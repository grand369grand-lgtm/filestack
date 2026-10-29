/**
 * The single door into the Rust core.
 *
 * Every request is one JNI call carrying a JSON envelope; Rust does the work
 * and returns `{"ok":true,"data":...}` or `{"ok":false,"error":"..."}`.
 * There is no JavaScript implementation of these algorithms in the app any
 * more — if the native library is missing, calls throw instead of silently
 * falling back to a slower path.
 */
import type { FileCoreNativeModule } from '../../modules/filecore';

declare const require: (path: string) => { default: FileCoreNativeModule };

let native: FileCoreNativeModule | null = null;

function nativeModule(): FileCoreNativeModule {
  if (!native) {
    try {
      native = require('../../modules/filecore').default;
    } catch (error) {
      throw new Error(
        'filecore: native module is not available. Build the Rust library ' +
          '(npm run core:android) and reinstall the app — see docs/native-rust.md.',
      );
    }
  }
  return native;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

function encode(op: string, payload: unknown): string {
  return JSON.stringify({ op, payload });
}

function unwrap<T>(raw: string): T {
  const envelope = JSON.parse(raw) as Envelope<T>;
  if (!envelope.ok) throw new Error(`filecore: ${envelope.error}`);
  return envelope.data;
}

/** Cheap compute call, on the JS thread: search, sort, insights, ping. */
export function callNative<T>(op: string, payload: unknown): T {
  return unwrap<T>(nativeModule().invoke(encode(op, payload)));
}

/** Filesystem call, on a background thread: scan, read_text, mkdir, remove. */
export async function callNativeAsync<T>(op: string, payload: unknown): Promise<T> {
  return unwrap<T>(await nativeModule().invokeAsync(encode(op, payload)));
}
