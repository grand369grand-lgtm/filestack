/**
 * Pure-TypeScript mirror of the Rust core.
 *
 * Why it exists:
 *  - Hermes (React Native's JS engine) has no WebAssembly, so a native build
 *    without the Rust cdylib still needs the app to work. This is that path.
 *  - It is also the differential-testing reference for the Rust engine
 *    (`npm run test:core` compares both implementations on the same corpus).
 *
 * Keep this file algorithmically in sync with rust/src/lib.rs.
 */
import type {
  Category,
  CoreApi,
  DuplicateGroup,
  Entry,
  Insights,
  SearchHit,
  SearchResponse,
  SortRequest,
} from './types';

const EXT_MAP: Record<string, Category> = {};
const bucket = (cats: Category, exts: string[]) =>
  exts.forEach((e) => (EXT_MAP[e] = cats));
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

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 800;
const SCORE_SUBSTRING = 600;
const SCORE_SUBSEQUENCE = 250;

export function fuzzy(needle: string, haystack: string): { score: number; indices: number[] } {
  const n = [...needle];
  const h = [...haystack];
  if (!n.length) return { score: 1, indices: [] };
  if (!h.length) return { score: 0, indices: [] };
  if (n.length === h.length && n.every((ch, i) => ch === h[i]))
    return { score: SCORE_EXACT, indices: n.map((_, i) => i) };
  if (n.length <= h.length && n.every((ch, i) => ch === h[i]))
    return { score: SCORE_PREFIX, indices: n.map((_, i) => i) };

  const isAlnum = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
  if (n.length <= h.length) {
    for (let pos = 0; pos <= h.length - n.length; pos++) {
      if (n.every((ch, i) => ch === h[pos + i])) {
        const boundary = pos > 0 && !isAlnum(h[pos - 1]);
        const base = boundary ? SCORE_PREFIX : SCORE_SUBSTRING;
        return {
          score: base - Math.min(pos, 100) + (boundary ? 40 : 0),
          indices: n.map((_, i) => i + pos),
        };
      }
    }
  }

  const indices: number[] = [];
  let cursor = 0;
  let gaps = 0;
  let boundaryHits = 0;
  for (const ch of n) {
    let at = -1;
    for (let i = cursor; i < h.length; i++) {
      if (h[i] === ch) {
        at = i;
        break;
      }
    }
    if (at < 0) return { score: 0, indices: [] };
    if (indices.length) gaps += at - indices[indices.length - 1] - 1;
    if (at === 0 || !isAlnum(h[at - 1])) boundaryHits++;
    indices.push(at);
    cursor = at + 1;
  }
  return { score: Math.max(1, SCORE_SUBSEQUENCE + boundaryHits * 25 - gaps * 8), indices };
}

interface ParsedQuery {
  terms: string[];
  categories: string[];
  exts: string[];
  onlyFolders?: boolean;
  minSize?: number;
  onlyStarred: boolean;
}

function parseSize(raw: string): number | undefined {
  const s = raw.trim().toLowerCase();
  const m = s.match(/^([\d.]+)\s*(kb|k|mb|m|gb|g)?$/);
  if (!m) return undefined;
  const mult = { k: 1e3, kb: 1e3, m: 1e6, mb: 1e6, g: 1e9, gb: 1e9 } as Record<string, number>;
  return Math.round(parseFloat(m[1]) * (mult[m[2] ?? ''] ?? 1));
}

function parseQuery(raw: string): ParsedQuery {
  const q: ParsedQuery = { terms: [], categories: [], exts: [], onlyStarred: false };
  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const lower = token.toLowerCase();
    const idx = lower.indexOf(':');
    if (idx > 0) {
      const key = lower.slice(0, idx);
      const value = lower.slice(idx + 1).replace(/"/g, '');
      if (key === 'type' || key === 'kind')
        q.categories.push(...value.split(',').map((v) => v.trim()));
      else if (key === 'ext') q.exts.push(...value.split(',').map((v) => v.trim()));
      else if (key === 'folder' || key === 'dir')
        q.onlyFolders = !['false', 'no', '0'].includes(value);
      else if (key === 'min' || key === 'min-size') q.minSize = parseSize(value);
      else if (key === 'starred' || key === 'fav')
        q.onlyStarred = !['false', 'no', '0'].includes(value);
      else q.terms.push(lower);
    } else q.terms.push(lower);
  }
  return q;
}

function scoreEntry(entry: Entry, q: ParsedQuery, now: number): SearchHit | null {
  if (q.onlyFolders !== undefined && (entry.kind === 'dir') !== q.onlyFolders) return null;
  if (q.onlyStarred && !entry.starred) return null;
  const cat = categoryOf(entry);
  if (q.categories.length && !q.categories.some((c) => c === cat || c === 'all' || c === '*'))
    return null;
  if (q.exts.length && !q.exts.includes(extOf(entry))) return null;
  if (q.minSize !== undefined && entry.size < q.minSize) return null;

  const name = entry.name.toLowerCase();
  const path = entry.path.toLowerCase();
  let total = 0;
  let matchedOn: 'name' | 'path' = 'name';
  let bestIdx: number[] = [];

  for (const term of q.terms) {
    const n = fuzzy(term, name);
    const p = fuzzy(term, path);
    const pathOnly = Math.floor(p.score * 0.35);
    if (!n.score && !pathOnly) return null;
    if (n.score >= pathOnly) {
      total += n.score;
      if (n.indices.length > bestIdx.length) {
        bestIdx = n.indices;
        matchedOn = 'name';
      }
    } else {
      total += pathOnly;
      matchedOn = 'path';
      bestIdx = p.indices;
    }
  }
  if (!q.terms.length) total = 1;

  if (entry.starred) total += 60;
  if (entry.kind === 'dir') total += 15;
  if (entry.mtime && now > 0) {
    const ageDays = Math.max(0, now - entry.mtime) / 86_400_000;
    total += Math.round(60 * Math.min(1, Math.max(0, 1 - ageDays / 30)));
  }

  return { entry, score: total, matched_on: matchedOn, indices: bestIdx, category: cat };
}

function naturalCmp(a: string, b: string): number {
  const ax = a.toLowerCase().match(/(\d+|\D+)/g) ?? [];
  const bx = b.toLowerCase().match(/(\d+|\D+)/g) ?? [];
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d) return d;
    } else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export const formatSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  if (unit === 0) return `${bytes} B`;
  // Round half-up explicitly so JS and Rust print identical strings.
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${value >= 100 ? rounded.toFixed(0) : rounded.toFixed(1)} ${units[unit]}`;
};

export const fallbackCore: CoreApi = {
  async search({ entries, query, scope, limit, now = 0 }) {
    const q = parseQuery(query ?? '');
    const root = scope ? scope.replace(/\/+$/, '') : null;
    let hits = entries
      .filter((e) =>
        root ? e.path.startsWith(`${root}/`) && e.path !== root : true,
      )
      .map((e) => scoreEntry(e, q, now))
      .filter((h): h is SearchHit => h !== null);

    hits.sort(
      (a, b) =>
        b.score - a.score ||
        a.entry.name.toLowerCase().localeCompare(b.entry.name.toLowerCase()),
    );
    const total = hits.length;
    if (limit) hits = hits.slice(0, limit);

    const filters: string[] = [];
    if (q.categories.length) filters.push(`type:${q.categories.join(',')}`);
    if (q.exts.length) filters.push(`ext:${q.exts.join(',')}`);
    if (q.onlyFolders !== undefined) filters.push(`folder:${q.onlyFolders}`);
    if (q.minSize !== undefined) filters.push(`min:${q.minSize}`);
    if (q.onlyStarred) filters.push('starred:true');

    return { hits, total, query_terms: q.terms, filters } satisfies SearchResponse;
  },

  async sort(req: SortRequest) {
    const out = [...req.entries];
    out.sort((a, b) => {
      if (req.dirs_first && (a.kind === 'dir') !== (b.kind === 'dir'))
        return a.kind === 'dir' ? -1 : 1;
      let d = 0;
      switch (req.key) {
        case 'size':
          d = a.size - b.size;
          break;
        case 'modified':
          d = a.mtime - b.mtime;
          break;
        case 'kind':
          d = categoryOf(a).localeCompare(categoryOf(b)) || naturalCmp(a.name, b.name);
          break;
        default:
          d = naturalCmp(a.name, b.name);
      }
      return req.descending ? -d : d;
    });
    return out;
  },

  async insights({ entries, largest_limit = 5 }) {
    const files = entries.filter((e) => e.kind === 'file');
    const map = new Map<Category, { count: number; size: number }>();
    for (const f of files) {
      const c = categoryOf(f);
      const cur = map.get(c) ?? { count: 0, size: 0 };
      map.set(c, { count: cur.count + 1, size: cur.size + f.size });
    }
    const by_category = [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.size - a.size || a.category.localeCompare(b.category));
    return {
      files: files.length,
      folders: entries.length - files.length,
      total_size: files.reduce((s, f) => s + f.size, 0),
      by_category,
      largest: [...files].sort((a, b) => b.size - a.size).slice(0, largest_limit),
      newest: [...files].sort((a, b) => b.mtime - a.mtime).slice(0, largest_limit),
      starred: entries.filter((e) => e.starred).length,
    } satisfies Insights;
  },

  async duplicates(entries) {
    const map = new Map<string, string[]>();
    for (const e of entries) {
      if (e.kind === 'dir' || e.size <= 0) continue;
      const key = `${e.name.toLowerCase()}|${e.size}`;
      map.set(key, [...(map.get(key) ?? []), e.path]);
    }
    return [...map.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([key, paths]) => {
        const [name, size] = key.split('|');
        return {
          name,
          size: Number(size),
          count: paths.length,
          wasted: Number(size) * (paths.length - 1),
          paths,
        };
      })
      .sort((a, b) => b.wasted - a.wasted || a.name.localeCompare(b.name)) satisfies DuplicateGroup[];
  },

  async formatSize(bytes) {
    return formatSize(bytes);
  },

  async ping() {
    return { ok: true, engine: 'typescript-fallback', version: '0.1.0' };
  },
};
