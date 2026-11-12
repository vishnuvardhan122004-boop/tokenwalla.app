/**
 * The About / Refund / Terms / Privacy pages say what the product really does:
 * the refund tiers match the backend (70/60/50/0 by hours before the slot), About
 * has no invented numbers, and the YouTube channel is linked.
 */
import fs from 'fs';
import path from 'path';
import { YOUTUBE_URL } from '../constants/config';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the YouTube channel is the one Vishnu gave', () => {
  expect(YOUTUBE_URL).toBe('https://www.youtube.com/@tokenwalla-2026');
});

test('About has no invented numbers and a Watch on YouTube button', () => {
  const s = read('app/(patient)/about.tsx');
  expect(s).not.toMatch(/2,400|94%|4\.8/);
  expect(s).toContain('Track your turn live');
  expect(s).toContain('Linking.openURL(YOUTUBE_URL)');
});

test('Refund and Terms state the real tiers, and never the old "2 hours or nothing" rule', () => {
  const refund = read('app/(patient)/refund.tsx');
  const terms = read('app/(patient)/terms.tsx');
  expect(refund).toContain('24 hours or more, 70%; 12 to 24 hours, 60%; 2 to 12 hours, 50%');
  expect(refund).toMatch(/payment-gateway fee and GST are never refunded/);
  expect(terms).toContain('70% at 24 hours or more, 60% at 12 to 24 hours, 50% at 2 to 12 hours');
  expect(terms).not.toContain('at least 2 hours before your slot');
});

test('Privacy states the real session lifetime and one support address', () => {
  const s = read('app/(patient)/privacy.tsx');
  expect(s).toContain('access tokens last 1 day');
  expect(s).toContain('support@tokenwalla.com');
  expect(s).not.toContain('tokentraq@gmail.com');
});

test('every policy page and Contact link the YouTube channel', () => {
  for (const f of ['about', 'privacy', 'refund', 'terms', 'contact']) {
    expect(read(`app/(patient)/${f}.tsx`)).toContain('YOUTUBE_URL');
  }
});
