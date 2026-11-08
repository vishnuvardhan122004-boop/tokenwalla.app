/**
 * services/googleAuth.ts
 *
 * The device half of "Continue with Google": ask Google (through the native
 * account picker) for an ID token and hand it back. Everything after that is the
 * backend's: POST /auth/google/ verifies it (see users/google_auth.py in the
 * website repo), signs a linked account in, or asks for a mobile + OTP first.
 *
 * The native module is loaded lazily and defensively. It only exists in a
 * build that was compiled with it (development / preview / production); in Expo
 * Go, or an older installed build's JS, the import throws. A button that crashes
 * the app is worse than no button, so isGoogleSignInAvailable() is false there
 * and the screens simply don't show it.
 *
 * Android only for now: every release so far is an Android bundle, and iOS
 * needs its own OAuth client + URL scheme plugin (ROADMAP 62).
 */
import { Platform } from 'react-native';
import { GOOGLE_WEB_CLIENT_ID } from '../constants/config';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let cached: GoogleModule | null | undefined;

function loadNative(): GoogleModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function isGoogleSignInAvailable(): boolean {
  return Platform.OS === 'android' && !!GOOGLE_WEB_CLIENT_ID && loadNative() !== null;
}

/**
 * Opens Google's account picker and returns the ID token, or null if the person
 * backed out. Throws on a real failure (no Play services, no token, a
 * misconfigured client).
 */
export async function getGoogleCredential(): Promise<string | null> {
  const native = loadNative();
  if (!native || !GOOGLE_WEB_CLIENT_ID) throw new Error('Google sign-in is not available');
  const { GoogleSignin } = native;

  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') return null;            // cancelled

  const token = result.data.idToken;
  // Forget the account on this phone, so the next tap shows the picker again
  // instead of silently reusing it. A hospital tablet is shared by several staff.
  try { await GoogleSignin.signOut(); } catch { /* nothing to forget */ }
  if (!token) throw new Error('Google returned no ID token');
  return token;
}
