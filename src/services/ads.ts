/**
 * YG-10…YG-13: the ad rules in one place. A rewarded video only after a button press; a
 * fullscreen ad only right after "Next" or "To the village" in the level-complete window, once the
 * player has passed c1-06 (adsFromLevel), at most once in 180 s by the server clock; the sticky
 * banner in the village only. "No ads" (YG-14) removes the fullscreen ads and the banner; rewarded
 * videos stay the player's choice. While an ad shows, the game is silent and paused (YG-05).
 */

import { config } from '../config';
import type { Platform } from '../platform/Platform';
import type { Lifecycle } from './lifecycle';
import type { ProgressService } from './progress';

export class AdService {
  private busy = false;
  private inVillage = false;
  private bannerShown = false;

  constructor(
    private readonly platform: Platform,
    private readonly lifecycle: Pick<Lifecycle, 'setAd'>,
    private readonly progress: ProgressService,
  ) {}

  /** An ad is on screen now: the game ignores input and pause keys. */
  showing(): boolean {
    return this.busy;
  }

  /** YG-11: true only when the platform granted the reward (onRewarded). */
  async rewarded(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.lifecycle.setAd(true);
    try {
      return await this.platform.showRewarded();
    } catch {
      return false;
    } finally {
      this.lifecycle.setAd(false);
      this.busy = false;
    }
  }

  /** YG-10: whether "Next" / "To the village" in the level-complete window shows an ad now. */
  interstitialDue(): boolean {
    if (this.progress.data.noAds) return false;
    if (this.progress.completedCount() < config.adsFromLevel) return false;
    const last = this.progress.data.lastInterstitialAt;
    return this.platform.serverTime() - last >= config.interstitialMinGapSec * 1000;
  }

  /**
   * YG-10: called right after the button; resolves when the ad is closed, was not shown (the
   * platform limits how often) or failed — then the game goes on.
   */
  async interstitial(): Promise<void> {
    if (this.busy || !this.interstitialDue()) return;
    this.busy = true;
    this.progress.noteInterstitial(this.platform.serverTime());
    this.lifecycle.setAd(true);
    try {
      await this.platform.showInterstitial();
    } catch {
      // The game goes on.
    } finally {
      this.lifecycle.setAd(false);
      this.busy = false;
    }
  }

  /** YG-12: the banner shows in the village and hides in a level (and after "No ads"). */
  setBanner(inVillage: boolean): void {
    this.inVillage = inVillage;
    this.refreshBanner();
  }

  /** After "No ads" the banner goes away at once (1.13.5). */
  refreshBanner(): void {
    const want = this.inVillage && !this.progress.data.noAds;
    if (want === this.bannerShown) return;
    this.bannerShown = want;
    void (want ? this.platform.showSticky() : this.platform.hideSticky()).catch(() => undefined);
  }
}
