/**
 * The way into the poster on the app's REAL hospital dashboard: a Poster button on
 * each doctor card and one on a centre's tests list. A button wired to the wrong id
 * puts somebody else's doctor on a clinic's wall, so what the QR holds is the thing
 * to pin. Mirrors src/hospital/Hdashboard.poster.test.js on the website.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import { I18nProvider } from './i18n';
import Dashboard from '../app/(hospital)/(tabs)/dashboard';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('@react-native-async-storage/async-storage/jest/async-storage-mock');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  default: (p: { value: string }) => require('react').createElement('QR', { value: p.value }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('./notifications', () => ({
  registerPushToken: jest.fn(), notifyHospitalNewBooking: jest.fn(),
}));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn() },
  apiMessage: (_e: unknown, f: string) => f,
  logoutUser: jest.fn(),
  onLogout: jest.fn(),
  logoutInProgress: () => false,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const doctor = (id: number, name: string) => ({
  id, name, specialization: 'ENT', experience: 4, fee: 200, max_per_slot: 10,
  available: true, running_delay_minutes: 0, days: ['Mon'], slots: ['09:00 AM'],
});

let r: any;
const mount = async (hospital: object, { doctors = [] as object[], scans = [] as object[] } = {}) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/doctors/?hospital=') ? Promise.resolve({ data: doctors })
    : url === '/scans/' ? Promise.resolve({ data: scans })
    : url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [] } })
      : Promise.resolve({ data: [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const pressable = (n: any) => { let p = n; while (p && typeof p.props.onPress !== 'function') p = p.parent; return p; };
const press = async (re: RegExp, i = 0) => {
  const p = pressable(texts(re)[i]);
  await act(async () => { p.props.onPress(); });
  for (let k = 0; k < 3; k++) await act(async () => { await Promise.resolve(); });
};
const pressLabel = async (label: string) => {
  const p = r.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  await act(async () => { p.props.onPress(); });
  for (let k = 0; k < 3; k++) await act(async () => { await Promise.resolve(); });
};
const qrValues = () => r.root.findAll((n: any) => n.type === 'QR').map((n: any) => n.props.value);

beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await act(async () => r.unmount()); await AsyncStorage.clear(); });

test("each doctor card has a Poster button, and it opens THAT doctor's poster", async () => {
  await mount({ id: 1, name: 'City Hospital', city: 'Hindupur' }, { doctors: [doctor(7, 'Kumar'), doctor(9, 'Rao')] });
  await press(/^Doctors/);
  expect(texts(/^Poster$/)).toHaveLength(2);

  await press(/^Poster$/, 1);
  expect(qrValues()).toEqual(['https://www.tokenwalla.com/doctor/9?src=poster']);

  await pressLabel('Close');
  expect(qrValues()).toEqual([]);
});

test("a centre's tests list opens the centre's poster", async () => {
  await mount({ id: 4, name: 'Lotus Lab', city: 'Hindupur', kind: 'BLOOD_CENTER' }, {
    scans: [{
      id: 1, name: 'Lipid Profile', modality: 'Blood Test', price: 400, duration_minutes: 15,
      slots: ['10:00 AM'], days: ['Mon'], available: true, payment_collection_mode: 'SERVICE_ONLY',
    }],
  });
  await press(/^Tests/);
  await press(/^Poster$/);
  expect(qrValues()).toEqual(['https://www.tokenwalla.com/scan-center/4?src=poster']);
});
