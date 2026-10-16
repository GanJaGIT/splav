import { expect, test, type Page } from '@playwright/test';
import { openGame, presetSave, skipIntro, state } from './helpers';

/** QA-03 (saves), YG-07…YG-09, UI-02, VIL-01…VIL-04, TUT-02, GD-23: Chromium and mobile WebKit. */

async function winCurrentLevel(page: Page): Promise<void> {
  await skipIntro(page);
  await page.evaluate(() => {
    window.__game?.bot('deft');
    window.__game?.setSpeed(20);
  });
  await expect(page.locator('[data-ui="level-complete"]')).toBeVisible({ timeout: 40_000 });
}

test('YG-08, UI-02: a passed level and its coins survive a reload; the next launch opens the village', async ({
  page,
}) => {
  await openGame(page, '?lang=ru');
  expect((await state(page)).screen).toBe('level');
  await winCurrentLevel(page);
  const saved = await page.evaluate(() => window.__game?.save());
  expect(saved?.levels['c1-01']?.stars).toBeGreaterThan(0);
  expect(saved?.coins).toBeGreaterThan(0);
  const calls = await page.evaluate(() => window.__game?.calls() ?? []);
  expect(calls).toContain('writeSave:flush'); // YG-07: the cloud copy at once

  await page.reload();
  await page.waitForFunction(() => window.__game?.isReady() === true);
  expect((await state(page)).screen).toBe('village');
  await expect(page.locator('[data-ui="level-c1-01"]')).toHaveClass(/done/);
  await expect(page.locator('[data-ui="level-c1-02"]')).toHaveClass(/next/);
  await expect(page.locator('[data-ui="village-coins"]')).toHaveText(String(saved?.coins));
  // PERF-03: Phaser sleeps in the village and wakes for the level.
  await page.waitForFunction(() => window.__game?.rendering() === false);
  await page.locator('[data-ui="village-play"]').click();
  expect((await state(page)).level).toBe('c1-02');
  await page.waitForFunction(() => window.__game?.rendering() === true);
});

test('VIL-02, VIL-04: a restored building stays restored after a reload', async ({ page }) => {
  await presetSave(page, { levels: { 'c1-01': { stars: 3 } }, coins: 1000 });
  await openGame(page);
  expect((await state(page)).screen).toBe('village');
  await page.locator('[data-ui="building-shed"]').click();
  await expect(page.locator('[data-ui="building"]')).toBeVisible();
  await page.locator('[data-ui="building-restore"]').click();
  await expect(page.locator('[data-ui="building-shed"]')).toHaveClass(/restored/);
  await page.locator('[data-ui="building-close"]').click();
  await page.reload();
  await page.waitForFunction(() => window.__game?.isReady() === true);
  await expect(page.locator('[data-ui="building-shed"]')).toHaveClass(/restored/);
  const save = await page.evaluate(() => window.__game?.save());
  expect(save?.buildings).toEqual(['shed']);
  expect(save?.coins).toBe(1000 - 650);
});

test('VIL-02: not enough coins — the restore button waits', async ({ page }) => {
  await presetSave(page, { levels: { 'c1-01': { stars: 3 } }, coins: 10 });
  await openGame(page);
  await page.locator('[data-ui="building-mill"]').click();
  await expect(page.locator('[data-ui="building-restore"]')).toBeDisabled();
  await expect(page.locator('.building-need')).toBeVisible();
});

test('VIL-02: chapter 2 opens with the mill', async ({ page }) => {
  const levels: Record<string, { stars: number }> = {};
  for (let n = 1; n <= 12; n++) levels[`c1-${String(n).padStart(2, '0')}`] = { stars: 2 };
  await presetSave(page, { levels, coins: 2000 });
  await openGame(page, '?lang=en');
  await expect(page.locator('[data-ui="village-message"]')).toHaveText(
    'Restore the mill to open chapter 2',
  );
  await expect(page.locator('[data-ui="village-play"]')).toBeDisabled();
  await page.locator('[data-ui="building-mill"]').click();
  await page.locator('[data-ui="building-restore"]').click();
  await page.locator('[data-ui="building-close"]').click();
  await expect(page.locator('[data-ui="village-play"]')).toBeEnabled();
  await expect(page.locator('[data-ui="level-c2-01"]')).toHaveClass(/next/);
  await page.locator('[data-ui="village-play"]').click();
  expect((await state(page)).level).toBe('c2-01');
});

test('TUT-02: a "New" card appears once and the level waits for it', async ({ page }) => {
  await openGame(page, '?level=c1-02');
  await expect(page.locator('[data-ui="intro"]')).toBeVisible();
  const tick = (await state(page)).tick;
  await page.waitForTimeout(400);
  expect((await state(page)).tick).toBe(tick);
  await page.locator('[data-ui="intro-ok"]').click();
  await page.waitForFunction((t) => (window.__game?.state().tick ?? 0) > t, tick);
  await page.keyboard.press('Escape');
  await page.locator('[data-ui="pause-restart"]').click();
  await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
  expect((await state(page)).window).toBeNull();
});

test('GD-80: a level that introduces a booster gives it', async ({ page }) => {
  const levels: Record<string, { stars: number }> = {};
  for (let n = 1; n <= 8; n++) levels[`c1-${String(n).padStart(2, '0')}`] = { stars: 2 };
  await presetSave(page, { levels });
  await openGame(page);
  await page.locator('[data-ui="village-play"]').click();
  await expect(page.locator('[data-ui="intro"]')).toBeVisible();
  await expect(page.locator('.booster-gift')).toBeVisible();
  await page.locator('[data-ui="intro-ok"]').click();
  await expect(page.locator('[data-ui="booster-dam"]')).toHaveAttribute('data-state', 'ready');
  expect((await page.evaluate(() => window.__game?.save()))?.boosters.dam).toBe(2);
  // SIM-33: a double tap inside one tick uses one dam, a held key does not repeat.
  await page.evaluate(() => window.__game?.stopTime());
  await page.locator('[data-ui="booster-dam"]').click();
  await page.locator('[data-ui="booster-dam"]').click();
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', repeat: true })),
  );
  await page.evaluate(() => window.__game?.tick(1));
  expect((await state(page)).boostersUsed).toBe(1);
  expect((await page.evaluate(() => window.__game?.save()))?.boosters.dam).toBe(1);
  // The last dam: a quick double tap does not start a video for the next one.
  await page.locator('[data-ui="booster-dam"]').click();
  await page.locator('[data-ui="booster-dam"]').click();
  await expect(page.locator('#dev-overlay')).toHaveCount(0);
  await page.evaluate(() => window.__game?.tick(1));
  expect((await state(page)).boostersUsed).toBe(2);
  expect((await page.evaluate(() => window.__game?.save()))?.boosters.dam).toBe(0);
});

test('GD-63, YG-08: half the coins of a lost attempt are saved at once', async ({ page }) => {
  await openGame(page);
  const before = (await page.evaluate(() => window.__game?.save()))?.coins ?? 0;
  await page.evaluate(() => {
    window.__game?.openLevel({
      id: 'c1-92',
      chapter: 1,
      lanes: 3,
      rows: 7,
      stepTicks: 2,
      seed: 5,
      waitFirstMerge: false,
      spawn: { perStep: [3, 3], weights: [{ chain: 'garden', level: 1, w: 1 }] },
      initial: [
        { col: 0, row: 1, chain: 'wood', level: 1 },
        { col: 0, row: 2, chain: 'wood', level: 1 },
      ],
      script: [],
      piers: [{ col: 4, row: 1, resident: 'fisher', orders: [{ chain: 'wood', level: 6 }] }],
      obstacles: [],
      backwater: 1,
      lives: 3,
      intro: null,
      gift: null,
    });
    window.__game?.stopTime();
    window.__game?.act([
      { type: 'grab', ref: { at: 'cell', col: 0, row: 1 } },
      { type: 'drop', ref: { at: 'cell', col: 0, row: 2 } },
    ]);
    window.__game?.tick(80);
  });
  const st = await state(page);
  expect(st.status).toBe('lost');
  expect(st.coins).toBeGreaterThan(1);
  const half = Math.floor(st.coins / 2);
  // Paid and saved before the window opens: closing the game from it keeps them.
  expect((await page.evaluate(() => window.__game?.save()))?.coins).toBe(before + half);
  await page.reload();
  await page.waitForFunction(() => window.__game?.isReady() === true);
  expect((await page.evaluate(() => window.__game?.save()))?.coins).toBe(before + half);
});

test('GD-23: the encyclopedia shows found items and empty places', async ({ page }) => {
  await openGame(page);
  await winCurrentLevel(page);
  await page.locator('[data-ui="complete-village"]').click();
  await page.locator('[data-ui="village-encyclopedia"]').click();
  await expect(page.locator('[data-ui="enc-wood-1"]')).toHaveClass(/known/);
  await expect(page.locator('[data-ui="enc-stone-1"]')).not.toHaveClass(/known/);
  await page.locator('[data-ui="enc-wood-1"]').click();
  await expect(page.locator('[data-ui="encyclopedia-detail"]')).not.toBeEmpty();
});

test('CALM-01, UI-06: settings are saved', async ({ page }) => {
  await presetSave(page, { levels: { 'c1-01': { stars: 3 } } });
  await openGame(page, '?lang=ru');
  await page.locator('[data-ui="village-settings"]').click();
  await page.locator('[data-ui="settings-calm"]').click();
  await page.locator('[data-ui="settings-lang-en"]').click();
  await page.reload();
  await page.waitForFunction(() => window.__game?.isReady() === true);
  await expect(page).toHaveTitle('Merge River');
  const save = await page.evaluate(() => window.__game?.save());
  expect(save?.settings).toMatchObject({ calm: true, lang: 'en' });
  await page.locator('[data-ui="village-play"]').click();
  expect((await page.evaluate(() => window.__game?.sim()))?.cfg.stepTicks).toBe(30); // 20 × 1.5
});
