import { describe, expect, it } from 'vitest';
import { levelContext } from '../../src/content';
import dailyTemplate from '../../src/content/daily.json';
import { validateLevel } from '../../src/content/schema';
import {
  CHECK_SEEDS,
  DAILY_CHECK_SEEDS,
  DAILY_MIN_WINS,
  dailyLevel,
  flowLimit,
  flowRate,
  generateDaily,
  runBot,
  type DailyTemplate,
  type LevelData,
} from '../../src/sim';
import { readLevelFile } from '../../scripts/lib/levels';

/** T-18: the daily river generator (SIM-70, SIM-71) and its fallback level. */
const template = dailyTemplate as DailyTemplate;
const fallback = readLevelFile('daily-fallback') as LevelData;
const skipBots = process.env.SKIP_BOTS === '1';

/** 60 dates spread over two years, the same every run. */
const DATES = Array.from({ length: 60 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 1) + (i * 12 + (i % 7)) * 86_400_000);
  return d.toISOString().slice(0, 10);
});

const wins = (level: LevelData, seeds: number): number =>
  Array.from({ length: seeds }, (_, i) => runBot(level, 'normal', { seed: level.seed + i })).filter(
    (r) => r.won,
  ).length;

describe('daily river (T-18)', () => {
  it('SIM-70: one date gives one level; other dates give other levels', () => {
    const a = dailyLevel('2026-10-16', template, 42);
    expect(dailyLevel('2026-10-16', template, 42)).toEqual(a);
    expect(a.id).toBe('daily-2026-10-16');
    expect(dailyLevel('2026-10-17', template, 43)).not.toEqual(a);
  });

  it('SIM-70: generated levels follow the template and the level schema', () => {
    for (const date of DATES) {
      for (let seed = 0; seed < 5; seed++) {
        const level = dailyLevel(date, template, seed * 7919 + date.length);
        expect(validateLevel(level, levelContext), date).toEqual([]);
        expect([level.lanes, level.rows, level.stepTicks]).toEqual([5, 8, 18]);
        expect(level.piers).toHaveLength(2);
        for (const p of level.piers) {
          expect(p.orders).toHaveLength(3);
          for (const o of p.orders) expect(o.level).toBeGreaterThanOrEqual(3);
          for (const o of p.orders) expect(o.level).toBeLessThanOrEqual(5);
        }
        expect(level.obstacles.length).toBeLessThanOrEqual(3);
        for (const r of level.obstacles) {
          expect(r.row).toBeGreaterThan(0);
          expect(r.row).toBeLessThan(level.rows - 1);
        }
        expect(flowRate(level)).toBeLessThanOrEqual(flowLimit(2));
      }
    }
  });

  it('the fallback level is valid and LD-01 for «Река дня»: the normal bot wins ≥ 15 of 20', () => {
    expect(validateLevel(fallback, levelContext)).toEqual([]);
    expect(flowRate(fallback)).toBeLessThanOrEqual(flowLimit(2));
    if (!skipBots) expect(wins(fallback, CHECK_SEEDS)).toBeGreaterThanOrEqual(15);
  });

  it.skipIf(skipBots)(
    'T-18: 60 dates — the same level twice, each passes SIM-71 and LD-07',
    () => {
      let fallbacks = 0;
      for (const date of DATES) {
        const day = generateDaily(date, template, fallback);
        expect(generateDaily(date, template, fallback)).toEqual(day);
        expect(day.level.id).toBe(`daily-${date}`);
        expect(flowRate(day.level)).toBeLessThanOrEqual(flowLimit(2));
        if (day.fallback) fallbacks++;
        else
          expect(wins(day.level, DAILY_CHECK_SEEDS), date).toBeGreaterThanOrEqual(DAILY_MIN_WINS);
      }
      // The fallback is the exception, not the rule.
      expect(fallbacks).toBeLessThanOrEqual(1);
    },
    600_000,
  );
});
