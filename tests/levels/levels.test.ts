import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BotKind } from '../../src/config';
import { dictionaries } from '../../src/i18n';
import { levelContext } from '../../src/content';
import { validateLevel } from '../../src/content/schema';
import {
  CHECK_SEEDS,
  durationRange,
  flowLimit,
  flowRate,
  requiredWins,
  runBot,
  seedBot,
  type LevelData,
} from '../../src/sim';
import { LEVELS_DIR, levelIds, readLevelFile } from '../../scripts/lib/levels';

/**
 * QA-02: every level file is valid (§3.12) and passes T-15: LD-01, LD-02, LD-05, LD-06, LD-07.
 * The bot runs are slow; SKIP_BOTS=1 skips them during quick development (never in verify).
 */
const skipBots = process.env.SKIP_BOTS === '1';
const ids = existsSync(LEVELS_DIR) ? levelIds() : [];

describe('levels', () => {
  it('levels/ has the chapter levels', () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  for (const id of ids) {
    describe(id, () => {
      const raw = readLevelFile(id);
      const level = raw as LevelData;

      it('matches the schema (§3.12) and its file name', () => {
        expect(validateLevel(raw, levelContext)).toEqual([]);
        expect(level.id).toBe(id);
      });

      it('LD-06: has a name up to 22 characters in every language', () => {
        for (const [lang, dict] of Object.entries(dictionaries)) {
          const name = dict[`level.${id}.name`];
          expect(name, `${lang}`).toBeTruthy();
          expect((name ?? '').length, `${lang}: ${name}`).toBeLessThanOrEqual(22);
        }
      });

      it('LD-07: the flow is within the chapter limit', () => {
        expect(flowRate(level)).toBeLessThanOrEqual(flowLimit(level.chapter) + 1e-9);
      });

      it.skipIf(skipBots)('T-15: LD-01, LD-02, LD-05 with bots on 20 seeds', () => {
        const need = requiredWins(id);
        const kinds = new Set<BotKind>([...(Object.keys(need) as BotKind[]), 'normal']);
        for (const kind of kinds) {
          const runs = Array.from({ length: CHECK_SEEDS }, (_, k) =>
            runBot(level, kind, { seed: level.seed + k }),
          );
          const wins = runs.filter((r) => r.won);
          const min = need[kind];
          if (min !== undefined) expect(wins.length, `LD-01 ${kind}`).toBeGreaterThanOrEqual(min);
          if (kind === 'normal') {
            const avg = wins.reduce((a, r) => a + r.seconds, 0) / Math.max(1, wins.length);
            const [lo, hi] = durationRange(id);
            expect(avg, 'LD-02 normal average, s').toBeGreaterThanOrEqual(lo);
            expect(avg, 'LD-02 normal average, s').toBeLessThanOrEqual(hi);
          }
        }
        expect(runBot(level, seedBot(level.chapter)).won, 'LD-05 seed').toBe(true);
      });
    });
  }
});
