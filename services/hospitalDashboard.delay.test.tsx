/**
 * The running-late timer on the app's REAL hospital dashboard: a 5-minute-step
 * timer up to 3 hours (no slider: a native slider package would force a native
 * rebuild), an optional reason, and Arrived — the one control that tells
 * patients the doctor is in. Mirrors src/hospital/Hdashboard.delay.test.js on
 * the website; the payloads below are the backend's set-delay / arrived contract.
 */
import React from 'react';
import { Alert } from 'react-native';
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

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };
const doctor = (over: object = {}) => ({
  id: 7, name: 'Kumar', specialization: 'ENT', experience: 4, fee: 200,
  max_per_slot: 10, available: true, running_delay_minutes: 0,
  days: ['Mon'], slots: ['09:00 AM'], ...over,
});

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
  // The doctors list lives on its own tab, labelled "Doctors <count>".
  let tab = r.root.findAll((n: any) => n.type === 'Text'
    && [n.props.children].flat(Infinity).some((c: unknown) => typeof c === 'string' && c.startsWith('Doctors')))[0];
  while (tab && typeof tab.props.onPress !== 'function') tab = tab.parent;
  await act(async () => { tab.props.onPress(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
};
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join(' ');
/** The pressable carrying this accessibilityLabel (the composite, not its host view). */
const control = (label: string) => r.root.findAll((n: any) =>
  n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
/** What the readout between − and + actually RENDERS (not its accessibility label). */
const readout = (i = 0) => {
  const node = r.root.findAll((n: any) => n.type === 'Text' && n.props.testID === 'delay-readout')[i];
  return node && [node.props.children].flat(Infinity).join('');
};
const press = async (label: string) => { await act(async () => { control(label).props.onPress(); }); };

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { alert.mockRestore(); return act(() => r.unmount()); });

test('the timer starts at 15m and Notify posts exactly what was dialled', async () => {
  await mount(doctor());
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 15, notified_count: 3 } });
  expect(readout()).toBe('15m');

  await press('Notify patients');

  expect(API.post).toHaveBeenCalledWith('/doctors/7/set-delay/', { delay_minutes: 15 }, JSON_HEADERS);
  expect(alert).toHaveBeenCalledWith('Updated', 'Dr. Kumar marked 15m late. 3 patients notified.');
  expect(control('Update patients')).toBeTruthy();       // the button now says what it does next
});

test('the quick buttons reach 3 hours, + stops there, and the toast reads in hours', async () => {
  await mount(doctor());
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 180, notified_count: 2 } });

  await press('Set delay to 3h');
  expect(readout()).toBe('3h');
  await press('More delay');                              // clamped, not 185
  expect(readout()).toBe('3h');

  await press('Notify patients');
  expect(API.post).toHaveBeenCalledWith('/doctors/7/set-delay/', { delay_minutes: 180 }, JSON_HEADERS);
  expect(alert).toHaveBeenCalledWith('Updated', 'Dr. Kumar marked 3h late. 2 patients notified.');
});

test('+ and − step by 5 minutes and stop at 5', async () => {
  await mount(doctor());
  await press('More delay');
  expect(readout()).toBe('20m');
  for (let i = 0; i < 5; i++) await press('Less delay');   // 20 -> 5 in three taps, then clamped
  expect(readout()).toBe('5m');
});

test('an active delay seeds the timer, and the chosen reason rides along', async () => {
  await mount(doctor({ running_delay_minutes: 90 }));
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 120, notified_count: 4 } });
  expect(readout()).toBe('1h 30m');

  await press('Set delay to 2h');
  await press('Reason: In surgery');
  await press('Update patients');

  expect(API.post).toHaveBeenCalledWith(
    '/doctors/7/set-delay/', { delay_minutes: 120, reason: 'surgery' }, JSON_HEADERS);
});

test('tapping the chosen reason again drops it', async () => {
  await mount(doctor());
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 15, notified_count: 0 } });
  await press('Reason: Emergency');
  await press('Reason: Emergency');
  await press('Notify patients');
  expect(API.post).toHaveBeenCalledWith('/doctors/7/set-delay/', { delay_minutes: 15 }, JSON_HEADERS);
});

test('Arrived posts to the arrived endpoint, clears the delay and resets the timer', async () => {
  await mount(doctor({ running_delay_minutes: 60 }));
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 0, notified_count: 5 } });
  await press('Set delay to 3h');                         // a real draft to throw away
  await press('Reason: In surgery');
  expect(readout()).toBe('3h');

  await press('Doctor arrived');

  expect(API.post).toHaveBeenCalledWith('/doctors/7/arrived/', {}, JSON_HEADERS);
  expect(control('Notify patients')).toBeTruthy();         // no delay active any more
  expect(readout()).toBe('15m');                           // draft back to the default
  expect(control('Reason: In surgery').props.accessibilityState.selected).toBe(false);
});

test('the Arrived toast does not claim delivery: it is push-only', async () => {
  await mount(doctor({ running_delay_minutes: 60 }));
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 0, notified_count: 5 } });

  await press('Doctor arrived');

  expect(alert).toHaveBeenCalledWith('Updated',
    'Dr. Kumar marked arrived. Patients with the app were notified; WhatsApp-only patients were not (5 booked today).');
});

test('Arrived with nobody booked today just says so, without a count', async () => {
  await mount(doctor({ running_delay_minutes: 60 }));
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 0, notified_count: 0 } });

  await press('Doctor arrived');

  expect(alert).toHaveBeenCalledWith('Updated', 'Dr. Kumar marked arrived.');
});

test('Clear is silent: it posts a bare 0, not the arrived announcement', async () => {
  await mount(doctor({ running_delay_minutes: 20 }));
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 0, notified_count: 0 } });

  await press('Clear delay');

  expect(API.post).toHaveBeenCalledTimes(1);
  expect(API.post).toHaveBeenCalledWith('/doctors/7/set-delay/', { delay_minutes: 0 }, JSON_HEADERS);
});

test('a double tap on Notify sends one request, not two pushes', async () => {
  await mount(doctor());
  let release: (v: unknown) => void = () => {};
  (API.post as jest.Mock).mockImplementation(() => new Promise(res => { release = res; }));

  const notify = control('Notify patients');
  await act(async () => { notify.props.onPress(); notify.props.onPress(); });

  expect(API.post).toHaveBeenCalledTimes(1);
  await act(async () => { release({ data: { running_delay_minutes: 15, notified_count: 1 } }); });
});

test('a chip reports whether it is selected, for screen readers', async () => {
  await mount(doctor());
  expect(control('Set delay to 15m').props.accessibilityState.selected).toBe(true);
  expect(control('Reason: Emergency').props.accessibilityState.selected).toBe(false);
  await press('Reason: Emergency');
  expect(control('Reason: Emergency').props.accessibilityState.selected).toBe(true);
});

test('with two doctors, a request on one keeps its controls disabled while the other starts', async () => {
  await mount([doctor(), doctor({ id: 8, name: 'Rao' })]);
  const resolvers: Array<(v: unknown) => void> = [];
  (API.post as jest.Mock).mockImplementation(() => new Promise(res => { resolvers.push(res); }));
  // One entry per rendered button: a pressable and the node it wraps both carry
  // the label and the handler, so keep only the outermost.
  const all = (label: string) => r.root.findAll((n: any) =>
    n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function'
    && n.parent?.props?.onPress !== n.props.onPress);

  await act(async () => { all('Notify patients')[0].props.onPress(); });   // doctor 7, pending
  await act(async () => { all('Notify patients')[1].props.onPress(); });   // doctor 8 starts too

  expect(API.post).toHaveBeenCalledTimes(2);
  // Doctor 7 is still in flight, so its controls must still read as busy.
  expect(all('Notify patients')[0].props.disabled).toBe(true);
  expect(all('More delay')[0].props.disabled).toBe(true);

  await act(async () => { resolvers[1]({ data: { running_delay_minutes: 15, notified_count: 1 } }); });
  expect(all('More delay')[0].props.disabled).toBe(true);                    // 8 finishing must not free 7
  await act(async () => { resolvers[0]({ data: { running_delay_minutes: 15, notified_count: 1 } }); });
  expect(all('More delay')[0].props.disabled).toBe(false);
});

test('Arrived and Clear do nothing while the doctor is not running late', async () => {
  await mount(doctor());
  expect(control('Doctor arrived').props.disabled).toBe(true);
  expect(control('Clear delay').props.disabled).toBe(true);
});

/** Pull-to-refresh, as the doctor list reloads when another device changed it. */
const refresh = async () => {
  const node = r.root.findAll((n: any) => typeof n.props?.onRefresh === 'function')[0];
  await act(async () => { await node.props.onRefresh(); });
};
const serverNowSays = (minutes: number) => (API.get as jest.Mock).mockImplementation((url: string) =>
  url.startsWith('/doctors/?hospital=') ? Promise.resolve({ data: [doctor({ running_delay_minutes: minutes })] })
  : url.startsWith('/bookings/queue/')
    ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [] } })
    : Promise.resolve({ data: [] }));

test('a draft started against a delay that was then cleared elsewhere does not linger', async () => {
  await mount(doctor({ running_delay_minutes: 90 }));
  await press('Set delay to 2h');                          // staff are mid-edit on this device
  await press('Reason: In surgery');
  expect(readout()).toBe('2h');

  serverNowSays(0);                                         // meanwhile the web dashboard cleared it
  await refresh();

  expect(readout()).toBe('15m');                            // follows the server, not the old 2h draft
  expect(control('Reason: In surgery').props.accessibilityState.selected).toBe(false);
});

test('Notify keeps the chosen reason picked for the next Update', async () => {
  await mount(doctor());
  (API.post as jest.Mock).mockResolvedValue({ data: { running_delay_minutes: 30, notified_count: 2 } });
  await press('Set delay to 30m');
  await press('Reason: On the way');

  await press('Notify patients');

  expect(readout()).toBe('30m');
  expect(control('Reason: On the way').props.accessibilityState.selected).toBe(true);
});
