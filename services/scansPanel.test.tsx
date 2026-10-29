/**
 * ScansPanel on its own, without the 2,300-line dashboard around it: the tests
 * list's state lives here, the pinned Select bar is handed up through onBar, and
 * a parent re-render with the same props (the dashboard's 10 s queue poll) does
 * not re-render it.
 */
import React, { type ReactNode, useState } from 'react';
import { Text } from 'react-native';
import API from './api';
import ScansPanel from '../components/ScansPanel';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const scan = (id: number) => ({
  id, name: `Panel ${id}`, modality: 'Blood Test', price: 100 + id, duration_minutes: 15,
  slots: [], days: [], available: true, payment_collection_mode: 'SERVICE_ONLY',
});
const scans = [1, 2, 3].map(scan);

const onAdd = jest.fn();
const onEdit = jest.fn();
const onPoster = jest.fn();
const loadScans = jest.fn().mockResolvedValue(undefined);
const props = { scans, loadScans, centerId: 1, unit: 'test' as const, bloodOnly: true, onAdd, onEdit, onPoster };

/** The dashboard's wiring: the panel in the page, its bar drawn beside it. */
function Host({ open = true }: { open?: boolean }) {
  const [bar, setBar] = useState<ReactNode>(null);
  return <>{open && <ScansPanel {...props} onBar={setBar} />}{bar}</>;
}

let r: any;
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

test('Add and Edit are handed to the page, which owns the editor', async () => {
  await act(async () => { r = TestRenderer.create(<Host />); });
  await press(/^\+ Add New Test$/);
  expect(onAdd).toHaveBeenCalledTimes(1);
  await press(/^Edit$/);
  expect(onEdit).toHaveBeenCalledWith(scans[0]);
});

test('Poster is handed to the page, and hidden until the centre has loaded', async () => {
  await act(async () => { r = TestRenderer.create(<Host />); });
  await press(/^Poster$/);
  expect(onPoster).toHaveBeenCalledTimes(1);
  await act(async () => { r.update(<ScansPanel {...props} centerId={undefined} onBar={jest.fn()} />); });
  expect(texts(/^Poster$/)).toHaveLength(0);
});

test('Select hands the bar up, and Cancel takes it away again', async () => {
  await act(async () => { r = TestRenderer.create(<Host />); });
  expect(texts(/selected/)).toHaveLength(0);
  await press(/^Select$/);
  expect(texts(/^0 selected$/)).toHaveLength(1);       // drawn by the host, outside the panel
  await press(/^Select all \(3\)$/);
  expect(texts(/^3 selected$/)).toHaveLength(1);
  await press(/^Cancel$/);
  expect(texts(/selected/)).toHaveLength(0);
});

test('unmounting the panel (leaving the tab) removes the bar and ends select mode', async () => {
  await act(async () => { r = TestRenderer.create(<Host />); });
  await press(/^Select$/);
  expect(texts(/^0 selected$/)).toHaveLength(1);
  await act(async () => { r.update(<Host open={false} />); });
  expect(texts(/selected/)).toHaveLength(0);
  await act(async () => { r.update(<Host />); });
  expect(texts(/^Select$/)).toHaveLength(1);           // back, and not still selecting
});

test('a parent re-render with the same props does not re-render the panel', async () => {
  const onBar = jest.fn();
  const el = (n: number) => <><Text>{n}</Text><ScansPanel {...props} onBar={onBar} /></>;
  await act(async () => { r = TestRenderer.create(el(1)); });
  const first = onBar.mock.calls.length;                // the panel's own effect, once
  await act(async () => { r.update(el(2)); });
  await act(async () => { r.update(el(3)); });
  expect(onBar.mock.calls.length).toBe(first);
  // New scans do re-render it.
  await act(async () => { r.update(<ScansPanel {...props} scans={[...scans, scan(4)]} onBar={onBar} />); });
  expect(onBar.mock.calls.length).toBeGreaterThan(first);
});

test('a bulk delete reloads through the page\'s loadScans', async () => {
  (API.post as jest.Mock).mockResolvedValue({ data: { deleted: 2, hidden: 0 } });
  await act(async () => { r = TestRenderer.create(<Host />); });
  await press(/^Select$/);
  await press(/^Select all \(3\)$/);
  const del = r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Delete selected'
    && typeof n.props.onPress === 'function')[0];
  await act(async () => { del.props.onPress(); });
  await press(/^Delete 3$/);
  expect(API.post).toHaveBeenCalledWith('/scans/bulk-delete/', { ids: [1, 2, 3] });
  expect(loadScans).toHaveBeenCalled();
});
