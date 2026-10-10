/**
 * ROADMAP 33: the server 404s a pending, rejected or [TEST] centre for
 * everyone but its owner and admins. Renders the REAL scan-center screen
 * (a source scan can be green while the screen does the opposite, ROADMAP
 * 29) and checks a 404 reads as "not available", not as a network failure.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
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
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  'scan-center/[id]': ScanCenterScreen,
};

const failWith = (status: number | null) => {
  const err = Object.assign(new Error('x'), status ? { response: { status } } : {});
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/hospitals/') ? Promise.reject(err) : Promise.resolve({ data: [] }));
};

let r: any;
const mount = async () => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location="/scan-center/7" />);
  });
  await act(async () => { await Promise.resolve(); });
};
const text = () => JSON.stringify(r.toJSON());
afterEach(() => act(() => r.unmount()));

test('a 404 reads as not available', async () => {
  failWith(404);
  await mount();
  expect(API.get).toHaveBeenCalledWith('/hospitals/7/');
  expect(text()).toContain('This centre is not available on TokenWalla right now');
  expect(text()).not.toContain("We couldn't load this centre");
  expect(text()).toContain('Go back');
});

test('a network failure still reads as a load failure', async () => {
  failWith(null);
  await mount();
  expect(text()).toContain("We couldn't load this centre");
});
