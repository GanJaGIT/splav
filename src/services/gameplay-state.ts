/**
 * YG-03, TECH-13: the only caller of GameplayAPI.start() and stop(). The player is playing while
 * a level is on screen, no window covers it and the game is not suspended.
 * stop() goes at once; start() at the end of the current task and only if the game still plays
 * then, so closing a window and opening another in one click sends nothing (requirement 1.19.3).
 */

import type { Platform } from '../platform/Platform';

export class GameplayState {
  private inLevel = false;
  private windows = 0;
  private suspended = false;
  private playing = false;
  private startPending = false;

  constructor(private readonly platform: Platform) {}

  setInLevel(on: boolean): void {
    this.inLevel = on;
    this.sync();
  }

  /** A window over the level opened. */
  windowOpened(): void {
    this.windows += 1;
    this.sync();
  }

  windowClosed(): void {
    this.windows = Math.max(0, this.windows - 1);
    this.sync();
  }

  /** The tab is hidden, the SDK paused the game or an ad is on screen. */
  setSuspended(on: boolean): void {
    this.suspended = on;
    this.sync();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * YG-03, YG-04: on game_api_resume the platform calls GameplayAPI.start() by itself, but the
   * level stays on its Pause window until "Continue": stop() is sent again so the platform knows.
   */
  reassert(): void {
    if (this.playing) return;
    try {
      this.platform.gameplayStop();
    } catch {
      // §5.1
    }
  }

  private wanted(): boolean {
    return this.inLevel && this.windows === 0 && !this.suspended;
  }

  private sync(): void {
    if (!this.wanted()) {
      this.send(false);
      return;
    }
    if (this.startPending) return;
    this.startPending = true;
    queueMicrotask(() => {
      this.startPending = false;
      if (this.wanted()) this.send(true);
    });
  }

  private send(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    try {
      if (playing) this.platform.gameplayStart();
      else this.platform.gameplayStop();
    } catch {
      // Platform errors never break the game (§5.1).
    }
  }
}
