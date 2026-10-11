/**
 * QA-05: npm run verify = typecheck + lint + unit + levels + build + check:build + e2e.
 * Steps run in order and stop at the first failure; a summary is printed at the end.
 */
import { spawnSync } from 'node:child_process';

const steps: [string, string][] = [
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['unit', 'npm run test:unit'],
  ['levels', 'npm run test:levels'],
  ['build', 'npm run build'],
  ['zip', 'npm run zip'],
  ['check:build', 'npm run check:build'],
  ['e2e', 'npm run e2e'],
];

const results: { name: string; ok: boolean; seconds: number }[] = [];
for (const [name, cmd] of steps) {
  console.log(`\n=== verify: ${name} — ${cmd}`);
  const started = Date.now();
  const res = spawnSync(cmd, { stdio: 'inherit', shell: true });
  const ok = res.status === 0;
  results.push({ name, ok, seconds: (Date.now() - started) / 1000 });
  if (!ok) break;
}

console.log('\n=== verify: summary');
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(12)} ${r.seconds.toFixed(1)} s`);
}
const skipped = steps.slice(results.length).map(([name]) => name);
if (skipped.length) console.log(`  skipped: ${skipped.join(', ')}`);
const green = results.length === steps.length && results.every((r) => r.ok);
console.log(green ? 'verify: GREEN' : 'verify: RED');
process.exit(green ? 0 : 1);
