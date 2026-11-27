/**
 * The hospital and patient forgot-password routes share one screen
 * (app/(auth)/forgot-password.tsx). Reads the source, like
 * hooks/useOtpCooldown.test.ts: this suite has no React renderer.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

it('the hospital route renders the shared screen in hospital mode', () => {
  const src = read('app/(hospital)/Hforgotpassword.tsx');
  expect(src).toContain("from '../(auth)/forgot-password'");
  expect(src).toContain('<ForgotPasswordScreen hospital />');
  expect(src).not.toContain('/auth/otp/request/');   // no second copy of the flow
});

it('hospital mode resets the hospital login and returns to it', () => {
  const src = read('app/(auth)/forgot-password.tsx');
  expect(src).toContain("hospital ? '/hospitals/reset-password/' : '/auth/reset-password/'");
  expect(src).toContain("hospital ? '/(hospital)/Hlogin' : '/(auth)/login'");
});
