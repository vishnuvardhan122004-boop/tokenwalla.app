/**
 * ROADMAP 78 (web repo): the doctor's "Before you come" note, which only the
 * payment-done screen showed, now shows on the My Bookings card, on its
 * downloaded ticket and on My QR (whose card is what its Download saves).
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import MyQR from '../app/(patient)/my-qr';
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
  free_reschedule: false, is_for_other: false, instructions: 'Come fasting.\nBring old reports.', paid_reschedules_left: 3, uses_pass: false, pass_role: null, ...over,
});

let r: any;
const mount = async (screen: 'my-qr' | 'my-bookings', over: object = {}) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url === '/bookings/my/' ? Promise.resolve({ data: [booking(over)] })
    : url.startsWith('/doctors/') ? Promise.resolve({ data: { running_delay_minutes: 0 } })
    : Promise.resolve({ data: [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      [screen]: screen === 'my-qr' ? MyQR : MyBookings,
    })} location={`/${screen}`} />);
  });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join('|');
const count = (s: string) => text().split(s).length - 1;
afterEach(() => act(() => { r?.unmount(); r = undefined; }));

test('My QR shows the note inside the card it saves', async () => {
  await mount('my-qr');
  expect(text()).toContain('Before you come');
  expect(text()).toContain('Come fasting.\nBring old reports.');
});

test('My QR shows no box when nothing was written', async () => {
  await mount('my-qr', { instructions: '' });
  expect(text()).not.toContain('Before you come');
});

test('My Bookings shows the note on an upcoming token, and the downloaded ticket carries it', async () => {
  jest.useFakeTimers();
  try {
    await mount('my-bookings');
    expect(count('Come fasting.')).toBe(1);
    const btn = r.root.findAll((n: any) => typeof n.props.onPress === 'function'
      && n.findAll((c: any) => c.type === 'Text' && [c.props.children].flat().includes('Download Ticket')).length)[0];
    await act(async () => { btn.props.onPress(); });
    expect(count('Come fasting.')).toBe(2);   // the card + the off-screen ticket being captured
  } finally { jest.useRealTimers(); }
});

test('My Bookings hides it on a finished visit', async () => {
  await mount('my-bookings', { status: 'COMPLETED' });
  expect(text()).not.toContain('Come fasting.');
});
