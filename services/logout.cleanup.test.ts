/**
 * What logout has to undo besides the session tokens.
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
 * ORDER is what these tests pin: the DELETE is an authenticated request, so it
 * must go out BEFORE the access token is removed from storage.
 *
 * The cleanup is a registry (`onLogout`) rather than an import, because both
 * owning modules import API from ./api. The first attempt used a dynamic
 * `import()` inside logoutUser — which throws under jest, where the
 * surrounding try/catch swallowed it and left the cleanup silently dead. That
 * near-miss is why these assert the ordering and not just the calls.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import API, { logoutUser, onLogout, _logoutTaskLabels } from './api';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

// No request in this file leaves the process. Before this stub, every
// logoutUser() here sent a REAL POST /auth/logout/ to production (jest
// resolves the API base to app.json's Railway URL), and a slow network turned
// that into a 5s timeout in an unrelated run.
let deletes = 0;
let deleteAnswers401 = false;
const ok = (config: InternalAxiosRequestConfig) =>
  ({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
API.defaults.adapter = async (config) => {
  if (config.method === 'delete') {
    deletes += 1;
    // Past 3, answer 200: on the pre-fix code this ends the loop so the test
    // FAILS on the count instead of hanging.
    if (deleteAnswers401 && deletes <= 3) {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null,
        { ...ok(config), status: 401, statusText: 'Unauthorized' });
    }
  }
  return ok(config);
};

const calls: string[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => 'refresh-token'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(async () => { calls.push('multiRemove'); }),
}));

describe('logoutUser cleanup', () => {
  beforeEach(() => { calls.length = 0; });

  it('runs a registered task before clearing the session', async () => {
    onLogout('push-token', async () => { calls.push('push-token'); });

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

  // ROADMAP 30. The unregister DELETE is authenticated; on a dead session it
  // gets a 401, the response interceptor calls logoutUser() again, which sends
  // the DELETE again… Storage was only cleared in the OUTERMOST call, which was
  // never reached: a Logout button that did nothing, while the app kept
  // calling production (seen on an iOS simulator, 2026-10-05).
  it('completes on a dead session: the 401 on the unregister does not re-enter logout', async () => {
    const refresh = jest.spyOn(axios, 'post').mockRejectedValue(new Error('refresh token expired'));
    deletes = 0;
    deleteAnswers401 = true;
    let active = true;
    onLogout('push-token-401', async () => {
      if (active) await API.delete('/notifications/register-device/', { data: { token: 'ExponentPushToken[x]' } });
    });
    try {
      await logoutUser();
      expect(calls).toContain('multiRemove');
      expect(deletes).toBe(1);
    } finally {
      active = false;
      deleteAnswers401 = false;
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

  it('the two real tasks register themselves when their modules load', () => {
    // Guards the actual wiring: if either module stops calling onLogout, the
    // leak comes back and the tests above would still pass on their own stubs.
    require('./notificationStore');
    expect(_logoutTaskLabels()).toContain('notification-history');
  });
});
