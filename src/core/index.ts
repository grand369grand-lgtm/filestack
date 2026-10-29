/**
 * The app's compute engine: the Rust core, reached over JNI.
 *
 * Rust owns search ranking, query parsing, sorting, insights, duplicate
 * detection and the whole filesystem walk. `display.ts` keeps only the tiny
 * render-time string helpers; there is no JavaScript mirror of these
 * algorithms and no WebAssembly build any more.
 */
import { callNative } from './native';
import type { CoreApi } from './types';

export * from './types';
export { formatSize, categoryOf, extOf } from './display';

export interface EngineInfo {
  engine: 'rust';
  version: string;
}

let info: EngineInfo = { engine: 'rust', version: '0.0.0' };

export const core: CoreApi = {
  search: async (req) => callNative('search', req),
  sort: async (req) => callNative('sort', req),
  insights: async (req) => callNative('insights', req),
  duplicates: async (entries) => callNative('duplicates', entries),
  formatSize: async (bytes) => callNative('formatSize', bytes),
  ping: async () => callNative('ping', null),
};

/** Pings the native core so the UI can show which build it is running. */
export async function initCore(): Promise<EngineInfo> {
  const ping = await core.ping();
  info = { engine: 'rust', version: ping.version };
  return info;
}

export const engine = (): CoreApi => core;
export const engineInfo = (): EngineInfo => info;
