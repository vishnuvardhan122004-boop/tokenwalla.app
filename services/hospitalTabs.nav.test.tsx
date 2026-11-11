/**
 * Drives the REAL app/(hospital)/(tabs)/_layout.tsx through a navigator, with
 * stub screens. A source scan can be green while navigation does the opposite
 * (ROADMAP 29).
 *   - The two back tests go red on the first version of the hospital bar,
 *     whose backBehavior 'history' made Android back ping-pong
 *     Dashboard <-> Scanner.
 *   - The two dismissTo tests prove the MECHANISM Profile's rows rely on (from
 *     a screen pushed over the tabs, dismissTo returns to them, leaving one
 *     bar). They call dismissTo themselves, against a stub Profile, so they
 *     cannot see profile.tsx; roleGating.scan.test.ts pins that its rows use
 *     dismissTo and not push/replace.
 *
 * Uses expo-router's own test harness (ExpoRoot + mock context), the parts
 * that need no @testing-library/react-native. Those are build/ internals: if
 * an expo-router upgrade moves them, fix the imports, don't delete the test.
 */
import React from 'react';
import { Text } from 'react-native';
import { router, Stack, Redirect } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import TabsLayout from '../app/(hospital)/(tabs)/_layout';
import { safeBack } from '../utils/navigation';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routes = {
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  index: () => <Redirect href="/(hospital)/dashboard" />,
  '(hospital)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(hospital)/(tabs)/_layout': TabsLayout,
  '(hospital)/(tabs)/dashboard': () => <Text>DASH</Text>,
  '(hospital)/(tabs)/scanner': () => <Text>SCAN</Text>,
  '(hospital)/Hprofile': () => <Text>HPROFILE</Text>,
};
const path = () => store.getRouteInfo().pathname;
// How many hospital tab bars exist anywhere in the navigation tree.
const countTabs = (s: any): number => !s ? 0 : s.routes.reduce((n: number, r: any) =>
  n + (r.name === '(tabs)' ? 1 : 0) + countTabs(r.state), 0);
const tabBars = () => countTabs(store.navigationRef.getRootState());
const androidBack = () => store.navigationRef.goBack(); // what the container does with no screen handler
let r: any;
beforeEach(() => {
  jest.useFakeTimers();
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  act(() => { r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location="/" />); });
});
afterEach(() => act(() => r.unmount()));

test('back: Scanner -> Dashboard -> out, never back into Scanner', () => {
  expect(path()).toBe('/dashboard');
  act(() => router.push('/(hospital)/scanner'));        // dashboard "Scan QR"
  expect(path()).toBe('/scanner');
  act(() => router.navigate('/(hospital)/dashboard'));  // Dashboard tab
  expect(path()).toBe('/dashboard');
  expect(store.navigationRef.canGoBack()).toBe(false);  // back on home tab = leave
  act(() => router.push('/(hospital)/scanner'));
  act(() => safeBack(router, '/(hospital)/dashboard')); // scanner's back
  expect(path()).toBe('/dashboard');
  expect(store.navigationRef.canGoBack()).toBe(false);
});

test('Dashboard -> Scanner -> Dashboard: Android back leaves, it does not reopen Scanner', () => {
  act(() => router.push('/(hospital)/scanner'));
  act(() => router.navigate('/(hospital)/dashboard'));
  act(() => { if (store.navigationRef.canGoBack()) androidBack(); });
  expect(path()).toBe('/dashboard');                    // nothing to go back to: the app exits
});

test('dismissTo a tab from a screen over the tabs returns to them: one bar (Scan Patient QR)', () => {
  act(() => router.push('/(hospital)/Hprofile'));
  expect(path()).toBe('/Hprofile');
  act(() => router.dismissTo('/(hospital)/scanner'));
  expect(path()).toBe('/scanner');
  expect(tabBars()).toBe(1);
  act(() => safeBack(router, '/(hospital)/dashboard'));
  expect(path()).toBe('/dashboard');
  expect(store.navigationRef.canGoBack()).toBe(false);
});

test('dismissTo a tab from a screen over the tabs returns to them: one bar (Queue & Doctors Dashboard)', () => {
  act(() => router.push('/(hospital)/scanner'));
  act(() => router.push('/(hospital)/Hprofile'));
  act(() => router.dismissTo('/(hospital)/dashboard'));
  expect(path()).toBe('/dashboard');
  expect(tabBars()).toBe(1);
});
