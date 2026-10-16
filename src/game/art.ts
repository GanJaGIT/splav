/**
 * Temporary art (Stage 2): textures drawn with the Canvas 2D API at start-up. The final SVG art
 * and the atlas come in Stage 5 (ART-02). GD-24, ACC-01: every chain has its own silhouette and
 * colour, items grow with their level, a small level digit sits in the corner.
 */

import type Phaser from 'phaser';
import type { Chain } from '../sim';

/** Texture side for items and obstacles: crisp up to a ~53 px cell at DPR 3. */
export const TEX = 160;
const C = TEX / 2;
const LINE = 9;

export const itemKey = (chain: Chain, level: number): string => `item-${chain}-${level}`;
export const RESIDENT_KEY = (id: string): string => `resident-${id}`;

/** Particle colour of each chain (FX-01). */
export const CHAIN_COLOR: Record<Chain, number> = {
  wood: 0xc48a52,
  garden: 0xf48fb1,
  stone: 0xbdbdbd,
  fish: 0x4fc3f7,
  joker: 0xffffff,
};

const OUTLINE: Record<Chain, string> = {
  wood: '#5a3a1e',
  garden: '#2e6b3a',
  stone: '#3f3f3f',
  fish: '#1f4f7a',
  joker: '#4a3a7a',
};

type Ctx = CanvasRenderingContext2D;

function canvas(w = TEX, h = TEX): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return [c, ctx];
}

function paint(ctx: Ctx, fill: string, stroke: string, width = LINE): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function polygon(ctx: Ctx, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

/** Soft shadow under every item (ART-01). */
function shadow(ctx: Ctx, size: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ellipse(ctx, C, C + size * 0.62, size * 0.62, size * 0.14);
  ctx.fill();
  ctx.restore();
}

function wood(ctx: Ctx, level: number, s: number): void {
  const o = OUTLINE.wood;
  ctx.save();
  ctx.translate(C, C);
  switch (level) {
    case 1:
      ctx.rotate(-0.6);
      polygon(ctx, [
        [-s * 0.95, s * 0.05],
        [-s * 0.3, -s * 0.3],
        [s * 0.95, -s * 0.12],
        [s * 0.2, s * 0.32],
      ]);
      paint(ctx, '#d9a066', o);
      break;
    case 2:
      ctx.rotate(-0.5);
      roundRect(ctx, -s * 0.95, -s * 0.13, s * 1.9, s * 0.26, s * 0.13);
      paint(ctx, '#a86b3c', o);
      ellipse(ctx, s * 0.35, -s * 0.42, s * 0.28, s * 0.14, -0.6);
      paint(ctx, '#7cc35b', OUTLINE.garden, LINE * 0.8);
      break;
    case 3:
      roundRect(ctx, -s * 0.9, -s * 0.38, s * 1.6, s * 0.76, s * 0.3);
      paint(ctx, '#a86b3c', o);
      ellipse(ctx, s * 0.62, 0, s * 0.3, s * 0.38);
      paint(ctx, '#e0b07a', o);
      ellipse(ctx, s * 0.62, 0, s * 0.12, s * 0.16);
      ctx.strokeStyle = o;
      ctx.lineWidth = LINE * 0.6;
      ctx.stroke();
      break;
    case 4:
      for (const dy of [-0.55, 0, 0.55]) {
        roundRect(ctx, -s, s * (dy - 0.24), s * 2, s * 0.48, s * 0.1);
        paint(ctx, dy === 0 ? '#c48a52' : '#b0773f', o);
      }
      break;
    case 5:
      for (const dx of [-0.75, -0.25, 0.25, 0.75]) {
        roundRect(ctx, s * (dx - 0.24), -s, s * 0.48, s * 2, s * 0.24);
        paint(ctx, '#a86b3c', o);
      }
      ctx.fillStyle = '#e8d29a';
      ctx.fillRect(-s, -s * 0.12, s * 2, s * 0.24);
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(-s * 1.05, -s * 0.25);
      ctx.lineTo(s * 1.05, -s * 0.25);
      ctx.quadraticCurveTo(s * 0.8, s * 0.75, 0, s * 0.75);
      ctx.quadraticCurveTo(-s * 0.8, s * 0.75, -s * 1.05, -s * 0.25);
      ctx.closePath();
      paint(ctx, '#8b5a2b', o);
      roundRect(ctx, -s * 0.85, -s * 0.38, s * 1.7, s * 0.2, s * 0.08);
      paint(ctx, '#d9a066', o, LINE * 0.7);
      polygon(ctx, [
        [0, -s * 0.3],
        [0, -s * 1.05],
        [s * 0.6, -s * 0.45],
      ]);
      paint(ctx, '#fff3d6', o, LINE * 0.7);
  }
  ctx.restore();
}

function flower(ctx: Ctx, x: number, y: number, r: number, petal: string, center: string): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ellipse(ctx, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.45, r * 0.22, a);
    paint(ctx, petal, OUTLINE.garden, LINE * 0.5);
  }
  ellipse(ctx, x, y, r * 0.36, r * 0.36);
  paint(ctx, center, OUTLINE.garden, LINE * 0.5);
}

function garden(ctx: Ctx, level: number, s: number): void {
  const o = OUTLINE.garden;
  ctx.save();
  ctx.translate(C, C);
  switch (level) {
    case 1:
      ellipse(ctx, 0, 0, s * 0.45, s * 0.65, 0.3);
      paint(ctx, '#c9a26b', o);
      break;
    case 2:
      ctx.beginPath();
      ctx.moveTo(0, s * 0.9);
      ctx.lineTo(0, -s * 0.2);
      ctx.lineWidth = LINE * 1.3;
      ctx.strokeStyle = o;
      ctx.stroke();
      ellipse(ctx, -s * 0.4, -s * 0.3, s * 0.42, s * 0.22, 0.5);
      paint(ctx, '#7cc35b', o);
      ellipse(ctx, s * 0.4, -s * 0.45, s * 0.42, s * 0.22, -0.5);
      paint(ctx, '#7cc35b', o);
      break;
    case 3:
      flower(ctx, 0, 0, s, '#ffffff', '#ffd54f');
      break;
    case 4:
      polygon(ctx, [
        [-s * 0.35, s * 0.2],
        [s * 0.35, s * 0.2],
        [s * 0.12, s * 1],
        [-s * 0.12, s * 1],
      ]);
      paint(ctx, '#8fd16a', o);
      flower(ctx, -s * 0.45, -s * 0.15, s * 0.5, '#f48fb1', '#ffd54f');
      flower(ctx, s * 0.45, -s * 0.15, s * 0.5, '#ffffff', '#ffd54f');
      flower(ctx, 0, -s * 0.6, s * 0.5, '#ffd54f', '#f57c00');
      break;
    case 5:
      polygon(ctx, [
        [-s * 0.95, -s * 0.05],
        [s * 0.95, -s * 0.05],
        [s * 0.7, s * 0.95],
        [-s * 0.7, s * 0.95],
      ]);
      paint(ctx, '#c48a52', OUTLINE.wood);
      flower(ctx, -s * 0.5, -s * 0.3, s * 0.45, '#f48fb1', '#ffd54f');
      flower(ctx, s * 0.5, -s * 0.3, s * 0.45, '#ce93d8', '#ffd54f');
      flower(ctx, 0, -s * 0.55, s * 0.45, '#ffffff', '#ffd54f');
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
      ctx.lineWidth = s * 0.4;
      ctx.strokeStyle = o;
      ctx.stroke();
      ctx.lineWidth = s * 0.28;
      ctx.strokeStyle = '#66bb6a';
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        flower(
          ctx,
          Math.cos(a) * s * 0.8,
          Math.sin(a) * s * 0.8,
          s * 0.32,
          ['#f48fb1', '#ffffff', '#ffd54f'][i % 3] as string,
          '#f57c00',
        );
      }
  }
  ctx.restore();
}

function stone(ctx: Ctx, level: number, s: number): void {
  const o = OUTLINE.stone;
  ctx.save();
  ctx.translate(C, C);
  switch (level) {
    case 1:
      for (const [x, y, r] of [
        [-0.4, 0.1, 0.22],
        [0.3, -0.25, 0.18],
        [0.25, 0.35, 0.2],
      ] as const) {
        polygon(ctx, [
          [s * (x - r), s * y],
          [s * x, s * (y - r)],
          [s * (x + r), s * (y + r * 0.3)],
          [s * x, s * (y + r)],
        ]);
        paint(ctx, '#d6c7a1', o, LINE * 0.6);
      }
      break;
    case 2:
      ellipse(ctx, 0, 0, s * 0.75, s * 0.5);
      paint(ctx, '#bdbdbd', o);
      break;
    case 3:
      polygon(ctx, [
        [-s * 0.85, s * 0.3],
        [-s * 0.5, -s * 0.55],
        [s * 0.3, -s * 0.7],
        [s * 0.85, -s * 0.1],
        [s * 0.6, s * 0.6],
        [-s * 0.3, s * 0.7],
      ]);
      paint(ctx, '#9e9e9e', o);
      break;
    case 4:
      polygon(ctx, [
        [-s, s * 0.45],
        [-s * 0.7, -s * 0.6],
        [0, -s * 0.95],
        [s * 0.85, -s * 0.5],
        [s, s * 0.4],
        [s * 0.2, s * 0.9],
        [-s * 0.6, s * 0.85],
      ]);
      paint(ctx, '#8d8d8d', o);
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-s * 0.3, s * 0.4);
      ctx.lineWidth = LINE * 0.6;
      ctx.stroke();
      break;
    case 5:
      ellipse(ctx, 0, 0, s * 0.95, s * 0.95);
      paint(ctx, '#a1a1a1', o);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
        ctx.lineTo(Math.cos(a + 0.3) * s * 0.85, Math.sin(a + 0.3) * s * 0.85);
        ctx.lineWidth = LINE * 0.5;
        ctx.stroke();
      }
      ellipse(ctx, 0, 0, s * 0.22, s * 0.22);
      paint(ctx, '#5d5d5d', o);
      break;
    default:
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        roundRect(ctx, -s * 0.14, -s * 1.02, s * 0.28, s * 0.4, s * 0.06);
        paint(ctx, '#b0773f', OUTLINE.wood, LINE * 0.6);
        ctx.restore();
      }
      ellipse(ctx, 0, 0, s * 0.7, s * 0.7);
      paint(ctx, '#c48a52', OUTLINE.wood);
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i / 4) * Math.PI);
        ctx.fillStyle = OUTLINE.wood;
        ctx.fillRect(-s * 0.7, -s * 0.05, s * 1.4, s * 0.1);
        ctx.restore();
      }
      ellipse(ctx, 0, 0, s * 0.2, s * 0.2);
      paint(ctx, '#8d8d8d', o);
  }
  ctx.restore();
}

function fishShape(ctx: Ctx, len: number, h: number, body: string, fin: string): void {
  polygon(ctx, [
    [len * 0.55, 0],
    [len * 0.95, -h * 0.7],
    [len * 0.95, h * 0.7],
  ]);
  paint(ctx, fin, OUTLINE.fish, LINE * 0.7);
  ellipse(ctx, -len * 0.05, 0, len * 0.65, h);
  paint(ctx, body, OUTLINE.fish);
  ellipse(ctx, -len * 0.42, -h * 0.25, h * 0.16, h * 0.16);
  ctx.fillStyle = '#1b1b1b';
  ctx.fill();
}

function fish(ctx: Ctx, level: number, s: number): void {
  ctx.save();
  ctx.translate(C, C);
  switch (level) {
    case 1:
      fishShape(ctx, s * 0.9, s * 0.32, '#b3e5fc', '#81d4fa');
      break;
    case 2:
      fishShape(ctx, s * 1.1, s * 0.42, '#cfd8dc', '#ef5350');
      break;
    case 3:
      fishShape(ctx, s * 1.15, s * 0.55, '#c5e1a5', '#ff8a65');
      ctx.fillStyle = 'rgba(46,107,58,0.6)';
      for (const x of [-0.35, -0.05, 0.25]) ctx.fillRect(x * s, -s * 0.45, s * 0.12, s * 0.9);
      break;
    case 4:
      fishShape(ctx, s * 1.25, s * 0.38, '#9ccc65', '#689f38');
      break;
    case 5:
      fishShape(ctx, s * 1.2, s * 0.6, '#78909c', '#546e7a');
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, s * 0.05);
      ctx.quadraticCurveTo(-s * 0.95, s * 0.2, -s * 1.05, s * 0.55);
      ctx.moveTo(-s * 0.6, s * 0.15);
      ctx.quadraticCurveTo(-s * 0.85, s * 0.4, -s * 0.85, s * 0.75);
      ctx.lineWidth = LINE * 0.5;
      ctx.strokeStyle = OUTLINE.fish;
      ctx.stroke();
      break;
    default:
      fishShape(ctx, s * 1.2, s * 0.62, '#ffca28', '#ff8f00');
      ctx.fillStyle = '#fff59d';
      for (const [x, y] of [
        [-0.2, -0.75],
        [0.5, -0.8],
        [0.1, 0.85],
      ] as const) {
        polygon(ctx, [
          [s * x, s * (y - 0.15)],
          [s * (x + 0.06), s * (y - 0.04)],
          [s * x, s * (y + 0.15)],
          [s * (x - 0.06), s * (y - 0.04)],
        ]);
        ctx.fill();
      }
  }
  ctx.restore();
}

function joker(ctx: Ctx, s: number): void {
  ctx.save();
  ctx.translate(C, C);
  const g = ctx.createLinearGradient(-s, -s, s, s);
  ['#ef5350', '#ffca28', '#66bb6a', '#42a5f5', '#ab47bc'].forEach((c, i) =>
    g.addColorStop(i / 4, c),
  );
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.05);
  ctx.bezierCurveTo(s * 0.4, -s * 0.4, s * 0.8, 0, s * 0.8, s * 0.3);
  ctx.arc(0, s * 0.3, s * 0.8, 0, Math.PI);
  ctx.bezierCurveTo(-s * 0.8, 0, -s * 0.4, -s * 0.4, 0, -s * 1.05);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = LINE;
  ctx.strokeStyle = OUTLINE.joker;
  ctx.stroke();
  ctx.restore();
}

/** GD-24: the level digit in the corner. */
function digit(ctx: Ctx, level: number, chain: Chain): void {
  const r = TEX * 0.17;
  const x = TEX - r - 3;
  const y = TEX - r - 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = OUTLINE[chain];
  ctx.stroke();
  ctx.fillStyle = '#1f2a1f';
  ctx.font = `800 ${Math.round(r * 1.5)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), x, y + 2);
}

function itemCanvas(chain: Chain, level: number): HTMLCanvasElement {
  const [c, ctx] = canvas();
  // GD-24: bigger with every level.
  const s = TEX * (chain === 'joker' ? 0.36 : 0.27 + 0.02 * level);
  shadow(ctx, s);
  if (chain === 'wood') wood(ctx, level, s);
  else if (chain === 'garden') garden(ctx, level, s);
  else if (chain === 'stone') stone(ctx, level, s);
  else if (chain === 'fish') fish(ctx, level, s);
  else joker(ctx, s);
  if (chain !== 'joker') digit(ctx, level, chain);
  return c;
}

function rockCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ellipse(ctx, C, C + 30, 70, 26);
  ctx.fill();
  polygon(ctx, [
    [14, 118],
    [30, 52],
    [70, 26],
    [120, 34],
    [148, 84],
    [140, 124],
    [80, 136],
  ]);
  paint(ctx, '#6d6f73', '#2b2d30', 10);
  ellipse(ctx, 76, 46, 34, 14, -0.2);
  ctx.fillStyle = '#7cb342';
  ctx.fill();
  return c;
}

function snagCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas();
  ctx.strokeStyle = '#3e2a15';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(14, 120);
  ctx.quadraticCurveTo(70, 60, 146, 44);
  ctx.stroke();
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(70, 86);
  ctx.lineTo(56, 30);
  ctx.moveTo(108, 58);
  ctx.lineTo(132, 112);
  ctx.stroke();
  ctx.strokeStyle = '#6d4c2a';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(14, 120);
  ctx.quadraticCurveTo(70, 60, 146, 44);
  ctx.stroke();
  return c;
}

function pierCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas();
  for (let i = 0; i < 5; i++) {
    roundRect(ctx, 8, 10 + i * 29, TEX - 16, 25, 6);
    paint(ctx, i % 2 ? '#c48a52' : '#b0773f', '#5a3a1e', 5);
  }
  return c;
}

const RESIDENT_HAIR: Record<string, string> = {
  fisher: '#8d6e63',
  carpenter: '#ffb74d',
  miller: '#eeeeee',
  gardener: '#e57373',
  stoker: '#5d4037',
  builder: '#ffd54f',
};

function residentCanvas(id: string): HTMLCanvasElement {
  const [c, ctx] = canvas(96, 96);
  ellipse(ctx, 48, 48, 44, 44);
  paint(ctx, '#fff8e1', '#5a3a1e', 5);
  ellipse(ctx, 48, 56, 26, 28);
  paint(ctx, '#ffccbc', '#5a3a1e', 4);
  ctx.beginPath();
  ctx.arc(48, 46, 28, Math.PI, 0);
  ctx.fillStyle = RESIDENT_HAIR[id] ?? '#8d6e63';
  ctx.fill();
  ctx.fillStyle = '#3e2723';
  for (const x of [38, 58]) {
    ellipse(ctx, x, 58, 3.5, 4.5);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(48, 66, 8, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3e2723';
  ctx.stroke();
  return c;
}

function dotCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(16, 16);
  ellipse(ctx, 8, 8, 7, 7);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return c;
}

const CHAINS: Chain[] = ['wood', 'garden', 'stone', 'fish'];

/** Creates every texture once per game. */
export function ensureTextures(scene: Phaser.Scene, residents: readonly string[]): void {
  const add = (key: string, make: () => HTMLCanvasElement): void => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  };
  for (const chain of CHAINS) {
    for (let level = 1; level <= 6; level++)
      add(itemKey(chain, level), () => itemCanvas(chain, level));
  }
  add(itemKey('joker', 0), () => itemCanvas('joker', 0));
  add('rock', rockCanvas);
  add('snag', snagCanvas);
  add('pier', pierCanvas);
  add('dot', dotCanvas);
  for (const id of residents) add(RESIDENT_KEY(id), () => residentCanvas(id));
}

const urls = new Map<string, string>();
const cached = (key: string, make: () => HTMLCanvasElement): string => {
  let url = urls.get(key);
  if (!url) {
    url = make().toDataURL('image/png');
    urls.set(key, url);
  }
  return url;
};

/** The same pictures for the DOM interface (encyclopedia, windows, cards). */
export function itemImage(chain: Chain, level: number): string {
  return cached(itemKey(chain, level), () => itemCanvas(chain, level));
}

export function residentImage(id: string): string {
  return cached(RESIDENT_KEY(id), () => residentCanvas(id));
}

export function obstacleImage(kind: 'rock' | 'snag' | 'pier'): string {
  return cached(kind, kind === 'rock' ? rockCanvas : kind === 'snag' ? snagCanvas : pierCanvas);
}
