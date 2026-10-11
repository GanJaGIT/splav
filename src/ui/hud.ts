import { BOOSTER_IDS, type BoosterId } from '../config';
import type { I18n } from '../services/I18n';
import type { Layout, Rect } from './layout';

/** Temporary interface icons; the final ones come from art/ in Stage 5 (ART-02). */
const ICONS = {
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.3 4.4 2.6.8-1.3 2.2-2.6 4.4-2.6 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5" fill="none" stroke-width="2"/></svg>',
} as const;

const BOOSTER_ICONS: Record<BoosterId, string> = {
  dam: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="15" width="18" height="4" rx="1"/></svg>',
  hook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2v11a5 5 0 1 1-10 0" fill="none" stroke-width="3" stroke-linecap="round"/><path d="M14 2l6 4" fill="none" stroke-width="3" stroke-linecap="round"/></svg>',
  joker:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 4.5 7 8.6 7 12.5A7 7 0 0 1 5 14.5C5 10.6 9 6.5 12 2z"/></svg>',
  net: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18M3 10h18M3 16h18M5 2v20M12 2v20M19 2v20" fill="none" stroke-width="2"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(
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

/**
 * UI-11, UI-12: interface stub of the level screen — header (pause, hearts, coins, combo) and
 * booster buttons. Behaviour arrives in Stage 2.
 */
export class Hud {
  private readonly header: HTMLElement;
  private readonly boosters: HTMLElement;

  constructor(root: HTMLElement, i18n: I18n) {
    this.header = el('div', 'hud-header');
    const pause = el('button', 'hud-button hud-pause', ICONS.pause);
    pause.type = 'button';
    pause.setAttribute('aria-label', i18n.t('hud.pause'));
    pause.dataset.testid = 'pause';

    const lives = el('div', 'hud-lives');
    lives.setAttribute('aria-label', i18n.t('hud.lives'));
    for (let i = 0; i < 3; i++) lives.appendChild(el('span', 'hud-heart', ICONS.heart));

    const combo = el('div', 'hud-combo');
    combo.setAttribute('aria-label', i18n.t('hud.combo'));
    combo.hidden = true;

    const coins = el('div', 'hud-coins', ICONS.coin);
    coins.setAttribute('aria-label', i18n.t('hud.coins'));
    coins.appendChild(el('span', 'hud-coins-value', '0'));

    this.header.append(pause, lives, el('div', 'hud-spacer'), combo, coins);

    this.boosters = el('div', 'hud-boosters');
    this.boosters.setAttribute('aria-label', i18n.t('hud.boosters'));
    for (const id of BOOSTER_IDS) {
      const btn = el('button', 'hud-booster', BOOSTER_ICONS[id]);
      btn.type = 'button';
      btn.dataset.booster = id;
      btn.setAttribute('aria-label', i18n.t(`booster.${id}.name`));
      const shortKey = `booster.${id}.short`;
      const label = el('span', 'hud-booster-label');
      label.textContent = i18n.t(i18n.has(shortKey) ? shortKey : `booster.${id}.name`);
      const count = el('span', 'hud-booster-count');
      count.textContent = '0';
      btn.append(label, count);
      this.boosters.appendChild(btn);
    }

    root.append(this.header, this.boosters);
  }

  applyLayout(l: Layout): void {
    place(this.header, l.header);
    place(this.boosters, l.boosters);
    this.boosters.classList.toggle('column', l.orientation === 'landscape');
  }
}
