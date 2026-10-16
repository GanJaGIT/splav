/**
 * The windows around the game: the leaderboard (YG-15, DAY-03), sign-in (YG-09), the shop
 * (YG-14) and the review request (YG-16). They only read and call services; App opens them.
 */

import type { Platform } from './platform/Platform';
import { dayIndex } from './services/day';
import type { I18n } from './services/I18n';
import {
  DAILY_BOARD,
  DAILY_SCORE_BASE,
  STARS_BOARD,
  type LeaderboardService,
} from './services/leaderboard';
import type { ProgressService } from './services/progress';
import type { ShopService } from './services/shop';
import { el } from './ui/hud';
import type { Modals } from './ui/modal';
import type { Toast } from './ui/toast';

export type RatingTab = 'stars' | 'daily';

/** DAY-03: with fewer of today's results than this the window says "Be the first today". */
const FEW_TODAY = 3;
/** Rows in the window: the top of the board (and the player below it). */
const SHOWN = 7;

export interface MetaDeps {
  platform: Platform;
  progress: ProgressService;
  boards: LeaderboardService;
  shop: ShopService;
  modals: Modals;
  toast: Toast;
  i18n: () => I18n;
  /** Something changed that the village shows (boosters, "No ads"). */
  changed: () => void;
}

export class Meta {
  constructor(private readonly d: MetaDeps) {}

  private get t(): I18n {
    return this.d.i18n();
  }

  // -------------------------------------------------------------------------------------------
  // The leaderboard (YG-15)

  /** UI-05: "Leaderboard" with the tabs "Stars" and "River of the Day". */
  openRating(tab: RatingTab = 'stars', onClose: () => void = () => this.d.modals.close()): void {
    const t = this.t;
    const box = el('div', 'rating');
    const tabs = el('div', 'rating-tabs');
    for (const id of ['stars', 'daily'] as const) {
      const b = el('button', `rating-tab${id === tab ? ' on' : ''}`);
      b.type = 'button';
      b.dataset.ui = `rating-tab-${id}`;
      b.textContent = t.t(id === 'stars' ? 'rating.stars' : 'rating.daily');
      b.addEventListener('click', () => {
        if (id !== tab) this.openRating(id, onClose);
      });
      tabs.appendChild(b);
    }
    const list = el('ol', 'rating-list');
    list.dataset.ui = 'rating-list';
    const note = el('p', 'modal-text rating-note');
    note.dataset.ui = 'rating-note';
    note.textContent = t.t('rating.loading');
    box.append(tabs, list, note);
    if (tab === 'daily' && this.d.progress.data.settings.calm) {
      const calm = el('p', 'modal-text rating-calm');
      calm.textContent = t.t('rating.calm');
      box.appendChild(calm);
    }
    const authorized = this.d.platform.isAuthorized();
    if (!authorized) {
      // YG-09: the benefit of signing in, next to the button.
      const why = el('p', 'modal-text rating-auth');
      why.textContent = t.t('auth.benefit');
      box.appendChild(why);
    }
    this.d.modals.open({
      ui: 'rating',
      title: t.t('rating.title'),
      content: box,
      buttons: [
        ...(authorized
          ? []
          : [
              {
                ui: 'rating-login',
                label: t.t('auth.login'),
                primary: true,
                onClick: () => void this.login(() => this.openRating(tab, onClose)),
              },
            ]),
        { ui: 'rating-close', label: t.t('rating.close'), primary: authorized, onClick: onClose },
      ],
    });
    void this.fill(tab, list, note);
  }

  private async fill(tab: RatingTab, list: HTMLElement, note: HTMLElement): Promise<void> {
    const t = this.t;
    try {
      const e = await this.d.boards.entries(tab === 'stars' ? STARS_BOARD : DAILY_BOARD);
      if (!list.isConnected) return;
      let rows = e.entries;
      if (tab === 'daily') {
        // DAY-03: only today's results; the day number sits in the score.
        const day = dayIndex(this.d.platform.serverTime());
        rows = rows.filter((r) => Math.floor(r.score / DAILY_SCORE_BASE) === day);
      }
      // Short enough for a phone without scrolling: the top and the player's own row.
      const top = rows.slice(0, SHOWN);
      const me = rows.find((r) => r.isPlayer);
      const shown = me && !top.includes(me) ? [...top, me] : top;
      list.replaceChildren(
        ...shown.map((r) => {
          const li = el('li', `rating-row${r.isPlayer ? ' me' : ''}`);
          const rank = el('span', 'rating-rank');
          rank.textContent = String(r.rank);
          const name = el('span', 'rating-name');
          name.textContent = r.isPlayer ? t.t('rating.you') : r.name || '—';
          const score = el('span', 'rating-score');
          score.textContent = String(tab === 'daily' ? r.score % DAILY_SCORE_BASE : r.score);
          li.append(rank, name, score);
          return li;
        }),
      );
      if (tab === 'daily' && rows.length < FEW_TODAY) note.textContent = t.t('rating.firstToday');
      else if (rows.length === 0) note.textContent = t.t('rating.empty');
      else note.textContent = '';
      note.hidden = note.textContent === '';
    } catch {
      if (list.isConnected) note.textContent = t.t('rating.error');
    }
  }

  // -------------------------------------------------------------------------------------------
  // Sign-in (YG-09): only by a button that says what it gives

  async login(after: () => void): Promise<void> {
    const ok = await this.d.platform.openAuth();
    if (ok) {
      this.d.boards.reset();
      this.d.toast.show(this.t.t('auth.done'));
    }
    after();
  }

  // -------------------------------------------------------------------------------------------
  // The shop (YG-14), behind features.iap

  openShop(onClose: () => void = () => this.d.modals.close()): void {
    const t = this.t;
    const box = el('div', 'shop');
    const products = this.d.shop.products;
    for (const p of products) {
      const row = el('div', 'shop-item');
      row.dataset.ui = `shop-item-${p.id}`;
      if (p.imageURI) {
        const img = el('img', 'shop-image');
        img.src = p.imageURI;
        img.alt = '';
        row.appendChild(img);
      }
      const text = el('div', 'shop-text');
      // YG-14: the name and description come from the console, not from the game texts.
      const title = el('div', 'shop-title');
      title.textContent = p.title;
      const desc = el('div', 'shop-desc');
      desc.textContent = p.description;
      text.append(title, desc);
      const owned = p.id === 'no_ads' && this.d.progress.data.noAds;
      const buy = el('button', 'shop-buy');
      buy.type = 'button';
      buy.dataset.ui = `shop-buy-${p.id}`;
      buy.disabled = owned;
      if (owned) {
        buy.textContent = t.t('shop.owned');
      } else {
        // 1.13.2: the price and the currency icon as the platform gives them.
        const price = el('span', 'shop-price');
        price.textContent = p.priceValue;
        buy.appendChild(price);
        if (p.currencyImageURI) {
          const cur = el('img', 'shop-currency');
          cur.src = p.currencyImageURI;
          cur.alt = p.priceCurrencyCode;
          buy.appendChild(cur);
        } else {
          const code = el('span', 'shop-code');
          code.textContent = p.priceCurrencyCode;
          buy.appendChild(code);
        }
        buy.setAttribute('aria-label', `${t.t('shop.buy')}: ${p.title}, ${p.price}`);
        buy.addEventListener('click', () => void this.buy(p.id, onClose));
      }
      row.append(text, buy);
      box.appendChild(row);
    }
    if (products.length === 0) {
      const empty = el('p', 'modal-text');
      empty.textContent = t.t('shop.empty');
      box.appendChild(empty);
    }
    this.d.modals.open({
      ui: 'shop',
      title: t.t('shop.title'),
      content: box,
      buttons: [{ ui: 'shop-close', label: t.t('shop.close'), primary: true, onClick: onClose }],
    });
  }

  private async buy(id: string, onClose: () => void): Promise<void> {
    const res = await this.d.shop.buy(id);
    this.d.toast.show(this.t.t(res === 'ok' ? 'shop.done' : 'shop.failed'));
    this.d.changed();
    if (this.d.modals.current() === 'shop') this.openShop(onClose);
  }

  // -------------------------------------------------------------------------------------------
  // The review (YG-16): after the first pass of c1-08, once

  async askReview(): Promise<void> {
    const pr = this.d.progress;
    if (pr.data.reviewAsked) return;
    pr.markReviewAsked();
    if (await this.d.platform.review.canAsk()) await this.d.platform.review.ask();
  }
}
