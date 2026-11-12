import { doctorTitle, localMonth, localName, localWeekday, setDisplayLang } from './localize';
import { providerLabel } from './booking';

describe('localName', () => {
  test('English is returned untouched', () => {
    expect(localName('Dr. Test Reddy', 'en')).toBe('Dr. Test Reddy');
  });
  test('common surnames and words use their proper spelling', () => {
    expect(localName('Reddy', 'te')).toBe('రెడ్డి');
    expect(localName('Reddy', 'kn')).toBe('ರೆಡ್ಡಿ');
    expect(localName('Reddy', 'hi')).toBe('रेड्डि');
    expect(localName('Rao', 'te')).toBe('రావు');
    expect(localName('Sharma', 'hi')).toBe('शर्मा');
    expect(localName('Hindupur', 'te')).toBe('హిందూపురం');
    expect(localName('Orthopedic Surgeon', 'te')).toBe('ఆర్థోపెడిక్ సర్జన్');
  });
  test('an unlisted name is written by the letter rules', () => {
    expect(localName('Ravi', 'te')).toBe('రవి');
    expect(localName('Kiran', 'kn')).toBe('ಕಿರನ್');
  });
  test('abbreviations, digits, punctuation and local script pass through', () => {
    expect(localName('ENT', 'te')).toBe('ENT');
    expect(localName('Clinic (24x7)', 'te')).toContain('(24');
    expect(localName('రవి', 'te')).toBe('రవి');
    expect(localName('', 'te')).toBe('');
    expect(localName(undefined, 'te')).toBe('');
  });
});

describe('providerLabel follows the display language', () => {
  afterEach(() => setDisplayLang('en'));
  test('English keeps "Dr." and never doubles it', () => {
    expect(providerLabel('Test Sharma')).toBe('Dr. Test Sharma');
    expect(providerLabel('Dr. Test Sharma')).toBe('Dr. Test Sharma');
  });
  test('Telugu gets the local title and name; scans have no title', () => {
    setDisplayLang('te');
    expect(doctorTitle()).toBe('డా.');
    expect(providerLabel('Test Sharma')).toBe('డా. టెస్ట్ శర్మ');
    expect(providerLabel('Dr. Test Sharma')).toBe('డా. టెస్ట్ శర్మ');
    expect(providerLabel('MRI Brain', 'SCAN').startsWith('MRI ')).toBe(true);     // abbreviation kept
    expect(providerLabel('Blood Test', 'SCAN')).not.toContain('Dr');
  });
});

describe('localWeekday', () => {
  test('English is unchanged; the other languages get their short day names', () => {
    expect(localWeekday('Mon', 'en')).toBe('Mon');
    expect(localWeekday('Mon', 'te')).toBe('సోమ');
    expect(localWeekday('Sun', 'kn')).toBe('ಭಾನು');
    expect(localWeekday('Fri', 'hi')).toBe('शुक्र');
    expect(localWeekday('Xyz', 'te')).toBe('Xyz');
  });
});

test('localMonth follows the language', () => {
  expect(localMonth('Nov', 'en')).toBe('Nov');
  expect(localMonth('Nov', 'te')).toBe('నవం');
  expect(localMonth('Xyz', 'te')).toBe('Xyz');
});
