/**
 * Web ROADMAP 72d: shops (stationery or medical) sign up on the website, so
 * the app's login screen only links there. Pressing it opens the website's
 * /shop/register page in the browser.
 */
import React from 'react';
import { Linking, TouchableOpacity } from 'react-native';
import { I18nProvider } from './i18n';
import LoginScreen from '../app/(auth)/login';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false, canDismiss: () => false, dismissAll: jest.fn() }),
}));
jest.mock('../hooks/useAndroidBack', () => ({ useAndroidBack: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-localization', () => ({ getLocales: () => [] }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('./api', () => ({ ...jest.requireActual('./api'), __esModule: true, default: { post: jest.fn() } }));

const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const textOf = (node: any) => node.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string').join('');

it('the shop link opens the website sign-up page', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  let r: any;
  await act(async () => { r = TestRenderer.create(<I18nProvider><LoginScreen /></I18nProvider>); });
  const link = r.root.findAll((n: any) => n.type === TouchableOpacity
    && textOf(n) === 'Stationery or medical shop?  Register here →')[0];
  expect(link).toBeTruthy();
  await act(async () => { link.props.onPress(); });
  expect(open).toHaveBeenCalledWith('https://www.tokenwalla.com/shop/register');
  open.mockRestore();
});
