/**
 * utils/phone.ts
 *
 * Normalising what someone types or pastes into a phone box.
 *
 * Kept identical to `tenDigitMobile` in the website's
 * `src/hospital/Hdashboard.js` so a hospital gets the same result whether it
 * edits a doctor on the web dashboard or in the app. Change one, change the
 * other — mirrored helpers in these two repos have drifted before.
 */

/**
 * Digits only, 10 max, dropping a leading country code when one is clearly
 * there.
 *
 * The country-code step is the part that matters. A plain digit filter turns a
 * pasted "+91 98765 43210" into "9198765432" — ten digits starting with 9, so
 * the 10-digit mobile check ACCEPTS it and a wrong number saves clean. For a
 * doctor's WhatsApp number that is a silent failure: the field is never used to
 * log in, so nothing ever errors, the doctor simply never hears about a
 * booking. The 91 is dropped only at exactly 12 digits, so a real mobile that
 * begins 91 is left alone.
 */
export function tenDigitMobile(raw: string): string {
  return (raw || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(0, 10);
}
