/**
 * hooks/useOtpCooldown.test.ts
 *
 * Guards the OTP resend cooldown against the failure mode that caused it:
 * a send button whose only `disabled` is its own in-flight flag. That is not
 * a type error and nothing throws — the screen just works, and the person on
 * the other end gets an SMS every 60 seconds for as long as someone keeps
 * tapping.
 *
 * Reads the source rather than rendering it: there is no React renderer in
 * this suite (every other test here is pure logic), and what needs guarding
 * is "is the cooldown wired into this screen at all", which the source
 * answers directly. The equivalent behavioural tests — the lock holds, a 429
 * also starts it, the countdown reaches zero — live in the website repo
 * against the same hook.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

import { isCooldown429 } from './useOtpCooldown';

const ROOT = join(__dirname, '..');
const SEND = '/auth/otp/request/';

const FILES = globSync('app/**/*.tsx', { cwd: ROOT })
  .map(f => [f, readFileSync(join(ROOT, f), 'utf8')] as const)
  .filter(([, src]) => src.includes(SEND));

/* Every screen that can spend a real SMS. Listed so that an OTP screen added
   later fails this test by name instead of silently shipping without the
   cooldown — if you are here because you added one, wire the hook in and add
   the file. */
const EXPECTED = [
  'app/(auth)/forgot-password.tsx',
  'app/(auth)/login.tsx',
  'app/(auth)/register.tsx',
  'app/(hospital)/Hforgotpassword.tsx',
  'app/(hospital)/Hlogin.tsx',
  'app/(hospital)/Hprofile.tsx',
  'app/(hospital)/Huser.tsx',
  'app/(patient)/edit-profile.tsx',
];

const count = (src: string, needle: string) => src.split(needle).length - 1;

describe('OTP resend cooldown', () => {
  it('knows every screen that sends an OTP', () => {
    expect(FILES.map(([f]) => f).sort()).toEqual(EXPECTED);
  });

  it.each(EXPECTED)('%s imports the cooldown hook', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).toContain("from '../../hooks/useOtpCooldown'");
    expect(src).toContain('useOtpCooldown()');
  });

  it.each(EXPECTED)('%s starts the countdown on every send path', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const sends = count(src, SEND);
    // One on success and one on the 429 branch, per send site.
    expect(count(src, 'startCooldown()')).toBeGreaterThanOrEqual(sends * 2);
    expect(count(src, 'isCooldown429(')).toBeGreaterThanOrEqual(sends);
  });

  it.each(EXPECTED)('%s gates its send button on the countdown', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const sends = count(src, SEND);
    // Each send site needs a disabled= carrying the countdown and a label
    // that shows it, or the wait is invisible again.
    expect(count(src, 'cooldown > 0')).toBeGreaterThanOrEqual(sends * 2);
  });
});

describe('isCooldown429', () => {
  it('spots the server cooldown through every error shape in use', () => {
    expect(isCooldown429({ response: { status: 429 } })).toBe(true);
  });

  it('ignores anything else, including nothing at all', () => {
    expect(isCooldown429({ response: { status: 500 } })).toBe(false);
    expect(isCooldown429({ response: {} })).toBe(false);
    expect(isCooldown429(new Error('network'))).toBe(false);
    expect(isCooldown429(undefined)).toBe(false);
    expect(isCooldown429(null)).toBe(false);
  });
});
