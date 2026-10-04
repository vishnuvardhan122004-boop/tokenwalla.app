/**
 * The screens fixed in ROADMAP 28, claims 11–14, held against regression.
 *
 * i18n.keys.test.ts guards the dictionaries — that every key exists in all
 * four languages and that `t()` is never called with a key nobody defined.
 * What it cannot see is the failure these four claims actually were: a string
 * that never went through `t()` at all. A hard-coded literal is not a missing
 * key, so it is invisible to that test, to the type checker and to review —
 * which is how English errors survived on a screen whose 26 chrome strings
 * were all translated.
 *
 * So this pins the specific literals that were there, per screen. A source
 * scan for the same reason as utils/maxlength.test.ts: this repo's jest has no
 * react-native renderer, and an Alert inside a catch cannot be driven here.
 *
 * Telugu is the pilot language, which is what makes these worth a guard rather
 * than a tidy-up.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Source with comments stripped — a scan for an ABSENT string has to look at
 *  code, or a comment quoting the old copy fails the test for its own fix. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Literals that must no longer appear as code in a given file. */
const BANNED: Record<string, string[]> = {
  // claim 11 — every error a patient can hit on the login screen
  'app/(auth)/login.tsx': [
    'Enter your mobile number first',
    'Enter a valid 10-digit mobile number',
    'This mobile number is not registered',
    'This account has been blocked',
    'OTP failed. Please try again.',
    'Enter mobile and password / OTP',
    'Invalid credentials',
  ],
  // claim 12 — the pay-commit screen
  'app/(patient)/doctor/[id].tsx': [
    'Doctor Unavailable',
    'Select a Slot First',
    'Slot is Full',
    '& Book Appointment',
    'Login to Book',
    'Call to confirm',
    'Walk-in — no token',
    'Not selected yet',
    'Secured by Razorpay',
    'opening hours',
  ],
  // claim 13 — money-path errors, including the reassurance
  'components/RescheduleModal.tsx': [
    'That slot is no longer available.',
    'you will not be charged again',
    'Verification error. Contact support.',
    'Payment confirmation was incomplete',
  ],
  'app/(patient)/payment.tsx': [
    'Could not load the fee details',
  ],
  // claim 14 — the two share sheets that hard-coded what the third translates
  'app/(patient)/booking-token.tsx': ['Save your appointment ticket'],
  'app/(patient)/my-qr.tsx': ['Save your appointment ticket'],
};

describe('no hard-coded English on the screens fixed for claims 11-14', () => {
  for (const [file, literals] of Object.entries(BANNED)) {
    describe(file, () => {
      const code = codeOnly(read(file));

      it('still has the file (guards the scan against a silent rename)', () => {
        expect(code.length).toBeGreaterThan(500);
      });

      for (const literal of literals) {
        it(`does not hard-code ${JSON.stringify(literal)}`, () => {
          expect(code).not.toContain(literal);
        });
      }
    });
  }
});

describe('the strings a patient reads about money go through t()', () => {
  it('the reschedule reassurance is translated, not interpolated English', () => {
    // The one that costs real money if it is unreadable: a patient who has
    // just been charged and told the slot failed pays twice out of fear.
    expect(codeOnly(read('components/RescheduleModal.tsx')))
      .toMatch(/t\('rs_not_charged_again'\)/);
  });

  it('the pay-commit CTA carries the amount as a placeholder', () => {
    // Not string-concatenated around a translated fragment: word order for
    // "Pay ₹X & Book" differs by language, so the amount must be a {var}.
    expect(codeOnly(read('app/(patient)/doctor/[id].tsx')))
      .toMatch(/t\('dr_cta_pay_book',\s*\{\s*amount:/);
  });

  it('the fee-load failure is translated at render, so it follows a language switch', () => {
    const code = codeOnly(read('app/(patient)/payment.tsx'));
    expect(code).toMatch(/setFeeError\(true\)/);
    expect(code).toMatch(/t\('pay_fee_load_failed'\)/);
  });
});
