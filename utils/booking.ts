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

export interface DirectionsHospital {
  location?: string;
  name?: string;
  city?: string;
}

/** Build a maps link: use the saved location if it's a URL, else search name+city. */
export function directionsUrl(hospital?: DirectionsHospital): string {
  const loc = (hospital?.location || '').trim();
  if (/^https?:\/\//i.test(loc)) return loc;
  const q = encodeURIComponent([hospital?.name, hospital?.city].filter(Boolean).join(' '));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
