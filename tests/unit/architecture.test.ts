import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Rules from CLAUDE.md «Архитектура» and §6.2 that are easy to break silently. */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sources = walk(SRC)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({
    path: relative(ROOT, f).split(sep).join('/'),
    text: readFileSync(f, 'utf8'),
  }));

const offenders = (re: RegExp, files = sources): string[] =>
  files.filter((f) => re.test(f.text)).map((f) => f.path);

describe('architecture', () => {
  it('finds the sources', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('TECH-12: no Cyrillic in src/**/*.ts — texts live in src/i18n/*.json', () => {
    expect(offenders(/[Ѐ-ӿ]/)).toEqual([]);
  });

  it('TECH-11: YaGames and ysdk only in src/platform', () => {
    const outside = sources.filter((f) => !f.path.startsWith('src/platform/'));
    expect(offenders(/\b(?:YaGames|ysdk)\b/, outside)).toEqual([]);
  });

  it('TECH-10, SIM-24: src/sim is pure and deterministic', () => {
    const sim = sources.filter((f) => f.path.startsWith('src/sim/'));
    expect(offenders(/Math\.random|\bDate\b|\bwindow\b|\bdocument\b/, sim)).toEqual([]);
    expect(offenders(/from\s+['"](?:phaser|[./]+\/(?:platform|ui|game|services)\b)/, sim)).toEqual(
      [],
    );
  });

  it('UI-09: no alert, confirm, prompt or new tabs', () => {
    expect(offenders(/\b(?:alert|confirm|prompt)\s*\(|window\.open\s*\(/)).toEqual([]);
  });

  it('INP-05: keyboard by event.code only', () => {
    expect(offenders(/\b(?:e|ev|evt|event|key(?:board)?Event)\.key\b/)).toEqual([]);
  });

  it('TECH-04: no absolute URLs in the game code', () => {
    expect(offenders(/https?:\/\//)).toEqual([]);
  });
});
