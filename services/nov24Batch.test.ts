/**
 * The app half of the 2026-11-24 batch (web ROADMAP 59, 84, and the pass
 * Cancel line). No React renderer here, so logic is tested directly and the
 * wiring by reading the source.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { translate } from './i18n';
import { cancelNoteKey, cancelSubKey, liveLink, shareMessage } from '../utils/shareQueue';
import { posterUrl } from '../components/SelfCheckinSwitch';

// Hoisted by jest above the imports.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), multiRemove: jest.fn(),
}));
jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));

const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const t = (k: string, v?: Record<string, string | number>) => translate('en', k, v);
const NOW = new Date(2026, 10, 24, 10, 0);
const B = { live_key: 'K1', doctor_name: 'Anita Rao', provider_kind: 'DOCTOR', hospital_name: 'City Care',
            date: '2026-11-24', slot: '10:00 AM' };

describe('Share my queue', () => {
  it('today: follow my place, with the link', () => {
    expect(shareMessage(B, t, 'en', NOW)).toBe(
      "I'm at City Care with Dr. Anita Rao. Follow my place in the queue: https://www.tokenwalla.com/q/K1");
  });

  it('a later date says when', () => {
    expect(shareMessage({ ...B, date: '2026-12-01' }, t, 'en', NOW)).toBe(
      'I have a token with Dr. Anita Rao on 2026-12-01, 10:00 AM: https://www.tokenwalla.com/q/K1');
  });

  it('a token booked for family names that person', () => {
    const fam = { ...B, booked_for_name: 'Amma' };
    expect(shareMessage(fam, t, 'en', NOW)).toBe(
      'Token for Amma at City Care with Dr. Anita Rao. Follow the queue live: https://www.tokenwalla.com/q/K1');
    expect(shareMessage({ ...fam, date: '2026-12-01' }, t, 'en', NOW)).toBe(
      'Amma has a token with Dr. Anita Rao on 2026-12-01, 10:00 AM: https://www.tokenwalla.com/q/K1');
  });

  it('no key, nothing to share', () => {
    expect(shareMessage({ ...B, live_key: null }, t, 'en', NOW)).toBeNull();
  });

  it('the link carries a non-English language', () => {
    expect(liveLink('K1', 'te')).toBe('https://www.tokenwalla.com/q/K1?lang=te');
  });

  it('My Bookings shows the button only with a key, through the share sheet', () => {
    const s = src('app/(patient)/my-bookings.tsx');
    expect(s).toContain('{booking.live_key ? (');
    expect(s).toContain('Share.share({ message })');
  });
});

describe('the pass line on Cancel matches the website', () => {
  it.each([
    ['redeemed', 'The visit goes back on your Appointment Pass.', 'The visit goes back on your pass'],
    ['purchase', 'This ends your Appointment Pass. Any unused free visit goes with it, and only the unused part is refunded.', 'This ends your pass'],
  ])('%s', (role, confirm, sub) => {
    expect(t(cancelNoteKey({ pass_role: role }))).toBe(confirm);
    expect(t(cancelSubKey({ pass_role: role }))).toBe(sub);
  });

  it('no pass keeps the refund lines', () => {
    expect(cancelNoteKey({ pass_role: null })).toBe('mb_refund_note');
    expect(cancelSubKey({})).toBe('refund_in_days');
  });

  it('every new string exists in all four languages', () => {
    for (const lang of ['en', 'hi', 'te', 'kn'] as const) {
      for (const k of ['mb_cancel_pass_back', 'mb_cancel_pass_ends', 'cancel_pass_back', 'cancel_pass_ends',
                       'share_queue', 'share_today', 'share_later']) {
        expect(translate(lang, k)).not.toBe(k);
      }
    }
  });

  it('Cancel uses them', () => {
    const s = src('app/(patient)/my-bookings.tsx');
    expect(s).toContain("t(cancelNoteKey(booking))");
    expect(s).toContain("t(cancelSubKey(booking))");
  });
});

describe('self check-in on the hospital side', () => {
  it('the queue tags a self check-in token', () => {
    expect(src('app/(hospital)/(tabs)/dashboard.tsx')).toContain("p.booked_via === 'self'");
  });

  it('Profile has the switch, and its poster is the website check-in poster', () => {
    expect(src('app/(hospital)/Hprofile.tsx')).toContain('<SelfCheckinSwitch hospitalId=');
    expect(posterUrl(4)).toBe('https://www.tokenwalla.com/poster/checkin/4');
  });

  it('the switch saves self_checkin_enabled and reads it from the server', () => {
    const s = src('components/SelfCheckinSwitch.tsx');
    expect(s).toContain('{ self_checkin_enabled: next }');
    expect(s).toContain('API.get(`/hospitals/${hospitalId}/`)');
  });

  it('follows the Railway switch: off hides it, on shows no switch', () => {
    const s = src('components/SelfCheckinSwitch.tsx');
    expect(s).toContain("mode === 'off') return null");
    expect(s).toContain("mode === 'on' ? (");
    expect(s).toContain('data?.self_checkin_mode');
  });
});
