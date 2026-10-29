/**
 * utils/bookingWindow.ts — how far ahead a patient may book (ROADMAP 53 slice 4).
 * Mirrors src/services/bookingWindow.js on the website and
 * tokenwalla.utils.MAX_DAYS_AHEAD on the server: every date strip is today + 6, so
 * a larger window would change nothing a patient can see. The server enforces the
 * window either way; this only shapes what the strip offers.
 */
export const MAX_DAYS_AHEAD = 6;

/**
 * Days a strip shows for a doctor or a test: today through today + N, or the full
 * week when the provider set no limit (null, missing, or not loaded yet).
 */
export function stripLength(provider?: { max_days_ahead?: number | null } | null): number {
  const n = Number(provider?.max_days_ahead);
  return (n >= 1 ? Math.min(n, MAX_DAYS_AHEAD) : MAX_DAYS_AHEAD) + 1;
}
