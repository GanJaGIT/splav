/** Levels for the game build: every levels/c*.json, in play order. Node scripts read files instead. */

import type { LevelData } from '../sim/level';
import dailyFallbackData from '../../levels/daily-fallback.json';

const modules = import.meta.glob<LevelData>('../../levels/c*.json', {
  eager: true,
  import: 'default',
});

export const levels: Record<string, LevelData> = Object.fromEntries(
  Object.values(modules).map((level) => [level.id, level]),
);

/** Chapter, then number: c1-01 … c3-12. */
export const levelOrder: string[] = Object.keys(levels).sort();

/** SIM-71: the daily river when no generated level passes the bot. */
export const dailyFallback = dailyFallbackData as unknown as LevelData;
