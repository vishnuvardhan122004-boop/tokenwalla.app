import { staffTodayMessage } from '../components/DeskPicker';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('./api', () => ({ __esModule: true, default: {} }));

test('the count always shows; the rupees only once the incentive is paying', () => {
  expect(staffTodayMessage({ name: 'Lata', count: 5, amount: 35, per_booking: 7 })).toBe('Lata +₹7 · 5 today · ₹35');
  expect(staffTodayMessage({ name: 'Lata', count: 5, amount: 0 })).toBe('Lata · 5 today');
  expect(staffTodayMessage(null)).toBe('Saved.');
});
