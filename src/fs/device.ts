/**
 * Real-device filesystem, entirely in Rust.
 *
 * The app used to walk directories from JavaScript, one expo-file-system call
 * per entry — that is what made a big phone feel slow. Now a single
 * `scan` request crosses into `rust/src/fsops.rs`, which walks the tree with
 * `std::fs` and returns the whole listing as one JSON array. Reading, creating,
 * renaming, copying and deleting are native calls too.
 *
 * Roots:
 *   app    — the app's private document directory, no permission needed
 *   shared — /storage/emulated/0 (plus SD card volumes), needs "All files
 *            access" (MANAGE_EXTERNAL_STORAGE) on Android 11+
 *
 * Paths handed to the UI are relative to the active root; Rust gets absolute
 * POSIX paths.
 */
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import type { Entry } from '../core/types';
import { callNativeAsync } from '../core/native';
import {
  baseName,
  dirOf,
  joinPath,
  type FsProvider,
  type StorageAccess,
  type StorageRoot,
} from './provider';

const SHARED_PRIMARY = '/storage/emulated/0';
const MAX_ENTRIES = 25_000;
const MAX_TEXT_BYTES = 512 * 1024;

const TEXT_EXT = new Set([
  'txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'rs', 'toml', 'yml', 'yaml',
  'html', 'css', 'xml', 'log', 'ini', 'sh', 'py',
]);

/** Directories that are never useful to walk, and are often unreadable anyway. */
const SKIP_PREFIXES = ['/Android/data', '/Android/obb'];

/** Volumes discovered under /storage (SD cards, USB drives). */
const volumePaths: Record<string, string> = {};

let activeId = 'app';

const uriToPath = (uri: string): string =>
  decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');

const appRootPath = (): string => uriToPath(FileSystem.documentDirectory ?? 'file:///');

const rootPath = (): string => {
  if (activeId === 'app') return appRootPath();
  return volumePaths[activeId] ?? SHARED_PRIMARY;
};

/** `/DCIM/a.jpg` -> `/storage/emulated/0/DCIM/a.jpg` */
const toPath = (rel: string): string => {
  const root = rootPath();
  return rel === '/' ? root : `${root}${rel.startsWith('/') ? rel : `/${rel}`}`;
};

/** Can the app list this directory right now? */
const isReadable = async (path: string): Promise<boolean> => {
  try {
    // depth 1 so the call really lists the directory: `metadata` alone can
    // succeed on a folder the app is not allowed to enumerate.
    await callNativeAsync<Entry[]>('scan', {
      root: path,
      max_depth: 1,
      max_entries: 1,
      skip: [],
    });
    return true;
  } catch {
    return false;
  }
};

class DeviceFs implements FsProvider {
  kind = 'device' as const;

  async ensureRoot(): Promise<void> {
    if (activeId !== 'app') return;
    await callNativeAsync<Entry>('mkdir', { path: appRootPath() });
  }

  async roots(): Promise<StorageRoot[]> {
    const list: StorageRoot[] = [{ id: 'app', label: 'App storage' }];
    if (Platform.OS !== 'android') return list;

    volumePaths.shared = SHARED_PRIMARY;
    list.push({ id: 'shared', label: 'Internal storage', restricted: true });

    // Secondary volumes (SD cards) live beside `emulated` under /storage.
    try {
      const volumes = await callNativeAsync<Entry[]>('scan', {
        root: '/storage',
        max_depth: 1,
        max_entries: 50,
        skip: [],
      });
      for (const volume of volumes) {
        if (volume.kind !== 'dir') continue;
        if (volume.name === 'emulated' || volume.name === 'self') continue;
        const path = `/storage/${volume.name}`;
        if (!(await isReadable(path))) continue;
        volumePaths[`vol:${volume.name}`] = path;
        list.push({ id: `vol:${volume.name}`, label: `SD card (${volume.name})`, restricted: true });
      }
    } catch {
      /* no extra volumes */
    }
    return list;
  }

  async setRoot(id: string): Promise<void> {
    activeId = id;
    if (id !== 'app') volumePaths[id] = volumePaths[id] ?? SHARED_PRIMARY;
  }

  async access(): Promise<StorageAccess> {
    if (activeId === 'app') {
      return { rootId: activeId, granted: true, canRequest: false };
    }
    const granted = await isReadable(rootPath());
    return {
      rootId: activeId,
      granted,
      canRequest: Platform.OS === 'android' && !granted,
      reason: granted
        ? undefined
        : 'Android needs "All files access" before FileStack can read this storage.',
    };
  }

  async requestAccess(): Promise<void> {
    if (Platform.OS !== 'android') return;
    const pkg = Constants.expoConfig?.android?.package ?? 'in.crossberry.filestack';

    // Android 11+: a per-app screen. Some OEM builds only ship the generic
    // list, so fall back to it and finally to the app's settings page.
    const targets: { action: string; params?: { data?: string } }[] = [
      {
        action: 'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
        params: { data: `package:${pkg}` },
      },
      { action: 'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION' },
    ];
    for (const target of targets) {
      try {
        await IntentLauncher.startActivityAsync(target.action, target.params);
        return;
      } catch {
        /* try the next screen */
      }
    }
    await Linking.openSettings();
  }

  async scan(): Promise<Entry[]> {
    await this.ensureRoot();
    return callNativeAsync<Entry[]>('scan', {
      root: rootPath(),
      max_depth: activeId === 'app' ? 8 : 10,
      max_entries: MAX_ENTRIES,
      skip: SKIP_PREFIXES,
    });
  }

  async readText(path: string): Promise<string> {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    if (!TEXT_EXT.has(ext)) throw new Error('No text preview for this file type');
    return callNativeAsync<string>('read_text', {
      path: toPath(path),
      max_bytes: MAX_TEXT_BYTES,
    });
  }

  async mkdir(dir: string, name: string): Promise<Entry> {
    const rel = joinPath(dir, name);
    const created = await callNativeAsync<Entry>('mkdir', { path: toPath(rel) });
    return { ...created, id: rel, path: rel };
  }

  async remove(paths: string[]): Promise<void> {
    await callNativeAsync<number>('remove', { paths: paths.map(toPath) });
  }

  async rename(path: string, nextName: string): Promise<string> {
    const next = joinPath(dirOf(path), nextName);
    if (next === path) return path;
    await callNativeAsync<string>('rename', { from: toPath(path), to: toPath(next) });
    return next;
  }

  async importFiles(): Promise<Entry[]> {
    await this.ensureRoot();
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: '*/*',
    });
    if (result.canceled) return [];

    await callNativeAsync<Entry>('mkdir', { path: toPath('/Imports') });

    const created: Entry[] = [];
    for (const asset of result.assets) {
      const name = asset.name ?? baseName(asset.uri);
      let target = `/Imports/${name}`;
      let n = 1;
      while (await callNativeAsync<boolean>('exists', { path: toPath(target) })) {
        target = `/Imports/${name.replace(/(\.[^.]+)?$/, ` (${n})$1`)}`;
        n += 1;
      }
      await callNativeAsync<number>('copy', {
        from: uriToPath(asset.uri),
        to: toPath(target),
      });
      created.push({
        id: target,
        name: baseName(target),
        path: target,
        kind: 'file',
        size: asset.size ?? 0,
        mtime: Date.now(),
      });
    }
    return created;
  }
}

export function createDeviceFs(): FsProvider {
  return new DeviceFs();
}
