/**
 * ROADMAP 61: "On leave…" on the app's REAL hospital dashboard: one closed day
 * with an optional reason, the count of patients told, and a chip with a × that
 * reopens it. Mirrors src/hospital/Hdashboard.leave.test.js on the website; the
 * payloads are the backend's POST/DELETE /doctors/<id>/leave/ contract.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import Dashboard from '../app/(hospital)/(tabs)/dashboard';
import { toLocalISODate } from '../utils/booking';

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
  id: 7, name: 'Kumar', specialization: 'ENT', experience: 4, fee: 200,
  max_per_slot: 10, available: true, running_delay_minutes: 0,
  days: ['Mon'], slots: ['09:00 AM'], ...over,
});
const DAY = toLocalISODate(new Date(Date.now() + 2 * 86400000));

let r: any;
const mount = async (docs: object | object[]) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/doctors/?hospital=') ? Promise.resolve({ data: [docs].flat() })
    : url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [] } })
      : Promise.resolve({ data: [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  let tab = r.root.findAll((n: any) => n.type === 'Text'
    && [n.props.children].flat(Infinity).some((c: unknown) => typeof c === 'string' && c.startsWith('Doctors')))[0];
  while (tab && typeof tab.props.onPress !== 'function') tab = tab.parent;
  await act(async () => { tab.props.onPress(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
};
const control = (label: string) => r.root.findAll((n: any) =>
  n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = async (label: string) => {
  await act(async () => { control(label).props.onPress(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
};
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('|');
const typeReason = async (v: string) => {
  const input = r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Leave reason' && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText(v); });
};
const saveDisabled = () => !!control('Save leave').props.disabled;

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { alert.mockRestore(); return act(() => r.unmount()); });

test('Save posts the day and reason, reports the count, and the chip appears', async () => {
  await mount(doctor());
  (API.post as jest.Mock).mockResolvedValue({ data: { date: DAY, reason: 'Out of station', affected: 3 } });

  await press('On leave 7');
  expect(text()).toContain('Patients booked that day get a WhatsApp + app alert and a free reschedule.');
  expect(saveDisabled()).toBe(true);                       // no day chosen yet
  await press(`Leave on ${DAY}`);
  await typeReason('Out of station');
  expect(text()).toContain('14|/|120');
  await press('Save leave');

  expect(API.post).toHaveBeenCalledWith('/doctors/7/leave/', { date: DAY, reason: 'Out of station' });
  expect(alert).toHaveBeenCalledWith('Updated', '3 patients notified');
  expect(control(`Reopen ${DAY}`)).toBeTruthy();
});

test('one patient reads singular; nobody booked says so', async () => {
  await mount(doctor());
  (API.post as jest.Mock)
    .mockResolvedValueOnce({ data: { date: DAY, reason: '', affected: 1 } })
    .mockResolvedValueOnce({ data: { date: DAY, reason: '', affected: 0 } });
  await press('On leave 7'); await press(`Leave on ${DAY}`); await press('Save leave');
  expect(alert).toHaveBeenLastCalledWith('Updated', '1 patient notified');
  await press('On leave 7'); await press(`Leave on ${DAY}`); await press('Save leave');
  expect(alert).toHaveBeenLastCalledWith('Updated', 'Leave saved. No patients were booked that day.');
});

test('a reason over 120 characters cannot be saved', async () => {
  await mount(doctor());
  await press('On leave 7'); await press(`Leave on ${DAY}`);
  await typeReason('x'.repeat(120));
  expect(saveDisabled()).toBe(false);
  await typeReason('x'.repeat(121));
  expect(text()).toContain('121|/|120');
  expect(saveDisabled()).toBe(true);
});

test("the server's refusal is shown and the modal stays open", async () => {
  await mount(doctor());
  (API.post as jest.Mock).mockRejectedValue({ response: { data: { message: 'That date has already passed.' } } });
  await press('On leave 7'); await press(`Leave on ${DAY}`); await press('Save leave');
  expect(alert).toHaveBeenCalledWith('Error', 'That date has already passed.');
  expect(control('Save leave')).toBeTruthy();
});

test('the day choices stop at the doctor\'s booking window', async () => {
  await mount(doctor({ max_days_ahead: 2 }));
  await press('On leave 7');
  const chips = r.root.findAll((n: any) => /^Leave on /.test(n.props?.accessibilityLabel || '') && typeof n.props.onPress === 'function' && typeof n.type !== 'string');
  expect(new Set(chips.map((c: any) => c.props.accessibilityLabel)).size).toBe(3);                           // today, +1, +2
});

test('upcoming leave days show as chips and the x reopens one', async () => {
  await mount(doctor({ leave_dates: [{ date: DAY, reason: 'Conference' }] }));
  (API.delete as jest.Mock).mockResolvedValue({ status: 204 });
  expect(text()).toContain(`${DAY} · Conference`);

  await press(`Reopen ${DAY}`);

  expect(API.delete).toHaveBeenCalledWith('/doctors/7/leave/', { params: { date: DAY } });
  expect(alert).toHaveBeenCalledWith('Updated', 'Day reopened.');
  expect(text()).not.toContain('Conference');
});

test('a backend without leave_dates shows no chips', async () => {
  await mount(doctor());
  expect(control('On leave 7')).toBeTruthy();
  expect(text()).not.toContain('undefined');
  expect(r.root.findAll((n: any) => /^Reopen /.test(n.props?.accessibilityLabel || ''))).toHaveLength(0);
});

// RN's maxLength truncates a paste invisibly before onChangeText; jest cannot see
// that, so the guard is the source: the reason input must never carry one.
test('the reason input has no maxLength', () => {
  const src = readFileSync(require.resolve('../app/(hospital)/(tabs)/dashboard.tsx'), 'utf8');
  const input = src.match(/<TextInput[^>]*accessibilityLabel="Leave reason"[\s\S]*?\/>/)![0];
  expect(input).not.toMatch(/maxLength/);
});
