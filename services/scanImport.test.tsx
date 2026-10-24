/**
 * Importing a centre's price list from a CSV: read on the server (nothing
 * saved), preview every row, untick or fix, add the ticked ones. The app mirror
 * of the website's ScanImport.test.js (web #180). The endpoints are live:
 * POST /scans/import-preview/ and /scans/import/.
 */
import React from 'react';
import API from './api';
import ScanImport from '../components/ScanImport';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const mockWritten: { name?: string; text?: string } = {};
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    uri: string; exists = false;
    constructor(_dir: string, name: string) { this.uri = `file:///cache/${name}`; mockWritten.name = name; }
    delete() {} create() {} write(text: string) { mockWritten.text = text; }
  },
}));
jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DocumentPicker = require('expo-document-picker');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sharing = require('expo-sharing');
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const previewRows = [
  { row: 2, status: 'new', errors: [], name: 'CBC', modality: 'Blood Test', price: 350, duration_minutes: 15, prep_instructions: 'No fasting' },
  { row: 3, status: 'new', errors: [], name: 'Lipid Profile', modality: 'Blood Test', price: 650, duration_minutes: 15, prep_instructions: '' },
  { row: 4, status: 'exists', errors: [], name: 'TSH', modality: 'Blood Test', price: 400, duration_minutes: 15, prep_instructions: '' },
  { row: 5, status: 'invalid', errors: ['Price is missing.'], name: 'HbA1c', modality: '', price: null, duration_minutes: 15, prep_instructions: '' },
];

let r: any;
const onDone = jest.fn();
const onClose = jest.fn();
const mount = async (rows: object[] = previewRows) => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false, assets: [{ uri: 'file:///cache/prices.csv', name: 'prices.csv', mimeType: 'text/csv' }],
  });
  (API.post as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url.includes('import-preview') ? { rows } : { created: 2, skipped: [] } }));
  await act(async () => {
    r = TestRenderer.create(<ScanImport centerId={1} unit="test" onDone={onDone} onClose={onClose} />);
  });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const press = async (re: RegExp) => {
  let p = texts(re)[0];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
};
const byLabel = (label: string) => r.root.findAll((n: any) => n.props?.accessibilityLabel === label
  && (typeof n.props.onPress === 'function' || typeof n.props.onChangeText === 'function'))[0];
const choose = async () => { await press(/^Choose CSV file$/); };
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

test('choosing a file uploads it with the centre and previews every row', async () => {
  await mount();
  expect(texts(/Add \d/)).toHaveLength(0);                       // nothing to add before a file
  await choose();
  const [url, body] = (API.post as jest.Mock).mock.calls[0];
  expect(url).toBe('/scans/import-preview/');
  expect(body.get('center')).toBe('1');
  expect(body.get('file')).toBeTruthy();
  expect(texts(/^2 new, 1 already listed, 1 with problems$/)).toHaveLength(1);
  expect(texts(/Rows with problems are not added/)).toHaveLength(1);
  expect(texts(/^Price is missing\.$/)).toHaveLength(1);
  expect(texts(/Already listed - skipped/)).toHaveLength(1);
  expect(texts(/^Add 2 tests$/)).toHaveLength(1);
});

test('Add sends only the ticked rows, as edited, and reports the summary', async () => {
  await mount();
  await choose();
  const name = byLabel('Price (Rs) for row 2');
  await act(async () => { name.props.onChangeText('375'); });
  await press(/^Add 2 tests$/);
  const [url, sent] = (API.post as jest.Mock).mock.calls[1];
  expect(url).toBe('/scans/import/');
  expect(sent).toEqual({
    center: 1,
    rows: [
      { name: 'CBC', modality: 'Blood Test', price: 375, duration_minutes: 15, prep_instructions: 'No fasting' },
      { name: 'Lipid Profile', modality: 'Blood Test', price: 650, duration_minutes: 15, prep_instructions: '' },
    ],
  });
  expect(onDone).toHaveBeenCalledWith(
    'Added 2 tests. They have no time slots yet - open each to add slots so patients can book online.');
});

test('unticking a row leaves it out', async () => {
  await mount();
  await choose();
  await act(async () => { byLabel('Add row 3').props.onPress(); });
  expect(texts(/^Add 1 test$/)).toHaveLength(1);
  await press(/^Add 1 test$/);
  expect((API.post as jest.Mock).mock.calls[1][1].rows.map((x: any) => x.name)).toEqual(['CBC']);
});

test('a blank price goes up as null, never 0', async () => {
  await mount();
  await choose();
  await act(async () => { byLabel('Price (Rs) for row 2').props.onChangeText(''); });
  await press(/^Add 2 tests$/);
  expect((API.post as jest.Mock).mock.calls[1][1].rows[0].price).toBeNull();
});

test('the server\'s row errors land on the right row, by position among the ticked ones', async () => {
  await mount();
  await choose();
  await act(async () => { byLabel('Add row 2').props.onPress(); });          // leave out row 2: Lipid is now index 0
  (API.post as jest.Mock).mockRejectedValueOnce({ response: { data: {
    message: 'Some tests could not be added, so none were. Fix them and try again.',
    errors: [{ index: 0, name: 'Lipid Profile', errors: { price: ['Price is too high (maximum 1,000,000).'] } }],
  } } });
  await press(/^Add 1 test$/);
  expect(texts(/Some tests could not be added, so none were/)).toHaveLength(1);
  expect(texts(/^Price: Price is too high \(maximum 1,000,000\)\.$/)).toHaveLength(1);
  expect(onDone).not.toHaveBeenCalled();
});

test('an unreadable file shows the server\'s reason and no preview', async () => {
  await mount();
  (API.post as jest.Mock).mockRejectedValueOnce({ response: { data: { message: 'Save the file as CSV (in Excel: File > Save As > CSV) and upload that.' } } });
  await choose();
  expect(texts(/Save the file as CSV/)).toHaveLength(1);
  expect(texts(/Add \d/)).toHaveLength(0);
});

test('backing out of the picker changes nothing', async () => {
  await mount();
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
  await choose();
  expect(API.post).not.toHaveBeenCalled();
});

test('Get template shares a CSV with the heading row and the centre\'s own examples', async () => {
  await mount();
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  await press(/^Get template$/);
  expect(mockWritten.name).toBe('tokenwalla-tests-template.csv');
  expect(mockWritten.text).toContain('Name,Type,Price,Duration (min),Before you come');
  expect(mockWritten.text).toContain('Lipid Profile');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/tokenwalla-tests-template.csv',
    expect.objectContaining({ mimeType: 'text/csv' }));
});
