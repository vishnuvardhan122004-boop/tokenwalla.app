/**
 * ROADMAP 86: a hospital sets a priority fee, the patient pays it + TokenWalla's
 * 5% + GST. The doctor form says what the patient pays for the SAVED fee, from
 * the server's own bills, so the hospital is not surprised. The app mirror of the
 * website's Hdashboard.priorityPrice.test.js.
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

const doctor = (over: object = {}) => ({
  id: 3, name: 'Rao', specialization: 'Cardiology', mobile: '9876543210', experience: 5, fee: 300,
  max_per_slot: 10, available: true, slots: ['10:00 AM'], days: ['Mon'],
  priority_fee: 50, priority_per_slot: 2,
  fee_breakdown: { final_amount: '26.00' }, priority_fee_breakdown: { final_amount: '88.00' },
  ...over,
});

let r: any;
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const press = async (label: RegExp) => {
  let p = r.root.findAll((n: any) => n.type === 'Text' && label.test(textsOf(n)))[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
};
const price = () => r.root.findAll((n: any) => n.type === 'Text' && /The patient pays ₹/.test(textsOf(n)));
const feeBox = () => r.root.findAll((n: any) =>
  n.props?.placeholder === '0 = off' && typeof n.props.onChangeText === 'function')[0];

const open = async (d: object) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [] } })
      : Promise.resolve({ data: url.startsWith('/doctors/') ? [d] : [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  await press(/^Doctors 1$/);
  await press(/^Edit$/);
};
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

test('says what the hospital gets and what the patient pays for the saved fee', async () => {
  await open(doctor());
  expect(price().map(textsOf)).toEqual(['You get ₹50. The patient pays ₹62.']);
  expect(r.root.findAll((n: any) => n.type === 'Text'
    && /TokenWalla's 5% \+ GST/.test(textsOf(n))).length).toBeGreaterThan(0);
});

test('hides the figure once the fee is changed, until it is saved', async () => {
  await open(doctor());
  await act(async () => { feeBox().props.onChangeText('100'); });
  expect(price()).toHaveLength(0);
});

test('no figure when priority is off or the server sends no price', async () => {
  await open(doctor({ priority_fee: 0, priority_fee_breakdown: null }));
  expect(price()).toHaveLength(0);
});
