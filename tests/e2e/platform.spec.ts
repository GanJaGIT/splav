import { expect, test, type Page } from '@playwright/test';
import { openGame, passed, presetSave, quickWin, state } from './helpers';

/**
 * Stage 4: ads (YG-10…YG-12), the platform's pause (YG-04), sign-in and account change (YG-09),
 * the daily river (DAY-01…DAY-04), the leaderboard (YG-15) and the shop (YG-14) on LocalPlatform.
 * Chromium and mobile WebKit.
 */

const calls = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window.__game?.calls() ?? []).filter((c) => !c.startsWith('writeSave')));
const count = async (page: Page, name: string): Promise<number> =>
  (await calls(page)).filter((c) => c === name).length;
const save = (page: Page) => page.evaluate(() => window.__game?.save());

/** Watches a rewarded video to the end (or closes it). */
async function rewarded(page: Page, watch = true): Promise<void> {
  await page.locator(`#dev-overlay [data-action="${watch ? 'watch' : 'close'}"]`).click();
}

test('YG-10: a fullscreen ad after "To the village" from c1-06 on, at most once in 180 s', async ({
  page,
}) => {
  await presetSave(page, { levels: passed(6) });
  await openGame(page);
  await quickWin(page);
  await page.locator('[data-ui="complete-village"]').click();
  // The stand-in ad closes itself after a second; the platform call is what counts.
  await page.waitForFunction(() => window.__game?.calls().includes('showInterstitial'));
  await expect(page.locator('[data-ui="village"]')).toBeVisible({ timeout: 15_000 });
  expect(await count(page, 'showInterstitial')).toBe(1);

  // Within 180 s: no second ad.
  await quickWin(page);
  await page.locator('[data-ui="complete-village"]').click();
  await expect(page.locator('[data-ui="village"]')).toBeVisible();
  expect(await count(page, 'showInterstitial')).toBe(1);

  // 181 s later by the server clock: the next one.
  await page.evaluate(() => window.__game?.advanceTime(181_000));
  await quickWin(page);
  await page.locator('[data-ui="complete-village"]').click();
  await expect(page.locator('[data-ui="village"]')).toBeVisible({ timeout: 15_000 });
  expect(await count(page, 'showInterstitial')).toBe(2);
});

test('YG-10: no fullscreen ad before c1-06 is passed, none on «Replay»', async ({ page }) => {
  await presetSave(page, { levels: passed(5) });
  await openGame(page);
  await quickWin(page);
  await page.locator('[data-ui="complete-replay"]').click();
  await quickWin(page);
  await page.locator('[data-ui="complete-village"]').click();
  await expect(page.locator('[data-ui="village"]')).toBeVisible();
  expect(await count(page, 'showInterstitial')).toBe(0);
});

test('YG-10, YG-14: no fullscreen ad and no banner after "No ads"', async ({ page }) => {
  await presetSave(page, { levels: passed(6), noAds: true });
  await openGame(page);
  expect(await page.evaluate(() => window.__game?.banner())).toBe(false);
  await quickWin(page);
  await page.locator('[data-ui="complete-village"]').click();
  await expect(page.locator('[data-ui="village"]')).toBeVisible();
  expect(await count(page, 'showInterstitial')).toBe(0);
  expect(await count(page, 'showSticky')).toBe(0);
});

test('YG-11, UI-07: "Double the coins" pays the coins again only for a watched video', async ({
  page,
}) => {
  await openGame(page);
  await quickWin(page);
  const before = (await save(page))?.coins ?? 0;
  const shown = await page.locator('[data-ui="complete-coins"]').innerText();
  const earned = Number(/\d+/.exec(shown)?.[0] ?? 0);
  expect(earned).toBeGreaterThan(0);
  // Closed early: no reward. Silent and paused while the video shows (YG-05, 4.7).
  await page.locator('[data-ui="complete-double"]').click();
  await expect(page.locator('#dev-overlay[data-kind="rewarded"]')).toBeVisible();
  expect((await state(page)).silenced).toContain('ad');
  await rewarded(page, false);
  expect((await save(page))?.coins).toBe(before);
  await page.locator('[data-ui="complete-double"]').click();
  await rewarded(page, true);
  await expect(page.locator('[data-ui="complete-double"]')).toHaveCount(0);
  expect((await save(page))?.coins).toBe(before + earned);
  await expect(page.locator('[data-ui="complete-coins"]')).toContainText(String(earned * 2));
});

test('YG-12: the sticky banner shows in the village and hides in a level', async ({ page }) => {
  await presetSave(page, { levels: passed(3) });
  await openGame(page);
  expect(await page.evaluate(() => window.__game?.banner())).toBe(true);
  await page.locator('[data-ui="village-play"]').click();
  expect(await page.evaluate(() => window.__game?.banner())).toBe(false);
  await page.evaluate(() => window.__game?.village());
  expect(await page.evaluate(() => window.__game?.banner())).toBe(true);
});

test('YG-04: the platform pauses the level; after resume it waits on Pause, GameplayAPI stopped', async ({
  page,
}) => {
  await openGame(page, '?level=c1-04');
  await page.locator('[data-ui="intro-ok"]').click();
  await page.waitForFunction(() => (window.__game?.state().tick ?? 0) > 3);
  await page.evaluate(() => window.__game?.sdkPause());
  let st = await state(page);
  expect([st.window, st.playing]).toEqual(['pause', false]);
  expect(st.silenced).toContain('sdk_pause');
  const tickAt = st.tick;
  await page.evaluate(() => window.__game?.sdkResume());
  await page.waitForTimeout(300);
  st = await state(page);
  expect([st.window, st.tick, st.silenced]).toEqual(['pause', tickAt, []]);
  // The platform starts GameplayAPI by itself on resume; the game sends stop() again.
  const after = await calls(page);
  expect(after[after.length - 1]).toBe('gameplayStop');
  await page.locator('[data-ui="pause-continue"]').click();
  await page.waitForFunction(() => window.__game?.state().playing === true);
});

test('YG-09: sign-in only by the button with its benefit; an account change reloads the save', async ({
  page,
}) => {
  await presetSave(page, { levels: passed(3), coins: 10 });
  await openGame(page);
  await page.locator('[data-ui="village-rating"]').click();
  await expect(page.locator('.rating-auth')).toBeVisible();
  await page.locator('[data-ui="rating-login"]').click();
  await expect(page.locator('[data-ui="rating-login"]')).toHaveCount(0);
  expect(await count(page, 'openAuth')).toBe(1);
  await page.locator('[data-ui="rating-close"]').click();
  // The player picked the account's progress in the platform dialog.
  await page.evaluate(() =>
    window.__game?.account({ levels: { 'c1-01': { stars: 3 } }, coins: 777 }),
  );
  await expect(page.locator('[data-ui="village-coins"]')).toHaveText('777');
  expect((await save(page))?.coins).toBe(777);
});

test('DAY-01…DAY-04, YG-15: the daily river — best of the day to the leaderboard, a booster on the first win', async ({
  page,
}) => {
  await presetSave(page, { levels: passed(9), buildings: ['pier'] });
  await openGame(page, '?auth=1');
  await page.locator('[data-ui="village-daily"]').click();
  await page.waitForFunction(() => window.__game?.state().level?.startsWith('daily-'));
  const id = (await state(page)).level;
  await page.evaluate(() => {
    window.__game?.bot('deft');
    window.__game?.setSpeed(20);
  });
  await expect(page.locator('[data-ui="level-complete"]')).toBeVisible({ timeout: 45_000 });
  const s1 = await save(page);
  expect(s1?.daily.best).toBeGreaterThan(0);
  expect(s1?.daily.giftTaken).toBe(true);
  await expect(page.locator('.booster-gift')).toBeVisible();
  expect(await count(page, 'setScore:daily')).toBe(1);
  // The same level for the same day; the window's leaderboard shows today's result.
  await page.locator('[data-ui="river-rating"]').click();
  await expect(page.locator('[data-ui="rating-tab-daily"]')).toHaveClass(/on/);
  await expect(page.locator('.rating-row.me')).toContainText(String(s1?.daily.best));
  await page.locator('[data-ui="rating-close"]').click();
  await page.locator('[data-ui="complete-village"]').click();
  await expect(page.locator('[data-ui="village-daily"]')).toContainText(String(s1?.daily.best));
  await page.locator('[data-ui="village-daily"]').click();
  await page.waitForFunction(() => window.__game?.state().screen === 'level');
  expect((await state(page)).level).toBe(id);
});

test('YG-14: the shop — "No ads" removes the banner and gives boosters; a pack is consumed after it is granted', async ({
  page,
}) => {
  await presetSave(page, { levels: passed(3) });
  await openGame(page, '?iap=1');
  expect(await page.evaluate(() => window.__game?.banner())).toBe(true);
  await page.locator('[data-ui="village-shop"]').click();
  await expect(page.locator('[data-ui="shop-item-no_ads"]')).toBeVisible();
  // A cancelled purchase changes nothing and says so.
  await page.locator('[data-ui="shop-buy-boosters_10"]').click();
  await page.locator('#dev-overlay [data-action="cancel"]').click();
  await expect(page.locator('[data-ui="toast"]')).toBeVisible();
  expect((await save(page))?.boosters).toEqual({ dam: 0, hook: 0, joker: 0, net: 0 });

  await page.locator('[data-ui="shop-buy-no_ads"]').click();
  await page.locator('#dev-overlay [data-action="buy"]').click();
  await expect(page.locator('[data-ui="shop-buy-no_ads"]')).toBeDisabled();
  expect((await save(page))?.noAds).toBe(true);
  expect(await page.evaluate(() => window.__game?.banner())).toBe(false);
  expect((await save(page))?.boosters).toEqual({ dam: 2, hook: 1, joker: 1, net: 1 });

  await page.locator('[data-ui="shop-buy-boosters_10"]').click();
  await page.locator('#dev-overlay [data-action="buy"]').click();
  await page.waitForFunction(() => window.__game?.save().boosters.dam === 5);
  const c = await calls(page);
  expect(c.indexOf('consume')).toBeGreaterThan(c.indexOf('buy:boosters_10'));
  // No fullscreen ads with "No ads".
  await page.locator('[data-ui="shop-close"]').click();
});

test('YG-14, 1.13.1: a purchase not applied before is granted and consumed at launch', async ({
  page,
}) => {
  await presetSave(page, { levels: passed(3) });
  await page.addInitScript(() => {
    localStorage.setItem(
      'splav.dev.purchases',
      JSON.stringify([{ productID: 'boosters_10', purchaseToken: 'lost-1' }]),
    );
  });
  await openGame(page, '?iap=1');
  await page.waitForFunction(() => window.__game?.save().boosters.dam === 3);
  expect(await count(page, 'consume')).toBe(1);
});

test('YG-16: the review is asked once, after the first pass of c1-08', async ({ page }) => {
  await presetSave(page, { levels: passed(7) });
  await openGame(page, '?auth=1');
  await quickWin(page, 'c1-08');
  await page.waitForFunction(() => window.__game?.calls().includes('review'));
  expect((await save(page))?.reviewAsked).toBe(true);
  await page.locator('[data-ui="complete-replay"]').click();
  await quickWin(page, 'c1-08');
  await page.waitForTimeout(2000);
  expect(await count(page, 'review')).toBe(1);
});

test('YG-17: after c1-12 the window offers the desktop shortcut', async ({ page }) => {
  await presetSave(page, { levels: passed(11) });
  await openGame(page);
  await quickWin(page, 'c1-12');
  await page.locator('[data-ui="complete-shortcut"]').click();
  await page.waitForFunction(() => window.__game?.calls().includes('shortcut'));
  await expect(page.locator('[data-ui="complete-shortcut"]')).toHaveCount(0);
});

test('YG-20: the first touch asks the platform for fullscreen, once', async ({ page }) => {
  await presetSave(page, { levels: passed(3) });
  await openGame(page);
  await page.locator('[data-ui="village-encyclopedia"]').click();
  await page.locator('[data-ui="encyclopedia-close"]').click();
  expect(await count(page, 'requestFullscreen')).toBe(1);
});
