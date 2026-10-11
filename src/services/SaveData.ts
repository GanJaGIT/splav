import type { BoosterId } from '../config';

/** §3.12: saved progress. `v` is the schema version, `updatedAt` picks the fresher copy (YG-07). */
export interface SaveData {
  v: number;
  updatedAt: number;
  levels: Record<string, { stars: number }>;
  coins: number;
  buildings: string[];
  boosters: Record<BoosterId, number>;
  found: string[];
  daily: { dayIndex: number; best: number; giftTaken: boolean };
  lastGiftDay: number;
  settings: { sound: boolean; music: boolean; lang: string | null; calm: boolean };
  noAds: boolean;
  reviewAsked: boolean;
  tutorialSeen: string[];
  lastInterstitialAt: number;
}
