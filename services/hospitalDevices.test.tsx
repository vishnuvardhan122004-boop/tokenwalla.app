/**
 * The hospital's "Signed-in devices" card (components/SignedInDevices.tsx),
 * rendered for real against a mocked API: one row per session with this device
 * marked, Sign out on every OTHER row hitting that session's revoke endpoint
 * and reloading, and "Sign out all other devices" only when there are others.
 */
import React from 'react';
import { Alert } from 'react-native';
import API from './api';
import SignedInDevices, { activeLabel } from '../components/SignedInDevices';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  apiMessage: (_e: unknown, f: string) => f,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date().toISOString();
const THIS = { id: 'a', device: 'Pixel 7', ip: null, created_at: now, last_seen_at: now, current: true };
const OTHER = { id: 'b', device: '', ip: '49.37.1.2', created_at: now,
  last_seen_at: new Date(Date.now() - 3 * 3600_000).toISOString(), current: false };

let r: any;
const mount = async (sessions: object[]) => {
  (API.get as jest.Mock).mockResolvedValue({ data: sessions });
  await act(async () => { r = TestRenderer.create(<SignedInDevices />); });
};
const text = () => r.root.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join('');
const button = (label: string) => r.root.findAll((n: any) =>
  typeof n.props?.onPress === 'function' && n.findAll((c: any) =>
    c.type === 'Text' && c.props.children === label).length > 0)[0];
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

test('one row per device, this one marked, sign-out only on the others', async () => {
  await mount([THIS, OTHER]);
  expect(API.get).toHaveBeenCalledWith('/auth/sessions/');
  const t = text();
  expect(t).toContain('2 devices signed in to this account');
  expect(t).toContain('Pixel 7');
  expect(t).toContain('This device');
  expect(t).toContain('Unknown device');
  expect(t).toContain('Active now');
  expect(t).toContain('Active 3 h ago');
  expect(r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Sign out Pixel 7')).toHaveLength(0);
  expect(button('Sign out all other devices')).toBeTruthy();
});

test('Sign out confirms, revokes that session, then reloads the list', async () => {
  await mount([THIS, OTHER]);
  const row = r.root.findAll((n: any) => n.props?.accessibilityLabel === 'Sign out Unknown device'
    && typeof n.props.onPress === 'function')[0];
  await act(async () => { row.props.onPress(); });
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0][1]).toContain('Sign out Unknown device?');
  expect(API.post).not.toHaveBeenCalled();   // nothing until confirmed

  (API.post as jest.Mock).mockResolvedValue({ data: { revoked: 1 } });
  (API.get as jest.Mock).mockResolvedValue({ data: [THIS] });
  const confirm = (alert.mock.calls[0][2] as any[]).find(b => b.style === 'destructive');
  await act(async () => { await confirm.onPress(); });

  expect(API.post).toHaveBeenCalledWith('/auth/sessions/b/revoke/');
  expect(API.get).toHaveBeenCalledTimes(2);
  expect(alert.mock.calls[1][0]).toBe('Signed out');
  expect(text()).toContain('1 device signed in to this account');
  expect(text()).not.toContain('Unknown device');
});

test('"Sign out all other devices" hits revoke-others, and is absent with one device', async () => {
  await mount([THIS, OTHER]);
  await act(async () => { button('Sign out all other devices').props.onPress(); });
  (API.post as jest.Mock).mockResolvedValue({ data: { revoked: 1 } });
  (API.get as jest.Mock).mockResolvedValue({ data: [THIS] });
  const confirm = (alert.mock.calls[0][2] as any[]).find(b => b.style === 'destructive');
  await act(async () => { await confirm.onPress(); });
  expect(API.post).toHaveBeenCalledWith('/auth/sessions/revoke-others/');
  expect(button('Sign out all other devices')).toBeUndefined();
  expect(button('Sign out')).toBeUndefined();
});

test('activeLabel: under 10 min is "Active now", then min / h / days', () => {
  const at = (msAgo: number) => activeLabel(new Date(1e12 - msAgo).toISOString(), 1e12);
  expect(at(9 * 60_000)).toBe('Active now');
  expect(at(10 * 60_000)).toBe('Active 10 min ago');
  expect(at(2 * 3600_000)).toBe('Active 2 h ago');
  expect(at(86400_000)).toBe('Active 1 day ago');
  expect(at(3 * 86400_000)).toBe('Active 3 days ago');
});
