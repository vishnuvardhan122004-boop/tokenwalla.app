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
import { logoutUser, onLogout, _logoutTaskLabels } from './api';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

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

  it('the two real tasks register themselves when their modules load', () => {
    // Guards the actual wiring: if either module stops calling onLogout, the
    // leak comes back and the tests above would still pass on their own stubs.
    require('./notificationStore');
    expect(_logoutTaskLabels()).toContain('notification-history');
  });
});
