import { BOOSTER_IDS, type BoosterId } from '../config';
import type { I18n } from '../services/I18n';
import type { Layout, Rect } from './layout';

/** Temporary interface icons; the final ones come from art/ in Stage 5 (ART-02). */
export const ICONS = {
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.3 4.4 2.6.8-1.3 2.2-2.6 4.4-2.6 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/><path class="crack" d="M12 7l-1.5 4 2.5 2-2 5" fill="none"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5" fill="none" stroke-width="2"/></svg>',
  video:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="15" height="14" rx="3"/><path d="M17 10l5-3v10l-5-3z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke-width="2.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z"/></svg>',
} as const;

const BOOSTER_ICONS: Record<BoosterId, string> = {
  dam: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="15" width="18" height="4" rx="1"/></svg>',
  hook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2v11a5 5 0 1 1-10 0" fill="none" stroke-width="3" stroke-linecap="round"/><path d="M14 2l6 4" fill="none" stroke-width="3" stroke-linecap="round"/></svg>',
  joker:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 4.5 7 8.6 7 12.5A7 7 0 0 1 5 14.5C5 10.6 9 6.5 12 2z"/></svg>',
  net: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18M3 10h18M3 16h18M5 2v20M12 2v20M19 2v20" fill="none" stroke-width="2"/></svg>',
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
  className: string,
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
      h.classList.toggle('broken', broken);
      if (broken && i < lives - this.shownLost) h.classList.add('cracking');
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
