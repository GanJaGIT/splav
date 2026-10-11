import type { Dict } from '../services/I18n';

/** L10N-03: every JSON in this folder is a language; adding one needs no code changes. */
const modules = import.meta.glob<Dict>('./*.json', { eager: true, import: 'default' });

export const dictionaries: Record<string, Dict> = Object.fromEntries(
  Object.entries(modules).map(([path, dict]) => [path.replace(/^.*\/(\w+)\.json$/, '$1'), dict]),
);

export const supportedLangs: string[] = Object.keys(dictionaries);
