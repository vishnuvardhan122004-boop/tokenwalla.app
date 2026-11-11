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

const EMPTY = { waiting: [], onHold: [], inProgress: [], completed: [] };
const booking = (id: number, name: string, status: string) => ({
  id, token: `TW-${id}`, status, date: TODAY, slot: '10:00 AM',
  doctor_name: 'Dr. Kumar', user_name: name, user_mobile: '9800000003',
  patient_name: name, patient_mobile: '9800000003', is_for_other: false,
});

let r: any;
const mount = async (queue: object = { ...EMPTY, waiting: [WAITING] }) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: queue })
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

// ── Layout (website ROADMAP item 53, slice 1: the same changes as Hdashboard.js) ──
const control = (label: string) => r.root.findAll((n: any) =>
  n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
// A heading like "Completed (1)" renders as separate children; compare without spaces.
const flat = () => text().replace(/\s+/g, '');

test('the count tiles are gone, In Progress hides when empty, Completed keeps its heading', async () => {
  await mount();
  const t = text();
  expect(t).toContain('Lakshmi');
  expect(t).not.toContain('Total');
  expect(flat()).not.toContain('InProgress(');
  expect(flat()).toContain('Completed(0)');
  expect(t).not.toContain('No one in progress');
  expect(t).not.toContain('None completed yet');
});

test('Waiting still says so when nobody is waiting', async () => {
  await mount({ ...EMPTY });
  expect(text()).toContain('No patients waiting');
});

test('Completed stays closed, with its count, until its heading is tapped', async () => {
  await mount({ ...EMPTY, completed: [booking(9, 'Meena', 'COMPLETED')] });
  expect(flat()).toContain('Completed(1)');
  expect(text()).not.toContain('Meena');

  await act(async () => { control('Completed, 1 patients').props.onPress(); });
  expect(text()).toContain('Meena');
  expect(text()).toContain('Share');

  await act(async () => { control('Completed, 1 patients').props.onPress(); });
  expect(text()).not.toContain('Meena');
});

test('with nobody completed the heading is inert', async () => {
  await mount();
  expect(control('Completed, 0 patients').props.disabled).toBe(true);
});

test('In Progress and On Hold list their patients with the same actions as before', async () => {
  await mount({
    ...EMPTY,
    inProgress: [booking(11, 'Geeta', 'IN_PROGRESS')],
    onHold: [booking(12, 'Hari', 'ON_HOLD')],
  });
  const t = text();
  expect(t).toContain('Geeta');
  expect(t).toContain('Done ✓');
  expect(flat()).toContain('OnHold(1)');
  expect(t).toContain('Hari');
  expect(t).toContain('Resume');
});

test('In Progress sits above Waiting, so Done is not under a long queue', async () => {
  await mount({
    ...EMPTY,
    waiting: [booking(13, 'Lakshmi', 'CONFIRMED')],
    inProgress: [booking(11, 'Geeta', 'IN_PROGRESS')],
  });
  const f = flat();
  expect(f.indexOf('InProgress(1)')).toBeGreaterThan(-1);
  expect(f.indexOf('InProgress(1)')).toBeLessThan(f.indexOf('Waiting(1)'));
});
