/**
 * QA-04: level screens × sizes × languages. Elements stay on screen, buttons do not overlap and
 * are at least 44 px on touch screens, text is not cut and not smaller than 14 px, a phone cell is
 * at least 44 px on the biggest field, the desktop active area is at most 2:1.
 * Screenshots go to test-results/layout/ for review.
 */

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
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
  await page.screenshot({ path: `${OUT}/${screen}-${w}x${h}-${lang}.png` });
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

for (const [w, h] of SIZES) {
  for (const lang of LANGS) {
    test(`QA-04 ${w}×${h} ${lang}`, async ({ browser, browserName }) => {
      test.skip(browserName !== 'chromium', 'layout runs in Chromium');
      test.setTimeout(90_000);
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: isTouch(w),
        isMobile: isTouch(w),
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const problems: string[] = [];
      await openGame(page, `?lang=${lang}`);

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
  }
}
