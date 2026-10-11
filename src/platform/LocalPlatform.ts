import type { SaveData } from '../services/SaveData';
import type { Entries, Platform, Product, Purchase } from './Platform';

const CLOUD_KEY = 'splav.cloud';
const PURCHASES_KEY = 'splav.dev.purchases';
const LEADERBOARD_KEY = 'splav.dev.leaderboard.';

/** Entry format of purchases-catalog.json (Yandex "local launch" docs). */
interface CatalogFileEntry {
  id: string;
  title: string;
  description: string;
  imageURI: string;
  price: string;
  priceValue: string;
  priceCurrencyCode: string;
  getPriceCurrencyImage?: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or blocked; the game keeps running (§5.1).
  }
}

interface OverlayButton {
  id: string;
  label: string;
}

/**
 * Stand-in for platform dialogs (ads, purchases). Developer-only, so its labels are not
 * game texts and do not go through i18n.
 */
function devOverlay(
  kind: string,
  title: string,
  buttons: OverlayButton[],
  autoCloseMs = 0,
): Promise<string> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'dev-overlay';
    el.dataset.kind = kind;
    el.style.cssText =
      'position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:16px;background:rgba(10,20,30,0.92);color:#fff;font:600 18px sans-serif;';
    const caption = document.createElement('div');
    caption.textContent = title;
    el.appendChild(caption);
    let done = false;
    const finish = (id: string): void => {
      if (done) return;
      done = true;
      el.remove();
      resolve(id);
    };
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      btn.dataset.action = b.id;
      btn.style.cssText = 'min-width:120px;min-height:44px;font:600 16px sans-serif;';
      btn.addEventListener('click', () => finish(b.id));
      el.appendChild(btn);
    }
    if (autoCloseMs > 0) window.setTimeout(() => finish('timeout'), autoCloseMs);
    document.body.appendChild(el);
  });
}

/**
 * DEV-01: platform for `npm run dev` and tests. Ads and purchases are overlays, the "cloud"
 * save is a localStorage key, the language comes from `?lang=xx`, the date from `?date=YYYY-MM-DD`,
 * authorization from `?auth=1`.
 */
export class LocalPlatform implements Platform {
  /** Every platform call in order, for tests (DEV-02). */
  readonly calls: string[] = [];
  stickyVisible = false;

  private readonly params: URLSearchParams;
  private readonly pauseListeners: (() => void)[] = [];
  private readonly resumeListeners: (() => void)[] = [];
  private readonly startedAt = Date.now();
  private authorized: boolean;
  private reviewAsked = false;

  constructor(search: string = window.location.search) {
    this.params = new URLSearchParams(search);
    this.authorized = this.params.get('auth') === '1';
  }

  /** How many times a call was made (DEV-02). */
  count(name: string): number {
    return this.calls.filter((c) => c === name).length;
  }

  /** Emulates game_api_pause (DEV-02). */
  emitPause(): void {
    for (const cb of this.pauseListeners) cb();
  }

  /** Emulates game_api_resume (DEV-02). */
  emitResume(): void {
    for (const cb of this.resumeListeners) cb();
  }

  private record(name: string): void {
    this.calls.push(name);
  }

  async init(): Promise<void> {
    this.record('init');
  }

  gameReady(): void {
    this.record('gameReady');
  }

  gameplayStart(): void {
    this.record('gameplayStart');
  }

  gameplayStop(): void {
    this.record('gameplayStop');
  }

  onPause(cb: () => void): void {
    this.pauseListeners.push(cb);
  }

  onResume(cb: () => void): void {
    this.resumeListeners.push(cb);
  }

  lang(): string {
    return this.params.get('lang') ?? navigator.language ?? 'en';
  }

  isDesktop(): boolean {
    return !window.matchMedia('(pointer: coarse)').matches;
  }

  serverTime(): number {
    const date = this.params.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Noon in Moscow (UTC+3) of the given day, then the clock runs normally.
      const base = Date.parse(`${date}T12:00:00+03:00`);
      if (!Number.isNaN(base)) return base + (Date.now() - this.startedAt);
    }
    return Date.now();
  }

  async loadSave(): Promise<SaveData | null> {
    return readJson<SaveData>(CLOUD_KEY);
  }

  async writeSave(data: SaveData, flush: boolean): Promise<void> {
    this.record(flush ? 'writeSave:flush' : 'writeSave');
    writeJson(CLOUD_KEY, data);
  }

  isAuthorized(): boolean {
    return this.authorized;
  }

  async openAuth(): Promise<boolean> {
    this.record('openAuth');
    this.authorized = true;
    return true;
  }

  async showInterstitial(): Promise<void> {
    this.record('showInterstitial');
    await devOverlay('interstitial', 'Fullscreen ad (dev)', [{ id: 'close', label: '×' }], 1000);
  }

  async showRewarded(): Promise<boolean> {
    this.record('showRewarded');
    const choice = await devOverlay('rewarded', 'Rewarded video (dev)', [
      { id: 'watch', label: 'Watch to the end' },
      { id: 'close', label: 'Close' },
    ]);
    return choice === 'watch';
  }

  async showSticky(): Promise<void> {
    this.record('showSticky');
    this.stickyVisible = true;
  }

  async hideSticky(): Promise<void> {
    this.record('hideSticky');
    this.stickyVisible = false;
  }

  readonly purchases = {
    catalog: async (): Promise<Product[]> => {
      try {
        const res = await fetch('./purchases-catalog.json');
        if (!res.ok) return [];
        const raw = (await res.json()) as CatalogFileEntry[];
        return raw.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          imageURI: p.imageURI,
          price: p.price,
          priceValue: p.priceValue,
          priceCurrencyCode: p.priceCurrencyCode,
          currencyImageURI: p.getPriceCurrencyImage ?? '',
        }));
      } catch {
        return [];
      }
    },
    buy: async (id: string): Promise<Purchase> => {
      this.record(`buy:${id}`);
      const choice = await devOverlay('purchase', `Purchase "${id}" (dev)`, [
        { id: 'buy', label: 'Buy' },
        { id: 'cancel', label: 'Cancel' },
      ]);
      if (choice !== 'buy') throw new Error('Purchase cancelled');
      const purchase: Purchase = { productID: id, purchaseToken: `dev-${id}-${Date.now()}` };
      writeJson(PURCHASES_KEY, [...(readJson<Purchase[]>(PURCHASES_KEY) ?? []), purchase]);
      return purchase;
    },
    owned: async (): Promise<Purchase[]> => readJson<Purchase[]>(PURCHASES_KEY) ?? [],
    consume: async (token: string): Promise<void> => {
      this.record('consume');
      const left = (readJson<Purchase[]>(PURCHASES_KEY) ?? []).filter(
        (p) => p.purchaseToken !== token,
      );
      writeJson(PURCHASES_KEY, left);
    },
  };

  readonly leaderboard = {
    setScore: async (name: string, score: number): Promise<void> => {
      this.record(`setScore:${name}`);
      const best = readJson<number>(LEADERBOARD_KEY + name) ?? 0;
      writeJson(LEADERBOARD_KEY + name, Math.max(best, score));
    },
    entries: async (name: string): Promise<Entries> => {
      const score = readJson<number>(LEADERBOARD_KEY + name);
      if (score === null) return { userRank: 0, entries: [] };
      return { userRank: 1, entries: [{ rank: 1, score, name: '', isPlayer: true }] };
    },
  };

  readonly review = {
    canAsk: async (): Promise<boolean> => !this.reviewAsked,
    ask: async (): Promise<boolean> => {
      this.record('review');
      this.reviewAsked = true;
      return true;
    },
  };

  readonly shortcut = {
    canShow: async (): Promise<boolean> => this.params.get('shortcut') !== '0',
    show: async (): Promise<boolean> => {
      this.record('shortcut');
      return true;
    },
  };
}
