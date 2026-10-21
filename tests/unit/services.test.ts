import { describe, expect, it } from 'vitest';
import { LevelSession } from '../../src/game/session';
import type { Platform } from '../../src/platform/Platform';
import { AudioService, mergePitch } from '../../src/services/audio';
import { GameplayState } from '../../src/services/gameplay-state';
import { level } from './sim/helpers';

function fakePlatform(): { platform: Platform; calls: string[] } {
  const calls: string[] = [];
  const platform = {
    gameplayStart: () => calls.push('start'),
    gameplayStop: () => calls.push('stop'),
  } as unknown as Platform;
  return { platform, calls };
}

const flush = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe('GameplayState (YG-03)', () => {
  it('starts in a level without windows, stops for windows and suspension, never twice in a row', async () => {
    const { platform, calls } = fakePlatform();
    const g = new GameplayState(platform);
    g.setReady();
    g.setInLevel(true);
    await flush();
    expect(calls).toEqual(['start']);
    g.windowOpened();
    g.windowOpened();
    g.windowClosed();
    await flush();
    expect(calls).toEqual(['start', 'stop']);
    g.windowClosed();
    await flush();
    expect(calls).toEqual(['start', 'stop', 'start']);
    g.setSuspended(true);
    g.setSuspended(true);
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
    expect(g.isPlaying()).toBe(false);
  });

  it('SND-02: tells the river murmur when the level is played and when it stops', async () => {
    const { platform } = fakePlatform();
    const audio = new AudioService();
    const g = new GameplayState(platform, (on) => audio.setRiver(on));
    g.setReady();
    g.setInLevel(true);
    await flush();
    expect(audio.riverOn()).toBe(true);
    g.windowOpened();
    expect(audio.riverOn()).toBe(false);
    g.windowClosed();
    await flush();
    expect(audio.riverOn()).toBe(true);
    g.setInLevel(false);
    expect(audio.riverOn()).toBe(false);
  });

  it('closing one window and opening another in one go sends nothing (п. 1.19.3)', async () => {
    const { platform, calls } = fakePlatform();
    const g = new GameplayState(platform);
    g.setReady();
    g.setInLevel(true);
    g.windowOpened();
    await flush();
    expect(calls).toEqual([]);
    g.windowClosed();
    g.windowOpened();
    await flush();
    expect(calls).toEqual([]);
  });

  it('YG-02: nothing goes before LoadingAPI.ready(); then the state is sent', async () => {
    const { platform, calls } = fakePlatform();
    const g = new GameplayState(platform);
    g.setInLevel(true);
    g.windowOpened();
    g.windowClosed();
    await flush();
    expect(calls).toEqual([]);
    g.setReady();
    await flush();
    expect(calls).toEqual(['start']);
  });

  it('survives platform errors (§5.1)', async () => {
    const g = new GameplayState({
      gameplayStart: () => {
        throw new Error('sdk');
      },
      gameplayStop: () => undefined,
    } as unknown as Platform);
    g.setReady();
    g.setInLevel(true);
    await flush();
    expect(g.isPlaying()).toBe(true);
  });
});

describe('AudioService (YG-05, FX-06)', () => {
  it('is silent while any reason is active or the player turned sound off', () => {
    const a = new AudioService();
    expect(a.audible()).toBe(true);
    a.setSilenced('blur', true);
    a.setSilenced('hidden', true);
    a.setSilenced('blur', false);
    expect(a.audible()).toBe(false);
    expect(a.silenceReasons()).toEqual(['hidden']);
    a.play('merge');
    expect(a.played).toEqual([]);
    a.setSilenced('hidden', false);
    a.setEnabled(false);
    expect(a.audible()).toBe(false);
    a.setEnabled(true);
    expect(a.isEnabled()).toBe(true);
    a.play('merge');
    expect(a.played).toEqual(['merge']);
  });

  it('SND-01: merges go up a pentatonic scale with the level and the combo', () => {
    const steps = [1, 2, 3, 4, 5, 6].map((lvl) => Math.round(12 * Math.log2(mergePitch(lvl, 1))));
    expect(steps).toEqual([0, 2, 4, 7, 9, 12]);
    expect(mergePitch(2, 3)).toBeCloseTo(mergePitch(4, 1));
    expect(mergePitch(6, 9)).toBe(mergePitch(6, 4));
  });

  it('plays at most 6 sounds a second', () => {
    const a = new AudioService();
    for (let i = 0; i < 10; i++) a.play('grab');
    expect(a.played).toHaveLength(6);
  });
});

describe('LevelSession clock (SIM-02, SIM-03)', () => {
  it('turns real time into whole ticks', () => {
    const s = new LevelSession(level(), 0, {});
    s.advance(250);
    expect(s.state.tick).toBe(2);
    expect(s.tickProgress()).toBeCloseTo(0.5);
    s.advance(50);
    expect(s.state.tick).toBe(3);
  });

  it('runs at most 5 ticks after a long frame and drops the rest', () => {
    const s = new LevelSession(level(), 0, {});
    s.advance(2000);
    expect(s.state.tick).toBe(5);
    expect(s.tickProgress()).toBe(0);
  });

  it('stands still while paused or stopped', () => {
    const s = new LevelSession(level(), 0, {});
    s.paused = true;
    s.advance(1000);
    s.paused = false;
    s.timeStopped = true;
    s.advance(1000);
    expect(s.state.tick).toBe(0);
    s.tick();
    expect(s.state.tick).toBe(1);
  });

  it('applies queued actions on the next tick and tells listeners', () => {
    const lvl = level({ initial: [{ col: 2, row: 3, chain: 'wood', level: 1 }] });
    const s = new LevelSession(lvl, 0, {});
    const seen: string[] = [];
    s.onTick((events) => seen.push(...events.map((e) => e.type)));
    s.queue({ type: 'grab', ref: { at: 'cell', col: 2, row: 3 } });
    expect(s.state.hand).toBeNull();
    s.tick();
    expect(seen).toEqual(['grab']);
    s.queue({ type: 'drop', ref: { at: 'cell', col: 0, row: 5 } });
    s.clearPending();
    s.applyNow([{ type: 'cancel' }]);
    expect(seen).toEqual(['grab', 'returned']);
    expect(s.state.tick).toBe(1);
  });

  it('a driver (bot) adds actions before every tick', () => {
    const s = new LevelSession(level(), 0, {});
    let calls = 0;
    s.driver = () => {
      calls++;
      return [];
    };
    s.tick();
    s.tick();
    expect(calls).toBe(2);
  });
});
