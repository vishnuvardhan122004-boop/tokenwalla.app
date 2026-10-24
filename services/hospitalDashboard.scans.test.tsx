/**
 * Services -> Tests on the hospital dashboard froze the app, then closed it, for
 * a centre with 800 tests (imports add up: 300 rows per file). The tab painted
 * every test as a card (~38 views each, ~30,000 in all) inside a plain
 * ScrollView, which does no virtualising, and the dashboard re-renders on every
 * 10s queue poll. It now paints a page at a time.
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

const scan = (i: number) => ({
  id: i, name: `Panel ${i}`, modality: 'Blood', price: 100 + i, duration_minutes: 15,
  slots: [], available: true, payment_collection_mode: 'SERVICE_ONLY',
});

let r: any;
// A hospital that sells doctors AND blood tests: the only account that sees a
// "Services" tab with a Doctors | Tests switcher inside it.
const mount = async (count: number) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({
    role: 'hospital', hospital: { id: 1, name: 'City', segments: ['CONSULT', 'BLOOD'] },
  }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url.startsWith('/scans/')
      ? Array.from({ length: count }, (_, i) => scan(i + 1)) : [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
// The pressable ancestor of the host <Text> that reads exactly `label`.
const press = async (label: RegExp) => {
  const t = r.root.findAll((n: any) => n.type === 'Text' && label.test(textsOf(n)))[0];
  let p = t;
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
};
const cards = () => r.root.findAll((n: any) =>
  n.type === 'Text' && /^Panel \d+$/.test(textsOf(n))).length;
afterEach(() => act(() => r.unmount()));

test('Services -> Tests paints a page of tests, not all 800', async () => {
  await mount(800);
  await press(/^Services$/);
  await press(/^Tests/);
  expect(cards()).toBe(30);
  // The switcher still reports the true total.
  expect(r.root.findAll((n: any) => n.type === 'Text' && textsOf(n).includes('Tests 800'))).not.toHaveLength(0);
});

test('Show more reveals the next page until nothing is left', async () => {
  await mount(65);
  await press(/^Services$/);
  await press(/^Tests/);
  expect(cards()).toBe(30);
  await press(/Show more/);
  expect(cards()).toBe(60);
  await press(/Show more/);
  expect(cards()).toBe(65);
  expect(r.root.findAll((n: any) => n.type === 'Text' && /Show more/.test(textsOf(n)))).toHaveLength(0);
});

test('a short list shows every test and no Show more', async () => {
  await mount(5);
  await press(/^Services$/);
  await press(/^Tests/);
  expect(cards()).toBe(5);
  expect(r.root.findAll((n: any) => n.type === 'Text' && /Show more/.test(textsOf(n)))).toHaveLength(0);
});
