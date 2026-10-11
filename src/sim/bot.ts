/**
 * §3.8: the bot plays a level through the same actions as the player. It checks levels (LD-01,
 * LD-05), the balance (VIL-03), the "River of the day" generator and records video (§9).
 */

import { config, type BotKind } from '../config';
import { MAX_LEVEL, TICKS_PER_SECOND } from './constants';
import type { LevelData } from './level';
import {
  cellAt,
  createState,
  currentOrder,
  isBank,
  levelResult,
  mergeResult,
  step,
  type SimOptions,
} from './simulation';
import type { Action, CellRef, Item, Ref, SimState, Status } from './types';

interface Located {
  ref: Ref;
  item: Item;
  /** Row of the item; the backwater counts as `rows` (BOT-02). */
  urgency: number;
  bank: boolean;
}

type Plan =
  | { kind: 'deliver'; pierId: number }
  | { kind: 'merge'; targetId: number }
  | { kind: 'rescue'; to: CellRef };

export interface Decision {
  grab: Ref;
  plan: Plan;
}

function locateItems(s: SimState): Located[] {
  const out: Located[] = [];
  for (let row = 0; row < s.rows; row++) {
    for (let col = 0; col < s.cols; col++) {
      const cell = s.grid[row * s.cols + col];
      if (cell?.kind === 'item') {
        out.push({
          ref: { at: 'cell', col, row },
          item: cell.item,
          urgency: row,
          bank: isBank(s, col),
        });
      }
    }
  }
  s.backwater.forEach((item, slot) => {
    if (item) out.push({ ref: { at: 'backwater', slot }, item, urgency: s.rows, bank: false });
  });
  return out;
}

/** An item of this chain is still needed one level higher by some order (BOT-02, rescue). */
function neededLater(s: SimState, item: Item): boolean {
  return s.piers.some((p) =>
    p.orders.slice(p.done).some((o) => o.chain === item.chain && o.level > item.level),
  );
}

/** The free bank cell closest to (col, row); ties go to the left bank, then the upper cell. */
function nearestFreeBank(s: SimState, col: number, row: number): CellRef | null {
  let best: CellRef | null = null;
  let bestDist = Infinity;
  for (const bc of [0, s.cols - 1]) {
    for (let r = 0; r < s.rows; r++) {
      if (cellAt(s, bc, r)?.kind !== 'empty') continue;
      const dist = Math.abs(bc - col) + Math.abs(r - row);
      if (dist < bestDist) {
        bestDist = dist;
        best = { at: 'cell', col: bc, row: r };
      }
    }
  }
  return best;
}

/** BOT-02: what to take and where to put it, or null to wait. */
export function decide(s: SimState): Decision | null {
  if (s.status !== 'playing' || s.hand) return null;
  const items = locateItems(s);

  // 1. Delivery: any item matching a pier's current order, the most urgent first.
  let deliver: { from: Located; pierId: number } | null = null;
  for (const p of s.piers) {
    const order = currentOrder(s, p.id);
    if (!order) continue;
    for (const it of items) {
      if (it.item.chain !== order.chain || it.item.level !== order.level) continue;
      if (!deliver || it.urgency > deliver.from.urgency) deliver = { from: it, pierId: p.id };
    }
  }
  if (deliver) return { grab: deliver.from.ref, plan: { kind: 'deliver', pierId: deliver.pierId } };

  // 2. Merge: the pair with the best level × 10 + urgency; the lower item goes onto the upper one.
  let merge: { low: Located; high: Located; score: number } | null = null;
  for (let i = 0; i < items.length; i++) {
    const a = items[i] as Located;
    if (a.item.chain === 'joker' || a.item.level >= MAX_LEVEL) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j] as Located;
      if (b.item.chain !== a.item.chain || b.item.level !== a.item.level) continue;
      // On the same row the river item goes onto the bank one: the bank does not flow.
      const bLower = b.urgency > a.urgency || (b.urgency === a.urgency && a.bank && !b.bank);
      const low = bLower ? b : a;
      const high = bLower ? a : b;
      if (high.ref.at === 'backwater') continue;
      const score = a.item.level * 10 + low.urgency;
      if (!merge || score > merge.score) merge = { low, high, score };
    }
  }
  if (merge) return { grab: merge.low.ref, plan: { kind: 'merge', targetId: merge.high.item.id } };

  // 3. Rescue: an unpaired item in the bottom row that orders still need goes to the bank.
  const last = s.rows - 1;
  for (let col = 1; col < s.cols - 1; col++) {
    const cell = cellAt(s, col, last);
    if (cell?.kind !== 'item' || !neededLater(s, cell.item)) continue;
    const to = nearestFreeBank(s, col, last);
    if (to) return { grab: { at: 'cell', col, row: last }, plan: { kind: 'rescue', to } };
  }

  // 4. Wait.
  return null;
}

function findOnField(s: SimState, id: number): CellRef | null {
  for (let i = 0; i < s.grid.length; i++) {
    const cell = s.grid[i];
    if (cell?.kind === 'item' && cell.item.id === id) {
      return { at: 'cell', col: i % s.cols, row: Math.floor(i / s.cols) };
    }
  }
  return null;
}

function pierCell(s: SimState, pierId: number): CellRef | null {
  const p = s.piers[pierId];
  return p ? { at: 'cell', col: p.col, row: p.row } : null;
}

/** Where the held item goes now: the flow may have moved the target since the grab. */
function resolveDrop(s: SimState, plan: Plan, item: Item): Action {
  if (plan.kind === 'deliver') {
    const order = currentOrder(s, plan.pierId);
    const at = pierCell(s, plan.pierId);
    if (order && at && order.chain === item.chain && order.level === item.level) {
      return { type: 'drop', ref: at };
    }
  } else if (plan.kind === 'merge') {
    const at = findOnField(s, plan.targetId);
    if (at) return { type: 'drop', ref: at };
  } else {
    if (cellAt(s, plan.to.col, plan.to.row)?.kind === 'empty')
      return { type: 'drop', ref: plan.to };
    const at = nearestFreeBank(s, plan.to.col, plan.to.row);
    if (at) return { type: 'drop', ref: at };
  }
  // Fallback: any pier that wants it, then any item on the field it merges with.
  for (const p of s.piers) {
    const order = currentOrder(s, p.id);
    if (order && order.chain === item.chain && order.level === item.level) {
      return { type: 'drop', ref: { at: 'cell', col: p.col, row: p.row } };
    }
  }
  for (let i = 0; i < s.grid.length; i++) {
    const cell = s.grid[i];
    if (cell?.kind === 'item' && mergeResult(item, cell.item)) {
      return { type: 'drop', ref: { at: 'cell', col: i % s.cols, row: Math.floor(i / s.cols) } };
    }
  }
  return { type: 'cancel' };
}

/**
 * BOT-01: one drop at most every `delay` ticks; grab and drop happen in adjacent ticks.
 * BOT-03: no boosters and no continue.
 */
export class Bot {
  private plan: Plan | null = null;
  private nextGrabTick = 0;

  constructor(readonly delay: number) {}

  /** Actions for the coming tick; call right before `step(state, actions)`. */
  next(s: SimState): Action[] {
    if (s.status !== 'playing') {
      this.plan = null;
      return [];
    }
    if (s.hand) {
      const action = this.plan
        ? resolveDrop(s, this.plan, s.hand.item)
        : { type: 'cancel' as const };
      this.plan = null;
      this.nextGrabTick = s.tick + this.delay - 1;
      return [action];
    }
    this.plan = null;
    if (s.tick < this.nextGrabTick) return [];
    const d = decide(s);
    if (!d) return [];
    this.plan = d.plan;
    return [{ type: 'grab', ref: d.grab }];
  }
}

export function botDelay(kind: BotKind): number {
  return config.bots[kind];
}

export interface BotRun {
  seed: number;
  status: Status | 'timeout';
  won: boolean;
  lost: number;
  ticks: number;
  seconds: number;
  /** Coins a first win would pay (GD-63), or half the level coins on a loss. */
  coins: number;
  merges: number;
  maxCombo: number;
  deliveries: number;
}

/** A level is cut off after 20 minutes of game time. */
export const BOT_MAX_TICKS = 20 * 60 * TICKS_PER_SECOND;

export function runBot(
  level: LevelData,
  kind: BotKind | number,
  opts: SimOptions & { maxTicks?: number } = {},
): BotRun {
  const delay = typeof kind === 'number' ? kind : botDelay(kind);
  const seed = opts.seed ?? level.seed;
  const s = createState(level, { ...opts, seed });
  const bot = new Bot(delay);
  const maxTicks = opts.maxTicks ?? BOT_MAX_TICKS;
  while (s.status === 'playing' && s.tick < maxTicks) step(s, bot.next(s));
  const result = levelResult(s, true);
  return {
    seed,
    status: s.status === 'playing' ? 'timeout' : s.status,
    won: s.status === 'won',
    lost: s.lost,
    ticks: s.tick,
    seconds: s.tick / TICKS_PER_SECOND,
    coins: result.coins,
    merges: s.stats.merges,
    maxCombo: s.stats.maxCombo,
    deliveries: s.stats.deliveries,
  };
}
