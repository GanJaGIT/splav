/**
 * §3: the river simulation. `step(state, actions)` performs exactly one tick (SIM-10…SIM-13) and
 * mutates the state in place; the interface, the bot and tests change the game only by actions.
 */

import type { BoosterId } from '../config';
import {
  CALM_FACTOR,
  COMBO_WINDOW_TICKS,
  CONTINUE_EXTRA_BACKWATER,
  DAM_TICKS,
  FIRST_WIN_BASE,
  FIRST_WIN_PER_STAR,
  HOLD_MAX_TICKS,
  MAX_BOOSTERS_PER_LEVEL,
  MAX_LEVEL,
  MAX_MULTIPLIER,
  ORDER_COINS_PER_LEVEL,
  REPEAT_WIN_PER_STAR,
  WHIRLPOOL_EVERY,
  WHIRLPOOL_TICKS,
} from './constants';
import type { LevelData } from './level';
import { nextRandom, randomInt } from './rng';
import type { Action, Cell, CellRef, Chain, Item, ReturnReason, Ref, SimState } from './types';

export interface SimOptions {
  /** Default: the level's seed. Bot checks use seed … seed + 19 (LD-05). */
  seed?: number;
  /** CALM-01: the flow step is 1.5 times longer, rounded up. */
  calm?: boolean;
  /** Backwater slots instead of the level's (VIL-02, the Shed). */
  backwater?: number;
}

/** Cells are replaced, never mutated, so the empty cell can be shared. */
const EMPTY: Cell = { kind: 'empty' };

/** SIM-32: neighbour order — below, left, right, above. */
const NEIGHBOURS: readonly [number, number][] = [
  [0, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
];

export function createState(level: LevelData, opts: SimOptions = {}): SimState {
  const cols = level.lanes + 2;
  const rows = level.rows;
  const grid: Cell[] = new Array<Cell>(cols * rows).fill(EMPTY);
  for (const o of level.obstacles) {
    grid[o.row * cols + o.col] = o.type === 'rock' ? { kind: 'rock' } : { kind: 'snag' };
  }
  const piers = level.piers.map((p, id) => {
    grid[p.row * cols + p.col] = { kind: 'pier', pierId: id };
    return {
      id,
      col: p.col,
      row: p.row,
      resident: p.resident,
      orders: p.orders.map((o) => ({ chain: o.chain, level: o.level })),
      done: 0,
    };
  });
  let nextItemId = 1;
  for (const it of level.initial) {
    grid[it.row * cols + it.col] = {
      kind: 'item',
      item: { id: nextItemId++, chain: it.chain, level: it.level },
    };
  }
  const backwaterCap = opts.backwater ?? level.backwater;
  return {
    tick: 0,
    status: 'playing',
    cols,
    rows,
    grid,
    backwater: new Array<Item | null>(backwaterCap).fill(null),
    backwaterCap,
    hand: null,
    piers,
    lost: 0,
    lives: level.lives,
    continued: false,
    stepCounter: 0,
    freezeTicks: 0,
    flowStarted: !level.waitFirstMerge,
    combo: 0,
    lastMergeTick: -1,
    coins: 0,
    boostersUsed: 0,
    rng: (opts.seed ?? level.seed) >>> 0,
    nextItemId,
    stepIndex: 0,
    events: [],
    cfg: {
      stepTicks: opts.calm ? Math.ceil(level.stepTicks * CALM_FACTOR) : level.stepTicks,
      perStep: [level.spawn.perStep[0], level.spawn.perStep[1]],
      weights: level.spawn.weights.map((w) => ({ chain: w.chain, level: w.level, w: w.w })),
      script: level.script.map((e) => ({ ...e })),
      waitFirstMerge: level.waitFirstMerge,
    },
    stats: { merges: 0, maxCombo: 0, deliveries: 0, mergeCoins: 0, orderCoins: 0, boosters: 0 },
  };
}

// ---------------------------------------------------------------------------------------------
// Queries

export function inBounds(s: SimState, col: number, row: number): boolean {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    row >= 0 &&
    col < s.cols &&
    row < s.rows
  );
}

export function isBank(s: SimState, col: number): boolean {
  return col === 0 || col === s.cols - 1;
}

export function cellAt(s: SimState, col: number, row: number): Cell | null {
  return inBounds(s, col, row) ? (s.grid[row * s.cols + col] as Cell) : null;
}

/** The item at a cell or backwater slot, if any. */
export function itemAt(s: SimState, ref: Ref): Item | null {
  if (ref.at === 'backwater') return s.backwater[ref.slot] ?? null;
  const cell = cellAt(s, ref.col, ref.row);
  return cell?.kind === 'item' ? cell.item : null;
}

/** The order a pier waits for now, or null when its queue is done. */
export function currentOrder(s: SimState, pierId: number): { chain: Chain; level: number } | null {
  const pier = s.piers[pierId];
  return pier?.orders[pier.done] ?? null;
}

/** GD-20, GD-22: what two items merge into, or null. `moving` is dropped onto `target`. */
export function mergeResult(moving: Item, target: Item): { chain: Chain; level: number } | null {
  if (moving.chain === 'joker' && target.chain === 'joker') return null;
  if (moving.chain === 'joker') {
    return target.level < MAX_LEVEL ? { chain: target.chain, level: target.level + 1 } : null;
  }
  if (target.chain === 'joker') {
    return moving.level < MAX_LEVEL ? { chain: moving.chain, level: moving.level + 1 } : null;
  }
  if (moving.chain === target.chain && moving.level === target.level && moving.level < MAX_LEVEL) {
    return { chain: moving.chain, level: moving.level + 1 };
  }
  return null;
}

/** SIM-51: ticks until the next flow step, counting the tick it happens in. */
export function timeToNextStep(s: SimState): number {
  if (s.status !== 'playing' || !s.flowStarted) return Infinity;
  return s.freezeTicks + (s.cfg.stepTicks - s.stepCounter);
}

export interface LevelResult {
  won: boolean;
  stars: number;
  /** Coins paid to the player (GD-63). */
  coins: number;
  /** Merges and orders, before halving or the bonus. */
  levelCoins: number;
  /** Completion bonus included in `coins`. */
  bonus: number;
}

/** GD-05, GD-63: stars and coins at the end of an attempt. */
export function levelResult(s: SimState, firstWin: boolean): LevelResult {
  if (s.status !== 'won') {
    return { won: false, stars: 0, coins: Math.floor(s.coins / 2), levelCoins: s.coins, bonus: 0 };
  }
  const stars = Math.max(1, Math.min(3, 3 - s.lost));
  const bonus = firstWin
    ? FIRST_WIN_BASE + FIRST_WIN_PER_STAR * stars
    : REPEAT_WIN_PER_STAR * stars;
  return { won: true, stars, coins: s.coins + bonus, levelCoins: s.coins, bonus };
}

// ---------------------------------------------------------------------------------------------
// The tick

/** SIM-10…SIM-13: one tick. Returns the same (mutated) state. */
export function step(s: SimState, actions: readonly Action[] = []): SimState {
  s.events = [];
  for (const a of actions) applyAction(s, a);
  if (s.status !== 'playing') return s;

  // SIM-11
  if (s.hand) {
    s.hand.heldTicks += 1;
    if (s.hand.heldTicks > HOLD_MAX_TICKS) returnHand(s, 'timeout');
  }

  // SIM-12
  if (s.freezeTicks > 0) {
    s.freezeTicks -= 1;
  } else if (s.flowStarted) {
    s.stepCounter += 1;
    if (s.stepCounter >= s.cfg.stepTicks) {
      flowStep(s);
      s.stepCounter = 0;
    }
  }

  // SIM-13
  if (s.piers.every((p) => p.done >= p.orders.length)) {
    s.status = 'won';
    s.events.push({ type: 'won' });
  } else if (s.lost >= s.lives) {
    s.status = 'lost';
    s.events.push({ type: 'lost-level' });
  }
  s.tick += 1;
  return s;
}

function applyAction(s: SimState, a: Action): void {
  if (s.status !== 'playing') {
    if (a.type === 'continue' && s.status === 'lost' && !s.continued) continueAttempt(s);
    else invalid(s, a);
    return;
  }
  switch (a.type) {
    case 'grab':
      grab(s, a.ref);
      return;
    case 'drop':
      drop(s, a.ref);
      return;
    case 'cancel':
      if (s.hand) returnHand(s, 'cancel');
      else invalid(s, a);
      return;
    case 'booster':
      useBooster(s, a.id, a.target);
      return;
    case 'continue':
      invalid(s, a);
      return;
  }
}

function invalid(s: SimState, a: Pick<Action, 'type'>): void {
  s.events.push({ type: 'invalid', action: a.type });
}

function newItem(s: SimState, chain: Chain, level: number): Item {
  return { id: s.nextItemId++, chain, level };
}

function validSlot(s: SimState, slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < s.backwaterCap;
}

function copyRef(ref: Ref): Ref {
  return ref.at === 'cell'
    ? { at: 'cell', col: ref.col, row: ref.row }
    : { at: 'backwater', slot: ref.slot };
}

// SIM-30
function grab(s: SimState, ref: Ref): void {
  if (s.hand) return invalid(s, { type: 'grab' });
  let item: Item | null = null;
  if (ref.at === 'cell') {
    const cell = cellAt(s, ref.col, ref.row);
    if (cell?.kind === 'item') {
      item = cell.item;
      s.grid[ref.row * s.cols + ref.col] = EMPTY;
    }
  } else if (validSlot(s, ref.slot)) {
    item = s.backwater[ref.slot] ?? null;
    if (item) s.backwater[ref.slot] = null;
  }
  if (!item) return invalid(s, { type: 'grab' });
  const from = copyRef(ref);
  s.hand = { item, from, heldTicks: 0 };
  s.events.push({ type: 'grab', id: item.id, from });
}

// SIM-31
function drop(s: SimState, ref: Ref | null): void {
  const hand = s.hand;
  if (!hand) return invalid(s, { type: 'drop' });
  // Outside the field and onto the backwater — the item goes back (GD-31).
  if (!ref || ref.at !== 'cell' || !inBounds(s, ref.col, ref.row)) {
    return returnHand(s, 'drop');
  }
  const from = hand.from;
  if (from.at === 'cell' && from.col === ref.col && from.row === ref.row) {
    return returnHand(s, 'drop');
  }
  const i = ref.row * s.cols + ref.col;
  const cell = s.grid[i] as Cell;
  const to: CellRef = { at: 'cell', col: ref.col, row: ref.row };

  if (cell.kind === 'item') {
    const result = mergeResult(hand.item, cell.item);
    if (!result) return returnHand(s, 'drop');
    s.hand = null;
    const item = newItem(s, result.chain, result.level);
    s.grid[i] = { kind: 'item', item };
    afterMerge(s, hand.item.id, cell.item.id, item, from, to, false);
    cascade(s, ref.col, ref.row);
    return;
  }
  if (cell.kind === 'pier') {
    const order = currentOrder(s, cell.pierId);
    if (!order || order.chain !== hand.item.chain || order.level !== hand.item.level) {
      return returnHand(s, 'drop');
    }
    s.hand = null;
    const pier = s.piers[cell.pierId];
    if (pier) pier.done += 1;
    const coins = ORDER_COINS_PER_LEVEL * hand.item.level;
    s.coins += coins;
    s.stats.orderCoins += coins;
    s.stats.deliveries += 1;
    s.events.push({
      type: 'deliver',
      id: hand.item.id,
      chain: hand.item.chain,
      level: hand.item.level,
      pierId: cell.pierId,
      from,
      coins,
    });
    return;
  }
  if (cell.kind === 'empty') {
    s.hand = null;
    s.grid[i] = { kind: 'item', item: hand.item };
    s.events.push({ type: 'place', id: hand.item.id, from, to });
    return;
  }
  returnHand(s, 'drop');
}

/** GD-60, SIM-32: merges the result with equal neighbours until there is no pair. */
function cascade(s: SimState, col: number, row: number): void {
  const at = row * s.cols + col;
  const to: CellRef = { at: 'cell', col, row };
  for (;;) {
    const cur = s.grid[at] as Cell;
    if (cur.kind !== 'item' || cur.item.level >= MAX_LEVEL || cur.item.chain === 'joker') return;
    let merged = false;
    for (const [dc, dr] of NEIGHBOURS) {
      const c = col + dc;
      const r = row + dr;
      const n = cellAt(s, c, r);
      if (
        n?.kind !== 'item' ||
        n.item.chain !== cur.item.chain ||
        n.item.level !== cur.item.level
      ) {
        continue;
      }
      s.grid[r * s.cols + c] = EMPTY;
      const item = newItem(s, cur.item.chain, cur.item.level + 1);
      s.grid[at] = { kind: 'item', item };
      afterMerge(s, n.item.id, cur.item.id, item, { at: 'cell', col: c, row: r }, to, true);
      merged = true;
      break;
    }
    if (!merged) return;
  }
}

/** SIM-32: combo (GD-61), coins (GD-63), snags (GD-71), whirlpool (GD-62), flow start (SIM-12). */
function afterMerge(
  s: SimState,
  fromId: number,
  toId: number,
  item: Item,
  from: Ref,
  to: CellRef,
  isCascade: boolean,
): void {
  s.combo = s.combo > 0 && s.tick - s.lastMergeTick < COMBO_WINDOW_TICKS ? s.combo + 1 : 1;
  s.lastMergeTick = s.tick;
  const coins = item.level * Math.min(s.combo, MAX_MULTIPLIER);
  s.coins += coins;
  s.stats.mergeCoins += coins;
  s.stats.merges += 1;
  s.stats.maxCombo = Math.max(s.stats.maxCombo, s.combo);
  s.events.push({
    type: 'merge',
    fromId,
    toId,
    id: item.id,
    chain: item.chain,
    level: item.level,
    from,
    to,
    cascade: isCascade,
    combo: s.combo,
    coins,
  });
  for (const [dc, dr] of NEIGHBOURS) {
    const c = to.col + dc;
    const r = to.row + dr;
    if (cellAt(s, c, r)?.kind === 'snag') {
      s.grid[r * s.cols + c] = EMPTY;
      s.events.push({ type: 'snagRemoved', col: c, row: r });
    }
  }
  if (s.combo % WHIRLPOOL_EVERY === 0) {
    s.freezeTicks = Math.max(s.freezeTicks, WHIRLPOOL_TICKS);
    s.events.push({ type: 'whirlpool', combo: s.combo });
  }
  s.flowStarted = true;
}

/** First free backwater slot, or -1. */
function freeSlot(s: SimState): number {
  for (let i = 0; i < s.backwaterCap; i++) if (s.backwater[i] === null) return i;
  return -1;
}

/** GD-50: a lost item; `lost` never exceeds `lives` (SIM-41). */
function loseItem(s: SimState, item: Item, from: Ref): void {
  if (s.lost < s.lives) s.lost += 1;
  s.events.push({ type: 'lost', id: item.id, from });
}

/** SIM-31, GD-32: back to where it was taken if that is free, otherwise into the backwater. */
function returnHand(s: SimState, reason: ReturnReason): void {
  const hand = s.hand;
  if (!hand) return;
  s.hand = null;
  const { item, from } = hand;
  if (from.at === 'cell') {
    const i = from.row * s.cols + from.col;
    if (s.grid[i]?.kind === 'empty') {
      s.grid[i] = { kind: 'item', item };
      s.events.push({ type: 'returned', id: item.id, to: from, reason });
      return;
    }
  } else if (validSlot(s, from.slot) && s.backwater[from.slot] === null) {
    s.backwater[from.slot] = item;
    s.events.push({ type: 'returned', id: item.id, to: from, reason });
    return;
  }
  const slot = freeSlot(s);
  if (slot < 0) return loseItem(s, item, from);
  s.backwater[slot] = item;
  s.events.push({ type: 'returned', id: item.id, to: { at: 'backwater', slot }, reason });
}

// SIM-20…SIM-23
function flowStep(s: SimState): void {
  const { cols, rows } = s;
  const last = rows - 1;
  for (let col = 1; col < cols - 1; col++) {
    const i = last * cols + col;
    const cell = s.grid[i] as Cell;
    if (cell.kind !== 'item') continue;
    s.grid[i] = EMPTY;
    const slot = freeSlot(s);
    if (slot < 0) {
      loseItem(s, cell.item, { at: 'cell', col, row: last });
    } else {
      s.backwater[slot] = cell.item;
      s.events.push({ type: 'exit', id: cell.item.id, col, slot });
    }
  }
  for (let row = rows - 2; row >= 0; row--) {
    for (let col = 1; col < cols - 1; col++) {
      const i = row * cols + col;
      const cell = s.grid[i] as Cell;
      if (cell.kind !== 'item' || s.grid[i + cols]?.kind !== 'empty') continue;
      s.grid[i + cols] = cell;
      s.grid[i] = EMPTY;
      s.events.push({
        type: 'move',
        id: cell.item.id,
        from: { at: 'cell', col, row },
        to: { at: 'cell', col, row: row + 1 },
      });
    }
  }
  spawn(s);
  s.stepIndex += 1;
}

/** SIM-22, GD-72 */
function spawn(s: SimState): void {
  let scripted = false;
  for (const e of s.cfg.script) {
    if (e.step !== s.stepIndex) continue;
    scripted = true;
    putTop(s, e.col, e.chain, e.level);
  }
  if (scripted) return;

  const [min, max] = s.cfg.perStep;
  const n = min + randomInt(s, max - min + 1);
  const lanes: number[] = [];
  for (let col = 1; col < s.cols - 1; col++) lanes.push(col);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = randomInt(s, i + 1);
    const t = lanes[i] as number;
    lanes[i] = lanes[j] as number;
    lanes[j] = t;
  }
  const weights = s.cfg.weights;
  let total = 0;
  for (const w of weights) total += w.w;
  for (let k = 0; k < n && k < lanes.length; k++) {
    let x = nextRandom(s) * total;
    let pick = weights[weights.length - 1];
    for (const w of weights) {
      if (x < w.w) {
        pick = w;
        break;
      }
      x -= w.w;
    }
    if (pick) putTop(s, lanes[k] as number, pick.chain, pick.level);
  }
}

function putTop(s: SimState, col: number, chain: Chain, level: number): void {
  if (s.grid[col]?.kind !== 'empty') {
    s.events.push({ type: 'jam', col });
    return;
  }
  const item = newItem(s, chain, level);
  s.grid[col] = { kind: 'item', item };
  s.events.push({ type: 'spawn', id: item.id, chain: item.chain, level: item.level, col, row: 0 });
}

// SIM-33, GD-80
function useBooster(s: SimState, id: BoosterId, target: Ref | undefined): void {
  if (s.boostersUsed >= MAX_BOOSTERS_PER_LEVEL) return invalid(s, { type: 'booster' });
  switch (id) {
    case 'dam':
      s.freezeTicks += DAM_TICKS;
      s.events.push({ type: 'booster', id });
      break;
    case 'hook': {
      if (!target || target.at !== 'cell') return invalid(s, { type: 'booster' });
      const kind = cellAt(s, target.col, target.row)?.kind;
      if (kind !== 'rock' && kind !== 'snag') return invalid(s, { type: 'booster' });
      s.grid[target.row * s.cols + target.col] = EMPTY;
      s.events.push({ type: 'booster', id, at: { at: 'cell', col: target.col, row: target.row } });
      break;
    }
    case 'joker': {
      const at = firstFreeBankCell(s);
      if (!at) return invalid(s, { type: 'booster' });
      const item = newItem(s, 'joker', 0);
      s.grid[at.row * s.cols + at.col] = { kind: 'item', item };
      s.events.push({ type: 'booster', id, at, items: [item.id] });
      break;
    }
    case 'net': {
      const moved: number[] = [];
      let col = 1;
      for (let slot = 0; slot < s.backwaterCap; slot++) {
        const item = s.backwater[slot];
        if (!item) continue;
        while (col < s.cols - 1 && s.grid[col]?.kind !== 'empty') col++;
        if (col >= s.cols - 1) break;
        s.grid[col] = { kind: 'item', item };
        s.backwater[slot] = null;
        moved.push(item.id);
        col++;
      }
      if (moved.length === 0) return invalid(s, { type: 'booster' });
      s.events.push({ type: 'booster', id, items: moved });
      break;
    }
  }
  s.boostersUsed += 1;
  s.stats.boosters += 1;
}

/** SIM-33: top to bottom, the left bank first. */
function firstFreeBankCell(s: SimState): CellRef | null {
  for (const col of [0, s.cols - 1]) {
    for (let row = 0; row < s.rows; row++) {
      if (s.grid[row * s.cols + col]?.kind === 'empty') return { at: 'cell', col, row };
    }
  }
  return null;
}

/** GD-52: two losses, three more backwater slots, the game goes on from the same state. */
function continueAttempt(s: SimState): void {
  s.status = 'playing';
  s.continued = true;
  s.lost = Math.max(0, s.lives - 1);
  s.backwaterCap += CONTINUE_EXTRA_BACKWATER;
  for (let i = 0; i < CONTINUE_EXTRA_BACKWATER; i++) s.backwater.push(null);
  s.events.push({ type: 'continue' });
  if (s.hand) returnHand(s, 'continue');
}
