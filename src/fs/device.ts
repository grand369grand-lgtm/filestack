/**
 * Real-device filesystem.
 *
 * Two roots on Android:
 *   app    — the app's private document directory, no permission needed
 *   shared — /storage/emulated/0 (plus any SD card volume), which needs the
 *            "All files access" permission (MANAGE_EXTERNAL_STORAGE) on
 *            Android 11+, or READ/WRITE_EXTERNAL_STORAGE on older releases.
 *
 * Paths handed to the UI are always relative to the active root, so switching
 * between the sandbox and the real device storage does not change any of the
 * screens, the search core or the insights maths.
 *
 * Uses the stable legacy expo-file-system API on purpose: it behaves the same
 * on iOS, Android and the New Architecture, and the newer `File`/`Directory`
 * classes can still be adopted later behind this same FsProvider interface.
 */
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import type { Entry } from '../core/types';
import {
  baseName,
  dirOf,
  joinPath,
  type FsProvider,
  type StorageAccess,
  type StorageRoot,
} from './provider';

const appRootUri = (): string => FileSystem.documentDirectory ?? 'file:///';
const SHARED_PRIMARY = 'file:///storage/emulated/0/';

const MAX_DEPTH = 10;
/** Stop before a full device scan turns into a multi-minute stall. */
const MAX_ENTRIES = 25_000;
const TEXT_EXT = new Set([
  'txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'rs', 'toml', 'yml', 'yaml',
  'html', 'css', 'xml', 'log', 'ini', 'sh', 'py',
]);

/** Volumes discovered under /storage (SD cards, USB drives). */
const volumeUris: Record<string, string> = {};

let activeId = 'app';

const rootUri = (): string => {
  if (activeId === 'app') return appRootUri();
  return volumeUris[activeId] ?? SHARED_PRIMARY;
};

/** Can the app list this directory right now? */
const isReadable = async (uri: string): Promise<boolean> => {
  try {
    await FileSystem.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  }
};

/** `file:///storage/emulated/0/DCIM/a.jpg` -> `/DCIM/a.jpg` */
const toRel = (uri: string): string => {
  const root = rootUri();
  const rel = decodeURIComponent(uri.slice(root.length - 1));
  return rel.startsWith('/') ? rel : `/${rel}`;
};

const toUri = (rel: string): string => rootUri() + rel.replace(/^\/+/, '');

const nameFromUri = (uri: string): string => {
  const trimmed = uri.replace(/\/+$/, '');
  const raw = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/** Folders that are never useful to walk, and are often unreadable anyway. */
const skipDir = (rel: string, name: string): boolean => {
  if (rel === '/Android' && (name === 'data' || name === 'obb')) return true;
  if (name === '.thumbnails' || name === 'LOST.DIR') return true;
  return false;
};

class DeviceFs implements FsProvider {
  kind = 'device' as const;

  async ensureRoot(): Promise<void> {
    if (activeId !== 'app') return;
    const root = appRootUri();
    const info = await FileSystem.getInfoAsync(root);
    if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  }

  async roots(): Promise<StorageRoot[]> {
    const list: StorageRoot[] = [{ id: 'app', label: 'App storage' }];
    if (Platform.OS !== 'android') return list;

    volumeUris.shared = SHARED_PRIMARY;
    list.push({ id: 'shared', label: 'Internal storage', restricted: true });

    // Secondary volumes (SD cards) live beside `emulated` under /storage.
    try {
      const volumes = await FileSystem.readDirectoryAsync('file:///storage/');
      for (const volume of volumes) {
        if (volume === 'emulated' || volume === 'self') continue;
        const uri = `file:///storage/${volume}/`;
        if (!(await isReadable(uri))) continue;
        volumeUris[`vol:${volume}`] = uri;
        list.push({ id: `vol:${volume}`, label: `SD card (${volume})`, restricted: true });
      }
    } catch {
      /* no extra volumes */
    }
    return list;
  }

  async setRoot(id: string): Promise<void> {
    activeId = id;
    if (id !== 'app') volumeUris[id] = volumeUris[id] ?? SHARED_PRIMARY;
  }

  async access(): Promise<StorageAccess> {
    if (activeId === 'app') {
      return { rootId: activeId, granted: true, canRequest: false };
    }
    const granted = await isReadable(rootUri());
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
    const out: Entry[] = [];
    const walk = async (uri: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH || out.length >= MAX_ENTRIES) return;
      let names: string[] = [];
      try {
        names = await FileSystem.readDirectoryAsync(uri);
      } catch {
        return;
      }
      for (const name of names) {
        if (out.length >= MAX_ENTRIES) return;
        const childUri = `${uri}${uri.endsWith('/') ? '' : '/'}${name}`;
        const rel = toRel(childUri);
        if (skipDir(rel, name)) continue;
        try {
          const info = await FileSystem.getInfoAsync(childUri);
          if (!info.exists) continue;
          const isDir = info.isDirectory === true;
          out.push({
            id: rel,
            name: nameFromUri(childUri),
            path: rel,
            kind: isDir ? 'dir' : 'file',
            size: isDir ? 0 : (info.size ?? 0),
            mtime: info.modificationTime ? Math.round(info.modificationTime * 1000) : Date.now(),
          });
          if (isDir) await walk(childUri, depth + 1);
        } catch {
          /* unreadable child: skip */
        }
      }
    };
    await walk(rootUri(), 0);
    return out;
  }

  async readText(path: string): Promise<string> {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    if (!TEXT_EXT.has(ext)) throw new Error('No text preview for this file type');
    const info = await FileSystem.getInfoAsync(toUri(path));
    if (info.exists && (info.size ?? 0) > 512 * 1024) throw new Error('File too large to preview');
    return FileSystem.readAsStringAsync(toUri(path), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  async mkdir(dir: string, name: string): Promise<Entry> {
    const rel = joinPath(dir, name);
    await FileSystem.makeDirectoryAsync(toUri(rel), { intermediates: true });
    return { id: rel, name, path: rel, kind: 'dir', size: 0, mtime: Date.now() };
  }

  async remove(paths: string[]): Promise<void> {
    for (const p of paths) {
      await FileSystem.deleteAsync(toUri(p), { idempotent: true });
    }
  }

  async rename(path: string, nextName: string): Promise<string> {
    const next = joinPath(dirOf(path), nextName);
    if (next === path) return path;
    await FileSystem.moveAsync({ from: toUri(path), to: toUri(next) });
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

    const created: Entry[] = [];
    for (const asset of result.assets) {
      const name = asset.name ?? baseName(asset.uri);
      let target = `/Imports/${name}`;
      let n = 1;
      while ((await FileSystem.getInfoAsync(toUri(target))).exists) {
        target = `/Imports/${name.replace(/(\.[^.]+)?$/, ` (${n})$1`)}`;
        n += 1;
      }
      await FileSystem.makeDirectoryAsync(toUri('/Imports'), { intermediates: true });
      await FileSystem.copyAsync({ from: asset.uri, to: toUri(target) });
      const info = await FileSystem.getInfoAsync(toUri(target));
      created.push({
        id: target,
        name: baseName(target),
        path: target,
        kind: 'file',
        size: info.exists ? (info.size ?? asset.size ?? 0) : (asset.size ?? 0),
        mtime: Date.now(),
      });
    }
    return created;
  }
}

export function createDeviceFs(): FsProvider {
  return new DeviceFs();
}
