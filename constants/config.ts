/**
 * constants/config.ts
 *
 * Single source of truth for environment-ish constants that were previously
 * hardcoded in multiple files. Reads from Expo `extra` (app.json → expo.extra)
 * when present, with safe fallbacks so the app still runs if extra is missing.
 */

import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  razorpayKeyId?: string;
};

// Backend API base. Keep in sync with the deployed Django backend.
export const API_BASE_URL: string =
  extra.apiBaseUrl || 'https://tokenwalla-production.up.railway.app/api';

// Razorpay publishable key id (safe to ship; the secret lives only on the server).
export const RAZORPAY_KEY_ID: string =
  extra.razorpayKeyId || 'rzp_live_SoKq7xISlxWRoY';

// Minimum lead time before an appointment slot can be booked / rescheduled.
// Also the window used for the pre-appointment reminder. 2.1 hours.
export const BOOKING_LEAD_MS = 2.1 * 60 * 60 * 1000; // 2h 6m

// ── Test / demo hospitals ───────────────────────────────────────────────────
// A hospital whose name carries this marker is a test account. Its doctors are
// hidden from patient-facing lists so test data never shows in production.
// (Name your test hospital e.g. "[TEST] Demo Hospital".)
export const TEST_HOSPITAL_MARKER = '[TEST]';

export function isTestHospital(hospitalName?: string | null): boolean {
  if (!hospitalName) return false;
  return hospitalName.toUpperCase().includes(TEST_HOSPITAL_MARKER);
}
