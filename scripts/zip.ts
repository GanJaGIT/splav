/** BLD-02: packs dist/ into release/splav-<version>.zip with index.html at the root. */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, type Zippable } from 'fflate';
import { isExcluded, ROOT, zipName } from './build-rules';

const root = fileURLToPath(ROOT);
const dist = join(root, 'dist');
const releaseDir = join(root, 'release');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('zip: dist/index.html not found, run `npm run build` first.');
  process.exit(1);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files: Zippable = {};
let count = 0;
for (const full of walk(dist)) {
  const path = relative(dist, full).split(sep).join('/');
  if (isExcluded(path)) continue;
  files[path] = [readFileSync(full), { level: 9 }];
  count++;
}

mkdirSync(releaseDir, { recursive: true });
const out = join(releaseDir, zipName());
const data = zipSync(files);
writeFileSync(out, data);
console.log(`zip: ${relative(root, out)} — ${count} files, ${(data.length / 1024).toFixed(1)} KB`);
