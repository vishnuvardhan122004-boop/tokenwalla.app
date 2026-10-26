/**
 * The cases the SERVER refuses. Each one used to pass the app's length-only
 * check, reach /auth/register/, and come back as a field-keyed rejection the
 * app rendered as "Registration failed. Try again."
 */
import { passwordComplaint, passwordProblem } from './password';

describe('passwordComplaint', () => {
  it('rejects an all-numeric password', () => {
    expect(passwordComplaint('123456')).toBe('Password cannot be entirely numbers');
    expect(passwordComplaint('9876543210')).toBe('Password cannot be entirely numbers');
  });

  it('rejects anything under 6 characters', () => {
    expect(passwordComplaint('ab12')).toBe('Min 6 chars with at least one letter & number');
    expect(passwordComplaint('')).toBe('Min 6 chars with at least one letter & number');
  });

  it('rejects letters with no digit, and digits with no letter', () => {
    expect(passwordComplaint('password')).toBe('Min 6 chars with at least one letter & number');
    expect(passwordComplaint('!!!!!!')).toBe('Min 6 chars with at least one letter & number');
  });

  it('accepts a password with a letter, a digit and enough length', () => {
    expect(passwordComplaint('Test@1234')).toBeNull();
    expect(passwordComplaint('rahul12')).toBeNull();
  });
});

describe('passwordProblem', () => {
  // The translated sign-up popup looks its wording up from this; the English
  // messages above are built on it, so the two cannot disagree.
  it('names the failing check, numeric before weak', () => {
    expect(passwordProblem('123456')).toBe('numeric');
    expect(passwordProblem('abc')).toBe('weak');
    expect(passwordProblem('password')).toBe('weak');
    expect(passwordProblem('Test@1234')).toBeNull();
  });
});
