import type { Entry } from '../core/types';

/**
 * The filesystem surface the app needs. Two implementations:
 *   device.ts — real files in the app's sandbox (expo-file-system)
 *   mock.ts   — a seeded demo tree so the UI is fully explorable in a browser
 */
export interface FsProvider {
  kind: 'device' | 'demo';
  /** Flat listing of everything under the root. */
  scan(): Promise<Entry[]>;
  /** UTF-8 contents for previews; rejects for binaries. */
  readText(path: string): Promise<string>;
  mkdir(path: string, name: string): Promise<Entry>;
  remove(paths: string[]): Promise<void>;
  /** Returns the new path. */
  rename(path: string, nextName: string): Promise<string>;
  /** Opens the platform picker and imports the chosen files. */
  importFiles(): Promise<Entry[]>;
}

export const dirOf = (path: string): string => {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
};

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export const joinPath = (dir: string, name: string): string =>
  `${dir === '/' ? '' : dir}/${name}`;

/** Depth-first children of `dir` from a flat list. */
export const childrenOf = (entries: Entry[], dir: string): Entry[] =>
  entries.filter((e) => dirOf(e.path) === dir && e.path !== dir);

export const isAncestor = (ancestor: string, path: string): boolean =>
  ancestor === '/' || path === ancestor || path.startsWith(`${ancestor}/`);
