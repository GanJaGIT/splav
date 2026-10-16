/** DAY-01, DAY-03: days count from 1 January 2026 by Moscow time (UTC+3). */

const MOSCOW_OFFSET_MS = 3 * 3600 * 1000;
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 3600 * 1000;

export function dayIndex(serverTimeMs: number): number {
  return Math.floor((serverTimeMs + MOSCOW_OFFSET_MS - EPOCH) / DAY_MS);
}

/** DAY-01: the date of the daily river, YYYY-MM-DD in Moscow. */
export function moscowDate(serverTimeMs: number): string {
  return new Date(serverTimeMs + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}
