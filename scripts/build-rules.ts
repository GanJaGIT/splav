import { readFileSync } from 'node:fs';

/** Shared rules for the release archive: BLD-02, BLD-03, PERF-01. */

export const ROOT = new URL('..', import.meta.url);

export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

export function zipName(version = packageVersion()): string {
  return `splav-${version}.zip`;
}

/** BLD-02: allowed characters in every part of a path inside the archive. */
export const NAME_RE = /^[a-z0-9._-]+$/;

/** Files that never go into the archive (BLD-02). */
export function isExcluded(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  return base.endsWith('.map') || base === 'purchases-catalog.json' || base === '.gitkeep';
}

/** PERF-01: our own limit for the archive; Yandex allows 100 MB. */
export const MAX_ZIP_BYTES = 15 * 1024 * 1024;

/**
 * BLD-03, TECH-04: absolute URLs allowed in the build. XML namespace identifiers are names,
 * not requests. Yandex Metrica is added here in Stage 5 if the owner gives a counter (AN-01).
 */
export const ALLOWED_URL_PREFIXES = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/xmlns/',
];

/** п. 1.7: direct links to Yandex S3 are forbidden. */
export const FORBIDDEN_HOSTS = ['storage.yandexcloud.net', 'yandex-s3', 's3.yandex'];

/**
 * DEV-02: test hooks must not reach the release build; YG-13: nor LocalPlatform with its
 * stand-in ad overlays (an imitation of ads is forbidden).
 */
export const DEV_MARKERS = ['__game', 'dev-overlay', 'Rewarded video (dev)'];

export const TEXT_EXT = ['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml'];
