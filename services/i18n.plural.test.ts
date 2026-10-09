/**
 * ROADMAP 28, claim 16 — "1 slots today", "1 scans", "1 centres near you".
 * The app had no plural handling at all; `translate` now picks `<key>_one`
 * for a singular numeric count, per CLDR for each shipped language.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-localization', () => ({ getLocales: () => [] }));

import { translate } from './i18n';

describe('translate() plurals', () => {
  it('one reads in the singular, everything else in the plural (en)', () => {
    expect(translate('en', 'slots_today', { count: 1 })).toBe('1 slot today');
    expect(translate('en', 'slots_today', { count: 2 })).toBe('2 slots today');
    expect(translate('en', 'slots_today', { count: 0 })).toBe('0 slots today');
    expect(translate('en', 'scans_count', { count: 1 })).toBe('1 scan');
    expect(translate('en', 'centres_near_you', { count: 1 })).toBe('1 centre near you');
  });

  it('Telugu — the pilot language — drops the plural suffix at one', () => {
    expect(translate('te', 'slots_today', { count: 1 })).toBe('ఈరోజు 1 స్లాట్');
    expect(translate('te', 'slots_today', { count: 3 })).toBe('ఈరోజు 3 స్లాట్‌లు');
  });

  it('Kannada counts 0 as "one", as CLDR does', () => {
    expect(translate('kn', 'centres_count', { count: 0 })).toBe('0 ಕೇಂದ್ರ');
    expect(translate('kn', 'centres_count', { count: 2 })).toBe('2 ಕೇಂದ್ರಗಳು');
  });

  it('a string count, or a key with no _one, is unchanged', () => {
    expect(translate('en', 'slots_today', { count: '1' })).toBe('1 slots today');
    expect(translate('en', 'dr_left_count', { count: 1 })).toBe('1 left');
  });

  it('still falls back to English, then to the key', () => {
    expect(translate('te', 'no_such_key')).toBe('no_such_key');
  });
});
