import type { LocalPlatform } from './LocalPlatform';
import type { Platform } from './Platform';
import { YandexPlatform } from './YandexPlatform';

export type { Platform } from './Platform';

export interface PlatformHandle {
  platform: Platform;
  /** Set when the game runs on LocalPlatform (dev and e2e builds): overlays and test hooks. */
  local: LocalPlatform | null;
}

/**
 * The release build knows only YandexPlatform: LocalPlatform with its stand-in ad overlays never
 * ships (YG-13, checked by check:build). Dev and e2e builds use LocalPlatform when there is no
 * SDK (the /sdk.js stub) and YandexPlatform under `npm run dev:yg`, where the proxy serves it.
 */
export async function createPlatform(iap: boolean): Promise<PlatformHandle> {
  if (__DEV_HOOKS__ && !window.YaGames) {
    const { LocalPlatform } = await import('./LocalPlatform');
    const local = new LocalPlatform();
    return { platform: local, local };
  }
  return { platform: new YandexPlatform(iap), local: null };
}
