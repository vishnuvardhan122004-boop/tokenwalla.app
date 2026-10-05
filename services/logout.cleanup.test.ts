/**
 * What logout has to undo besides the session tokens — and that it always
 * finishes.
 *
 * Two things outlived it, and both are the previous account's data turning up
 * for whoever holds the handset next:
 *
 *   1. The DeviceToken row on the server. The backend has always had the
 *      DELETE ("Unregister a token (e.g. on logout)") and nothing called it.
 *      `update_or_create(expo_token, role)` only reassigns the row when the
 *      next login uses the SAME role — so patient-logs-out / staff-logs-in
 *      leaves the patient row pointing at the old user, and that account's
 *      booking pushes (which carry the patient's name and token) keep
 *      arriving. If nobody logs in again, they arrive forever.
 *   2. The locally cached notification list, which is keyed by audience rather
 *      than by user.
 *
 * ORDER is what the first tests pin: the DELETE is an authenticated request,
 * so it must go out BEFORE the access token is removed from storage.
 *
 * The rest pin ROADMAP 30: that DELETE 401s on a dead session, and the 401
 * handler used to call logoutUser() from inside logoutUser() — forever.
 *
 * The cleanup is a registry (`onLogout`) rather than an import, because both
 * owning modules import API from ./api. The first attempt used a dynamic
 * `import()` inside logoutUser — which throws under jest, where the
 * surrounding try/catch swallowed it and left the cleanup silently dead. That
 * near-miss is why these assert the ordering and not just the calls.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { router } from 'expo-router';
import API, { logoutUser, onLogout, _logoutTaskLabels } from './api';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

const calls: string[] = [];

// Stateful, so a cleared session reads as cleared. The old mock returned a
// refresh token for every read, which hid the "no refresh left" path.
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiRemove: jest.fn(async (ks: string[]) => { ks.forEach(k => mockStore.delete(k)); calls.push('multiRemove'); }),
}));

// The real unregister task, with the push-token fetch under the test's control.
let mockTokenDelayMs = -1;   // -1: no token, so unregister does nothing
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => {
    if (mockTokenDelayMs < 0) return { data: '' };
    await new Promise(r => setTimeout(r, mockTokenDelayMs));
    return { data: 'ExponentPushToken[x]' };
  }),
}));

// No request in this file leaves the process. Before this stub, every
// logoutUser() here sent a REAL POST /auth/logout/ to production (jest
// resolves the API base to app.json's Railway URL), and a slow network turned
// that into a 5s timeout in an unrelated run.
let deletes = 0;
const deleteAuth: string[] = [];
let deleteAnswers401 = false;
let deleteDelayMs = 0;
let queueAnswers401 = false;
const ok = (config: InternalAxiosRequestConfig) =>
  ({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
const unauthorized = (config: InternalAxiosRequestConfig) =>
  new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null,
    { ...ok(config), status: 401, statusText: 'Unauthorized' });
API.defaults.adapter = async (config) => {
  if (config.method === 'delete') {
    deletes += 1;
    deleteAuth.push(String(config.headers?.Authorization ?? ''));
    if (deleteDelayMs) await new Promise(r => setTimeout(r, deleteDelayMs));
    // Past 3, answer 200: on the pre-fix code this ends the loop so the test
    // FAILS on the count instead of hanging.
    if (deleteAnswers401 && deletes <= 3) throw unauthorized(config);
  }
  if (queueAnswers401 && config.url?.includes('/bookings/queue/')) {
    queueAnswers401 = false;
    throw unauthorized(config);
  }
  return ok(config);
};

const signedIn = () => {
  mockStore.clear();
  mockStore.set('access', 'A1');
  mockStore.set('refresh', 'R1');
  mockStore.set('user', JSON.stringify({ role: 'hospital' }));
};

describe('logoutUser cleanup', () => {
  beforeEach(() => {
    calls.length = 0;
    deletes = 0;
    deleteAuth.length = 0;
    deleteAnswers401 = false;
    deleteDelayMs = 0;
    queueAnswers401 = false;
    mockTokenDelayMs = -1;
    (router.replace as jest.Mock).mockClear();
    signedIn();
  });

  it('runs a registered task before clearing the session', async () => {
    onLogout('push-token-order', async () => { calls.push('push-token'); });

    await logoutUser();

    expect(calls).toContain('push-token');
    expect(calls).toContain('multiRemove');
    // The DELETE is authenticated — it cannot run after the token is gone.
    expect(calls.indexOf('push-token')).toBeLessThan(calls.indexOf('multiRemove'));
  });

  it('still clears the session when a cleanup task throws', async () => {
    onLogout('explodes', async () => { throw new Error('offline'); });

    await logoutUser();

    // Best-effort means best-effort: a failed unregister must never trap the
    // user in a logged-in state.
    expect(calls).toContain('multiRemove');
  });

  it('registers each task once, however many times a module is evaluated', async () => {
    onLogout('dupe', async () => { calls.push('dupe'); });
    onLogout('dupe', async () => { calls.push('dupe'); });

    await logoutUser();

    expect(calls.filter(c => c === 'dupe')).toHaveLength(1);
  });

  // ROADMAP 30, as first seen (iOS simulator, 2026-10-05: 77 push-token
  // attempts in ~90s, Logout never finished, the app calling production).
  it('completes on a dead session: the 401 on the unregister does not re-enter logout', async () => {
    const refresh = jest.spyOn(axios, 'post').mockRejectedValue(new Error('refresh token expired'));
    deleteAnswers401 = true;
    let active = true;
    onLogout('dead-session-delete', async () => {
      if (active) await API.delete('/notifications/register-device/', { data: { token: 'ExponentPushToken[x]' } });
    });
    try {
      await logoutUser();
      expect(calls).toContain('multiRemove');
      expect(deletes).toBe(1);
    } finally {
      active = false;
      refresh.mockRestore();
    }
  });

  it('still clears the session when a cleanup task never settles', async () => {
    // getExpoPushTokenAsync waits on APNs with no deadline of its own.
    jest.useFakeTimers();
    let hang = true;
    onLogout('hangs', () => (hang ? new Promise<void>(() => {}) : Promise.resolve()));
    try {
      const done = logoutUser();
      await jest.advanceTimersByTimeAsync(10_000);
      await done;
      expect(calls).toContain('multiRemove');
    } finally {
      hang = false;
      jest.useRealTimers();
    }
  });

  // Review of the first item-30 fix: the deadline let logout FINISH while its
  // DELETE was still out. Its 401 then landed on a cleared session and started
  // a fresh logout, whose DELETE did the same — every ~9s, forever.
  it('a 401 that lands after logout finished does not start another logout', async () => {
    jest.useFakeTimers();
    const refresh = jest.spyOn(axios, 'post').mockRejectedValue(new Error('refresh token expired'));
    deleteAnswers401 = true;
    deleteDelayMs = 9_000;  // slower than the 8s deadline
    let active = true;
    onLogout('slow-delete', async () => {
      if (active) await API.delete('/notifications/register-device/', { data: { token: 'ExponentPushToken[x]' } });
    });
    try {
      const done = logoutUser();
      await jest.advanceTimersByTimeAsync(60_000);
      await done;
      expect(router.replace).toHaveBeenCalledTimes(1);
      expect(deletes).toBe(1);
    } finally {
      active = false;
      refresh.mockRestore();
      jest.useRealTimers();
    }
  });

  // Review of the first item-30 fix: an unregister still waiting on its push
  // token past the deadline sent its DELETE later — authenticated as whoever
  // had logged in by then, deleting THAT account's DeviceToken row.
  it('an unregister that outlives logout leaves the next session alone', async () => {
    require('./notifications'); // registers the real 'push-token' task
    jest.useFakeTimers();
    mockTokenDelayMs = 20_000;  // the token fetch outlives the 8s deadline
    try {
      const done = logoutUser();
      await jest.advanceTimersByTimeAsync(9_000);
      await done;                       // logout finished at the deadline
      mockStore.set('access', 'A2');    // the next account signs in
      mockStore.set('refresh', 'R2');
      await jest.advanceTimersByTimeAsync(15_000);  // the stalled fetch resolves
      expect(deleteAuth).not.toContain('Bearer A2');
      expect(deletes).toBe(0);
    } finally {
      mockTokenDelayMs = -1;
      jest.useRealTimers();
    }
  });

  // Review of the first item-30 fix: a refresh started by a poll just before
  // logout landed after it and wrote a live, never-revoked token pair back.
  it('a refresh that lands after logout does not write the old session back', async () => {
    jest.useFakeTimers();
    const refresh = jest.spyOn(axios, 'post').mockImplementation(
      () => new Promise(r => setTimeout(() => r({ data: { access: 'A2', refresh: 'R2' } }), 9_000)),
    );
    queueAnswers401 = true;
    try {
      const poll = API.get('/bookings/queue/1/').catch(() => undefined); // 401 -> refresh (slow)
      await jest.advanceTimersByTimeAsync(100);
      await logoutUser();               // the user logs out meanwhile
      await jest.advanceTimersByTimeAsync(10_000);
      await poll;
      expect(mockStore.get('access')).toBeUndefined();
      expect(mockStore.get('refresh')).toBeUndefined();
    } finally {
      refresh.mockRestore();
      jest.useRealTimers();
    }
  });

  // Review of the first item-30 fix: a second Logout tap returned at once, so
  // Profile showed "logged out" while the first logout was still running.
  it('a second logout waits for the one already running', async () => {
    jest.useFakeTimers();
    let slow = true;
    onLogout('slow-task', () => (slow ? new Promise<void>(r => setTimeout(r, 2_000)) : Promise.resolve()));
    try {
      const first = logoutUser();
      let secondDone = false;
      const second = logoutUser().then(() => { secondDone = true; });
      await jest.advanceTimersByTimeAsync(100);
      expect(secondDone).toBe(false);
      await jest.advanceTimersByTimeAsync(3_000);
      await Promise.all([first, second]);
      expect(secondDone).toBe(true);
      expect(calls.filter(c => c === 'multiRemove')).toHaveLength(1);
    } finally {
      slow = false;
      jest.useRealTimers();
    }
  });

  it('the two real tasks register themselves when their modules load', () => {
    // Guards the actual wiring: if either module stops calling onLogout, the
    // leak comes back and the tests above would still pass on their own stubs.
    require('./notificationStore');
    require('./notifications');
    expect(_logoutTaskLabels()).toContain('notification-history');
    expect(_logoutTaskLabels()).toContain('push-token');
  });
});
