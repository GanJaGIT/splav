/**
 * ART-04, §9: `npm run promo` makes the store materials in release/.
 *
 *   npm run promo                 everything
 *   npm run promo -- --only=art   icon, covers, hero (compositions from the game SVGs)
 *   npm run promo -- --only=screens,video
 *
 * The icon and the covers are compositions, not screenshots: a river drawn in SVG, the game's
 * own sprites, a merge flash and the title in Nunito, rendered by Chromium at the exact size.
 * Screenshots and the video are recorded from the e2e build with the bot playing (screens and
 * video need `npm run build:e2e` and the port 4174 free).
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import ffmpegPath from 'ffmpeg-static';
import type { DevHooks } from '../src/dev';
import { useBrowsersPath } from './browsers-path';

declare global {
  interface Window {
    __game?: DevHooks;
  }
}

useBrowsersPath();

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'release');
const arg = (name: string): string | null =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const only = arg('only')?.split(',') ?? null;
const want = (part: string): boolean => !only || only.includes(part);

const TITLES: Record<string, string> = {
  ru: (JSON.parse(readFileSync(join(ROOT, 'src/i18n/ru.json'), 'utf8')) as Record<string, string>)[
    'game.title'
  ] as string,
  en: (JSON.parse(readFileSync(join(ROOT, 'src/i18n/en.json'), 'utf8')) as Record<string, string>)[
    'game.title'
  ] as string,
};

const dataUrl = (file: string, type: string): string =>
  `data:${type};base64,${readFileSync(file).toString('base64')}`;
const sprite = (name: string): string =>
  dataUrl(join(ROOT, 'art/sprites', `${name}.svg`), 'image/svg+xml');
const font = (subset: string): string =>
  dataUrl(
    join(ROOT, `node_modules/@fontsource/nunito/files/nunito-${subset}-900-normal.woff2`),
    'font/woff2',
  );

// ---------------------------------------------------------------------------------------------
// Compositions (ART-04)

/** A sprite on the picture: centre, size in px, rotation in degrees. */
interface Put {
  name: string;
  x: number;
  y: number;
  size: number;
  rot?: number;
}

interface Scene {
  w: number;
  h: number;
  /** The river centre line (SVG path) and its width. */
  river: string;
  riverW: number;
  sprites: Put[];
  /** Merge flashes: centre and radius. */
  flashes: { x: number; y: number; r: number }[];
  title?: { text: string; x: number; y: number; size: number; anchor: 'start' | 'middle' };
}

function sceneHtml(s: Scene): string {
  const puts = s.sprites
    .map(
      (p) =>
        `<img src="${sprite(p.name)}" style="left:${p.x - p.size / 2}px;top:${p.y - p.size / 2}px;width:${p.size}px;height:${p.size}px;transform:rotate(${p.rot ?? 0}deg)">`,
    )
    .join('');
  // The glow goes under the sprites (the merging items stay visible), the sparkles over them.
  const glows = s.flashes
    .map(
      (f) =>
        `<div class="glow" style="left:${f.x - f.r}px;top:${f.y - f.r}px;width:${f.r * 2}px;height:${f.r * 2}px"></div>` +
        `<img class="fx" src="${sprite('fx-ring')}" style="left:${f.x - f.r * 0.9}px;top:${f.y - f.r * 0.9}px;width:${f.r * 1.8}px;height:${f.r * 1.8}px">`,
    )
    .join('');
  const flashes = s.flashes
    .map((f) =>
      [
        [0, 0, 0.9],
        [-0.55, -0.45, 0.42],
        [0.6, -0.35, 0.36],
        [0.45, 0.55, 0.3],
        [-0.5, 0.5, 0.26],
      ]
        .map(
          ([dx, dy, k]) =>
            `<img class="fx" src="${sprite('fx-sparkle')}" style="left:${f.x + (dx as number) * f.r - (k as number) * f.r * 0.5}px;top:${f.y + (dy as number) * f.r - (k as number) * f.r * 0.5}px;width:${(k as number) * f.r}px;height:${(k as number) * f.r}px">`,
        )
        .join(''),
    )
    .join('');
  const t = s.title;
  const title = t
    ? `<div class="title" style="left:${t.anchor === 'middle' ? 0 : t.x}px;${t.anchor === 'middle' ? 'right:0;text-align:center;' : ''}top:${t.y}px;font-size:${t.size}px">${t.text}</div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Nunito; font-weight: 900; src: url(${font('latin')}) format('woff2'); unicode-range: U+0000-00FF; }
@font-face { font-family: Nunito; font-weight: 900; src: url(${font('cyrillic')}) format('woff2'); unicode-range: U+0400-045F; }
html, body { margin: 0; width: ${s.w}px; height: ${s.h}px; overflow: hidden; }
#bg { position: absolute; inset: 0; }
img { position: absolute; filter: drop-shadow(0 ${s.w / 160}px 0 rgba(36, 67, 44, 0.35)); }
img.fx { filter: none; }
.glow { position: absolute; border-radius: 50%; background: radial-gradient(circle, rgba(255, 252, 214, 0.95) 0%, rgba(255, 236, 140, 0.55) 35%, rgba(255, 236, 140, 0) 70%); }
.title { position: absolute; font-family: Nunito; font-weight: 900; color: #fff; letter-spacing: 0.01em; line-height: 1;
  -webkit-text-stroke: 0.14em #4a2f1b; paint-order: stroke fill;
  text-shadow: 0 0.09em 0 #4a2f1b, 0 0.2em 0.3em rgba(0, 0, 0, 0.25); }
</style></head><body>
<svg id="bg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">
  <defs>
    <linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8de7e"/><stop offset="1" stop-color="#6db556"/></linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#72d3f4"/><stop offset="1" stop-color="#2f9bd4"/></linearGradient>
    <radialGradient id="sun" cx="0.3" cy="0.15" r="0.7"><stop offset="0" stop-color="#fff8d0" stop-opacity="0.6"/><stop offset="1" stop-color="#fff8d0" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#meadow)"/>
  <g id="deco"></g>
  <path d="${s.river}" fill="none" stroke="#24432c" stroke-opacity="0.25" stroke-width="${s.riverW + 34}" stroke-linecap="round"/>
  <path d="${s.river}" fill="none" stroke="#f2dba6" stroke-width="${s.riverW + 26}" stroke-linecap="round"/>
  <path id="river" d="${s.river}" fill="none" stroke="url(#water)" stroke-width="${s.riverW}" stroke-linecap="round"/>
  <path d="${s.river}" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="${s.riverW * 0.45}" stroke-linecap="round"/>
  <g id="waves" fill="none" stroke="#ffffff" stroke-linecap="round"></g>
  <rect width="100%" height="100%" fill="url(#sun)"/>
</svg>
${glows}${puts}${flashes}${title}
<script>
  // Waves along the river, grass and flowers on the banks; a fixed LCG keeps every run the same.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const river = document.getElementById('river');
  const len = river.getTotalLength();
  const W = ${s.riverW};
  const ns = 'http://www.w3.org/2000/svg';
  const waves = document.getElementById('waves');
  const step = Math.max(26, W / 4);
  for (let l = 0; l < len; l += step) {
    for (const side of [-0.28, 0.05, 0.3]) {
      const p = river.getPointAtLength(l + (side + 0.3) * step);
      const q = river.getPointAtLength(Math.min(len, l + (side + 0.3) * step + 1));
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      const off = side * W + (rnd() - 0.5) * W * 0.12;
      const x = p.x - Math.sin(a) * off, y = p.y + Math.cos(a) * off;
      const r = W * (0.045 + rnd() * 0.03);
      const path = document.createElementNS(ns, 'path');
      const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      path.setAttribute('d', 'M' + (x - dx) + ' ' + (y - dy) + ' Q' + (x - Math.sin(a) * r * -0.9) + ' ' + (y + Math.cos(a) * r * -0.9) + ' ' + (x + dx) + ' ' + (y + dy));
      path.setAttribute('stroke-width', String(Math.max(2, W / 60)));
      path.setAttribute('stroke-opacity', String(0.35 + rnd() * 0.3));
      waves.appendChild(path);
    }
  }
  const pts = [];
  for (let l = 0; l <= len; l += 8) pts.push(river.getPointAtLength(l));
  const far = (x, y, d) => pts.every((p) => Math.hypot(p.x - x, p.y - y) > d);
  const deco = document.getElementById('deco');
  const unit = ${s.w} / 100;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * ${s.w}, y = rnd() * ${s.h};
    if (!far(x, y, W / 2 + 30)) continue;
    const g = document.createElementNS(ns, 'g');
    const k = unit * (0.5 + rnd() * 0.5);
    if (i % 5 === 0) {
      // A bush.
      g.innerHTML = '<circle cx="' + x + '" cy="' + y + '" r="' + k * 3.2 + '" fill="#4f9a45" stroke="#24432c" stroke-width="' + k * 0.5 + '"/>' +
        '<circle cx="' + (x - k * 2.6) + '" cy="' + (y + k * 0.8) + '" r="' + k * 2.3 + '" fill="#5aa84d" stroke="#24432c" stroke-width="' + k * 0.5 + '"/>' +
        '<circle cx="' + (x - k) + '" cy="' + (y - k) + '" r="' + k * 1.2 + '" fill="#8fd16a"/>';
    } else if (i % 3 === 0) {
      const c = ['#ffffff', '#ffd23f', '#ff8fb4', '#b48cff'][i % 4];
      g.innerHTML = '<circle cx="' + x + '" cy="' + y + '" r="' + k * 0.9 + '" fill="' + c + '" stroke="#24432c" stroke-width="' + k * 0.3 + '"/><circle cx="' + x + '" cy="' + y + '" r="' + k * 0.35 + '" fill="#f5a623"/>';
    } else {
      g.innerHTML = '<path d="M' + (x - k) + ' ' + y + ' q' + k * 0.3 + ' ' + -k * 1.6 + ' ' + k * 0.2 + ' ' + -k * 2.2 + ' M' + x + ' ' + y + ' q0 ' + -k * 2 + ' ' + k * 0.4 + ' ' + -k * 2.8 + ' M' + (x + k) + ' ' + y + ' q' + -k * 0.1 + ' ' + -k * 1.4 + ' ' + k * 0.6 + ' ' + -k * 2 + '" fill="none" stroke="#3f7f3a" stroke-width="' + k * 0.45 + '" stroke-linecap="round"/>';
    }
    deco.appendChild(g);
  }
  document.body.dataset.ready = '1';
</script>
</body></html>`;
}

/** ART-04: the icon — a boat on the river, a merge flash, no text, no frame. */
const ICON: Scene = {
  w: 512,
  h: 512,
  river: 'M -60 120 C 140 160, 330 300, 580 420',
  riverW: 330,
  sprites: [
    { name: 'item-garden-4', x: 392, y: 136, size: 150, rot: 8 },
    { name: 'item-wood-6', x: 232, y: 268, size: 310, rot: -6 },
    { name: 'item-fish-6', x: 392, y: 420, size: 150, rot: -10 },
    { name: 'item-garden-3', x: 92, y: 424, size: 120, rot: -8 },
  ],
  flashes: [{ x: 400, y: 128, r: 92 }],
};

function cover(lang: string): Scene {
  return {
    w: 800,
    h: 470,
    river: 'M -60 300 C 180 230, 420 420, 860 300',
    riverW: 210,
    sprites: [
      { name: 'pier', x: 702, y: 190, size: 150 },
      { name: 'resident-fisher', x: 662, y: 132, size: 82 },
      { name: 'item-fish-5', x: 726, y: 214, size: 92, rot: -4 },
      { name: 'item-garden-3', x: 160, y: 300, size: 110, rot: -8 },
      { name: 'item-garden-3', x: 262, y: 322, size: 110, rot: 6 },
      { name: 'item-wood-6', x: 450, y: 348, size: 190, rot: -4 },
      { name: 'item-fish-6', x: 640, y: 352, size: 120, rot: 8 },
      { name: 'item-stone-6', x: 60, y: 390, size: 104, rot: -6 },
      { name: 'item-joker-0', x: 330, y: 240, size: 72, rot: 10 },
    ],
    flashes: [{ x: 212, y: 304, r: 86 }],
    title: {
      text: TITLES[lang] as string,
      x: 44,
      y: 46,
      size: lang === 'ru' ? 112 : 86,
      anchor: 'start',
    },
  };
}

const HERO: Scene = {
  w: 1560,
  h: 520,
  river: 'M -80 330 C 300 230, 700 460, 1100 330 S 1500 250, 1660 300',
  riverW: 230,
  sprites: [
    { name: 'pier', x: 180, y: 170, size: 170 },
    { name: 'resident-gardener', x: 122, y: 108, size: 92 },
    { name: 'item-garden-5', x: 206, y: 192, size: 100 },
    { name: 'item-wood-3', x: 330, y: 312, size: 120, rot: 6 },
    { name: 'item-garden-4', x: 520, y: 330, size: 130, rot: -6 },
    { name: 'item-wood-6', x: 790, y: 382, size: 210, rot: -4 },
    { name: 'item-fish-3', x: 1010, y: 352, size: 120, rot: 6 },
    { name: 'item-fish-3', x: 1120, y: 320, size: 120, rot: -6 },
    { name: 'item-stone-5', x: 1330, y: 280, size: 120 },
    { name: 'pier', x: 1430, y: 150, size: 170 },
    { name: 'resident-miller', x: 1372, y: 90, size: 92 },
    { name: 'item-stone-6', x: 1456, y: 172, size: 100 },
  ],
  flashes: [{ x: 1066, y: 334, r: 100 }],
};

/** Renders a composition to release/<file>, or to an absolute path. */
async function renderScene(browser: Browser, s: Scene, file: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  page.on('pageerror', (e) => console.error(`promo: ${file}: ${e.message}`));
  await page.setContent(sceneHtml(s));
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.screenshot({ path: isAbsolute(file) ? file : join(OUT, file), type: 'png' });
  await page.close();
  if (!isAbsolute(file)) console.log(`promo: ${file}`);
}

/** The README banner (docs/media). */
const BANNER: Scene = {
  w: 1280,
  h: 420,
  river: 'M -80 300 C 260 220, 620 400, 960 300 S 1240 230, 1380 270',
  riverW: 190,
  sprites: [
    { name: 'pier', x: 130, y: 150, size: 150 },
    { name: 'resident-gardener', x: 80, y: 95, size: 82 },
    { name: 'item-garden-5', x: 152, y: 170, size: 90 },
    { name: 'item-garden-3', x: 300, y: 292, size: 100, rot: -6 },
    { name: 'item-garden-3', x: 392, y: 314, size: 100, rot: 6 },
    { name: 'item-wood-6', x: 640, y: 332, size: 170, rot: -4 },
    { name: 'item-fish-6', x: 900, y: 300, size: 110, rot: 8 },
    { name: 'item-stone-6', x: 1062, y: 268, size: 100 },
    { name: 'pier', x: 1170, y: 140, size: 150 },
    { name: 'resident-fisher', x: 1120, y: 85, size: 82 },
    { name: 'item-fish-5', x: 1192, y: 162, size: 90 },
  ],
  flashes: [{ x: 346, y: 302, r: 80 }],
  title: { text: TITLES.ru as string, x: 0, y: 40, size: 130, anchor: 'middle' },
};

async function art(browser: Browser): Promise<void> {
  await renderScene(browser, ICON, 'icon-512.png');
  for (const lang of ['ru', 'en'])
    await renderScene(browser, cover(lang), `cover-${lang}-800x470.png`);
  await renderScene(browser, HERO, 'hero-1560x520.png');
}

/** The last 3 seconds of the video: the title over the river (§9). */
function titleCard(lang: string): Scene {
  return {
    w: 1280,
    h: 720,
    river: 'M -80 500 C 300 400, 700 640, 1360 470',
    riverW: 300,
    sprites: [
      { name: 'item-garden-4', x: 230, y: 470, size: 170, rot: -8 },
      { name: 'item-wood-6', x: 640, y: 540, size: 290, rot: -4 },
      { name: 'item-fish-6', x: 1010, y: 500, size: 180, rot: 8 },
      { name: 'pier', x: 1170, y: 330, size: 190 },
      { name: 'resident-fisher', x: 1108, y: 262, size: 100 },
    ],
    flashes: [{ x: 230, y: 470, r: 120 }],
    title: {
      text: TITLES[lang] as string,
      x: 0,
      y: 110,
      // "Merge River" is twice as long as «Сплав»: smaller, clear of the villager on the right.
      size: lang === 'ru' ? 190 : 124,
      anchor: 'middle',
    },
  };
}

/** The same title for the vertical video (9:16, §9 — desirable). */
function titleCardTall(lang: string): Scene {
  return {
    w: 720,
    h: 1280,
    river: 'M -80 820 C 200 700, 520 960, 800 800',
    riverW: 320,
    sprites: [
      { name: 'pier', x: 560, y: 560, size: 200 },
      { name: 'resident-fisher', x: 492, y: 482, size: 108 },
      { name: 'item-garden-4', x: 140, y: 800, size: 150, rot: -8 },
      { name: 'item-wood-6', x: 380, y: 880, size: 270, rot: -4 },
      { name: 'item-fish-6', x: 610, y: 860, size: 150, rot: 8 },
      { name: 'item-stone-6', x: 130, y: 1110, size: 140, rot: -6 },
    ],
    flashes: [{ x: 140, y: 800, r: 110 }],
    title: {
      text: TITLES[lang] as string,
      x: 0,
      y: 220,
      size: lang === 'ru' ? 150 : 104,
      anchor: 'middle',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Screenshots and the video: the e2e build (release build + DEV-02 hooks), the bot plays.

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function startServer(): Promise<ChildProcess> {
  if (!process.argv.includes('--no-build')) {
    const b = spawnSync('npm run build:e2e', { stdio: 'inherit', shell: true });
    if (b.status !== 0) throw new Error('npm run build:e2e failed');
  }
  const server = spawn(
    `npx vite preview --mode e2e --outDir dist-e2e --port ${PORT} --strictPort`,
    { shell: true, stdio: 'ignore' },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return server;
    } catch {
      // not yet
    }
    await wait(300);
  }
  throw new Error(`the preview server did not start on ${BASE}`);
}

function stopServer(server: ChildProcess): void {
  if (process.platform === 'win32' && server.pid) {
    spawnSync(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
  } else {
    server.kill();
  }
}

async function openLevel(page: Page, level: string, lang: string): Promise<void> {
  if (!page.url().startsWith(BASE)) {
    await page.goto(`${BASE}/?lang=${lang}`);
    await page.waitForFunction(() => window.__game?.isReady() === true);
  }
  await page.evaluate((id) => window.__game?.openLevel(id), level);
  await wait(400);
  const ok = page.locator('[data-ui="intro-ok"]');
  if ((await ok.count()) > 0) await ok.click();
  // A fresh profile finds every item for the first time: its notes would cover the river.
  await page.addStyleTag({ content: '.toast { display: none !important; }' });
}

/**
 * A full river for the camera: the novice bot lets items pile up, then the deft one merges
 * them in quick runs (combos, cascades).
 */
async function warmUp(page: Page, seconds: number): Promise<void> {
  await page.evaluate(() => {
    window.__game?.setSpeed(1.5);
    window.__game?.bot('novice');
  });
  await wait((seconds * 1000) / 1.5);
  await page.evaluate(() => window.__game?.bot('deft'));
}

/** Waits for a merge (coins go up), with a combo when asked, then shoots inside its flash. */
async function shootMerge(page: Page, path: string, combo: number): Promise<void> {
  const look = (): Promise<{ coins: number; combo: number; status: string | null }> =>
    page.evaluate(() => {
      const s = window.__game?.state();
      return { coins: s?.coins ?? 0, combo: s?.combo ?? 0, status: s?.status ?? null };
    });
  let last = await look();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await wait(30);
    const now = await look();
    if (now.status !== 'playing') break;
    if (now.coins > last.coins && now.combo >= combo) break;
    last = now;
  }
  await wait(70);
  await page.screenshot({ path, type: 'png' });
}

/** §9: 4 gameplay screenshots per device, one of them right at a merge flash. */
const SHOTS: { level: string; play: number; combo: number }[] = [
  { level: 'c2-06', play: 16, combo: 2 },
  { level: 'c3-03', play: 20, combo: 1 },
  { level: 'c3-08', play: 18, combo: 2 },
  { level: 'c3-11', play: 22, combo: 1 },
];

const LANGS = ['ru', 'en'];

/** §9, п. 5.1.3: every language gets its own screenshots and videos (its texts, its title). */
async function screens(browser: Browser): Promise<void> {
  const devices = [
    { name: 'desktop', viewport: { width: 1920, height: 1080 }, scale: 1, touch: false },
    // 360×640 at DPR 3: a 1080×1920 phone screenshot.
    { name: 'mobile', viewport: { width: 360, height: 640 }, scale: 3, touch: true },
  ];
  for (const lang of LANGS) {
    for (const d of devices) {
      const context = await browser.newContext({
        viewport: d.viewport,
        deviceScaleFactor: d.scale,
        isMobile: d.touch,
        hasTouch: d.touch,
      });
      const page = await context.newPage();
      for (const [i, shot] of SHOTS.entries()) {
        await openLevel(page, shot.level, lang);
        await warmUp(page, shot.play);
        const name = `screens/${lang}/${d.name}-${i + 1}.png`;
        await shootMerge(page, join(OUT, name), shot.combo);
        await page.evaluate(() => window.__game?.bot(null));
        console.log(`promo: ${name}`);
      }
      await context.close();
    }
  }
}

/**
 * §9 video, 16:9 (and 9:16), at most 28 s: the river flows (0–3 s), merges, cascades, combos and
 * deliveries (3–20 s), a building restored in the village (20–24 s), the title (the last 3 s).
 * The level takes more than 70% of the time (п. 5.1.1.3).
 */
interface VideoFormat {
  lang: string;
  file: string;
  viewport: { width: number; height: number };
  scale: number;
  mobile: boolean;
  /** The size of the MP4. */
  size: { width: number; height: number };
  title: Scene;
}

const VIDEOS: VideoFormat[] = LANGS.flatMap((lang) => [
  {
    lang,
    file: `video-16x9-${lang}.mp4`,
    viewport: { width: 1280, height: 720 },
    scale: 1,
    mobile: false,
    size: { width: 1280, height: 720 },
    title: titleCard(lang),
  },
  {
    lang,
    file: `video-9x16-${lang}.mp4`,
    viewport: { width: 360, height: 640 },
    scale: 2,
    mobile: true,
    size: { width: 720, height: 1280 },
    title: titleCardTall(lang),
  },
]);

async function video(browser: Browser, f: VideoFormat): Promise<void> {
  const ffmpeg = ffmpegPath as unknown as string | null;
  if (!ffmpeg) throw new Error('ffmpeg-static has no binary for this platform');
  const tmp = join(ROOT, 'test-results', 'promo-video');
  rmSync(tmp, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: f.viewport,
    deviceScaleFactor: f.scale,
    isMobile: f.mobile,
    hasTouch: f.mobile,
    recordVideo: { dir: tmp, size: f.size },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  await openLevel(page, 'c2-06', f.lang);
  await page.evaluate(() => window.__game?.grant(400));
  // Cut away: the level starts and the river fills up.
  await page.evaluate(() => {
    window.__game?.setSpeed(1.5);
    window.__game?.bot('novice');
  });
  await wait(9000);
  // 0–3 s: the river flows; 3–20 s: the deft bot merges, combos and delivers.
  const tStart = Date.now();
  await page.evaluate(() => window.__game?.setSpeed(1));
  await wait(3000);
  await page.evaluate(() => {
    window.__game?.setSpeed(1.25);
    window.__game?.bot('deft');
  });
  await wait(17_000);
  await page.evaluate(() => {
    window.__game?.bot(null);
    window.__game?.village();
  });
  await wait(600);
  await page.locator('[data-ui="building-pier"]').click();
  await wait(500);
  await page.locator('[data-ui="building-restore"]').click();
  // The building changes, then its window thanks the player (VIL-04).
  await wait(2700);
  const tEnd = Date.now();
  // The recorder runs a few seconds behind on a busy machine: let it catch up before closing.
  await wait(3000);
  const recorded = page.video();
  await context.close();
  const webm = await recorded?.path();
  if (!webm) throw new Error('no video recorded');
  // The game part is cut from the start of the level; the title is a still picture of 3 seconds
  // after it (the recorder skips the frames of a page set with setContent).
  const from = (tStart - t0) / 1000;
  const length = Math.min(24.8, (tEnd - tStart) / 1000);
  const title = join(tmp, 'title.png');
  await renderScene(browser, f.title, title);
  const out = join(OUT, f.file);
  const norm = `fps=30,scale=${f.size.width}:${f.size.height},setsar=1,format=yuv420p`;
  const res = spawnSync(
    ffmpeg,
    [
      '-y',
      '-ss',
      from.toFixed(2),
      '-i',
      webm,
      '-loop',
      '1',
      '-t',
      '3',
      '-i',
      title,
      '-filter_complex',
      `[0:v]${norm},trim=duration=${length.toFixed(2)}[g];[1:v]${norm},fade=t=in:st=0:d=0.4[t];[g][t]concat=n=2:v=1:a=0[v]`,
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'slow',
      '-crf',
      '20',
      '-an',
      '-movflags',
      '+faststart',
      out,
    ],
    { stdio: 'inherit' },
  );
  if (res.status !== 0) throw new Error('ffmpeg failed');
  console.log(`promo: ${f.file} (${(length + 3).toFixed(1)} s)`);
}

// ---------------------------------------------------------------------------------------------
// §9 check: every file with its size in pixels, weight and (video) length.

function pngSize(file: string): string {
  const b = readFileSync(file);
  return `${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`;
}

function videoInfo(file: string): string {
  const ffmpeg = ffmpegPath as unknown as string | null;
  if (!ffmpeg) return '?';
  const res = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const text = res.stderr;
  const dur = /Duration: ([\d:.]+)/.exec(text)?.[1] ?? '?';
  const dims = /Video: ([^,]+),[^,]*, (\d+x\d+)/.exec(text);
  return `${dims?.[2] ?? '?'} ${dims?.[1] ?? ''} ${dur}`;
}

function report(): void {
  const files = [
    ...readdirSync(OUT).filter((f) => /\.(png|mp4|zip)$/.test(f)),
    ...LANGS.flatMap((lang) =>
      readdirSync(join(OUT, 'screens', lang)).map((f) => `screens/${lang}/${f}`),
    ),
  ].sort();
  console.log('\nfile                          size                         weight');
  for (const f of files) {
    const path = join(OUT, f);
    const kb = (statSync(path).size / 1024).toFixed(0).padStart(6);
    const size = f.endsWith('.png') ? pngSize(path) : f.endsWith('.mp4') ? videoInfo(path) : '';
    console.log(`${f.padEnd(30)}${size.padEnd(29)}${kb} KB`);
  }
}

/**
 * §9 texts: counts the characters of every field of release/draft-<lang>.md (the number after
 * "—" in its heading), checks the limits, the banned words and that no sentence repeats in two
 * fields (requirement 5.11).
 */
const LIMITS: [RegExp, number, number][] = [
  [/^(Название|Title)/, 1, 50],
  [/^(Описание для SEO|SEO description)/, 50, 160],
  [/^(Короткое описание|Short description)/, 1, 70],
  [/^(Об игре|About the game)/, 100, 1000],
  [/^(Как играть|How to play)/, 100, 1000],
  [/^(Ключевые слова|Keywords)/, 1, 100],
  [/^(Теги|Tags)/, 1, 20],
  [/^(Категории|Categories)/, 1, 2],
];
const BANNED = /бесплатн|лучш|\bfree\b|\btop\b|\bbest\b|топ-?\d|№ ?1/i;

function drafts(): string[] {
  const problems: string[] = [];
  for (const lang of ['ru', 'en']) {
    const file = join(OUT, `draft-${lang}.md`);
    if (!existsSync(file)) {
      problems.push(`draft-${lang}.md is missing`);
      continue;
    }
    const lines = readFileSync(file, 'utf8').split('\n');
    const bodies: { name: string; text: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^## (.+?) — (\?|\d+)(.*)$/.exec(lines[i] as string);
      if (!m) continue;
      const name = m[1] as string;
      let j = i + 1;
      while (j < lines.length && !(lines[j] as string).startsWith('## ')) j++;
      const text = lines
        .slice(i + 1, j)
        .join('\n')
        .trim();
      const limit = LIMITS.find(([re]) => re.test(name));
      const list = limit && limit[2] <= 20;
      const n = list ? text.split(',').filter((t) => t.trim()).length : [...text].length;
      lines[i] = `## ${name} — ${n}${m[3] as string}`;
      if (limit && (n < limit[1] || n > limit[2])) {
        problems.push(`draft-${lang}: ${name}: ${n}, needs ${limit[1]}–${limit[2]}`);
      }
      // The console may count a line break as two characters (CRLF): keep that margin too.
      const breaks = text.split('\n').length - 1;
      if (limit && !list && breaks > 0 && n + breaks > limit[2]) {
        problems.push(`draft-${lang}: ${name}: ${n + breaks} with CRLF, needs ≤ ${limit[2]}`);
      }
      if (BANNED.test(text)) problems.push(`draft-${lang}: ${name}: a banned word`);
      if (/^(Название|Title)/.test(name) && /игр|game/i.test(text)) {
        problems.push(`draft-${lang}: the title has "игра"/"game"`);
      }
      if (/^(Ключевые|Keywords)/.test(name) && text !== text.toLowerCase()) {
        problems.push(`draft-${lang}: keywords must be lower case`);
      }
      bodies.push({ name, text });
    }
    // 5.11: the fields do not repeat each other.
    const seen = new Map<string, string>();
    for (const b of bodies) {
      for (const s of b.text.split(/[.!?\n]+/).map((x) => x.trim().toLowerCase())) {
        if (s.length < 25) continue;
        const other = seen.get(s);
        if (other && other !== b.name)
          problems.push(`draft-${lang}: "${s}" in ${other} and ${b.name}`);
        seen.set(s, b.name);
      }
    }
    writeFileSync(file, lines.join('\n'));
  }
  return problems;
}

/**
 * The README pictures (docs/media): the banner and the icon, a gameplay GIF and phone frames from
 * the promo files of `npm run promo`, and the village from the e2e build.
 */
async function media(browser: Browser): Promise<void> {
  const ffmpeg = ffmpegPath as unknown as string | null;
  if (!ffmpeg) throw new Error('ffmpeg-static has no binary for this platform');
  const dir = join(ROOT, 'docs', 'media');
  mkdirSync(dir, { recursive: true });
  await renderScene(browser, BANNER, join(dir, 'banner.png'));
  await renderScene(browser, ICON, join(dir, 'icon.png'));
  const run = (args: string[]): void => {
    const res = spawnSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
    if (res.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
  };
  // The phone video, 3–11 s: merges, a combo and the whirlpool, as a small looping GIF.
  run([
    '-ss',
    '3',
    '-t',
    '8',
    '-i',
    join(OUT, 'video-9x16-ru.mp4'),
    '-vf',
    'fps=12,scale=270:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    '-loop',
    '0',
    join(dir, 'gameplay.gif'),
  ]);
  for (const [from, to] of [
    ['mobile-2', 'phone-level'],
    ['mobile-3', 'phone-combo'],
  ]) {
    run([
      '-i',
      join(OUT, 'screens', 'ru', `${from}.png`),
      '-vf',
      'scale=405:-1:flags=lanczos',
      join(dir, `${to}.png`),
    ]);
  }
  // The village with some progress: seven levels with stars, the pier and the shed restored.
  const levels = Object.fromEntries(
    [3, 3, 2, 3, 2, 3, 1].map((stars, i) => [`c1-0${i + 1}`, { stars }]),
  );
  const preset = { v: 1, updatedAt: 1, levels, coins: 1350, buildings: ['pier', 'shed'] };
  for (const shot of [
    {
      file: 'phone-village.png',
      viewport: { width: 360, height: 640 },
      scale: 2,
      touch: true,
      open: '',
    },
    {
      file: 'phone-building.png',
      viewport: { width: 360, height: 640 },
      scale: 2,
      touch: true,
      open: 'building-mill',
    },
    {
      file: 'village.png',
      viewport: { width: 1280, height: 720 },
      scale: 1,
      touch: false,
      open: '',
    },
  ]) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.scale,
      isMobile: shot.touch,
      hasTouch: shot.touch,
    });
    await context.addInitScript((data) => {
      if (!localStorage.getItem('splav.save'))
        localStorage.setItem('splav.save', JSON.stringify(data));
    }, preset);
    const page = await context.newPage();
    await page.goto(`${BASE}/?lang=ru`);
    await page.waitForFunction(() => window.__game?.isReady() === true);
    await page.addStyleTag({ content: '.toast { display: none !important; }' });
    if (shot.open) await page.locator(`[data-ui="${shot.open}"]`).click();
    await wait(1200);
    const raw = join(ROOT, 'test-results', 'promo-media', shot.file);
    await page.screenshot({ path: raw, type: 'png' });
    await context.close();
    run([
      '-i',
      raw,
      '-vf',
      `scale=${shot.touch ? 405 : 1100}:-1:flags=lanczos`,
      join(dir, shot.file),
    ]);
    console.log(`promo: docs/media/${shot.file}`);
  }
}

async function main(): Promise<void> {
  for (const lang of LANGS) mkdirSync(join(OUT, 'screens', lang), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  let server: ChildProcess | null = null;
  try {
    if (want('art')) await art(browser);
    // A look at the video titles without recording (test-results/promo-titles/).
    if (only?.includes('titles')) {
      for (const f of VIDEOS) {
        await renderScene(
          browser,
          f.title,
          join(ROOT, 'test-results', 'promo-titles', `${f.file}.png`),
        );
      }
    }
    if (want('screens') || want('video') || only?.includes('media')) server = await startServer();
    if (want('screens')) await screens(browser);
    if (want('video')) for (const f of VIDEOS) await video(browser, f);
    // Not part of the store set: only on request (--only=media).
    if (only?.includes('media')) await media(browser);
  } finally {
    await browser.close();
    if (server) stopServer(server);
  }
  report();
  const problems = drafts();
  // The store texts of this release are kept in the repository too (release/ is not).
  mkdirSync(join(ROOT, 'docs', 'store'), { recursive: true });
  for (const f of ['draft-ru.md', 'draft-en.md', 'UPLOAD.md']) {
    if (existsSync(join(OUT, f))) copyFileSync(join(OUT, f), join(ROOT, 'docs', 'store', f));
  }
  for (const p of problems) console.error(`promo: ${p}`);
  if (problems.length > 0) process.exitCode = 1;
  else console.log('promo: draft texts — limits, banned words, repeats: OK');
}

await main();
