/**
 * The Scans / Blood Tests browse tabs list the matching TESTS first, cheapest
 * first, above the centre cards; each row opens that test on the centre page.
 * The app mirror of the website's AllDoctor.testResults.test.js (ROADMAP item 53,
 * slice 2b).
 */
import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import { I18nProvider } from './i18n';
import DoctorsScreen from '../app/(patient)/doctors';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-location', () => ({}));
jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Stands in for the centre page: it only has to say where it was sent.
const Landed = () => {
  const { id, scan } = useLocalSearchParams<{ id: string; scan?: string }>();
  return <Text>{`landed centre ${id} scan ${scan}`}</Text>;
};
const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  '(patient)/doctors': DoctorsScreen,
  '(patient)/scan-center/[id]': Landed,
};

const centres = [
  { id: 7, name: 'City Lab', city: 'Hindupur', kind: 'BLOOD_CENTER', segments: ['BLOOD'] },
  { id: 8, name: 'Sai Diagnostics', city: 'Anantapur', kind: 'BLOOD_CENTER', segments: ['BLOOD'] },
];
const scan = (id: number, center: number, name: string, price: number, over: object = {}) =>
  ({ id, center, name, modality: 'Blood Test', price, ...over });

let r: any;
const mount = async (scans: object[], q = 'sugar') => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url.startsWith('/hospitals/') ? centres : url.startsWith('/scans/') ? scans : [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location={`/doctors?q=${q}`} />);
  });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
  await press(/^Blood Tests$/);
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const press = async (re: RegExp) => {
  let p = texts(re)[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
};
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

const sugar = [
  scan(1, 7, 'HbA1c', 350, { keywords: 'sugar, diabetes' }),
  scan(2, 8, 'Fasting Glucose', 120, { keywords: 'sugar' }),
  scan(3, 7, 'Thyroid Profile', 500),
];

test('matching tests come first, cheapest first, with the centre and city', async () => {
  await mount(sugar);
  expect(texts(/^Tests matching your search$/)).not.toHaveLength(0);
  const rows = texts(/^(HbA1c|Fasting Glucose|Thyroid Profile)$/).map((n: any) => textsOf(n));
  // The test rows (cheapest first) come before the centre cards' preview chips.
  expect(rows.slice(0, 2)).toEqual(['Fasting Glucose', 'HbA1c']);
  expect(texts(/^Sai Diagnostics · Anantapur$/)).not.toHaveLength(0);
  expect(texts(/^₹120$/)).not.toHaveLength(0);
  expect(texts(/^Centres$/)).not.toHaveLength(0);
});

test('a row opens that test on the centre page', async () => {
  await mount(sugar);
  await press(/^Fasting Glucose$/);
  expect(texts(/^landed centre 8 scan 2$/)).not.toHaveLength(0);
});

test('a place name alone gives centre cards and no test rows', async () => {
  await mount(sugar, 'hindupur');
  expect(texts(/^Tests matching your search$/)).toHaveLength(0);
  expect(texts(/^City Lab$/)).not.toHaveLength(0);
});

test('no search, no test rows', async () => {
  await mount(sugar, '');
  expect(texts(/^Tests matching your search$/)).toHaveLength(0);
});

test('a test synonym finds the centre card too', async () => {
  await mount(sugar);
  expect(texts(/^City Lab$/)).not.toHaveLength(0);   // HbA1c's synonyms say sugar
});

test('past ten matches the list says so', async () => {
  const lots = Array.from({ length: 14 }, (_, i) => scan(100 + i, 7, `Sugar Test ${i}`, 100 + i));
  await mount(lots);
  expect(texts(/Showing the 10 cheapest of 14 matches\./)).not.toHaveLength(0);
  // A row is the only thing that shows a bare price; the cards say "from ₹100".
  expect(texts(/^₹\d+$/)).toHaveLength(10);
});
