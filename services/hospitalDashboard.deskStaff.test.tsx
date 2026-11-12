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
  earns_incentive: true, staff_picked: false,
};

let r: any;
const mount = async (staff: unknown, inProgress: unknown[] = [IN_PROGRESS], mainName = '') => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress, completed: [], main_desk_name: mainName } })
    : url === '/hospitals/1/staff/'
      ? (staff instanceof Error ? Promise.reject(staff) : Promise.resolve({ data: staff }))
      : Promise.resolve({ data: [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); });
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
beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });
afterEach(() => act(() => r.unmount()));

const signInAsSita = async () => {
  await act(async () => { byLabel('Sign in with PIN').props.onPress(); });
  await act(async () => { optionNamed('Sita').props.onPress(); });
  const pin = r.root.findAll((n: any) => n.type === 'TextInput' && n.props.placeholder === '4-digit PIN')[0];
  await act(async () => { pin.props.onChangeText('1234'); });
  await act(async () => { await optionNamed('Start').props.onPress(); });
};

const SITA = [{ id: 8, name: 'Sita', active: true }, { id: 9, name: 'Old', active: false }];

test('no extra staff shows only "+ Add desk staff"; a server without the endpoint shows nothing', async () => {
  await mount([]);
  expect(text()).not.toContain('My earnings:');
  expect(byLabel('Add desk staff')).toBeTruthy();
  await act(() => r.unmount());
  await mount(new Error('404'));
  expect(text()).not.toContain('My earnings:');
  expect(byLabel('Add desk staff')).toBeUndefined();
});

test('with no desk staff, Done sends exactly what it always did and asks nothing', async () => {
  await mount([]);
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => { done().props.onPress(); });
  expect(API.patch).toHaveBeenCalledWith('/bookings/complete/5/');
  expect(byLabel('Cancel')).toBeUndefined();
});

// ROADMAP 71: Done asks who handled the patient (no PIN) and sends staff_id.
test('with staff, Done asks who handled it; inactive people are not offered', async () => {
  await mount(SITA);
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => { done().props.onPress(); });
  expect(API.patch).not.toHaveBeenCalled();
  expect(text()).toMatch(/Who handled\s+Ravi/);
  expect(byLabel('Old')).toBeUndefined();
  (API.patch as jest.Mock).mockResolvedValue({ data: { staff_today: { name: 'Sita', count: 2, amount: 14 } } });
  await act(async () => { await byLabel('Sita').props.onPress(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
  expect(API.patch).toHaveBeenCalledWith('/bookings/complete/5/', { staff_id: 8 });
  expect(text()).not.toContain('Who handled');
  expect(text()).toContain('Sita +₹7 · 2 today · ₹14');
});

test('a booking already picked at the scan, or one that earns nothing, completes with no picker', async () => {
  for (const flags of [{ staff_picked: true }, { earns_incentive: false }]) {
    await mount(SITA, [{ ...IN_PROGRESS, ...flags }]);
    (API.patch as jest.Mock).mockClear();
    (API.patch as jest.Mock).mockResolvedValue({ data: {} });
    await act(async () => { done().props.onPress(); });
    expect(API.patch).toHaveBeenCalledWith('/bookings/complete/5/');
    expect(text()).not.toContain('Who handled');
    await act(() => r.unmount());
  }
});

test('Main desk sends null; Cancel sends nothing', async () => {
  await mount(SITA);
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => { done().props.onPress(); });
  await act(async () => { byLabel('Cancel').props.onPress(); });
  expect(API.patch).not.toHaveBeenCalled();
  await act(async () => { done().props.onPress(); });
  await act(async () => { await byLabel('Main desk').props.onPress(); });
  expect(API.patch).toHaveBeenCalledWith('/bookings/complete/5/', { staff_id: null });
});

test('the person picked at the scan is marked and the card says so', async () => {
  const scanned = { ...IN_PROGRESS, completed_by_staff_id: 8, completed_by_name: 'Sita' };
  await mount(SITA, [scanned]);
  expect(text()).toMatch(/Handled by\s+Sita/);
  await act(async () => { done().props.onPress(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
  expect(byLabel('Sita').props.accessibilityState).toEqual({ selected: true });
});

test('the PIN bar is only for My earnings: it never says the desk person gets the credit', async () => {
  await mount(SITA);
  expect(text()).toContain('not signed in');
  expect(text()).not.toContain('credited to this person');
  await act(async () => { byLabel('Sign in with PIN').props.onPress(); });
  expect(text()).toContain('Whose earnings?');
  expect(optionNamed('Sign out')).toBeUndefined();        // nobody signed in yet
});

test('with staff the bar also links to Manage staff', async () => {
  await mount(SITA);
  expect(byLabel('Manage staff')).toBeTruthy();
});

test('signed in, My earnings posts the desk token and shows that person\'s own figures', async () => {
  await mount(SITA);
  expect(byLabel('My earnings')).toBeUndefined();          // main desk: nothing to show
  const MINE = { data: {
    name: 'Sita', enabled: true, upi_set: true, month_count: 2, month_amount: '14.00',
    unpaid_amount: '14.00', paid_total: '0.00', today_count: 3, today_amount: '21.00',
    daily: [{ date: '2026-11-09', count: 2, amount: '14.00' }], payments: [],
  } };
  (API.post as jest.Mock).mockResolvedValueOnce({ data: { token: 'tok-sita', name: 'Sita' } }).mockResolvedValueOnce(MINE);
  await signInAsSita();
  await flush3();
  // entering the PIN opens today's earnings straight away
  expect(API.post).toHaveBeenLastCalledWith('/hospitals/1/staff/me/', { token: 'tok-sita' });
  expect(text()).toContain('Today: 3 bookings · ₹21.00');
  (API.post as jest.Mock).mockResolvedValueOnce(MINE);
  await act(async () => { await byLabel('My earnings').props.onPress(); });
  expect(API.post).toHaveBeenLastCalledWith('/hospitals/1/staff/me/', { token: 'tok-sita' });
  expect(text()).toContain('Sita: my earnings');
  expect(text()).toContain('₹14.00');
  expect(text()).toContain('2 bookings');
  // today is live, not waiting for the nightly ledger
  expect(text()).toContain('Today: 3 bookings · ₹21.00');
});

// Web ROADMAP 71c: the payee's name, and a Change for 10 s after a pick.
const flush3 = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };

test('the picker names the payee from the queue response; after a pick Change re-picks for 10 s', async () => {
  const setT = jest.spyOn(global, 'setTimeout');
  await mount(SITA, [IN_PROGRESS], 'Ravi K');
  (API.patch as jest.Mock).mockResolvedValueOnce({ data: { staff_today: { name: 'Sita', count: 1, amount: 7 } } });
  await act(async () => { done().props.onPress(); });
  expect(byLabel('Ravi K (main desk)')).toBeTruthy();
  await act(async () => { await byLabel('Sita').props.onPress(); });
  await flush3();
  expect(text()).toContain('Sita +₹7 · 1 today · ₹7');
  expect(setT).toHaveBeenCalledWith(expect.any(Function), 10000);
  await act(async () => { byLabel('Change who handled it').props.onPress(); });
  expect(byLabel('Sita').props.accessibilityState).toEqual({ selected: true });
  (API.patch as jest.Mock).mockResolvedValueOnce({ data: { staff_today: { name: 'Ravi K', count: 1, amount: 7 } } });
  await act(async () => { await byLabel('Ravi K (main desk)').props.onPress(); });
  await flush3();
  expect(API.patch).toHaveBeenLastCalledWith('/bookings/handled-by/5/', { staff_id: null });
  expect(text()).toContain('Ravi K +₹7 · 1 today · ₹7');
  setT.mockRestore();
});

test('a 409 on Change says it is too late and the button goes', async () => {
  await mount(SITA);
  (API.patch as jest.Mock).mockResolvedValueOnce({ data: { staff_today: { name: 'Sita', count: 1, amount: 7 } } });
  await act(async () => { done().props.onPress(); });
  await act(async () => { await byLabel('Sita').props.onPress(); });
  await flush3();
  await act(async () => { byLabel('Change who handled it').props.onPress(); });
  (API.patch as jest.Mock).mockRejectedValueOnce({ response: { status: 409, data: {} } });
  await act(async () => { await byLabel('Sita').props.onPress(); });
  await flush3();
  expect(text()).toContain('Ask admin to move it');
  expect(byLabel('Change who handled it')).toBeUndefined();
});

// The count shows whenever the server sends one, even with no picker (flag off, or
// the person already named at the scan): "Sita · 3 today", no Change button.
test('Done with no picker still shows the server\'s count', async () => {
  await mount(SITA, [{ ...IN_PROGRESS, earns_incentive: false }]);
  (API.patch as jest.Mock).mockResolvedValue({ data: { staff_today: { name: 'Sita', count: 3, amount: 0 } } });
  await act(async () => { done().props.onPress(); });
  await act(async () => { await Promise.resolve(); });
  expect(API.patch).toHaveBeenCalledWith('/bookings/complete/5/');
  expect(text()).toContain('Sita · 3 today');
  expect(byLabel('Change who handled it')).toBeUndefined();
});

// A double tap on Done must not send two Completes.
test('a double tap on Done sends one request', async () => {
  await mount([]);
  let finish: (v: unknown) => void = () => {};
  (API.patch as jest.Mock).mockReturnValue(new Promise(res => { finish = res; }));
  await act(async () => { done().props.onPress(); done().props.onPress(); });
  expect(API.patch).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ data: {} }); });
});
