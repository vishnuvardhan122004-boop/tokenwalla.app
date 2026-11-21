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

/** Segment keys the API reports in `segments`. */
export const SEG_CONSULT = 'CONSULT';
export const SEG_SCAN    = 'SCAN';
export const SEG_BLOOD   = 'BLOOD';

/** The `?kind=` value each tab sends, mapped to the segment it means. */
export const KIND_TO_SEGMENT: Record<string, string> = {
  HOSPITAL:     SEG_CONSULT,
  SCAN_CENTER:  SEG_SCAN,
  BLOOD_CENTER: SEG_BLOOD,
};

export interface KindedRow {
  kind?: string;
  /** What the provider SELLS, e.g. ['CONSULT','SCAN']. Absent on old backends. */
  segments?: string[];
  [k: string]: any;
}

/**
 * Rows that actually SELL what `kind` asks for. Anything else is dropped.
 *
 * Prefers `segments`, because `kind` cannot answer the question any more: a
 * hospital with a scanning wing is kind=HOSPITAL and belongs in the Scans tab.
 * Matching on kind alone would drop exactly the providers this exists to show.
 *
 * Falls back to `kind` when `segments` is absent — that is an older backend,
 * which is the deploy-order hazard this whole module was written for. On such a
 * backend hybrids do not exist yet, so the fallback is not merely safe, it is
 * exactly right.
 *
 * The kind is REQUIRED, not defaulted: the centre lists are separate tabs, so a
 * caller that forgets to say which one it wants must not silently get another.
 */
export function filterByKind<T extends KindedRow>(
  rows: T[] | null | undefined, kind: string,
): T[] {
  if (!Array.isArray(rows)) return [];
  const segment = KIND_TO_SEGMENT[kind];
  return rows.filter(r => {
    if (!r) return false;
    if (Array.isArray(r.segments)) return !!segment && r.segments.includes(segment);
    return r.kind === kind;
  });
}

/** Back-compat alias for the scanning-centre callers. */
export function filterScanCenters<T extends KindedRow>(rows: T[] | null | undefined): T[] {
  return filterByKind(rows, SCAN_CENTER);
}

/**
 * How many scan / test cards a list paints before "Show more". A centre can hold
 * hundreds of tests (800 seen), and both lists — the hospital's Services -> Tests
 * and the patient's centre page — sit in a plain ScrollView with no virtualising.
 * All 800 at once is ~30,000 views: the app froze and the OS then closed it.
 */
export const SCAN_PAGE = 30;

/** Unwrap a DRF list response, paginated or not. */
export function asList<T = any>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}
