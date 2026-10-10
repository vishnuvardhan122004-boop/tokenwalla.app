/**
 * The hospital's live queue on the app — the same two defects the web audit
 * found in Hdashboard.js (HD-3, HD-4), on the REAL dashboard screen.
 *   - A booking made for someone else showed the ACCOUNT holder's name.
 *   - Hold is a server toggle; a double tap reversed it. The screen now says
 *     which way, and one request per patient is in flight at a time.
 * Also guards the render itself: the first version of this change made
 * nameOf() call itself, which only `tsc` caught — a render would have died.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
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

const pad = (n: number) => String(n).padStart(2, '0');
const d = new Date();
const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WAITING = {
  id: 5, token: 'TW-5', status: 'CONFIRMED', date: TODAY, slot: '09:00 AM',
  doctor_name: 'Dr. Kumar', user_name: 'Ravi', user_mobile: '9800000001',
  patient_name: 'Lakshmi', patient_mobile: '9800000002', is_for_other: true,
};

let r: any;
const mount = async () => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [WAITING], onHold: [], inProgress: [], completed: [] } })
      : Promise.resolve({ data: [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
};
// Every string rendered by a host <Text> (the tree has circular props, so no
// JSON.stringify of the whole thing).
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join(' ');
afterEach(() => act(() => r.unmount()));

test('the queue names the patient the visit is for, and who booked it', async () => {
  await mount();
  expect(text()).toContain('Lakshmi');
  expect(text()).toContain('Booked by ');
  expect(text()).toContain('9800000002');
});

test('Hold says which way, and a double tap sends one request', async () => {
  await mount();
  let release: (v: unknown) => void = () => {};
  (API.patch as jest.Mock).mockImplementation(() => new Promise(res => { release = res; }));
  const hold = r.root.findAll((n: any) =>
    typeof n.props?.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Hold ')
    && typeof n.props.onPress === 'function')[0];
  await act(async () => { hold.props.onPress(); hold.props.onPress(); });
  expect(API.patch).toHaveBeenCalledTimes(1);
  expect(API.patch).toHaveBeenCalledWith('/bookings/hold/5/', { action: 'hold' });
  await act(async () => { release({ data: {} }); });
});
