/**
 * utils/shareQueue.ts — Share my queue (web ROADMAP 84) and the pass lines on
 * Cancel, mirroring src/componets/ShareQueue.js and MyBookings.js.
 */
import { providerLabel, toLocalISODate } from './booking';

type T = (key: string, vars?: Record<string, string | number>) => string;
type B = { [key: string]: any };

/** The public live page for a booking's key, in the sender's language. */
export const liveLink = (key: string, lang?: string) =>
  `https://www.tokenwalla.com/q/${key}${lang && lang !== 'en' ? `?lang=${lang}` : ''}`;

/** Today: "follow my place in the queue"; a later date says when. Null with no key.
 *  A token booked for family names that person: the sender isn't the patient. */
export function shareMessage(b: B, t: T, lang?: string, now = new Date()): string | null {
  if (!b?.live_key) return null;
  const link = liveLink(b.live_key, lang);
  const provider = providerLabel(b.doctor_name || b.provider_name || '', b.provider_kind);
  const name = b.booked_for_name || '';
  return b.date === toLocalISODate(now)
    ? t(name ? 'share_for_today' : 'share_today', { name, hospital: b.hospital_name || '', provider, link })
    : t(name ? 'share_for_later' : 'share_later', { name, provider, date: b.date, slot: b.slot, link });
}

/** What cancelling does to a pass: the free visit goes back, the purchase ends it. */
export const cancelNoteKey = (b: B) =>
  b?.pass_role === 'redeemed' ? 'mb_cancel_pass_back'
    : b?.pass_role === 'purchase' ? 'mb_cancel_pass_ends' : 'mb_refund_note';

export const cancelSubKey = (b: B) =>
  b?.pass_role === 'redeemed' ? 'cancel_pass_back'
    : b?.pass_role === 'purchase' ? 'cancel_pass_ends' : 'refund_in_days';
