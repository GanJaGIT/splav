import { expect, test, type Page } from '@playwright/test';
import { openGame, passed, presetSave, quickWin, skipIntro, state } from './helpers';

/**
 * Stage 5, the moderator check: the river never flows while the player is away, also when they
 * left during an ad (YG-04, YG-05); fullscreen on the first touch is not "leaving" (UI-15,
 * YG-20); a window taller than a short screen scrolls with the finger (INP-06, п. 1.8).
 */

const blur = (page: Page): Promise<void> =>
  page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
  });

async function staysStill(page: Page): Promise<void> {
  const tick = (await state(page)).tick;
  await page.waitForTimeout(500);
  expect((await state(page)).tick).toBe(tick);
}

test('YG-04: the player leaves during a video in a level — then the level waits on Pause', async ({
  page,
}) => {
  await presetSave(page, { levels: passed(9) });
  await openGame(page, '?level=c1-10');
  await skipIntro(page);
  await page.locator('[data-ui="booster-dam"]').click();
  await expect(page.locator('#dev-overlay[data-kind="rewarded"]')).toBeVisible();
  await blur(page);
  await page.locator('#dev-overlay [data-action="watch"]').click();
  const st = await state(page);
  expect([st.window, st.playing]).toEqual(['pause', false]);
  await staysStill(page);
});

test('YG-04: the player leaves during a fullscreen ad — the next level waits on Pause', async ({
  page,
}) => {
  await presetSave(page, { levels: passed(8) });
  await openGame(page);
  await quickWin(page, 'c1-09');
  await page.locator('[data-ui="complete-next"]').click();
  await expect(page.locator('#dev-overlay[data-kind="interstitial"]')).toBeVisible();
  await blur(page);
  // The stand-in ad closes itself after a second.
  await page.waitForFunction(() => window.__game?.state().level === 'c1-10', null, {
    timeout: 15_000,
    polling: 100,
  });
  const st = await state(page);
  expect([st.window, st.playing]).toEqual(['pause', false]);
  await staysStill(page);
});

test('4.4: no fullscreen ad right after a watched "Double the coins"', async ({ page }) => {
  await presetSave(page, { levels: passed(8) });
  await openGame(page);
  await quickWin(page, 'c1-09');
  await page.locator('[data-ui="complete-double"]').click();
  await page.locator('#dev-overlay [data-action="watch"]').click();
  await page.locator('[data-ui="complete-next"]').click();
  await page.waitForFunction(() => window.__game?.state().level === 'c1-10');
  const calls = await page.evaluate(() => window.__game?.calls() ?? []);
  expect(calls.filter((c) => c === 'showInterstitial')).toHaveLength(0);
});

test('UI-15, YG-20: fullscreen on the first touch does not pause the level, a later resize does', async ({
  page,
}) => {
  await openGame(page, '?level=c1-07');
  await skipIntro(page);
  const vp = page.viewportSize() ?? { width: 800, height: 600 };
  // The first touch: the window grows (the browser bars go away in fullscreen).
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await page.setViewportSize({ width: vp.width, height: vp.height + 60 });
  await page.waitForTimeout(300);
  expect((await state(page)).window).toBeNull();
  // Later the player resizes the window: the level pauses (UI-15).
  await page.waitForTimeout(1600);
  await page.setViewportSize({ width: vp.width - 40, height: vp.height + 60 });
  await expect.poll(async () => (await state(page)).window).toBe('pause');
});

test('INP-06, п. 1.8: on a short screen a tall window scrolls with the finger, the page does not', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await presetSave(page, { levels: passed(3) });
  await openGame(page);
  await page.locator('[data-ui="village-encyclopedia"]').click();
  const r = await page.evaluate(() => {
    const send = (el: Element): boolean => {
      const e = new Event('touchmove', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const modal = document.querySelector('.modal');
    const stage = document.getElementById('stage');
    if (!modal || !stage) return null;
    return {
      tall: modal.scrollHeight > modal.clientHeight,
      prevented: { inWindow: send(modal.firstElementChild ?? modal), outside: send(stage) },
    };
  });
  expect(r).toEqual({ tall: true, prevented: { inWindow: false, outside: true } });
});
