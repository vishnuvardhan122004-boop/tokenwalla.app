
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { router } from 'expo-router';
import { API_BASE_URL } from '../constants/config';


const BASE: string = API_BASE_URL;

const API = axios.create({ baseURL: BASE, timeout: 25000 });

// ── Routes that are public (AllowAny on the backend) ───────────────────────
// Must NOT carry an Authorization header (a stale/expired token makes
// JWTAuthentication throw 401 before the view's AllowAny is even checked)
// and must NOT trigger the refresh-retry flow on failure.
// These must match the actual Django urls.py paths exactly.
const PUBLIC_ROUTES = [
  '/auth/login/',
  '/auth/register/',
  '/auth/otp/request/',
  '/auth/otp/verify/',
  '/auth/logout/',
  '/auth/check-mobile/',
  '/auth/reset-password/',
  '/auth/token/refresh/',
  '/hospitals/login/',
  '/hospitals/register/',
  '/hospitals/reset-password/',
  // Checked on launch, before anyone logs in. A stale token here would 401 and
  // drag the launch path into the refresh-retry flow — logging the patient out
  // over a version check.
  '/app-version/',
];

function isPublicRoute(url = ''): boolean {
  return PUBLIC_ROUTES.some(route => url.includes(route));
}

// Read-only doctor endpoints (GET /doctors/, /doctors/:id/, /doctors/?hospital=)
// are AllowAny on the backend. But DRF's JWTAuthentication still runs first, so a
// STALE/expired access token makes it throw 401 before AllowAny is reached — which
// would wrongly blank the public doctor list (and log the user out on refresh
// failure). So we treat read-only doctor fetches as public too. Writes
// (POST/PATCH/DELETE from the hospital dashboard) still carry the token.
// …EXCEPT these sub-routes: they sit under /doctors/ but serve a hospital's own
// money and payout/KYC data (IsAuthenticated + IsHospitalStaff), so stripping
// the token turns them into a 401 — which is exactly what the Doctor Payments
// screen hit before this carve-out.
const PRIVATE_DOCTOR_PATHS = ['payment-details', 'payment-summary'];

export function isPublicRequest(config: { url?: string; method?: string }): boolean {
  const url = config.url || '';
  if (isPublicRoute(url)) return true;
  const method = (config.method || 'get').toLowerCase();
  if (method === 'get' && url.includes('/doctors/')) {
    return !PRIVATE_DOCTOR_PATHS.some(p => url.includes(p));
  }
  return false;
}

// ── Attach access token to every request EXCEPT public ones ────────────────
API.interceptors.request.use(async (config) => {
  if (!isPublicRequest(config)) {
    const token = await AsyncStorage.getItem('access');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Auto-refresh on 401 ───────────────────────────────────────────────────
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    if (isPublicRequest(original || {})) {
      return Promise.reject(err);
    }

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = await AsyncStorage.getItem('refresh');
      if (!refresh) { await logoutUser(); return Promise.reject(err); }
      try {
        const { data } = await axios.post(
          `${BASE}/auth/token/refresh/`,
          { refresh },
          { timeout: 25000 }
        );
        await AsyncStorage.setItem('access', data.access);
        if (data.refresh) await AsyncStorage.setItem('refresh', data.refresh);
        original.headers.Authorization = `Bearer ${data.access}`;
        return API(original);
      } catch {
        await logoutUser();
      }
    }
    return Promise.reject(err);
  }
);

// ── Things that must be undone on logout ──────────────────────────────────
// Registered by the modules that own them, rather than imported here: both
// services/notifications.ts and services/notificationStore.ts import API from
// this module, so a static import back would be a cycle — and a dynamic
// `import()` is worse, because it throws under jest and the surrounding
// try/catch swallowed it, leaving the cleanup silently dead in exactly the
// path being fixed. Same shape as notificationStore's setBadgeSync.
type LogoutTask = { label: string; run: () => Promise<void> };
const _logoutTasks: LogoutTask[] = [];

export function onLogout(label: string, run: () => Promise<void>): void {
  if (!_logoutTasks.some(t => t.label === label)) _logoutTasks.push({ label, run });
}

export function _logoutTaskLabels(): string[] {
  return _logoutTasks.map(t => t.label);
}

export async function logoutUser() {
  // Run these FIRST: handing the push token back is an authenticated request,
  // so it has to happen while the access token is still in storage. Without
  // it the DeviceToken row outlives the session and this account's booking
  // pushes — which carry the patient's name — keep arriving on this handset
  // for whoever holds it next.
  for (const task of _logoutTasks) {
    try {
      await task.run();
    } catch {
      // best-effort, per task — one failure must not trap the user logged in
    }
  }
  try {
    const refresh = await AsyncStorage.getItem('refresh');
    if (refresh) {
      await API.post('/auth/logout/', { refresh });
    }
  } catch {
    // ignore server errors — clear session locally regardless
  } finally {
    await AsyncStorage.multiRemove(['access', 'refresh', 'user']);
    router.replace('/(auth)/login'); // adjust to your actual login route
  }
};
/**
 * The reason the server gave, or `fallback` if it didn't give one.
 *
 * Two shapes, and missing the second one is what made every rejected
 * registration read as "Registration failed. Try again.":
 *
 *   {message}                      — what every auth VIEW returns (the OTP
 *                                    cooldown, the daily caps, bad credentials)
 *   {mobile: ["..."], password: …} — what a SERIALIZER returns. /auth/register/
 *                                    rejects a duplicate mobile and a weak
 *                                    password this way, with no `message` at all.
 */
export function apiMessage(e: unknown, fallback: string): string {
  if (!axios.isAxiosError(e)) return fallback;
  const data = e.response?.data;
  if (!data || typeof data !== 'object') return fallback;

  const body = data as Record<string, unknown>;
  if (typeof body.message === 'string' && body.message) return body.message;
  if (typeof body.detail === 'string' && body.detail) return body.detail;

  for (const value of Object.values(body)) {
    if (typeof value === 'string' && value) return value;
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) return value[0];
  }
  return fallback;
}

export async function getUser() {
  try {
    const raw = await AsyncStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default API;