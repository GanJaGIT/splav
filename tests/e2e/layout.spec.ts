/**
 * QA-04: level screens × sizes × languages. Elements stay on screen, buttons do not overlap and
 * are at least 44 px on touch screens, text is not cut and not smaller than 14 px, a phone cell is
 * at least 44 px on the biggest field, the desktop active area is at most 2:1.
 * Screenshots go to test-results/layout/ for review.
 */

import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { openGame, state } from './helpers';

const SIZES: [number, number][] = [
  [360, 560],
  [360, 640],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1080],
];
const LANGS = ['ru', 'en'];
const BIG = JSON.parse(
  readFileSync(new URL('../fixtures/level-5x8.json', import.meta.url), 'utf8'),
) as unknown;
const OUT = 'test-results/layout';

/** Phones and tablets are touch devices; 1280 px and wider are computers. */
const isTouch = (w: number): boolean => w < 1280;
const isPhone = (w: number, h: number): boolean => Math.min(w, h) < 600;

/** A level that is won with one delivery and lost in a few seconds. */
const QUICK = {
  id: 'c1-91',
  chapter: 1,
  lanes: 3,
  rows: 7,
  stepTicks: 2,
  seed: 5,
  waitFirstMerge: true,
  spawn: { perStep: [3, 3], weights: [{ chain: 'garden', level: 1, w: 1 }] },
  initial: [{ col: 3, row: 2, chain: 'wood', level: 1 }],
  script: [],
  piers: [{ col: 4, row: 2, resident: 'fisher', orders: [{ chain: 'wood', level: 1 }] }],
  obstacles: [],
  backwater: 1,
  lives: 3,
  intro: null,
  gift: null,
};

async function check(
  page: Page,
  screen: string,
  w: number,
  h: number,
  lang: string,
  problems: string[],
): Promise<void> {
  await page.waitForTimeout(500);
  // JPEG: a 2560×1080 PNG takes seconds to encode with software rendering.
  await page.screenshot({
    path: `${OUT}/${screen}-${w}x${h}-${lang}.jpg`,
    type: 'jpeg',
    quality: 80,
  });
  const report = (what: string): void => {
    problems.push(`${screen}: ${what}`);
  };
  const rects = (await page.evaluate(() => window.__game?.debugUI())) ?? [];
  for (const r of rects.filter((x) => x.visible)) {
    if (r.x < -1 || r.y < -1 || r.x + r.width > w + 1 || r.y + r.height > h + 1) {
      report(
        `${r.ui} is off screen (${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.width.toFixed(0)}×${r.height.toFixed(0)})`,
      );
    }
  }
  const modal = (await page.locator('.modal').count()) > 0;
  const buttons = await page.evaluate((inModal) => {
    const scope = inModal ? document.querySelector('.modal') : document.getElementById('ui');
    return Array.from(scope?.querySelectorAll<HTMLElement>('button') ?? [])
      .filter((b) => b.offsetParent !== null && !b.closest('[hidden]'))
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          ui: b.dataset.ui ?? b.textContent ?? '?',
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      });
  }, modal);
  for (let i = 0; i < buttons.length; i++) {
    const a = buttons[i];
    if (!a) continue;
    if (isTouch(w) && (a.w < 43.5 || a.h < 43.5))
      report(`button ${a.ui} is ${a.w.toFixed(0)}×${a.h.toFixed(0)}`);
    for (let j = i + 1; j < buttons.length; j++) {
      const b = buttons[j];
      if (!b) continue;
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 1 && iy > 1) report(`buttons ${a.ui} and ${b.ui} overlap`);
    }
  }
  // VIL-01: the stars under a level circle do not cover a button.
  if (!modal) {
    const covered = await page.evaluate(() => {
      const hit = (a: DOMRect, b: DOMRect): boolean =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('#ui button')).filter(
        (b) => b.offsetParent !== null,
      );
      return Array.from(document.querySelectorAll<HTMLElement>('.level-stars')).flatMap((s) =>
        buttons
          .filter((b) => hit(s.getBoundingClientRect(), b.getBoundingClientRect()))
          .map((b) => `${s.dataset.ui ?? '?'} covers ${b.dataset.ui ?? '?'}`),
      );
    });
    for (const c of covered) report(c);
  }
  // ACC-03: text is not cut.
  const cut = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '#ui button, .modal-title, .modal-text, .settings-label, .hud-booster-label, .tut-text, .complete-coins, .hud-coins',
      ),
    )
      .filter((e) => e.offsetParent !== null)
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      .map((e) => `${e.dataset.ui ?? e.className}: "${(e.textContent ?? '').slice(0, 30)}"`),
  );
  for (const c of cut) report(`text cut: ${c}`);
  // ACC-02: text at least 14 px.
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#ui *'))
      .filter(
        (e) =>
          e.offsetParent !== null &&
          [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''),
      )
      .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 14)
      .map((e) => `${e.className}: "${(e.textContent ?? '').slice(0, 20)}"`),
  );
  for (const s of small) report(`text smaller than 14 px: ${s}`);
}

async function openAt(
  browser: Browser,
  w: number,
  h: number,
  lang: string,
  extra = '',
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    hasTouch: isTouch(w),
    isMobile: isTouch(w),
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await openGame(page, `?lang=${lang}${extra}`);
  return { context, page };
}

for (const [w, h] of SIZES) {
  for (const lang of LANGS) {
    test(`QA-04 level ${w}×${h} ${lang}`, async ({ browser, browserName }) => {
      test.skip(browserName !== 'chromium', 'layout runs in Chromium');
      test.setTimeout(180_000);
      const { context, page } = await openAt(browser, w, h, lang);
      const problems: string[] = [];

      // UI-13: the desktop active area is at most 2:1, centred and touching the short side.
      if (!isTouch(w)) {
        const box = await page.locator('#stage').boundingBox();
        if (box) {
          const ratio = box.width / box.height;
          if (ratio > 2.01 || ratio < 0.49) problems.push(`active area ratio ${ratio.toFixed(2)}`);
          if (Math.abs(box.x * 2 + box.width - w) > 2) problems.push('active area not centred');
        }
      }

      // Level 1, 3×7, with the tutorial hand (TUT-01).
      await check(page, 'level-3x7', w, h, lang, problems);

      // The biggest field, 5×8 (UI-10: a phone cell is at least 44 px).
      await page.evaluate((lvl) => window.__game?.openLevel(lvl as never), BIG);
      await page.evaluate(() => window.__game?.stopTime());
      await check(page, 'level-5x8', w, h, lang, problems);
      const cell = (await state(page)).field?.cell ?? 0;
      if (isPhone(w, h) && cell < 44) problems.push(`5x8: cell ${cell} px < 44 px`);

      await page.keyboard.press('Escape');
      await check(page, 'pause', w, h, lang, problems);
      await page.locator('[data-ui="pause-settings"]').click();
      await check(page, 'settings', w, h, lang, problems);
      await page.locator('[data-ui="settings-close"]').click();
      await page.locator('[data-ui="pause-continue"]').click();

      // "Level complete" (UI-07).
      await page.evaluate((lvl) => window.__game?.openLevel(lvl as never), QUICK);
      await page.evaluate(() => {
        window.__game?.stopTime();
        window.__game?.act([
          { type: 'grab', ref: { at: 'cell', col: 3, row: 2 } },
          { type: 'drop', ref: { at: 'cell', col: 4, row: 2 } },
        ]);
        window.__game?.tick(1);
      });
      await expect(page.locator('[data-ui="level-complete"]')).toBeVisible();
      await page.waitForTimeout(1000); // the stars pop in
      await check(page, 'complete', w, h, lang, problems);

      // "The river took too much" (GD-51).
      await page.evaluate(
        (lvl) => window.__game?.openLevel({ ...(lvl as object), waitFirstMerge: false } as never),
        QUICK,
      );
      await page.evaluate(() => window.__game?.tick(60));
      await expect(page.locator('[data-ui="level-lost"]')).toBeVisible();
      await check(page, 'lost', w, h, lang, problems);

      await context.close();
      expect(problems).toEqual([]);
    });

    test(`QA-04 village ${w}×${h} ${lang}`, async ({ browser, browserName }) => {
      test.skip(browserName !== 'chromium', 'layout runs in Chromium');
      test.setTimeout(180_000);
      const { context, page } = await openAt(browser, w, h, lang, '&iap=1');
      const problems: string[] = [];

      // The village (VIL-01, UI-03). Passed levels show their stars under the circles, next to
      // the buildings.
      await page.evaluate(() => {
        for (let n = 1; n <= 8; n++) window.__game?.win(`c1-0${n}`, 1 + (n % 3));
        window.__game?.village();
      });
      await check(page, 'village', w, h, lang, problems);
      // A building window (VIL-02), the daily gift, the encyclopedia (GD-23), the settings.
      // Five-digit coins: the widest header (UI-03).
      await page.evaluate(() => window.__game?.grant(25_000));
      await page.locator('[data-ui="building-pier"]').click();
      await page.locator('[data-ui="building-restore"]').click();
      await page.locator('[data-ui="building-close"]').click();
      await page.locator('[data-ui="building-flowerbed"]').click();
      await check(page, 'building', w, h, lang, problems);
      await page.locator('[data-ui="building-restore"]').click();
      await page.locator('[data-ui="building-close"]').click();
      await page.evaluate(() => window.__game?.village());
      await expect(page.locator('[data-ui="daily-gift"]')).toBeVisible();
      await expect(page.locator('[data-ui="daily-text"]')).not.toBeEmpty();
      await check(page, 'daily-gift', w, h, lang, problems);
      await page.locator('[data-ui="daily-take"]').click();
      await page.locator('[data-ui="village-encyclopedia"]').click();
      await check(page, 'encyclopedia', w, h, lang, problems);
      await page.locator('[data-ui="encyclopedia-close"]').click();
      await page.locator('[data-ui="village-settings"]').click();
      await check(page, 'village-settings', w, h, lang, problems);
      await page.locator('[data-ui="settings-close"]').click();

      // Stage 4: the village with the daily river and the shop, the leaderboard (sign-in
      // offered), the shop window.
      await expect(page.locator('[data-ui="village-daily"]')).toBeVisible();
      await expect(page.locator('[data-ui="village-shop"]')).toBeVisible();
      await check(page, 'village-stage4', w, h, lang, problems);
      await page.locator('[data-ui="village-rating"]').click();
      await expect(page.locator('[data-ui="rating-note"]')).not.toHaveText(/…/);
      await check(page, 'rating', w, h, lang, problems);
      await page.locator('[data-ui="rating-close"]').click();
      await page.locator('[data-ui="village-shop"]').click();
      await expect(page.locator('[data-ui="shop-item-no_ads"]')).toBeVisible();
      await check(page, 'shop', w, h, lang, problems);
      await page.locator('[data-ui="shop-close"]').click();

      // "New" cards (TUT-02): a chain and a booster with its gift.
      await page.evaluate(() => window.__game?.openLevel('c1-02'));
      await expect(page.locator('[data-ui="intro"]')).toBeVisible();
      await check(page, 'intro', w, h, lang, problems);
      await page.evaluate(() => window.__game?.openLevel('c1-09'));
      await expect(page.locator('[data-ui="intro"] .intro-icon')).toBeVisible();
      await check(page, 'intro-booster', w, h, lang, problems);

      await context.close();
      expect(problems).toEqual([]);
    });
  }
}
