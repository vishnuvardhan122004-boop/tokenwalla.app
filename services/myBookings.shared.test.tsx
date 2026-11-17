/**
 * ROADMAP 77 (web repo): a token someone else booked for this number comes back
 * from `/bookings/my/?shared=1` with `is_shared: true`. It is view-only: no
 * Cancel, Reschedule or Receipt, since only the payer can act on it. Mirrors
 * src/componets/MyBookings.shared.test.js on the website.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import MyBookings from '../app/(patient)/my-bookings';
import { toLocalISODate } from '../utils/booking';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-qrcode-svg', () => () => null);
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn() }));
jest.mock('./reportFile', () => ({ openSharedDocument: jest.fn() }));
jest.mock('./notifications', () => ({ syncAppointmentReminders: jest.fn() }));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn(), post: jest.fn() },
  getUser: jest.fn(() => Promise.resolve({ id: 1, name: 'Patient', role: 'patient' })),
  apiMessage: (_e: unknown, f: string) => f,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const booking = (over: object) => ({
  id: 1, token: 'TW-001', status: 'CONFIRMED', date: toLocalISODate(new Date()), slot: '10:30 AM',
  amount: 100, doctor: 5, doctor_name: 'Rao', provider_kind: 'DOCTOR',
  hospital_name: 'City Hospital', queue_access: false, queue_position: null,
  free_reschedule: false, is_for_other: true, patient_name: 'Amma', user_name: 'Ravi', paid_reschedules_left: 3, uses_pass: false, pass_role: null, ...over,
});

let r: any;
const mount = async (over: object) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url === '/bookings/my/' ? Promise.resolve({ data: [booking(over)] })
    : url.startsWith('/doctors/') ? Promise.resolve({ data: { running_delay_minutes: 0 } })
    : Promise.resolve({ data: [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      'my-bookings': MyBookings,
    })} location="/my-bookings" />);
  });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join('');
afterEach(() => act(() => { r?.unmount(); r = undefined; }));

test('a token booked for you shows who booked it, with no Cancel, Reschedule or Receipt', async () => {
  await mount({ is_shared: true });
  expect(text()).toContain('Booked for you by Ravi');
  expect(text()).not.toContain('For Amma');
  expect(text()).not.toContain('Reschedule');
  expect(text()).not.toContain('Cancel');
  expect(text()).not.toContain('Receipt');
  // Opt-in: an older server or call without the param sees no shared rows.
  expect(API.get).toHaveBeenCalledWith('/bookings/my/', { params: { shared: 1 } });
});

test('the payer still gets Cancel, Reschedule and Receipt', async () => {
  await mount({ is_shared: false });
  expect(text()).toContain('For Amma');
  expect(text()).toContain('Reschedule');
  expect(text()).toContain('Cancel');
  expect(text()).toContain('Receipt');
});

test('on a leave day the shared viewer is told to ask the payer', async () => {
  await mount({ is_shared: true, free_reschedule: true });
  expect(text()).toContain('Ask');
  expect(text()).not.toContain('Reschedule below');
});
