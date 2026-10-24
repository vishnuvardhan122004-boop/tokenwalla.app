/**
 * The doctor form has "Instructions for patients" (optional), shown on the
 * patient's token. The app mirror of the website's
 * Hdashboard.doctorInstructions.test.js (ROADMAP item 53, slice 3). It is always
 * sent, blank included, so clearing the box clears it on the server.
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

let r: any;
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const press = async (label: RegExp) => {
  let p = r.root.findAll((n: any) => n.type === 'Text' && label.test(textsOf(n)))[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
};
const box = () => r.root.findAll((n: any) =>
  n.props?.placeholder === 'e.g. Bring your previous reports and prescriptions'
  && typeof n.props.onChangeText === 'function')[0];

const open = async (d: object) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [] } })
      : Promise.resolve({ data: url.startsWith('/doctors/') ? [d] : [] }));
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  await press(/^Doctors 1$/);
  await press(/^Edit$/);
};
const sentInstructions = () => {
  const body = (API.patch as jest.Mock).mock.calls[0][1];
  return body.getAll('instructions');
};
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

test('the form shows what the doctor already says, and saves an edit trimmed', async () => {
  await open(doctor({ instructions: 'Bring old reports' }));
  expect(box().props.value).toBe('Bring old reports');
  await act(async () => { box().props.onChangeText('  Fast for 8 hours  '); });
  await press(/^Save$/);
  expect(sentInstructions()).toEqual(['Fast for 8 hours']);
});

test('clearing the box sends a blank, so it is cleared on the server', async () => {
  await open(doctor({ instructions: 'Bring old reports' }));
  await act(async () => { box().props.onChangeText(''); });
  await press(/^Save$/);
  expect(sentInstructions()).toEqual(['']);
});

test('a doctor with none starts empty, and is not sent as the word undefined', async () => {
  await open(doctor());
  expect(box().props.value).toBe('');
  await press(/^Save$/);
  expect(sentInstructions()).toEqual(['']);
});
