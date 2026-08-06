/**
 * Which requests go out WITHOUT an Authorization header. Getting this wrong is
 * silent in both directions: a token on a public route 401s on a stale login,
 * and a missing token 401s every hospital-only endpoint under /doctors/.
 */
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), multiRemove: jest.fn(),
}));

import { isPublicRequest } from './api';

const get = (url: string) => isPublicRequest({ url, method: 'get' });

describe('isPublicRequest', () => {
  it('treats auth + read-only doctor endpoints as public', () => {
    expect(get('/auth/login/')).toBe(true);
    expect(get('/doctors/')).toBe(true);
    expect(get('/doctors/?hospital=6')).toBe(true);
    expect(get('/doctors/4/')).toBe(true);
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
