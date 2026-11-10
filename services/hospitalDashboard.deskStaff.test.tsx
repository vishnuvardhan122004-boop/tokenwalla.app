/**
 * The "who is at the desk?" bar on the REAL hospital dashboard (web ROADMAP 69,
 * mirrors src/hospital/Hdashboard.deskStaff.test.js): hidden without extra staff
 * or against a server that predates them, a PIN sign-in hands a signed token to
 * Complete, nobody signed in sends exactly what it always did, and a refused
 * token is dropped back to the main desk.
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
const IN_PROGRESS = {
  id: 5, token: 'TW-5', status: 'IN_PROGRESS', date: TODAY, slot: '09:00 AM',
  doctor_name: 'Dr. Kumar', user_name: 'Ravi', user_mobile: '9800000001',
  patient_name: 'Ravi', patient_mobile: '9800000001', is_for_other: false,
};

let r: any;
const mount = async (staff: unknown) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [IN_PROGRESS], completed: [] } })
    : url === '/hospitals/1/staff/'
      ? (staff instanceof Error ? Promise.reject(staff) : Promise.resolve({ data: staff }))
      : Promise.resolve({ data: [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join(' ');
const byLabel = (label: string) => r.root.findAll((n: any) =>
  n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const done = () => r.root.findAll((n: any) =>
  typeof n.props?.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Mark ')
  && typeof n.props.onPress === 'function')[0];
const optionNamed = (label: string) => r.root.findAll((n: any) =>
  typeof n.props?.onPress === 'function'
  && n.findAll((c: any) => c.type === 'Text' && [c.props.children].flat().join('') === label).length > 0)[0];
afterEach(() => act(() => r.unmount()));

const signInAsSita = async () => {
  await act(async () => { byLabel('Change').props.onPress(); });
  await act(async () => { optionNamed('Sita').props.onPress(); });
  const pin = r.root.findAll((n: any) => n.type === 'TextInput' && n.props.placeholder === '4-digit PIN')[0];
  await act(async () => { pin.props.onChangeText('1234'); });
  await act(async () => { await optionNamed('Start').props.onPress(); });
};

const SITA = [{ id: 8, name: 'Sita', active: true }, { id: 9, name: 'Old', active: false }];

test('no extra staff shows only "+ Add desk staff"; a server without the endpoint shows nothing', async () => {
  await mount([]);
  expect(text()).not.toContain('At the desk');
  expect(byLabel('Add desk staff')).toBeTruthy();
  await act(() => r.unmount());
  await mount(new Error('404'));
  expect(text()).not.toContain('At the desk');
  expect(byLabel('Add desk staff')).toBeUndefined();
});

test('with nobody signed in, Done sends exactly what it always did', async () => {
  await mount(SITA);
  expect(text()).toContain('Main desk');
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => { done().props.onPress(); });
  expect(API.patch).toHaveBeenCalledWith('/bookings/complete/5/');
});

test('after a PIN sign-in, Done carries the token and inactive people are not offered', async () => {
  await mount(SITA);
  (API.post as jest.Mock).mockResolvedValue({ data: { token: 'tok-sita', name: 'Sita' } });
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => { byLabel('Change').props.onPress(); });
  expect(text()).not.toContain('Old');
  await act(async () => { optionNamed('Sita').props.onPress(); });
  const pin = r.root.findAll((n: any) => n.type === 'TextInput' && n.props.placeholder === '4-digit PIN')[0];
  await act(async () => { pin.props.onChangeText('1234'); });
  await act(async () => { await optionNamed('Start').props.onPress(); });
  expect(API.post).toHaveBeenCalledWith('/hospitals/1/staff/8/pin/', { pin: '1234' });
  expect(text()).toContain('Sita');
  await act(async () => { done().props.onPress(); });
  expect(API.patch).toHaveBeenCalledWith('/bookings/complete/5/', { staff_token: 'tok-sita' });
});

test('a refused token is dropped: the bar says Main desk and the next Done sends no token', async () => {
  await mount(SITA);
  (API.post as jest.Mock).mockResolvedValue({ data: { token: 'tok-sita', name: 'Sita' } });
  await signInAsSita();
  (API.patch as jest.Mock).mockRejectedValueOnce({ response: { data: { code: 'staff_token_invalid' } } });
  await act(async () => { done().props.onPress(); });
  expect(text()).toContain('Main desk');
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => { done().props.onPress(); });
  expect(API.patch).toHaveBeenLastCalledWith('/bookings/complete/5/');
});

test('with staff the bar also links to Manage staff', async () => {
  await mount(SITA);
  expect(byLabel('Manage staff')).toBeTruthy();
});
