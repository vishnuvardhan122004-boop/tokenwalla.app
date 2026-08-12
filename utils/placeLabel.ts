/**
 * utils/placeLabel.ts
 *
 * Turns a Photon (OpenStreetMap) geocoding feature into the readable address we
 * show under the map pin, plus the city we store on the hospital record.
 *
 * Kept identical to the website's `describe()` in `src/componets/LocationPicker.js`
 * so a hospital sees the same address string whether it edits its profile on the
 * web dashboard or in the app. Change one, change the other.
 */

export interface PlaceLabel {
  city:  string;
  label: string;
}

/** Photon returns GeoJSON features; only `properties` matters to us. */
export function placeFromFeature(feature: any): PlaceLabel | null {
  if (!feature) return null;
  const p = feature.properties || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const city   = p.city || p.town || p.village || p.county || '';
  const label  = [
    p.name && p.name !== street ? p.name : null,
    street || null,
    p.district && p.district !== city ? p.district : null,
    city || null,
    p.state || null,
    p.postcode || null,
  ].filter(Boolean).join(', ');
  return { city, label };
}

/**
 * Below this zoom a pin is worse than no pin: it sends patients somewhere
 * confidently wrong. z14 is roughly neighbourhood level.
 */
export const MIN_CONFIRM_ZOOM = 14;

/** Reject anything we would not want to interpolate into the map HTML. */
export function isUsableCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90  && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}
