import { BOOKING_LEAD_MS } from '../constants/config';
import {
  directionsUrl,
  getNext7Days,
  hmToMinutes,
  isOpenNow,
  isSlotTooSoon,
  slotDateTime,
  toLocalISODate,
} from './booking';

describe('toLocalISODate', () => {
  it('formats a date as local YYYY-MM-DD', () => {
    expect(toLocalISODate(new Date(2026, 5, 20))).toBe('2026-06-20'); // month is 0-indexed
  });

  it('zero-pads single-digit month and day', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('uses local calendar components, not UTC (no off-by-one for late evening)', () => {
    // A late-evening local time must keep the local date regardless of timezone.
    const d = new Date(2026, 2, 9, 23, 30, 0); // 9 Mar 2026, 23:30 local
    expect(toLocalISODate(d)).toBe('2026-03-09');
    expect(toLocalISODate(d)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  });
});

describe('getNext7Days', () => {
  it('returns exactly 7 cells starting today', () => {
    const days = getNext7Days(new Date(2026, 0, 30));
    expect(days).toHaveLength(7);
    expect(days[0].label).toBe('Today');
    expect(days[0].full).toBe('2026-01-30');
  });

  it('advances one calendar day per cell and rolls over month boundaries', () => {
    const days = getNext7Days(new Date(2026, 0, 30)); // 30 Jan 2026
    expect(days[1].full).toBe('2026-01-31');
    expect(days[2].full).toBe('2026-02-01');
    expect(days[2].month).toBe('Feb');
    expect(days[2].num).toBe(1);
  });

  it('sets dayKey to the 3-letter weekday matching the date', () => {
    const from = new Date(2026, 0, 30);
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = getNext7Days(from);
    days.forEach((cell, i) => {
      const expected = new Date(2026, 0, 30 + i);
      expect(cell.dayKey).toBe(names[expected.getDay()]);
    });
  });

  it('labels only the first cell "Today"; the rest use the weekday', () => {
    const days = getNext7Days(new Date(2026, 0, 30));
    expect(days.slice(1).some((d) => d.label === 'Today')).toBe(false);
  });

  it('defaults to the real clock when called with no argument', () => {
    const days = getNext7Days();
    expect(days).toHaveLength(7);
    expect(days[0].full).toBe(toLocalISODate(new Date()));
  });
});

describe('slotDateTime', () => {
  it('parses a morning slot into a local Date', () => {
    const dt = slotDateTime('2026-06-20', '09:30 AM');
    expect(dt).not.toBeNull();
    expect(dt!.getFullYear()).toBe(2026);
    expect(dt!.getMonth()).toBe(5);
    expect(dt!.getDate()).toBe(20);
    expect(dt!.getHours()).toBe(9);
    expect(dt!.getMinutes()).toBe(30);
  });

  it('adds 12 hours for PM slots', () => {
    expect(slotDateTime('2026-06-20', '03:00 PM')!.getHours()).toBe(15);
  });

  it('treats 12:00 PM as noon (12) and 12:00 AM as midnight (0)', () => {
    expect(slotDateTime('2026-06-20', '12:00 PM')!.getHours()).toBe(12);
    expect(slotDateTime('2026-06-20', '12:00 AM')!.getHours()).toBe(0);
  });

  it('treats a slot with no AM/PM marker as a literal hour', () => {
    expect(slotDateTime('2026-06-20', '09:30')!.getHours()).toBe(9);
  });

  it('returns null for an unparseable date or slot', () => {
    expect(slotDateTime('not-a-date', '09:30 AM')).toBeNull();
    expect(slotDateTime('2026-06-20', 'lunchtime')).toBeNull();
    expect(slotDateTime('', '')).toBeNull();
  });
});

describe('isSlotTooSoon', () => {
  const date = '2026-06-20';
  const slot = '03:00 PM';
  const slotMs = new Date(2026, 5, 20, 15, 0, 0).getTime();

  it('is false when the slot is comfortably beyond the lead window', () => {
    const now = slotMs - BOOKING_LEAD_MS - 60_000; // 1 min more than lead away
    expect(isSlotTooSoon(date, slot, now)).toBe(false);
  });

  it('is true when the slot is inside the lead window', () => {
    const now = slotMs - BOOKING_LEAD_MS + 60_000; // 1 min short of lead
    expect(isSlotTooSoon(date, slot, now)).toBe(true);
  });

  it('is false exactly at the lead boundary (>= lead is allowed)', () => {
    const now = slotMs - BOOKING_LEAD_MS;
    expect(isSlotTooSoon(date, slot, now)).toBe(false);
  });

  it('is true for a slot already in the past', () => {
    expect(isSlotTooSoon(date, slot, slotMs + 60_000)).toBe(true);
  });

  it('is false for an unparseable slot (does not block unknown input)', () => {
    expect(isSlotTooSoon('bad', 'bad', slotMs)).toBe(false);
  });

  it('honours a custom lead time', () => {
    const now = slotMs - 30 * 60_000; // 30 min before slot
    expect(isSlotTooSoon(date, slot, now, 20 * 60_000)).toBe(false); // 20-min lead: ok
    expect(isSlotTooSoon(date, slot, now, 45 * 60_000)).toBe(true);  // 45-min lead: too soon
  });
});

describe('hmToMinutes', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(hmToMinutes('09:30')).toBe(570);
    expect(hmToMinutes('00:00')).toBe(0);
    expect(hmToMinutes('23:59')).toBe(1439);
  });

  it('trims surrounding whitespace', () => {
    expect(hmToMinutes('  08:15 ')).toBe(495);
  });

  it('returns null for invalid or missing input', () => {
    expect(hmToMinutes('9am')).toBeNull();
    expect(hmToMinutes('')).toBeNull();
    expect(hmToMinutes(undefined)).toBeNull();
  });
});

describe('isOpenNow', () => {
  const at = (h: number, m: number) => new Date(2026, 5, 20, h, m, 0);

  it('is open between open and close for same-day hours', () => {
    expect(isOpenNow('09:00', '17:00', at(12, 0))).toBe(true);
  });

  it('is closed before open and at/after close', () => {
    expect(isOpenNow('09:00', '17:00', at(8, 59))).toBe(false);
    expect(isOpenNow('09:00', '17:00', at(17, 0))).toBe(false);
  });

  it('is open at exactly the opening minute', () => {
    expect(isOpenNow('09:00', '17:00', at(9, 0))).toBe(true);
  });

  it('handles overnight ranges (open > close)', () => {
    expect(isOpenNow('22:00', '06:00', at(23, 0))).toBe(true);
    expect(isOpenNow('22:00', '06:00', at(5, 0))).toBe(true);
    expect(isOpenNow('22:00', '06:00', at(12, 0))).toBe(false);
  });

  it('returns null when either bound is unknown', () => {
    expect(isOpenNow(undefined, '17:00', at(12, 0))).toBeNull();
    expect(isOpenNow('09:00', 'bad', at(12, 0))).toBeNull();
  });
});

describe('directionsUrl', () => {
  it('returns the saved location verbatim when it is a URL', () => {
    const url = 'https://maps.app.goo.gl/abc123';
    expect(directionsUrl({ location: url })).toBe(url);
  });

  it('builds a name+city search when location is not a URL', () => {
    expect(directionsUrl({ name: 'City Care', city: 'Vizag' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=City%20Care%20Vizag',
    );
  });

  it('drops falsy name/city parts', () => {
    expect(directionsUrl({ name: 'City Care' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=City%20Care',
    );
  });

  it('handles a missing hospital by returning an empty search', () => {
    expect(directionsUrl()).toBe('https://www.google.com/maps/search/?api=1&query=');
  });
});
