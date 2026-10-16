/** BLD-03: checks the release archive against Yandex requirements (п. 1.7, 1.18, 1.21, 1.22). */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import {
  ALLOWED_URL_PREFIXES,
  DEV_MARKERS,
  FORBIDDEN_HOSTS,
  isExcluded,
  MAX_ZIP_BYTES,
  NAME_RE,
  ROOT,
  TEXT_EXT,
  zipName,
} from './build-rules';

const root = fileURLToPath(ROOT);
const zipPath = join(root, 'release', zipName());

if (!existsSync(zipPath)) {
  console.error(`check:build: ${relative(root, zipPath)} not found, run \`npm run zip\` first.`);
  process.exit(1);
}

const zipped = readFileSync(zipPath);
const files = unzipSync(new Uint8Array(zipped));
const paths = Object.keys(files).filter((p) => !p.endsWith('/'));

interface Check {
  name: string;
  problems: string[];
}
const checks: Check[] = [];
const check = (name: string, problems: string[]): void => {
  checks.push({ name, problems });
};

check(
  'index.html in the archive root (п. 1.22)',
  paths.includes('index.html') ? [] : ['no index.html'],
);

check(
  'file names: a-z 0-9 . _ - only (BLD-02)',
  paths.filter((p) => !p.split('/').every((part) => NAME_RE.test(part))),
);

check('no .map, purchases-catalog.json (BLD-02)', paths.filter(isExcluded));

const unpacked = paths.reduce((sum, p) => sum + (files[p]?.length ?? 0), 0);
check(
  `archive ≤ 15 MB (PERF-01): ${(zipped.length / 1024).toFixed(1)} KB packed, ${(unpacked / 1024).toFixed(1)} KB unpacked`,
  zipped.length > MAX_ZIP_BYTES || unpacked > 100 * 1024 * 1024 ? ['too big'] : [],
);

const texts = paths
  .filter((p) => TEXT_EXT.some((ext) => p.endsWith(ext)))
  .map((p) => ({ path: p, text: strFromU8(files[p] ?? new Uint8Array()) }));

const urlProblems: string[] = [];
const hostProblems: string[] = [];
const devProblems: string[] = [];
for (const { path, text } of texts) {
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>\\]*/g)) {
    const url = m[0];
    if (!ALLOWED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      urlProblems.push(`${path}: ${url}`);
    }
  }
  for (const host of FORBIDDEN_HOSTS) {
    if (text.includes(host)) hostProblems.push(`${path}: ${host}`);
  }
  if (path.endsWith('.js')) {
    for (const marker of DEV_MARKERS) {
      if (text.includes(marker)) devProblems.push(`${path}: ${marker}`);
    }
  }
}
check('no http:// and https:// except allowed (TECH-04, п. 8.4)', [...new Set(urlProblems)]);
check('no links to Yandex S3 (п. 1.7)', hostProblems);
check('no dev test hooks and no stand-in ads (DEV-02, YG-13)', devProblems);

const html = texts.find((t) => t.path === 'index.html')?.text ?? '';
const sdkAt = html.search(/<script[^>]*\ssrc="\/sdk\.js"/);
const moduleAt = html.search(/<script[^>]*type="module"/);
check(
  '/sdk.js before the game code in index.html (YG-01)',
  sdkAt < 0
    ? ['no <script src="/sdk.js">']
    : moduleAt >= 0 && moduleAt < sdkAt
      ? ['sdk.js after the game code']
      : [],
);

const absolute = [...html.matchAll(/\s(?:src|href)="(\/[^"]*)"/g)]
  .map((m) => m[1] ?? '')
  .filter((p) => p !== '/sdk.js');
check('relative paths in index.html (BLD-01, п. 1.18)', absolute);

let failed = 0;
for (const c of checks) {
  const ok = c.problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${c.name}`);
  for (const p of c.problems.slice(0, 20)) console.log(`    ${p}`);
  if (c.problems.length > 20) console.log(`    … and ${c.problems.length - 20} more`);
}
console.log(
  `check:build: ${relative(root, zipPath)}, ${paths.length} files — ${failed === 0 ? 'OK' : `${failed} check(s) failed`}`,
);
process.exit(failed === 0 ? 0 : 1);
