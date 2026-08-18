/**
 * utils/scanCenters.ts
 *
 * Client-side guard for the scan-centre lists.
 *
 * WHY THIS EXISTS: the app ships on its own release cycle, so a build carrying
 * scanning centres can reach a backend that has not deployed them yet. An older
 * `/api/hospitals/` IGNORES an unknown `?kind=` query param and happily returns
 * the full hospital list — which this screen would then render as scanning
 * centres, sending patients to a hospital to ask for an MRI.
 *
 * Filtering on the `kind` field closes that: an older backend does not serialise
 * `kind` at all, so every row reads `undefined`, nothing matches, and the screen
 * shows its honest empty state instead of wrong data.
 *
 * This is the mirror image of the backend's exclude_scan_centers() guard. Both
 * exist because neither side can assume the other has deployed.
 */

export const SCAN_CENTER = 'SCAN_CENTER';

export interface KindedRow {
  kind?: string;
  [k: string]: any;
}

/** Rows that are explicitly scanning centres. Anything else is dropped. */
export function filterScanCenters<T extends KindedRow>(rows: T[] | null | undefined): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(r => r && r.kind === SCAN_CENTER);
}

/** Unwrap a DRF list response, paginated or not. */
export function asList<T = any>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}
