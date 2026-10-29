import type { Entry } from '../core/types';

/** A place the app can browse. Switching roots keeps paths relative. */
export interface StorageRoot {
  id: string;
  label: string;
  /** True when the root needs an OS permission before it can be listed. */
  restricted?: boolean;
}

/** Whether the active root can actually be read right now. */
export interface StorageAccess {
  rootId: string;
  granted: boolean;
  /** True when the OS screen for granting access can be opened. */
  canRequest: boolean;
  reason?: string;
}

/**
 * The filesystem surface the app needs, implemented once in `device.ts` over
 * the native Rust core.
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

  /** Browsable roots: app sandbox, and on Android the shared device storage. */
  roots(): Promise<StorageRoot[]>;
  /** Switches the active root; all paths are relative to it. */
  setRoot(id: string): Promise<void>;
  /** Checks the active root is readable and whether access can be requested. */
  access(): Promise<StorageAccess>;
  /** Opens the OS screen where the user grants all-files access. */
  requestAccess(): Promise<void>;
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
