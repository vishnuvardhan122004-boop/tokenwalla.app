/**
 * "Book ahead" on the app's REAL hospital dashboard: the doctor form and the test
 * editor (ROADMAP 53 slice 4). The server enforces the window, so a field that never
 * reaches the request looks exactly like a working limit that does nothing. Hence
 * tests on the request body, and on clearing it: blank must be SENT (omitting the
 * key keeps the old limit, so removing it would appear to do nothing). Mirrors
 * src/hospital/Hdashboard.bookAhead.test.js on the website.
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

const doctor = (over: object = {}) => ({
  id: 3, name: 'Rao', specialization: 'Cardiology', mobile: '9876543210', experience: 5, fee: 300,
  max_per_slot: 10, available: true, slots: ['10:00 AM'], days: ['Mon'], ...over,
});
const scan = (over: object = {}) => ({
  id: 5, name: 'Lipid Profile', modality: 'Blood Test', price: 400, duration_minutes: 15, max_per_slot: 1,
  available: true, slots: ['10:00 AM'], days: ['Mon'], prep_instructions: '',
  payment_collection_mode: 'SERVICE_ONLY', booking_cutoff_hours: null, ...over,
});

let r: any;
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const press = async (label: RegExp) => {
  let p = texts(label)[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
};

const mount = async (hospital: object, { doctors = [] as object[], scans = [] as object[] } = {}) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [] } })
      : url === '/scans/' ? Promise.resolve({ data: scans })
      : Promise.resolve({ data: url.startsWith('/doctors/') ? doctors : [] }));
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
};
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

describe('doctor form', () => {
  const openEdit = async (d: object) => {
    await mount({ id: 1, name: 'City' }, { doctors: [d] });
    await press(/^Doctors 1$/);
    await press(/^Edit$/);
  };
  const sent = () => ((API.patch as jest.Mock).mock.calls[0][1] as FormData).getAll('max_days_ahead');

  test('the stored window is shown, and a change is sent back', async () => {
    await openEdit(doctor({ max_days_ahead: 2 }));
    expect(texts(/^Patients can book today and the next 2 days\.$/)).toHaveLength(1);

    await press(/^1d$/);
    await press(/^Save$/);
    expect(sent()).toEqual(['1']);
  });

  test('choosing No limit sends a blank, so the server clears it', async () => {
    await openEdit(doctor({ max_days_ahead: 2 }));
    await press(/^No limit$/);
    await press(/^Save$/);
    expect(sent()).toEqual(['']);
  });

  test('a doctor saved before this existed opens on No limit, and is not sent as the word undefined', async () => {
    await openEdit(doctor());
    expect(texts(/^No limit: patients can book the next 7 days\.$/)).toHaveLength(1);
    await press(/^Save$/);
    expect(sent()).toEqual(['']);
  });
});

describe('test editor', () => {
  const openEdit = async (sc: object) => {
    await mount({ id: 1, name: 'Lotus Lab', kind: 'BLOOD_CENTER' }, { scans: [sc] });
    await press(/^Tests/);
    await press(/^Edit$/);
  };
  const sent = () => (API.patch as jest.Mock).mock.calls[0][1].max_days_ahead;

  test('the stored window is shown, and a change is sent as a number', async () => {
    await openEdit(scan({ max_days_ahead: 3 }));
    expect(texts(/^Patients can book today and the next 3 days\.$/)).toHaveLength(1);

    await press(/^1d$/);
    await press(/^Save$/);
    expect(sent()).toBe(1);
  });

  test('No limit is sent as null, not left out', async () => {
    await openEdit(scan({ max_days_ahead: 3 }));
    await press(/^No limit$/);
    await press(/^Save$/);
    expect(sent()).toBeNull();
  });

  test('a test saved before this existed opens on No limit', async () => {
    await openEdit(scan());
    expect(texts(/^No limit: patients can book the next 7 days\.$/)).toHaveLength(1);
  });
});
