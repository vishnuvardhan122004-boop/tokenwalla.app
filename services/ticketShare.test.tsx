/**
 * The token screen and My Bookings both save the ticket as a PNG through the
 * shared shareCapturedView. What each does when the device cannot share, or the
 * capture fails, is its own alert.
 */
import React from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import API from './api';
import { I18nProvider } from './i18n';
import BookingTokenScreen from '../app/(patient)/booking-token';
import MyBookings from '../app/(patient)/my-bookings';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('./notifications', () => ({
  notifyBookingConfirmed: jest.fn(), scheduleAppointmentReminder: jest.fn(), syncAppointmentReminders: jest.fn(),
}));
jest.mock('./reportFile', () => ({ openSharedDocument: jest.fn() }));
jest.mock('../components/RescheduleModal', () => ({ __esModule: true, default: () => null }));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  getUser: jest.fn().mockResolvedValue({ id: 1, name: 'Asha', role: 'patient' }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  '(patient)/booking-token': BookingTokenScreen,
  '(patient)/my-bookings': MyBookings,
};
const booking = {
  id: 1, token: '12', status: 'CONFIRMED', date: '2026-10-30', slot: '10:00 AM', amount: 311,
  doctor_name: 'Dr Rao', hospital_name: 'City', provider_kind: 'DOCTOR', queue_access: false,
};

let r: any;
const mount = async (location: string) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url === '/bookings/my/' ? [booking] : {} }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location={location} />);
  });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const press = async (re: RegExp) => {
  let p = r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)))[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
};
const settle = async (ms = 700) => { await act(async () => { await new Promise(res => setTimeout(res, ms)); }); };
let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (captureRef as jest.Mock).mockResolvedValue('/cache/ticket.png');
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
});
afterEach(async () => { alert.mockRestore(); await act(async () => r.unmount()); });

const TOKEN = '/booking-token?token=12&doctorName=Rao&providerKind=DOCTOR&hospital=City&date=2026-10-30&slot=10:00+AM&userName=Asha';

test('the token screen saves the ticket through the share sheet', async () => {
  await mount(TOKEN);
  await press(/^Download Ticket$/);
  await settle(50);
  expect(captureRef).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ format: 'png' }));
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/ticket.png', expect.objectContaining({ mimeType: 'image/png' }));
  expect(alert).not.toHaveBeenCalled();
});

test('the token screen says so when the device cannot share', async () => {
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  await mount(TOKEN);
  await press(/^Download Ticket$/);
  await settle(50);
  expect(alert).toHaveBeenCalledWith('Not available', 'Saving is not available on this device.');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('the token screen shows its own error when the capture fails', async () => {
  (captureRef as jest.Mock).mockRejectedValue(new Error('no view'));
  await mount(TOKEN);
  await press(/^Download Ticket$/);
  await settle(50);
  expect(alert.mock.calls[0][0]).toBe('Error');
});

test('My Bookings captures the off-screen ticket and shares it', async () => {
  await mount('/my-bookings');
  await press(/^Download Ticket$/);
  await settle();                                   // the screen waits 450 ms for the QR to paint
  expect(captureRef).toHaveBeenCalledTimes(1);
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/ticket.png', expect.objectContaining({ UTI: 'public.png' }));
  expect(alert).not.toHaveBeenCalled();
});

test('My Bookings says so when the device cannot share', async () => {
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  await mount('/my-bookings');
  await press(/^Download Ticket$/);
  await settle();
  expect(alert).toHaveBeenCalledWith('Not available', 'Saving is not available on this device.');
});
