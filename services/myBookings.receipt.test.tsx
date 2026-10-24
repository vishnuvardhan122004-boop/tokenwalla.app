/**
 * My Bookings shows a Receipt link on a paid booking, opening the GST receipt
 * from GET /payment/receipt/<id>/. The app mirror of the website's
 * MyBookings.receipt.test.js (web #102). A free booking has nothing to itemise.
 */
import React from 'react';
import { Stack } from 'expo-router';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import API from './api';
import { I18nProvider } from './i18n';
import MyBookings from '../app/(patient)/my-bookings';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('./notifications', () => ({ syncAppointmentReminders: jest.fn() }));
jest.mock('./reportFile', () => ({ openSharedDocument: jest.fn() }));
jest.mock('../components/RescheduleModal', () => ({ __esModule: true, default: () => null }));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  getUser: jest.fn().mockResolvedValue({ id: 1, name: 'Asha', role: 'patient' }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routes = {
  _layout: () => <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>,
  '(patient)/my-bookings': MyBookings,
};
const booking = (id: number, amount: number) => ({
  id, token: String(id), status: 'CONFIRMED', date: '2026-10-30', slot: '10:00 AM', amount,
  doctor_name: `Dr Test ${id}`, hospital_name: 'City', provider_kind: 'DOCTOR', queue_access: false,
});
const receipt = {
  seller: { gstin: '37ABCDE1234F1Z5' }, receipt_no: 'TW-000042', issued_at: '24 Oct 2026, 10:00 AM',
  payment_id: 'pay_abc', booking: { patient: 'Asha', doctor: 'Dr Test 1', hospital: 'City', date: '2026-10-30', slot: '10:00 AM', token: '1' },
  line_items: [
    { description: 'Doctor Consultation Fee', sac_code: null, taxable_value: '300.00', gst_rate: '0%', gst_amount: '0.00', note: 'Healthcare service — GST exempt' },
    { description: 'Platform Fee', sac_code: '999799', taxable_value: '10.00', gst_rate: '18%', gst_amount: null },
  ],
  taxable_value: '10.00', gst: { rate: '18%', amount: '1.80' }, total: '311.80', pass: null, note: '',
};

let r: any;
const mount = async (bookings: object[]) => {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  (API.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/bookings/my/') return Promise.resolve({ data: bookings });
    if (url.startsWith('/payment/receipt/')) return Promise.resolve({ data: receipt });
    return Promise.resolve({ data: {} });
  });
  await act(async () => {
    r = TestRenderer.create(<ExpoRoot context={getMockContext(routes)} location="/my-bookings" />);
  });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (re: RegExp) => r.root.findAll((n: any) => n.type === 'Text' && re.test(textsOf(n)));
const press = async (re: RegExp, nth = 0) => {
  let p = texts(re)[nth];
  while (p && typeof p.props.onPress !== 'function') p = p.parent;
  await act(async () => { p.props.onPress(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
};
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

test('a paid booking has a Receipt link, a free one does not', async () => {
  await mount([booking(1, 311), booking(2, 0)]);
  expect(texts(/^Receipt$/)).toHaveLength(1);
});

test('the link opens the itemised GST receipt', async () => {
  await mount([booking(1, 311)]);
  await press(/^Receipt$/);
  expect(API.get).toHaveBeenCalledWith('/payment/receipt/1/');
  expect(texts(/^TW-000042$/)).not.toHaveLength(0);
  expect(texts(/GSTIN: 37ABCDE1234F1Z5/)).not.toHaveLength(0);
  expect(texts(/^Doctor Consultation Fee$/)).not.toHaveLength(0);
  expect(texts(/Healthcare service — GST exempt/)).not.toHaveLength(0);
  expect(texts(/^SAC 999799$/)).not.toHaveLength(0);
  expect(texts(/^₹311\.80$/)).not.toHaveLength(0);      // total
  expect(texts(/^GST \(18%\)$/)).not.toHaveLength(0);
});

test('a booking with no itemised receipt shows the server\'s reason', async () => {
  await mount([booking(1, 311)]);
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/payment/receipt/')
      ? Promise.reject({ response: { data: { message: 'No itemised receipt is available for this booking.' } } })
      : Promise.resolve({ data: [booking(1, 311)] }));
  await press(/^Receipt$/);
  expect(texts(/No itemised receipt is available for this booking\./)).not.toHaveLength(0);
});

test('a pass receipt says which side of the pass it is', async () => {
  await mount([booking(1, 311)]);
  (API.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url.startsWith('/payment/receipt/')
      ? { ...receipt, pass: { id: 9, role: 'redeemed' }, note: 'Service fee already paid on Appointment Pass #9.' }
      : [booking(1, 311)] }));
  await press(/^Receipt$/);
  expect(texts(/Appointment Pass #9 — redeemed against this booking/)).not.toHaveLength(0);
  expect(texts(/Service fee already paid on Appointment Pass #9\./)).not.toHaveLength(0);
});
