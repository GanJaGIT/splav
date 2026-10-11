import { describe, expect, it } from 'vitest';
import {
  cellAt,
  createState,
  currentOrder,
  flowRate,
  isBank,
  itemAt,
  mergeResult,
  requiredWins,
  durationRange,
  flowLimit,
  parseLevelId,
  seedBot,
} from '../../../src/sim';
import { cell, level, put, putBackwater, sim, slot } from './helpers';

describe('createState (§3.2)', () => {
  it('builds the grid from the level', () => {
    const s = createState(
      level({
        initial: [{ col: 2, row: 1, chain: 'garden', level: 2 }],
        obstacles: [
          { type: 'rock', col: 0, row: 6 },
          { type: 'snag', col: 1, row: 4 },
        ],
      }),
    );
    expect([s.cols, s.rows, s.grid.length]).toEqual([5, 7, 35]);
    expect(cellAt(s, 0, 0)).toEqual({ kind: 'pier', pierId: 0 });
    expect(cellAt(s, 0, 6)).toEqual({ kind: 'rock' });
    expect(cellAt(s, 1, 4)).toEqual({ kind: 'snag' });
    expect(itemAt(s, cell(2, 1))).toEqual({ id: 1, chain: 'garden', level: 2 });
    expect(s.nextItemId).toBe(2);
    expect(s.backwater).toEqual([null, null, null, null, null]);
    expect(s.rng).toBe(1);
    expect(s.flowStarted).toBe(true);
  });

  it('CALM-01 and the Shed change the step and the backwater', () => {
    const s = createState(level({ stepTicks: 19 }), { calm: true, backwater: 6, seed: 7 });
    expect(s.cfg.stepTicks).toBe(29);
    expect(s.backwaterCap).toBe(6);
    expect(s.rng).toBe(7);
  });

  it('answers queries', () => {
    const s = sim();
    expect(cellAt(s, -1, 0)).toBeNull();
    expect(cellAt(s, 5, 0)).toBeNull();
    expect(cellAt(s, 1.5, 0)).toBeNull();
    expect(isBank(s, 0) && isBank(s, 4) && !isBank(s, 2)).toBe(true);
    const b = putBackwater(s, 1, 'fish', 1);
    expect(itemAt(s, slot(1))).toEqual(b);
    expect(itemAt(s, slot(7))).toBeNull();
    expect(itemAt(s, cell(9, 9))).toBeNull();
    expect(currentOrder(s, 0)).toEqual({ chain: 'wood', level: 6 });
    expect(currentOrder(s, 5)).toBeNull();
    put(s, 2, 2, 'wood', 1);
    expect(itemAt(s, cell(2, 2))?.chain).toBe('wood');
  });

  it('mergeResult follows GD-20 and GD-22', () => {
    const w = (level: number) => ({ id: 1, chain: 'wood' as const, level });
    const j = { id: 2, chain: 'joker' as const, level: 0 };
    expect(mergeResult(w(2), w(2))).toEqual({ chain: 'wood', level: 3 });
    expect(mergeResult(w(2), w(3))).toBeNull();
    expect(mergeResult(w(6), w(6))).toBeNull();
    expect(mergeResult(j, w(5))).toEqual({ chain: 'wood', level: 6 });
    expect(mergeResult(w(5), j)).toEqual({ chain: 'wood', level: 6 });
    expect(mergeResult(j, w(6))).toBeNull();
    expect(mergeResult(w(6), j)).toBeNull();
    expect(mergeResult(j, j)).toBeNull();
  });
});

describe('level requirements (§2.13)', () => {
  it('LD-07 flow', () => {
    expect(flowRate({ stepTicks: 20, spawn: { perStep: [1, 1], weights: [] } })).toBeCloseTo(0.5);
    expect(flowRate({ stepTicks: 27, spawn: { perStep: [2, 2], weights: [] } })).toBeCloseTo(
      0.74,
      2,
    );
    expect(flowRate({ stepTicks: 18, spawn: { perStep: [1, 2], weights: [] } })).toBeCloseTo(
      0.83,
      2,
    );
    expect([flowLimit(1), flowLimit(2), flowLimit(3)]).toEqual([0.55, 0.9, 0.75]);
  });

  it('LD-01 wins, LD-02 durations, LD-05 bot', () => {
    expect(requiredWins('c1-04')).toEqual({ novice: 18 });
    expect(requiredWins('c1-07')).toEqual({ novice: 12, normal: 18 });
    expect(requiredWins('c2-01')).toEqual({ normal: 15, deft: 19 });
    expect(requiredWins('c3-12')).toEqual({ normal: 8, deft: 18 });
    expect(requiredWins('daily-2026-10-11')).toEqual({ normal: 15 });
    expect(durationRange('c1-03')).toEqual([0, 90]);
    expect(durationRange('c1-04')).toEqual([90, 240]);
    expect(durationRange('daily-x')).toEqual([90, 240]);
    expect([seedBot(1), seedBot(2)]).toEqual(['novice', 'normal']);
    expect(parseLevelId('c2-11')).toEqual({ chapter: 2, num: 11 });
    expect(parseLevelId('x')).toBeNull();
  });
});
