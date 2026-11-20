/**
 * "Add walk-in" is back on the app's hospital queue behind the server's
 * WALK_IN_ENABLED: the queue response says whether it is on, and the button shows
 * only then. Off, or an older server that never sends the field, hides it.
 * Mirrors src/hospital/Hdashboard.walkInFlag.test.js on the website.
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

// One bookable doctor: the form hides itself when there is none.
const doctor = {
  id: 5, name: 'Rao', specialization: 'ENT', experience: 4, fee: 200, max_per_slot: 10,
  available: true, running_delay_minutes: 0, days: ['Mon'], slots: ['09:00 AM'],
};

let r: any;
const mount = async (queueExtra: object) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City Hospital' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/doctors/?hospital=') ? Promise.resolve({ data: [doctor] })
    : url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [], ...queueExtra } })
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
const addWalkIn = () => r.root.findAll((n: any) => n.type === 'Text' && /Add walk-in/.test(textsOf(n)));
const loaded = () => {
  const urls = (API.get as jest.Mock).mock.calls.map((c) => c[0]);
  expect(urls.some((u: string) => u.startsWith('/doctors/?hospital='))).toBe(true);
  expect(urls.some((u: string) => u.startsWith('/bookings/queue/'))).toBe(true);
};

beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await act(async () => r.unmount()); await AsyncStorage.clear(); });

test('flag on: the queue shows Add walk-in', async () => {
  await mount({ walk_in_enabled: true });
  expect(addWalkIn().length).toBeGreaterThan(0);
});

test('flag off: no Add walk-in', async () => {
  await mount({ walk_in_enabled: false });
  loaded();
  expect(addWalkIn()).toHaveLength(0);
});

test('an older server without the field: no Add walk-in', async () => {
  await mount({});
  loaded();
  expect(addWalkIn()).toHaveLength(0);
});
