/**
 * Continue with Google on the REAL login screen (ROADMAP 62, slice 3).
 *
 * Google's account picker is faked (services/googleAuth), so nothing native runs.
 * These hold what matters about it: the button only appears where Google
 * sign-in can run, a linked account signs straight in and lands where its role
 * belongs (patient home or a hospital's dashboard), a new account is asked for a
 * mobile and an OTP before anything is linked, and no SMS goes out until they
 * tap Send OTP. Mirrors src/componets/GoogleSignIn.test.js on the website.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import API from './api';
import { getGoogleCredential, isGoogleSignInAvailable } from './googleAuth';
import { I18nProvider } from './i18n';
import LoginScreen from '../app/(auth)/login';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), canGoBack: () => true, canDismiss: () => false, dismissAll: jest.fn() }),
}));
jest.mock('../hooks/useAndroidBack', () => ({ useAndroidBack: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-localization', () => ({ getLocales: () => [] }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  __esModule: true,
  default: { post: jest.fn() },
}));
jest.mock('./googleAuth', () => ({
  isGoogleSignInAvailable: jest.fn(),
  getGoogleCredential: jest.fn(),
}));

const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const failure = (status: number, data: object) =>
  Promise.reject(Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data } }));

const PATIENT  = { id: 7, name: 'Rahul Kumar', mobile: '9876543210', role: 'patient' };
const HOSPITAL = { id: 1, name: 'Sri Sarwodhaya', mobile: '9333300101', role: 'hospital', hospital: { id: 3 } };
const NEEDS_MOBILE = { needs_mobile: true, link_token: 'LINK', name: 'Rahul Kumar', email: 'rahul@gmail.com' };

type Faults = { googleError?: [number, object]; linkError?: [number, object]; wrongOtp?: boolean };

/** The server, as far as the Google flow can tell. */
function serve(googleReply: object, { googleError, linkError, wrongOtp }: Faults = {}) {
  (API.post as jest.Mock).mockImplementation((url: string, body: any) => {
    switch (url) {
      case '/auth/google/':
        return googleError ? failure(...googleError) : Promise.resolve({ data: googleReply });
      case '/auth/otp/request/':
        return Promise.resolve({ data: { message: 'OTP sent.' } });
      case '/auth/otp/verify/':
        return wrongOtp || body.otp !== '123456'
          ? failure(400, { message: 'Invalid or expired OTP.', verified: false })
          : Promise.resolve({ data: { verified: true, otp_token: 'PROOF' } });
      case '/auth/google/link/':
        return linkError ? failure(...linkError)
          : Promise.resolve({ data: { user: PATIENT, access: 'acc', refresh: 'ref', created: true } });
      default:
        return Promise.reject(new Error(`unexpected ${url}`));
    }
  });
}

let r: any;
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const mount = async () => {
  await act(async () => { r = TestRenderer.create(<I18nProvider><LoginScreen /></I18nProvider>); });
  await flush();
};
const textOf = (node: any) => node.findAll((n: any) => n.type === 'Text')
  .flatMap((n: any) => [n.props.children].flat(Infinity))
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
  .join('');
const text = () => textOf(r.root);
const button = (label: string) =>
  r.root.findAll((n: any) => n.type === TouchableOpacity && textOf(n) === label)[0];
const press = async (label: string) => {
  const b = button(label);
  if (!b) throw new Error(`no button "${label}" in: ${text()}`);
  await act(async () => { await b.props.onPress(); });
  await flush();
};
// The LAST match: the sheet is rendered after the login screen, and both have a
// field with the placeholder '10-digit mobile number'.
const typeInto = (placeholder: string, value: string) => act(async () => {
  const fields = r.root.findAll((n: any) => n.type === TextInput && n.props.placeholder === placeholder);
  fields[fields.length - 1].props.onChangeText(value);
});
const called = (url: string) => (API.post as jest.Mock).mock.calls.some(([u]) => u === url);
const callTo = (url: string) => (API.post as jest.Mock).mock.calls.find(([u]) => u === url);

const GOOGLE = 'Continue with Google';

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
  (isGoogleSignInAvailable as jest.Mock).mockReturnValue(true);
  (getGoogleCredential as jest.Mock).mockResolvedValue('google.id.token');
});
afterEach(() => act(() => r.unmount()));

describe('the button', () => {
  test('is absent where Google sign-in cannot run, and the screen is otherwise unchanged', async () => {
    (isGoogleSignInAvailable as jest.Mock).mockReturnValue(false);
    await mount();
    expect(button(GOOGLE)).toBeUndefined();
    expect(text()).toContain('Forgot Password?');
    expect(text()).toContain('Create one free');
  });

  test('shows next to the other ways in', async () => {
    await mount();
    expect(button(GOOGLE)).toBeDefined();
  });
});

describe('a linked Google account', () => {
  test('a patient signs straight in and lands on home', async () => {
    serve({ user: PATIENT, access: 'pacc', refresh: 'pref' });
    await mount();
    await press(GOOGLE);

    expect(callTo('/auth/google/')![1]).toEqual({ credential: 'google.id.token' });
    expect(await AsyncStorage.getItem('access')).toBe('pacc');
    expect(JSON.parse((await AsyncStorage.getItem('user'))!).role).toBe('patient');
    expect(mockReplace).toHaveBeenCalledWith('/(patient)/home');
  });

  test("a hospital's staff land on the hospital dashboard", async () => {
    serve({ user: HOSPITAL, access: 'hacc', refresh: 'href' });
    await mount();
    await press(GOOGLE);

    expect(await AsyncStorage.getItem('access')).toBe('hacc');
    expect(mockReplace).toHaveBeenCalledWith('/(hospital)/dashboard');
  });

  test('backing out of the picker does nothing, quietly', async () => {
    (getGoogleCredential as jest.Mock).mockResolvedValue(null);
    serve({});
    await mount();
    await press(GOOGLE);

    expect(called('/auth/google/')).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(text()).not.toContain('failed');
  });

  test("the server's own refusal is shown, and nobody is signed in", async () => {
    serve({}, { googleError: [403, { message: 'Account blocked. Contact support.' }] });
    await mount();
    await press(GOOGLE);

    expect(text()).toContain('Account blocked. Contact support.');
    expect(await AsyncStorage.getItem('access')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('a picker failure (no Play services) says so in our words', async () => {
    (getGoogleCredential as jest.Mock).mockRejectedValue(new Error('PLAY_SERVICES_NOT_AVAILABLE'));
    serve({});
    await mount();
    await press(GOOGLE);

    expect(text()).toContain('Google sign-in failed. Please try again.');
    expect(called('/auth/google/')).toBe(false);
  });
});

describe('a Google account nobody has linked yet', () => {
  const sheetOpen = () => text().includes('add your mobile');

  test('is asked for a mobile, and no SMS goes until Send OTP', async () => {
    serve(NEEDS_MOBILE);
    await mount();
    await press(GOOGLE);

    expect(sheetOpen()).toBe(true);
    expect(text()).toContain('Hi Rahul, add your mobile');
    expect(text()).toContain('rahul@gmail.com');
    expect(called('/auth/otp/request/')).toBe(false);
    expect(await AsyncStorage.getItem('access')).toBeNull();
  });

  test('a bad number is refused without sending anything', async () => {
    serve(NEEDS_MOBILE);
    await mount();
    await press(GOOGLE);
    await typeInto('10-digit mobile number', '12345');
    await press('Send OTP →');

    expect(text()).toContain('Enter a valid 10-digit mobile number');
    expect(called('/auth/otp/request/')).toBe(false);
  });

  test('mobile, then OTP, then Google is linked with the OTP proof and they are signed in', async () => {
    serve(NEEDS_MOBILE);
    await mount();
    await press(GOOGLE);
    await typeInto('10-digit mobile number', '9876543210');
    await press('Send OTP →');
    expect(callTo('/auth/otp/request/')![1]).toEqual({ mobile: '9876543210' });

    await typeInto('Enter the code', '123456');
    await press('Verify & continue →');

    expect(callTo('/auth/google/link/')![1]).toEqual({
      link_token: 'LINK', mobile: '9876543210', otp_token: 'PROOF',
    });
    expect(await AsyncStorage.getItem('access')).toBe('acc');
    expect(mockReplace).toHaveBeenCalledWith('/(patient)/home');
    expect(sheetOpen()).toBe(false);
  });

  test('a wrong OTP never reaches the link endpoint', async () => {
    serve(NEEDS_MOBILE, { wrongOtp: true });
    await mount();
    await press(GOOGLE);
    await typeInto('10-digit mobile number', '9876543210');
    await press('Send OTP →');
    await typeInto('Enter the code', '000000');
    await press('Verify & continue →');

    expect(text()).toContain('Invalid or expired OTP.');
    expect(called('/auth/google/link/')).toBe(false);
    expect(await AsyncStorage.getItem('access')).toBeNull();
  });

  test("a hospital's number is refused with the server's reason, and they stay signed out", async () => {
    serve(NEEDS_MOBILE, { linkError: [403, { message: 'This number belongs to a hospital account. Sign in at Hospital Login, then add Google under Profile → Google sign-in.' }] });
    await mount();
    await press(GOOGLE);
    await typeInto('10-digit mobile number', '9333300101');
    await press('Send OTP →');
    await typeInto('Enter the code', '123456');
    await press('Verify & continue →');

    expect(text()).toContain('belongs to a hospital account');
    expect(await AsyncStorage.getItem('access')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('closing the sheet signs nobody in', async () => {
    serve(NEEDS_MOBILE);
    await mount();
    await press(GOOGLE);
    const close = r.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityLabel === 'Close')[0];
    await act(async () => { close.props.onPress(); });

    expect(sheetOpen()).toBe(false);
    expect(await AsyncStorage.getItem('access')).toBeNull();
  });
});
