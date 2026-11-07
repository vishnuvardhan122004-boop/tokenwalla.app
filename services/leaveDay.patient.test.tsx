/**
 * ROADMAP 61, patient side: a leave day replaces the slots with a notice, and a
 * free-reschedule booking names the reason. Both fields are optional so an app
 * build that ships before the backend renders exactly as before.
 * Mirrors DoctorsDetails.leave.test.js and MyBookings.leave.test.js on the website.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import { I18nProvider } from './i18n';
import DoctorScreen from '../app/(patient)/doctor/[id]';
import MyBookings from '../app/(patient)/my-bookings';
import { toLocalISODate } from '../utils/booking';

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
  'my-bookings': MyBookings,
};
let r: any;
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); }); };
afterEach(() => act(() => r.unmount()));
beforeEach(() => { jest.clearAllMocks(); process.env.EXPO_ROUTER_IMPORT_MODE = 'sync'; });

describe('doctor page', () => {
  const DOCTOR = {
    id: 5, name: 'Anita Rao', specialization: 'General', city: 'Hindupur', experience: 1, fee: 200,
    available: true, hospital: 3, hospital_name: 'City Care', slots: ['09:00 AM', '10:00 AM'], days: [], max_per_slot: 10,
    mobile: '9000000002',
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
  const day = (over: object = {}) => ({ booked: 0, max: 10, full: false, ...over });

  test('a leave day shows the notice and reason instead of slots', async () => {
    const closed = day({ full: true, on_leave: true, leave_reason: 'Out of station' });
    await show({ '09:00 AM': closed, '10:00 AM': closed });
    expect(text()).toContain('Doctor on leave — Out of station');
    expect(text()).not.toContain('09:00 AM');
  });

  test('a leave day without a reason has no dangling dash', async () => {
    const closed = day({ full: true, on_leave: true, leave_reason: '' });
    await show({ '09:00 AM': closed, '10:00 AM': closed });
    expect(text()).toContain('Doctor on leave');
    expect(text()).not.toContain('Doctor on leave —');
  });

  test('an ordinary day, or a backend without the flag, still lists its slots', async () => {
    await show({ '09:00 AM': day(), '10:00 AM': day() });
    expect(text()).toContain('09:00 AM');
    expect(text()).not.toContain('Doctor on leave');
  });
});

describe('my bookings banner', () => {
  const show = async (over: object) => {
    (API.get as jest.Mock).mockImplementation((url: string) =>
      url === '/bookings/my/' ? Promise.resolve({ data: [{
        id: 1, token: 'TW-001', status: 'CONFIRMED', date: toLocalISODate(new Date()), slot: '10:30 AM',
        amount: 100, doctor: 5, doctor_name: 'Rao', provider_kind: 'DOCTOR',
        hospital_name: 'City Hospital', queue_access: false, queue_position: null,
        free_reschedule: true, is_for_other: false, uses_pass: false, pass_role: null, ...over,
      }] })
      : Promise.resolve({ data: {} }));
    await act(async () => { r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location="/my-bookings" />); });
    await settle();
  };

  test('the banner carries the leave reason when there is one', async () => {
    await show({ leave_reason: 'Out of station' });
    expect(text()).toContain('Dr. Rao is unavailable. Reschedule below at no charge. (Out of station)');
  });

  test('without a reason, or without the field, the banner is unchanged', async () => {
    await show({ leave_reason: '' });
    expect(text()).toContain('Reschedule below at no charge.');
    expect(text()).not.toContain('charge. (');
    await act(() => r.unmount());
    await show({});
    expect(text()).toContain('Reschedule below at no charge.');
    expect(text()).not.toContain('undefined');
  });
});
