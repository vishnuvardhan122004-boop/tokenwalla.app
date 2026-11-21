/**
 * ROADMAP 79 (web repo). The queue panel ("You're next") is for the booking's
 * own day only: a token for next week that is first in its slot must not send
 * the patient to the clinic today. A token a shop booked (`booked_by_shop_name`)
 * tells the customer to ask the shop to cancel, in place of a Cancel button the
 * server refuses. Mirrors src/componets/MyBookings.queueShop.test.js.
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

const nextWeek = () => { const d = new Date(); d.setDate(d.getDate() + 7); return toLocalISODate(d); };

const booking = (over: object) => ({
  id: 1, token: 'TW-001', status: 'CONFIRMED', date: toLocalISODate(new Date()), slot: '10:30 AM',
  amount: 20, doctor: 5, doctor_name: 'Rao', provider_kind: 'DOCTOR',
  hospital_name: 'City Hospital', queue_access: true, queue_position: 1,
  free_reschedule: false, is_for_other: false, paid_reschedules_left: 3, uses_pass: false, pass_role: null,
  booked_by_shop_name: null, ...over,
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

test("today's token first in its slot shows its queue position", async () => {
  await mount({});
  expect(text()).toContain('Your queue position');
});

test('a token for next week shows no queue position', async () => {
  await mount({ date: nextWeek() });
  expect(text()).not.toContain('Your queue position');
});

test('a shop booking says ask the shop, with no Cancel button', async () => {
  await mount({ booked_by_shop_name: 'Sri Xerox' });
  expect(text()).toContain('Booked at Sri Xerox. Ask the shop to cancel it.');
  expect(text()).not.toContain('Part refund');
});

test('a patient booking still has its Cancel button, which never promises a refund', async () => {
  await mount({});
  expect(text()).toContain('Part refund if 2h+ before');
  expect(text()).not.toContain('Refund in 5');
});

// ROADMAP 83 (web repo): "Head to the clinic" waits until the last 30 minutes.
// The clock is pinned (only Date is faked), so this never depends on the time of day.
describe('first in line on the day', () => {
  beforeEach(() => jest.useFakeTimers({
    now: new Date(2026, 10, 20, 8, 0),
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'],
  }));
  afterEach(() => jest.useRealTimers());

  test('hours before the slot it gives the slot time, not "head to the clinic"', async () => {
    await mount({ date: '2026-11-20', slot: '10:30 AM' });
    expect(text()).toContain("You're first in line. Your slot is at 10:30 AM.");
    expect(text()).not.toContain('Head to the clinic');
  });

  test('inside the last 30 minutes it says head to the clinic', async () => {
    await mount({ date: '2026-11-20', slot: '08:15 AM' });
    expect(text()).toContain("You're next! Head to the clinic.");
  });
});
