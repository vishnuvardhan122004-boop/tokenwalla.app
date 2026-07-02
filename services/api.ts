
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { router } from 'expo-router';


const BASE: string = 'https://tokenwalla-production.up.railway.app/api';

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

// ── Attach access token to every request EXCEPT public routes ──────────────
API.interceptors.request.use(async (config) => {
  if (!isPublicRoute(config.url || '')) {
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

    if (isPublicRoute(original?.url || '')) {
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