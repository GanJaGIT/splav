import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * QA-02: level files. Stage 0 checks only that they parse and are named by id; the schema
 * (§3.12) and T-15 bot checks arrive with Stage 1.
 */
const LEVELS = fileURLToPath(new URL('../../levels', import.meta.url));

describe('levels', () => {
  it('levels/ exists', () => {
    expect(existsSync(LEVELS)).toBe(true);
  });

  const files = existsSync(LEVELS) ? readdirSync(LEVELS).filter((f) => f.endsWith('.json')) : [];
  for (const file of files) {
    it(`${file} parses and its id matches the file name`, () => {
      const level = JSON.parse(readFileSync(join(LEVELS, file), 'utf8')) as { id?: string };
      expect(level.id).toBe(file.replace(/\.json$/, ''));
    });
  }
});
