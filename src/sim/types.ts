/** §3.2, §3.5, §3.7: simulation state, actions and events. Everything is plain JSON data. */

import type { BoosterId } from '../config';

export type ItemChain = 'wood' | 'garden' | 'stone' | 'fish';
export type Chain = ItemChain | 'joker';

/** joker — level 0 (GD-22) */
export interface Item {
  id: number;
  chain: Chain;
  level: number;
}

export type Cell =
  | { kind: 'empty' }
  | { kind: 'item'; item: Item }
  | { kind: 'rock' }
  | { kind: 'snag' }
  | { kind: 'pier'; pierId: number };

export interface Order {
  chain: ItemChain;
  level: number;
}

export interface Pier {
  id: number;
  col: number;
  row: number;
  resident: string;
  orders: Order[];
  /** Orders done; the current order is orders[done]. */
  done: number;
}

export interface CellRef {
  at: 'cell';
  col: number;
  row: number;
}
export interface BackwaterRef {
  at: 'backwater';
  slot: number;
}
export type Ref = CellRef | BackwaterRef;

export interface Hand {
  item: Item;
  from: Ref;
  heldTicks: number;
}

export type Status = 'playing' | 'won' | 'lost';

export interface SpawnWeight {
  chain: ItemChain;
  level: number;
  w: number;
}

export interface ScriptEntry {
  step: number;
  col: number;
  chain: ItemChain;
  level: number;
}

/** Level parameters the tick needs; fixed for the attempt. */
export interface SimConfig {
  stepTicks: number;
  perStep: [number, number];
  weights: SpawnWeight[];
  script: ScriptEntry[];
  waitFirstMerge: boolean;
}

/** Counters for scripts, bots and the "level complete" screen. */
export interface SimStats {
  merges: number;
  maxCombo: number;
  deliveries: number;
  mergeCoins: number;
  orderCoins: number;
  boosters: number;
}

export interface SimState {
  tick: number;
  status: Status;
  cols: number;
  rows: number;
  /** grid[row * cols + col]; col 0 and cols - 1 are the banks. */
  grid: Cell[];
  backwater: (Item | null)[];
  backwaterCap: number;
  hand: Hand | null;
  piers: Pier[];
  lost: number;
  lives: number;
  continued: boolean;
  stepCounter: number;
  freezeTicks: number;
  flowStarted: boolean;
  combo: number;
  lastMergeTick: number;
  /** Coins from merges and orders; paid out at the end of the level (GD-63). */
  coins: number;
  boostersUsed: number;
  /** mulberry32 state (SIM-24). */
  rng: number;
  nextItemId: number;
  stepIndex: number;
  /** Events of the last tick, for rendering and sound (SIM-50). */
  events: SimEvent[];
  cfg: SimConfig;
  stats: SimStats;
}

export type Action =
  | { type: 'grab'; ref: Ref }
  /** null — released outside the field */
  | { type: 'drop'; ref: Ref | null }
  | { type: 'cancel' }
  | { type: 'booster'; id: BoosterId; target?: Ref }
  /** GD-52: only when status = 'lost' and not continued yet */
  | { type: 'continue' };

export type ReturnReason = 'drop' | 'timeout' | 'cancel' | 'continue';

export type SimEvent =
  | { type: 'spawn'; id: number; chain: Chain; level: number; col: number; row: number }
  | { type: 'move'; id: number; from: CellRef; to: CellRef }
  | { type: 'exit'; id: number; col: number; slot: number }
  | { type: 'lost'; id: number; from: Ref }
  | {
      type: 'merge';
      /** Item that was moved or pulled in by the cascade. */
      fromId: number;
      /** Item that was merged onto. */
      toId: number;
      /** The new item. */
      id: number;
      chain: Chain;
      level: number;
      from: Ref;
      to: CellRef;
      cascade: boolean;
      combo: number;
      coins: number;
    }
  | {
      type: 'deliver';
      id: number;
      chain: Chain;
      level: number;
      pierId: number;
      from: Ref;
      coins: number;
    }
  | { type: 'whirlpool'; combo: number }
  | { type: 'snagRemoved'; col: number; row: number }
  | { type: 'jam'; col: number }
  | { type: 'invalid'; action: Action['type'] }
  | { type: 'returned'; id: number; to: Ref; reason: ReturnReason }
  | { type: 'won' }
  | { type: 'lost-level' }
  | { type: 'grab'; id: number; from: Ref }
  | { type: 'place'; id: number; from: Ref; to: CellRef }
  | {
      type: 'booster';
      id: BoosterId;
      /** hook: the cleared cell; joker: the joker's cell */
      at?: CellRef;
      /** joker: the new joker's id; net: ids moved from the backwater */
      items?: number[];
    }
  | { type: 'continue' };
