
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
// `?hospital=` is only ever sent by the three HOSPITAL screens (dashboard,
// profile, analytics), never by a patient screen — and the doctor serializer
// fails CLOSED on `whatsapp_number`, stripping it for any caller it cannot
// prove owns the doctor. Sent unauthenticated, the owner hospital got a doctor
// object with no `whatsapp_number`, its edit form prefilled '', and saving any
// other field wiped the doctor's booking-alert number. Silently, with a
// success toast. `payment-summary` already carries the token on the same
// screens, so this adds no new refresh-retry exposure.
const PRIVATE_DOCTOR_PATHS = ['payment-details', 'payment-summary', 'hospital='];

export function isPublicRequest(config: { url?: string; method?: string }): boolean {
  const url = config.url || '';
  if (isPublicRoute(url)) return true;
  const method = (config.method || 'get').toLowerCase();
  if (method === 'get' && url.includes('/doctors/')) {
    return !PRIVATE_DOCTOR_PATHS.some(p => url.includes(p));
  }
  return false;
}

// ── Logout state ──────────────────────────────────────────────────────────
// _epoch moves when a logout STARTS and again when it ENDS, so every request
// is stamped (below) with the stretch of session it was sent in. A request
// whose stamp is no longer current, or one sent while a logout runs, belongs to
// a session that is over: the 401 handler neither refreshes it nor logs out
// over it. That is the item-30 fix — the logout's own authenticated DELETE
// 401'd, the handler called logoutUser() again, which sent the DELETE again…
// and storage, cleared only at the end of the outermost call, never was.
let _logout: Promise<void> | null = null;
let _loggingOut = false;
let _epoch = 0;

/** True while a logout is running — a cleanup task checks it before acting. */
export function logoutInProgress(): boolean {
  return _loggingOut;
}

// ── Attach access token to every request EXCEPT public ones ────────────────
API.interceptors.request.use(async (config) => {
  (config as { _epoch?: number })._epoch = _epoch;
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
    // Sent during a logout, or before one: that session is over (see above).
    const current = () => !_loggingOut && original?._epoch === _epoch;
    if (!current()) return Promise.reject(err);

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = await AsyncStorage.getItem('refresh');
      if (!refresh) { if (current()) await logoutUser(); return Promise.reject(err); }
      try {
        const { data } = await axios.post(
          `${BASE}/auth/token/refresh/`,
          { refresh },
          { timeout: 25000 }
        );
        // A logout began while the refresh was out: don't write the old
        // session's rotated tokens back into a storage that logout cleared.
        if (!current()) return Promise.reject(err);
        await AsyncStorage.setItem('access', data.access);
        if (data.refresh) await AsyncStorage.setItem('refresh', data.refresh);
        original.headers.Authorization = `Bearer ${data.access}`;
        return API(original);
      } catch {
        // Only for the session that is still current — never over a NEW login.
        if (current()) await logoutUser();
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

// ponytail: a fixed deadline for the cleanup tasks. If it fires, the server's
// DeviceToken row can outlive the session (#38's original leak) — acceptable
// for a best-effort unregister; trapping the user logged in is not. A task
// still running past it must not act on whatever comes next: unregister checks
// logoutInProgress(), and its late 401 is stale (see Logout state). Raise the
// deadline if unregisters are seen timing out on slow networks.
const LOGOUT_TASKS_DEADLINE_MS = 8000;

/**
 * One logout at a time: a second call — a second tap, a poll's 401 — gets the
 * logout already running and resolves when IT finishes. Safe from deadlock
 * because nothing the logout itself sends can call back in here (the 401
 * handler refuses while _loggingOut).
 */
export function logoutUser(): Promise<void> {
  if (!_logout) {
    _loggingOut = true;
    _epoch += 1;
    _logout = logoutOnce().finally(() => {
      _loggingOut = false;
      _epoch += 1;
      _logout = null;
    });
  }
  return _logout;
}

async function logoutOnce() {
  // Run these FIRST: handing the push token back is an authenticated request,
  // so it has to happen while the access token is still in storage. Without
  // it the DeviceToken row outlives the session and this account's booking
  // pushes — which carry the patient's name — keep arriving on this handset
  // for whoever holds it next. Bounded by a deadline: getExpoPushTokenAsync
  // waits on APNs with none of its own, outside the axios timeout.
  let deadline: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    (async () => {
      for (const task of _logoutTasks) {
        try {
          await task.run();
        } catch {
          // best-effort, per task — one failure must not trap the user logged in
        }
      }
    })(),
    new Promise<void>((resolve) => { deadline = setTimeout(resolve, LOGOUT_TASKS_DEADLINE_MS); }),
  ]);
  clearTimeout(deadline);
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