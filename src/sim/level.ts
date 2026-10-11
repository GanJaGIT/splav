/** §3.12: level file format (levels/<id>.json). */

import type { BoosterId } from '../config';
import { TICKS_PER_SECOND } from './constants';
import type { ItemChain, Order, ScriptEntry, SpawnWeight } from './types';

export interface LevelItem {
  col: number;
  row: number;
  chain: ItemChain;
  level: number;
}

export interface LevelPier {
  col: number;
  row: number;
  resident: string;
  orders: Order[];
}

export interface LevelObstacle {
  type: 'rock' | 'snag';
  col: number;
  row: number;
}

export interface LevelData {
  id: string;
  chapter: number;
  lanes: number;
  rows: number;
  stepTicks: number;
  seed: number;
  waitFirstMerge: boolean;
  spawn: {
    perStep: [number, number];
    weights: SpawnWeight[];
  };
  initial: LevelItem[];
  script: ScriptEntry[];
  piers: LevelPier[];
  obstacles: LevelObstacle[];
  backwater: number;
  lives: number;
  /** TUT-02: what the "New" card introduces, or null. */
  intro: string | null;
  gift: { booster: BoosterId; count: number } | null;
}

/** LD-07: average new items per second. */
export function flowRate(level: Pick<LevelData, 'stepTicks' | 'spawn'>): number {
  const [min, max] = level.spawn.perStep;
  return (min + max) / 2 / (level.stepTicks / TICKS_PER_SECOND);
}
