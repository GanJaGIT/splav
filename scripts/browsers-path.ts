// Playwright browsers live in ~/.cache/ms-playwright on every OS.
// On Windows the default %LOCALAPPDATA%\ms-playwright breaks inside packaged (MSIX) apps such as
// the Claude desktop app: AppData writes are redirected into the package, and Windows then fails
// to load Firefox's side-by-side assembly mozglue ("side-by-side configuration is incorrect").
// The home folder is not redirected, so the same browsers work everywhere.

import { homedir } from 'node:os';
import { join } from 'node:path';

export const BROWSERS_PATH = join(homedir(), '.cache', 'ms-playwright');

export function useBrowsersPath(): void {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= BROWSERS_PATH;
}
