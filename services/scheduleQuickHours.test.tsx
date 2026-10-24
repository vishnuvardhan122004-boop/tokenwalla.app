/**
 * One-tap hours and All days on the app's two schedule forms — the doctor form
 * on the hospital dashboard and ScanEditorModal. Mirrors the website's
 * Hdashboard.scanForm.test.js (ROADMAP item 53, slice 1). The slot strings are
 * the backend's wire format, so the payloads asserted here are what is saved.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import Dashboard from '../app/(hospital)/(tabs)/dashboard';
import ScanEditorModal from '../components/ScanEditorModal';
import { DEFAULT_SLOTS, SLOT_PRESETS, presetSlots } from '../constants/slots';

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

let r: any;
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join(' ');
const flat = () => text().replace(/\s+/g, '');
const control = (label: string) => r.root.findAll((n: any) =>
  n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
/** The pressable that wraps a <Text> with exactly this label. */
const pressableByText = (label: string) => {
  let n = r.root.findAll((x: any) => x.type === 'Text'
    && [x.props.children].flat(Infinity).join('') === label)[0];
  while (n && typeof n.props.onPress !== 'function') n = n.parent;
  return n;
};
const tap = async (n: any) => { await act(async () => { n.props.onPress(); }); };

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r?.unmount()));

test('each preset is a run of grid slots, and 9 AM – 9 PM stops at 08:30 PM', () => {
  const sizes = Object.fromEntries(SLOT_PRESETS.map(p => [p.label, presetSlots(p).length]));
  expect(sizes).toEqual({ '9 AM – 9 PM': 24, '9 AM – 1 PM': 8, '9 AM – 6 PM': 18, '6 PM – 9 PM': 6 });
  const all = presetSlots(SLOT_PRESETS[0]);
  expect(all[0]).toBe('09:00 AM');
  expect(all[all.length - 1]).toBe('08:30 PM');
  expect(all).not.toContain('09:00 PM');
  SLOT_PRESETS.forEach(p => presetSlots(p).forEach(s => expect(DEFAULT_SLOTS).toContain(s)));
});

// 09:15 AM is off the half-hour grid: the editor has no chip for it.
const scan = {
  id: 5, name: 'Lipid Profile', modality: 'Blood Test', price: 400, duration_minutes: 15,
  max_per_slot: 1, available: true, slots: ['10:00 AM', '09:15 AM'], days: ['Mon'],
  prep_instructions: '', payment_collection_mode: 'SERVICE_ONLY', booking_cutoff_hours: null,
};
const mountEditor = async () => {
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => {
    r = TestRenderer.create(
      <ScanEditorModal visible scan={scan} centerId={1} unit="test" onClose={jest.fn()} onSaved={jest.fn()} />);
  });
};
const save = async () => { await tap(pressableByText('Save')); };

test('a test\'s quick-hours button replaces its slots and keeps a time saved off the grid', async () => {
  await mountEditor();
  await tap(control('Quick hours 6 PM – 9 PM'));
  await save();

  // 10:00 AM (on the grid, outside the range) is dropped; 09:15 AM survives.
  expect((API.patch as jest.Mock).mock.calls[0][1].slots).toEqual([
    '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:15 AM',
  ]);
});

test('All days ticks Monday to Sunday on a test', async () => {
  await mountEditor();
  await tap(pressableByText('All days'));
  await save();

  expect((API.patch as jest.Mock).mock.calls[0][1].days).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

test('the doctor form has the same quick hours, and a second one replaces the first', async () => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City' } }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/bookings/queue/')
      ? Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [] } })
      : Promise.resolve({ data: [] }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  await tap(pressableByText('Doctors 0'));
  await tap(pressableByText('+ Add New Doctor'));

  expect(flat()).toContain('TIMESLOTS(0of48selected)');
  await tap(control('Quick hours 6 PM – 9 PM'));
  expect(flat()).toContain('TIMESLOTS(6of48selected)');
  await tap(control('Quick hours 9 AM – 1 PM'));
  expect(flat()).toContain('TIMESLOTS(8of48selected)');
});

// ── Name / Type quick picks (web #179) ────────────────────────────────────────
const mountPicks = async (suggestions?: { names: string[]; types: string[] }) => {
  (API.post as jest.Mock).mockResolvedValue({ data: {} });
  await act(async () => {
    r = TestRenderer.create(
      <ScanEditorModal visible scan={null} centerId={1} unit="test" suggestions={suggestions}
        onClose={jest.fn()} onSaved={jest.fn()} />);
  });
};
const input = (placeholder: string) => r.root.findAll((n: any) =>
  n.props?.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];
const pick = (label: string) => r.root.findAll((n: any) =>
  n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const picks = { names: ['Complete Blood Count (CBC)', 'Lipid Profile'], types: ['Blood Test', 'Urine Test'] };

test('typing a name offers matching picks, and tapping one fills the box', async () => {
  await mountPicks(picks);
  await act(async () => { input('e.g. MRI Brain').props.onChangeText('cbc'); });
  expect(pick('Use Complete Blood Count (CBC)')).toBeDefined();
  expect(pick('Use Lipid Profile')).toBeUndefined();
  await tap(pick('Use Complete Blood Count (CBC)'));
  expect(input('e.g. MRI Brain').props.value).toBe('Complete Blood Count (CBC)');
  expect(pick('Use Complete Blood Count (CBC)')).toBeUndefined();      // an exact pick offers none
});

test('the Type box has its own picks', async () => {
  await mountPicks(picks);
  await tap(pick('Use Urine Test'));
  expect(input('e.g. MRI, CT, X-ray, Blood Test').props.value).toBe('Urine Test');
});

test('with no suggestions passed the form is unchanged', async () => {
  await mountPicks(undefined);
  expect(pick('Use Lipid Profile')).toBeUndefined();
  expect(pick('Use Blood Test')).toBeUndefined();
});
