/** TECH-14: feature flags and constants. Pure data: also imported by src/sim and scripts. */

export const BOOSTER_IDS = ['dam', 'hook', 'joker', 'net'] as const;
export type BoosterId = (typeof BOOSTER_IDS)[number];

export type BotKind = 'novice' | 'normal' | 'deft';

export interface GameConfig {
  features: {
    /** YG-14: in-app purchases. Enable when the console says purchases are connected. */
    iap: boolean;
    /** AN-01: Yandex Metrica. */
    metrica: boolean;
  };
  metricaId: number;
  /** YG-10: interstitials start after this level (c1-06). */
  adsFromLevel: number;
  /** YG-10: minimum gap between interstitials, game-clock seconds. */
  interstitialMinGapSec: number;
  /** SIM-01: one simulation tick, ms. */
  tickMs: number;
  /** SIM-02: ticks per frame at most; the rest are dropped. */
  maxTicksPerFrame: number;
  /** GD-30, SIM-11: how long an item can be held, ticks. */
  holdMaxTicks: number;
  /** GD-61: merges closer than this keep the combo, ticks. */
  comboWindowTicks: number;
  /** BOT-01: ticks between drops for each bot. */
  bots: Record<BotKind, number>;
  /** Boosters a new player starts with. */
  startBoosters: Record<BoosterId, number>;
}

export const config: GameConfig = {
  features: {
    iap: false,
    metrica: false,
  },
  metricaId: 0,
  adsFromLevel: 6,
  interstitialMinGapSec: 180,
  tickMs: 100,
  maxTicksPerFrame: 5,
  holdMaxTicks: 30,
  comboWindowTicks: 20,
  bots: { novice: 25, normal: 18, deft: 12 },
  startBoosters: { dam: 0, hook: 0, joker: 0, net: 0 },
};
