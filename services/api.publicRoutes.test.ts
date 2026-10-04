/**
 * Which requests go out WITHOUT an Authorization header. Getting this wrong is
 * silent in both directions: a token on a public route 401s on a stale login,
 * and a missing token 401s every hospital-only endpoint under /doctors/.
 */
import { isPublicRequest } from './api';

// Hoisted above the import by babel-plugin-jest-hoist, so ./api sees the mocks
// however these are ordered here.
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), multiRemove: jest.fn(),
}));

const get = (url: string) => isPublicRequest({ url, method: 'get' });

describe('isPublicRequest', () => {
  it('treats auth + the PATIENT-facing read-only doctor endpoints as public', () => {
    expect(get('/auth/login/')).toBe(true);
    expect(get('/doctors/')).toBe(true);
    expect(get('/doctors/4/')).toBe(true);
  });

  it('sends the token on ?hospital= — the owner needs whatsapp_number back', () => {
    // This asserted `true` and that was the bug. The doctor serializer fails
    // CLOSED on whatsapp_number: an unauthenticated caller gets a doctor object
    // without the field, so the hospital's edit form prefilled '' and saving
    // any other field wiped the doctor's booking-alert number, silently.
    // Only hospital screens send ?hospital=, so they can carry a token the
    // same way /doctors/payment-summary/?hospital= already does.
    expect(get('/doctors/?hospital=6')).toBe(false);
    expect(get('/doctors/payment-summary/?hospital=6')).toBe(false);
  });

  it('treats the launch-time version check as public', () => {
    // Runs before login. A stale token would 401 it and pull the launch path
    // into the refresh-retry flow, logging the patient out over a version check.
    expect(get('/app-version/')).toBe(true);
  });

  it('keeps the token on the hospital-only money endpoints', () => {
    expect(get('/doctors/payment-summary/?hospital=6')).toBe(false);
    expect(get('/doctors/19/payment-details/')).toBe(false);
  });

  it('keeps the token on doctor writes and on other authenticated reads', () => {
    expect(isPublicRequest({ url: '/doctors/', method: 'post' })).toBe(false);
    expect(isPublicRequest({ url: '/doctors/19/', method: 'patch' })).toBe(false);
    expect(get('/bookings/my/')).toBe(false);
  });
});
