/**
 * utils/version.ts — version comparison for the launch-time update gate.
 *
 * Pure, so the decision is testable without a renderer or a network call.
 * See services/appUpdate.ts for the prompt and constants/config.ts for where
 * the running version comes from.
 */

/**
 * Compare two dotted numeric versions.
 *
 * Returns -1 if `a` is older than `b`, 0 if equal, 1 if newer. Missing
 * segments count as 0, so '1.2' === '1.2.0'. Non-numeric segments are treated
 * as 0 rather than NaN — a malformed value from the server must not make a
 * comparison silently true.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? '')
      .trim()
      .split('.')
      .map(part => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      });

  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

export type UpdateAction = 'block' | 'nag' | 'none';

/**
 * What the running build should do about its version.
 *
 * 'block' — below the minimum the backend still supports; the app can't be
 *           trusted to talk to the API correctly, so the prompt is not
 *           dismissible.
 * 'nag'   — a newer build exists; dismissible.
 * 'none'  — up to date, or the server didn't ask for anything.
 *
 * Fails to 'none' on anything unrecognisable. An empty threshold means that
 * tier is switched off, which is the backend's shipped default: a bad value
 * must never be able to lock every patient out of a token they've paid for.
 */
export function updateAction(
  current: string,
  minVersion: string,
  latestVersion: string,
): UpdateAction {
  if (!current || !String(current).trim()) return 'none';

  if (minVersion && String(minVersion).trim()) {
    if (compareVersions(current, minVersion) < 0) return 'block';
  }
  if (latestVersion && String(latestVersion).trim()) {
    if (compareVersions(current, latestVersion) < 0) return 'nag';
  }
  return 'none';
}
