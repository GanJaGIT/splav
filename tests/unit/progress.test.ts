import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boosters, buildings } from '../../src/content';
import ru from '../../src/i18n/ru.json';
import type { SaveData } from '../../src/services/SaveData';
import { dayIndex } from '../../src/services/day';
import { ProgressService } from '../../src/services/progress';
import {
  defaultSave,
  LOCAL_KEY,
  MAX_SAVE_BYTES,
  migrate,
  SaveService,
  saveSize,
  type KeyValueStorage,
} from '../../src/services/save';
import type { LevelData } from '../../src/sim';
import { level } from './sim/helpers';

class Memory implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

function cloud(initial: SaveData | null = null): {
  platform: {
    loadSave(): Promise<SaveData | null>;
    writeSave(d: SaveData, f: boolean): Promise<void>;
  };
  writes: { data: SaveData; flush: boolean }[];
} {
  const writes: { data: SaveData; flush: boolean }[] = [];
  return {
    writes,
    platform: {
      loadSave: async () => initial,
      writeSave: async (data, flush) => {
        writes.push({ data, flush });
      },
    },
  };
}

describe('SaveService (YG-07, YG-08)', () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    vi.useFakeTimers();
  });

  it('starts from defaults and takes the fresher copy by updatedAt', async () => {
    const store = new Memory();
    expect((await new SaveService(cloud().platform, store, () => now).load()).coins).toBe(0);
    store.setItem(LOCAL_KEY, JSON.stringify({ ...defaultSave(), coins: 5, updatedAt: 10 }));
    const fresh = { ...defaultSave(), coins: 9, updatedAt: 20 };
    expect((await new SaveService(cloud(fresh).platform, store, () => now).load()).coins).toBe(9);
    const old = { ...defaultSave(), coins: 1, updatedAt: 5 };
    expect((await new SaveService(cloud(old).platform, store, () => now).load()).coins).toBe(5);
  });

  it('writes locally at once, important changes to the cloud at once', async () => {
    const store = new Memory();
    const c = cloud();
    const s = new SaveService(c.platform, store, () => now);
    await s.load();
    s.data.coins = 42;
    s.commit(true);
    expect(JSON.parse(store.getItem(LOCAL_KEY) ?? '{}')).toMatchObject({
      coins: 42,
      updatedAt: now,
    });
    expect(c.writes).toHaveLength(1);
    expect(c.writes[0]?.flush).toBe(true);
  });

  it('batches the rest at most every 10 s and flushes when hidden', async () => {
    const c = cloud();
    const s = new SaveService(c.platform, new Memory(), () => now);
    await s.load();
    s.commit(true);
    now += 2000;
    s.commit();
    s.commit();
    expect(c.writes).toHaveLength(1);
    now += 8000;
    vi.advanceTimersByTime(8000);
    expect(c.writes).toHaveLength(2);
    expect(c.writes[1]?.flush).toBe(false);
    now += 1000;
    s.commit();
    s.flush();
    expect(c.writes).toHaveLength(3);
    s.flush();
    expect(c.writes).toHaveLength(3);
  });

  it('never makes more than 80 cloud writes in 5 minutes', async () => {
    const c = cloud();
    const s = new SaveService(c.platform, new Memory(), () => now);
    await s.load();
    for (let i = 0; i < 120; i++) {
      now += 100;
      s.commit(true);
    }
    expect(c.writes).toHaveLength(80);
    expect(s.cloudWrites()).toBe(80);
    now += 5 * 60_000;
    vi.advanceTimersByTime(5 * 60_000);
    expect(c.writes).toHaveLength(81);
  });

  it('survives broken storage and cloud', async () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    const s = new SaveService(
      {
        loadSave: async () => {
          throw new Error('offline');
        },
        writeSave: () => {
          throw new Error('offline');
        },
      },
      broken,
      () => now,
    );
    expect((await s.load()).coins).toBe(0);
    expect(() => s.commit(true)).not.toThrow();
  });

  it('migrates and repairs saves', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate('{bad json')).toBeNull();
    expect(migrate([])).toBeNull();
    const m = migrate({
      coins: -5,
      levels: { 'c1-01': { stars: 9 }, x: 3 },
      buildings: ['pier', 7, 'pier'],
      boosters: { dam: 2, hook: 'x' },
      settings: { sound: false, lang: 'en' },
      found: ['wood.1'],
      tutorialSeen: 'oops',
    });
    expect(m).toMatchObject({
      v: 1,
      coins: 0,
      levels: { 'c1-01': { stars: 3 } },
      buildings: ['pier'],
      boosters: { dam: 2, hook: 0, joker: 0, net: 0 },
      settings: { sound: false, music: true, lang: 'en', calm: false },
      found: ['wood.1'],
      tutorialSeen: [],
    });
    expect(migrate(JSON.stringify(defaultSave()))).toEqual(defaultSave());
  });

  it('a full save stays under 50 KB', () => {
    const d = defaultSave();
    for (let c = 1; c <= 3; c++)
      for (let n = 1; n <= 12; n++) d.levels[`c${c}-${String(n).padStart(2, '0')}`] = { stars: 3 };
    for (const ch of ['wood', 'garden', 'stone', 'fish'])
      for (let l = 1; l <= 6; l++) d.found.push(`${ch}.${l}`);
    d.buildings = buildings.map((b) => b.id);
    d.tutorialSeen = Array.from({ length: 60 }, (_, i) => `intro:something-long-${i}`);
    d.coins = 99_999_999;
    expect(saveSize(d)).toBeLessThan(MAX_SAVE_BYTES);
  });
});

describe('ProgressService', () => {
  const order = ['c1-01', 'c1-02', 'c1-12', 'c2-01', 'c2-12', 'c3-01'];
  const lv = (id: string, over: Partial<LevelData> = {}): LevelData => level({ id, ...over });
  const levels: Record<string, LevelData> = {
    'c1-01': lv('c1-01'),
    'c1-02': lv('c1-02', { intro: 'booster-dam', gift: { booster: 'dam', count: 2 } }),
    'c1-12': lv('c1-12', { gift: { booster: 'dam', count: 1 } }),
    'c2-01': lv('c2-01'),
    'c2-12': lv('c2-12'),
    'c3-01': lv('c3-01'),
  };
  const make = async (): Promise<{ p: ProgressService; c: ReturnType<typeof cloud> }> => {
    const c = cloud();
    const s = new SaveService(c.platform, new Memory(), () => 1);
    await s.load();
    return { p: new ProgressService(s, { order, levels, buildings, boosters }), c };
  };

  it('opens levels one by one and chapters with their buildings (VIL-02)', async () => {
    const { p } = await make();
    expect(p.firstLaunch()).toBe(true);
    expect(p.nextLevel()).toEqual({ id: 'c1-01', gate: null });
    expect(p.levelOpen('c1-01')).toBe(true);
    expect(p.levelOpen('c1-02')).toBe(false);
    p.win('c1-01', 3, 50);
    p.win('c1-02', 2, 50);
    p.win('c1-12', 2, 50);
    expect(p.nextLevel()).toEqual({ id: 'c2-01', gate: 'mill' });
    expect(p.levelOpen('c2-01')).toBe(false);
    p.data.coins = 10_000;
    expect(p.restore('mill')).toBe(true);
    expect(p.levelOpen('c2-01')).toBe(true);
    expect(p.chapterOpen(3)).toBe(false);
    expect(p.levelOpen('nope')).toBe(false);
    // The gates come from the buildings' "chapter" effects in buildings.json.
    expect([1, 2, 3].map((n) => p.gateOf(n))).toEqual([null, 'mill', 'bridge']);
  });

  it('VIL-02: every chapter gate has its village message', () => {
    const chapterBuildings = buildings.filter((b) => b.effect.type === 'chapter');
    expect(chapterBuildings.length).toBeGreaterThan(0);
    const texts: Record<string, string> = ru;
    for (const b of chapterBuildings) expect(texts[`village.need.${b.id}`], b.id).toBeTruthy();
  });

  it('pays coins, keeps the best stars and counts them (GD-05, GD-63)', async () => {
    const { p, c } = await make();
    expect(p.win('c1-01', 2, 70)).toEqual({ coins: 70, firstWin: true, gift: null });
    expect(p.win('c1-01', 1, 30)).toMatchObject({ firstWin: false });
    expect(p.stars('c1-01')).toBe(2);
    expect(p.data.coins).toBe(100);
    expect(p.totalStars()).toBe(2);
    expect(c.writes[c.writes.length - 1]?.flush).toBe(true);
    expect(p.loss(0)).toBe(0);
    expect(p.loss(15)).toBe(15);
    expect(p.data.coins).toBe(115);
  });

  it('restores buildings for coins and applies their effects', async () => {
    const { p } = await make();
    expect(p.restore('pier')).toBe(false);
    p.data.coins = 100_000;
    expect(p.restore('pier')).toBe(true);
    expect(p.restore('pier')).toBe(false);
    expect(p.built('pier')).toBe(true);
    expect(p.backwaterFor(levels['c1-01'] as LevelData)).toBe(5);
    p.restore('shed');
    expect(p.backwaterFor(levels['c1-01'] as LevelData)).toBe(6);
    expect(p.coinFactor()).toBe(1);
    p.restore('bathhouse');
    expect(p.coinFactor()).toBeCloseTo(1.1);
    const before = p.data.coins;
    expect(p.win('c1-01', 3, 100).coins).toBe(110);
    expect(p.data.coins).toBe(before + 110);
    // GD-52, GD-63: a loss, Continue, a second loss, then a win pay round(full × 1.1) in total.
    const paid1 = p.loss(5); // round(5.5) = 6
    const paid2 = p.loss(9, paid1); // round(9.9) = 10 in total
    const win = p.win('c1-01', 1, 105, paid1 + paid2); // round(115.5) = 116 in total
    expect([paid1, paid1 + paid2, paid1 + paid2 + win.coins]).toEqual([6, 10, 116]);
    expect(p.loss(3, 10)).toBe(0);
  });

  it('gives booster gifts once: on the first start of an intro level, for stars on a final (GD-80)', async () => {
    const { p } = await make();
    expect(p.claimIntroGift(levels['c1-02'] as LevelData)).toEqual({ booster: 'dam', count: 2 });
    expect(p.claimIntroGift(levels['c1-02'] as LevelData)).toBeNull();
    expect(p.claimIntroGift(levels['c1-12'] as LevelData)).toBeNull();
    expect(p.boosters('dam')).toBe(2);
    expect(p.win('c1-12', 3, 10).gift).toEqual({ booster: 'dam', count: 3 });
    expect(p.win('c1-12', 3, 10).gift).toBeNull();
    expect(p.boosters('dam')).toBe(5);
    p.useBooster('dam');
    p.addBooster('net', 2);
    expect([p.boosters('dam'), p.boosters('net')]).toEqual([4, 2]);
  });

  it('the flower garden gives one booster a day', async () => {
    const { p } = await make();
    expect(p.dailyGiftReady(100)).toBe(false);
    p.data.coins = 100_000;
    p.restore('flowerbed');
    expect(p.dailyGiftReady(100)).toBe(true);
    expect(p.dailyGiftChoice(0.5)).toBe('dam');
    expect(p.takeDailyGift(100, () => 0.5)).toBe('dam');
    expect(p.takeDailyGift(100, () => 0.5)).toBeNull();
    expect(p.dailyGiftReady(101)).toBe(true);
    // Nothing is open in this test's level order, so the garden falls back to a dam.
    expect([0, 0.5, 0.99].map((r) => p.dailyGiftChoice(r))).toEqual(['dam', 'dam', 'dam']);
    // Only open boosters come: here the hook opens at c1-02, the others at c1-01.
    const s2 = new SaveService(cloud().platform, new Memory(), () => 1);
    await s2.load();
    const q = new ProgressService(s2, {
      order,
      levels,
      buildings,
      boosters: boosters.map((b) => ({ ...b, unlockLevel: b.id === 'hook' ? 'c1-02' : 'c1-01' })),
    });
    q.win('c1-01', 2, 0);
    expect(new Set([0, 0.34, 0.67, 0.99].map((r) => q.dailyGiftChoice(r)))).toEqual(
      new Set(['dam', 'joker', 'net']),
    );
  });

  it('remembers found items, seen cards and settings', async () => {
    const { p } = await make();
    expect(p.markFound('wood', 1)).toBe(true);
    expect(p.markFound('wood', 1)).toBe(false);
    expect(p.found('wood', 1)).toBe(true);
    p.markSeen('intro:pier');
    p.markSeen('intro:pier');
    expect(p.seen('intro:pier')).toBe(true);
    expect(p.data.tutorialSeen).toEqual(['intro:pier']);
    p.setSettings({ calm: true });
    expect(p.data.settings.calm).toBe(true);
  });

  it('opens boosters from their level on', async () => {
    const { p } = await make();
    expect(p.boosterUnlocked('dam', 'c1-01')).toBe(false);
    expect(p.boosterUnlocked('dam', null)).toBe(false);
  });
});

describe('dayIndex (DAY-03)', () => {
  it('counts days from 1 January 2026 in Moscow time', () => {
    expect(dayIndex(Date.UTC(2026, 0, 1, 0, 0))).toBe(0);
    expect(dayIndex(Date.UTC(2025, 11, 31, 21, 0))).toBe(0); // 00:00 in Moscow
    expect(dayIndex(Date.UTC(2025, 11, 31, 20, 59))).toBe(-1);
    expect(dayIndex(Date.UTC(2026, 9, 14, 12))).toBe(286);
  });
});
