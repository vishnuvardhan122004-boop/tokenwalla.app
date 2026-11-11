/**
 * A mobile number with no account, typed into the REAL login screen.
 *
 * Get OTP and Sign In used to answer it with a red "not registered, create an
 * account first", which sent the patient off to retype the number on another
 * screen. They now open a sign-up sheet that asks name, OTP and password in
 * turn against the register screen's own endpoints. These tests hold the two
 * things that matter about it: it opens for exactly the right people (a wrong
 * password for a REAL account must not offer to create one), and it sends no
 * SMS until the patient says so. Mirrors src/componets/Login.registerPrompt
 * .test.js on the website.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Modal, TextInput, TouchableOpacity } from 'react-native';
import API from './api';
import { I18nProvider, translate } from './i18n';
import LoginScreen from '../app/(auth)/login';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = false;   // login opened fresh; true = pushed from another screen
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack, canGoBack: () => mockCanGoBack, canDismiss: () => false, dismissAll: jest.fn() }),
}));
jest.mock('../hooks/useAndroidBack', () => ({ useAndroidBack: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-localization', () => ({ getLocales: () => [] }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
// The real apiMessage (it reads the server's own wording out of an error); only
// the network is replaced.
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  __esModule: true,
  default: { post: jest.fn() },
}));

const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NEW_NUMBER   = '9123456780';
const KNOWN_NUMBER = '9876543210';

/** An axios-shaped failure, which is what apiMessage reads. */
const failure = (status: number, data: object) =>
  Promise.reject(Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data } }));

type Faults = { registerError?: [number, object]; otpRequestError?: [number, object] };

/** The server, as far as the login screen can tell. */
function serve({ registerError, otpRequestError }: Faults = {}) {
  (API.post as jest.Mock).mockImplementation((url: string, body: any) => {
    switch (url) {
      case '/auth/check-mobile/':
        return Promise.resolve({ data: { exists: body.mobile === KNOWN_NUMBER, status: 'active' } });
      case '/auth/login/':
        return body.mobile === KNOWN_NUMBER
          ? failure(401, { message: 'Invalid credentials.' })
          : failure(401, { message: 'No account found with this mobile.' });
      case '/auth/otp/request/':
        return otpRequestError ? failure(...otpRequestError) : Promise.resolve({ data: { message: 'OTP sent.' } });
      case '/auth/otp/verify/':
        return body.otp === '123456'
          ? Promise.resolve({ data: { verified: true, otp_token: 'proof' } })
          : failure(400, { message: 'Invalid or expired OTP.', verified: false });
      case '/auth/register/':
        return registerError ? failure(...registerError) : Promise.resolve({ data: {
          user: { id: 7, name: body.name, mobile: body.mobile, role: 'patient' },
          access: 'acc', refresh: 'ref',
        } });
      default:
        return Promise.reject(new Error(`unexpected ${url}`));
    }
  });
}

let r: any;
const mount = async () => {
  await act(async () => { r = TestRenderer.create(<I18nProvider><LoginScreen /></I18nProvider>); });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
};

const textOf = (node: any) => node.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join('');
const text = () => textOf(r.root);
const field = (placeholder: string) =>
  r.root.findAll((n: any) => n.type === TextInput && n.props.placeholder === placeholder)[0];
const typeInto = (placeholder: string, value: string) =>
  act(async () => { field(placeholder).props.onChangeText(value); });
const button = (label: string) =>
  r.root.findAll((n: any) => n.type === TouchableOpacity && textOf(n) === label)[0];
const press = async (label: string) => {
  const b = button(label);
  if (!b) throw new Error(`no button "${label}" in: ${text()}`);
  await act(async () => { await b.props.onPress(); });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
};
const sheetOpen = () => text().includes('Create your free account');
const sentOtp = () => (API.post as jest.Mock).mock.calls.some(([url]) => url === '/auth/otp/request/');
const called = (url: string) => (API.post as jest.Mock).mock.calls.some(([u]) => u === url);

const MOBILE_PH = '10-digit mobile number';
const PASS_PH   = 'Password or OTP';

beforeEach(async () => { jest.clearAllMocks(); await (AsyncStorage as any).clear(); });
afterEach(() => act(() => r.unmount()));

describe('who gets the sheet', () => {
  test('Get OTP for a number with no account — and no SMS is sent yet', async () => {
    serve();
    await mount();
    await typeInto(MOBILE_PH, NEW_NUMBER);
    await press('Get OTP');

    expect(sheetOpen()).toBe(true);
    expect(text()).toContain(`${NEW_NUMBER} isn't registered yet`);
    expect(text()).not.toContain('Please create an account first');
    expect(sentOtp()).toBe(false);
  });

  test('Sign In with a number and password that match no account', async () => {
    serve();
    await mount();
    await typeInto(MOBILE_PH, NEW_NUMBER);
    await typeInto(PASS_PH, 'whatever1');
    await press('Sign In →');

    expect(sheetOpen()).toBe(true);
    // The login screen does not also tell them their password is wrong.
    expect(text()).not.toContain('No account found');
    expect(text()).not.toContain('Invalid credentials');
  });

  test('Sign In with only a number, which is the usual first move of a new patient', async () => {
    serve();
    await mount();
    await typeInto(MOBILE_PH, NEW_NUMBER);
    await press('Sign In →');

    expect(sheetOpen()).toBe(true);
    expect(called('/auth/login/')).toBe(false);
  });

  test('a wrong password for a real account is just a wrong password', async () => {
    serve();
    await mount();
    await typeInto(MOBILE_PH, KNOWN_NUMBER);
    await typeInto(PASS_PH, 'wrong-pass1');
    await press('Sign In →');

    expect(text()).toContain('Invalid credentials.');
    expect(sheetOpen()).toBe(false);
  });

  test('a known number with no password still gets the old prompt, not the sheet', async () => {
    serve();
    await mount();
    await typeInto(MOBILE_PH, KNOWN_NUMBER);
    await press('Sign In →');

    expect(text()).toContain('Enter mobile and password / OTP');
    expect(sheetOpen()).toBe(false);
  });

  test('a half-typed number is never offered an account', async () => {
    serve();
    await mount();
    await typeInto(MOBILE_PH, '91234');
    await press('Sign In →');

    expect(text()).toContain('Enter mobile and password / OTP');
    expect(called('/auth/check-mobile/')).toBe(false);
    expect(sheetOpen()).toBe(false);
  });

  test('if the account check itself fails, the login error stands', async () => {
    (API.post as jest.Mock).mockImplementation((url: string) => (url === '/auth/check-mobile/'
      ? Promise.reject(new Error('network'))
      : failure(401, { message: 'No account found with this mobile.' })));
    await mount();
    await typeInto(MOBILE_PH, NEW_NUMBER);
    await typeInto(PASS_PH, 'whatever1');
    await press('Sign In →');

    expect(text()).toContain('No account found with this mobile.');
    expect(sheetOpen()).toBe(false);
  });
});

describe('the three questions', () => {
  async function openSheet(faults: Faults = {}) {
    serve(faults);
    await mount();
    await typeInto(MOBILE_PH, NEW_NUMBER);
    await press('Get OTP');
    expect(sheetOpen()).toBe(true);
  }
  const NAME_PH = 'e.g. Rahul Kumar';
  const OTP_PH  = 'Enter the code';
  const PW_PH   = 'Min 6 chars, letters + numbers';

  async function toPasswordStep() {
    await typeInto(NAME_PH, 'Rahul Kumar');
    await press('Send OTP →');
    await typeInto(OTP_PH, '123456');
    await press('Verify →');
  }

  test('name, then the OTP, then a password — and the patient lands signed in', async () => {
    await openSheet();
    await typeInto(NAME_PH, 'Rahul Kumar');
    await press('Send OTP →');
    expect(API.post).toHaveBeenCalledWith('/auth/otp/request/', { mobile: NEW_NUMBER });
    expect(text()).toContain('Step 2 of 3');

    await typeInto(OTP_PH, '123456');
    await press('Verify →');
    expect(text()).toContain('Step 3 of 3');

    await typeInto(PW_PH, 'Test@1234');
    await press('Create my account →');

    // Same body the register screen sends, OTP proof included.
    expect(API.post).toHaveBeenCalledWith('/auth/register/', {
      name: 'Rahul Kumar', mobile: NEW_NUMBER, password: 'Test@1234', otp_token: 'proof',
    });
    expect(await AsyncStorage.getItem('access')).toBe('acc');
    expect(await AsyncStorage.getItem('refresh')).toBe('ref');
    expect(JSON.parse((await AsyncStorage.getItem('user')) as string).name).toBe('Rahul Kumar');
    expect(mockReplace).toHaveBeenCalledWith('/(patient)/home');
  });

  test('opened from "Login to Book", a new account goes back to that doctor, not Home', async () => {
    mockCanGoBack = true;
    try {
      await openSheet();
      await typeInto(NAME_PH, 'Rahul Kumar');
      await press('Send OTP →');
      await typeInto(OTP_PH, '123456');
      await press('Verify →');
      await typeInto(PW_PH, 'Test@1234');
      await press('Create my account →');
      expect(mockBack).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalledWith('/(patient)/home');
    } finally {
      mockCanGoBack = false;
    }
  });

  test('a one-letter name is refused before any SMS is sent', async () => {
    await openSheet();
    await typeInto(NAME_PH, 'R');
    await press('Send OTP →');

    expect(text()).toContain('Enter your full name');
    expect(sentOtp()).toBe(false);
  });

  test("a wrong OTP shows the server's reason and stays on the OTP step", async () => {
    await openSheet();
    await typeInto(NAME_PH, 'Rahul Kumar');
    await press('Send OTP →');
    await typeInto(OTP_PH, '000000');
    await press('Verify →');

    expect(text()).toContain('Invalid or expired OTP.');
    expect(text()).toContain('Step 2 of 3');
    expect(called('/auth/register/')).toBe(false);
  });

  test('Verify stays disabled until all six digits are in', async () => {
    await openSheet();
    await typeInto(NAME_PH, 'Rahul Kumar');
    await press('Send OTP →');
    await typeInto(OTP_PH, '12');
    expect(button('Verify →').props.disabled).toBe(true);
    await typeInto(OTP_PH, '123456');
    expect(button('Verify →').props.disabled).toBe(false);
  });

  test('an all-numeric password is refused before the request', async () => {
    await openSheet();
    await toPasswordStep();
    await typeInto(PW_PH, '123456');
    await press('Create my account →');

    expect(text()).toContain('Password cannot be entirely numbers');
    expect(called('/auth/register/')).toBe(false);
  });

  test("the server's password rejection is shown, not a generic failure", async () => {
    await openSheet({ registerError: [400, { password: ['This password is too common.'] }] });
    await toPasswordStep();
    await typeInto(PW_PH, 'Password1');
    await press('Create my account →');

    expect(text()).toContain('This password is too common.');
    expect(await AsyncStorage.getItem('access')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('a 429 on the OTP request shows the wait and counts it down', async () => {
    await openSheet({ otpRequestError: [429, { message: 'Wait 60 seconds before requesting again.' }] });
    await typeInto(NAME_PH, 'Rahul Kumar');
    await press('Send OTP →');

    expect(text()).toContain('Wait 60 seconds before requesting again.');
    expect(button('Wait 60s').props.disabled).toBe(true);
  });
});

describe('getting out of it', () => {
  test('"Wrong number?" closes the sheet and the number is still there', async () => {
    serve();
    await mount();
    await typeInto(MOBILE_PH, NEW_NUMBER);
    await press('Get OTP');
    await press('Wrong number? Change it');

    expect(sheetOpen()).toBe(false);
    expect(field(MOBILE_PH).props.value).toBe(NEW_NUMBER);
  });

  test('Android Back closes it', async () => {
    serve();
    await mount();
    await typeInto(MOBILE_PH, NEW_NUMBER);
    await press('Get OTP');
    await act(async () => { r.root.findByType(Modal).props.onRequestClose(); });

    expect(sheetOpen()).toBe(false);
  });
});

describe('dictionaries', () => {
  // The step titles are looked up by a key held in an array, which the key scan
  // in i18n.keys.test.ts cannot see.
  const SRC = fs.readFileSync(path.join(__dirname, '../components/RegisterPrompt.tsx'), 'utf8');
  const keys = [...SRC.matchAll(/'(rp_step\d)'/g)].map(m => m[1]);

  test('the step keys exist at all', () => expect(keys).toEqual(['rp_step1', 'rp_step2', 'rp_step3']));

  test.each(['en', 'hi', 'te', 'kn'] as const)('every step title resolves in %s', (lang) => {
    expect(keys.filter(k => translate(lang, k) === k)).toEqual([]);
  });
});
