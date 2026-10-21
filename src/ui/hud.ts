import { BOOSTER_IDS, type BoosterId } from '../config';
import type { I18n } from '../services/I18n';
import { icon } from './icons';
import type { Layout, Rect } from './layout';

/** ART-02: interface icons (art/ui). */
export const ICONS = {
  pause: icon('pause'),
  heart: icon('heart'),
  heartBroken: icon('heart-broken'),
  coin: icon('coin'),
  video: icon('video'),
  lock: icon('lock'),
  star: icon('star'),
} as const;

export const BOOSTER_ICONS: Record<BoosterId, string> = {
  dam: icon('booster-dam'),
  hook: icon('booster-hook'),
  joker: icon('booster-joker'),
  net: icon('booster-net'),
};

export type BoosterState = 'locked' | 'ready' | 'video' | 'spent';

export interface BoosterView {
  id: BoosterId;
  state: BoosterState;
  count: number;
  armed: boolean;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function place(node: HTMLElement, r: Rect): void {
  node.style.left = `${r.x}px`;
  node.style.top = `${r.y}px`;
  node.style.width = `${r.w}px`;
  node.style.height = `${r.h}px`;
}

export interface HudHandlers {
  pause(): void;
  booster(id: BoosterId): void;
}

/** UI-11, UI-12: the header (pause, hearts, coins, combo) and the booster buttons. */
export class Hud {
  private readonly header: HTMLElement;
  private readonly boosters: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly lives: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly coinsValue: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly buttons = new Map<BoosterId, HTMLButtonElement>();
  private shownLost = 0;
  private shownCombo = 0;

  constructor(
    root: HTMLElement,
    private i18n: I18n,
    handlers: HudHandlers,
  ) {
    this.header = el('div', 'hud-header');
    this.header.dataset.ui = 'header';
    this.pauseBtn = el('button', 'hud-button hud-pause', ICONS.pause);
    this.pauseBtn.type = 'button';
    this.pauseBtn.dataset.ui = 'pause';
    this.pauseBtn.addEventListener('click', () => handlers.pause());

    this.lives = el('div', 'hud-lives');
    this.lives.dataset.ui = 'lives';
    this.combo = el('div', 'hud-combo');
    this.combo.dataset.ui = 'combo';
    this.combo.hidden = true;
    this.coins = el('div', 'hud-coins', ICONS.coin);
    this.coins.dataset.ui = 'coins';
    this.coinsValue = el('span', 'hud-coins-value', '0');
    this.coins.appendChild(this.coinsValue);
    this.header.append(this.pauseBtn, this.lives, el('div', 'hud-spacer'), this.combo, this.coins);

    this.boosters = el('div', 'hud-boosters');
    this.boosters.dataset.ui = 'boosters';
    for (const id of BOOSTER_IDS) {
      const btn = el('button', 'hud-booster');
      btn.type = 'button';
      btn.dataset.ui = `booster-${id}`;
      btn.dataset.booster = id;
      btn.addEventListener('click', () => handlers.booster(id));
      this.buttons.set(id, btn);
      this.boosters.appendChild(btn);
    }
    root.append(this.header, this.boosters);
    this.applyTexts(i18n);
  }

  applyTexts(i18n: I18n): void {
    this.i18n = i18n;
    this.pauseBtn.setAttribute('aria-label', i18n.t('hud.pause'));
    this.lives.setAttribute('aria-label', i18n.t('hud.lives'));
    this.combo.setAttribute('aria-label', i18n.t('hud.combo'));
    this.coins.setAttribute('aria-label', i18n.t('hud.coins'));
    this.boosters.setAttribute('aria-label', i18n.t('hud.boosters'));
  }

  applyLayout(l: Layout): void {
    place(this.header, l.header);
    place(this.boosters, l.boosters);
    this.boosters.classList.toggle('column', l.orientation === 'landscape');
  }

  setVisible(on: boolean): void {
    this.header.hidden = !on;
    this.boosters.hidden = !on;
  }

  /** GD-51, FX-04: whole hearts and cracked ones. */
  setLives(lives: number, lost: number): void {
    if (this.lives.childElementCount !== lives) {
      this.lives.replaceChildren(
        ...Array.from({ length: lives }, () => el('span', 'hud-heart', ICONS.heart)),
      );
      this.shownLost = 0;
    }
    Array.from(this.lives.children).forEach((h, i) => {
      const broken = i >= lives - lost;
      if (h.classList.contains('broken') !== broken || h.childElementCount === 0) {
        h.innerHTML = broken ? ICONS.heartBroken : ICONS.heart;
      }
      h.classList.toggle('broken', broken);
      // FX-04: a heart cracks when it breaks; a whole one is ready to crack again.
      if (!broken) h.classList.remove('cracking');
      else if (i < lives - this.shownLost) h.classList.add('cracking');
    });
    this.shownLost = lost;
  }

  setCoins(n: number): void {
    this.coinsValue.textContent = String(n);
  }

  /** FX-02: "×2", "×3"… with a bounce on every increase. */
  setCombo(n: number): void {
    this.combo.hidden = n < 2;
    if (n >= 2) this.combo.textContent = this.i18n.t('hud.comboValue', { n });
    if (n > this.shownCombo && n >= 2) {
      this.combo.classList.remove('bounce');
      void this.combo.offsetWidth;
      this.combo.classList.add('bounce');
    }
    this.shownCombo = n;
  }

  /** INP-04: a booster is locked, ready (with a count), offered for a video, or spent for this level. */
  setBoosters(views: BoosterView[]): void {
    for (const v of views) {
      const btn = this.buttons.get(v.id);
      if (!btn) continue;
      const name = this.i18n.t(`booster.${v.id}.name`);
      const key = `booster.${v.id}.short`;
      const short = this.i18n.has(key) ? this.i18n.t(key) : name;
      btn.dataset.state = v.state;
      btn.classList.toggle('armed', v.armed);
      btn.disabled = v.state === 'locked' || v.state === 'spent';
      const label = short;
      let badge = String(v.count);
      if (v.state === 'locked') {
        badge = '';
        btn.setAttribute('aria-label', this.i18n.t('booster.locked', { name }));
      } else if (v.state === 'video') {
        badge = '+1';
        btn.setAttribute('aria-label', this.i18n.t('booster.forVideo', { name }));
      } else {
        btn.setAttribute('aria-label', name);
      }
      const icon =
        v.state === 'locked' ? ICONS.lock : v.state === 'video' ? ICONS.video : BOOSTER_ICONS[v.id];
      btn.innerHTML = icon;
      btn.append(el('span', 'hud-booster-label'));
      (btn.lastChild as HTMLElement).textContent = label;
      if (badge) {
        const b = el('span', 'hud-booster-count');
        b.textContent = badge;
        btn.append(b);
      }
    }
  }
}
