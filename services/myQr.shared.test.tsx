/**
 * ROADMAP 77 (web repo): on My QR, a token someone else booked for this number
 * names who paid. "You have paid..." was wrong for the family member, who paid
 * nothing.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import MyQR from '../app/(patient)/my-qr';
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
      'my-qr': MyQR,
    })} location="/my-qr" />);
  });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join('');
afterEach(() => act(() => { r?.unmount(); r = undefined; }));

test('a shared token says the payer paid, not you', async () => {
  await mount({ is_shared: true });
  expect(text()).toContain('Ravi paid only for the service');
  expect(text()).not.toContain('You have paid');
});

test('your own token still says you paid', async () => {
  await mount({ is_shared: false });
  expect(text()).toContain('You have paid only for the service');
});
