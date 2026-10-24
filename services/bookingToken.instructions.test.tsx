/**
 * The token shows the provider's own words: a doctor's instructions, or a test's
 * prep, in a "Before you come" box. The app mirror of the website's
 * BookingToken.instructions.test.js (ROADMAP item 53, slice 3). The text rides
 * to this screen as a route param from /verify/'s booking.instructions.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { I18nProvider } from './i18n';
import BookingTokenScreen from '../app/(patient)/booking-token';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('./notifications', () => ({
  notifyBookingConfirmed: jest.fn(), scheduleAppointmentReminder: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  '(patient)/booking-token': BookingTokenScreen,
};

let r: any;
const mount = async (extra: string) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  const q = `token=12&doctorName=Dr+Rao&providerKind=DOCTOR&hospital=City&date=2026-10-30&slot=10:00+AM&userName=Asha${extra}`;
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location={`/booking-token?${q}`} />);
  });
};
const texts = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number');
afterEach(() => act(() => r.unmount()));

test('instructions show under a "Before you come" heading', async () => {
  await mount('&instructions=' + encodeURIComponent('Bring your previous reports and prescriptions'));
  expect(texts()).toContain('⚠ Before you come');
  expect(texts()).toContain('Bring your previous reports and prescriptions');
});

test('a test\'s prep rides the same way', async () => {
  await mount('&providerKind=SCAN&instructions=' + encodeURIComponent('12 hours fasting. Water is fine.'));
  expect(texts()).toContain('12 hours fasting. Water is fine.');
});

test('no instructions, no box', async () => {
  await mount('');
  expect(texts()).not.toContain('⚠ Before you come');
  await act(async () => r.unmount());
  await mount('&instructions=');
  expect(texts()).not.toContain('⚠ Before you come');
});
