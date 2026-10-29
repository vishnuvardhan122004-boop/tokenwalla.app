/**
 * ROADMAP 53 slice 4: a doctor or a test may limit how far ahead a patient can
 * book. The server refuses a later date either way; these pin that the patient's
 * date strip stops OFFERING one, and that a provider with no limit keeps the week.
 * Mirrors src/componets/BookAhead.strip.test.js on the website.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import { I18nProvider } from './i18n';
import DoctorScreen from '../app/(patient)/doctor/[id]';
import ScanCenterScreen from '../app/(patient)/scan-center/[id]';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null }));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  getUser: jest.fn().mockResolvedValue({ id: 1, name: 'Asha', role: 'patient' }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  'doctor/[id]': DoctorScreen,
  'scan-center/[id]': ScanCenterScreen,
};

let r: any;
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
/** Every chip on a date strip carries its month ("Oct") once; nothing else on these screens is a bare month name. */
const days = () => texts(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/).length;
const settle = async (n = 5) => { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); }); };
const press = async (re: RegExp) => {
  let p = texts(re)[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
  await settle(3);
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

describe('doctor page', () => {
  const DOCTOR = {
    id: 5, name: 'Anita Rao', specialization: 'General', city: 'Hindupur', experience: 1, fee: 200,
    available: true, hospital: 3, hospital_name: 'City Care', slots: ['09:00 AM'], days: [], max_per_slot: 10,
    mobile: '9000000002',
  };
  const show = async (over: object) => {
    process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
    (API.post as jest.Mock).mockResolvedValue({});
    (API.get as jest.Mock).mockImplementation((url: string) =>
      url === '/doctors/5/' ? Promise.resolve({ data: { ...DOCTOR, ...over } })
      : url === '/hospitals/3/' ? Promise.resolve({ data: { id: 3 } })
      : Promise.resolve({ data: {} }));
    await act(async () => { r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location="/doctor/5" />); });
    await settle();
  };

  test('no limit keeps the 7-day strip', async () => {
    await show({ max_days_ahead: null });
    expect(days()).toBe(7);
  });

  test('a window of 1 offers today and tomorrow only', async () => {
    await show({ max_days_ahead: 1 });
    expect(days()).toBe(2);
  });

  test('a doctor an older API served without the key keeps the week', async () => {
    await show({});
    expect(days()).toBe(7);
  });
});

describe('centre page', () => {
  const scanRow = (id: number, name: string, over: object = {}) => ({
    id, name, modality: 'MRI', price: 300, duration_minutes: 10, slots: ['09:00 AM'], days: [], available: true, ...over,
  });

  test('each test carries its own window', async () => {
    process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
    (API.post as jest.Mock).mockResolvedValue({});
    (API.get as jest.Mock).mockImplementation((url: string) =>
      url.startsWith('/hospitals/') ? Promise.resolve({ data: { id: 7, name: 'Vijaya Diagnostics', kind: 'SCAN_CENTER' } })
      : url === '/scans/' ? Promise.resolve({ data: [
        scanRow(1, 'MRI Brain', { max_days_ahead: 2 }),
        scanRow(2, 'X-Ray Chest'),
      ] })
      : Promise.resolve({ data: {} }));
    await act(async () => { r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location="/scan-center/7" />); });
    await settle();

    await press(/^MRI Brain$/);
    expect(days()).toBe(3);                         // today + 2

    await press(/^X-Ray Chest$/);
    expect(days()).toBe(7);                         // no limit: the week
  });
});
