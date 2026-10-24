/**
 * The patient's centre page: a search box past 5 tests, and ?scan=ID opening the
 * test a browse result pointed at. The app mirror of the website's
 * ScanCenterDetails.search.test.js (ROADMAP item 53, slices 2a and 2b).
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

const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  'scan-center/[id]': ScanCenterScreen,
};
const scan = (i: number, over: object = {}) => ({
  id: i, name: `Panel ${i}`, modality: 'Blood', price: 100 + i, duration_minutes: 15,
  slots: [], days: [], available: true, ...over,
});

let r: any;
const mount = async (scans: object[], kind = 'BLOOD_CENTER', query = '') => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url.startsWith('/hospitals/') ? { id: 7, name: 'City Lab', kind } : scans }));
  (API.post as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location={`/scan-center/7${query}`} />);
  });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const names = () => texts(/^(Panel \d+|HbA1c|MRI Brain|Lipid Profile)$/).map((n: any) => textsOf(n));
const box = () => r.root.findAll((n: any) => typeof n.props?.onChangeText === 'function')[0];
const typeInto = async (v: string) => { await act(async () => { box().props.onChangeText(v); }); };
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

test('a short menu has no search box', async () => {
  await mount([1, 2, 3, 4, 5].map(i => scan(i)));
  expect(box()).toBeUndefined();
});

test('past 5 tests the box appears, in the centre kind\'s own words', async () => {
  await mount([1, 2, 3, 4, 5, 6].map(i => scan(i)));
  expect(box().props.placeholder).toBe('Search tests, e.g. sugar or thyroid');
  await act(async () => r.unmount());
  await mount([1, 2, 3, 4, 5, 6].map(i => scan(i, { modality: 'MRI' })), 'SCAN_CENTER');
  expect(box().props.placeholder).toBe('Search scans, e.g. brain or MRI');
});

test('every typed word must match name, type or synonyms', async () => {
  await mount([
    ...[1, 2, 3, 4, 5].map(i => scan(i)),
    scan(6, { name: 'HbA1c', modality: 'Diabetes', keywords: 'sugar, glucose' }),
  ]);
  expect(names()).toHaveLength(6);
  await typeInto('sugar');
  expect(names()).toEqual(['HbA1c']);
  await typeInto('sugar diabetes');
  expect(names()).toEqual(['HbA1c']);
  await typeInto('sugar thyroid');
  expect(names()).toEqual([]);
  expect(texts(/No test matches your search\./)).not.toHaveLength(0);
  await typeInto('');
  expect(names()).toHaveLength(6);
});

test('Show more counts what the search leaves, not the whole menu', async () => {
  const many = Array.from({ length: 80 }, (_, i) => scan(i + 1, i < 3 ? { keywords: 'thyroid' } : {}));
  await mount(many);
  expect(texts(/Show more \(50 left\)/)).not.toHaveLength(0);
  await typeInto('thyroid');
  expect(names()).toHaveLength(3);
  expect(texts(/Show more/)).toHaveLength(0);
});

test('?scan=ID opens that test and puts it first, even past the first page', async () => {
  const many = Array.from({ length: 80 }, (_, i) => scan(i + 1, { slots: ['10:00 AM'], days: ['Mon'] }));
  await mount(many, 'BLOOD_CENTER', '?scan=75');
  expect(names()[0]).toBe('Panel 75');
  expect(names()).toHaveLength(30);
  // It is open (its slots are showing) and the visit was counted.
  expect(texts(/^10:00 AM$/)).not.toHaveLength(0);
  expect(API.post).toHaveBeenCalledWith('/scans/75/view/');
});

test('an unknown ?scan= changes nothing', async () => {
  await mount([1, 2, 3].map(i => scan(i, { slots: ['10:00 AM'] })), 'BLOOD_CENTER', '?scan=999');
  expect(names()).toEqual(['Panel 1', 'Panel 2', 'Panel 3']);
  expect(texts(/^10:00 AM$/)).toHaveLength(0);
  expect(API.post).not.toHaveBeenCalled();
});

test('typing while a test is pinned searches normally', async () => {
  const many = Array.from({ length: 12 }, (_, i) => scan(i + 1, i === 1 ? { keywords: 'sugar' } : {}));
  await mount(many, 'BLOOD_CENTER', '?scan=9');
  expect(names()[0]).toBe('Panel 9');
  await typeInto('sugar');
  expect(names()).toEqual(['Panel 2']);
});

test('a different ?scan= at the same centre clears an old query that would hide it', async () => {
  const { router } = require('expo-router');   // eslint-disable-line @typescript-eslint/no-require-imports
  const many = Array.from({ length: 12 }, (_, i) => scan(i + 1, i === 1 ? { keywords: 'sugar' } : {}));
  await mount(many, 'BLOOD_CENTER', '?scan=2');
  await typeInto('sugar');
  expect(names()).toEqual(['Panel 2']);
  await typeInto('zzz');
  expect(names()).toEqual([]);
  await act(async () => { router.setParams({ scan: '9' }); });
  expect(names()[0]).toBe('Panel 9');
  expect(names()).toHaveLength(12);
});

test('the scroll view holding the search box keeps taps while the keyboard is up', async () => {
  await mount([1, 2, 3, 4, 5, 6].map(i => scan(i)));
  let p = box().parent;
  while (p && p.props.keyboardShouldPersistTaps === undefined) p = p.parent;
  expect(p?.props.keyboardShouldPersistTaps).toBe('handled');
});
