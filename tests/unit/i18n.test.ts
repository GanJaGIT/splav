import { describe, expect, it } from 'vitest';
import { dictionaries, supportedLangs } from '../../src/i18n';
import { I18n, resolveLang } from '../../src/services/I18n';

describe('i18n', () => {
  it('ships ru and en', () => {
    expect(supportedLangs.sort()).toEqual(['en', 'ru']);
  });

  it('L10N-01: every language has the same keys and no empty texts', () => {
    const reference = Object.keys(dictionaries.ru ?? {}).sort();
    for (const [lang, dict] of Object.entries(dictionaries)) {
      expect(Object.keys(dict).sort(), lang).toEqual(reference);
      for (const [key, text] of Object.entries(dict)) {
        expect(text.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('L10N-02, UI-06: game title and language self-names', () => {
    expect(dictionaries.ru?.['game.title']).toBe('Сплав');
    expect(dictionaries.en?.['game.title']).toBe('Merge River');
    expect(dictionaries.ru?.['lang.name']).toBe('Русский');
    expect(dictionaries.en?.['lang.name']).toBe('English');
  });

  it('YG-06: language resolution', () => {
    const langs = ['ru', 'en'];
    expect(resolveLang('ru', langs)).toBe('ru');
    expect(resolveLang('en', langs)).toBe('en');
    expect(resolveLang('ru-RU', langs)).toBe('ru');
    expect(resolveLang('be', langs)).toBe('ru');
    expect(resolveLang('kk', langs)).toBe('ru');
    expect(resolveLang('uz', langs)).toBe('ru');
    expect(resolveLang('tr', langs)).toBe('en');
    expect(resolveLang('uk', langs)).toBe('en');
    expect(resolveLang('', langs)).toBe('en');
    expect(resolveLang(null, langs)).toBe('en');
  });

  it('substitutes parameters, falls back to English and to the key', () => {
    const i18n = new I18n({ ru: { a: 'Монет: {n}' }, en: { a: 'Coins: {n}', b: 'Only en' } }, 'ru');
    expect(i18n.t('a', { n: 5 })).toBe('Монет: 5');
    expect(i18n.t('b')).toBe('Only en');
    expect(i18n.t('missing')).toBe('missing');
  });

  it('L10N-01: plural forms through Intl.PluralRules', () => {
    const ru = new I18n(
      {
        ru: {
          'coins.one': '{n} монета',
          'coins.few': '{n} монеты',
          'coins.many': '{n} монет',
          'coins.other': '{n} монеты',
        },
      },
      'ru',
    );
    expect(ru.tp('coins', 1)).toBe('1 монета');
    expect(ru.tp('coins', 3)).toBe('3 монеты');
    expect(ru.tp('coins', 5)).toBe('5 монет');
    expect(ru.tp('coins', 21)).toBe('21 монета');
    const en = new I18n({ en: { 'coins.one': '{n} coin', 'coins.other': '{n} coins' } }, 'en');
    expect(en.tp('coins', 1)).toBe('1 coin');
    expect(en.tp('coins', 2)).toBe('2 coins');
  });
});
