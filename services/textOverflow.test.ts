/**
 * On a phone a <Text> in a row does not shrink: Yoga's flexShrink defaults to
 * 0, so a long label (Telugu, or any language at a large system font size) runs
 * past its button or card instead of wrapping. react-native-web shrinks it, so
 * the bug never shows on Expo web or in jest, only on a device. These pin the
 * rows that overflowed in the 2026-11-14 audit (360pt wide; te, hi, kn, en;
 * font scale 1.0 and 1.3), e.g. the Telugu Pay button and the doctor card's
 * walk-in footer pushing "Book now" off the card.
 */
import fs from 'fs';
import path from 'path';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const style = (src: string, key: string) =>
  src.match(new RegExp(`^\\s*${key}:\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? 'missing';

test.each([
  ['app/(patient)/payment.tsx', ['payBtnText', 'totalLabel']],
  ['app/(patient)/doctors.tsx', ['slotsCount', 'metaChipRow', 'metaChip', 'modeText']],
  ['app/(patient)/my-bookings.tsx', ['callHospital']],
  ['components/HomeScreen.tsx', ['priceRowLabel', 'priceTotalLabel']],
  ['app/(hospital)/(tabs)/dashboard.tsx', ['editBtnText']],
])('%s: a label beside an icon or an amount can shrink', (file, keys) => {
  const src = read(file);
  for (const k of keys) expect(`${k}: ${style(src, k)}`).toMatch(/flexShrink: 1/);
});

test('a wrapper holding text beside an icon can shrink', () => {
  expect(read('app/(patient)/my-bookings.tsx'))
    .toMatch(/<View style=\{\{ flexShrink: 1 \}\}>\s*<Text style=\{st\.cancelBtnTitle\}>/);
  expect(read('app/(patient)/booking-token.tsx'))
    .toMatch(/<View style=\{\{ flex: 1 \}\}>\s*<Text style=\{styles\.queueTitle\}>/);
});

test('the support email, one unbreakable word, gets a full-width card', () => {
  expect(read('app/(patient)/contact.tsx')).toMatch(/mailto:support@tokenwalla\.com'\), wide: true/);
});
