import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import { I18nProvider } from './i18n';
import DoctorScreen from '../app/(patient)/doctor/[id]';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-qrcode-svg', () => () => null);
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn() }));
jest.mock('./reportFile', () => ({ openSharedDocument: jest.fn() }));
jest.mock('./notifications', () => ({ syncAppointmentReminders: jest.fn() }));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  getUser: jest.fn().mockResolvedValue({ id: 1, name: 'Asha', role: 'patient' }),
  apiMessage: (_e: unknown, f: string) => f,
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  'doctor/[id]': DoctorScreen,
};
let r: any;
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); }); };
afterEach(() => act(() => r.unmount()));
beforeEach(() => { jest.clearAllMocks(); process.env.EXPO_ROUTER_IMPORT_MODE = 'sync'; });

// The doctor's own cutoff (booking_cutoff_hours) reaches the app only as the
// slot endpoint's too_soon. On 2026-11-24, 6 live doctors used 1h and 2 used
// 24h, while the app applied 2h to everyone. The clock is pinned (only Date is
// faked), so this never depends on the time of day.
describe("the doctor's own booking cutoff", () => {
  beforeEach(() => jest.useFakeTimers({
    now: new Date(2026, 10, 20, 8, 0),
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'],
  }));
  afterEach(() => jest.useRealTimers());

  const DOCTOR = {
    id: 5, name: 'Anita Rao', specialization: 'General', city: 'Hindupur', experience: 1, fee: 200,
    available: true, hospital: 3, hospital_name: 'City Care', slots: ['07:00 AM', '09:30 AM', '02:00 PM'], days: [],
    max_per_slot: 10, mobile: '9000000002',
  };
  const show = async (avail: object) => {
    (API.post as jest.Mock).mockResolvedValue({});
    (API.get as jest.Mock).mockImplementation((url: string) =>
      url === '/doctors/5/' ? Promise.resolve({ data: DOCTOR })
      : url === '/hospitals/3/' ? Promise.resolve({ data: { id: 3 } })
      : url.startsWith('/doctors/5/slot-availability/') ? Promise.resolve({ data: avail })
      : Promise.resolve({ data: {} }));
    await act(async () => { r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location="/doctor/5" />); });
    await settle();
  };
  const day = (over: object = {}) => ({ booked: 0, max: 10, full: false, too_soon: false, ...over });
  const label = (slot: string) => slotButton(slot).findAll((n: any) => n.type === 'Text')
    .map((n: any) => n.props.children).filter((c: unknown) => typeof c === 'string').join(' ');
  const slotButton = (slot: string) => r.root.findAll((n: any) =>
    n.props.onPress && n.props.disabled !== undefined
    && n.findAll((c: any) => c.type === 'Text' && c.props.children === slot).length > 0)[0];

  test('a 1h-cutoff doctor: a slot 90 minutes away can be picked', async () => {
    await show({ '07:00 AM': day({ full: true, too_soon: true }), '09:30 AM': day(), '02:00 PM': day() });
    expect(slotButton('09:30 AM').props.disabled).toBe(false);
  });

  test('a 24h-cutoff doctor: a slot hours away is Closed, not Full', async () => {
    await show({ '07:00 AM': day({ full: true, too_soon: true }), '09:30 AM': day({ full: true, too_soon: true }),
                 '02:00 PM': day({ full: true, too_soon: true }) });
    expect(slotButton('02:00 PM').props.disabled).toBe(true);
    expect(label('02:00 PM')).toBe('02:00 PM Closed');
  });

  test('a slot that already passed says Closed, not Too soon', async () => {
    await show({ '07:00 AM': day({ full: true, too_soon: true }), '09:30 AM': day(), '02:00 PM': day() });
    expect(slotButton('07:00 AM').props.disabled).toBe(true);
    expect(label('07:00 AM')).toBe('07:00 AM Closed');
  });
});
