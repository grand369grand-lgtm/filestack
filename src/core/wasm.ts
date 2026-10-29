/**
 * Loads the Rust core (compiled to wasm32) and exposes it as `CoreApi`.
 *
 * The module has zero imports, so `WebAssembly.instantiate(bytes, {})` is all
 * the plumbing needed. Strings cross the boundary through linear memory:
 *   write JSON -> fc_invoke -> read [u32 len][bytes] -> free input.
 */
import { FILECORE_META, FILECORE_WASM_BASE64 } from './filecore.generated';
import type { CoreApi } from './types';

interface FileCoreExports {
  memory: WebAssembly.Memory;
  fc_alloc(len: number): number;
  fc_free(ptr: number, len: number): void;
  fc_invoke(ptr: number, len: number): number;
  fc_last_len(): number;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 -> bytes without Buffer/atob (Hermes, iframe sandboxes, Node). */
function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

let instancePromise: Promise<FileCoreExports> | null = null;

async function getInstance(): Promise<FileCoreExports> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const bytes = decodeBase64(FILECORE_WASM_BASE64);
      const source = (await WebAssembly.instantiate(
        bytes as unknown as BufferSource,
        {},
      )) as WebAssembly.WebAssemblyInstantiatedSource;
      return source.instance.exports as unknown as FileCoreExports;
    })();
  }
  return instancePromise;
}

export const wasmAvailable = (): boolean =>
  typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';

async function call<T>(op: string, payload: unknown): Promise<T> {
  const ex = await getInstance();
  const request = new TextEncoder().encode(JSON.stringify({ op, payload }));

  const inPtr = ex.fc_alloc(request.length);
  if (!inPtr) throw new Error('filecore: out of memory');
  new Uint8Array(ex.memory.buffer, inPtr, request.length).set(request);

  let outPtr = 0;
  try {
    outPtr = ex.fc_invoke(inPtr, request.length);
  } finally {
    ex.fc_free(inPtr, request.length);
  }

  const view = new DataView(ex.memory.buffer);
  const len = view.getUint32(outPtr, true);
  const text = new TextDecoder().decode(
    new Uint8Array(ex.memory.buffer, outPtr + 4, len),
  );

  const envelope = JSON.parse(text) as
    | { ok: true; data: T }
    | { ok: false; error: string };
  if (!envelope.ok) throw new Error(`filecore: ${envelope.error}`);
  return envelope.data;
}

export const wasmCore: CoreApi = {
  search: (req) => call('search', req),
  sort: (req) => call('sort', req),
  insights: (req) => call('insights', req),
  duplicates: (entries) => call('duplicates', entries),
  formatSize: (bytes) => call('formatSize', bytes),
  ping: () => call('ping', null),
};

export const fileCoreMeta = FILECORE_META;
