import { LocalPlatform } from './LocalPlatform';
import type { Platform } from './Platform';

export type { Platform } from './Platform';

/**
 * Picks the platform implementation. Until YandexPlatform exists (Stage 4) the game always
 * runs on LocalPlatform; then the choice will be "YaGames loaded → YandexPlatform".
 */
export function createPlatform(): Platform {
  return new LocalPlatform();
}
