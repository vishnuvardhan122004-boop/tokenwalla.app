/**
 * A hospital login must not be offered — or be able to reach — patient booking.
 *
 * A logged-in hospital reaches the patient area for real: app launch boots into
 * `/(patient)/home`, and Android back from its dashboard pops to whatever
 * patient screen it logged in from. From there it could browse and book, and
 * `CreateOrderView` is `IsAuthenticated` only, so the booking would go through.
 * Home now redirects it to its own Dashboard | Scanner bar (pinned at the
 * bottom of this file); the gates below stay as the second line.
 *
 * THE FIRST VERSION OF THIS FIX DID NOT WORK, AND THIS SUITE WAS GREEN WHILE A
 * DEVICE SHOWED ALL FOUR TABS. It asserted `href: isHospital ? null` — true of
 * the source, and irrelevant, because `isHospital` was read once on MOUNT. The
 * layout mounts at launch, before anyone logs in (app/index.tsx), and hospital
 * login is pushed on top of it, so the mount-time answer was "not a hospital"
 * for the whole session. The assertions below pin the things that actually
 * decide the runtime result:
 *   1. the role is re-read on FOCUS, and there is no mount-only read left;
 *   2. booking screens are UNREGISTERED (Tabs.Protected), not merely hidden —
 *      href:null hides a button and leaves the route reachable;
 *   3. screens a hospital legitimately uses stay OUTSIDE the guard.
 * A source scan still cannot prove focus fires at runtime; that was checked on
 * an emulator (log in as a hospital, dashboard back → Home showed two tabs,
 * before the hospital got its own bar).
 *
 * Lives in services/, not under app/: everything under app/ is an expo-router
 * route, and a test file there breaks the production bundle.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const codeOnly = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const LAYOUT  = codeOnly(read('app/(patient)/_layout.tsx'));
const HOME    = codeOnly(read('components/HomeScreen.tsx'));
const ABOUT   = codeOnly(read('app/(patient)/about.tsx'));
const PROFILE = codeOnly(read('app/(patient)/profile.tsx'));

/** Every screen name declared inside a `<Tabs.Protected guard={!isHospital}>`. */
function protectedNames(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<Tabs\.Protected\s+guard=\{!isHospital\}>([\s\S]*?)<\/Tabs\.Protected>/g)) {
    for (const n of m[1].matchAll(/name="([^"]+)"/g)) out.push(n[1]);
  }
  return out;
}

const BOOKING_SCREENS = [
  'doctors', 'my-bookings', 'doctor/[id]', 'scan-center/[id]', 'my-qr', 'payment', 'booking-token',
];

describe('the role is read on focus, not on mount (the bug a device caught)', () => {
  it('re-reads the user whenever the patient group regains focus', () => {
    expect(LAYOUT).toMatch(/useCurrentUser<[^>]*>\(\{\s*refetchOnFocus:\s*true\s*\}\)/);
    expect(LAYOUT).toMatch(/isHospital\s*=\s*user\?\.role === 'hospital'/);
  });

  it('has no mount-only role read left behind', () => {
    // The broken version: useEffect(() => { getUser()... }, []). Its answer was
    // computed before login and never refreshed.
    expect(LAYOUT).not.toMatch(/getUser\(\)/);
    expect(LAYOUT).not.toMatch(/useEffect\(/);
  });
});

describe('booking screens are unregistered for a hospital, not just hidden', () => {
  const names = protectedNames(LAYOUT);

  for (const screen of BOOKING_SCREENS) {
    it(`guards ${screen}`, () => {
      expect(names).toContain(screen);
    });
  }

  it('no longer relies on href toggling, which leaves the route reachable', () => {
    expect(LAYOUT).not.toMatch(/href:\s*isHospital/);
  });

  for (const keep of ['home', 'profile', 'notifications', 'my-documents', 'edit-profile', 'about']) {
    it(`leaves ${keep} registered — a hospital uses it`, () => {
      // notifications especially: the dashboard opens it with ?audience=hospital.
      expect(names).not.toContain(keep);
      expect(LAYOUT).toContain(`name="${keep}"`);
    });
  }

  it('keeps home as the first screen, so a hospital evicted from a guarded screen lands there', () => {
    const first = LAYOUT.match(/<Tabs\.Screen\s+name="([^"]+)"/);
    expect(first?.[1]).toBe('home');
  });
});

describe('no dead booking buttons are shown to a hospital', () => {
  it('Home derives isHospital from the role it re-reads on focus', () => {
    expect(HOME).toMatch(/const isHospital = user\?\.role === 'hospital'/);
    expect(HOME).toMatch(/useFocusEffect/);
  });

  const HOME_GATES: [string, RegExp][] = [
    ['hero "Book appointment"',  /\{!isHospital && \(\s*<TouchableOpacity\s+style=\{styles\.primaryBtn\}/],
    ['browse by specialty',      /\{!isHospital && \(\s*<View style=\{styles\.specSection\}>/],
    ['how it works',             /\{!isHospital && \(\s*<View style=\{styles\.section\}>\s*<Text style=\{styles\.sectionLabel\}>\{t\('how_it_works'\)\}/],
    ['doctor cards',             /\{!isHospital && !loading && doctors\.length > 0 && \(/],
    ['price card',               /\{!isHospital && \(\s*<View style=\{styles\.section\}>\s*<Text style=\{styles\.sectionLabel\}>\{t\('pricing'\)\}/],
    ['CTA banner',               /\{!isHospital && \(\s*<View style=\{styles\.ctaBanner\}>/],
  ];
  for (const [label, re] of HOME_GATES) {
    it(`gates Home's ${label}`, () => {
      expect(HOME).toMatch(re);
    });
  }

  it('gates About\'s "Find a Doctor" banner', () => {
    expect(ABOUT).toMatch(/useCurrentUser<[^>]*>\(\{\s*refetchOnFocus:\s*true\s*\}\)/);
    expect(ABOUT).toMatch(/\{!isHospital && \(\s*<View style=\{styles\.ctaBanner\}>/);
  });

  it('keeps My Bookings and Find Doctors out of the profile menu for a hospital', () => {
    const arms = [...PROFILE.matchAll(/role === 'hospital'\s*\?\s*\[\]\s*:\s*\[([\s\S]*?)\]\)/g)]
      .map(m => m[1]).join('\n');
    expect(arms).toContain("'/(patient)/my-bookings'");
    expect(arms).toContain("'/(patient)/doctors'");
  });
});

describe('a hospital gets its own Dashboard | Scanner bar, never Home | Profile', () => {
  const TABS    = codeOnly(read('app/(hospital)/(tabs)/_layout.tsx'));
  const SCANNER = codeOnly(read('app/(hospital)/(tabs)/scanner.tsx'));
  const HPROF   = codeOnly(read('app/(hospital)/profile.tsx'));

  it('Home sends a hospital to its dashboard (Redirect = replace) only when the dashboard can open', () => {
    // The dashboard bounces to login without user.hospital, and login bounces
    // back — so redirecting on role alone could loop forever.
    expect(HOME).toMatch(/const opensDashboard = isHospital && !!user\?\.hospital;/);
    expect(HOME).toMatch(/if \(opensDashboard\) return <Redirect href="\/\(hospital\)\/dashboard" \/>;/);
  });

  it('hides the patient bar for exactly the hospitals Home redirects', () => {
    expect(LAYOUT).toMatch(/const hasHospitalBar = isHospital && !!user\?\.hospital;/);
    expect(LAYOUT).toMatch(/tabBarStyle:\s*hasHospitalBar \? \{ display: 'none' \} : styles\.tabBar/);
  });

  it('the hospital bar is exactly Dashboard then Scanner, and back is not history-based', () => {
    const names = [...TABS.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map(m => m[1]);
    expect(names).toEqual(['dashboard', 'scanner']);
    // 'history' made Android back ping-pong Dashboard <-> Scanner forever.
    expect(TABS).toMatch(/backBehavior="firstRoute"/);
  });

  it('leaving the Scanner tab stops the camera AND clears the last patient', () => {
    // A tab stays mounted: without the reset, "Scan QR" for the next patient
    // showed the previous one's live "Mark as In Consultation".
    const blur = SCANNER.match(/useFocusEffect\(useCallback\(\(\) => \(\) => \{([\s\S]*?)\}, \[\]\)\)/);
    expect(blur).not.toBeNull();
    for (const call of ['setScanning(false)', 'setScanResult(null)', "setScanState('idle')", "setManualToken('')"]) {
      expect(blur![1]).toContain(call);
    }
  });

  it('a verify/confirm still in flight when the tab is left cannot repaint the old card', () => {
    // The blur reset alone lost the race: a late answer landed after it.
    expect(SCANNER).toMatch(/useFocusEffect\(useCallback\(\(\) => \(\) => \{\s*visitRef\.current \+= 1;/);
    // handleTokenFound and markAttended: after each await, on success and on error.
    expect(SCANNER.match(/if \(visit !== visitRef\.current\) return;/g)?.length).toBe(4);
  });

  it('hospital login only auto-opens the dashboard when the dashboard will open', () => {
    // Role alone looped login <-> dashboard for a user with no hospital object.
    const LOGIN = codeOnly(read('app/(hospital)/login.tsx'));
    expect(LOGIN).toMatch(/if \(u\?\.role === 'hospital' && u\?\.hospital\) \{\s*router\.replace\('\/\(hospital\)\/dashboard'\)/);
  });

  it('Profile goes BACK to the tabs instead of stacking a second bar', () => {
    expect(HPROF).toContain("router.dismissTo('/(hospital)/dashboard')");
    expect(HPROF).toContain("router.dismissTo('/(hospital)/scanner')");
    expect(HPROF).not.toMatch(/router\.(push|replace)\('\/\(hospital\)\/(dashboard|scanner)'\)/);
  });
});
