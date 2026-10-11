/** Reads and validates levels/<id>.json for Node scripts (import.meta.glob is Vite-only). */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { levelContext } from '../../src/content';
import { validateLevel } from '../../src/content/schema';
import type { LevelData } from '../../src/sim';

export const LEVELS_DIR = fileURLToPath(new URL('../../levels', import.meta.url));

/** Chapter levels in play order (c1-01 …). */
export function levelIds(): string[] {
  return readdirSync(LEVELS_DIR)
    .filter((f) => /^c\d-\d\d\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export function readLevelFile(id: string): unknown {
  const path = join(LEVELS_DIR, `${id}.json`);
  if (!existsSync(path)) throw new Error(`no file ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Throws with the list of problems when the level is invalid. */
export function loadLevel(id: string): LevelData {
  const raw = readLevelFile(id);
  const problems = validateLevel(raw, levelContext);
  if (problems.length > 0) throw new Error(`level ${id}:\n  ${problems.join('\n  ')}`);
  return raw as LevelData;
}
