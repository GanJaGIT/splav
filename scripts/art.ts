/**
 * ART-02: `npm run art` rasterises the field sprites art/sprites/*.svg into one atlas for Phaser
 * (src/assets/atlas.png + atlas.json, TexturePacker JSON Hash) and draws contact sheets of every
 * SVG for review (test-results/art/). The village and interface icons stay SVG in the DOM.
 *
 *   npm run art              atlas + contact sheets
 *   npm run art -- --sheet   contact sheets only (quick look while drawing)
 *   npm run art -- --sheet --group=sprites --only=item-wood,item-garden --name=wood
 *                            one group, files starting with these prefixes, own sheet name
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPRITES = join(ROOT, 'art', 'sprites');
const OUT = join(ROOT, 'src', 'assets');
const SHEETS = join(ROOT, 'test-results', 'art');
/**
 * Cell of the atlas. TZ ART-02 names 128 px; a phone cell is ~50 CSS px at DPR 3 (150 device
 * pixels), so the cell is 160 to stay crisp there.
 */
const CELL = 160;
const PAD = 2;
const sheetOnly = process.argv.includes('--sheet');
const arg = (name: string): string | null =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const onlyGroup = arg('group');
const only = arg('only')?.split(',') ?? null;
const suffix = arg('name');

function svgFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.svg'))
      .sort();
  } catch {
    return [];
  }
}

/** The visible part of a picture, in shares of its width and height (alpha above ~15 %). */
interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

function render(svg: string, width: number): { png: Buffer; w: number; h: number; bounds: Bounds } {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' });
  const img = r.render();
  const { width: w, height: h, pixels } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((pixels[(y * w + x) * 4 + 3] ?? 0) <= 40) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const f = (v: number): number => Math.round(v * 1000) / 1000;
  const bounds =
    x1 < 0
      ? { x: 0, y: 0, w: 1, h: 1 }
      : { x: f(x0 / w), y: f(y0 / h), w: f((x1 - x0 + 1) / w), h: f((y1 - y0 + 1) / h) };
  return { png: img.asPng(), w, h, bounds };
}

/** A grid of cells as one SVG with embedded PNGs, rendered by resvg again. */
function grid(
  items: { name: string; png: Buffer; w: number; h: number }[],
  cell: number,
  cols: number,
  pad: number,
  labels: boolean,
  background: string,
): {
  svg: string;
  width: number;
  height: number;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
} {
  const label = labels ? 22 : 0;
  const rows = Math.ceil(items.length / cols);
  const width = cols * (cell + pad * 2);
  const height = rows * (cell + pad * 2 + label);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const parts: string[] = [];
  items.forEach((it, i) => {
    const x = (i % cols) * (cell + pad * 2) + pad;
    const y = Math.floor(i / cols) * (cell + pad * 2 + label) + pad;
    const h = Math.round((it.h / it.w) * cell);
    frames[it.name] = { x, y, w: cell, h };
    parts.push(
      `<image x="${x}" y="${y}" width="${cell}" height="${h}" href="data:image/png;base64,${it.png.toString('base64')}"/>`,
    );
    if (labels) {
      parts.push(
        `<text x="${x + cell / 2}" y="${y + h + 16}" font-family="Segoe UI, Arial, sans-serif" font-size="14" text-anchor="middle" fill="#333">${it.name}</text>`,
      );
    }
  });
  const bg = background ? `<rect width="100%" height="100%" fill="${background}"/>` : '';
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bg}${parts.join('')}</svg>`,
    width,
    height,
    frames,
  };
}

function sheet(dir: string, name: string, cell: number, cols: number, background: string): void {
  const group = basename(dir);
  if (onlyGroup && onlyGroup !== group) return;
  const files = svgFiles(dir).filter((f) => !only || only.some((p) => f.startsWith(p)));
  if (suffix) name = `${name}-${suffix}`;
  if (files.length === 0) return;
  const items = files.map((f) => {
    const r = render(readFileSync(join(dir, f), 'utf8'), cell);
    return { name: basename(f, '.svg'), ...r };
  });
  const g = grid(items, cell, cols, 8, true, background);
  const out = new Resvg(g.svg, { font: { loadSystemFonts: true } }).render().asPng();
  mkdirSync(SHEETS, { recursive: true });
  writeFileSync(join(SHEETS, `${name}.png`), out);
  console.log(`sheet ${name}: ${files.length} images → test-results/art/${name}.png`);
}

// Contact sheets: every SVG group on a light and a field-like background.
sheet(SPRITES, 'sprites', 128, 8, '#f4f1e6');
sheet(SPRITES, 'sprites-on-water', 96, 10, '#3faee0');
sheet(join(ROOT, 'art', 'village'), 'village', 200, 4, '#9ed978');
sheet(join(ROOT, 'art', 'ui'), 'ui', 64, 10, '#3f6b4a');

if (!sheetOnly) {
  const files = svgFiles(SPRITES);
  const items = files.map((f) => ({
    name: basename(f, '.svg'),
    ...render(readFileSync(join(SPRITES, f), 'utf8'), CELL),
  }));
  const cols = Math.ceil(Math.sqrt(items.length));
  const g = grid(items, CELL, cols, PAD, false, '');
  const png = new Resvg(g.svg).render().asPng();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'atlas.png'), png);
  const json = {
    frames: Object.fromEntries(
      Object.entries(g.frames).map(([name, f]) => [
        name,
        {
          frame: { x: f.x, y: f.y, w: f.w, h: f.h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
          sourceSize: { w: f.w, h: f.h },
        },
      ]),
    ),
    meta: {
      app: 'splav scripts/art.ts',
      image: 'atlas.png',
      format: 'RGBA8888',
      size: { w: g.width, h: g.height },
      scale: '1',
    },
  };
  writeFileSync(join(OUT, 'atlas.json'), JSON.stringify(json, null, 2) + '\n');
  // The visible part of every frame: the field sizes items and places their level badge by it.
  const bounds = Object.fromEntries(items.map((it) => [it.name, it.bounds]));
  writeFileSync(join(OUT, 'atlas-bounds.json'), JSON.stringify(bounds, null, 2) + '\n');
  console.log(
    `atlas: ${items.length} frames, ${g.width}×${g.height}, ${(png.length / 1024).toFixed(0)} KB → src/assets/atlas.png`,
  );
}
