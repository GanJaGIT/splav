/**
 * §5: the Yandex Games SDK behind the Platform interface — the only place with YaGames and ysdk.
 * Written against the SDK docs of October 2026 (docs/yandex-sdk.md). An SDK failure never
 * breaks the game: ads, purchases and leaderboards just become unavailable, and saves keep
 * working locally (YG-07). Batching and limits of cloud writes are SaveService's job (YG-08).
 */

import type { SaveData } from '../services/SaveData';
import type { Entries, Platform, Product, Purchase } from './Platform';

// The parts of the SDK the game uses (sdk-*.md).
interface YPlayer {
  isAuthorized(): boolean;
  getUniqueID(): string;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

interface YProduct {
  id: string;
  title: string;
  description: string;
  imageURI: string;
  price: string;
  priceValue: string;
  priceCurrencyCode: string;
  getPriceCurrencyImage(size: 'small' | 'medium' | 'svg'): string;
}

interface YPurchase {
  productID: string;
  purchaseToken: string;
}

interface YPayments {
  getCatalog(): Promise<YProduct[]>;
  purchase(data: { id: string }): Promise<YPurchase>;
  getPurchases(): Promise<YPurchase[]>;
  consumePurchase(token: string): Promise<void>;
}

interface YEntry {
  score: number;
  rank: number;
  player: { publicName: string; uniqueID: string };
}

interface YAdvCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown: boolean) => void;
  onError?: (error: unknown) => void;
  onRewarded?: () => void;
}

interface YBannerStatus {
  stickyAdvIsShowing: boolean;
  reason?: string;
}

interface Ysdk {
  environment: { i18n: { lang: string } };
  deviceInfo: { isDesktop(): boolean };
  features: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  EVENTS?: { ACCOUNT_SELECTION_DIALOG_OPENED?: string; ACCOUNT_SELECTION_DIALOG_CLOSED?: string };
  on(event: string, cb: () => void): void;
  serverTime(): number;
  getPlayer(): Promise<YPlayer>;
  getPayments(): Promise<YPayments>;
  auth: { openAuthDialog(): Promise<void> };
  isAvailableMethod(name: string): Promise<boolean>;
  adv: {
    showFullscreenAdv(opts: { callbacks: YAdvCallbacks }): void;
    showRewardedVideo(opts: { callbacks: YAdvCallbacks }): void;
    showBannerAdv(): Promise<YBannerStatus>;
    hideBannerAdv(): Promise<YBannerStatus>;
    getBannerAdvStatus(): Promise<YBannerStatus>;
  };
  leaderboards: {
    setScore(name: string, score: number): Promise<void>;
    getEntries(
      name: string,
      opts: { quantityTop: number; includeUser: boolean; quantityAround: number },
    ): Promise<{ entries: YEntry[]; userRank: number }>;
  };
  feedback: {
    canReview(): Promise<{ value: boolean }>;
    requestReview(): Promise<{ feedbackSent: boolean }>;
  };
  shortcut: {
    canShowPrompt(): Promise<{ canShow: boolean }>;
    showPrompt(): Promise<{ outcome: string }>;
  };
  screen?: { fullscreen?: { status: string; request(): Promise<void> } };
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<Ysdk> };
  }
}

/** The cloud field that holds the whole save (player.setData). */
const CLOUD_KEY = 'save';
/** YG-15: the top 20 and the players around the player. */
const TOP = 20;
const AROUND = 3;

export class YandexPlatform implements Platform {
  private ysdk: Ysdk | null = null;
  private player: YPlayer | null = null;
  private payments: YPayments | null = null;
  private readonly pauseCbs: (() => void)[] = [];
  private readonly resumeCbs: (() => void)[] = [];
  private readonly accountCbs: (() => void)[] = [];
  /** YG-09: cloud writes wait while the player picks which progress to keep. */
  private syncPaused = false;

  constructor(private readonly iap: boolean) {}

  async init(): Promise<void> {
    try {
      if (!window.YaGames) return;
      const ysdk = await window.YaGames.init();
      this.ysdk = ysdk;
      // YG-04: the platform pauses the game (its start-up ad, its windows, a hidden tab).
      ysdk.on('game_api_pause', () => {
        for (const cb of this.pauseCbs) cb();
      });
      ysdk.on('game_api_resume', () => {
        for (const cb of this.resumeCbs) cb();
      });
      // YG-09: after a login the platform asks which progress to keep; then it is read again.
      // (The SDK mock of sdk-dev-proxy has no such events.)
      const opened = ysdk.EVENTS?.ACCOUNT_SELECTION_DIALOG_OPENED;
      const closed = ysdk.EVENTS?.ACCOUNT_SELECTION_DIALOG_CLOSED;
      if (opened && closed) {
        ysdk.on(opened, () => {
          this.syncPaused = true;
        });
        ysdk.on(closed, () => {
          void this.reloadPlayer().then(() => {
            this.syncPaused = false;
            for (const cb of this.accountCbs) cb();
          });
        });
      }
      await this.reloadPlayer();
      if (this.iap) this.payments = await ysdk.getPayments().catch(() => null);
    } catch {
      this.ysdk = null;
    }
  }

  private async reloadPlayer(): Promise<void> {
    if (!this.ysdk) return;
    this.player = await this.ysdk.getPlayer().catch(() => null);
  }

  gameReady(): void {
    try {
      this.ysdk?.features.LoadingAPI?.ready();
    } catch {
      // §5.1
    }
  }

  gameplayStart(): void {
    try {
      this.ysdk?.features.GameplayAPI?.start();
    } catch {
      // §5.1
    }
  }

  gameplayStop(): void {
    try {
      this.ysdk?.features.GameplayAPI?.stop();
    } catch {
      // §5.1
    }
  }

  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }

  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }

  onAccountChange(cb: () => void): void {
    this.accountCbs.push(cb);
  }

  lang(): string {
    try {
      return this.ysdk?.environment.i18n.lang ?? navigator.language;
    } catch {
      return navigator.language;
    }
  }

  isDesktop(): boolean {
    try {
      return this.ysdk
        ? this.ysdk.deviceInfo.isDesktop()
        : !matchMedia('(pointer: coarse)').matches;
    } catch {
      return true;
    }
  }

  serverTime(): number {
    try {
      return this.ysdk ? this.ysdk.serverTime() : Date.now();
    } catch {
      return Date.now();
    }
  }

  /** YG-20: on a phone, fullscreen on the first touch if the platform did not turn it on. */
  requestFullscreen(): void {
    const fs = this.ysdk?.screen?.fullscreen;
    if (!fs || this.isDesktop() || fs.status === 'on') return;
    void fs.request().catch(() => undefined);
  }

  // ---------------------------------------------------------------- saves (YG-07, YG-08)

  async loadSave(): Promise<SaveData | null> {
    if (!this.player) return null;
    try {
      const data = await this.player.getData([CLOUD_KEY]);
      const v = data[CLOUD_KEY];
      return typeof v === 'object' && v !== null ? (v as SaveData) : null;
    } catch {
      return null;
    }
  }

  async writeSave(data: SaveData, flush: boolean): Promise<void> {
    // While the player picks an account the old progress must not overwrite the chosen one.
    if (!this.player || this.syncPaused) return;
    await this.player.setData({ [CLOUD_KEY]: data }, flush);
  }

  // ---------------------------------------------------------------- the player (YG-09)

  isAuthorized(): boolean {
    try {
      return this.player?.isAuthorized() ?? false;
    } catch {
      return false;
    }
  }

  async openAuth(): Promise<boolean> {
    if (!this.ysdk) return false;
    try {
      await this.ysdk.auth.openAuthDialog();
      await this.reloadPlayer();
      return this.isAuthorized();
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- ads (YG-10…YG-12)

  showInterstitial(): Promise<void> {
    const adv = this.ysdk?.adv;
    if (!adv) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        // The game goes on in onClose — also when the platform did not show it (wasShown false).
        adv.showFullscreenAdv({
          callbacks: { onClose: () => resolve(), onError: () => resolve() },
        });
      } catch {
        resolve();
      }
    });
  }

  showRewarded(): Promise<boolean> {
    const adv = this.ysdk?.adv;
    if (!adv) return Promise.resolve(false);
    return new Promise((resolve) => {
      let rewarded = false;
      try {
        adv.showRewardedVideo({
          callbacks: {
            // YG-11: the reward only in onRewarded.
            onRewarded: () => {
              rewarded = true;
            },
            onClose: () => resolve(rewarded),
            onError: () => resolve(false),
          },
        });
      } catch {
        resolve(false);
      }
    });
  }

  async showSticky(): Promise<void> {
    const adv = this.ysdk?.adv;
    if (!adv) return;
    try {
      const status = await adv.getBannerAdvStatus();
      if (!status.stickyAdvIsShowing && !status.reason) await adv.showBannerAdv();
    } catch {
      // No banner now.
    }
  }

  async hideSticky(): Promise<void> {
    try {
      await this.ysdk?.adv.hideBannerAdv();
    } catch {
      // §5.1
    }
  }

  // ---------------------------------------------------------------- purchases (YG-14)

  readonly purchases = {
    catalog: async (): Promise<Product[]> => {
      if (!this.payments) return [];
      const list = await this.payments.getCatalog();
      return list.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        imageURI: p.imageURI,
        price: p.price,
        priceValue: p.priceValue,
        priceCurrencyCode: p.priceCurrencyCode,
        currencyImageURI: p.getPriceCurrencyImage('svg'),
      }));
    },
    buy: async (id: string): Promise<Purchase> => {
      if (!this.payments) throw new Error('payments unavailable');
      const p = await this.payments.purchase({ id });
      return { productID: p.productID, purchaseToken: p.purchaseToken };
    },
    owned: async (): Promise<Purchase[]> => {
      if (!this.payments) return [];
      const list = await this.payments.getPurchases();
      return list.map((p) => ({ productID: p.productID, purchaseToken: p.purchaseToken }));
    },
    consume: async (token: string): Promise<void> => {
      await this.payments?.consumePurchase(token);
    },
  };

  // ---------------------------------------------------------------- leaderboards (YG-15)

  readonly leaderboard = {
    setScore: async (name: string, score: number): Promise<void> => {
      const ysdk = this.ysdk;
      if (!ysdk || !this.isAuthorized()) return;
      if (!(await ysdk.isAvailableMethod('leaderboards.setScore'))) return;
      await ysdk.leaderboards.setScore(name, Math.max(0, Math.floor(score)));
    },
    entries: async (name: string): Promise<Entries> => {
      const ysdk = this.ysdk;
      if (!ysdk) return { entries: [], userRank: 0 };
      const authorized = this.isAuthorized();
      const res = await ysdk.leaderboards.getEntries(name, {
        quantityTop: TOP,
        includeUser: authorized,
        quantityAround: AROUND,
      });
      const me = authorized ? this.player?.getUniqueID() : undefined;
      return {
        userRank: res.userRank,
        entries: res.entries.map((e) => ({
          rank: e.rank,
          score: e.score,
          name: e.player.publicName,
          isPlayer: me !== undefined && e.player.uniqueID === me,
        })),
      };
    },
  };

  // ---------------------------------------------------------------- review and shortcut

  readonly review = {
    canAsk: async (): Promise<boolean> => {
      try {
        return (await this.ysdk?.feedback.canReview())?.value ?? false;
      } catch {
        return false;
      }
    },
    ask: async (): Promise<boolean> => {
      try {
        return (await this.ysdk?.feedback.requestReview())?.feedbackSent ?? false;
      } catch {
        return false;
      }
    },
  };

  readonly shortcut = {
    canShow: async (): Promise<boolean> => {
      try {
        return (await this.ysdk?.shortcut.canShowPrompt())?.canShow ?? false;
      } catch {
        return false;
      }
    },
    show: async (): Promise<boolean> => {
      try {
        return (await this.ysdk?.shortcut.showPrompt())?.outcome === 'accepted';
      } catch {
        return false;
      }
    },
  };
}
