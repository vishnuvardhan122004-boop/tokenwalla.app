/**
 * The patient's centre page painted every test as a card (each with an image
 * slot, tags and a price), so a centre with 800 tests mounted tens of thousands
 * of views in one go — the same freeze, then OS kill, the hospital's own
 * Services -> Tests list had. It paints a page at a time now.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import { I18nProvider } from './i18n';
import ScanCenterScreen from '../app/(patient)/scan-center/[id]';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Inside the provider the real t() fills {count} / {n}; the bare fallback does not.
const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  'scan-center/[id]': ScanCenterScreen,
};
const scan = (i: number) => ({
  id: i, name: `Panel ${i}`, modality: 'Blood', price: 100 + i, duration_minutes: 15,
  slots: [], days: [], available: true,
});

let r: any;
const mount = async (count: number) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url.startsWith('/hospitals/')
      ? { id: 7, name: 'City Lab', kind: 'BLOOD_CENTER' }
      : Array.from({ length: count }, (_, i) => scan(i + 1)) }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location="/scan-center/7" />);
  });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const cards = () => texts(/^Panel \d+$/).length;
const showMore = () => texts(/Show more/);
const pressShowMore = async () => {
  let p = showMore()[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
};
afterEach(() => act(() => r.unmount()));

test('an 800-test centre paints a page of tests, and still says 800', async () => {
  await mount(800);
  expect(cards()).toBe(30);
  expect(texts(/800 tests/)).not.toHaveLength(0);
  expect(textsOf(showMore()[0])).toContain('770');
});

test('Show more reveals the next page until nothing is left', async () => {
  await mount(65);
  expect(cards()).toBe(30);
  await pressShowMore();
  expect(cards()).toBe(60);
  await pressShowMore();
  expect(cards()).toBe(65);
  expect(showMore()).toHaveLength(0);
});

test('a short list shows every test and no Show more', async () => {
  await mount(5);
  expect(cards()).toBe(5);
  expect(showMore()).toHaveLength(0);
});
