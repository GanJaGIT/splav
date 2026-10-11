/** Rule constants of §2 and §3. Tunable timings live in src/config.ts (TECH-14). */

import { config } from '../config';

/** GD-20 */
export const MAX_LEVEL = 6;
/** SIM-11, GD-30 */
export const HOLD_MAX_TICKS = config.holdMaxTicks;
/** GD-61 */
export const COMBO_WINDOW_TICKS = config.comboWindowTicks;
/** GD-61: coin multiplier cap. */
export const MAX_MULTIPLIER = 4;
/** GD-62: every 5th combo step freezes the river. */
export const WHIRLPOOL_EVERY = 5;
export const WHIRLPOOL_TICKS = 30;
/** SIM-33: the Dam booster. */
export const DAM_TICKS = 80;
/** GD-80 */
export const MAX_BOOSTERS_PER_LEVEL = 3;
/** GD-52 */
export const CONTINUE_EXTRA_BACKWATER = 3;
/** GD-63 */
export const ORDER_COINS_PER_LEVEL = 10;
export const FIRST_WIN_BASE = 20;
export const FIRST_WIN_PER_STAR = 10;
export const REPEAT_WIN_PER_STAR = 5;
/** CALM-01 */
export const CALM_FACTOR = 1.5;
/** SIM-01: ticks per second. */
export const TICKS_PER_SECOND = 1000 / config.tickMs;
