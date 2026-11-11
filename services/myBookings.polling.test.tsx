/**
 * A background refresh of My Bookings (the 15 s poll) must be invisible: no pull-to-refresh
 * spinner and no skeleton over a list that is already on screen.
 */
import React from 'react';
import { RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import MyBookings from '../app/(patient)/my-bookings';
import { toLocalISODate } from '../utils/booking';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-qrcode-svg', () => () => null);
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn() }));
jest.mock('./reportFile', () => ({ openSharedDocument: jest.fn() }));
jest.mock('./notifications', () => ({ syncAppointmentReminders: jest.fn() }));
let mockPoll: () => void = () => {};
jest.mock('../hooks/usePolling', () => ({ usePolling: (fn: () => void) => { mockPoll = fn; } }));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn(), post: jest.fn() },
  getUser: jest.fn(() => Promise.resolve({ id: 1, name: 'Patient', role: 'patient' })),
  apiMessage: (_e: unknown, f: string) => f,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const booking = {
  id: 1, token: 'TW-001', status: 'CONFIRMED', date: toLocalISODate(new Date()), slot: '10:30 AM',
  amount: 100, doctor: 5, doctor_name: 'Rao', provider_kind: 'DOCTOR',
  hospital_name: 'City Hospital', queue_access: false, queue_position: null,
  free_reschedule: false, is_for_other: false, uses_pass: false, pass_role: null,
};

test('the background poll shows no spinner and keeps the list on screen', async () => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url === '/bookings/my/' ? Promise.resolve({ data: [booking] }) : Promise.resolve({ data: {} }));
  let r: any;
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      'my-bookings': MyBookings,
    })} location="/my-bookings" />);
  });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });

  let finish: (v: unknown) => void = () => {};
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url === '/bookings/my/' ? new Promise(res => { finish = res; }) : Promise.resolve({ data: {} }));
  await act(async () => { mockPoll(); });
  const spinning = () => r.root.findAllByType(RefreshControl).some((c: any) => c.props.refreshing);
  expect(spinning()).toBe(false);
  expect(r.root.findAll((n: any) => n.props?.variant === 'booking').length).toBe(0);   // no skeleton
  await act(async () => { finish({ data: [booking] }); });
  await act(() => r.unmount());
});
