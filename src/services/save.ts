/**
 * YG-07, YG-08, TECH-13: progress is written to localStorage right after every change and to the
 * platform cloud — at once for important changes (level passed, building, purchase), otherwise in
 * a batch at most every 10 s and when the tab is hidden. At most 80 cloud writes in 5 minutes
 * (the SDK allows 100). On load the fresher copy wins by `updatedAt`.
 */

import { BOOSTER_IDS, config } from '../config';
import type { Platform } from '../platform/Platform';
import type { SaveData } from './SaveData';

export const SAVE_VERSION = 1;
export const LOCAL_KEY = 'splav.save';
/** YG-08: our limit; the SDK allows 200 KB. */
export const MAX_SAVE_BYTES = 50 * 1024;
const CLOUD_GAP_MS = 10_000;
const CLOUD_LIMIT = 80;
const CLOUD_WINDOW_MS = 5 * 60_000;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    updatedAt: 0,
    levels: {},
    coins: 0,
    buildings: [],
    boosters: { ...config.startBoosters },
    found: [],
    daily: { dayIndex: 0, best: 0, giftTaken: false },
    lastGiftDay: 0,
    settings: { sound: true, music: true, lang: null, calm: false },
    noAds: false,
    reviewAsked: false,
    tutorialSeen: [],
    lastInterstitialAt: 0,
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];

/**
 * Reads any stored copy into the current schema: unknown or broken fields fall back to defaults,
 * so a damaged save never breaks the game. Returns null when there is nothing usable.
 */
export function migrate(raw: unknown): SaveData | null {
  if (typeof raw === 'string') {
    try {
      return migrate(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  if (!isObj(raw)) return null;
  const d = defaultSave();
  // v1 is the first schema; later versions add their steps here.
  d.updatedAt = count(raw.updatedAt);
  if (isObj(raw.levels)) {
    for (const [id, l] of Object.entries(raw.levels)) {
      if (isObj(l)) d.levels[id] = { stars: Math.min(3, count(l.stars)) };
    }
  }
  d.coins = count(raw.coins);
  d.buildings = strings(raw.buildings);
  const b = isObj(raw.boosters) ? raw.boosters : {};
  for (const id of BOOSTER_IDS) d.boosters[id] = count(b[id], d.boosters[id]);
  d.found = strings(raw.found);
  if (isObj(raw.daily)) {
    d.daily = {
      dayIndex: count(raw.daily.dayIndex),
      best: count(raw.daily.best),
      giftTaken: flag(raw.daily.giftTaken, false),
    };
  }
  d.lastGiftDay = count(raw.lastGiftDay);
  if (isObj(raw.settings)) {
    const s = raw.settings;
    d.settings = {
      sound: flag(s.sound, true),
      music: flag(s.music, true),
      lang: typeof s.lang === 'string' ? s.lang : null,
      calm: flag(s.calm, false),
    };
  }
  d.noAds = flag(raw.noAds, false);
  d.reviewAsked = flag(raw.reviewAsked, false);
  d.tutorialSeen = strings(raw.tutorialSeen);
  d.lastInterstitialAt = count(raw.lastInterstitialAt);
  return d;
}

export function saveSize(data: SaveData): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

export class SaveService {
  data: SaveData = defaultSave();
  /** Writes that the cloud has not got yet. */
  private dirty = false;
  private lastCloud = -Infinity;
  private readonly cloudTimes: number[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly platform: Pick<Platform, 'loadSave' | 'writeSave'>,
    private readonly storage: KeyValueStorage | null,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** YG-07: the local and the cloud copy, the fresher one by updatedAt. */
  async load(): Promise<SaveData> {
    let local: SaveData | null;
    try {
      local = migrate(this.storage?.getItem(LOCAL_KEY) ?? null);
    } catch {
      local = null;
    }
    let cloud: SaveData | null;
    try {
      cloud = migrate(await this.platform.loadSave());
    } catch {
      cloud = null;
    }
    const best =
      local && cloud ? (cloud.updatedAt > local.updatedAt ? cloud : local) : (local ?? cloud);
    this.data = best ?? defaultSave();
    return this.data;
  }

  /**
   * YG-09: after the account selection dialog the platform's copy is the one the player chose:
   * it replaces the progress in memory and the local copy (no "fresher wins" here).
   */
  async reloadFromCloud(): Promise<void> {
    let cloud: SaveData | null;
    try {
      cloud = migrate(await this.platform.loadSave());
    } catch {
      cloud = null;
    }
    if (!cloud) return;
    this.data = cloud;
    try {
      this.storage?.setItem(LOCAL_KEY, JSON.stringify(this.data));
    } catch {
      // The cloud copy is in memory anyway.
    }
  }

  /** YG-08: after every change. `important` changes go to the cloud at once. */
  commit(important = false): void {
    this.data.updatedAt = this.now();
    try {
      this.storage?.setItem(LOCAL_KEY, JSON.stringify(this.data));
    } catch {
      // Storage is full or blocked; the cloud copy still goes.
    }
    this.dirty = true;
    if (important) this.pushCloud(true);
    else this.schedule();
  }

  /** The tab is being hidden: send what the cloud has not got. */
  flush(): void {
    if (this.dirty) this.pushCloud(true);
  }

  private schedule(): void {
    const wait = this.lastCloud + CLOUD_GAP_MS - this.now();
    if (wait <= 0) {
      this.pushCloud(false);
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.dirty) this.pushCloud(false);
    }, wait);
  }

  private pushCloud(flush: boolean): void {
    const now = this.now();
    while (this.cloudTimes.length > 0 && now - (this.cloudTimes[0] as number) >= CLOUD_WINDOW_MS) {
      this.cloudTimes.shift();
    }
    if (this.cloudTimes.length >= CLOUD_LIMIT) {
      // The limit is reached: try again once the oldest write leaves the window.
      if (!this.timer) {
        const wait = (this.cloudTimes[0] as number) + CLOUD_WINDOW_MS - now;
        this.timer = setTimeout(() => {
          this.timer = null;
          if (this.dirty) this.pushCloud(flush);
        }, wait);
      }
      return;
    }
    this.cloudTimes.push(now);
    this.lastCloud = now;
    this.dirty = false;
    const copy = JSON.parse(JSON.stringify(this.data)) as SaveData;
    try {
      void this.platform.writeSave(copy, flush).catch(() => undefined);
    } catch {
      // Platform errors never break the game (§5.1).
    }
  }

  /** For tests and the moderator: cloud writes in the last 5 minutes. */
  cloudWrites(): number {
    return this.cloudTimes.length;
  }
}
