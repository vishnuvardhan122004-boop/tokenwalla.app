/**
 * services/googleAuth.ts — the device half of Continue with Google.
 *
 * The native module is faked, because the real one only exists in a compiled
 * build. What matters here is when the button may show at all (a screen that
 * crashes on a missing native module is worse than no button), and what is asked
 * of Google: our WEB client ID, because that is the audience the backend checks.
 */

const WEB_ID = 'web-client.apps.googleusercontent.com';

type Setup = { os?: string; clientId?: string; native?: object | 'throws' };

/** Loads a fresh copy of the service: it caches whether the native module loaded. */
function load({ os = 'android', clientId = WEB_ID, native }: Setup = {}) {
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: os } }));
  jest.doMock('../constants/config', () => ({ GOOGLE_WEB_CLIENT_ID: clientId }));
  if (native === 'throws') {
    jest.doMock('@react-native-google-signin/google-signin', () => {
      throw new Error("TurboModuleRegistry: 'RNGoogleSignin' could not be found");
    });
  } else {
    jest.doMock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: native }));
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./googleAuth') as typeof import('./googleAuth');
}

const fakeNative = (over: Record<string, jest.Mock> = {}) => ({
  configure: jest.fn(),
  hasPlayServices: jest.fn().mockResolvedValue(true),
  signIn: jest.fn().mockResolvedValue({ type: 'success', data: { idToken: 'google.id.token', user: {} } }),
  signOut: jest.fn().mockResolvedValue(null),
  ...over,
});

describe('isGoogleSignInAvailable', () => {
  it('is true on Android with a client ID and the native module', () => {
    expect(load({ native: fakeNative() }).isGoogleSignInAvailable()).toBe(true);
  });

  it('is false on iOS: there is no iOS client or URL scheme yet', () => {
    expect(load({ os: 'ios', native: fakeNative() }).isGoogleSignInAvailable()).toBe(false);
  });

  it('is false with no client ID configured', () => {
    expect(load({ clientId: '', native: fakeNative() }).isGoogleSignInAvailable()).toBe(false);
  });

  it('is false, and does not throw, when the native module is not in this build', () => {
    // Expo Go, or any build compiled before the module was added.
    expect(load({ native: 'throws' }).isGoogleSignInAvailable()).toBe(false);
  });
});

describe('getGoogleCredential', () => {
  it('asks Google for the WEB client ID, and returns the ID token', async () => {
    const native = fakeNative();
    const svc = load({ native });
    await expect(svc.getGoogleCredential()).resolves.toBe('google.id.token');
    expect(native.configure).toHaveBeenCalledWith({ webClientId: WEB_ID });
    expect(native.hasPlayServices).toHaveBeenCalled();
  });

  it('forgets the account afterwards, so a shared tablet gets the picker next time', async () => {
    const native = fakeNative();
    await load({ native }).getGoogleCredential();
    expect(native.signOut).toHaveBeenCalledTimes(1);
  });

  it('still returns the token if forgetting the account fails', async () => {
    const native = fakeNative({ signOut: jest.fn().mockRejectedValue(new Error('nothing signed in')) });
    await expect(load({ native }).getGoogleCredential()).resolves.toBe('google.id.token');
  });

  it('returns null when the person backs out of the picker', async () => {
    const native = fakeNative({ signIn: jest.fn().mockResolvedValue({ type: 'cancelled', data: null }) });
    await expect(load({ native }).getGoogleCredential()).resolves.toBeNull();
    expect(native.signOut).not.toHaveBeenCalled();
  });

  it('throws when Google returns no ID token', async () => {
    const native = fakeNative({ signIn: jest.fn().mockResolvedValue({ type: 'success', data: { idToken: null } }) });
    await expect(load({ native }).getGoogleCredential()).rejects.toThrow('no ID token');
  });

  it('throws what Google throws (no Play services, a misconfigured client)', async () => {
    const native = fakeNative({ hasPlayServices: jest.fn().mockRejectedValue(new Error('PLAY_SERVICES_NOT_AVAILABLE')) });
    await expect(load({ native }).getGoogleCredential()).rejects.toThrow('PLAY_SERVICES_NOT_AVAILABLE');
    expect(native.signIn).not.toHaveBeenCalled();
  });

  it('throws when called where Google sign-in is not available', async () => {
    await expect(load({ native: 'throws' }).getGoogleCredential()).rejects.toThrow('not available');
  });
});
