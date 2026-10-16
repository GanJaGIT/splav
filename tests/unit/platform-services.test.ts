import { describe, expect, it } from 'vitest';
import { boosters, buildings, shopProducts } from '../../src/content';
import type { Entries, Platform, Purchase } from '../../src/platform/Platform';
import { AdService } from '../../src/services/ads';
import { dayIndex, moscowDate } from '../../src/services/day';
import { GameplayState } from '../../src/services/gameplay-state';
import { dailyScore, LeaderboardService } from '../../src/services/leaderboard';
import { ProgressService } from '../../src/services/progress';
import { SaveService, type KeyValueStorage } from '../../src/services/save';
import type { SaveData } from '../../src/services/SaveData';
import { ShopService } from '../../src/services/shop';
import type { LevelData } from '../../src/sim';
import { level } from './sim/helpers';

/** Stage 4 services: AdService (YG-10…YG-12), LeaderboardService (YG-15), ShopService (YG-14). */

class Memory implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

interface Fake {
  platform: Platform;
  calls: string[];
  time: { now: number };
  owned: Purchase[];
  authorized: { on: boolean };
  cloud: { save: SaveData | null };
}

function fake(): Fake {
  const calls: string[] = [];
  const time = { now: 1_800_000_000_000 };
  const owned: Purchase[] = [];
  const authorized = { on: true };
  const cloud: { save: SaveData | null } = { save: null };
  const platform = {
    serverTime: () => time.now,
    isAuthorized: () => authorized.on,
    loadSave: async () => cloud.save,
    writeSave: async () => undefined,
    gameplayStart: () => calls.push('start'),
    gameplayStop: () => calls.push('stop'),
    showInterstitial: async () => {
      calls.push('interstitial');
    },
    showRewarded: async () => {
      calls.push('rewarded');
      return true;
    },
    showSticky: async () => {
      calls.push('show');
    },
    hideSticky: async () => {
      calls.push('hide');
    },
    leaderboard: {
      setScore: async (name: string, score: number) => {
        calls.push(`score:${name}:${score}`);
      },
      entries: async (name: string): Promise<Entries> => {
        calls.push(`entries:${name}`);
        return { userRank: 1, entries: [] };
      },
    },
    purchases: {
      catalog: async () =>
        ['no_ads', 'boosters_10', 'unknown'].map((id) => ({
          id,
          title: id,
          description: '',
          imageURI: '',
          price: '1 YAN',
          priceValue: '1',
          priceCurrencyCode: 'YAN',
          currencyImageURI: '',
        })),
      buy: async (id: string): Promise<Purchase> => {
        if (id === 'fail') throw new Error('cancelled');
        const p = { productID: id, purchaseToken: `t-${id}-${owned.length}` };
        owned.push(p);
        return p;
      },
      owned: async () => [...owned],
      consume: async (token: string) => {
        calls.push(`consume:${token}`);
        owned.splice(
          owned.findIndex((p) => p.purchaseToken === token),
          1,
        );
      },
    },
  } as unknown as Platform;
  return { platform, calls, time, owned, authorized, cloud };
}

const ORDER = ['c1-01', 'c1-02', 'c1-03', 'c1-04', 'c1-05', 'c1-06', 'c1-07'];
const LEVELS: Record<string, LevelData> = Object.fromEntries(
  ORDER.map((id) => [id, level({ id })]),
);

async function progressOn(f: Fake): Promise<{ p: ProgressService; save: SaveService }> {
  const save = new SaveService(f.platform, new Memory(), () => f.time.now);
  await save.load();
  return {
    p: new ProgressService(save, { order: ORDER, levels: LEVELS, buildings, boosters }),
    save,
  };
}

const lifecycle = (log: string[]): { setAd(on: boolean): void } => ({
  setAd: (on) => log.push(on ? 'silent' : 'sound'),
});

describe('AdService (YG-10…YG-12)', () => {
  it('YG-10: a fullscreen ad from c1-06 on, at most once in 180 s by the server clock', async () => {
    const f = fake();
    const { p } = await progressOn(f);
    const log: string[] = [];
    const ads = new AdService(f.platform, lifecycle(log), p);
    for (const id of ORDER.slice(0, 5)) p.win(id, 2, 0);
    expect(ads.interstitialDue()).toBe(false);
    p.win('c1-06', 2, 0);
    expect(ads.interstitialDue()).toBe(true);
    await ads.interstitial();
    expect(f.calls).toEqual(['interstitial']);
    expect(log).toEqual(['silent', 'sound']);
    f.time.now += 179_000;
    expect(ads.interstitialDue()).toBe(false);
    await ads.interstitial();
    expect(f.calls).toEqual(['interstitial']);
    f.time.now += 1_000;
    expect(ads.interstitialDue()).toBe(true);
    p.data.noAds = true;
    expect(ads.interstitialDue()).toBe(false);
  });

  it('YG-11: a rewarded video says whether the reward is due; one at a time', async () => {
    const f = fake();
    const { p } = await progressOn(f);
    const ads = new AdService(f.platform, lifecycle([]), p);
    const [a, b] = await Promise.all([ads.rewarded(), ads.rewarded()]);
    expect([a, b]).toEqual([true, false]);
    expect(ads.showing()).toBe(false);
  });

  it('YG-12: the banner in the village only, and never after "No ads"', async () => {
    const f = fake();
    const { p } = await progressOn(f);
    const ads = new AdService(f.platform, lifecycle([]), p);
    ads.setBanner(true);
    ads.setBanner(true);
    ads.setBanner(false);
    ads.setBanner(true);
    p.data.noAds = true;
    ads.refreshBanner();
    ads.setBanner(true);
    expect(f.calls).toEqual(['show', 'hide', 'show', 'hide']);
  });
});

describe('LeaderboardService (YG-15, DAY-03)', () => {
  it('sends only for signed-in players and only growing scores, a second apart', async () => {
    const f = fake();
    const waits: number[] = [];
    const boards = new LeaderboardService(
      f.platform,
      () => 0,
      async (ms) => {
        waits.push(ms);
      },
    );
    f.authorized.on = false;
    boards.submit('stars', 10);
    f.authorized.on = true;
    boards.submit('stars', 10);
    await new Promise((r) => setTimeout(r, 0));
    boards.submit('stars', 9);
    boards.submit('stars', 10);
    boards.submit('stars', 12);
    await new Promise((r) => setTimeout(r, 0));
    expect(f.calls).toEqual(['score:stars:10', 'score:stars:12']);
    expect(waits.every((ms) => ms >= 1000)).toBe(true);
  });

  it('caches entries for 60 s', async () => {
    const f = fake();
    let now = 0;
    const boards = new LeaderboardService(f.platform, () => now);
    await boards.entries('daily');
    await boards.entries('daily');
    now = 61_000;
    await boards.entries('daily');
    expect(f.calls).toEqual(['entries:daily', 'entries:daily']);
  });

  it('DAY-03: the day number sits in the score', () => {
    expect(dailyScore(288, 883)).toBe(28_800_883);
    expect(dailyScore(288, 250_000)).toBe(28_899_999);
    expect(Math.floor(dailyScore(288, 5) / 100_000)).toBe(288);
  });
});

describe('ShopService (YG-14)', () => {
  it('"No ads" turns the ads off and gives its boosters once; a pack is granted, then consumed', async () => {
    const f = fake();
    const { p } = await progressOn(f);
    let noAds = 0;
    const shop = new ShopService(f.platform, p, shopProducts, true, () => noAds++);
    await shop.init();
    expect(shop.products.map((x) => x.id)).toEqual(['no_ads', 'boosters_10']);
    expect(await shop.buy('no_ads')).toBe('ok');
    expect([p.data.noAds, noAds]).toEqual([true, 1]);
    expect(p.data.boosters).toEqual({ dam: 2, hook: 1, joker: 1, net: 1 });
    // At the next launch the platform still has it: nothing is given twice.
    await shop.init();
    expect(p.data.boosters).toEqual({ dam: 2, hook: 1, joker: 1, net: 1 });
    expect(await shop.buy('boosters_10')).toBe('ok');
    expect(p.data.boosters).toEqual({ dam: 5, hook: 4, joker: 4, net: 2 });
    expect(f.calls).toContain('consume:t-boosters_10-1');
    expect(await shop.buy('fail')).toBe('failed');
  });

  it('1.13.1: purchases not applied before come at launch', async () => {
    const f = fake();
    f.owned.push({ productID: 'boosters_10', purchaseToken: 'lost' });
    const { p } = await progressOn(f);
    await new ShopService(f.platform, p, shopProducts, true, () => undefined).init();
    expect(p.data.boosters.dam).toBe(3);
    expect(f.calls).toEqual(['consume:lost']);
  });

  it('does nothing behind the flag', async () => {
    const f = fake();
    f.owned.push({ productID: 'boosters_10', purchaseToken: 'x' });
    const { p } = await progressOn(f);
    const shop = new ShopService(f.platform, p, shopProducts, false, () => undefined);
    await shop.init();
    expect([shop.products.length, p.data.boosters.dam]).toEqual([0, 0]);
  });
});

describe('the daily river in the progress (DAY-01…DAY-04)', () => {
  it('opens with the Pier, keeps the best of the day, a booster for the first win of each day', async () => {
    const f = fake();
    const { p } = await progressOn(f);
    expect(p.dailyOpen()).toBe(false);
    p.data.coins = 10_000;
    p.restore('pier');
    expect(p.dailyOpen()).toBe(true);
    const day = dayIndex(f.time.now);
    const a = p.dailyWin(day, 300, 320, 0, () => 0);
    expect(a).toMatchObject({ coins: 320, best: 300, newBest: true, gift: 'dam' });
    const b = p.dailyWin(day, 200, 220, 0, () => 0);
    expect(b).toMatchObject({ best: 300, newBest: false, gift: null });
    expect(p.dailyBest(day)).toBe(300);
    expect(p.dailyBest(day + 1)).toBe(0);
    expect(p.dailyWin(day + 1, 100, 100, 40, () => 0)).toMatchObject({ coins: 60, gift: 'dam' });
  });

  it('the date is Moscow time', () => {
    // 22:30 UTC on 15 October is 01:30 on 16 October in Moscow.
    const t = Date.UTC(2026, 9, 15, 22, 30);
    expect(moscowDate(t)).toBe('2026-10-16');
    expect(dayIndex(t)).toBe(288);
  });
});

describe('YG-09, YG-04: account change and the platform resume', () => {
  it('after the account dialog the cloud copy replaces the progress', async () => {
    const f = fake();
    const { p, save } = await progressOn(f);
    p.data.coins = 50;
    f.cloud.save = { ...p.data, coins: 777, updatedAt: 1 };
    await save.reloadFromCloud();
    expect(p.data.coins).toBe(777);
  });

  it('after game_api_resume a paused game sends stop() again', () => {
    const f = fake();
    const g = new GameplayState(f.platform);
    g.reassert();
    expect(f.calls).toEqual(['stop']);
  });
});
