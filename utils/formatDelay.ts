/**
 * "1h 30m" for a delay in minutes. The running-late timer runs to 3 hours, and
 * "~180 mins late" reads worse than "~3h late" to staff and patients alike.
 *
 * Mirrors src/services/formatDelay.js on the website; keep the two in step.
 */
export function formatDelay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}
