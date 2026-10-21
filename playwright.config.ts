import { defineConfig, devices } from '@playwright/test';
import { useBrowsersPath } from './scripts/browsers-path';

// Browsers come from ~/.cache/ms-playwright (`npm run e2e:install`); workers inherit this variable.
useBrowsersPath();

const PORT = 4183;

// QA-03: the smoke tests (@smoke) run in Chromium, Firefox and WebKit, the rest in Chromium and
// mobile WebKit, against the e2e build: the release build plus the DEV-02 hooks.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  // Every worker renders WebGL in software (SwiftShader); more at once starve the CPU.
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  // Real-time tests (a bot plays a level) need ~20 s; a busy machine with software WebGL more.
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  // PERF-02 is a timing: it runs alone, after everything else (perf project below).
  testIgnore: /perf\.spec\.ts/,
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
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@smoke/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@smoke/ },
    // QA-03: everything but the smoke also runs in mobile WebKit emulation.
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, grepInvert: /@smoke|QA-04/ },
    {
      name: 'perf',
      testIgnore: [],
      testMatch: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=swiftshader'] } },
      dependencies: ['chromium', 'firefox', 'webkit', 'mobile-webkit'],
    },
  ],
  webServer: {
    command: `npm run build:e2e && npx vite preview --mode e2e --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
