import { describe, expect, it } from 'vitest';
import { BOOSTER_IDS } from '../../../src/config';
import {
  Bot,
  checkInvariants,
  cloneState,
  createState,
  hashState,
  step,
  type Action,
  type LevelData,
  type Ref,
  type SimState,
} from '../../../src/sim';
import { level } from './helpers';

/** Test-side generator, independent of the simulation's own. */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVELS: LevelData[] = [
  level({
    stepTicks: 4,
    spawn: {
      perStep: [1, 2],
      weights: [
        { chain: 'wood', level: 1, w: 3 },
        { chain: 'garden', level: 1, w: 2 },
        { chain: 'wood', level: 2, w: 1 },
      ],
    },
    piers: [
      {
        col: 4,
        row: 2,
        resident: 'fisher',
        orders: [
          { chain: 'wood', level: 2 },
          { chain: 'garden', level: 2 },
        ],
      },
    ],
    obstacles: [
      { type: 'rock', col: 2, row: 4 },
      { type: 'snag', col: 1, row: 3 },
    ],
    backwater: 3,
  }),
  level({
    lanes: 5,
    rows: 8,
    stepTicks: 3,
    waitFirstMerge: true,
    spawn: {
      perStep: [1, 3],
      weights: [
        { chain: 'wood', level: 1, w: 1 },
        { chain: 'stone', level: 1, w: 1 },
        { chain: 'fish', level: 1, w: 1 },
      ],
    },
    initial: [
      { col: 2, row: 2, chain: 'wood', level: 1 },
      { col: 4, row: 2, chain: 'wood', level: 1 },
    ],
    piers: [
      { col: 0, row: 3, resident: 'fisher', orders: [{ chain: 'stone', level: 3 }] },
      { col: 6, row: 1, resident: 'miller', orders: [{ chain: 'fish', level: 2 }] },
    ],
    obstacles: [{ type: 'snag', col: 3, row: 5 }],
  }),
];

function randomRef(s: SimState, r: () => number): Ref {
  if (r() < 0.15) return { at: 'backwater', slot: Math.floor(r() * (s.backwaterCap + 1)) };
  return { at: 'cell', col: Math.floor(r() * (s.cols + 1)) - 0, row: Math.floor(r() * s.rows) };
}

function randomActions(s: SimState, r: () => number): Action[] {
  const out: Action[] = [];
  const n = r() < 0.6 ? 0 : 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = r();
    if (x < 0.35) out.push({ type: 'grab', ref: randomRef(s, r) });
    else if (x < 0.75) out.push({ type: 'drop', ref: r() < 0.05 ? null : randomRef(s, r) });
    else if (x < 0.82) out.push({ type: 'cancel' });
    else if (x < 0.92) {
      const id = BOOSTER_IDS[Math.floor(r() * BOOSTER_IDS.length)] ?? 'dam';
      out.push({ type: 'booster', id, target: randomRef(s, r) });
    } else out.push({ type: 'continue' });
  }
  return out;
}

describe('T-13 determinism and invariants', () => {
  it('1000 random action logs: invariants hold every tick, replays give the same hash', () => {
    for (let run = 0; run < 1000; run++) {
      const lvl = LEVELS[run % LEVELS.length] as LevelData;
      const r = rand(run * 7919 + 1);
      const s = createState(lvl, { seed: run });
      const log: Action[][] = [];
      const ticks = 150 + (run % 5) * 30;
      for (let t = 0; t < ticks; t++) {
        const actions = randomActions(s, r);
        log.push(actions);
        step(s, actions);
        const problems = checkInvariants(s);
        if (problems.length > 0) {
          throw new Error(`run ${run}, tick ${t}: ${problems.join('; ')}`);
        }
      }
      const replay = createState(lvl, { seed: run });
      for (const actions of log) step(replay, actions);
      expect(hashState(replay)).toBe(hashState(s));
    }
  });

  it('SIM-40: the same level, seed and actions give the same hash after 3000 ticks', () => {
    const hashes = [0, 1].map(() => {
      const s = createState(LEVELS[1] as LevelData, { seed: 42 });
      const bot = new Bot(12);
      for (let t = 0; t < 3000; t++) step(s, bot.next(s));
      return hashState(s);
    });
    expect(hashes[0]).toBe(hashes[1]);
  });

  it('a different seed gives a different game', () => {
    const run = (seed: number): number => {
      const s = createState(LEVELS[0] as LevelData, { seed });
      for (let t = 0; t < 300; t++) step(s);
      return hashState(s);
    };
    expect(run(1)).not.toBe(run(2));
  });

  it('cloneState copies deeply', () => {
    const s = createState(LEVELS[0] as LevelData);
    const c = cloneState(s);
    step(c);
    expect(c.tick).toBe(1);
    expect(s.tick).toBe(0);
    expect(hashState(cloneState(s))).toBe(hashState(s));
  });

  it('reports broken invariants', () => {
    const s = createState(LEVELS[0] as LevelData);
    s.grid[0] = { kind: 'item', item: { id: 99, chain: 'wood', level: 7 } };
    s.grid[1] = { kind: 'item', item: { id: 99, chain: 'joker', level: 1 } };
    s.lost = 9;
    s.backwater.push(null);
    s.boostersUsed = 4;
    s.freezeTicks = -1;
    s.stepCounter = 99;
    s.status = 'won';
    s.piers[0]!.done = 5;
    s.grid[2 * s.cols + 4] = { kind: 'empty' };
    const problems = checkInvariants(s).join('\n');
    for (const text of [
      'duplicate item id 99',
      'nextItemId',
      'wood has level 7',
      'joker has level 1',
      'lost 9',
      'backwater has',
      'boosters used',
      'freezeTicks',
      'stepCounter',
      'pier 0 done 5',
      'pier 0 not on its cell',
    ]) {
      expect(problems).toContain(text);
    }
  });
});
