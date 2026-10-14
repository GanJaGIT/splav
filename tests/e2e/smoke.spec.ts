import { expect, test, type Page } from '@playwright/test';

/** QA-03 smoke: runs in Chromium, Firefox and WebKit against the e2e build. */

interface Hooks {
  __game?: { platform: { count(name: string): number } };
}

const readyCount = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as Hooks).__game?.platform.count('gameReady') ?? 0);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    // Clean console (п. 1.14, recommendation 6.x): warnings fail the smoke test too.
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test('@smoke loads without console errors and calls ready() exactly once (YG-02)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(
    () => ((window as unknown as Hooks).__game?.platform.count('gameReady') ?? 0) > 0,
  );
  await expect(page.locator('#loading')).toHaveCount(0);
  const canvas = page.locator('#canvas-host canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);
  await expect(page.locator('.hud-booster')).toHaveCount(4);

  // Nothing calls ready() again later.
  await page.waitForTimeout(1000);
  expect(await readyCount(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('@smoke INP-06: no context menu and no text selection', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as Hooks).__game !== undefined);
  const prevented = await page.evaluate(() => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector('#canvas-host canvas')?.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
  const style = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return {
      userSelect: s.userSelect || s.getPropertyValue('-webkit-user-select'),
      overflow: s.overflow,
    };
  });
  expect(style.userSelect).toBe('none');
  expect(style.overflow).toBe('hidden');
});

test('@smoke YG-06: ?lang picks the language', async ({ page }) => {
  await page.goto('/?lang=ru');
  await expect(page).toHaveTitle('Сплав');
  await page.goto('/?lang=en');
  await expect(page).toHaveTitle('Merge River');
  await page.goto('/?lang=tr');
  await expect(page).toHaveTitle('Merge River');
});
