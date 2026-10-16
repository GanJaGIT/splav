/**
 * YG-04, YG-05: everything that takes the player away from the game. Each source silences the
 * sound while it lasts and interrupts the level (the river stops and the Pause window opens).
 * When the player comes back the level stays paused until they press Continue.
 */

import type { Platform } from '../platform/Platform';
import type { AudioService, SilenceReason } from './audio';
import type { GameplayState } from './gameplay-state';

export class Lifecycle {
  private readonly active = new Set<SilenceReason>();

  constructor(
    private readonly audio: AudioService,
    private readonly gameplay: GameplayState,
    /** Called whenever the player leaves: the level pauses. */
    private readonly interrupt: () => void,
  ) {}

  attach(platform: Platform): void {
    document.addEventListener('visibilitychange', () => {
      this.set('hidden', document.visibilityState === 'hidden');
    });
    window.addEventListener('blur', () => this.set('blur', true));
    window.addEventListener('focus', () => this.set('blur', false));
    window.addEventListener('pagehide', () => this.set('pagehide', true));
    window.addEventListener('pageshow', () => this.set('pagehide', false));
    platform.onPause(() => this.set('sdk_pause', true));
    platform.onResume(() => {
      this.set('sdk_pause', false);
      // After the platform's own start() (sdk-events.md), in the next task.
      setTimeout(() => this.gameplay.reassert(), 0);
    });
  }

  /** An ad, a purchase dialog and the like (YG-10, YG-11). */
  setAd(on: boolean): void {
    this.set('ad', on);
  }

  private set(reason: SilenceReason, on: boolean): void {
    if (on === this.active.has(reason)) return;
    if (on) this.active.add(reason);
    else this.active.delete(reason);
    this.audio.setSilenced(reason, on);
    this.gameplay.setSuspended(this.active.size > 0);
    if (on) this.interrupt();
  }
}
