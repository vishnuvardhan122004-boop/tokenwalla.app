/**
 * How many days a patient's date strip shows for a doctor or a test (ROADMAP 53
 * slice 4). Mirrors src/services/bookingWindow.test.js on the website: the server
 * refuses a later date either way, so this only shapes what is offered.
 */
import { MAX_DAYS_AHEAD, stripLength } from './bookingWindow';

test('no limit, or a provider not loaded yet, shows the full week', () => {
  expect(stripLength({ max_days_ahead: null })).toBe(7);
  expect(stripLength({})).toBe(7);
  expect(stripLength(null)).toBe(7);
  expect(stripLength(undefined)).toBe(7);
});

test('a window of N shows today plus N days', () => {
  expect(stripLength({ max_days_ahead: 1 })).toBe(2);   // today and tomorrow
  expect(stripLength({ max_days_ahead: 3 })).toBe(4);
  expect(stripLength({ max_days_ahead: MAX_DAYS_AHEAD })).toBe(7);
});

test('a value past the cap, or one that is not a window, never shows more than a week', () => {
  expect(stripLength({ max_days_ahead: 30 })).toBe(7);
  expect(stripLength({ max_days_ahead: 0 })).toBe(7);
  expect(stripLength({ max_days_ahead: 'x' as unknown as number })).toBe(7);
});

test('a window the server sent as a string still counts', () => {
  expect(stripLength({ max_days_ahead: '2' as unknown as number })).toBe(3);
});

test('the cap mirrors the server (tokenwalla.utils.MAX_DAYS_AHEAD)', () => {
  expect(MAX_DAYS_AHEAD).toBe(6);
});
