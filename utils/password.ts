/**
 * Client-side password rule for the two screens that SET a password.
 *
 * The server is the real gate (Django's AUTH_PASSWORD_VALIDATORS: min 6, not
 * all-numeric, not a common password, not similar to the mobile or name), and
 * it refuses through a field-keyed serializer error. Checking only the length
 * here let "123456" through to that refusal, which the app then showed as a
 * bare "Registration failed. Try again."
 *
 * Deliberately the SAME rule as the website's profilecreate.js, not a third
 * one — two spellings of "valid password" across repos is how they drift.
 */
/** Which of the two client-side checks a password fails, or null if neither. */
export type PasswordProblem = 'numeric' | 'weak';

export function passwordProblem(password: string): PasswordProblem | null {
  if (/^\d+$/.test(password)) return 'numeric';
  if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(password)) return 'weak';
  return null;
}

/**
 * The English message for the screens that are not translated (register). A
 * translated screen takes passwordProblem() and looks the wording up itself,
 * so there is still exactly one rule.
 */
export function passwordComplaint(password: string): string | null {
  const problem = passwordProblem(password);
  if (problem === 'numeric') return 'Password cannot be entirely numbers';
  if (problem === 'weak') return 'Min 6 chars with at least one letter & number';
  return null;
}
