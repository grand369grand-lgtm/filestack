/**
 * Display helpers that run while rendering.
 *
 * These are string/bucket lookups used inside `render()`, so they stay in
 * TypeScript: crossing the bridge for every row of a list would cost more than
 * the work itself. Everything that scans, ranks, sorts or aggregates is in
 * Rust (`rust/src/lib.rs`, `rust/src/fsops.rs`).
 */
import type { Category, Entry } from './types';

const EXT_MAP: Record<string, Category> = {};
const bucket = (cat: Category, exts: string[]) =>
  exts.forEach((e) => (EXT_MAP[e] = cat));
bucket('image', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg', 'bmp', 'avif']);
bucket('video', ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v']);
bucket('audio', ['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg', 'opus']);
bucket('document', ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'pages', 'odt']);
bucket('sheet', ['xls', 'xlsx', 'csv', 'numbers', 'ods']);
bucket('slide', ['ppt', 'pptx', 'key', 'odp']);
bucket('archive', ['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz']);
bucket('package', ['apk', 'aab', 'ipa', 'exe', 'dmg', 'deb']);
bucket('code', [
  'rs', 'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'java', 'kt', 'swift', 'c', 'h', 'cpp',
  'rb', 'sh', 'toml', 'yaml', 'yml', 'json', 'css', 'html', 'sql', 'lua', 'php',
]);

export const extOf = (e: Entry): string => {
  if (e.kind === 'dir') return '';
  const i = e.name.lastIndexOf('.');
  return i <= 0 ? '' : e.name.slice(i + 1).toLowerCase();
};

export const categoryOf = (e: Entry): Category =>
  e.kind === 'dir' ? 'folder' : EXT_MAP[extOf(e)] ?? 'other';

/** Same output as `format_size` in Rust, so a badge never disagrees with a chart. */
export const formatSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  if (unit === 0) return `${bytes} B`;
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${value >= 100 ? rounded.toFixed(0) : rounded.toFixed(1)} ${units[unit]}`;
};
