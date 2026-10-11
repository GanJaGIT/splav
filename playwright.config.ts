import { defineConfig, devices } from '@playwright/test';
import { useBrowsersPath } from './scripts/browsers-path';

// Browsers come from ~/.cache/ms-playwright (`npm run e2e:install`); workers inherit this variable.
useBrowsersPath();

const PORT = 4183;

// QA-03: the smoke tests run in Chromium, Firefox and WebKit against the e2e build, which is the
// release build plus the DEV-02 hooks.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  // Every worker renders WebGL in software (SwiftShader); more at once starve the CPU.
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless Chromium's default software GL prints "GPU stall due to ReadPixels" while
        // compositing the canvas; ANGLE on SwiftShader keeps the console clean for the strict smoke.
        launchOptions: { args: ['--use-angle=swiftshader'] },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run build:e2e && npx vite preview --mode e2e --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
