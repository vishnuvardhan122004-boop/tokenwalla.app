import { formatDelay } from './formatDelay';

// Same cases as the website's src/services/formatDelay.js: the staff dashboard
// and the patient banner must read the same on both platforms.
test.each([
  [5, '5m'],
  [15, '15m'],
  [60, '1h'],
  [90, '1h 30m'],
  [150, '2h 30m'],
  [180, '3h'],
])('%i minutes reads %s', (minutes, text) => {
  expect(formatDelay(minutes)).toBe(text);
});
