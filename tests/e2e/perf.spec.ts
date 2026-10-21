import { expect, test } from '@playwright/test';

/**
 * PERF-01, PERF-02: with the CPU slowed down 4 times, LoadingAPI.ready() comes within 5 seconds
 * of the start of the page load, and at most 5 MB are loaded before it.
 */

interface Hooks {
  __game?: { platform: { count(name: string): number } };
}

test('PERF-02: ready() within 5 s at CPU ×4, PERF-01: at most 5 MB before it', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/');
  await page.waitForFunction(
    () => ((window as unknown as Hooks).__game?.platform.count('gameReady') ?? 0) > 0,
    null,
    { polling: 20 },
  );
  const result = await page.evaluate(() => {
    const ms = performance.now();
    const entries = [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ] as PerformanceResourceTiming[];
    const bytes = entries.reduce((sum, e) => sum + (e.transferSize || e.encodedBodySize || 0), 0);
    return { ms, bytes };
  });
  console.log(
    `PERF-02: ready() at ${(result.ms / 1000).toFixed(2)} s (CPU ×4); PERF-01: ${(result.bytes / 1024).toFixed(0)} KB loaded`,
  );
  expect(result.ms).toBeLessThan(5000);
  expect(result.bytes).toBeLessThan(5 * 1024 * 1024);
});
