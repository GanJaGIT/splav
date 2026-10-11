/** §2.13: level requirements checked by bots and scripts (LD-01, LD-02, LD-05, LD-07). */

import type { BotKind } from '../config';

export const BOT_KINDS: readonly BotKind[] = ['novice', 'normal', 'deft'];

/** LD-01: every check runs on seeds seed … seed + 19. */
export const CHECK_SEEDS = 20;

export type BotWins = Partial<Record<BotKind, number>>;

/** Chapter and number of a level id like "c1-04"; null for other ids. */
export function parseLevelId(id: string): { chapter: number; num: number } | null {
  const m = /^c(\d)-(\d\d)$/.exec(id);
  return m ? { chapter: Number(m[1]), num: Number(m[2]) } : null;
}

/** LD-01: minimal wins out of 20 for each bot. */
export function requiredWins(id: string): BotWins {
  const p = parseLevelId(id);
  if (!p) return { normal: 15 };
  if (p.chapter === 1) return p.num <= 6 ? { novice: 18 } : { novice: 12, normal: 18 };
  if (p.chapter === 2) return { normal: 15, deft: 19 };
  return { normal: 8, deft: 18 };
}

/** LD-07: the flow limit of a chapter, items per second. */
export function flowLimit(chapter: number): number {
  return chapter === 1 ? 0.55 : chapter === 2 ? 0.9 : 0.75;
}

/** LD-02: allowed average duration of the normal bot's wins, seconds. */
export function durationRange(id: string): [number, number] {
  const p = parseLevelId(id);
  if (p && p.chapter === 1 && p.num <= 3) return [0, 90];
  return [90, 240];
}

/** LD-05: the bot whose win makes a seed valid for the level file. */
export function seedBot(chapter: number): BotKind {
  return chapter === 1 ? 'novice' : 'normal';
}
