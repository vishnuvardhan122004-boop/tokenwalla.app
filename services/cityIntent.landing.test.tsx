/**
 * Where Home's city question lands. The answers send ?kind= to the doctors tab
 * (which tab to open) and ?city= to the hospital list (which hospitals to show);
 * Home's own test pins what is sent, this one pins what each screen does with it.
 * Mirrors the website's Hero.cityIntent.test.js.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import { I18nProvider } from './i18n';
import DoctorsScreen from '../app/(patient)/doctors';
import HospitalsScreen from '../app/(patient)/hospitals';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-location', () => ({}));
jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  '(patient)/doctors': DoctorsScreen,
  '(patient)/hospitals': HospitalsScreen,
};

const DOCTORS = [
  { id: 1, name: 'Asha Rao', specialization: 'Cardiologist', city: 'Hindupur', hospital: 10,
    hospital_name: 'Sri Sai Hospital', experience: 8, fee: 300, available: true },
];
const SCAN_CENTRES = [
  { id: 7, name: 'City Lab', city: 'Hindupur', kind: 'SCAN_CENTER', segments: ['SCAN'] },
  { id: 8, name: 'Sai Diagnostics', city: 'Anantapur', kind: 'SCAN_CENTER', segments: ['SCAN'] },
];
const HOSPITALS = [
  { id: 10, name: 'Sri Sai Hospital', city: 'Hindupur' },
  { id: 11, name: 'Lotus Clinic', city: 'Anantapur' },
  { id: 12, name: 'City Care', city: ' hindupur ' },
];

let r: any;
const mount = async (location: string) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string, cfg?: any) => {
    if (url.startsWith('/hospitals/')) return Promise.resolve({ data: cfg?.params?.kind ? SCAN_CENTRES : HOSPITALS });
    if (url.startsWith('/scans/')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: DOCTORS });
  });
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location={location} />);
  });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
// The tab button whose label matches, and whether it is the selected one.
const tabSelected = (label: RegExp) => {
  let p = texts(label)[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  return p.props.accessibilityState?.selected;
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

describe('doctors tab', () => {
  test('?kind=SCAN_CENTER opens on Scans with the city already searched', async () => {
    await mount('/doctors?q=Hindupur&kind=SCAN_CENTER&ts=1');
    expect(tabSelected(/^Scans$/)).toBe(true);
    expect(tabSelected(/^Doctors$/)).toBe(false);
    expect(texts(/^City Lab$/)).not.toHaveLength(0);
    expect(texts(/^Sai Diagnostics$/)).toHaveLength(0);          // another city's centre
  });

  test('?kind=doctors stays on Doctors', async () => {
    await mount('/doctors?q=Hindupur&kind=doctors&ts=1');
    expect(tabSelected(/^Doctors$/)).toBe(true);
    expect(texts(/Asha Rao/)).not.toHaveLength(0);
  });

  test('an unknown ?kind= is ignored', async () => {
    await mount('/doctors?q=Hindupur&kind=HOSPITAL&ts=1');
    expect(tabSelected(/^Doctors$/)).toBe(true);
  });
});

describe('hospital list', () => {
  test('?city= narrows it to that city, ignoring case and stray spaces, and says so in the title', async () => {
    await mount('/hospitals?city=Hindupur');
    expect(texts(/^Sri Sai Hospital$/)).not.toHaveLength(0);
    expect(texts(/^City Care$/)).not.toHaveLength(0);
    expect(texts(/^Lotus Clinic$/)).toHaveLength(0);
    expect(texts(/^Hospitals · Hindupur$/)).not.toHaveLength(0);
  });

  test('no ?city= lists every hospital under the plain title, as before', async () => {
    await mount('/hospitals');
    expect(texts(/^Lotus Clinic$/)).not.toHaveLength(0);
    expect(texts(/^Sri Sai Hospital$/)).not.toHaveLength(0);
    expect(texts(/^Hospitals$/)).not.toHaveLength(0);
  });
});
