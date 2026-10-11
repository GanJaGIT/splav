import type Phaser from 'phaser';
import type { Platform } from './platform/Platform';

/**
 * DEV-02: test hooks for dev and e2e builds (main.ts installs them under `__DEV_HOOKS__`, so the
 * release bundle has none). Stage 0 exposes the platform and the Phaser game; the simulation,
 * actions, time control and bot arrive with Stages 1–2.
 */
export interface DevHooks {
  platform: Platform;
  game: Phaser.Game;
}

declare global {
  interface Window {
    __game?: DevHooks;
  }
}

export function installDevHooks(hooks: DevHooks): void {
  window.__game = hooks;
}
