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

  // /auth/register/ rejects through RegisterSerializer, which answers with
  // field keys and no `message`. Reading only `message` is what made every
  // rejected registration say "Registration failed. Try again." instead of
  // naming the duplicate mobile or the weak password.
  it('reads a field-keyed serializer body', () => {
    const dup = axiosErr(400, { mobile: ['Mobile already registered.'] });
    expect(apiMessage(dup, 'Registration failed.')).toBe('Mobile already registered.');

    const weak = axiosErr(400, { password: ['This password is too common.'] });
    expect(apiMessage(weak, 'Registration failed.')).toBe('This password is too common.');

    const nonField = axiosErr(400, { non_field_errors: ['Something is off.'] });
    expect(apiMessage(nonField, 'x')).toBe('Something is off.');
  });

  it('prefers message over a field key when both are present', () => {
    const e = axiosErr(400, { password: ['too common'], message: 'Verify your mobile first.' });
    expect(apiMessage(e, 'x')).toBe('Verify your mobile first.');
  });

  it('falls back rather than returning a non-string field value', () => {
    expect(apiMessage(axiosErr(400, { count: 3, ok: false }), 'Registration failed.'))
      .toBe('Registration failed.');
    expect(apiMessage(axiosErr(400, 'plain text body'), 'Registration failed.'))
      .toBe('Registration failed.');
  });
});
