/**
 * The game's screens: the village (VIL-01…VIL-04, UI-02, UI-03) and the level. Starts levels,
 * routes simulation events to the header, sound, encyclopedia and windows, and handles pause
 * (YG-04, YG-05, UI-08, UI-15), the end windows (UI-07, GD-51, GD-52), boosters and gifts (INP-04,
 * GD-80), "New" cards (TUT-02), the keyboard (INP-05) and the first tutorial (TUT-01, TUT-03).
 * Every change of progress is saved at once through ProgressService (YG-08).
 */

import { BOOSTER_IDS, type BoosterId, type BotKind } from './config';
import { boosters as boosterDefs, buildings } from './content';
import { levelOrder, levels } from './content/levels';
import { itemImage, obstacleImage, residentImage } from './game/art';
import { FieldScene, refOfItem } from './game/FieldScene';
import { FieldInput } from './game/input';
import { LevelSession } from './game/session';
import { dictionaries } from './i18n';
import type { Platform } from './platform/Platform';
import type { AudioService } from './services/audio';
import { dayIndex } from './services/day';
import type { GameplayState } from './services/gameplay-state';
import { I18n } from './services/I18n';
import type { Lifecycle } from './services/lifecycle';
import type { ProgressService } from './services/progress';
import {
  Bot,
  botDelay,
  COMBO_WINDOW_TICKS,
  decide,
  levelResult,
  parseLevelId,
  type Action,
  type Chain,
  type LevelData,
  type Ref,
  type SimEvent,
  type SimState,
} from './sim';
import { BOOSTER_ICONS, el, Hud, ICONS, type BoosterView } from './ui/hud';
import { computeLayout } from './ui/layout';
import { Modals } from './ui/modal';
import { Toast } from './ui/toast';
import { TutorialHand } from './ui/tutorial';
import { buildingSvg } from './ui/village-art';
import { Village, type VillageView } from './ui/village';
import { APP_VERSION } from './version';

/** Effects play out before the end window opens. */
const END_DELAY_MS = 700;
/** VIL-04: the restore animation on the map before the building window opens again. */
const RESTORE_SHOW_MS = 900;
/** TUT-03: "Show tutorial" shows the hint for this long. */
const TUTORIAL_AGAIN_MS = 4000;
const CHAINS: Chain[] = ['wood', 'garden', 'stone', 'fish'];

export interface AppParts {
  platform: Platform;
  audio: AudioService;
  gameplay: GameplayState;
  scene: FieldScene;
  progress: ProgressService;
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
  readonly toast: Toast;
  readonly village: Village;
  readonly input: FieldInput;
  lifecycle: Lifecycle | null = null;
  session: LevelSession | null = null;
  levelId: string | null = null;
  /** LD-08: times of the player's drops, for the tempo counter. */
  readonly drops: number[] = [];
  private hookArmed = false;
  private endTimer = 0;
  private adBusy = false;
  private tutorialOn = false;
  /** "Show tutorial" hides the hint at this time (performance.now()); 0 — it stays. */
  private hintUntil = 0;
  /** GD-63: coins this attempt already got for a loss (after the bathhouse). */
  private lossPaid = 0;
  /** Boosters queued for the next tick, not yet taken from the inventory (SIM-33). */
  private queuedBoosters: BoosterId[] = [];
  private restoreTimer = 0;
  private chapterShown = 1;
  private size = { w: 0, h: 0 };

  constructor(private readonly p: AppParts) {
    this.i18n = p.i18n;
    this.hud = new Hud(p.ui, p.i18n, {
      pause: () => this.pause(),
      booster: (id) => this.boosterPressed(id),
    });
    this.village = new Village(
      p.ui,
      p.i18n,
      {
        play: () => this.playNext(),
        level: (id) => this.openLevel(id),
        building: (id) => this.openBuilding(id),
        chapter: (n) => {
          this.chapterShown = n;
          this.renderVillage();
        },
        encyclopedia: () => this.openEncyclopedia(),
        settings: () => this.openSettings(),
      },
      p.platform.isDesktop(),
    );
    this.tutorial = new TutorialHand(p.ui);
    this.toast = new Toast(p.ui);
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
    p.audio.setEnabled(p.progress.data.settings.sound);
    window.addEventListener('keydown', (e) => this.key(e));
  }

  /** UI-02: the first launch goes straight to level 1, later launches open the village. */
  boot(asked: string | null = null): void {
    if (asked && levels[asked]) this.startLevel(asked);
    else if (this.p.progress.firstLaunch()) this.startLevel(levelOrder[0] ?? 'c1-01');
    else this.showVillage();
  }

  // -------------------------------------------------------------------------------------------
  // Village (VIL-01…VIL-04)

  showVillage(): void {
    this.leaveLevel();
    const next = this.p.progress.nextLevel();
    this.chapterShown =
      parseLevelId(next?.id ?? levelOrder[levelOrder.length - 1] ?? 'c1-01')?.chapter ?? 1;
    this.village.show();
    this.renderVillage();
    this.offerDailyGift();
  }

  /** Ends the current level screen; `keepPlaying` when another level starts right away. */
  private leaveLevel(keepPlaying = false): void {
    window.clearTimeout(this.endTimer);
    window.clearTimeout(this.restoreTimer);
    this.modals.close();
    this.input.reset();
    this.tutorial.hide();
    this.toast.hide();
    this.setHook(false);
    this.session = null;
    this.levelId = null;
    this.p.scene.setSession(null);
    this.p.field.hidden = true;
    this.hud.setVisible(false);
    if (!keepPlaying) this.p.gameplay.setInLevel(false);
  }

  private villageView(): VillageView {
    const pr = this.p.progress;
    const t = this.i18n;
    const next = pr.nextLevel();
    const chapter = this.chapterShown;
    const ids = levelOrder.filter((id) => parseLevelId(id)?.chapter === chapter);
    let message: string | null = null;
    let sub = '';
    if (!next) message = t.t('village.soon');
    else if (next.gate) message = t.t(`village.need.${next.gate}`);
    else
      sub = `${t.t('level.number', { n: levelOrder.indexOf(next.id) + 1 })} · ${t.t(`level.${next.id}.name`)}`;
    return {
      coins: pr.data.coins,
      stars: pr.totalStars(),
      boosters: BOOSTER_IDS.reduce((a, id) => a + pr.boosters(id), 0),
      chapter,
      chapters: [1, 2, 3].map((n) => ({ n, open: pr.chapterOpen(n) })),
      levels: ids.map((id) => ({
        id,
        num: levelOrder.indexOf(id) + 1,
        stars: pr.stars(id),
        state: pr.completed(id) ? 'done' : pr.levelOpen(id) ? 'next' : 'locked',
      })),
      buildings: buildings.map((b) => ({
        id: b.id,
        restored: pr.built(b.id),
        affordable: pr.canRestore(b.id),
        price: b.price,
      })),
      play: { enabled: !!next && !next.gate, sub },
      message,
    };
  }

  renderVillage(justRestored: string | null = null): void {
    if (this.village.visible()) this.village.render(this.villageView(), justRestored);
  }

  private playNext(): void {
    const next = this.p.progress.nextLevel();
    if (next && !next.gate) this.openLevel(next.id);
  }

  /** A level from the map or the "Play" button; a "New" card comes first (TUT-02). */
  openLevel(id: string): void {
    if (!this.p.progress.levelOpen(id) && !this.p.progress.completed(id)) return;
    this.startLevel(id);
  }

  /** VIL-02: the building window — picture, resident, effect, price, "Restore". */
  openBuilding(id: string): void {
    const pr = this.p.progress;
    const def = pr.building(id);
    if (!def) return;
    const t = this.i18n;
    const restored = pr.built(id);
    const box = el('div', 'building-window');
    const pic = el('div', 'building-picture', buildingSvg(id, true));
    const who = el('div', 'resident');
    const face = el('img', 'resident-face');
    face.src = residentImage(def.resident);
    face.alt = '';
    const words = el('div', 'resident-words');
    const name = el('div', 'resident-name');
    name.textContent = t.t(`resident.${def.resident}.name`);
    const line = el('div', 'resident-line');
    const lines = [1, 2, 3].map((n) => `resident.${def.resident}.line${n}`).filter((k) => t.has(k));
    line.textContent = t.t('resident.say', {
      text: t.t(lines[Math.floor(Math.random() * lines.length)] ?? lines[0] ?? ''),
    });
    words.append(name, line);
    who.append(face, words);
    const effect = el('p', 'modal-text building-effect');
    effect.textContent = t.t(`building.${id}.effect`);
    box.append(pic, who, effect);
    const coinsLeft = def.price - pr.data.coins;
    if (!restored) {
      const price = el('div', 'complete-coins building-cost', ICONS.coin);
      const v = el('span');
      v.textContent = String(def.price);
      price.appendChild(v);
      box.appendChild(price);
      if (coinsLeft > 0) {
        const need = el('p', 'modal-text building-need');
        need.textContent = t.tp('building.need', coinsLeft);
        box.appendChild(need);
      }
    }
    this.modals.open({
      ui: 'building',
      title: t.t(`building.${id}.name`),
      text: restored ? t.t('building.restored') : undefined,
      content: box,
      buttons: [
        ...(restored
          ? []
          : [
              {
                ui: 'building-restore',
                label: t.t('building.restore'),
                primary: true,
                disabled: coinsLeft > 0,
                onClick: () => {
                  if (!pr.restore(id)) return;
                  this.modals.close();
                  this.renderVillage(id);
                  // VIL-04: the building changes on the map first, then its resident thanks.
                  window.clearTimeout(this.restoreTimer);
                  this.restoreTimer = window.setTimeout(() => {
                    if (this.village.visible() && !this.modals.current()) this.openBuilding(id);
                  }, RESTORE_SHOW_MS);
                },
              },
            ]),
        {
          ui: 'building-close',
          label: t.t('building.close'),
          primary: restored,
          onClick: () => this.modals.close(),
        },
      ],
    });
  }

  /** GD-23: every item, found ones with a picture, name and one line. */
  openEncyclopedia(): void {
    const pr = this.p.progress;
    const t = this.i18n;
    const box = el('div', 'encyclopedia');
    const detail = el('p', 'modal-text encyclopedia-detail');
    detail.dataset.ui = 'encyclopedia-detail';
    let found = 0;
    const cell = (chain: Chain, level: number): HTMLElement => {
      const known = pr.found(chain, level);
      if (known) found++;
      const b = el('button', `enc-cell${known ? ' known' : ''}`);
      b.type = 'button';
      b.dataset.ui = `enc-${chain}-${level}`;
      if (known) {
        const img = el('img');
        img.src = itemImage(chain, level);
        img.alt = '';
        b.appendChild(img);
      } else {
        b.textContent = '?';
      }
      const name = t.t(`item.${chain}.${level}.name`);
      b.setAttribute('aria-label', known ? name : t.t('encyclopedia.unknown'));
      b.addEventListener('click', () => {
        detail.textContent = known
          ? `${name}: ${t.t(`item.${chain}.${level}.desc`)}`
          : t.t('encyclopedia.unknown');
      });
      return b;
    };
    for (const chain of CHAINS) {
      const row = el('div', 'enc-row');
      const label = el('div', 'enc-label');
      label.textContent = t.t(`chain.${chain}`);
      const cells = el('div', 'enc-cells');
      for (let level = 1; level <= 6; level++) cells.appendChild(cell(chain, level));
      row.append(label, cells);
      box.appendChild(row);
    }
    const jokerRow = el('div', 'enc-row');
    const jl = el('div', 'enc-label');
    jl.textContent = t.t('chain.joker');
    const jc = el('div', 'enc-cells');
    jc.appendChild(cell('joker', 0));
    jokerRow.append(jl, jc);
    box.appendChild(jokerRow);
    detail.textContent = t.t('encyclopedia.count', { n: found, total: 25 });
    box.appendChild(detail);
    this.modals.open({
      ui: 'encyclopedia',
      title: t.t('encyclopedia.title'),
      content: box,
      buttons: [
        {
          ui: 'encyclopedia-close',
          label: t.t('encyclopedia.close'),
          primary: true,
          onClick: () => this.modals.close(),
        },
      ],
    });
  }

  /** VIL-02 (flower garden): a booster a day, offered when the village opens. */
  private offerDailyGift(): void {
    const day = dayIndex(this.p.platform.serverTime());
    if (!this.p.progress.dailyGiftReady(day) || this.modals.current()) return;
    // The window shows the booster that "Take" gives.
    const r = Math.random();
    const gift = this.p.progress.dailyGiftChoice(r);
    const box = el('div', 'intro-card gift');
    box.appendChild(el('div', 'intro-icon', BOOSTER_ICONS[gift]));
    const text = el('p', 'modal-text gift-text');
    text.dataset.ui = 'daily-text';
    text.textContent = this.i18n.t('daily.text', { name: this.i18n.t(`booster.${gift}.name`) });
    box.appendChild(text);
    this.modals.open({
      ui: 'daily-gift',
      title: this.i18n.t('daily.title'),
      content: box,
      buttons: [
        {
          ui: 'daily-take',
          label: this.i18n.t('daily.take'),
          primary: true,
          onClick: () => {
            const id = this.p.progress.takeDailyGift(day, () => r);
            this.modals.close();
            if (id)
              this.toast.show(
                this.i18n.t('gift.text', { name: this.i18n.t(`booster.${id}.name`), n: 1 }),
              );
            this.renderVillage();
          },
        },
      ],
    });
  }

  // -------------------------------------------------------------------------------------------
  // Levels

  startLevel(which: string | LevelData, attempt = 0): void {
    const level = typeof which === 'string' ? levels[which] : which;
    if (!level) return;
    this.leaveLevel(true);
    this.village.hide();
    this.p.field.hidden = false;
    this.lossPaid = 0;
    this.queuedBoosters = [];
    this.tutorialOn = false;
    this.hintUntil = 0;
    this.levelId = level.id;
    const pr = this.p.progress;
    // LD-05: the first attempt plays the checked seed; retries get new rivers.
    const session = new LevelSession(level, attempt, {
      seed: level.seed + attempt,
      calm: pr.data.settings.calm,
      backwater: pr.backwaterFor(level),
    });
    session.onTick((events, state) => this.onTick(events, state));
    this.session = session;
    this.p.scene.setSession(session);
    this.hud.setVisible(true);
    this.hud.setLives(session.state.lives, 0);
    this.hud.setCoins(0);
    this.hud.setCombo(0);
    this.markFound(session.state);
    this.p.gameplay.setInLevel(true);
    const gift = pr.claimIntroGift(level);
    this.updateBoosters();
    const intro = level.intro;
    if (intro && intro !== 'merge' && !pr.seen(`intro:${intro}`)) {
      this.openIntro(intro, gift);
    } else if (intro === 'merge' && level.waitFirstMerge) {
      this.tutorialOn = true;
      // The field is laid out on the next frame.
      requestAnimationFrame(() => this.showMergeHint());
    }
  }

  /** TUT-02: a picture and up to two short lines; the level waits behind it. */
  private openIntro(intro: string, gift: { booster: BoosterId; count: number } | null): void {
    const s = this.session;
    if (s) s.paused = true;
    const t = this.i18n;
    const box = el('div', 'intro-card');
    box.dataset.ui = 'intro-picture';
    const pics: string[] = [];
    const icons: { svg: string; kind: string }[] = [];
    const chain = intro.startsWith('chain-') ? (intro.slice(6) as Chain) : null;
    const booster = intro.startsWith('booster-') ? (intro.slice(8) as BoosterId) : null;
    if (chain) for (let l = 1; l <= 3; l++) pics.push(itemImage(chain, l));
    else if (intro === 'rocks') pics.push(obstacleImage('rock'));
    else if (intro === 'snags') pics.push(obstacleImage('snag'));
    else if (intro === 'pier') pics.push(obstacleImage('pier'));
    else if (intro === 'backwater') {
      // What floated away waits in the backwater; with no room a heart is lost.
      pics.push(itemImage('wood', 2));
      icons.push({ svg: ICONS.heart, kind: 'heart' });
    } else if (intro === 'cascade')
      pics.push(itemImage('wood', 1), itemImage('wood', 2), itemImage('wood', 3));
    else if (intro === 'combo') pics.push(itemImage('garden', 3), itemImage('garden', 3));
    else if (intro === 'wide-river' || intro === 'bank')
      pics.push(itemImage('wood', 4), itemImage('garden', 4));
    else if (booster === 'joker') pics.push(itemImage('joker', 0));
    else if (booster && BOOSTER_ICONS[booster])
      icons.push({ svg: BOOSTER_ICONS[booster], kind: '' });
    for (const src of pics) {
      const img = el('img', 'intro-image');
      img.src = src;
      img.alt = '';
      box.appendChild(img);
    }
    for (const icon of icons) box.appendChild(el('div', `intro-icon ${icon.kind}`, icon.svg));
    if (gift) {
      const g = el('div', 'booster-gift', ICONS.star);
      const v = el('span');
      v.textContent = t.t('gift.text', {
        name: t.t(`booster.${gift.booster}.name`),
        n: gift.count,
      });
      g.appendChild(v);
      box.appendChild(g);
    }
    this.modals.open({
      ui: 'intro',
      title: `${t.t('intro.new')}: ${t.t(`intro.${intro}.title`)}`,
      text: t.t(`intro.${intro}.text`),
      content: box,
      buttons: [
        {
          ui: 'intro-ok',
          label: t.t('intro.ok'),
          primary: true,
          onClick: () => {
            this.p.progress.markSeen(`intro:${intro}`);
            this.resume();
          },
        },
      ],
    });
  }

  restart(): void {
    if (this.session) this.startLevel(this.session.level, this.session.attempt + 1);
  }

  /** The next level after the current one, if it is open now. */
  nextLevelId(): string | null {
    const i = this.levelId ? levelOrder.indexOf(this.levelId) : -1;
    const next = i >= 0 ? (levelOrder[i + 1] ?? null) : null;
    return next && this.p.progress.levelOpen(next) ? next : null;
  }

  /** A window is open, the level is paused, or an ad is running. */
  blocked(): boolean {
    return this.modals.current() !== null || (this.session?.paused ?? true) || this.adBusy;
  }

  private onTick(events: readonly SimEvent[], state: SimState): void {
    this.queuedBoosters = [];
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
        case 'spawn':
          this.found(e.chain, e.level);
          break;
        case 'merge': {
          // SND-01: one base sound, higher with the item level and the combo.
          const pitch = Math.pow(2, (e.level - 2 + Math.min(e.combo, 4) - 1) / 12);
          this.p.audio.play(e.cascade ? 'cascade' : 'merge', pitch);
          if (e.combo >= 2 && !e.cascade)
            this.p.audio.play('combo', Math.pow(2, (e.combo - 2) / 12));
          this.found(e.chain, e.level);
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
          this.p.progress.useBooster(e.id);
          if (e.id === 'hook') this.setHook(false);
          if (e.id === 'joker') this.found('joker', 0);
          break;
        case 'won':
          this.p.audio.play('win');
          this.endLater(() => this.showComplete());
          break;
        case 'lost-level':
          this.p.audio.play('lose');
          this.payLoss(state);
          this.endLater(() => this.showLost());
          break;
        default:
          break;
      }
    }
    // An armed hook that can no longer be used lets go of the field.
    if (this.hookArmed && (state.boostersUsed >= 3 || this.p.progress.boosters('hook') <= 0))
      this.setHook(false);
    this.hud.setLives(state.lives, state.lost);
    this.hud.setCoins(state.coins);
    this.hud.setCombo(this.comboNow(state));
    this.updateBoosters();
    this.p.scene.refreshGeometry();
  }

  /** GD-23: items on the field at the start of a level count as found. */
  private markFound(s: SimState): void {
    for (const c of s.grid) if (c.kind === 'item') this.found(c.item.chain, c.item.level, false);
  }

  private found(chain: Chain, level: number, announce = true): void {
    if (!this.p.progress.markFound(chain, level) || !announce) return;
    const name = this.i18n.t(`item.${chain}.${level}.name`);
    this.toast.show(this.i18n.t('toast.found', { name }), itemImage(chain, level));
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
    this.queuedBoosters = [];
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
        {
          ui: 'pause-village',
          label: this.i18n.t('pause.village'),
          onClick: () => this.showVillage(),
        },
      ],
    });
  }

  /** UI-06 (part): sound, calm river, language and version. Login and purchases arrive in Stage 4. */
  openSettings(): void {
    const t = (k: string, p?: Record<string, string | number>): string => this.i18n.t(k, p);
    const pr = this.p.progress;
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
    toggle('settings-sound', t('settings.sound'), null, pr.data.settings.sound, () => {
      pr.setSettings({ sound: !pr.data.settings.sound });
      this.p.audio.setEnabled(pr.data.settings.sound);
    });
    // CALM-01: applies from the next attempt.
    toggle(
      'settings-calm',
      t('settings.calm'),
      t('settings.calmHint'),
      pr.data.settings.calm,
      () => {
        pr.setSettings({ calm: !pr.data.settings.calm });
      },
    );
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
        pr.setSettings({ lang });
        this.openSettings();
      });
      langs.appendChild(btn);
    }
    box.appendChild(langs);
    const version = el('div', 'settings-version');
    version.textContent = t('settings.version', { v: APP_VERSION });
    box.appendChild(version);
    const inLevel = this.session !== null;
    this.modals.open({
      ui: 'settings',
      title: t('settings.title'),
      content: box,
      buttons: [
        {
          ui: 'settings-close',
          label: t('settings.done'),
          primary: true,
          onClick: () => (inLevel ? this.openPause() : this.modals.close()),
        },
      ],
    });
  }

  setLang(lang: string): void {
    this.i18n = new I18n(dictionaries, lang);
    document.documentElement.lang = lang;
    document.title = this.i18n.t('game.title');
    this.hud.applyTexts(this.i18n);
    this.village.applyTexts(this.i18n);
    this.updateBoosters();
    this.renderVillage();
  }

  // -------------------------------------------------------------------------------------------
  // End of the level (UI-07, GD-51, GD-52, GD-63)

  private showComplete(): void {
    const s = this.session;
    if (!s) return;
    s.paused = true;
    const id = s.level.id;
    const result = levelResult(s.state, !this.p.progress.completed(id));
    // GD-52, GD-63: after Continue a part was already paid for the loss.
    const paid = this.p.progress.win(id, result.stars, result.coins, this.lossPaid);
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
    value.textContent = this.i18n.tp('complete.coins', paid.coins + this.lossPaid);
    coins.appendChild(value);
    box.append(stars, coins);
    if (paid.gift) {
      const g = el('div', 'booster-gift', ICONS.star);
      const v = el('span');
      v.textContent = this.i18n.t('gift.text', {
        name: this.i18n.t(`booster.${paid.gift.booster}.name`),
        n: paid.gift.count,
      });
      g.appendChild(v);
      box.appendChild(g);
    }
    const next = this.nextLevelId();
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
          ui: 'complete-village',
          label: this.i18n.t('complete.village'),
          primary: !next,
          onClick: () => this.showVillage(),
        },
        {
          ui: 'complete-replay',
          label: this.i18n.t('complete.replay'),
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
        {
          ui: 'lost-village',
          label: this.i18n.t('lost.village'),
          onClick: () => this.showVillage(),
        },
      ],
    });
  }

  /**
   * GD-63: a lost attempt pays half its coins at once and saves (YG-08), so closing the game from
   * the loss window keeps them. After Continue only the difference is paid later.
   */
  private payLoss(state: SimState): void {
    this.lossPaid += this.p.progress.loss(levelResult(state, false).coins, this.lossPaid);
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

  updateBoosters(): void {
    const used = this.session?.state.boostersUsed ?? 0;
    const views: BoosterView[] = BOOSTER_IDS.map((id) => {
      const count = this.p.progress.boosters(id);
      const state = !this.p.progress.boosterUnlocked(id, this.levelId)
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
    if (id === 'hook' && this.hookArmed) {
      this.setHook(false);
      return;
    }
    if (!this.p.progress.boosterUnlocked(id, this.levelId)) return;
    // A double tap inside one tick is one use (and never a video for the next one).
    if (this.queuedBoosters.includes(id)) return;
    if (s.state.boostersUsed + this.queuedBoosters.length >= 3) return;
    if (this.boostersLeft(id) <= 0) {
      void this.boosterForAd(id);
      return;
    }
    if (id === 'hook') {
      this.setHook(!this.hookArmed);
      return;
    }
    this.queueBooster(s, { type: 'booster', id });
  }

  /** The inventory minus boosters queued for the next tick (SIM-33: no use beyond the stock). */
  private boostersLeft(id: BoosterId): number {
    return this.p.progress.boosters(id) - this.queuedBoosters.filter((x) => x === id).length;
  }

  private queueBooster(s: LevelSession, a: Extract<Action, { type: 'booster' }>): void {
    this.queuedBoosters.push(a.id);
    s.queue(a);
  }

  /** INP-04, YG-11: "+1" for a video; the level waits meanwhile. */
  private async boosterForAd(id: BoosterId): Promise<void> {
    const s = this.session;
    if (!s) return;
    this.halt();
    const ok = await this.rewarded();
    if (ok) this.p.progress.addBooster(id, 1);
    this.updateBoosters();
    if (this.session === s && !this.modals.current()) s.paused = false;
  }

  private hookTarget(ref: Ref | null): void {
    const s = this.session;
    if (!s || !ref || ref.at !== 'cell') return;
    const kind = s.state.grid[ref.row * s.state.cols + ref.col]?.kind;
    if (kind !== 'rock' && kind !== 'snag') return;
    if (this.boostersLeft('hook') <= 0 || s.state.boostersUsed + this.queuedBoosters.length >= 3) {
      this.setHook(false);
      return;
    }
    this.queueBooster(s, { type: 'booster', id: 'hook', target: ref });
    this.setHook(false);
  }

  // -------------------------------------------------------------------------------------------
  // Keyboard (INP-05): KeyboardEvent.code only, browser shortcuts are left alone.

  private key(e: KeyboardEvent): void {
    // A held key repeats: one press is one action (no second booster, no video, no pause flicker).
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      const open = this.modals.current();
      if (!this.session) {
        if (open && open !== 'daily-gift') this.modals.close();
        return;
      }
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
    // TUT-01: on c1-01 before the first merge the hint stays until that merge.
    if (!this.tutorialOn) {
      this.hintUntil = performance.now() + TUTORIAL_AGAIN_MS;
      this.tutorial.hideAfter(TUTORIAL_AGAIN_MS);
    }
  }

  /** The hint follows the field after a resize and keeps the time it had left. */
  private moveHint(): void {
    this.showMergeHint();
    if (this.tutorialOn || this.hintUntil === 0) return;
    const left = this.hintUntil - performance.now();
    if (left > 0) this.tutorial.hideAfter(left);
    else this.tutorial.hide();
  }

  // -------------------------------------------------------------------------------------------
  // Layout

  /** UI-15: the active area changed; the interface follows and the level pauses. */
  stageResized(w: number, h: number): void {
    const changed = this.size.w !== 0 && (this.size.w !== w || this.size.h !== h);
    this.size = { w, h };
    this.hud.applyLayout(computeLayout(w, h, { cols: 7, rows: 8, backwater: 5 }));
    this.village.fit();
    if (changed) this.interrupt();
    if (this.tutorial.visible()) requestAnimationFrame(() => this.moveHint());
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
