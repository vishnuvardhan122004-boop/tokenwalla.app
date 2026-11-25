import { BOOKING_LEAD_MS } from '../constants/config';
import {
  directionsUrl,
  getNext7Days,
  hmToMinutes,
  nearSlot,
  isOpenNow,
  isSlotClosed,
  isSlotTooSoon,
  normalizeBookingStatus,
  providerLabel,
  resolveSelectedDate,
  rowsForDay,
  slotDateTime,
  toLocalISODate,
} from './booking';

describe('rowsForDay', () => {
  // The queue endpoint answers a 38-day window, so a screen labelled "Today"
  // has to narrow it. Dates are computed from the clock, never hard-coded:
  // a literal would rot into the past and start passing for the wrong reason.
  const today    = toLocalISODate(new Date());
  const tomorrow = toLocalISODate(new Date(Date.now() + 86400000));
  const lastWeek = toLocalISODate(new Date(Date.now() - 7 * 86400000));

  it('keeps only the rows on the given day', () => {
    const rows = [
      { id: 1, date: today },
      { id: 2, date: tomorrow },
      { id: 3, date: lastWeek },
      { id: 4, date: today },
    ];
    expect(rowsForDay(rows, today).map(r => r.id)).toEqual([1, 4]);
  });

  it('drops the look-ahead and look-back the queue window includes', () => {
    // The exact edges of QUEUE_LOOKAHEAD_DAYS / QUEUE_LOOKBACK_DAYS: these are
    // real rows the endpoint returns, and counting them is the bug.
    const edges = [
      { date: toLocalISODate(new Date(Date.now() + 30 * 86400000)) },
      { date: toLocalISODate(new Date(Date.now() - 7 * 86400000)) },
    ];
    expect(rowsForDay(edges, today)).toEqual([]);
  });

  it('treats a row with no date as not today, rather than as today', () => {
    expect(rowsForDay([{ date: undefined }, { date: today }], today))
      .toEqual([{ date: today }]);
  });

  it('returns an empty list, not everything, when nothing matches', () => {
    expect(rowsForDay([{ date: tomorrow }], today)).toEqual([]);
  });

  it('is empty for an empty queue', () => {
    expect(rowsForDay([], today)).toEqual([]);
  });
});

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

describe('resolveSelectedDate', () => {
  // Mon 2 Feb 2026 -> [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  const days = getNext7Days(new Date(2026, 1, 2));

  it('keeps the selected date when it is in the window and on a working day', () => {
    expect(resolveSelectedDate(days, days[3].full, ['Mon', 'Thu'])).toBe(days[3].full);
  });

  it('falls back to the first working day when selected is on a day off', () => {
    // days[3] is Thu, not a working day here -> first Mon in the window.
    expect(resolveSelectedDate(days, days[3].full, ['Mon', 'Fri'])).toBe(days[0].full);
  });

  it('falls back to the first working day when selected has rolled out of the window', () => {
    expect(resolveSelectedDate(days, '2026-01-01', ['Mon', 'Fri'])).toBe(days[0].full);
  });

  it('treats every day as working when workingDays is empty, null, or undefined', () => {
    expect(resolveSelectedDate(days, days[2].full, [])).toBe(days[2].full);
    expect(resolveSelectedDate(days, days[2].full, null)).toBe(days[2].full);
    expect(resolveSelectedDate(days, days[2].full, undefined)).toBe(days[2].full);
  });

  it('returns the first working day, not day 0, when day 0 is off', () => {
    // Mon is off; first working day in the window is Wed (days[2]).
    expect(resolveSelectedDate(days, days[0].full, ['Wed'])).toBe(days[2].full);
  });

  it('returns null only when the window itself is empty', () => {
    expect(resolveSelectedDate([], '2026-02-02', ['Mon'])).toBeNull();
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

  it('prefers coordinates over both the saved URL and the name search', () => {
    // An exact pin beats a provider-pasted link and beats a name guess.
    expect(directionsUrl({
      latitude: 13.8283, longitude: 77.4911,
      location: 'https://maps.app.goo.gl/abc123', name: 'City Care', city: 'Hindupur',
    })).toBe('https://www.google.com/maps/search/?api=1&query=13.8283,77.4911');
  });

  it('falls back when coordinates are absent, null or not finite', () => {
    // null is what the API sends for a provider who never picked a location,
    // and it must not become the string "null" in a maps query.
    const named = 'https://www.google.com/maps/search/?api=1&query=City%20Care';
    expect(directionsUrl({ latitude: null, longitude: null, name: 'City Care' })).toBe(named);
    expect(directionsUrl({ latitude: 13.8, longitude: null, name: 'City Care' })).toBe(named);
    expect(directionsUrl({ latitude: NaN, longitude: 77.4, name: 'City Care' })).toBe(named);
  });

  it('still honours a 0 coordinate rather than treating it as missing', () => {
    expect(directionsUrl({ latitude: 0, longitude: 0, name: 'Null Island' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=0,0');
  });
});

describe('normalizeBookingStatus', () => {
  it('folds the new UPPERCASE lifecycle to canonical UI keys', () => {
    expect(normalizeBookingStatus('CONFIRMED')).toBe('waiting');
    expect(normalizeBookingStatus('PENDING')).toBe('waiting');
    expect(normalizeBookingStatus('ON_HOLD')).toBe('waiting');
    expect(normalizeBookingStatus('IN_PROGRESS')).toBe('in_progress');
    expect(normalizeBookingStatus('COMPLETED')).toBe('completed');
    expect(normalizeBookingStatus('CANCELLED')).toBe('cancelled');
    expect(normalizeBookingStatus('NO_SHOW')).toBe('cancelled');
  });

  it('passes legacy lowercase values through unchanged', () => {
    expect(normalizeBookingStatus('waiting')).toBe('waiting');
    expect(normalizeBookingStatus('in_progress')).toBe('in_progress');
    expect(normalizeBookingStatus('held')).toBe('waiting');
    expect(normalizeBookingStatus('completed')).toBe('completed');
    expect(normalizeBookingStatus('cancelled')).toBe('cancelled');
  });

  it('defaults unknown / empty / nullish statuses to waiting', () => {
    expect(normalizeBookingStatus(undefined)).toBe('waiting');
    expect(normalizeBookingStatus(null)).toBe('waiting');
    expect(normalizeBookingStatus('')).toBe('waiting');
    expect(normalizeBookingStatus('  CONFIRMED  ')).toBe('waiting');
    expect(normalizeBookingStatus('something_new')).toBe('waiting');
  });
});

describe('providerLabel', () => {
  it('prefixes a consultation provider', () => {
    expect(providerLabel('Test Sharma', 'DOCTOR')).toBe('Dr. Test Sharma');
  });

  it('never prefixes a scan', () => {
    expect(providerLabel('Complete Blood Count (CBC)', 'SCAN')).toBe('Complete Blood Count (CBC)');
  });

  it('does not double a name that already carries the title', () => {
    expect(providerLabel('Dr. Test Sharma', 'DOCTOR')).toBe('Dr. Test Sharma');
    expect(providerLabel('dr Hari krishna', 'DOCTOR')).toBe('dr Hari krishna');
  });

  it('returns empty (no stray "Dr.") for a missing name', () => {
    expect(providerLabel(undefined, 'DOCTOR')).toBe('');
    expect(providerLabel('   ', 'DOCTOR')).toBe('');
  });

  it('defaults to prefixing when kind is absent (older payloads)', () => {
    expect(providerLabel('Test Sharma')).toBe('Dr. Test Sharma');
  });
});

// nearSlot: copied from the web repo's src/services/nearSlot.test.js (ROADMAP 83).
describe('nearSlot', () => {
  const at = (h: number, min = 0) => new Date(2026, 10, 20, h, min);   // 20 Nov 2026
  const D = '2026-11-20';

  test('hours before the slot is not near', () => {
    expect(nearSlot('10:30 AM', D, at(8, 0))).toBe(false);
    expect(nearSlot('10:30 AM', D, at(9, 59))).toBe(false);
  });

  test('inside the last 30 minutes, and after the slot started, is near', () => {
    expect(nearSlot('10:30 AM', D, at(10, 0))).toBe(true);
    expect(nearSlot('10:30 AM', D, at(10, 29))).toBe(true);
    expect(nearSlot('10:30 AM', D, at(11, 15))).toBe(true);
  });

  test('12 PM and 12 AM read correctly, PM slots too', () => {
    expect(nearSlot('12:00 PM', D, at(11, 40))).toBe(true);
    expect(nearSlot('12:00 PM', D, at(9, 0))).toBe(false);
    expect(nearSlot('04:00 PM', D, at(15, 0))).toBe(false);
    expect(nearSlot('04:00 PM', D, at(15, 40))).toBe(true);
  });

  test('another day is never near', () => {
    expect(nearSlot('10:30 AM', '2026-11-21', at(10, 30))).toBe(false);
  });

  test('a slot we cannot read keeps the old message', () => {
    expect(nearSlot('Walk-in', D, at(8, 0))).toBe(true);
    expect(nearSlot(undefined, D, at(8, 0))).toBe(true);
  });
});

describe('isSlotClosed', () => {
  // A doctor's own cutoff (booking_cutoff_hours) reaches the app only as the
  // server's too_soon; 6 live doctors use 1h, 2 use 24h (2026-11-24).
  const date = '2026-06-20';
  const slot = '03:00 PM';
  const slotMs = new Date(2026, 5, 20, 15, 0, 0).getTime();
  const ninetyMinBefore = slotMs - 90 * 60_000;

  it('follows the server when it says a slot 90 min out is open (1h cutoff)', () => {
    expect(isSlotClosed({ too_soon: false }, date, slot, ninetyMinBefore)).toBe(false);
  });

  it('follows the server when it says a slot hours out is closed (24h cutoff)', () => {
    expect(isSlotClosed({ too_soon: true }, date, slot, slotMs - 5 * 3600_000)).toBe(true);
  });

  it('closes a slot that started while the page was open', () => {
    expect(isSlotClosed({ too_soon: false }, date, slot, slotMs + 60_000)).toBe(true);
  });

  it('falls back to the 2h default before availability loads', () => {
    expect(isSlotClosed(undefined, date, slot, ninetyMinBefore)).toBe(true);
    expect(isSlotClosed({}, date, slot, slotMs - BOOKING_LEAD_MS - 60_000)).toBe(false);
  });
});
