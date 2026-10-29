/**
 * Real-device filesystem, rooted at the app's private document directory,
 * so nothing here needs broad storage permissions.
 *
 * Uses the stable legacy expo-file-system API on purpose: it behaves the same
 * on iOS, Android and the New Architecture, and the newer `File`/`Directory`
 * classes can still be adopted later behind this same FsProvider interface.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { Entry } from '../core/types';
import { baseName, dirOf, joinPath, type FsProvider } from './provider';

/**
 * Resolved lazily: on web this module is never loaded, and even on native we
 * avoid touching FileSystem before the runtime is ready.
 */
const rootUri = (): string => FileSystem.documentDirectory ?? 'file:///';
const MAX_DEPTH = 8;
const TEXT_EXT = new Set([
  'txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'rs', 'toml', 'yml', 'yaml',
  'html', 'css', 'xml', 'log', 'ini', 'sh', 'py',
]);

/** `file:///…/Documents/a.pdf` -> `/a.pdf` */
const toRel = (uri: string): string => {
  const rel = decodeURIComponent(uri.slice(rootUri().length - 1));
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

class DeviceFs implements FsProvider {
  kind = 'device' as const;

  async ensureRoot(): Promise<void> {
    const root = rootUri();
    const info = await FileSystem.getInfoAsync(root);
    if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  }

  async scan(): Promise<Entry[]> {
    await this.ensureRoot();
    const out: Entry[] = [];
    const walk = async (uri: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH) return;
      let names: string[] = [];
      try {
        names = await FileSystem.readDirectoryAsync(uri);
      } catch {
        return;
      }
      for (const name of names) {
        const childUri = `${uri}${uri.endsWith('/') ? '' : '/'}${name}`;
        try {
          const info = await FileSystem.getInfoAsync(childUri);
          if (!info.exists) continue;
          const isDir = info.isDirectory === true;
          const rel = toRel(childUri);
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
