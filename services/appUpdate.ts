/**
 * services/appUpdate.ts — launch-time "please update" prompt.
 *
 * The app ships on store timelines; the backend ships on merge. This closes
 * that gap: GET /api/app-version/ says which builds are too old, so the
 * thresholds can move without a store release.
 *
 * Deliberately quiet. Anything unexpected — endpoint missing, offline, garbage
 * payload — leaves the patient alone. A false "you must update" on a working
 * build is worse than a missed nag.
 */
import Constants from 'expo-constants';
import { Alert, Linking, Platform } from 'react-native';

import API from './api';
import { shouldPrompt, updateAction } from '../utils/version';

const STORE_FALLBACK =
  'https://play.google.com/store/apps/details?id=com.vishnu2004.Tokenwalla';

// When the dismissible nag was last shown. A timestamp rather than a
// once-per-launch flag because this now also runs when the app returns to the
// foreground — see shouldPrompt() for why both cases are needed. A blocking
// prompt ignores this entirely.
let lastNagAt = 0;

// Guards against two checks overlapping — a resume can land while the launch
// call is still awaiting the network, and two Alerts would stack.
let inFlight = false;

/** The version this build reports — the `version` field in app.json. */
export function runningVersion(): string {
  return Constants.expoConfig?.version ?? '';
}

async function openStore(url: string) {
  try {
    await Linking.openURL(url || STORE_FALLBACK);
  } catch {
    // Store app missing or URL rejected — nothing useful to say, and throwing
    // here would take the launch path down with it.
  }
}

/**
 * Ask the backend whether this build should update, and prompt if so.
 *
 * Called on launch AND whenever the app returns to the foreground (see
 * app/_layout.tsx). Safe to call before login: the endpoint is public.
 */
export async function checkForUpdate(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await runCheck();
  } finally {
    inFlight = false;
  }
}

async function runCheck(): Promise<void> {
  const current = runningVersion();
  if (!current) return;

  let data: {
    min_version?: string;
    latest_version?: string;
    store_url?: string;
    message?: string;
  };
  try {
    ({ data } = await API.get('/app-version/'));
  } catch {
    // Offline, or a backend that predates the endpoint. Not a problem worth
    // showing anyone.
    return;
  }
  if (!data || typeof data !== 'object') return;

  const action = updateAction(
    current,
    String(data.min_version ?? ''),
    String(data.latest_version ?? ''),
  );
  // A block always prompts; a nag waits out its cooldown so returning to the
  // app doesn't re-ask someone who just chose "Not now".
  if (!shouldPrompt(action, lastNagAt, Date.now())) return;

  const url = String(data.store_url ?? '') || STORE_FALLBACK;
  const storeName = Platform.OS === 'ios' ? 'the App Store' : 'the Play Store';
  const body =
    String(data.message ?? '') ||
    (action === 'block'
      ? `This version of TokenWalla is too old to book appointments. Update from ${storeName} to continue.`
      : `A newer version of TokenWalla is available on ${storeName}.`);

  if (action === 'block') {
    // No dismiss button, and cancelable: false — a build below the minimum
    // can no longer talk to the API correctly, so letting the patient pay
    // through it would be worse than stopping here.
    Alert.alert('Update Required', body, [{ text: 'Update', onPress: () => openStore(url) }], {
      cancelable: false,
    });
    return;
  }

  // Only the dismissible nag starts the cooldown — a block deliberately
  // re-prompts on every return to the foreground.
  lastNagAt = Date.now();
  Alert.alert('Update Available', body, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Update', onPress: () => openStore(url) },
  ]);
}

/** Test seam — clears the nag cooldown so a fresh check prompts again. */
export function _resetUpdatePromptForTests() {
  lastNagAt = 0;
  inFlight = false;
}
