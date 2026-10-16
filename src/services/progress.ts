/**
 * TECH-13: the player's progress on top of the save — stars, coins, buildings and their effects
 * (VIL-02), chapter unlocks, boosters and gifts (GD-80), the encyclopedia (GD-23), "New" cards
 * (TUT-02) and settings. Every change is saved right away (YG-08).
 */

import { BOOSTER_IDS, type BoosterId } from '../config';
import type { BoosterDef, BuildingDef } from '../content/schema';
import { parseLevelId, type Chain, type LevelData } from '../sim';
import type { SaveData } from './SaveData';
import type { SaveService } from './save';

export interface ProgressContent {
  order: readonly string[];
  levels: Record<string, LevelData>;
  buildings: readonly BuildingDef[];
  boosters: readonly BoosterDef[];
}

export interface NextLevel {
  id: string;
  /** The level waits for a building (VIL-02: the mill opens chapter 2, the bridge chapter 3). */
  gate: string | null;
}

export interface WinResult {
  coins: number;
  firstWin: boolean;
  gift: { booster: BoosterId; count: number } | null;
}

export const itemKey = (chain: Chain, level: number): string => `${chain}.${level}`;

export class ProgressService {
  constructor(
    private readonly save: SaveService,
    private readonly c: ProgressContent,
  ) {}

  get data(): SaveData {
    return this.save.data;
  }

  // -------------------------------------------------------------------------------------------
  // Levels and chapters

  stars(id: string): number {
    return this.data.levels[id]?.stars ?? 0;
  }

  completed(id: string): boolean {
    return this.data.levels[id] !== undefined;
  }

  totalStars(): number {
    return Object.values(this.data.levels).reduce((a, l) => a + l.stars, 0);
  }

  /** True once nothing is completed yet (UI-02: the first launch goes straight to c1-01). */
  firstLaunch(): boolean {
    return Object.keys(this.data.levels).length === 0;
  }

  /** The building whose effect opens the chapter (buildings.json, VIL-02). */
  gateOf(chapter: number): string | null {
    const b = this.c.buildings.find(
      (x) => x.effect.type === 'chapter' && x.effect.value === chapter,
    );
    return b?.id ?? null;
  }

  chapterOpen(chapter: number): boolean {
    const gate = this.gateOf(chapter);
    return gate === null || this.built(gate);
  }

  /** Levels open one after another; a chapter also needs its building. */
  levelOpen(id: string): boolean {
    const i = this.c.order.indexOf(id);
    if (i < 0) return false;
    const chapter = parseLevelId(id)?.chapter ?? 1;
    if (!this.chapterOpen(chapter)) return false;
    return i === 0 || this.completed(this.c.order[i - 1] as string);
  }

  /** The level the "Play" button starts, or null when every level is passed. */
  nextLevel(): NextLevel | null {
    const id = this.c.order.find((x) => !this.completed(x));
    if (!id) return null;
    const chapter = parseLevelId(id)?.chapter ?? 1;
    return { id, gate: this.chapterOpen(chapter) ? null : this.gateOf(chapter) };
  }

  /** GD-63, VIL-02 (bathhouse): a win pays the level's coins; stars keep their best. */
  /** `alreadyPaid`: coins this attempt got for a loss before Continue (GD-52), after the bathhouse. */
  win(id: string, stars: number, coins: number, alreadyPaid = 0): WinResult {
    const firstWin = !this.completed(id);
    const paid = Math.max(0, Math.round(coins * this.coinFactor()) - alreadyPaid);
    this.data.coins += paid;
    this.data.levels[id] = { stars: Math.max(stars, this.stars(id)) };
    // GD-80: chapter finals give boosters for stars on the first win.
    const level = this.c.levels[id];
    let gift: WinResult['gift'] = null;
    if (firstWin && level?.gift && !level.intro?.startsWith('booster')) {
      gift = { booster: level.gift.booster, count: level.gift.count * stars };
      this.data.boosters[gift.booster] += gift.count;
    }
    this.save.commit(true);
    return { coins: paid, firstWin, gift };
  }

  /**
   * GD-63: a lost attempt pays half of the level's coins (already halved by the simulation),
   * minus what this attempt already got for an earlier loss.
   */
  loss(coins: number, alreadyPaid = 0): number {
    const paid = Math.max(0, Math.round(coins * this.coinFactor()) - alreadyPaid);
    if (paid > 0) {
      this.data.coins += paid;
      this.save.commit();
    }
    return paid;
  }

  // -------------------------------------------------------------------------------------------
  // Buildings (VIL-02)

  building(id: string): BuildingDef | undefined {
    return this.c.buildings.find((b) => b.id === id);
  }

  built(id: string): boolean {
    return this.data.buildings.includes(id);
  }

  canRestore(id: string): boolean {
    const b = this.building(id);
    return !!b && !this.built(id) && this.data.coins >= b.price;
  }

  restore(id: string): boolean {
    const b = this.building(id);
    if (!b || !this.canRestore(id)) return false;
    this.data.coins -= b.price;
    this.data.buildings.push(id);
    this.save.commit(true);
    return true;
  }

  /** The Shed: one more backwater slot. */
  backwaterFor(level: LevelData): number {
    const shed = this.c.buildings.find((b) => b.effect.type === 'backwater');
    if (shed && this.built(shed.id) && shed.effect.type === 'backwater') {
      return Math.max(level.backwater, shed.effect.value);
    }
    return level.backwater;
  }

  /** The Bathhouse: +10% coins for levels. */
  coinFactor(): number {
    let f = 1;
    for (const b of this.c.buildings) {
      if (b.effect.type === 'coinBonus' && this.built(b.id)) f += b.effect.value;
    }
    return f;
  }

  // -------------------------------------------------------------------------------------------
  // Boosters and gifts (GD-80)

  boosters(id: BoosterId): number {
    return this.data.boosters[id];
  }

  addBooster(id: BoosterId, n = 1): void {
    this.data.boosters[id] += n;
    this.save.commit();
  }

  useBooster(id: BoosterId): void {
    this.data.boosters[id] = Math.max(0, this.data.boosters[id] - 1);
    this.save.commit();
  }

  /** A booster is usable from the level that introduces it on. */
  boosterUnlocked(id: BoosterId, levelId: string | null): boolean {
    const def = this.c.boosters.find((b) => b.id === id);
    const at = def ? this.c.order.indexOf(def.unlockLevel) : -1;
    const cur = levelId ? this.c.order.indexOf(levelId) : -1;
    const reached = def ? this.completed(def.unlockLevel) : false;
    return at >= 0 && (cur >= at || reached);
  }

  /** TUT-02: a level that introduces a booster gives it once, when it first starts. */
  claimIntroGift(level: LevelData): WinResult['gift'] {
    const key = `gift:${level.id}`;
    if (!level.gift || !level.intro?.startsWith('booster') || this.seen(key)) return null;
    this.data.boosters[level.gift.booster] += level.gift.count;
    this.data.tutorialSeen.push(key);
    this.save.commit();
    return { ...level.gift };
  }

  /** VIL-02 (flower garden): one random booster a day. */
  dailyGiftReady(day: number): boolean {
    return (
      this.c.buildings.some((b) => b.effect.type === 'dailyGift' && this.built(b.id)) &&
      this.data.lastGiftDay !== day
    );
  }

  /** The booster the flower garden gives for a random number 0…1: one of the open ones. */
  dailyGiftChoice(r: number): BoosterId {
    const open = BOOSTER_IDS.filter((id) => this.boosterUnlocked(id, null));
    const pool = open.length > 0 ? open : (['dam'] as BoosterId[]);
    return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))] as BoosterId;
  }

  takeDailyGift(day: number, random: () => number): BoosterId | null {
    if (!this.dailyGiftReady(day)) return null;
    const id = this.dailyGiftChoice(random());
    this.data.boosters[id] += 1;
    this.data.lastGiftDay = day;
    this.save.commit();
    return id;
  }

  // -------------------------------------------------------------------------------------------
  // Encyclopedia (GD-23) and tutorials (TUT-02)

  found(chain: Chain, level: number): boolean {
    return this.data.found.includes(itemKey(chain, level));
  }

  /** Returns true when the item is new. Saved in a batch: it is not worth a cloud write by itself. */
  markFound(chain: Chain, level: number): boolean {
    if (this.found(chain, level)) return false;
    this.data.found.push(itemKey(chain, level));
    this.save.commit();
    return true;
  }

  seen(key: string): boolean {
    return this.data.tutorialSeen.includes(key);
  }

  markSeen(key: string): void {
    if (this.seen(key)) return;
    this.data.tutorialSeen.push(key);
    this.save.commit();
  }

  // -------------------------------------------------------------------------------------------
  // Settings (UI-06)

  setSettings(patch: Partial<SaveData['settings']>): void {
    Object.assign(this.data.settings, patch);
    this.save.commit();
  }

  // -------------------------------------------------------------------------------------------
  // Ads, purchases, review (YG-10, YG-14, YG-16)

  /** Campaign levels passed: YG-10 shows fullscreen ads from adsFromLevel on. */
  completedCount(): number {
    return this.c.order.filter((id) => this.completed(id)).length;
  }

  /** YG-10: the server time of the last fullscreen ad, so a reload does not reset the gap. */
  noteInterstitial(at: number): void {
    this.data.lastInterstitialAt = at;
    this.save.commit();
  }

  /** UI-07: "Double the coins" for a video. */
  addCoins(n: number): void {
    if (n <= 0) return;
    this.data.coins += n;
    this.save.commit(true);
  }

  /** YG-08: a purchase goes to the cloud at once. */
  commitImportant(): void {
    this.save.commit(true);
  }

  markReviewAsked(): void {
    this.data.reviewAsked = true;
    this.save.commit();
  }

  // -------------------------------------------------------------------------------------------
  // The daily river (DAY-01…DAY-04)

  /** DAY-01: the Pier opens the daily river. */
  dailyOpen(): boolean {
    return this.c.buildings.some((b) => b.effect.type === 'daily' && this.built(b.id));
  }

  /** Today's best result (coins earned on the level), 0 before the first win of the day. */
  dailyBest(day: number): number {
    return this.data.daily.dayIndex === day ? this.data.daily.best : 0;
  }

  /**
   * DAY-02, DAY-04: a won daily attempt. Pays its coins like a replayed level (and the bathhouse),
   * keeps the best result of the day and gives one open booster for the first win of the day.
   */
  dailyWin(
    day: number,
    score: number,
    coins: number,
    alreadyPaid: number,
    random: () => number,
  ): DailyWinResult {
    if (this.data.daily.dayIndex !== day) {
      this.data.daily = { dayIndex: day, best: 0, giftTaken: false };
    }
    const paid = Math.max(0, Math.round(Math.max(0, coins) * this.coinFactor()) - alreadyPaid);
    this.data.coins += paid;
    const newBest = score > this.data.daily.best;
    if (newBest) this.data.daily.best = score;
    let gift: BoosterId | null = null;
    if (!this.data.daily.giftTaken) {
      gift = this.dailyGiftChoice(random());
      this.data.boosters[gift] += 1;
      this.data.daily.giftTaken = true;
    }
    this.save.commit(true);
    return { coins: paid, best: this.data.daily.best, newBest, gift };
  }
}

export interface DailyWinResult {
  coins: number;
  best: number;
  newBest: boolean;
  gift: BoosterId | null;
}
