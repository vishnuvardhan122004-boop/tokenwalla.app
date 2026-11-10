/**
 * "Who handled this patient?" on the QR scanner (web ROADMAP 71, mirrors
 * src/hospital/QRScanner.test.js): with desk staff, auto-mark and the manual
 * button open the picker instead of posting, and the pick rides the scan as
 * staff_id. No desk staff = the scan sends exactly what it always did.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import Scanner from '../app/(hospital)/(tabs)/scanner';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('@react-native-async-storage/async-storage/jest/async-storage-mock');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  apiMessage: (_e: unknown, f: string) => f,
  logoutUser: jest.fn(),
  onLogout: jest.fn(),
  logoutInProgress: () => false,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const booking = (date: string, earns = true) => ({
  valid: true, already_done: false,
  booking: { token: 'TW-1', status: 'CONFIRMED', date, slot: '09:00 AM', patient_name: 'Ravi', earns_incentive: earns },
});

let r: any;
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const mount = async (staff: unknown[], earns = true) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url === '/hospitals/1/staff/' ? Promise.resolve({ data: staff })
    : Promise.resolve({ data: booking(ymd(new Date()), earns) }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      scanner: Scanner,
    })} location="/scanner" />);
  });
  await flush();
};
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string')
  .join(' ');
const scan = async () => {
  const input = () => r.root.findAll((n: any) => n.type === 'TextInput')[0];
  await act(async () => { input().props.onChangeText('TW-1'); });
  await act(async () => { input().props.onSubmitEditing(); });
  await flush();
};

const byLabel = (label: string) => r.root.findAll((n: any) =>
  n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const SITA = [{ id: 8, name: 'Sita', active: true }];

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });
afterEach(() => act(() => r.unmount()));

test('with no desk staff the scan posts with no body, as before', async () => {
  (API.post as jest.Mock).mockResolvedValue({ data: { success: true } });
  await mount([]);
  await scan();
  expect(API.post).toHaveBeenCalledWith('/bookings/scan/TW-1/');
  expect(byLabel('Cancel')).toBeUndefined();
});

test('a booking that earns nothing is marked straight away with no picker', async () => {
  (API.post as jest.Mock).mockResolvedValue({ data: { success: true } });
  await mount(SITA, false);
  await scan();
  expect(API.post).toHaveBeenCalledWith('/bookings/scan/TW-1/');
  expect(text()).not.toContain('Who handled');
});

test('with staff, auto-mark waits for the pick; one tap sends it, remembers it and shows the day', async () => {
  (API.post as jest.Mock).mockResolvedValue({ data: { success: true, staff_today: { name: 'Sita', count: 5, amount: 35 } } });
  await mount(SITA);
  await scan();
  expect(API.post).not.toHaveBeenCalled();
  expect(text()).toMatch(/Who handled\s+Ravi/);
  await act(async () => { byLabel('Sita').props.onPress(); });
  await flush();
  expect(API.post).toHaveBeenCalledWith('/bookings/scan/TW-1/', { staff_id: 8 });
  expect(text()).toContain('Sita +₹7 · ₹35 today');
  expect(await AsyncStorage.getItem('tw_lastpick_1')).toBe('8');
});

test('the last pick is pre-selected, and Main desk sends null', async () => {
  await AsyncStorage.setItem('tw_lastpick_1', '8');
  (API.post as jest.Mock).mockResolvedValue({ data: { success: true } });
  await mount(SITA);
  await scan();
  await flush();
  expect(byLabel('Sita').props.accessibilityState).toEqual({ selected: true });
  await act(async () => { byLabel('Main desk').props.onPress(); });
  await flush();
  expect(API.post).toHaveBeenCalledWith('/bookings/scan/TW-1/', { staff_id: null });
});

test('Cancel marks nothing; the manual button opens the picker again', async () => {
  await mount(SITA);
  await scan();
  await act(async () => { byLabel('Cancel').props.onPress(); });
  expect(API.post).not.toHaveBeenCalled();
  expect(text()).not.toContain('Who handled');
  const manual = r.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && n.findAll((c: any) => c.type === 'Text' && [c.props.children].flat().join('') === 'Mark as In Consultation').length)[0];
  await act(async () => { manual.props.onPress(); });
  expect(text()).toMatch(/Who handled\s+Ravi/);
});

// Web ROADMAP 71c: the payee's name, and a Change for 10 s after a pick.
const mountWithId = async () => {
  await mount(SITA);
  const b = booking(ymd(new Date()));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url === '/hospitals/1/staff/' ? Promise.resolve({ data: SITA })
    : Promise.resolve({ data: { ...b, main_desk_name: 'Ravi K', booking: { ...b.booking, id: 11 } } }));
};

test('the picker names the payee from the scan response, and Change PATCHes the new person', async () => {
  const setT = jest.spyOn(global, 'setTimeout');
  await mountWithId();
  await scan();
  expect(byLabel('Ravi K (main desk)')).toBeTruthy();
  (API.post as jest.Mock).mockResolvedValue({ data: { staff_today: { name: 'Sita', count: 1, amount: 7 } } });
  await act(async () => { byLabel('Sita').props.onPress(); });
  await flush();
  expect(text()).toContain('Sita +₹7 · ₹7 today');
  expect(setT).toHaveBeenCalledWith(expect.any(Function), 10000);
  await act(async () => { byLabel('Change who handled it').props.onPress(); });
  await flush();
  expect(byLabel('Sita').props.accessibilityState).toEqual({ selected: true });
  (API.patch as jest.Mock).mockResolvedValue({ data: { staff_today: { name: 'Ravi K', count: 1, amount: 7 } } });
  await act(async () => { byLabel('Ravi K (main desk)').props.onPress(); });
  await flush();
  expect(API.patch).toHaveBeenCalledWith('/bookings/handled-by/11/', { staff_id: null });
  expect(text()).toContain('Ravi K +₹7 · ₹7 today');
  setT.mockRestore();
});

test('a 409 on Change says admin must move it and drops the button', async () => {
  await mountWithId();
  await scan();
  (API.post as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => { byLabel('Sita').props.onPress(); });
  await flush();
  await act(async () => { byLabel('Change who handled it').props.onPress(); });
  (API.patch as jest.Mock).mockRejectedValue({ response: { status: 409, data: {} } });
  await act(async () => { byLabel('Sita').props.onPress(); });
  await flush();
  expect(text()).toContain('Ask admin to move it');
  expect(byLabel('Change who handled it')).toBeUndefined();
});
