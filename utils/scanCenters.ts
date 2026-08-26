/**
 * utils/scanCenters.ts
 *
 * Client-side guard for the diagnostic-centre lists.
 *
 * WHY THIS EXISTS: the app ships on its own release cycle, so a build carrying
 * centres can reach a backend that has not deployed them yet. An older
 * `/api/hospitals/` IGNORES an unknown `?kind=` query param and happily returns
 * the full hospital list — which this screen would then render as centres,
 * sending patients to a hospital to ask for an MRI or a blood test.
 *
 * Filtering on the `kind` field closes that: an older backend does not serialise
 * `kind` at all, so every row reads `undefined`, nothing matches, and the screen
 * shows its honest empty state instead of wrong data.
 *
 * This is the mirror image of the backend's exclude_centers() guard. Both exist
 * because neither side can assume the other has deployed.
 */

export const SCAN_CENTER  = 'SCAN_CENTER';
/** A pathology lab — CBC, lipid profile, full-body checkup. Same pipeline as a
 *  scanning centre (the bookable unit is still a Scan); separate only so it gets
 *  its own tab and its own words. */
export const BLOOD_CENTER = 'BLOOD_CENTER';

/** Every kind whose bookable unit is a Scan rather than a Doctor. */
export const CENTER_KINDS = [SCAN_CENTER, BLOOD_CENTER] as const;
export type CenterKind = typeof CENTER_KINDS[number];

export interface KindedRow {
  kind?: string;
  [k: string]: any;
}

/**
 * Rows that are explicitly of `kind`. Anything else is dropped.
 *
 * The kind is REQUIRED, not defaulted: the two centre lists are separate tabs,
 * so a caller that forgets to say which one it wants must not silently get the
 * scanning centres.
 */
export function filterByKind<T extends KindedRow>(
  rows: T[] | null | undefined, kind: string,
): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(r => r && r.kind === kind);
}

/** Back-compat alias for the scanning-centre callers. */
export function filterScanCenters<T extends KindedRow>(rows: T[] | null | undefined): T[] {
  return filterByKind(rows, SCAN_CENTER);
}

/** Unwrap a DRF list response, paginated or not. */
export function asList<T = any>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}
