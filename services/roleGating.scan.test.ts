/**
 * A hospital login must not be offered patient booking.
 *
 * A logged-in hospital reaches the patient area for real: the dashboard's back
 * button goes to `/(patient)/home` (app/(hospital)/dashboard.tsx), which drops
 * it into the patient Tabs navigator — Home, Doctors, My Bookings, Profile.
 * From there it could browse and book, and `CreateOrderView` is
 * `IsAuthenticated` only, with no role check, so the booking would go through.
 *
 * Doctors and My Bookings are therefore hidden for that role in two places,
 * and both are needed: the tab bar in `app/(patient)/_layout.tsx`, and the
 * matching rows in the profile menu, which would otherwise route straight
 * around the hidden tabs.
 *
 * A source scan, for the usual reason (see utils/maxlength.test.ts): no
 * react-native renderer here, so a Tabs navigator cannot be mounted. Lives in
 * services/ and NOT under app/, because everything under app/ is an
 * expo-router route and a test file there breaks the production bundle — see
 * services/hospitalScreens.scan.test.ts.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const LAYOUT  = codeOnly(read('app/(patient)/_layout.tsx'));
const PROFILE = codeOnly(read('app/(patient)/profile.tsx'));

/** The `options={{ … }}` block of one <Tabs.Screen name="x" …>. */
function tabOptions(src: string, name: string): string {
  const at = src.indexOf(`name="${name}"`);
  expect(at).toBeGreaterThan(-1);
  const end = src.indexOf('/>', at);
  expect(end).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe('the patient tab bar hides booking for a hospital login', () => {
  it('knows the role at all', () => {
    expect(LAYOUT).toMatch(/isHospital/);
    expect(LAYOUT).toMatch(/role === 'hospital'/);
  });

  for (const tab of ['doctors', 'my-bookings']) {
    it(`hides the ${tab} tab when the user is a hospital`, () => {
      expect(tabOptions(LAYOUT, tab)).toMatch(/href:\s*isHospital\s*\?\s*null/);
    });
  }

  for (const tab of ['home', 'profile']) {
    it(`leaves the ${tab} tab alone — a hospital still needs it`, () => {
      expect(tabOptions(LAYOUT, tab)).not.toMatch(/href:/);
    });
  }
});

describe('the profile menu does not route around the hidden tabs', () => {
  it('offers My Bookings and Find Doctors only to a non-hospital role', () => {
    // Both live inside the same `role === 'hospital' ? [] : [...]` arm, so one
    // check pins both; assert each target is inside it rather than anywhere.
    const arms = [...PROFILE.matchAll(/role === 'hospital'\s*\?\s*\[\]\s*:\s*\[([\s\S]*?)\]\)/g)]
      .map(m => m[1]);
    expect(arms.length).toBeGreaterThan(0);
    const patientOnly = arms.join('\n');
    expect(patientOnly).toContain("'/(patient)/my-bookings'");
    expect(patientOnly).toContain("'/(patient)/doctors'");
  });

  it('still offers My Documents to both roles (not part of booking)', () => {
    // Deliberately NOT removed: it was not asked for, and a hospital opening
    // it sees an empty list rather than anything a patient owns.
    const at = PROFILE.indexOf("'/(patient)/my-documents'");
    expect(at).toBeGreaterThan(-1);
    const arms = [...PROFILE.matchAll(/role === 'hospital'\s*\?\s*\[\]\s*:\s*\[([\s\S]*?)\]\)/g)];
    for (const m of arms) {
      const start = m.index!;
      expect(at > start && at < start + m[0].length).toBe(false);
    }
  });
});
