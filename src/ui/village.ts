import type { I18n } from '../services/I18n';
import { el, ICONS } from './hud';
import { icon } from './icons';
import { buildingBox, buildingHtml, MAP_H, MAP_W, mapHtml, nodePosition } from './village-art';

export const VILLAGE_ICONS = {
  book: icon('book'),
  gear: icon('gear'),
  bag: icon('bag'),
  cup: icon('cup'),
  wave: icon('wave'),
} as const;

export interface VillageLevel {
  id: string;
  num: number;
  stars: number;
  state: 'done' | 'next' | 'locked';
}

export interface VillageView {
  coins: number;
  stars: number;
  boosters: number;
  chapter: number;
  chapters: { n: number; open: boolean }[];
  levels: VillageLevel[];
  buildings: { id: string; restored: boolean; affordable: boolean; price: number }[];
  play: { enabled: boolean; sub: string };
  message: string | null;
  /** DAY-01: the daily river button, after the Pier; the best result of today. */
  daily: { open: boolean; best: number };
  /** YG-14: the boosters pill opens the shop when purchases are on. */
  shop: boolean;
}

export interface VillageHandlers {
  play(): void;
  level(id: string): void;
  building(id: string): void;
  chapter(n: number): void;
  encyclopedia(): void;
  settings(): void;
  daily(): void;
  rating(): void;
  shop(): void;
}

/** VIL-01, UI-03: the main screen between levels. */
export class Village {
  private readonly root: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly stars: HTMLElement;
  private readonly boosters: HTMLElement;
  private readonly title: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly wrap: HTMLElement;
  private readonly map: HTMLElement;
  private readonly message: HTMLElement;
  private readonly play: HTMLButtonElement;
  private readonly playSub: HTMLElement;
  private readonly bookBtn: HTMLButtonElement;
  private readonly gearBtn: HTMLButtonElement;
  private readonly cupBtn: HTMLButtonElement;
  private readonly shopBtn: HTMLButtonElement;
  private readonly bagPill: HTMLElement;
  private readonly dailyBtn: HTMLButtonElement;
  private readonly dailySub: HTMLElement;

  constructor(
    parent: HTMLElement,
    private i18n: I18n,
    private readonly h: VillageHandlers,
    /** A computer: no 44 px touch minimum, so small maps may shrink the circles. */
    private readonly desktop = false,
  ) {
    this.root = el('div', 'village');
    this.root.dataset.ui = 'village';
    this.root.hidden = true;

    const header = el('div', 'village-header');
    const pill = (ui: string, icon: string): [HTMLElement, HTMLElement] => {
      const p = el('div', 'pill', icon);
      p.dataset.ui = ui;
      const v = el('span', 'pill-value');
      p.appendChild(v);
      return [p, v];
    };
    const [coinPill, coins] = pill('village-coins', ICONS.coin);
    const [starPill, stars] = pill('village-stars', ICONS.star);
    const [bagPill, boosters] = pill('village-boosters', VILLAGE_ICONS.bag);
    this.coins = coins;
    this.stars = stars;
    this.boosters = boosters;
    coinPill.classList.add('coins');
    starPill.classList.add('stars-pill');
    this.bookBtn = el('button', 'hud-button village-button', VILLAGE_ICONS.book);
    this.bookBtn.type = 'button';
    this.bookBtn.dataset.ui = 'village-encyclopedia';
    this.bookBtn.addEventListener('click', () => h.encyclopedia());
    this.gearBtn = el('button', 'hud-button village-button', VILLAGE_ICONS.gear);
    this.gearBtn.type = 'button';
    this.gearBtn.dataset.ui = 'village-settings';
    this.gearBtn.addEventListener('click', () => h.settings());
    this.cupBtn = el('button', 'hud-button village-button', VILLAGE_ICONS.cup);
    this.cupBtn.type = 'button';
    this.cupBtn.dataset.ui = 'village-rating';
    this.cupBtn.addEventListener('click', () => h.rating());
    // YG-14: with purchases on, the boosters pill is the way to the shop.
    this.bagPill = bagPill;
    this.shopBtn = el('button', 'pill pill-button', VILLAGE_ICONS.bag);
    this.shopBtn.type = 'button';
    this.shopBtn.dataset.ui = 'village-shop';
    this.shopBtn.hidden = true;
    this.shopBtn.addEventListener('click', () => h.shop());
    header.append(
      coinPill,
      starPill,
      bagPill,
      this.shopBtn,
      el('div', 'hud-spacer'),
      this.cupBtn,
      this.bookBtn,
      this.gearBtn,
    );

    const chapters = el('div', 'village-chapters');
    this.title = el('div', 'village-chapter-title');
    this.tabs = el('div', 'village-tabs');
    chapters.append(this.title, this.tabs);

    this.wrap = el('div', 'village-map-wrap');
    this.map = el('div', 'village-map', mapHtml());
    this.map.dataset.ui = 'village-map';
    this.wrap.appendChild(this.map);

    const bottom = el('div', 'village-bottom');
    this.message = el('div', 'village-message');
    this.message.dataset.ui = 'village-message';
    this.play = el('button', 'village-play');
    this.play.type = 'button';
    this.play.dataset.ui = 'village-play';
    this.play.addEventListener('click', () => h.play());
    const playLabel = el('span', 'village-play-label');
    this.playSub = el('span', 'village-play-sub');
    this.play.append(playLabel, this.playSub);
    // DAY-01: "River of the Day" next to "Play" once the Pier stands.
    this.dailyBtn = el('button', 'village-daily', VILLAGE_ICONS.wave);
    this.dailyBtn.type = 'button';
    this.dailyBtn.dataset.ui = 'village-daily';
    this.dailyBtn.hidden = true;
    this.dailyBtn.addEventListener('click', () => h.daily());
    const dailyLabel = el('span', 'village-daily-label');
    this.dailySub = el('span', 'village-play-sub');
    this.dailyBtn.append(dailyLabel, this.dailySub);
    const actions = el('div', 'village-actions');
    actions.append(this.play, this.dailyBtn);
    bottom.append(this.message, actions);

    this.root.append(header, chapters, this.wrap, bottom);
    parent.appendChild(this.root);
    this.applyTexts(i18n);
  }

  applyTexts(i18n: I18n): void {
    this.i18n = i18n;
    (this.play.firstChild as HTMLElement).textContent = i18n.t('village.play');
    this.bookBtn.setAttribute('aria-label', i18n.t('village.encyclopedia'));
    this.gearBtn.setAttribute('aria-label', i18n.t('village.settings'));
    this.cupBtn.setAttribute('aria-label', i18n.t('village.rating'));
    this.shopBtn.setAttribute('aria-label', i18n.t('village.shop'));
    (this.dailyBtn.querySelector('.village-daily-label') as HTMLElement).textContent =
      i18n.t('village.daily');
    this.coins.parentElement?.setAttribute('aria-label', i18n.t('hud.coins'));
    this.stars.parentElement?.setAttribute('aria-label', i18n.t('village.stars'));
    this.boosters.parentElement?.setAttribute('aria-label', i18n.t('village.boosters'));
  }

  visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.fit();
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** The map keeps its proportions inside the space it has. */
  fit(): void {
    if (this.root.hidden) return;
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    const width = Math.min(w, (h * MAP_W) / MAP_H);
    this.map.style.width = `${Math.floor(width)}px`;
    this.map.style.height = `${Math.floor((width * MAP_H) / MAP_W)}px`;
    // Circles, stars and prices grow a little on big maps. On touch screens they never go below
    // the 44 px touch size; with a mouse a short window may shrink them a little.
    const min = this.desktop ? 0.75 : 1;
    this.map.style.setProperty('--s', Math.min(1.4, Math.max(min, width / 400)).toFixed(3));
  }

  render(v: VillageView, justRestored: string | null = null): void {
    const t = this.i18n;
    this.coins.textContent = String(v.coins);
    this.stars.textContent = String(v.stars);
    this.boosters.textContent = String(v.boosters);
    this.bagPill.hidden = v.shop;
    this.shopBtn.hidden = !v.shop;
    if (v.shop) {
      this.shopBtn.replaceChildren();
      this.shopBtn.insertAdjacentHTML('beforeend', VILLAGE_ICONS.bag);
      const n = el('span', 'pill-value');
      n.textContent = String(v.boosters);
      this.shopBtn.appendChild(n);
    }
    this.dailyBtn.hidden = !v.daily.open;
    this.dailySub.textContent =
      v.daily.best > 0 ? t.t('village.dailyBest', { n: v.daily.best }) : '';
    this.dailySub.hidden = v.daily.best <= 0;
    this.title.textContent = `${t.t('chapter.label', { n: v.chapter })} · ${t.t(`chapter.${v.chapter}`)}`;

    this.tabs.replaceChildren(
      ...v.chapters.map((c) => {
        const b = el(
          'button',
          `village-tab${c.n === v.chapter ? ' on' : ''}${c.open ? '' : ' locked'}`,
          c.open ? '' : ICONS.lock,
        );
        b.type = 'button';
        b.dataset.ui = `village-chapter-${c.n}`;
        b.setAttribute('aria-label', t.t('chapter.label', { n: c.n }));
        const n = el('span');
        n.textContent = String(c.n);
        b.appendChild(n);
        b.addEventListener('click', () => this.h.chapter(c.n));
        return b;
      }),
    );

    // Everything on the map is placed in percent of the drawing.
    const pct = (x: number, total: number): string => `${((x / total) * 100).toFixed(3)}%`;
    const nodes = v.levels.flatMap((l, i) => {
      const p = nodePosition(i);
      const b = el('button', `level-node ${l.state}`);
      b.type = 'button';
      b.dataset.ui = `level-${l.id}`;
      b.style.left = pct(p.x, MAP_W);
      b.style.top = pct(p.y, MAP_H);
      b.disabled = l.state === 'locked';
      b.setAttribute('aria-label', t.t('level.number', { n: l.num }));
      const num = el('span', 'level-num');
      num.textContent = String(l.num);
      b.appendChild(num);
      b.addEventListener('click', () => this.h.level(l.id));
      if (l.state === 'next') {
        // The glow goes under the circle, outside the button.
        const g = el('span', 'level-glow');
        g.style.left = b.style.left;
        g.style.top = b.style.top;
        return [g, b];
      }
      if (l.state !== 'done') return [b];
      // The stars hang under the circle, outside the button.
      const s = el('span', 'level-stars');
      s.dataset.ui = `stars-${l.id}`;
      s.style.left = b.style.left;
      s.style.top = b.style.top;
      s.textContent = '★'.repeat(l.stars) + '☆'.repeat(3 - l.stars);
      return [b, s];
    });
    const buildings = v.buildings.map((b) => {
      const btn = el(
        'button',
        `building${b.restored ? ' restored' : ''}`,
        buildingHtml(b.id, b.restored),
      );
      btn.type = 'button';
      btn.dataset.ui = `building-${b.id}`;
      Object.assign(btn.style, buildingBox(b.id));
      btn.setAttribute('aria-label', t.t(`building.${b.id}.name`));
      if (!b.restored) {
        const price = el('span', `building-price${b.affordable ? ' ready' : ''}`, ICONS.coin);
        const n = el('span');
        n.textContent = String(b.price);
        price.appendChild(n);
        btn.appendChild(price);
      }
      // VIL-04: a short animation when a building is restored.
      if (b.id === justRestored) btn.classList.add('just-restored');
      btn.addEventListener('click', () => this.h.building(b.id));
      return btn;
    });
    const svg = this.map.firstElementChild;
    this.map.replaceChildren(...(svg ? [svg] : []), ...buildings, ...nodes);

    this.message.textContent = v.message ?? '';
    this.message.hidden = !v.message;
    this.play.disabled = !v.play.enabled;
    this.playSub.textContent = v.play.sub;
    this.playSub.hidden = !v.play.sub;
    this.fit();
  }
}
