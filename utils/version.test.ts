import { compareVersions, updateAction } from './version';

describe('compareVersions', () => {
  it('treats identical versions as equal', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('orders by each segment, most significant first', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('compares numerically, not as strings', () => {
    // '10' < '9' as text, but 10 > 9 as a version segment.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });

  it('pads missing segments with zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBe(1);
  });

  it('treats non-numeric segments as zero rather than NaN', () => {
    // NaN comparisons are all false, which would silently read as "equal".
    expect(compareVersions('1.2.x', '1.2.0')).toBe(0);
    expect(compareVersions('junk', '0.0.0')).toBe(0);
  });
});

describe('updateAction', () => {
  it('blocks below the minimum supported version', () => {
    expect(updateAction('1.1.0', '1.2.0', '1.3.0')).toBe('block');
  });

  it('nags below the latest but at or above the minimum', () => {
    expect(updateAction('1.2.0', '1.2.0', '1.3.0')).toBe('nag');
  });

  it('does nothing when up to date', () => {
    expect(updateAction('1.3.0', '1.2.0', '1.3.0')).toBe('none');
  });

  it('does nothing when ahead of the server (a dev or beta build)', () => {
    expect(updateAction('1.4.0', '1.2.0', '1.3.0')).toBe('none');
  });

  it('never blocks when the minimum is blank', () => {
    // The backend ships both thresholds empty. A blocking prompt is
    // unrecoverable for a patient holding a token, so "off" has to mean off
    // even for an ancient build.
    expect(updateAction('0.0.1', '', '1.3.0')).toBe('nag');
    expect(updateAction('0.0.1', '', '')).toBe('none');
  });

  it('does not nag when the latest is blank', () => {
    expect(updateAction('1.0.0', '', '')).toBe('none');
  });

  it('prefers blocking over nagging when both apply', () => {
    expect(updateAction('1.0.0', '1.2.0', '1.3.0')).toBe('block');
  });

  it('does nothing when the running version is unknown', () => {
    expect(updateAction('', '1.2.0', '1.3.0')).toBe('none');
  });

  it('does not block on a malformed threshold', () => {
    // A typo in the Railway variable reaches every install at once. It must
    // degrade to "no prompt", never to "everyone is locked out".
    expect(updateAction('1.2.0', 'not-a-version', '')).toBe('none');
  });
});
