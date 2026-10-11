/** SIM-24: mulberry32 with its state kept in SimState.rng. */

export function nextRandom(s: { rng: number }): number {
  const a = (s.rng + 0x6d2b79f5) | 0;
  s.rng = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function randomInt(s: { rng: number }, n: number): number {
  return Math.floor(nextRandom(s) * n);
}
