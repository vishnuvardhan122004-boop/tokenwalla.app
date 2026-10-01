/**
 * The server's refusal reason has to reach the screen. Every auth endpoint
 * answers with {message} — the OTP cooldown, the daily send caps, an
 * unverified mobile — and a generic "try again" hides which one fired.
 */
import { AxiosError, AxiosHeaders } from 'axios';
import { apiMessage } from './api';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), multiRemove: jest.fn(),
}));

const axiosErr = (status: number, data: unknown) => {
  const headers = new AxiosHeaders();
  return new AxiosError('rejected', 'ERR_BAD_REQUEST', { headers }, null, {
    status, data, statusText: '', headers, config: { headers },
  });
};

describe('apiMessage', () => {
  it('returns the message the server sent', () => {
    const e = axiosErr(429, { message: 'Wait 60 seconds before requesting again.' });
    expect(apiMessage(e, 'OTP failed.')).toBe('Wait 60 seconds before requesting again.');
  });

  it('falls back to DRF detail when there is no message', () => {
    expect(apiMessage(axiosErr(403, { detail: 'Not allowed.' }), 'x')).toBe('Not allowed.');
  });

  it('uses the fallback when the body carries no reason', () => {
    expect(apiMessage(axiosErr(500, {}), 'OTP failed.')).toBe('OTP failed.');
    expect(apiMessage(axiosErr(502, undefined), 'OTP failed.')).toBe('OTP failed.');
  });

  it('uses the fallback for a non-axios throw', () => {
    expect(apiMessage(new Error('boom'), 'OTP failed.')).toBe('OTP failed.');
    expect(apiMessage(undefined, 'OTP failed.')).toBe('OTP failed.');
  });

  it('ignores a field-keyed validation body — those are per-field, not global', () => {
    const e = axiosErr(400, { password: ['This password is too common.'] });
    expect(apiMessage(e, 'Registration failed.')).toBe('Registration failed.');
  });
});
