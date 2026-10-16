/**
 * §3.10, SIM-70, SIM-71: the daily river — one level a day, the same for every player. The date
 * (YYYY-MM-DD, Moscow) gives the seed; the template (src/content/daily.json) gives the shape.
 * The normal bot checks the result; a level it cannot pass is generated again with the next seed,
 * and after the last try the hand-made fallback level is used.
 */

import { runBot } from './bot';
import { fnv1a } from './hash';
import type { LevelData, LevelObstacle, LevelPier } from './level';
import { randomInt } from './rng';
import type { ItemChain, Order, SpawnWeight } from './types';

export interface DailyTemplate {
  chapter: number;
  lanes: number;
  rows: number;
  stepTicks: number;
  perStep: [number, number];
  weights: SpawnWeight[];
  /** One pier on each bank. */
  piers: number;
  ordersPerPier: number;
  orderChains: ItemChain[];
  /** Lowest and highest order level. */
  orderLevels: [number, number];
  /** Fewest and most rocks in the river. */
  rocks: [number, number];
  residents: string[];
  backwater: number;
  lives: number;
}

/** SIM-71: the normal bot plays this many seeds and has to win this many. */
export const DAILY_CHECK_SEEDS = 5;
export const DAILY_MIN_WINS = 4;
export const DAILY_TRIES = 20;

export interface DailyResult {
  level: LevelData;
  /** How many generated levels were rejected before this one. */
  rejected: number;
  fallback: boolean;
}

export function dailyId(date: string): string {
  return `daily-${date}`;
}

const pick = <T>(s: { rng: number }, list: readonly T[]): T => list[randomInt(s, list.length)] as T;

/** One generated level for the date and seed, not checked yet. */
export function dailyLevel(date: string, t: DailyTemplate, seed: number): LevelData {
  const s = { rng: seed >>> 0 };
  const cols = t.lanes + 2;
  const residents = [...t.residents];
  const piers: LevelPier[] = [];
  for (let i = 0; i < t.piers; i++) {
    const resident = residents.splice(randomInt(s, residents.length), 1)[0] ?? 'fisher';
    const orders: Order[] = [];
    for (let k = 0; k < t.ordersPerPier; k++) {
      const [lo, hi] = t.orderLevels;
      orders.push({ chain: pick(s, t.orderChains), level: lo + randomInt(s, hi - lo + 1) });
    }
    // Banks in turn: left, right, left…; any row but the top and the bottom one.
    piers.push({
      col: i % 2 === 0 ? 0 : cols - 1,
      row: 1 + randomInt(s, t.rows - 2),
      resident,
      orders,
    });
  }
  const [minRocks, maxRocks] = t.rocks;
  const rockCount = minRocks + randomInt(s, maxRocks - minRocks + 1);
  const obstacles: LevelObstacle[] = [];
  const taken = new Set<string>();
  while (obstacles.length < rockCount) {
    // River cells only, not in the top row (items come in there) nor the bottom one.
    const col = 1 + randomInt(s, t.lanes);
    const row = 1 + randomInt(s, t.rows - 2);
    const key = `${col},${row}`;
    if (taken.has(key)) continue;
    taken.add(key);
    obstacles.push({ type: 'rock', col, row });
  }
  return {
    id: dailyId(date),
    chapter: t.chapter,
    lanes: t.lanes,
    rows: t.rows,
    stepTicks: t.stepTicks,
    seed: seed >>> 0,
    waitFirstMerge: false,
    spawn: { perStep: [...t.perStep], weights: t.weights.map((w) => ({ ...w })) },
    initial: [],
    script: [],
    piers,
    obstacles,
    backwater: t.backwater,
    lives: t.lives,
    intro: null,
    gift: null,
  };
}

/** SIM-71: the normal bot wins at least 4 of 5 seeds. */
export function dailyPassesBot(level: LevelData): boolean {
  let wins = 0;
  for (let i = 0; i < DAILY_CHECK_SEEDS; i++) {
    if (runBot(level, 'normal', { seed: level.seed + i }).won) wins++;
    if (wins >= DAILY_MIN_WINS) return true;
    if (wins + (DAILY_CHECK_SEEDS - 1 - i) < DAILY_MIN_WINS) return false;
  }
  return false;
}

/** SIM-70, SIM-71: the level of the day. */
export function generateDaily(date: string, t: DailyTemplate, fallback: LevelData): DailyResult {
  const base = fnv1a(date);
  for (let i = 0; i < DAILY_TRIES; i++) {
    const level = dailyLevel(date, t, (base + i) >>> 0);
    if (dailyPassesBot(level)) return { level, rejected: i, fallback: false };
  }
  return { level: { ...fallback, id: dailyId(date) }, rejected: DAILY_TRIES, fallback: true };
}
