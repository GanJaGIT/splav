import type { I18n } from '../services/I18n';
import { el, ICONS } from './hud';
import { buildingBox, buildingSvg, MAP_H, MAP_W, mapSvg, nodePosition } from './village-art';

export const VILLAGE_ICONS = {
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5A2.5 2.5 0 0 1 4 21.5z" opacity="0.6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 3.5-.9-.3a7.5 7.5 0 0 0-.7-1.7l.4-.9-1.9-1.9-.9.4a7.5 7.5 0 0 0-1.7-.7L15 3h-3l-.3.9a7.5 7.5 0 0 0-1.7.7l-.9-.4L7.2 6.1l.4.9a7.5 7.5 0 0 0-.7 1.7L6 9v3l.9.3c.2.6.4 1.2.7 1.7l-.4.9 1.9 1.9.9-.4c.5.3 1.1.5 1.7.7l.3.9h3l.3-.9c.6-.2 1.2-.4 1.7-.7l.9.4 1.9-1.9-.4-.9c.3-.5.5-1.1.7-1.7L21 12z" transform="translate(-1.5 -1.5) scale(1.1)"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 13H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke-width="2.2"/></svg>',
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
}

export interface VillageHandlers {
  play(): void;
  level(id: string): void;
  building(id: string): void;
  chapter(n: number): void;
  encyclopedia(): void;
  settings(): void;
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
    header.append(coinPill, starPill, bagPill, el('div', 'hud-spacer'), this.bookBtn, this.gearBtn);

    const chapters = el('div', 'village-chapters');
    this.title = el('div', 'village-chapter-title');
    this.tabs = el('div', 'village-tabs');
    chapters.append(this.title, this.tabs);

    this.wrap = el('div', 'village-map-wrap');
    this.map = el('div', 'village-map', mapSvg());
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
    bottom.append(this.message, this.play);

    this.root.append(header, chapters, this.wrap, bottom);
    parent.appendChild(this.root);
    this.applyTexts(i18n);
  }

  applyTexts(i18n: I18n): void {
    this.i18n = i18n;
    (this.play.firstChild as HTMLElement).textContent = i18n.t('village.play');
    this.bookBtn.setAttribute('aria-label', i18n.t('village.encyclopedia'));
    this.gearBtn.setAttribute('aria-label', i18n.t('village.settings'));
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
        buildingSvg(b.id, b.restored),
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
