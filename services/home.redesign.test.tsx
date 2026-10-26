/**
 * The REAL home screen: the way into cities, hospitals and doctors.
 *
 * Every city, hospital and count on it comes from the public /doctors/ list, so
 * these tests feed that list and read the screen back. They also pin what it no
 * longer claims — the stats row ("2,400+ tokens", "94% on-time", "4.8★") was
 * typed in, on a product with a handful of real bookings. Mirrors
 * src/componets/Hero.home.test.js on the website.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import API, { getUser } from './api';
import { I18nProvider, translate } from './i18n';
import HomeScreen from '../components/HomeScreen';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
    useFocusEffect: (cb: () => void) => R.useEffect(cb, []),
    Redirect: () => null,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-localization', () => ({ getLocales: () => [] }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('./notifications', () => ({ registerPushToken: jest.fn() }));
jest.mock('../components/NotificationBell', () => () => null);
jest.mock('../components/LanguageModal', () => () => null);
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  getUser: jest.fn(),
}));

const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const doc = (over: object) => ({
  id: 1, name: 'Asha Rao', specialization: 'Cardiologist', city: 'Hindupur',
  hospital: 10, hospital_name: 'Sri Sai Hospital', experience: 8, fee: 300,
  available: true, image: null, ...over,
});

const DOCTORS = [
  doc({ id: 1, name: 'Asha Rao',   available: false }),
  doc({ id: 2, name: 'Ravi Kumar', specialization: 'Dentist' }),
  doc({ id: 3, name: 'Meena Iyer', hospital: 11, hospital_name: 'City Care Hospital' }),
  doc({ id: 4, name: 'Naidu',      hospital: 12, hospital_name: 'Lotus Clinic', city: 'Anantapur' }),
  doc({ id: 5, name: 'Hidden',     hospital: 13, hospital_name: '[TEST] Demo Hospital' }),
];

let r: any;
const mount = async (opts: { doctors?: any[] | Error; user?: object | null } = {}) => {
  (getUser as jest.Mock).mockResolvedValue(opts.user ?? null);
  (API.get as jest.Mock).mockImplementation((url: string) => {
    if (url.startsWith('/payment/pass')) return Promise.resolve({ data: { enabled: false } });
    if (opts.doctors instanceof Error) return Promise.reject(opts.doctors);
    return Promise.resolve({ data: opts.doctors ?? DOCTORS });
  });
  await act(async () => { r = TestRenderer.create(<I18nProvider><HomeScreen /></I18nProvider>); });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};

const textOf = (node: any) => node.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join('');
const text = () => textOf(r.root);
const press = (node: any) => act(async () => { node.props.onPress(); });
const buttonLabelled = (label: string) =>
  r.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityLabel === label)[0];
const buttonWithText = (s: string) =>
  r.root.findAll((n: any) => n.type === TouchableOpacity && textOf(n).includes(s))[0];

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => act(() => r.unmount()));

describe('cities', () => {
  test('each city with doctors is a button with real counts', async () => {
    await mount();
    expect(text()).toContain('Choose your city');
    // 3 doctors in 2 hospitals; the [TEST] hospital's doctor is not counted.
    expect(text()).toContain('3 doctors · 2 hospitals');
    // Singular where it is one, not "1 doctors".
    expect(text()).toContain('1 doctor · 1 hospital');

    // A tap asks what they are looking for (describe 'the city question'); it
    // does not navigate by itself.
    await press(buttonLabelled('Hindupur'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('the busiest city comes first', async () => {
    await mount();
    const names = r.root.findAll((n: any) => n.type === TouchableOpacity && /^(Hindupur|Anantapur)$/.test(n.props.accessibilityLabel ?? ''))
      .map((n: any) => n.props.accessibilityLabel);
    expect(names).toEqual(['Hindupur', 'Anantapur']);
  });

  test('a failed doctor list shows no city button and does not break the page', async () => {
    await mount({ doctors: new Error('network') });
    expect(text()).not.toContain('Choose your city');
    expect(text()).not.toContain('Browse by Hospital');
    // The rest still renders.
    expect(text()).toContain('Skip the Queue.');
    expect(text()).toContain('Book Appointment');
  });
});

describe('the city question', () => {
  const answer = (label: string) =>
    r.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityLabel === label
      && typeof n.props.onPress === 'function')[0];

  test('tapping a city asks what they are looking for in that city', async () => {
    await mount();
    expect(text()).not.toContain('What are you looking for in');
    await press(buttonLabelled('Anantapur'));
    expect(text()).toContain('What are you looking for in Anantapur?');
    expect(text()).toContain('Doctor');
    expect(text()).toContain('Scan or test');
    expect(text()).toContain('Hospital');
  });

  test('Doctor opens the doctors tab on that city', async () => {
    await mount();
    await press(buttonLabelled('Hindupur'));
    await press(answer('Doctor'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(patient)/doctors',
      params: { q: 'Hindupur', kind: 'doctors', ts: expect.any(String) },
    });
    expect(text()).not.toContain('What are you looking for in');   // and it closes
  });

  test('Scan or test opens the Scans tab on that city', async () => {
    await mount();
    await press(buttonLabelled('Hindupur'));
    await press(answer('Scan or test'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(patient)/doctors',
      params: { q: 'Hindupur', kind: 'SCAN_CENTER', ts: expect.any(String) },
    });
  });

  test('Hospital opens the hospital list narrowed to that city', async () => {
    await mount();
    await press(buttonLabelled('Anantapur'));
    await press(answer('Hospital'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(patient)/hospitals', params: { city: 'Anantapur' } });
  });

  test('Close leaves without going anywhere, and nothing is fetched for the answer', async () => {
    await mount();
    const calls = (API.get as jest.Mock).mock.calls.length;
    await press(buttonLabelled('Hindupur'));
    await press(answer('Close'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(text()).not.toContain('What are you looking for in');
    expect((API.get as jest.Mock).mock.calls).toHaveLength(calls);
  });

  test('answering the same way twice sends different params, so the tab re-applies it', async () => {
    await mount();
    jest.spyOn(Date, 'now').mockReturnValueOnce(1).mockReturnValueOnce(2);
    for (let i = 0; i < 2; i++) {
      await press(buttonLabelled('Hindupur'));
      await press(answer('Scan or test'));
    }
    const [a, b] = mockPush.mock.calls.map(c => c[0].params.ts);
    expect(a).not.toEqual(b);
  });
});

describe('hospitals and doctors', () => {
  test('a hospital card shows its city and doctor count and opens the hospital page', async () => {
    await mount();
    expect(text()).toContain('Browse by Hospital');
    expect(text()).toContain('Hindupur · 2 doctors');
    expect(text()).not.toContain('Demo Hospital');

    await press(buttonWithText('Sri Sai Hospital'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(patient)/hospital/[id]', params: { id: 10 } });
  });

  test('the Hospitals button opens the full list', async () => {
    await mount();
    await press(buttonWithText('Hospitals'));
    expect(mockPush).toHaveBeenCalledWith('/(patient)/hospitals');
  });

  test('a doctor with no photo shows initials; one who is booked up sorts last', async () => {
    await mount();
    expect(text()).toContain('RK');
    // Ravi, Meena and Naidu are bookable; Asha is not, so she is the last card.
    const order = [...text().matchAll(/Dr\. (Asha Rao|Ravi Kumar|Meena Iyer|Naidu)/g)].map(m => m[1]);
    expect(order).toEqual(['Ravi Kumar', 'Meena Iyer', 'Naidu', 'Asha Rao']);
  });
});

describe('search', () => {
  test('sends the typed words to the doctor list', async () => {
    await mount();
    const input = r.root.findByType(TextInput);
    await act(async () => { input.props.onChangeText('  heart  '); });
    await act(async () => { r.root.findByType(TextInput).props.onSubmitEditing(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(patient)/doctors', params: { q: 'heart' } });
  });

  test('an empty search just opens the list', async () => {
    await mount();
    await act(async () => { r.root.findByType(TextInput).props.onSubmitEditing(); });
    expect(mockPush).toHaveBeenCalledWith('/(patient)/doctors');
  });
});

describe('what the screen no longer claims', () => {
  test('no invented stats and no "thousands"', async () => {
    await mount();
    for (const claim of ['2,400', '94%', '4.8', 'thousands', 'Tokens', 'On-time', 'Rating']) {
      expect(text()).not.toContain(claim);
    }
  });
});

describe('a hospital account', () => {
  test('is offered none of the patient entry points', async () => {
    // A hospital whose `hospital` object did not attach stays on Home (a
    // redirect would loop), so Home must not show it booking controls.
    await mount({ user: { id: 9, name: 'Clinic', role: 'hospital' } });
    expect(r.root.findAllByType(TextInput)).toHaveLength(0);
    for (const s of ['Choose your city', 'Browse by Hospital', 'Book Appointment', 'Doctors Near You']) {
      expect(text()).not.toContain(s);
    }
  });
});

describe('dictionaries', () => {
  // The trust points and steps are looked up by a key held in an array, which
  // the key scan in i18n.keys.test.ts cannot see.
  const SRC = fs.readFileSync(path.join(__dirname, '../components/HomeScreen.tsx'), 'utf8');
  const keys = [
    ...[...SRC.matchAll(/'(feat_[a-z_]+_title)'/g)].map(m => m[1]),
    ...[...SRC.matchAll(/titleKey: '([a-z_]+)'/g)].map(m => m[1]),
  ];

  test('the keys exist at all', () => expect(keys.length).toBe(7));

  test.each(['en', 'hi', 'te', 'kn'] as const)('every trust and step key resolves in %s', (lang) => {
    expect(keys.filter(k => translate(lang, k) === k)).toEqual([]);
  });
});
