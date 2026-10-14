import { expect, test } from '@playwright/test';
import {
  mouseDrag,
  mouseTap,
  openGame,
  playThrough,
  point,
  sim,
  state,
  tick,
  touchDrag,
} from './helpers';

/** QA-03: Chromium and mobile WebKit emulation. */

test('UI-02, QA-03: level 1 is played with mouse drags to "Level complete"', async ({ page }) => {
  await openGame(page, '?lang=ru');
  expect((await state(page)).level).toBe('c1-01');
  expect(await playThrough(page, mouseDrag)).toBe('won');
  await expect(page.locator('[data-ui="level-complete"]')).toBeVisible();
  await expect(page.locator('[data-ui="stars"] .star.on')).toHaveCount(3);
  await expect(page.locator('[data-ui="complete-next"]')).toBeVisible();
});

test('INP-01: level 1 is played with a finger', async ({ page }) => {
  await openGame(page, '?lang=en');
  expect(await playThrough(page, touchDrag)).toBe('won');
  await expect(page.locator('[data-ui="level-complete"]')).toBeVisible();
});

test('INP-02, GD-33: tap an item, then tap its pair — they merge; tapping it again returns it', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() => window.__game?.stopTime());
  const s = await sim(page);
  const items = s.grid
    .map((c, i) => ({ c, col: i % s.cols, row: Math.floor(i / s.cols) }))
    .filter((x) => x.c.kind === 'item');
  expect(items).toHaveLength(2);
  const [a, b] = items as [(typeof items)[0], (typeof items)[0]];
  const pa = await point(page, { at: 'cell', col: a.col, row: a.row });
  const pb = await point(page, { at: 'cell', col: b.col, row: b.row });

  await mouseTap(page, pa);
  await tick(page);
  expect((await state(page)).hand).not.toBeNull();
  await mouseTap(page, pa); // the same item again: it goes back
  await tick(page);
  expect((await state(page)).hand).toBeNull();

  await mouseTap(page, pa);
  await tick(page);
  await mouseTap(page, pb);
  await tick(page);
  const after = await sim(page);
  expect(after.stats.merges).toBe(1);
  expect(after.grid[b.row * after.cols + b.col]).toMatchObject({
    item: { chain: 'wood', level: 2 },
  });
});

test('YG-05, YG-03: blur silences the sound, stops the river and opens Pause; Continue resumes', async ({
  page,
}) => {
  await openGame(page, '?level=c1-02');
  await page.waitForFunction(() => (window.__game?.state().tick ?? 0) > 5);
  expect((await state(page)).playing).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  let st = await state(page);
  expect(st.window).toBe('pause');
  expect(st.silenced).toContain('blur');
  expect(st.audible).toBe(false);
  expect(st.playing).toBe(false);
  const tickAt = st.tick;
  await page.waitForTimeout(600);
  expect((await state(page)).tick).toBe(tickAt);

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  st = await state(page);
  expect(st.silenced).toEqual([]);
  expect(st.window).toBe('pause'); // YG-04: back, but still paused until Continue
  expect((await state(page)).tick).toBe(tickAt);

  await page.locator('[data-ui="pause-continue"]').click();
  await page.waitForFunction((t) => (window.__game?.state().tick ?? 0) > t + 2, tickAt);
  st = await state(page);
  expect(st.window).toBeNull();
  expect(st.playing).toBe(true);
  const calls = await page.evaluate(() => window.__game?.calls() ?? []);
  expect(calls.filter((c) => c === 'gameplayStop').length).toBeGreaterThanOrEqual(1);
  expect(calls.filter((c) => c === 'gameplayStart').length).toBeGreaterThanOrEqual(2);
});

test('YG-05: a hidden tab silences the sound and pauses the level', async ({ page }) => {
  await openGame(page, '?level=c1-02');
  await page.waitForFunction(() => (window.__game?.state().tick ?? 0) > 5);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  let st = await state(page);
  expect(st.window).toBe('pause');
  expect(st.silenced).toContain('hidden');
  const tickAt = st.tick;
  await page.waitForTimeout(500);
  expect((await state(page)).tick).toBe(tickAt);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  st = await state(page);
  expect(st.silenced).toEqual([]);
  expect(st.window).toBe('pause');
});

test('YG-04: a held item goes back when the game pauses', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game?.stopTime());
  const s = await sim(page);
  const i = s.grid.findIndex((c) => c.kind === 'item');
  const p = await point(page, { at: 'cell', col: i % s.cols, row: Math.floor(i / s.cols) });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await tick(page);
  expect((await state(page)).hand).not.toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await state(page)).hand).toBeNull();
  await page.mouse.up();
});

test('INP-05: Escape and KeyP open Pause with any keyboard layout', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Escape');
  expect((await state(page)).window).toBe('pause');
  await page.keyboard.press('Escape');
  expect((await state(page)).window).toBeNull();
  // Russian layout: the P key gives "з", its code stays KeyP.
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'з', code: 'KeyP', bubbles: true })),
  );
  expect((await state(page)).window).toBe('pause');
});

test('INP-06: no context menu on the field and no text selection', async ({ page }) => {
  await openGame(page);
  const prevented = await page.evaluate(() => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.getElementById('canvas-host')?.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await page.keyboard.press('Escape');
  const selectable = await page.evaluate(() => {
    const t = document.querySelector('.modal-title');
    return t
      ? getComputedStyle(t).userSelect ||
          getComputedStyle(t).getPropertyValue('-webkit-user-select')
      : '';
  });
  expect(selectable).toBe('none');
});

test('GD-51, GD-52: losing opens the window, Continue for an ad brings the level back', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() =>
    window.__game?.openLevel({
      id: 'c1-90',
      chapter: 1,
      lanes: 3,
      rows: 7,
      stepTicks: 2,
      seed: 5,
      waitFirstMerge: false,
      spawn: {
        perStep: [3, 3],
        weights: [
          { chain: 'wood', level: 1, w: 1 },
          { chain: 'garden', level: 1, w: 1 },
        ],
      },
      initial: [],
      script: [],
      piers: [{ col: 4, row: 1, resident: 'fisher', orders: [{ chain: 'wood', level: 6 }] }],
      obstacles: [],
      backwater: 1,
      lives: 3,
      intro: null,
      gift: null,
    }),
  );
  await page.evaluate(() => window.__game?.setSpeed(8));
  await expect(page.locator('[data-ui="level-lost"]')).toBeVisible({ timeout: 10_000 });
  // The clock stands while we look at the state right after Continue.
  await page.evaluate(() => window.__game?.stopTime());
  await page.locator('[data-ui="lost-continue"]').click();
  await page.locator('#dev-overlay [data-action="watch"]').click();
  await expect(page.locator('[data-ui="level-lost"]')).toHaveCount(0);
  const st = await state(page);
  expect([st.status, st.lost]).toEqual(['playing', 2]);
  // The second loss offers no continue.
  await page.evaluate(() => window.__game?.resumeTime());
  await expect(page.locator('[data-ui="level-lost"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-ui="lost-continue"]')).toHaveCount(0);
  await page.locator('[data-ui="lost-retry"]').click();
  expect((await state(page)).status).toBe('playing');
});

test('DEV-02: the bot plays c1-04 in real time to "Level complete"', async ({ page }) => {
  await openGame(page, '?level=c1-04');
  await page.evaluate(() => {
    window.__game?.bot('normal');
    window.__game?.setSpeed(10);
  });
  await expect(page.locator('[data-ui="level-complete"]')).toBeVisible({ timeout: 40_000 });
  const st = await state(page);
  expect(st.status).toBe('won');
  expect(st.coins).toBeGreaterThan(100);
  await expect(page.locator('[data-ui="complete-next"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="complete-replay"]')).toBeVisible();
});
