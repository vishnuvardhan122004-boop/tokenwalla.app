/**
 * The patient's "doctor is running late" banner on the REAL my-bookings screen:
 * the delay and the reason the staff gave both come from GET /doctors/<id>/
 * (bookings carry only the doctor's id). Mirrors src/componets/MyBookings.delay
 * .test.js on the website.
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

const booking = () => ({
  id: 1, token: 'TW-001', status: 'CONFIRMED', date: toLocalISODate(new Date()), slot: '10:30 AM',
  amount: 100, doctor: 5, doctor_name: 'Rao', provider_kind: 'DOCTOR',
  hospital_name: 'City Hospital', queue_access: false, queue_position: null,
  free_reschedule: false, is_for_other: false, uses_pass: false, pass_role: null,
});

let r: any;
const mount = async (doctorRecord: object) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url === '/bookings/my/' ? Promise.resolve({ data: [booking()] })
    : url.startsWith('/doctors/') ? Promise.resolve({ data: doctorRecord })
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
afterEach(() => act(() => r.unmount()));

test('the banner names the reason the staff gave', async () => {
  await mount({ running_delay_minutes: 90, delay_reason: 'in surgery' });
  expect(text()).toContain('Dr. Rao is running ~1h 30m late (in surgery). Adjusted time:');
});

test('with no reason the banner reads as before', async () => {
  await mount({ running_delay_minutes: 90, delay_reason: '' });
  expect(text()).toContain('Dr. Rao is running ~1h 30m late. Adjusted time:');
});

test('a backend that predates delay_reason still gets a clean banner', async () => {
  await mount({ running_delay_minutes: 15 });
  expect(text()).toContain('Dr. Rao is running ~15m late. Adjusted time:');
  expect(text()).not.toContain('undefined');
});

test('no delay, no banner', async () => {
  await mount({ running_delay_minutes: 0, delay_reason: '' });
  expect(text()).not.toContain('is running');
});
