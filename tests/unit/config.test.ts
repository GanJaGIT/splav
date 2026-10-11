import { describe, expect, it } from 'vitest';
import { BOOSTER_IDS, config } from '../../src/config';

describe('config (TECH-14)', () => {
  it('has the flags and constants from the spec', () => {
    expect(config.features).toEqual({ iap: false, metrica: false });
    expect(config.adsFromLevel).toBe(6);
    expect(config.interstitialMinGapSec).toBe(180);
    expect(config.tickMs).toBe(100);
    expect(config.maxTicksPerFrame).toBe(5);
    expect(config.holdMaxTicks).toBe(30);
    expect(config.comboWindowTicks).toBe(20);
    expect(config.bots).toEqual({ novice: 25, normal: 18, deft: 12 });
  });

  it('starts with every booster at zero', () => {
    expect(Object.keys(config.startBoosters).sort()).toEqual([...BOOSTER_IDS].sort());
    expect(Object.values(config.startBoosters).every((n) => n === 0)).toBe(true);
  });
});
