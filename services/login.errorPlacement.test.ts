/**
 * A wrong password made the login form jump: the error box sat above the
 * mobile field, so it pushed the fields and Sign In down when it appeared and
 * pulled them back up on the next keystroke or tap (handleLogin also blanked it
 * first, a flash on every retry). A second tap then landed on the password box.
 * The error now renders under the Sign In button, and a retry replaces it.
 */
import fs from 'fs';
import path from 'path';

const SCREENS = ['app/(auth)/login.tsx', 'app/(hospital)/login.tsx'];

describe.each(SCREENS)('%s', (file) => {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  test('the error box comes after the Sign In button, not above the fields', () => {
    const error = src.indexOf('<View style={styles.errorBox}>');
    expect(error).toBeGreaterThan(src.indexOf('onPress={handleLogin}'));
    expect(error).toBeGreaterThan(src.indexOf('keyboardType="numeric"'));
  });

  test('Sign In does not blank the error before the new answer arrives', () => {
    const body = src.slice(src.indexOf('const handleLogin'), src.indexOf('try {', src.indexOf('const handleLogin')));
    expect(body).not.toContain("setError('')");
  });
});
