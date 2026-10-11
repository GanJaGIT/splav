import { describe, expect, it } from 'vitest';
import {
  checkInvariants,
  levelResult,
  step,
  timeToNextStep,
  type SimState,
} from '../../../src/sim';
import {
  act,
  at,
  cell,
  eventTypes,
  idle,
  itemAtCell,
  move,
  put,
  putBackwater,
  sim,
  slot,
} from './helpers';

const wood = (level: number) => ({ chain: 'wood' as const, level });
const garden = (level: number) => ({ chain: 'garden' as const, level });

describe('T-01 flow', () => {
  it('moves an item one row down every stepTicks ticks', () => {
    const s = sim({ stepTicks: 5 });
    const item = put(s, 2, 0, 'wood', 1);
    idle(s, 4);
    expect(itemAtCell(s, 2, 0)?.id).toBe(item.id);
    idle(s, 1);
    expect(itemAtCell(s, 2, 1)?.id).toBe(item.id);
    expect(s.events).toContainEqual({
      type: 'move',
      id: item.id,
      from: cell(2, 0),
      to: cell(2, 1),
    });
    idle(s, 5);
    expect(itemAtCell(s, 2, 2)?.id).toBe(item.id);
    expect(s.stepIndex).toBe(2);
  });

  it('moves a solid column as a whole and leaves the banks alone', () => {
    const s = sim({ stepTicks: 1 });
    const ids = [0, 1, 2].map((row) => put(s, 1, row, 'wood', 1).id);
    const bank = put(s, 4, 3, 'garden', 1);
    idle(s, 1);
    expect([1, 2, 3].map((row) => itemAtCell(s, 1, row)?.id)).toEqual(ids);
    expect(itemAtCell(s, 1, 0)).toBeNull();
    expect(itemAtCell(s, 4, 3)?.id).toBe(bank.id);
  });

  it('SIM-51: tells how many ticks are left to the next step', () => {
    const s = sim({ stepTicks: 10 });
    expect(timeToNextStep(s)).toBe(10);
    idle(s, 3);
    expect(timeToNextStep(s)).toBe(7);
    s.freezeTicks = 5;
    expect(timeToNextStep(s)).toBe(12);
  });
});

describe('T-02 backwater and losses', () => {
  it('sends a bottom item to the first free backwater slot', () => {
    const s = sim({ stepTicks: 1 });
    putBackwater(s, 0, 'garden', 1);
    const item = put(s, 2, 6, 'wood', 1);
    idle(s, 1);
    expect(s.backwater[1]?.id).toBe(item.id);
    expect(s.events).toContainEqual({ type: 'exit', id: item.id, col: 2, slot: 1 });
    expect(s.lost).toBe(0);
  });

  it('loses an item when the backwater is full and fails the level on the third loss', () => {
    const s = sim({ stepTicks: 1, backwater: 1 });
    put(s, 1, 6, 'wood', 1);
    idle(s, 1);
    expect(s.backwater[0]).not.toBeNull();
    put(s, 1, 6, 'wood', 1);
    idle(s, 1);
    expect(s.lost).toBe(1);
    expect(eventTypes(s)).toContain('lost');
    expect(s.status).toBe('playing');
    put(s, 1, 6, 'wood', 1);
    put(s, 2, 6, 'wood', 1);
    put(s, 3, 6, 'wood', 1);
    idle(s, 1);
    expect(s.lost).toBe(3); // never above lives (SIM-41)
    expect(s.status).toBe('lost');
    expect(eventTypes(s)).toContain('lost-level');
    const tick = s.tick;
    idle(s, 5);
    expect(s.tick).toBe(tick); // SIM-13: no more ticks
  });
});

describe('T-03 rocks and jams', () => {
  it('a rock stops the lane and items pile up above it', () => {
    const s = sim({ stepTicks: 1, obstacles: [{ type: 'rock', col: 2, row: 4 }] });
    const a = put(s, 2, 0, 'wood', 1);
    const b = put(s, 2, 1, 'garden', 1);
    idle(s, 10);
    expect(at(s, 2, 4).kind).toBe('rock');
    expect(itemAtCell(s, 2, 3)?.id).toBe(b.id);
    expect(itemAtCell(s, 2, 2)?.id).toBe(a.id);
  });

  it('a jammed top cell skips the spawn but draws the same random numbers', () => {
    const over = {
      stepTicks: 1,
      spawn: {
        perStep: [1, 3] as [number, number],
        weights: [wood(1), garden(1)].map((w) => ({ ...w, w: 1 })),
      },
      obstacles: [1, 2, 3].map((col) => ({ type: 'rock' as const, col, row: 1 })),
    };
    const jammed = sim(over);
    const free = sim(over);
    for (const col of [1, 2, 3]) put(jammed, col, 0, 'stone', 1);
    free.nextItemId = jammed.nextItemId;
    step(jammed);
    step(free);
    expect(eventTypes(free)).toContain('spawn');
    expect(eventTypes(free)).not.toContain('jam');
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        step(jammed);
        step(free);
      }
      expect(jammed.rng).toBe(free.rng);
      expect(eventTypes(jammed)).not.toContain('spawn');
      expect(eventTypes(jammed)).toContain('jam');
    }
  });

  it('spawns scripted items on their step instead of random ones', () => {
    const s = sim({
      stepTicks: 1,
      spawn: { perStep: [3, 3], weights: [{ chain: 'wood', level: 1, w: 1 }] },
      script: [
        { step: 0, col: 2, chain: 'garden', level: 2 },
        { step: 1, col: 3, chain: 'garden', level: 1 },
      ],
    });
    const rng = s.rng;
    idle(s, 1);
    expect(s.events.filter((e) => e.type === 'spawn')).toEqual([
      { type: 'spawn', id: 1, chain: 'garden', level: 2, col: 2, row: 0 },
    ]);
    expect(s.rng).toBe(rng);
    idle(s, 1);
    expect(itemAtCell(s, 3, 0)).toMatchObject(garden(1));
    idle(s, 1);
    expect(s.events.filter((e) => e.type === 'spawn')).toHaveLength(3);
  });

  it('spawns follow the weights', () => {
    const s = sim({
      stepTicks: 1,
      rows: 8,
      spawn: {
        perStep: [1, 2],
        weights: [
          { chain: 'wood', level: 1, w: 3 },
          { chain: 'garden', level: 2, w: 1 },
        ],
      },
    });
    const counts = { wood: 0, garden: 0 };
    for (let i = 0; i < 400; i++) {
      step(s);
      for (const e of s.events) if (e.type === 'spawn') counts[e.chain as 'wood' | 'garden']++;
      s.backwater.fill(null);
      s.lost = 0;
    }
    const share = counts.wood / (counts.wood + counts.garden);
    expect(share).toBeGreaterThan(0.65);
    expect(share).toBeLessThan(0.85);
  });
});

describe('T-04, T-05 merge and return', () => {
  it('merges a pair into level + 1 in the target cell, the source is gone', () => {
    const s = sim();
    const a = put(s, 1, 2, 'wood', 2);
    const b = put(s, 3, 4, 'wood', 2);
    move(s, cell(1, 2), cell(3, 4));
    const result = itemAtCell(s, 3, 4);
    expect(result).toMatchObject(wood(3));
    expect(result?.id).not.toBe(a.id);
    expect(result?.id).not.toBe(b.id);
    expect(itemAtCell(s, 1, 2)).toBeNull();
    expect(s.hand).toBeNull();
    expect(s.events).toContainEqual(
      expect.objectContaining({
        type: 'merge',
        fromId: a.id,
        toId: b.id,
        level: 3,
        cascade: false,
      }),
    );
  });

  it('merges an item from the backwater onto the field', () => {
    const s = sim();
    putBackwater(s, 2, 'garden', 1);
    put(s, 0, 4, 'garden', 1);
    move(s, slot(2), cell(0, 4));
    expect(itemAtCell(s, 0, 4)).toMatchObject(garden(2));
    expect(s.backwater[2]).toBeNull();
  });

  it('returns an item dropped on a different item', () => {
    const s = sim();
    const a = put(s, 1, 2, 'wood', 2);
    const b = put(s, 3, 4, 'garden', 2);
    move(s, cell(1, 2), cell(3, 4));
    expect(itemAtCell(s, 1, 2)?.id).toBe(a.id);
    expect(itemAtCell(s, 3, 4)?.id).toBe(b.id);
    expect(s.events).toContainEqual({ type: 'returned', id: a.id, to: cell(1, 2), reason: 'drop' });
  });

  it('returns an item dropped on a rock, a snag, the backwater, outside or its own cell', () => {
    const s = sim({
      obstacles: [
        { type: 'rock', col: 2, row: 5 },
        { type: 'snag', col: 3, row: 5 },
      ],
    });
    const a = put(s, 4, 3, 'wood', 1);
    for (const target of [cell(2, 5), cell(3, 5), slot(0), null, cell(9, 9), cell(4, 3)]) {
      move(s, cell(4, 3), target);
      expect(itemAtCell(s, 4, 3)?.id).toBe(a.id);
      expect(eventTypes(s)).toEqual(['grab', 'returned']);
    }
  });

  it('moves an item to an empty river or bank cell', () => {
    const s = sim();
    const a = put(s, 2, 2, 'wood', 1);
    move(s, cell(2, 2), cell(4, 5));
    expect(itemAtCell(s, 4, 5)?.id).toBe(a.id);
    expect(s.events).toContainEqual({ type: 'place', id: a.id, from: cell(2, 2), to: cell(4, 5) });
  });

  it('SIM-30, SIM-34: grabbing nothing or twice, dropping with an empty hand are invalid', () => {
    const s = sim();
    put(s, 1, 1, 'wood', 1);
    put(s, 2, 1, 'wood', 1);
    act(s, { type: 'grab', ref: cell(3, 3) });
    expect(eventTypes(s)).toEqual(['invalid']);
    act(s, { type: 'grab', ref: slot(0) }, { type: 'grab', ref: slot(99) });
    expect(eventTypes(s)).toEqual(['invalid', 'invalid']);
    act(s, { type: 'drop', ref: cell(1, 1) }, { type: 'cancel' });
    expect(eventTypes(s)).toEqual(['invalid', 'invalid']);
    act(s, { type: 'grab', ref: cell(1, 1) }, { type: 'grab', ref: cell(2, 1) });
    expect(eventTypes(s)).toEqual(['grab', 'invalid']);
    act(s, { type: 'cancel' });
    expect(eventTypes(s)).toEqual(['returned']);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('T-06 merge limits and the joker', () => {
  it('two level-6 items do not merge', () => {
    const s = sim();
    put(s, 0, 2, 'wood', 6);
    put(s, 0, 4, 'wood', 6);
    move(s, cell(0, 2), cell(0, 4));
    expect(itemAtCell(s, 0, 2)).toMatchObject(wood(6));
    expect(itemAtCell(s, 0, 4)).toMatchObject(wood(6));
  });

  it('a joker raises any item but level 6 and another joker', () => {
    const s = sim();
    put(s, 0, 2, 'joker', 0);
    put(s, 0, 4, 'wood', 6);
    put(s, 4, 2, 'joker', 0);
    move(s, cell(0, 2), cell(0, 4));
    expect(eventTypes(s)).toEqual(['grab', 'returned']);
    move(s, cell(0, 2), cell(4, 2));
    expect(eventTypes(s)).toEqual(['grab', 'returned']);

    put(s, 4, 5, 'garden', 3);
    move(s, cell(0, 2), cell(4, 5));
    expect(itemAtCell(s, 4, 5)).toMatchObject(garden(4));
    put(s, 0, 5, 'stone', 2);
    move(s, cell(0, 5), cell(4, 2));
    expect(itemAtCell(s, 4, 2)).toMatchObject({ chain: 'stone', level: 3 });
  });
});

describe('T-07 cascade', () => {
  it('runs three cascade merges in a row', () => {
    const s = sim();
    put(s, 2, 3, 'wood', 1);
    const below = put(s, 2, 4, 'wood', 2);
    const left = put(s, 1, 3, 'wood', 3);
    const above = put(s, 2, 2, 'wood', 4);
    put(s, 4, 6, 'wood', 1);
    move(s, cell(4, 6), cell(2, 3));
    expect(itemAtCell(s, 2, 3)).toMatchObject(wood(5));
    const merges = s.events.filter((e) => e.type === 'merge');
    expect(merges.map((e) => [e.fromId, e.level, e.cascade])).toEqual([
      [expect.any(Number), 2, false],
      [below.id, 3, true],
      [left.id, 4, true],
      [above.id, 5, true],
    ]);
    for (const [c, r] of [
      [2, 4],
      [1, 3],
      [2, 2],
    ] as const) {
      expect(itemAtCell(s, c, r)).toBeNull();
    }
  });

  it('checks neighbours below, left, right, above', () => {
    const s = sim();
    put(s, 2, 3, 'wood', 1);
    put(s, 2, 2, 'wood', 2);
    put(s, 2, 4, 'wood', 2);
    put(s, 4, 6, 'wood', 1);
    move(s, cell(4, 6), cell(2, 3));
    expect(itemAtCell(s, 2, 4)).toBeNull();
    expect(itemAtCell(s, 2, 2)).toMatchObject(wood(2));

    const t = sim();
    put(t, 2, 3, 'wood', 1);
    put(t, 1, 3, 'wood', 2);
    put(t, 3, 3, 'wood', 2);
    put(t, 4, 6, 'wood', 1);
    move(t, cell(4, 6), cell(2, 3));
    expect(itemAtCell(t, 1, 3)).toBeNull();
    expect(itemAtCell(t, 3, 3)).toMatchObject(wood(2));
  });

  it('stops at level 6 and ignores the backwater', () => {
    const s = sim();
    put(s, 0, 3, 'wood', 5);
    put(s, 0, 4, 'wood', 6);
    putBackwater(s, 0, 'wood', 6);
    put(s, 4, 6, 'wood', 5);
    move(s, cell(4, 6), cell(0, 3));
    expect(itemAtCell(s, 0, 3)).toMatchObject(wood(6));
    expect(itemAtCell(s, 0, 4)).toMatchObject(wood(6));
    expect(s.events.filter((e) => e.type === 'merge')).toHaveLength(1);
  });
});

/** Six wood-1 pairs on the banks, which do not flow. */
function bankPairs(s: SimState): [number, number, number, number][] {
  const pairs: [number, number, number, number][] = [];
  for (const [col, rows] of [
    [0, [1, 3, 5]],
    [4, [0, 2, 4]],
  ] as const) {
    for (const row of rows) {
      put(s, col, row, 'wood', 1);
      put(s, col, row + 1, 'wood', 1);
      pairs.push([col, row + 1, col, row]);
    }
  }
  return pairs;
}

describe('T-08 combo and whirlpool', () => {
  it('raises the multiplier for quick merges, resets it after a pause', () => {
    const s = sim({ stepTicks: 1000 });
    const pairs = bankPairs(s);
    const merge = (i: number): void => {
      const [c1, r1, c2, r2] = pairs[i] as [number, number, number, number];
      move(s, cell(c1, r1), cell(c2, r2));
    };
    merge(0);
    expect([s.combo, s.coins]).toEqual([1, 2]);
    idle(s, 18);
    merge(1); // 19 ticks later
    expect([s.combo, s.coins]).toEqual([2, 2 + 4]);
    idle(s, 19);
    merge(2); // 20 ticks later: too late
    expect([s.combo, s.coins]).toEqual([1, 6 + 2]);
  });

  it('caps the multiplier at 4 and freezes the river for 30 ticks on the 5th merge', () => {
    const s = sim({ stepTicks: 2 });
    const pairs = bankPairs(s);
    const coins: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = s.coins;
      const [c1, r1, c2, r2] = pairs[i] as [number, number, number, number];
      move(s, cell(c1, r1), cell(c2, r2));
      coins.push(s.coins - before);
      if (i < 4) idle(s, 4);
    }
    expect(coins).toEqual([2, 4, 6, 8, 8]);
    expect(s.combo).toBe(5);
    expect(eventTypes(s)).toContain('whirlpool');
    expect(s.freezeTicks).toBe(29);
    const floating = put(s, 2, 0, 'garden', 1);
    const index = s.stepIndex;
    idle(s, 29);
    expect(s.stepIndex).toBe(index);
    expect(itemAtCell(s, 2, 0)?.id).toBe(floating.id);
    idle(s, 2);
    expect(s.stepIndex).toBe(index + 1);
  });
});

describe('T-09 holding', () => {
  it('a held item does not flow and comes back after 30 ticks', () => {
    const s = sim({ stepTicks: 5 });
    const a = put(s, 2, 3, 'wood', 1);
    act(s, { type: 'grab', ref: cell(2, 3) });
    idle(s, 29);
    expect(s.hand?.item.id).toBe(a.id);
    expect(s.hand?.heldTicks).toBe(30);
    idle(s, 1);
    expect(s.hand).toBeNull();
    expect(itemAtCell(s, 2, 3)?.id).toBe(a.id);
    expect(s.events).toContainEqual({
      type: 'returned',
      id: a.id,
      to: cell(2, 3),
      reason: 'timeout',
    });
  });

  it('goes to the backwater if its cell was taken meanwhile', () => {
    const s = sim({ stepTicks: 5, obstacles: [{ type: 'rock', col: 2, row: 4 }] });
    const a = put(s, 2, 3, 'wood', 1);
    const b = put(s, 2, 2, 'garden', 1);
    act(s, { type: 'grab', ref: cell(2, 3) });
    idle(s, 30);
    expect(s.backwater[0]?.id).toBe(a.id);
    expect(s.events).toContainEqual({ type: 'returned', id: a.id, to: slot(0), reason: 'timeout' });
    expect(itemAtCell(s, 2, 3)?.id).toBe(b.id);
  });

  it('is lost if the backwater is full too', () => {
    const s = sim({ stepTicks: 1, backwater: 1 });
    put(s, 2, 3, 'wood', 1);
    put(s, 2, 2, 'garden', 1);
    putBackwater(s, 0, 'stone', 1);
    act(s, { type: 'grab', ref: cell(2, 3) });
    act(s, { type: 'cancel' });
    expect(s.lost).toBeGreaterThanOrEqual(1);
    expect(eventTypes(s)).toContain('lost');
  });

  it('returns to its backwater slot, or another one if that slot was filled', () => {
    const s = sim({ stepTicks: 1 });
    const a = putBackwater(s, 0, 'wood', 1);
    act(s, { type: 'grab', ref: slot(0) }, { type: 'cancel' });
    expect(s.backwater[0]?.id).toBe(a.id);
    act(s, { type: 'grab', ref: slot(0) });
    put(s, 3, 6, 'garden', 1);
    idle(s, 1); // garden exits into slot 0
    act(s, { type: 'drop', ref: slot(0) });
    expect(s.backwater[1]?.id).toBe(a.id);
  });
});

describe('T-10 orders', () => {
  it('a matching item advances the queue, a wrong one comes back', () => {
    const s = sim({
      piers: [
        {
          col: 0,
          row: 3,
          resident: 'fisher',
          orders: [wood(2), garden(1)],
        },
      ],
    });
    const a = put(s, 1, 1, 'wood', 2);
    move(s, cell(1, 1), cell(0, 3));
    expect(s.piers[0]?.done).toBe(1);
    expect(s.coins).toBe(20);
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: 'deliver', id: a.id, pierId: 0, coins: 20 }),
    );
    const b = put(s, 1, 1, 'wood', 2);
    move(s, cell(1, 1), cell(0, 3));
    expect(itemAtCell(s, 1, 1)?.id).toBe(b.id);
    expect(s.piers[0]?.done).toBe(1);
    put(s, 4, 4, 'garden', 1);
    move(s, cell(4, 4), cell(0, 3));
    expect(s.piers[0]?.done).toBe(2);
    expect(s.status).toBe('won');
    move(s, cell(1, 1), cell(0, 3));
    expect(eventTypes(s)).toEqual(['invalid', 'invalid']);
  });
});

describe('T-11 result', () => {
  function finished(lost: number, status: 'won' | 'lost'): SimState {
    const s = sim();
    s.coins = 75;
    s.lost = lost;
    s.status = status;
    return s;
  }

  it('gives 3, 2, 1 stars for 0, 1, 2 losses and the first-win bonus', () => {
    expect(levelResult(finished(0, 'won'), true)).toEqual({
      won: true,
      stars: 3,
      coins: 75 + 20 + 30,
      levelCoins: 75,
      bonus: 50,
    });
    expect(levelResult(finished(1, 'won'), true).stars).toBe(2);
    expect(levelResult(finished(2, 'won'), true).stars).toBe(1);
    expect(levelResult(finished(2, 'won'), false).coins).toBe(75 + 5);
  });

  it('pays half the coins on a loss, rounded down', () => {
    expect(levelResult(finished(3, 'lost'), true)).toEqual({
      won: false,
      stars: 0,
      coins: 37,
      levelCoins: 75,
      bonus: 0,
    });
  });

  it('wins when the last order is delivered', () => {
    const s = sim({ piers: [{ col: 4, row: 2, resident: 'fisher', orders: [wood(1)] }] });
    put(s, 2, 2, 'wood', 1);
    move(s, cell(2, 2), cell(4, 2));
    expect(s.status).toBe('won');
    expect(eventTypes(s)).toContain('won');
  });
});

describe('T-12 snags', () => {
  it('a merge next to a snag removes it, a diagonal merge does not', () => {
    const s = sim({
      obstacles: [
        { type: 'snag', col: 2, row: 3 },
        { type: 'snag', col: 3, row: 3 },
      ],
    });
    put(s, 2, 4, 'wood', 1);
    put(s, 4, 6, 'wood', 1);
    move(s, cell(4, 6), cell(2, 4));
    expect(at(s, 2, 3).kind).toBe('empty');
    expect(at(s, 3, 3).kind).toBe('snag');
    expect(s.events).toContainEqual({ type: 'snagRemoved', col: 2, row: 3 });
  });

  it('a snag stops the lane like a rock', () => {
    const s = sim({ stepTicks: 1, obstacles: [{ type: 'snag', col: 1, row: 2 }] });
    const a = put(s, 1, 0, 'wood', 1);
    idle(s, 5);
    expect(itemAtCell(s, 1, 1)?.id).toBe(a.id);
  });
});

describe('T-14 waitFirstMerge', () => {
  it('the river stands until the first merge', () => {
    const s = sim({
      waitFirstMerge: true,
      stepTicks: 2,
      spawn: { perStep: [1, 1], weights: [{ chain: 'wood', level: 1, w: 1 }] },
    });
    const a = put(s, 2, 0, 'garden', 1);
    idle(s, 50);
    expect(itemAtCell(s, 2, 0)?.id).toBe(a.id);
    expect(s.stepIndex).toBe(0);
    expect(timeToNextStep(s)).toBe(Infinity);
    put(s, 0, 3, 'wood', 1);
    put(s, 0, 4, 'wood', 1);
    move(s, cell(0, 4), cell(0, 3));
    expect(s.flowStarted).toBe(true);
    idle(s, 1);
    expect(s.stepIndex).toBe(1);
    expect(itemAtCell(s, 2, 1)?.id).toBe(a.id);
  });
});

describe('T-16 boosters', () => {
  it('dam: the river stands 80 ticks, merging still works', () => {
    const s = sim({ stepTicks: 1 });
    const a = put(s, 2, 0, 'garden', 1);
    act(s, { type: 'booster', id: 'dam' });
    expect(s.freezeTicks).toBe(79);
    put(s, 0, 3, 'wood', 1);
    put(s, 0, 4, 'wood', 1);
    move(s, cell(0, 4), cell(0, 3));
    expect(itemAtCell(s, 0, 3)).toMatchObject(wood(2));
    idle(s, 78);
    expect(itemAtCell(s, 2, 0)?.id).toBe(a.id);
    idle(s, 1);
    expect(itemAtCell(s, 2, 1)?.id).toBe(a.id);
  });

  it('hook: removes a rock or a snag, nothing else', () => {
    const s = sim({
      obstacles: [
        { type: 'rock', col: 0, row: 5 },
        { type: 'snag', col: 2, row: 3 },
      ],
    });
    act(s, { type: 'booster', id: 'hook', target: cell(0, 5) });
    expect(at(s, 0, 5).kind).toBe('empty');
    act(s, { type: 'booster', id: 'hook', target: cell(2, 3) });
    expect(at(s, 2, 3).kind).toBe('empty');
    expect(s.boostersUsed).toBe(2);
    act(
      s,
      { type: 'booster', id: 'hook', target: cell(2, 3) },
      { type: 'booster', id: 'hook' },
      { type: 'booster', id: 'hook', target: slot(0) },
    );
    expect(eventTypes(s)).toEqual(['invalid', 'invalid', 'invalid']);
    expect(s.boostersUsed).toBe(2);
  });

  it('joker: goes to the first free bank cell, top to bottom, left bank first', () => {
    const s = sim();
    act(s, { type: 'booster', id: 'joker' });
    expect(itemAtCell(s, 0, 1)).toMatchObject({ chain: 'joker', level: 0 });
    for (let row = 2; row < 7; row++) put(s, 0, row, 'wood', 1);
    act(s, { type: 'booster', id: 'joker' });
    expect(itemAtCell(s, 4, 0)).toMatchObject({ chain: 'joker', level: 0 });
  });

  it('joker: unavailable without a free bank cell', () => {
    const s = sim();
    for (let row = 1; row < 7; row++) put(s, 0, row, 'wood', 1);
    for (let row = 0; row < 7; row++) put(s, 4, row, 'wood', 1);
    act(s, { type: 'booster', id: 'joker' });
    expect(eventTypes(s)).toEqual(['invalid']);
    expect(s.boostersUsed).toBe(0);
  });

  it('net: moves backwater items into free top river cells left to right', () => {
    const s = sim();
    const b0 = putBackwater(s, 0, 'wood', 1);
    const b2 = putBackwater(s, 2, 'garden', 1);
    const b3 = putBackwater(s, 3, 'stone', 1);
    put(s, 1, 0, 'fish', 1);
    act(s, { type: 'booster', id: 'net' });
    expect(itemAtCell(s, 2, 0)?.id).toBe(b0.id);
    expect(itemAtCell(s, 3, 0)?.id).toBe(b2.id);
    expect(s.backwater[3]?.id).toBe(b3.id);
    expect(s.backwater[0]).toBeNull();
    act(s, { type: 'booster', id: 'net' });
    expect(eventTypes(s)).toEqual(['invalid']);
  });

  it('allows three boosters per level', () => {
    const s = sim();
    act(s, ...[0, 1, 2].map(() => ({ type: 'booster' as const, id: 'dam' as const })));
    expect(s.freezeTicks).toBe(239);
    act(s, { type: 'booster', id: 'dam' });
    expect(eventTypes(s)).toEqual(['invalid']);
    expect(s.boostersUsed).toBe(3);
  });
});

describe('T-17 continue', () => {
  function lose(s: SimState): void {
    while (s.status === 'playing') {
      for (const col of [1, 2, 3]) if (at(s, col, 6).kind === 'empty') put(s, col, 6, 'wood', 1);
      step(s);
    }
  }

  it('sets losses to 2, adds 3 backwater slots, works once per attempt', () => {
    const s = sim({ stepTicks: 1, backwater: 2 });
    lose(s);
    expect(s.status).toBe('lost');
    act(s, { type: 'continue' });
    expect(s.status).toBe('playing');
    expect([s.lost, s.backwaterCap, s.backwater.length, s.continued]).toEqual([2, 5, 5, true]);
    expect(eventTypes(s)).toContain('continue');
    expect(checkInvariants(s)).toEqual([]);
    lose(s);
    act(s, { type: 'continue' });
    expect(s.status).toBe('lost');
    expect(eventTypes(s)).toEqual(['invalid']);
  });

  it('is invalid while playing and returns a held item', () => {
    const s = sim({ stepTicks: 1, backwater: 1 });
    act(s, { type: 'continue' });
    expect(eventTypes(s)).toEqual(['invalid']);
    put(s, 0, 3, 'garden', 2);
    act(s, { type: 'grab', ref: cell(0, 3) });
    lose(s);
    expect(s.hand).not.toBeNull();
    put(s, 0, 3, 'stone', 1);
    act(s, { type: 'continue' });
    expect(s.hand).toBeNull();
    expect(s.backwater.some((i) => i?.chain === 'garden')).toBe(true);
  });
});
