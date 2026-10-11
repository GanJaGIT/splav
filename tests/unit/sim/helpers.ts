import {
  createState,
  step,
  type Action,
  type Cell,
  type Chain,
  type Item,
  type LevelData,
  type Ref,
  type SimOptions,
  type SimState,
} from '../../../src/sim';

/** A 3-lane 7-row level with no spawns (perStep [0, 0]) and one pier that wants wood 6. */
export function level(over: Partial<LevelData> = {}): LevelData {
  return {
    id: 'c1-01',
    chapter: 1,
    lanes: 3,
    rows: 7,
    stepTicks: 10,
    seed: 1,
    waitFirstMerge: false,
    spawn: { perStep: [0, 0], weights: [{ chain: 'wood', level: 1, w: 1 }] },
    initial: [],
    script: [],
    piers: [{ col: 0, row: 0, resident: 'fisher', orders: [{ chain: 'wood', level: 6 }] }],
    obstacles: [],
    backwater: 5,
    lives: 3,
    intro: null,
    gift: null,
    ...over,
  };
}

export function sim(over: Partial<LevelData> = {}, opts: SimOptions = {}): SimState {
  return createState(level(over), opts);
}

export const cell = (col: number, row: number): Ref => ({ at: 'cell', col, row });
export const slot = (n: number): Ref => ({ at: 'backwater', slot: n });

/** Test setup only: puts an item straight into a cell. */
export function put(s: SimState, col: number, row: number, chain: Chain, lvl: number): Item {
  const item = { id: s.nextItemId++, chain, level: lvl };
  s.grid[row * s.cols + col] = { kind: 'item', item };
  return item;
}

/** Test setup only: puts an item into a backwater slot. */
export function putBackwater(s: SimState, n: number, chain: Chain, lvl: number): Item {
  const item = { id: s.nextItemId++, chain, level: lvl };
  s.backwater[n] = item;
  return item;
}

export function at(s: SimState, col: number, row: number): Cell {
  return s.grid[row * s.cols + col] as Cell;
}

export function itemAtCell(s: SimState, col: number, row: number): Item | null {
  const c = at(s, col, row);
  return c.kind === 'item' ? c.item : null;
}

/** Runs `n` ticks with no actions. */
export function idle(s: SimState, n: number): SimState {
  for (let i = 0; i < n; i++) step(s);
  return s;
}

/** Grab and drop in one tick. */
export function move(s: SimState, from: Ref, to: Ref | null): SimState {
  return step(s, [
    { type: 'grab', ref: from },
    { type: 'drop', ref: to },
  ]);
}

export function act(s: SimState, ...actions: Action[]): SimState {
  return step(s, actions);
}

export function eventTypes(s: SimState): string[] {
  return s.events.map((e) => e.type);
}
