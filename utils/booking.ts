/**
 * utils/booking.ts
 *
 * Pure, framework-free helpers for the booking flow — date/slot math and
 * hospital open-hours logic. Extracted from app/(patient)/doctor/[id].tsx so
 * this booking-critical logic can be unit-tested in isolation (no React
 * Native / rendering required).
 *
 * Time-reading functions (`getNext7Days`, `isSlotTooSoon`, `isOpenNow`) take an
 * optional "now" argument that defaults to the real clock. Production call
 * sites pass nothing and behave exactly as before; tests pass a fixed clock.
 */

import { BOOKING_LEAD_MS } from '../constants/config';
import { doctorTitle, getDisplayLang, localName } from './localize';

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DayCell {
  label:  string; // 'Today' | 'Mon' | ...
  dayKey: string; // 'Mon' | ... — matches doctor.days
  num:    number; // day of month
  month:  string; // 'Jan' | ...
  full:   string; // YYYY-MM-DD (local)
}

/**
 * Local YYYY-MM-DD (NOT toISOString, which converts to UTC and shifts the date
 * by a day for evening users in +05:30 / other ahead-of-UTC timezones).
 */
export function toLocalISODate(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The rows falling on one local calendar day (`ymd`, as YYYY-MM-DD).
 *
 * `/bookings/queue/<id>/` answers a 38-DAY window — today-7 through today+30
 * (QUEUE_LOOKBACK_DAYS / QUEUE_LOOKAHEAD_DAYS) — because the query must stay
 * bounded and the dashboard's Today/Tomorrow/All tabs need the span. Anything
 * presenting those rows as "today" has to narrow them itself, which the
 * analytics screen did not: every number on it counted the whole window.
 *
 * A row with no `date` is NOT today. The serializer always sends one
 * (Booking.date is non-null), so this only drops genuinely malformed rows
 * rather than silently hiding real bookings.
 */
export function rowsForDay<T extends { date?: string }>(rows: T[], ymd: string): T[] {
  return rows.filter(r => r.date === ymd);
}

/** The next 7 days starting from `from` (default: today), as calendar cells. */
export function getNext7Days(from: Date = new Date()): DayCell[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return {
      label:  i === 0 ? 'Today' : DAY_NAMES[d.getDay()],
      dayKey: DAY_NAMES[d.getDay()],
      num:    d.getDate(),
      month:  MONTH_NAMES[d.getMonth()],
      full:   toLocalISODate(d),
    };
  });
}

/**
 * Which date the calendar should have selected.
 *
 * Two separate things can invalidate a selection, and answering them in two
 * effects is what let a bad state through: one effect kept the choice on a day
 * the provider actually works (keyed on the provider), the other pulled it back
 * into the window after midnight (keyed on the date). The second could fire
 * without the first, parking the selection on a day the doctor is off — a chip
 * rendered "Off" and highlighted at once, and still bookable.
 *
 *   • `selected` is still in the window AND on a working day → keep it.
 *   • otherwise → the first working day in the window.
 *   • no working days recorded → every day counts as working.
 *
 * Returns null only when `days` is empty.
 */
export function resolveSelectedDate(
  days: DayCell[],
  selected: string,
  workingDays?: string[] | null,
): string | null {
  const wd = Array.isArray(workingDays) && workingDays.length ? workingDays : null;
  const cur = days.find(d => d.full === selected);
  if (cur && (!wd || wd.includes(cur.dayKey))) return selected;
  const first = wd ? days.find(d => wd.includes(d.dayKey)) : days[0];
  return first ? first.full : null;
}

/** Combine a YYYY-MM-DD date and an "hh:mm AM/PM" slot into a local Date, or null. */
export function slotDateTime(dateStr: string, slot: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr || '').trim());
  if (!dm) return null;
  const sm = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec((slot || '').trim());
  if (!sm) return null;
  let hours = Number(sm[1]) % 12;
  if ((sm[3] || '').toUpperCase() === 'PM') hours += 12;
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), hours, Number(sm[2]), 0, 0);
}

/** How close to the slot "You're next! Head to the clinic" starts showing. */
export const NEAR_SLOT_MINUTES = 30;

/**
 * True when the slot starts within NEAR_SLOT_MINUTES on `now`'s day, or has
 * already started. Hours before it a patient first in their slot would rush in
 * too early (web ROADMAP 83, src/services/nearSlot.js). A slot we can't read
 * (a walk-in) keeps the old message: telling someone to go is safer than hiding it.
 */
export function nearSlot(slot?: string, date?: string, now: Date = new Date()): boolean {
  const day   = toLocalISODate(now);
  const start = slotDateTime(day, slot || '');
  if (!start) return true;
  if (date && date !== day) return false;
  return start.getTime() - now.getTime() <= NEAR_SLOT_MINUTES * 60 * 1000;
}

/**
 * A slot is "too soon" (not bookable) unless it is at least `leadMs` in the
 * future. Also returns false for unparseable inputs (matches original behaviour:
 * an unknown slot is not blocked here).
 */
export function isSlotTooSoon(
  dateStr: string,
  slot: string,
  now: number = Date.now(),
  leadMs: number = BOOKING_LEAD_MS,
): boolean {
  const dt = slotDateTime(dateStr, slot);
  if (!dt) return false;
  return dt.getTime() < now + leadMs;
}

/**
 * Is this slot closed to booking? The server's `too_soon` (from the slot
 * availability endpoint) wins when it's there, because each doctor or centre
 * sets its own cutoff (0h, 1h, 24h…), not the 2h default. A slot that has
 * started since the page loaded is closed whatever the server said. Before
 * availability loads, the 2h default is the best guess.
 */
export function isSlotClosed(
  info: { too_soon?: boolean } | undefined,
  dateStr: string,
  slot: string,
  now: number = Date.now(),
): boolean {
  if (typeof info?.too_soon === 'boolean') {
    return info.too_soon || isSlotTooSoon(dateStr, slot, now, 0);
  }
  return isSlotTooSoon(dateStr, slot, now);
}

/** "HH:MM" → minutes since midnight, or null if unparseable. */
export function hmToMinutes(hm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Is the hospital open right now given open/close "HH:MM"? Returns null when
 * hours are unknown/unparseable. Handles overnight ranges (open > close).
 */
export function isOpenNow(open?: string, close?: string, now: Date = new Date()): boolean | null {
  const o = hmToMinutes(open);
  const c = hmToMinutes(close);
  if (o == null || c == null) return null;
  const cur = now.getHours() * 60 + now.getMinutes();
  return o <= c ? (cur >= o && cur < c) : (cur >= o || cur < c); // handle overnight
}

/**
 * Booking status normalisation.
 *
 * The backend lifecycle was expanded to a superset of UPPERCASE values
 * (PENDING / CONFIRMED / IN_PROGRESS / ON_HOLD / COMPLETED / CANCELLED /
 * NO_SHOW) and the API now serialises the raw status field, so the `status`
 * this app receives changed (e.g. old `waiting` → `CONFIRMED`). Rather than
 * re-key every screen, we fold each backend value back to the four canonical
 * keys the UI already renders. Legacy lowercase values are passed through, so
 * this is safe against both old and new backends.
 */
export type CanonicalStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';

const STATUS_CANONICAL: Record<string, CanonicalStatus> = {
  // new backend lifecycle
  PENDING:     'waiting',
  CONFIRMED:   'waiting',
  IN_PROGRESS: 'in_progress',
  ON_HOLD:     'waiting',      // queue paused, but still an active booking to the patient
  COMPLETED:   'completed',
  CANCELLED:   'cancelled',
  NO_SHOW:     'cancelled',    // terminal, non-active — grouped with cancelled in the UI
  // legacy lowercase (pre-rename backends)
  waiting:     'waiting',
  in_progress: 'in_progress',
  held:        'waiting',
  completed:   'completed',
  cancelled:   'cancelled',
};

/** Fold any backend status (new UPPERCASE or legacy lowercase) to a canonical UI key. */
export function normalizeBookingStatus(status?: string | null): CanonicalStatus {
  return STATUS_CANONICAL[(status || '').trim()] ?? 'waiting';
}

export interface DirectionsHospital {
  location?: string;
  name?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Build a maps link, best signal first:
 *
 *   1. Geocoded coordinates — an exact pin. These come from the location
 *      autocomplete the provider used at registration, so when they exist they
 *      are the entrance, not a guess.
 *   2. A saved location that is already a maps URL — the provider chose it.
 *   3. A name+city search — a guess, and the reason 1 and 2 come first: two
 *      clinics in Hindupur with similar names land a patient at the wrong one.
 *
 * Coordinates were previously ignored here even when present, so every caller
 * fell through to the name search. Fixed in the helper rather than at a call
 * site, since the doctor screen and the centre screen both route through it.
 */
export function directionsUrl(hospital?: DirectionsHospital): string {
  const { latitude: lat, longitude: lng } = hospital ?? {};
  if (typeof lat === 'number' && typeof lng === 'number'
      && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const loc = (hospital?.location || '').trim();
  if (/^https?:\/\//i.test(loc)) return loc;
  const q = encodeURIComponent([hospital?.name, hospital?.city].filter(Boolean).join(' '));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/**
 * Display name for a booking's provider.
 *
 * A booking's provider is a doctor OR a scan (`provider_kind`), and both arrive
 * in the same `provider_name`/`doctor_name` field. Prefixing blindly produced
 * "Dr. Complete Blood Count (CBC)" for scans, and "Dr. Dr. Test Sharma" for a
 * doctor whose stored name already carries the title.
 */
export function providerLabel(name?: string, kind?: string): string {
  const n = (name ?? '').trim();
  if (!n) return n;
  if (kind === 'SCAN') return localName(n);
  const m = n.match(/^dr(?:\.\s*|\s+)(.*)$/i);
  if (m && getDisplayLang() === 'en') return n;      // keep a stored "Dr …" exactly as entered
  return `${doctorTitle()} ${localName(m ? m[1] : n)}`;
}
