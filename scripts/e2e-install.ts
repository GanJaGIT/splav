/** npm run e2e:install — downloads the browsers QA-03 needs into ~/.cache/ms-playwright. */
import { spawnSync } from 'node:child_process';
import { BROWSERS_PATH, useBrowsersPath } from './browsers-path';

useBrowsersPath();
console.log(`Браузеры Playwright: ${BROWSERS_PATH}`);
const res = spawnSync('npx playwright install chromium firefox webkit', {
  stdio: 'inherit',
  shell: true,
});
process.exit(res.status ?? 1);
