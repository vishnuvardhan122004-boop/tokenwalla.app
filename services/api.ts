
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
function isPublicRequest(config: { url?: string; method?: string }): boolean {
  const url = config.url || '';
  if (isPublicRoute(url)) return true;
  const method = (config.method || 'get').toLowerCase();
  if (method === 'get' && url.includes('/doctors/')) return true;
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

export async function logoutUser() {
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
export async function getUser() {
  try {
    const raw = await AsyncStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default API;