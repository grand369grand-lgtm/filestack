/**
 * Engine selection.
 *
 *   wasm   — Rust core (web / any JS runtime with WebAssembly)
 *   js     — TypeScript mirror (Hermes without the native cdylib)
 *
 * Both return identical shapes, so screens import only from here.
 */
import { fallbackCore } from './fallback';
import { wasmAvailable, wasmCore, fileCoreMeta } from './wasm';
import type { CoreApi } from './types';

export { fallbackCore, wasmCore, fileCoreMeta };
export * from './types';

// Synchronous display helpers. These are the TypeScript mirror; their output is
// pinned to the Rust implementation by `npm run test:core` (parity suite).
export { formatSize, categoryOf, extOf, fuzzy } from './fallback';

export interface EngineInfo {
  engine: 'wasm' | 'js';
  version: string;
  bytes?: number;
  sha256?: string;
}

let core: CoreApi = fallbackCore;
let info: EngineInfo = { engine: 'js', version: '0.1.0' };

export async function initCore(): Promise<EngineInfo> {
  if (wasmAvailable()) {
    try {
      const ping = await wasmCore.ping();
      core = wasmCore;
      info = {
        engine: 'wasm',
        version: ping.version,
        bytes: fileCoreMeta.bytes,
        sha256: fileCoreMeta.sha256,
      };
      return info;
    } catch (err) {
      if (__DEV__) console.warn('[filecore] wasm unavailable, using TS engine:', err);
    }
  }
  const ping = await fallbackCore.ping();
  info = { engine: 'js', version: ping.version };
  return info;
}

export const engine = (): CoreApi => core;
export const engineInfo = (): EngineInfo => info;
