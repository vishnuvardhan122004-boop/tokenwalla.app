/**
 * utils/webviewSafe.ts
 *
 * Helpers for safely interpolating dynamic values into the HTML string we feed
 * into the Razorpay checkout WebView (`app/(patient)/payment.tsx`,
 * `components/RescheduleModal.tsx`).
 *
 * The payment page is built by string-concatenating values that are NOT fully
 * under our control — a doctor's name is hospital-controlled, the patient's own
 * name/mobile is user-controlled. Interpolating those raw into HTML text or into
 * a JS string literal inside an inline <script> lets an apostrophe silently break
 * checkout, and a crafted value (e.g. `</script>...`) inject arbitrary script into
 * the payment context. Always route dynamic values through these helpers.
 */

/** Escape a value for use in HTML *text* content (between tags). */
export function htmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Turn a value into a safe, quoted JavaScript string *literal* for embedding
 * inside an inline <script>. Returns the value WITH its surrounding quotes, so
 * use it directly (no extra quotes): `key: ${jsStr(rpKeyId)}`.
 *
 * JSON.stringify handles quotes/backslashes/newlines; the extra replacements
 * stop the value from closing the <script> tag (`<`, `>`, `&`) or breaking JS
 * parsing via the U+2028/U+2029 line separators (valid in JSON, illegal raw in JS).
 */
export function jsStr(value: unknown): string {
  const LS = String.fromCharCode(0x2028); // line separator
  const PS = String.fromCharCode(0x2029); // paragraph separator
  return JSON.stringify(String(value ?? ''))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LS).join('\\u2028')
    .split(PS).join('\\u2029');
}
