/**
 * A centre's "Your tests" list: the search box, and Select mode (bulk edit and
 * bulk delete). The app mirror of the website's Hdashboard.bulkSelect.test.js
 * and the search half of Hdashboard.scanForm.test.js (ROADMAP items 53 slice 2a
 * and 54). The endpoints are live: POST /scans/bulk-update/ and /bulk-delete/.
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
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
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

const scan = (i: number, over: object = {}) => ({
  id: i, name: `Panel ${i}`, modality: 'Blood Test', price: 100 + i, duration_minutes: 15,
  slots: [], days: [], available: true, payment_collection_mode: 'SERVICE_ONLY', ...over,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => scan(i + 1));

let r: any;
const mount = async (scans: object[]) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await AsyncStorage.setItem('user', JSON.stringify({
    role: 'hospital', hospital: { id: 1, name: 'City', segments: ['CONSULT', 'BLOOD'] },
  }));
  (API.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url.startsWith('/scans/') ? scans : [] }));
  (API.post as jest.Mock).mockImplementation((url: string, body: any) => Promise.resolve({
    data: url.includes('bulk-delete') ? { deleted: body.ids.length, hidden: 0 } : { updated: body.rows.length },
  }));
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext({
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      dashboard: Dashboard,
    })} location="/dashboard" />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  await press(/^Services$/);
  await press(/^Tests/);
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const findText = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const pressable = (n: any) => { while (n && typeof n.props.onPress !== 'function') n = n.parent; return n; };
const press = async (label: RegExp) => {
  const p = pressable(findText(label)[0]);
  await act(async () => { p.props.onPress(); });
};
const pressLabel = async (label: string) => {
  const p = r.root.findAll((n: any) => n.props?.accessibilityLabel === label
    && typeof n.props.onPress === 'function')[0];
  await act(async () => { p.props.onPress(); });
};
const type = async (label: string, value: string) => {
  const input = r.root.findAll((n: any) => n.props?.accessibilityLabel === label
    && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText(value); });
};
const cardNames = () => findText(/^(Panel \d+|HbA1c|Fasting Glucose)$/).map((n: any) => textsOf(n));
const has = (re: RegExp) => findText(re).length > 0;
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

describe('search', () => {
  test('a short list has no search box', async () => {
    await mount(many(5));
    expect(r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Search your tests')).toHaveLength(0);
  });

  test('past 5 tests the box narrows the list by name, type or search words', async () => {
    await mount([
      ...many(6),
      scan(7, { name: 'HbA1c', modality: 'Diabetes', keywords: 'sugar, glucose' }),
    ]);
    expect(cardNames()).toHaveLength(7);
    await type('Search your tests', 'sugar');
    expect(cardNames()).toEqual(['HbA1c']);
    await type('Search your tests', 'panel 3');
    expect(cardNames()).toEqual(['Panel 3']);
    await type('Search your tests', 'zzz');
    expect(cardNames()).toEqual([]);
    expect(has(/Nothing matches your search/)).toBe(true);
  });
});

describe('select mode', () => {
  test('Select is offered past one test, and hides Add and the per-card buttons', async () => {
    await mount(many(3));
    expect(has(/^Select$/)).toBe(true);
    expect(has(/^Edit$/)).toBe(true);        // each card's own Edit
    await press(/^Select$/);
    expect(has(/^Select$/)).toBe(false);
    expect(has(/^\+ Add New/)).toBe(false);
    expect(has(/^Delete$/)).toBe(true);      // the bar's Delete, not three card buttons
    expect(findText(/^Delete$/)).toHaveLength(1);
    expect(has(/0 selected/)).toBe(true);
  });

  test('a single test needs no Select', async () => {
    await mount(many(1));
    expect(has(/^Select$/)).toBe(false);
  });

  test('tick two, delete them: the prompt names them and the ids go up', async () => {
    await mount(many(4));
    await press(/^Select$/);
    await pressLabel('Select Panel 2');
    await pressLabel('Select Panel 4');
    expect(has(/2 selected/)).toBe(true);
    await pressLabel('Delete selected');
    expect(has(/Delete 2 tests\?/)).toBe(true);
    expect(has(/Panel 2, Panel 4/)).toBe(true);
    await press(/^Delete 2$/);
    expect(API.post).toHaveBeenCalledWith('/scans/bulk-delete/', { ids: [2, 4] });
    expect(has(/Deleted 2 tests\./)).toBe(true);
    expect(has(/selected/)).toBe(false);     // select mode ended
  });

  test('a test with bookings is hidden, and the notice says so', async () => {
    await mount(many(3));
    (API.post as jest.Mock).mockResolvedValueOnce({ data: { deleted: 1, hidden: 1 } });
    await press(/^Select$/);
    await press(/^Select all \(3\)$/);
    await pressLabel('Delete selected');
    await press(/^Delete 3$/);
    expect(has(/Deleted 1 test\./)).toBe(true);
    expect(has(/1 test has booking history, so it was set to Hidden instead of deleted/)).toBe(true);
  });

  test('Keep backs out of the delete prompt without calling the server', async () => {
    await mount(many(3));
    await press(/^Select$/);
    await press(/^Select all \(3\)$/);
    await pressLabel('Delete selected');
    await press(/^Keep$/);
    expect(API.post).not.toHaveBeenCalled();
    expect(has(/3 selected/)).toBe(true);
  });

  test('Select all acts only on what the search is showing', async () => {
    await mount([...many(7), scan(8, { name: 'HbA1c', keywords: 'sugar' }), scan(9, { name: 'Fasting Glucose', keywords: 'sugar' })]);
    await type('Search your tests', 'sugar');
    await press(/^Select$/);
    await press(/^Select all \(2\)$/);
    await pressLabel('Delete selected');
    await press(/^Delete 2$/);
    expect(API.post).toHaveBeenCalledWith('/scans/bulk-delete/', { ids: [8, 9] });
  });

  test('a selection over 300 goes up in batches of 300', async () => {
    await mount(many(650));
    await press(/^Select$/);
    await press(/^Select all \(650\)$/);
    await pressLabel('Delete selected');
    await press(/^Delete 650$/);
    const sent = (API.post as jest.Mock).mock.calls.filter(c => c[0] === '/scans/bulk-delete/');
    expect(sent.map(c => c[1].ids.length)).toEqual([300, 300, 50]);
    expect(has(/Deleted 650 tests\./)).toBe(true);
  });

  test('a later batch failing leaves select mode and says how far it got', async () => {
    await mount(many(650));
    (API.post as jest.Mock)
      .mockResolvedValueOnce({ data: { deleted: 300, hidden: 0 } })
      .mockRejectedValueOnce({ response: { data: { message: 'Server busy.' } } });
    await press(/^Select$/);
    await press(/^Select all \(650\)$/);
    await pressLabel('Delete selected');
    await press(/^Delete 650$/);
    expect(has(/Server busy\. Only the first 300 of 650 were deleted or hidden\./)).toBe(true);
    expect(has(/selected/)).toBe(false);
  });
});

describe('bulk edit', () => {
  const openEdit = async (n: number) => {
    await press(/^Select$/);
    await press(new RegExp(`^Select all \\(${n}\\)$`));
    await pressLabel('Edit selected');
  };

  test('nothing can be saved until a section is ticked', async () => {
    await mount(many(3));
    await openEdit(3);
    const update = r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Update 3 tests'
      && typeof n.props.onPress === 'function')[0];
    expect(update.props.disabled).toBe(true);
  });

  test('set one price: one row per test, only the price', async () => {
    await mount(many(3));
    await openEdit(3);
    await pressLabel('Price');
    await type('New price', '500');
    await pressLabel('Update 3 tests');
    expect(API.post).toHaveBeenCalledWith('/scans/bulk-update/', {
      rows: [{ id: 1, price: 500 }, { id: 2, price: 500 }, { id: 3, price: 500 }],
    });
    expect(has(/Updated 3 tests\./)).toBe(true);
  });

  test('raise by 10% works out each test\'s own price, and shows it first', async () => {
    await mount([scan(1, { price: 100 }), scan(2, { price: 450 })]);
    await openEdit(2);
    await pressLabel('Price');
    await press(/^Raise or lower$/);
    await type('Amount', '10');
    expect(has(/₹100 →/)).toBe(true);
    expect(has(/₹110/)).toBe(true);
    expect(has(/₹495/)).toBe(true);
    await pressLabel('Update 2 tests');
    expect(API.post).toHaveBeenCalledWith('/scans/bulk-update/', {
      rows: [{ id: 1, price: 110 }, { id: 2, price: 495 }],
    });
  });

  test('a cut that would go below ₹0 cannot be saved', async () => {
    await mount([scan(1, { price: 100 }), scan(2, { price: 50 })]);
    await openEdit(2);
    await pressLabel('Price');
    await press(/^Raise or lower$/);
    await press(/^Lower by$/);
    await press(/^₹$/);
    await type('Amount', '80');
    expect(has(/below ₹0/)).toBe(true);
    const update = r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Update 2 tests'
      && typeof n.props.onPress === 'function')[0];
    expect(update.props.disabled).toBe(true);
  });

  test('hide them all and clear the note: both go up, nothing else', async () => {
    await mount(many(2));
    await openEdit(2);
    await pressLabel('Listed or hidden');
    await press(/^Hidden$/);
    await pressLabel('Before you come');
    await pressLabel('Update 2 tests');
    expect(API.post).toHaveBeenCalledWith('/scans/bulk-update/', {
      rows: [{ id: 1, available: false, prep_instructions: '' }, { id: 2, available: false, prep_instructions: '' }],
    });
  });

  test('a server refusal is shown in the form and keeps it open', async () => {
    await mount(many(2));
    (API.post as jest.Mock).mockRejectedValueOnce({ response: { data: {
      message: 'Some tests could not be updated, so none were.',
      errors: [{ id: 2, name: 'Panel 2', errors: { price: ['Price too high.'] } }],
    } } });
    await openEdit(2);
    await pressLabel('Price');
    await type('New price', '99');
    await pressLabel('Update 2 tests');
    expect(has(/Some tests could not be updated, so none were\. Panel 2: Price too high\./)).toBe(true);
    expect(has(/^Edit 2 tests$/)).toBe(true);
  });
});

describe('import from a file', () => {
  test('the button opens the import screen, and Cancel closes it', async () => {
    await mount(many(2));
    expect(has(/^Import tests from a file$/)).toBe(false);
    await press(/^Import from file$/);
    expect(has(/^Import tests from a file$/)).toBe(true);
    await press(/^Cancel$/);
    expect(has(/^Import tests from a file$/)).toBe(false);
  });

  test('a centre with no tests yet can import its first list', async () => {
    await mount([]);
    expect(has(/^Import from file$/)).toBe(true);
    expect(has(/^Select$/)).toBe(false);
  });

  test('select mode hides it', async () => {
    await mount(many(3));
    await press(/^Select$/);
    expect(has(/^Import from file$/)).toBe(false);
  });
});
