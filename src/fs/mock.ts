/**
 * Seeded in-memory filesystem for demo / web builds.
 * Big enough to make search, sorting and insights feel real:
 * 30+ files across 12 categories, deliberate duplicates and stale files.
 */
import type { Entry } from '../core/types';
import { baseName, dirOf, joinPath, type FsProvider } from './provider';

const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number) => Math.round(now - days * DAY);

type Seed = [path: string, size: number, days: number];

const FOLDERS = [
  '/Documents', '/Photos', '/Music', '/Downloads', '/Backup', '/Projects', '/Projects/filestack',
  '/Projects/portfolio', '/Videos',
];

const FILES: Seed[] = [
  ['/Documents/invoice_2024-08.pdf', 284_120, 3],
  ['/Documents/invoice_2024-07.pdf', 271_004, 34],
  ['/Documents/project-brief.docx', 48_900, 1],
  ['/Documents/lease-agreement.pdf', 1_842_000, 120],
  ['/Documents/notes.md', 3_210, 0],
  ['/Documents/tax-return-2023.pdf', 4_210_880, 210],
  ['/Photos/holiday-goa.jpg', 4_182_004, 12],
  ['/Photos/sunset-kanyakumari.jpg', 2_940_512, 9],
  ['/Photos/portrait-01.jpg', 1_204_880, 40],
  ['/Photos/portrait-02.jpg', 1_188_002, 40],
  ['/Photos/screenshot-2024-09-12.png', 812_400, 18],
  ['/Music/track01.mp3', 7_118_004, 300],
  ['/Music/track02.mp3', 6_882_120, 300],
  ['/Music/podcast-rust-ep12.mp3', 42_880_004, 6],
  ['/Downloads/backup-2024.zip', 918_240_000, 21],
  ['/Downloads/rustup-init.exe', 12_880_000, 60],
  ['/Downloads/receipt-scan.pdf', 284_120, 15],
  ['/Backup/receipt-scan.pdf', 284_120, 90],
  ['/Downloads/design-assets.tar.gz', 64_400_000, 45],
  ['/Projects/filestack/App.tsx', 8_240, 0],
  ['/Projects/filestack/Cargo.toml', 612, 2],
  ['/Projects/filestack/lib.rs', 22_480, 1],
  ['/Projects/filestack/README.md', 5_120, 4],
  ['/Projects/portfolio/index.html', 14_880, 30],
  ['/Projects/portfolio/style.css', 9_400, 30],
  ['/Videos/demo-screen-recording.mp4', 184_200_000, 8],
  ['/Videos/birthday-clip.mov', 96_800_000, 150],
  ['/Videos/tutorial-rust-wasm.mp4', 320_400_000, 25],
];

const TEXTS: Record<string, string> = {
  '/Documents/notes.md': `# Notes

- Scope the file manager to *browse, search, sort, clean up*.
- Rust core owns ranking; UI never re-sorts in JS.
- Duplicate detection keys on (name, size) for now.

## TODO
- [x] fuzzy + operator search
- [x] storage insights
- [ ] native cdylib bindings
`,
  '/Projects/filestack/lib.rs': `//! Filestack core
//!
//! Fuzzy search, query operators, natural sort, insights, duplicates.

pub fn search(req: SearchRequest) -> SearchResponse {
    // ...
}
`,
  '/Projects/filestack/README.md': `# Filestack

Expo (UI) + Rust (core) file manager.

    npm run core      # cargo build -> wasm -> inlined
    npm start         # Expo dev server
`,
  '/Projects/filestack/App.tsx': `import { FileStack } from './src/FileStack';

export default function App() {
  return <FileStack />;
}
`,
  '/Projects/filestack/Cargo.toml': `[package]
name = "filecore"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]
`,
  '/Projects/portfolio/index.html': `<!doctype html>
<html><body><h1>Portfolio</h1></body></html>
`,
  '/Projects/portfolio/style.css': `:root { --accent: #5EE1C0; }
body { background: #0B0F14; color: #E8EEF6; }
`,
};

class MockFs implements FsProvider {
  kind = 'demo' as const;
  private entries = new Map<string, Entry>();
  private contents = new Map<string, string>();

  constructor() {
    for (const f of FOLDERS) this.put(this.make(f, 'dir', 0, ago(90)));
    for (const [path, size, days] of FILES) {
      const starred =
        path === '/Documents/project-brief.docx' || path === '/Photos/holiday-goa.jpg';
      const e = this.make(path, 'file', size, ago(days));
      e.starred = starred;
      this.put(e);
    }
    for (const [path, text] of Object.entries(TEXTS)) this.contents.set(path, text);
  }

  private make(path: string, kind: 'file' | 'dir', size: number, mtime: number): Entry {
    return { id: path, name: baseName(path), path, kind, size, mtime, starred: false };
  }

  private put(e: Entry) {
    this.entries.set(e.path, e);
  }

  async scan(): Promise<Entry[]> {
    return [...this.entries.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  async readText(path: string): Promise<string> {
    const c = this.contents.get(path);
    if (c !== undefined) return c;
    const e = this.entries.get(path);
    if (!e) throw new Error('Not found');
    throw new Error(`No text preview for ${e.name}`);
  }

  async mkdir(dir: string, name: string): Promise<Entry> {
    const path = joinPath(dir, name);
    if (this.entries.has(path)) throw new Error('Already exists');
    const e = this.make(path, 'dir', 0, Date.now());
    this.put(e);
    return e;
  }

  async remove(paths: string[]): Promise<void> {
    for (const p of paths) {
      for (const key of [...this.entries.keys()]) {
        if (key === p || key.startsWith(`${p}/`)) {
          this.entries.delete(key);
          this.contents.delete(key);
        }
      }
    }
  }

  async rename(path: string, nextName: string): Promise<string> {
    const e = this.entries.get(path);
    if (!e) throw new Error('Not found');
    const next = joinPath(dirOf(path), nextName);
    if (this.entries.has(next)) throw new Error('Name already taken');
    const moved: Entry[] = [];
    for (const [key, value] of this.entries) {
      if (key === path || key.startsWith(`${path}/`)) {
        const rebased = next + key.slice(path.length);
        moved.push({ ...value, id: rebased, path: rebased, name: baseName(rebased) });
        this.entries.delete(key);
        const text = this.contents.get(key);
        if (text !== undefined) {
          this.contents.delete(key);
          this.contents.set(rebased, text);
        }
      }
    }
    for (const m of moved) this.put(m);
    return next;
  }

  async importFiles(): Promise<Entry[]> {
    // The browser demo has no private device sandbox; make a small sample
    // import so the flow can be exercised without uploading any local data.
    if (!this.entries.has('/Imports')) {
      const folder = this.make('/Imports', 'dir', 0, Date.now());
      this.put(folder);
    }
    const day = new Date().toISOString().slice(0, 10);
    const stem = `sample-import-${day}`;
    let name = `${stem}.txt`;
    let n = 1;
    while (this.entries.has(`/Imports/${name}`)) name = `${stem}-${n++}.txt`;
    const path = `/Imports/${name}`;
    const text = 'A demo import — device files stay on your device.';
    const entry = this.make(path, 'file', text.length, Date.now());
    this.put(entry);
    this.contents.set(path, text);
    return [entry];
  }
}

export function createMockFs(): FsProvider {
  return new MockFs();
}
