/**
 * Cross-engine parity suite.
 *
 * Loads the real Rust wasm binary and the TypeScript mirror, throws the same
 * corpus at both, and asserts identical results. This is what keeps the two
 * implementations from drifting: if either side changes behaviour, CI fails.
 *
 *   node scripts/test-core.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = resolve(root, 'rust/target/wasm32-unknown-unknown/release/filecore.wasm');
if (!existsSync(wasmPath)) {
  console.error('missing wasm — run `npm run core` first');
  process.exit(1);
}

let pass = 0;
const failures = [];

const check = (name, ok, detail) => {
  if (ok) pass++;
  else failures.push({ name, detail });
};

const eq = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), { a, b });

/* ---------------------------------------------------------- wasm loader -- */
const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), {});
const ex = instance.exports;

function wasmCall(op, payload) {
  const req = new TextEncoder().encode(JSON.stringify({ op, payload }));
  const ptr = ex.fc_alloc(req.length);
  new Uint8Array(ex.memory.buffer, ptr, req.length).set(req);
  const out = ex.fc_invoke(ptr, req.length);
  const len = new DataView(ex.memory.buffer).getUint32(out, true);
  const text = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, out + 4, len));
  ex.fc_free(ptr, req.length);
  const env = JSON.parse(text);
  if (!env.ok) throw new Error(env.error);
  return env.data;
}

/* ------------------------------------------------------- ts engine load -- */
const tmp = mkdtempSync(join(tmpdir(), 'filestack-'));
const bundle = join(tmp, 'fallback.mjs');
execSync(
  `npx --yes esbuild src/core/fallback.ts --bundle --format=esm --platform=neutral --outfile=${bundle} --log-level=warning`,
  { cwd: root, stdio: 'inherit' },
);
const { fallbackCore } = await import(`file://${bundle}`);

/* ------------------------------------------------------------- corpus --- */
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0); // pinned clock -> deterministic
const ago = (d) => NOW - d * DAY;

const E = (path, size, days, kind = 'file', starred = false) => ({
  id: path,
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  kind,
  size,
  mtime: kind === 'dir' ? ago(365) : ago(days),
  starred,
});

const corpus = [
  E('/Documents', 0, 0, 'dir'),
  E('/Photos', 0, 0, 'dir'),
  E('/Photos-backup/fake.jpg', 5, 30),
  E('/Projects', 0, 0, 'dir'),
  E('/Documents/invoice_2024-08.pdf', 284120, 3),
  E('/Documents/invoice_2024-07.pdf', 271004, 34),
  E('/Documents/project-brief.docx', 48900, 1, 'file', true),
  E('/Documents/lease-agreement.pdf', 1842000, 120),
  E('/Documents/notes.md', 3210, 0),
  E('/Documents/猫-photo.jpg', 51200, 7),
  E('/Documents/tax-return-2023.pdf', 4210880, 210),
  E('/Photos/holiday-goa.jpg', 4182004, 12, 'file', true),
  E('/Photos/sunset-kanyakumari.jpg', 2940512, 9),
  E('/Photos/portrait-01.jpg', 1204880, 40),
  E('/Photos/portrait-02.jpg', 1188002, 40),
  E('/Photos/screenshot-2024-09-12.png', 812400, 18),
  E('/Music/track01.mp3', 7118004, 300),
  E('/Music/track02.mp3', 6882120, 300),
  E('/Downloads/backup-2024.zip', 918240000, 21),
  E('/Downloads/receipt-scan.pdf', 284120, 15),
  E('/Downloads/design-assets.tar.gz', 64400000, 45),
  E('/Projects/filestack/App.tsx', 8240, 0),
  E('/Projects/filestack/lib.rs', 22480, 1),
  E('/Projects/filestack/README.md', 5120, 4),
  E('/Projects/portfolio/index.html', 14880, 30),
  E('/Videos/demo.mp4', 184200000, 8),
  E('/Videos/tutorial-rust-wasm.mp4', 320400000, 25),
  // deliberate duplicate pair (same name + size)
  E('/Backup/receipt-scan.pdf', 284120, 90),
];

const QUERIES = [
  '',
  'invoice',
  'INVOICE',
  'inv',
  'invcoie',            // typo / gappy subsequence
  'invoice pdf',
  'type:image',
  'type:image,audio',
  'type:document min:1mb',
  'ext:pdf',
  'ext:mp4,zip',
  'folder:true',
  'folder:false',
  'starred:true',
  'min:100mb',
  'type:code',
  'portrait',
  'rust wasm',
  'zzz-nothing',
  'screenshot 2024',
  'notes.md',
  '猫',
];

const normalise = (res) =>
  res.hits.map((h) => ({
    path: h.entry.path,
    score: h.score,
    on: h.matched_on,
    idx: h.indices,
    cat: h.category,
  }));

console.log('▸ search parity');
for (const q of QUERIES) {
  const req = { entries: corpus, query: q, scope: null, now: NOW };
  const wasmResult = wasmCall('search', req);
  const tsResult = await fallbackCore.search(req);
  eq(`search "${q}"`, normalise(wasmResult), normalise(tsResult));
  eq(`search "${q}" total/filters`,
    [wasmResult.total, wasmResult.filters, wasmResult.query_terms],
    [tsResult.total, tsResult.filters, tsResult.query_terms]);
}

console.log('▸ scoped search parity');
for (const scope of ['/Photos', '/Projects', '/Documents']) {
  const req = { entries: corpus, query: '', scope, now: NOW };
  eq(`scope ${scope}`, normalise(wasmCall('search', req)), normalise(await fallbackCore.search(req)));
}

console.log('▸ sort parity');
for (const key of ['name', 'size', 'modified', 'kind']) {
  for (const descending of [false, true]) {
    for (const dirs_first of [false, true]) {
      const req = { entries: corpus, key, descending, dirs_first };
      const a = wasmCall('sort', req).map((e) => e.path);
      const b = (await fallbackCore.sort(req)).map((e) => e.path);
      eq(`sort ${key} desc=${descending} dirsFirst=${dirs_first}`, a, b);
    }
  }
}

console.log('▸ insights + duplicates parity');
{
  const req = { entries: corpus, largest_limit: 5 };
  const a = wasmCall('insights', req);
  const b = await fallbackCore.insights(req);
  eq('insights', a, b);
  eq('insights totals', [a.files, a.folders, a.total_size], [b.files, b.folders, b.total_size]);
}
{
  const a = wasmCall('duplicates', corpus);
  const b = await fallbackCore.duplicates(corpus);
  eq('duplicates', a, b);
  check('duplicates finds the planted pair', a.length === 1 && a[0].count === 2, a);
}

console.log('▸ size formatting parity');
for (const bytes of [0, 1, 999, 1000, 1400, 284120, 918240000, 1250000000, 3_500_000_000_000]) {
  eq(`formatSize(${bytes})`, wasmCall('formatSize', bytes), await fallbackCore.formatSize(bytes));
}

console.log('▸ wasm hygiene');
{
  const mod = new WebAssembly.Module(readFileSync(wasmPath));
  check('wasm has zero host imports', WebAssembly.Module.imports(mod).length === 0,
    WebAssembly.Module.imports(mod));
  const ping = wasmCall('ping', null);
  check('ping identifies engine', ping.engine === 'filecore' && !!ping.version, ping);
  let threw = false;
  try {
    wasmCall('nope', null);
  } catch {
    threw = true;
  }
  check('unknown op rejects', threw);
}

/* -------------------------------------------------------------- report -- */
const total = pass + failures.length;
if (failures.length) {
  console.error(`\n✗ ${failures.length}/${total} parity checks failed\n`);
  for (const f of failures.slice(0, 8)) {
    console.error(` • ${f.name}`);
    console.error(`   wasm: ${JSON.stringify(f.detail.a).slice(0, 400)}`);
    console.error(`   ts  : ${JSON.stringify(f.detail.b).slice(0, 400)}`);
  }
  process.exit(1);
}
console.log(`\n✓ ${total}/${total} parity checks passed (rust/wasm vs typescript)`);
