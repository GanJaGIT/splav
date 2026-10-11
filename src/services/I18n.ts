export type Dict = Record<string, string>;

/** YG-06: these languages fall back to Russian, everything unsupported — to English. */
const RU_FALLBACK = ['be', 'kk', 'uz'];
const DEFAULT_LANG = 'en';

/** YG-06: maps a platform language code to one the game has. */
export function resolveLang(raw: string | null | undefined, supported: readonly string[]): string {
  const code = (raw ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  if (supported.includes(code)) return code;
  if (RU_FALLBACK.includes(code) && supported.includes('ru')) return 'ru';
  return DEFAULT_LANG;
}

/** L10N-01..03: texts by key with `{name}` parameters and plural forms via Intl.PluralRules. */
export class I18n {
  readonly lang: string;
  private readonly dict: Dict;
  private readonly fallback: Dict;
  private readonly plural: Intl.PluralRules;

  constructor(dicts: Record<string, Dict>, lang: string) {
    this.lang = lang;
    this.dict = dicts[lang] ?? {};
    this.fallback = dicts[DEFAULT_LANG] ?? {};
    this.plural = new Intl.PluralRules(lang);
  }

  has(key: string): boolean {
    return key in this.dict || key in this.fallback;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const text = this.dict[key] ?? this.fallback[key] ?? key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (m, name: string) =>
      name in params ? String(params[name]) : m,
    );
  }

  /** Plural form: looks up `key.one`, `key.few`, `key.many`, `key.other`, falling back to `key.other`. */
  tp(key: string, n: number, params?: Record<string, string | number>): string {
    const form = this.plural.select(n);
    const full = this.has(`${key}.${form}`) ? `${key}.${form}` : `${key}.other`;
    return this.t(full, { n, ...params });
  }
}
