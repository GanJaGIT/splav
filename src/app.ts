/**
 * The level screen (Stage 2): starts levels, routes simulation events to the header, sound and
 * windows, and handles pause (YG-04, YG-05, UI-08, UI-15), the end windows (UI-07, GD-51, GD-52),
 * boosters (INP-04), the keyboard (INP-05) and the first tutorial (TUT-01, TUT-03).
 * Progress is kept in memory until saving arrives in Stage 3.
 */

import { BOOSTER_IDS, config, type BoosterId } from './config';
import { boosters as boosterDefs } from './content';
import { levelOrder, levels } from './content/levels';
import { FieldScene, refOfItem } from './game/FieldScene';
import { FieldInput } from './game/input';
import { LevelSession } from './game/session';
import { dictionaries } from './i18n';
import type { Platform } from './platform/Platform';
import type { AudioService } from './services/audio';
import type { GameplayState } from './services/gameplay-state';
import { I18n } from './services/I18n';
import type { Lifecycle } from './services/lifecycle';
import {
  Bot,
  botDelay,
  COMBO_WINDOW_TICKS,
  decide,
  levelResult,
  type LevelData,
  type Ref,
  type SimEvent,
  type SimState,
} from './sim';
import type { BotKind } from './config';
import { el, Hud, ICONS, type BoosterView } from './ui/hud';
import { computeLayout } from './ui/layout';
import { Modals } from './ui/modal';
import { TutorialHand } from './ui/tutorial';
import { APP_VERSION } from './version';

/** Effects play out before the end window opens. */
const END_DELAY_MS = 700;

export interface AppParts {
  platform: Platform;
  audio: AudioService;
  gameplay: GameplayState;
  scene: FieldScene;
  i18n: I18n;
  /** DOM overlay for the interface (#ui). */
  ui: HTMLElement;
  /** Element under the interface that receives touches on the field (#canvas-host). */
  field: HTMLElement;
}

export class App {
  i18n: I18n;
  readonly hud: Hud;
  readonly modals: Modals;
  readonly tutorial: TutorialHand;
  readonly input: FieldInput;
  lifecycle: Lifecycle | null = null;
  session: LevelSession | null = null;
  levelId: string | null = null;
  /** Levels won in this run; saving arrives in Stage 3. */
  readonly completed = new Set<string>();
  readonly inventory: Record<BoosterId, number> = { ...config.startBoosters };
  readonly settings = { sound: true, calm: false };
  /** LD-08: times of the player's drops, for the tempo counter. */
  readonly drops: number[] = [];
  private hookArmed = false;
  private endTimer = 0;
  private adBusy = false;
  private tutorialOn = false;
  private size = { w: 0, h: 0 };

  constructor(private readonly p: AppParts) {
    this.i18n = p.i18n;
    this.hud = new Hud(p.ui, p.i18n, {
      pause: () => this.pause(),
      booster: (id) => this.boosterPressed(id),
    });
    this.tutorial = new TutorialHand(p.ui);
    this.modals = new Modals(
      p.ui,
      () => p.gameplay.windowOpened(),
      () => p.gameplay.windowClosed(),
      () => p.audio.play('button'),
    );
    this.input = new FieldInput(p.field, p.scene, {
      session: () => this.session,
      blocked: () => this.blocked(),
      gesture: () => p.audio.unlock(),
      hookArmed: () => this.hookArmed,
      hookTarget: (ref) => this.hookTarget(ref),
      dropped: () => this.drops.push(performance.now()),
    });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  // -------------------------------------------------------------------------------------------
  // Levels

  startLevel(which: string | LevelData, attempt = 0): void {
    const level = typeof which === 'string' ? levels[which] : which;
    if (!level) return;
    window.clearTimeout(this.endTimer);
    this.modals.close();
    this.input.reset();
    this.tutorial.hide();
    this.tutorialOn = false;
    this.setHook(false);
    this.levelId = level.id;
    // LD-05: the first attempt plays the checked seed; retries get new rivers.
    const session = new LevelSession(level, attempt, {
      seed: level.seed + attempt,
      calm: this.settings.calm,
    });
    session.onTick((events, state) => this.onTick(events, state));
    this.session = session;
    this.p.scene.setSession(session);
    this.hud.setVisible(true);
    this.hud.setLives(session.state.lives, 0);
    this.hud.setCoins(0);
    this.hud.setCombo(0);
    this.updateBoosters();
    this.p.gameplay.setInLevel(true);
    if (level.intro === 'merge' && level.waitFirstMerge) {
      this.tutorialOn = true;
      // The field is laid out on the next frame.
      requestAnimationFrame(() => this.showMergeHint());
    }
  }

  restart(): void {
    if (this.session) this.startLevel(this.session.level, this.session.attempt + 1);
  }

  nextLevelId(): string | null {
    const i = this.levelId ? levelOrder.indexOf(this.levelId) : -1;
    return i >= 0 ? (levelOrder[i + 1] ?? null) : null;
  }

  /** A window is open, the level is paused, or an ad is running. */
  blocked(): boolean {
    return this.modals.current() !== null || (this.session?.paused ?? true) || this.adBusy;
  }

  private onTick(events: readonly SimEvent[], state: SimState): void {
    this.input.onTick(state);
    for (const e of events) {
      switch (e.type) {
        case 'grab':
          this.p.audio.play('grab');
          break;
        case 'place':
        case 'returned':
          this.p.audio.play('drop');
          break;
        case 'merge': {
          // SND-01: one base sound, higher with the item level and the combo.
          const pitch = Math.pow(2, (e.level - 2 + Math.min(e.combo, 4) - 1) / 12);
          this.p.audio.play(e.cascade ? 'cascade' : 'merge', pitch);
          if (e.combo >= 2 && !e.cascade)
            this.p.audio.play('combo', Math.pow(2, (e.combo - 2) / 12));
          if (this.tutorialOn) {
            this.tutorialOn = false;
            this.tutorial.hide();
          }
          break;
        }
        case 'whirlpool':
          this.p.audio.play('whirlpool');
          break;
        case 'deliver':
          this.p.audio.play('deliver');
          break;
        case 'lost':
          this.p.audio.play('lost');
          break;
        case 'invalid':
          this.p.audio.play('invalid');
          break;
        case 'booster':
          this.inventory[e.id] = Math.max(0, this.inventory[e.id] - 1);
          if (e.id === 'hook') this.setHook(false);
          break;
        case 'won':
          this.p.audio.play('win');
          this.endLater(() => this.showComplete());
          break;
        case 'lost-level':
          this.p.audio.play('lose');
          this.endLater(() => this.showLost());
          break;
        default:
          break;
      }
    }
    this.hud.setLives(state.lives, state.lost);
    this.hud.setCoins(state.coins);
    this.hud.setCombo(this.comboNow(state));
    this.updateBoosters();
    this.p.scene.refreshGeometry();
  }

  /** GD-61: the combo shown while the next merge would still continue it. */
  private comboNow(s: SimState): number {
    return s.combo > 0 && s.tick - s.lastMergeTick < COMBO_WINDOW_TICKS ? s.combo : 0;
  }

  private endLater(show: () => void): void {
    this.input.reset();
    this.setHook(false);
    this.tutorial.hide();
    window.clearTimeout(this.endTimer);
    this.endTimer = window.setTimeout(show, END_DELAY_MS);
  }

  // -------------------------------------------------------------------------------------------
  // Pause (UI-08, YG-04, YG-05, UI-15)

  /** The player's pause: button, Escape or KeyP. */
  pause(): void {
    const s = this.session;
    if (!s || s.state.status !== 'playing' || this.modals.current() || this.adBusy) return;
    this.halt();
    this.openPause();
  }

  /** The player left (tab, focus, SDK pause, resize): the river stops and Pause opens. */
  interrupt(): void {
    const s = this.session;
    if (!s || this.adBusy) return;
    if (s.state.status !== 'playing' || this.modals.current()) {
      s.paused = true;
      return;
    }
    this.pause();
  }

  /** Stops the river and returns a held item (YG-04). */
  private halt(): void {
    const s = this.session;
    if (!s) return;
    s.paused = true;
    s.clearPending();
    this.input.reset();
    this.setHook(false);
    if (s.state.hand) s.applyNow([{ type: 'cancel' }]);
  }

  resume(): void {
    this.modals.close();
    if (this.session) this.session.paused = false;
  }

  private openPause(): void {
    const id = this.levelId ?? '';
    this.modals.open({
      ui: 'pause',
      title: this.i18n.t('pause.title'),
      text: this.i18n.has(`level.${id}.name`) ? this.i18n.t(`level.${id}.name`) : undefined,
      buttons: [
        {
          ui: 'pause-continue',
          label: this.i18n.t('pause.continue'),
          primary: true,
          onClick: () => this.resume(),
        },
        { ui: 'pause-restart', label: this.i18n.t('pause.restart'), onClick: () => this.restart() },
        {
          ui: 'pause-tutorial',
          label: this.i18n.t('pause.tutorial'),
          onClick: () => this.showTutorialAgain(),
        },
        {
          ui: 'pause-settings',
          label: this.i18n.t('pause.settings'),
          onClick: () => this.openSettings(),
        },
      ],
    });
  }

  /** UI-06 (part): sound, calm river, language and version. Login and purchases arrive in Stage 4. */
  openSettings(): void {
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(k, p);
    const box = el('div', 'settings');
    const toggle = (
      ui: string,
      label: string,
      hint: string | null,
      on: boolean,
      flip: () => void,
    ): void => {
      const row = el('div', 'settings-row');
      const text = el('div', 'settings-label');
      text.textContent = label;
      if (hint) {
        const h = el('div', 'settings-hint');
        h.textContent = hint;
        text.appendChild(h);
      }
      const btn = el('button', `switch${on ? ' on' : ''}`);
      btn.type = 'button';
      btn.dataset.ui = ui;
      btn.setAttribute('role', 'switch');
      btn.setAttribute('aria-checked', String(on));
      btn.setAttribute('aria-label', label);
      btn.textContent = on ? t('settings.on') : t('settings.off');
      btn.addEventListener('click', () => {
        this.p.audio.play('button');
        flip();
        this.openSettings();
      });
      row.append(text, btn);
      box.appendChild(row);
    };
    toggle('settings-sound', t('settings.sound'), null, this.settings.sound, () => {
      this.settings.sound = !this.settings.sound;
      this.p.audio.setEnabled(this.settings.sound);
    });
    toggle('settings-calm', t('settings.calm'), t('settings.calmHint'), this.settings.calm, () => {
      this.settings.calm = !this.settings.calm;
    });
    const langs = el('div', 'settings-row settings-langs');
    for (const lang of Object.keys(dictionaries).sort().reverse()) {
      const btn = el('button', `lang${lang === this.i18n.lang ? ' on' : ''}`);
      btn.type = 'button';
      btn.dataset.ui = `settings-lang-${lang}`;
      // UI-06: languages by their own names.
      btn.textContent = dictionaries[lang]?.['lang.name'] ?? lang;
      btn.addEventListener('click', () => {
        this.p.audio.play('button');
        this.setLang(lang);
        this.openSettings();
      });
      langs.appendChild(btn);
    }
    box.appendChild(langs);
    const version = el('div', 'settings-version');
    version.textContent = t('settings.version', { v: APP_VERSION });
    box.appendChild(version);
    this.modals.open({
      ui: 'settings',
      title: t('settings.title'),
      content: box,
      buttons: [
        {
          ui: 'settings-close',
          label: t('settings.done'),
          primary: true,
          onClick: () => this.openPause(),
        },
      ],
    });
  }

  setLang(lang: string): void {
    this.i18n = new I18n(dictionaries, lang);
    document.documentElement.lang = lang;
    document.title = this.i18n.t('game.title');
    this.hud.applyTexts(this.i18n);
    this.updateBoosters();
  }

  // -------------------------------------------------------------------------------------------
  // End of the level (UI-07, GD-51, GD-52)

  private showComplete(): void {
    const s = this.session;
    if (!s) return;
    s.paused = true;
    const id = s.level.id;
    const result = levelResult(s.state, !this.completed.has(id));
    this.completed.add(id);
    const box = el('div', 'complete');
    const stars = el('div', 'stars');
    stars.dataset.ui = 'stars';
    stars.setAttribute('aria-label', this.i18n.t('complete.stars', { n: result.stars }));
    for (let i = 0; i < 3; i++) {
      const star = el('span', `star${i < result.stars ? ' on' : ''}`, ICONS.star);
      star.style.animationDelay = `${0.15 + i * 0.25}s`;
      stars.appendChild(star);
    }
    const coins = el('div', 'complete-coins', ICONS.coin);
    coins.dataset.ui = 'complete-coins';
    const value = el('span', 'complete-coins-value');
    value.textContent = this.i18n.tp('complete.coins', result.coins);
    coins.appendChild(value);
    box.append(stars, coins);
    const next = this.nextLevelId();
    if (!next) {
      const soon = el('p', 'modal-text');
      soon.textContent = this.i18n.t('complete.soon');
      box.appendChild(soon);
    }
    this.modals.open({
      ui: 'level-complete',
      title: this.i18n.t('complete.title'),
      content: box,
      buttons: [
        ...(next
          ? [
              {
                ui: 'complete-next',
                label: this.i18n.t('complete.next'),
                primary: true,
                onClick: () => this.startLevel(next),
              },
            ]
          : []),
        {
          ui: 'complete-replay',
          label: this.i18n.t('complete.replay'),
          primary: !next,
          onClick: () => this.restart(),
        },
      ],
    });
  }

  private showLost(): void {
    const s = this.session;
    if (!s) return;
    s.paused = true;
    this.modals.open({
      ui: 'level-lost',
      title: this.i18n.t('lost.title'),
      text: this.i18n.t('lost.text'),
      buttons: [
        ...(s.state.continued
          ? []
          : [
              {
                ui: 'lost-continue',
                label: this.i18n.t('lost.continue'),
                primary: true,
                video: true,
                onClick: () => void this.continueForAd(),
              },
            ]),
        {
          ui: 'lost-retry',
          label: this.i18n.t('lost.retry'),
          primary: s.state.continued,
          onClick: () => this.restart(),
        },
      ],
    });
  }

  /** YG-11: a rewarded video; the reward comes only when the video was watched. */
  private async rewarded(): Promise<boolean> {
    if (this.adBusy) return false;
    this.adBusy = true;
    this.lifecycle?.setAd(true);
    let ok: boolean;
    try {
      ok = await this.p.platform.showRewarded();
    } catch {
      ok = false;
    }
    this.lifecycle?.setAd(false);
    this.adBusy = false;
    return ok;
  }

  private async continueForAd(): Promise<void> {
    const ok = await this.rewarded();
    const s = this.session;
    if (!ok || !s || s.state.status !== 'lost') return;
    s.applyNow([{ type: 'continue' }]);
    this.resume();
  }

  // -------------------------------------------------------------------------------------------
  // Boosters (INP-04, GD-80)

  private unlocked(id: BoosterId): boolean {
    const def = boosterDefs.find((b) => b.id === id);
    const at = def ? levelOrder.indexOf(def.unlockLevel) : -1;
    const cur = this.levelId ? levelOrder.indexOf(this.levelId) : -1;
    return at >= 0 && cur >= at;
  }

  updateBoosters(): void {
    const used = this.session?.state.boostersUsed ?? 0;
    const views: BoosterView[] = BOOSTER_IDS.map((id) => {
      const count = this.inventory[id];
      const state = !this.unlocked(id)
        ? 'locked'
        : used >= 3
          ? 'spent'
          : count > 0
            ? 'ready'
            : 'video';
      return { id, state, count, armed: id === 'hook' && this.hookArmed };
    });
    this.hud.setBoosters(views);
  }

  private setHook(on: boolean): void {
    if (this.hookArmed === on) return;
    this.hookArmed = on;
    this.p.scene.setHookArmed(on);
    this.updateBoosters();
  }

  private boosterPressed(id: BoosterId): void {
    const s = this.session;
    if (!s || this.blocked() || s.state.status !== 'playing') return;
    if (!this.unlocked(id) || s.state.boostersUsed >= 3) return;
    if (this.inventory[id] <= 0) {
      void this.boosterForAd(id);
      return;
    }
    if (id === 'hook') {
      this.setHook(!this.hookArmed);
      return;
    }
    s.queue({ type: 'booster', id });
  }

  /** INP-04, YG-11: "+1" for a video; the level waits meanwhile. */
  private async boosterForAd(id: BoosterId): Promise<void> {
    const s = this.session;
    if (!s) return;
    this.halt();
    const ok = await this.rewarded();
    if (ok) this.inventory[id] += 1;
    this.updateBoosters();
    if (this.session === s && !this.modals.current()) s.paused = false;
  }

  private hookTarget(ref: Ref | null): void {
    const s = this.session;
    if (!s || !ref || ref.at !== 'cell') return;
    const kind = s.state.grid[ref.row * s.state.cols + ref.col]?.kind;
    if (kind === 'rock' || kind === 'snag') s.queue({ type: 'booster', id: 'hook', target: ref });
  }

  // -------------------------------------------------------------------------------------------
  // Keyboard (INP-05): KeyboardEvent.code only, browser shortcuts are left alone.

  private key(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      const open = this.modals.current();
      if (open === 'pause') this.resume();
      else if (open === 'settings') this.openPause();
      else if (!open) this.pause();
      return;
    }
    const def = boosterDefs.find((b) => b.key === e.code);
    if (def) this.boosterPressed(def.id);
  }

  // -------------------------------------------------------------------------------------------
  // Tutorial (TUT-01, TUT-03)

  private showMergeHint(): boolean {
    const s = this.session;
    if (!s) return false;
    const d = decide(s.state);
    const scene = this.p.scene;
    const fieldTop = scene.getLayout().field.y;
    if (!d || d.plan.kind !== 'merge') {
      this.tutorial.show(null, null, this.i18n.t('tut.merge'), fieldTop + 8);
      return false;
    }
    const target = refOfItem(s.state, d.plan.targetId);
    const center = (r: Ref): { x: number; y: number } =>
      r.at === 'cell' ? scene.cellCenter(r.col, r.row) : scene.slotCenter(r.slot);
    this.tutorial.show(
      center(d.grab),
      target ? center(target) : null,
      this.i18n.t('tut.merge'),
      fieldTop + 8,
    );
    return true;
  }

  private showTutorialAgain(): void {
    this.resume();
    this.showMergeHint();
    this.tutorial.hideAfter(4000);
  }

  // -------------------------------------------------------------------------------------------
  // Layout

  /** UI-15: the active area changed; the interface follows and the level pauses. */
  stageResized(w: number, h: number): void {
    const changed = this.size.w !== 0 && (this.size.w !== w || this.size.h !== h);
    this.size = { w, h };
    this.hud.applyLayout(computeLayout(w, h, { cols: 7, rows: 8, backwater: 5 }));
    if (changed) this.interrupt();
    if (this.tutorial.visible()) requestAnimationFrame(() => this.showMergeHint());
  }

  // -------------------------------------------------------------------------------------------
  // DEV-02, DEV-03

  /** A bot plays the current level from now on. */
  startBot(kind: BotKind | null): void {
    const s = this.session;
    if (!s) return;
    if (!kind) {
      s.driver = null;
      return;
    }
    const bot = new Bot(botDelay(kind));
    s.driver = (state) => bot.next(state);
  }

  /** LD-08: the player's drops per second over the last minute. */
  tempo(): number {
    const now = performance.now();
    while (this.drops.length > 0 && now - (this.drops[0] as number) > 60_000) this.drops.shift();
    if (this.drops.length < 2) return 0;
    const span = Math.max(1, (now - (this.drops[0] as number)) / 1000);
    return this.drops.length / span;
  }
}
