import type { SaveData } from '../services/SaveData';

/** YG-14: a catalog item. Prices and the currency icon come from the platform. */
export interface Product {
  id: string;
  title: string;
  description: string;
  imageURI: string;
  price: string;
  priceValue: string;
  priceCurrencyCode: string;
  currencyImageURI: string;
}

export interface Purchase {
  productID: string;
  purchaseToken: string;
}

export interface LeaderboardEntry {
  rank: number;
  score: number;
  name: string;
  isPlayer: boolean;
}

export interface Entries {
  /** 0 when the player has no result in this leaderboard. */
  userRank: number;
  entries: LeaderboardEntry[];
}

/**
 * §5.1: everything the game asks of the platform. Implementations: YandexPlatform (Stage 4)
 * and LocalPlatform (DEV-01). No method may crash the game: failures make ads, purchases
 * and leaderboards unavailable instead.
 */
export interface Platform {
  init(): Promise<void>;
  /** LoadingAPI.ready() */
  gameReady(): void;
  /** GameplayAPI.start() */
  gameplayStart(): void;
  /** GameplayAPI.stop() */
  gameplayStop(): void;
  /** game_api_pause */
  onPause(cb: () => void): void;
  /** game_api_resume */
  onResume(cb: () => void): void;
  lang(): string;
  isDesktop(): boolean;
  /** ysdk.serverTime(), fallback Date.now() */
  serverTime(): number;
  loadSave(): Promise<SaveData | null>;
  writeSave(data: SaveData, flush: boolean): Promise<void>;
  isAuthorized(): boolean;
  openAuth(): Promise<boolean>;
  /** Resolves after the ad is closed or failed. */
  showInterstitial(): Promise<void>;
  /** true when the reward is granted. */
  showRewarded(): Promise<boolean>;
  showSticky(): Promise<void>;
  hideSticky(): Promise<void>;
  purchases: {
    catalog(): Promise<Product[]>;
    buy(id: string): Promise<Purchase>;
    owned(): Promise<Purchase[]>;
    consume(token: string): Promise<void>;
  };
  leaderboard: {
    setScore(name: string, score: number): Promise<void>;
    entries(name: string): Promise<Entries>;
  };
  review: { canAsk(): Promise<boolean>; ask(): Promise<boolean> };
  shortcut: { canShow(): Promise<boolean>; show(): Promise<boolean> };
}
