import { describe, expect, it } from 'vitest';
import { config } from '../../../src/config';
import { Bot, botDelay, createState, decide, runBot, step, type Action } from '../../../src/sim';
import { cell, level, put, putBackwater, sim, slot } from './helpers';

describe('BOT-02 decisions', () => {
  it('delivers first, the most urgent matching item', () => {
    const s = sim({
      piers: [{ col: 0, row: 0, resident: 'fisher', orders: [{ chain: 'wood', level: 2 }] }],
    });
    put(s, 1, 1, 'wood', 2);
    put(s, 2, 5, 'wood', 2);
    put(s, 3, 3, 'garden', 4);
    put(s, 3, 4, 'garden', 4);
    expect(decide(s)).toEqual({ grab: cell(2, 5), plan: { kind: 'deliver', pierId: 0 } });
  });

  it('delivers from the backwater too', () => {
    const s = sim({
      piers: [{ col: 0, row: 0, resident: 'fisher', orders: [{ chain: 'wood', level: 1 }] }],
    });
    putBackwater(s, 3, 'wood', 1);
    expect(decide(s)?.grab).toEqual(slot(3));
  });

  it('merges the best pair, the lower item onto the upper one', () => {
    const s = sim();
    put(s, 1, 1, 'wood', 1);
    const upper = put(s, 2, 1, 'garden', 2);
    put(s, 3, 5, 'garden', 2);
    put(s, 1, 6, 'wood', 1);
    expect(decide(s)).toEqual({ grab: cell(3, 5), plan: { kind: 'merge', targetId: upper.id } });
  });

  it('prefers the urgent pair among equal levels and takes from the backwater', () => {
    const s = sim();
    put(s, 1, 1, 'wood', 1);
    put(s, 2, 2, 'wood', 1);
    const target = put(s, 3, 3, 'stone', 1);
    putBackwater(s, 1, 'stone', 1);
    expect(decide(s)).toEqual({ grab: slot(1), plan: { kind: 'merge', targetId: target.id } });
  });

  it('on the same row moves the river item onto the bank item', () => {
    const s = sim();
    const bank = put(s, 4, 3, 'wood', 1);
    put(s, 2, 3, 'wood', 1);
    expect(decide(s)).toEqual({ grab: cell(2, 3), plan: { kind: 'merge', targetId: bank.id } });
    const t = sim();
    put(t, 2, 3, 'wood', 1);
    const bank2 = put(t, 0, 3, 'wood', 1);
    expect(decide(t)).toEqual({ grab: cell(2, 3), plan: { kind: 'merge', targetId: bank2.id } });
  });

  it('does not pair two backwater items, jokers or level 6', () => {
    const s = sim({
      piers: [{ col: 0, row: 0, resident: 'fisher', orders: [{ chain: 'stone', level: 3 }] }],
    });
    putBackwater(s, 0, 'wood', 1);
    putBackwater(s, 1, 'wood', 1);
    put(s, 0, 2, 'joker', 0);
    put(s, 0, 3, 'joker', 0);
    put(s, 4, 2, 'wood', 6);
    put(s, 4, 3, 'wood', 6);
    expect(decide(s)).toBeNull();
  });

  it('rescues an unpaired bottom item that orders need to the nearest free bank cell', () => {
    const s = sim({
      piers: [{ col: 0, row: 0, resident: 'fisher', orders: [{ chain: 'garden', level: 3 }] }],
    });
    put(s, 1, 6, 'wood', 1);
    put(s, 3, 6, 'garden', 2);
    expect(decide(s)).toEqual({ grab: cell(3, 6), plan: { kind: 'rescue', to: cell(4, 6) } });
  });

  it('waits when there is nothing to do', () => {
    const s = sim();
    put(s, 1, 6, 'garden', 1);
    expect(decide(s)).toBeNull();
    s.status = 'won';
    expect(decide(s)).toBeNull();
  });
});

describe('BOT-01 tempo', () => {
  it('grabs and drops in adjacent ticks, one drop per delay', () => {
    const s = sim({ stepTicks: 1000 });
    for (let row = 1; row < 7; row++) put(s, 0, row, 'wood', 1);
    for (let row = 0; row < 7; row++) put(s, 4, row, 'garden', 1);
    const bot = new Bot(10);
    const grabs: number[] = [];
    const drops: number[] = [];
    for (let t = 0; t < 60; t++) {
      const actions = bot.next(s);
      for (const a of actions) {
        if (a.type === 'grab') grabs.push(s.tick);
        if (a.type === 'drop') drops.push(s.tick);
      }
      step(s, actions);
    }
    expect(drops.length).toBeGreaterThanOrEqual(5);
    grabs.forEach((g, i) => {
      if (drops[i] !== undefined) expect(drops[i]).toBe(g + 1);
    });
    for (let i = 1; i < drops.length; i++) {
      expect((drops[i] as number) - (drops[i - 1] as number)).toBeGreaterThanOrEqual(10);
    }
  });

  it('follows a target the river moved between grab and drop', () => {
    const s = sim({ stepTicks: 1 });
    put(s, 2, 1, 'wood', 1);
    put(s, 3, 3, 'wood', 1);
    const bot = new Bot(5);
    step(s, bot.next(s)); // grabs (3,3): the lower one; the target flows to row 2
    const drop = bot.next(s);
    expect(drop).toEqual([{ type: 'drop', ref: cell(2, 2) }]);
    step(s, drop);
    expect(s.stats.merges).toBe(1);
  });

  it('falls back to another pair, a pier or cancel when the target is gone', () => {
    const s = sim({ stepTicks: 1000 });
    const target = put(s, 2, 2, 'wood', 1);
    put(s, 2, 4, 'wood', 1);
    const bot = new Bot(5);
    step(s, bot.next(s));
    s.grid[2 * s.cols + 2] = { kind: 'empty' };
    const other = put(s, 4, 4, 'wood', 1);
    expect(other.id).not.toBe(target.id);
    expect(bot.next(s)).toEqual([{ type: 'drop', ref: cell(4, 4) }]);

    const t = sim({ stepTicks: 1000 });
    put(t, 2, 2, 'wood', 1);
    put(t, 2, 4, 'wood', 1);
    const bot2 = new Bot(5);
    step(t, bot2.next(t));
    t.grid[2 * t.cols + 2] = { kind: 'empty' };
    expect(bot2.next(t)).toEqual([{ type: 'cancel' }]);
  });

  it('a rescue goes to another bank cell if the planned one got taken', () => {
    const s = sim({
      stepTicks: 1000,
      piers: [{ col: 0, row: 0, resident: 'fisher', orders: [{ chain: 'garden', level: 3 }] }],
    });
    put(s, 3, 6, 'garden', 1);
    const bot = new Bot(5);
    step(s, bot.next(s));
    put(s, 4, 6, 'stone', 1);
    expect(bot.next(s)).toEqual([{ type: 'drop', ref: cell(4, 5) }]);
  });

  it('does nothing once the level is over', () => {
    const s = sim();
    s.status = 'lost';
    expect(new Bot(5).next(s)).toEqual([]);
  });
});

describe('runBot', () => {
  it('plays a level to the end', () => {
    const lvl = level({
      stepTicks: 20,
      spawn: { perStep: [1, 1], weights: [{ chain: 'wood', level: 1, w: 1 }] },
      piers: [{ col: 4, row: 2, resident: 'fisher', orders: [{ chain: 'wood', level: 3 }] }],
    });
    const run = runBot(lvl, 'normal');
    expect(run).toMatchObject({ won: true, status: 'won', seed: 1, lost: 0 });
    expect(run.merges).toBeGreaterThanOrEqual(3);
    expect(run.seconds).toBe(run.ticks / 10);
    expect(run.coins).toBeGreaterThan(50);
  });

  it('stops at maxTicks and reports a timeout', () => {
    const run = runBot(level(), 12, { maxTicks: 50 });
    expect(run).toMatchObject({ status: 'timeout', won: false, ticks: 50 });
  });

  it('uses the tempo from config (BOT-01)', () => {
    expect(botDelay('novice')).toBe(config.bots.novice);
    expect(botDelay('deft')).toBe(12);
  });

  it('BOT-03: never uses boosters or continue', () => {
    const lvl = level({
      stepTicks: 5,
      spawn: {
        perStep: [2, 3],
        weights: [
          { chain: 'wood', level: 1, w: 1 },
          { chain: 'garden', level: 1, w: 1 },
        ],
      },
    });
    const s = createState(lvl);
    const bot = new Bot(25);
    const seen = new Set<Action['type']>();
    for (let t = 0; t < 2000 && s.status === 'playing'; t++) {
      const actions = bot.next(s);
      for (const a of actions) seen.add(a.type);
      step(s, actions);
    }
    expect(seen.has('booster')).toBe(false);
    expect(seen.has('continue')).toBe(false);
    expect(s.status).toBe('lost');
  });
});
