/**
 * The hospital scanner marks a correct, today's booking In Consultation with
 * no button press, unless this device has the auto switch off. Mirrors the
 * website's src/hospital/QRScanner.test.js.
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
  default: { get: jest.fn(), post: jest.fn() },
  apiMessage: (_e: unknown, f: string) => f,
  logoutUser: jest.fn(),
  onLogout: jest.fn(),
  logoutInProgress: () => false,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const booking = (date: string) => ({
  valid: true, already_done: false,
  booking: { token: 'TW-1', status: 'CONFIRMED', date, slot: '09:00 AM', patient_name: 'Ravi' },
});

let r: any;
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const mount = async () => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
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

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });
afterEach(() => act(() => r.unmount()));

test("today's booking is marked In Consultation with no button press", async () => {
  (API.get as jest.Mock).mockResolvedValue({ data: booking(ymd(new Date())) });
  (API.post as jest.Mock).mockResolvedValue({ data: { success: true } });
  await mount();
  await scan();
  expect(API.post).toHaveBeenCalledWith('/bookings/scan/TW-1/');
  expect(text()).toContain('Marked as In Consultation!');
});

test('with the switch off, staff confirm', async () => {
  await AsyncStorage.setItem('tw_scan_auto_confirm', '0');
  (API.get as jest.Mock).mockResolvedValue({ data: booking(ymd(new Date())) });
  await mount();
  await scan();
  expect(API.post).not.toHaveBeenCalled();
  expect(text()).toContain('Mark as In Consultation');
});

test('a booking for another day is left to staff', async () => {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  (API.get as jest.Mock).mockResolvedValue({ data: booking(ymd(tomorrow)) });
  await mount();
  await scan();
  expect(API.post).not.toHaveBeenCalled();
  expect(text()).toContain('not today');
});
