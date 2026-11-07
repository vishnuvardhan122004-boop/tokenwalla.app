/**
 * The staff incentive on the app's hospital Payments screen (ROADMAP 60), the
 * counterpart of src/hospital/StaffIncentiveDashboard.js, HPayments.js and
 * StaffIncentiveCard.js on the website: the dashboard, who is paid and how
 * often, and the one-line card on the hospital dashboard.
 *
 * The server owns every figure. These tests pin what is SHOWN, what is SENT
 * (four keys to the hospital's payment-details, never an amount) and that a
 * phone error never lands under the UPI box.
 */
import React from 'react';
import API from './api';
import StaffIncentive, { StaffIncentiveCard } from '../components/StaffIncentive';

// Arrives with jest-expo (not a direct dependency) and ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
  apiMessage: (_e: unknown, f: string) => f,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TOTALS = {
  enabled: true, per_booking: '4.75', month_count: 10, month_amount: '47.50',
  unpaid_amount: '19.00', paid_total: '95.00', payee_set: true, payee_name: 'Ravi',
  frequency: 'MONTHLY', frequency_days: 30, next_payout_date: '2026-12-01',
  daily: [{ date: '2026-11-05', count: 4, amount: '19.00' }],
  payments: [{ paid_at: '2026-11-01T10:00:00Z', utr: 'UTR12345', count: 20, amount: '95.00' }],
};
const DETAILS = {
  incentive_name: 'Ravi', incentive_upi: 'ravi@okbank', incentive_phone: '9876543210',
  incentive_frequency: 'MONTHLY',
};

let r: any;
const mount = async (totals: object = TOTALS, details: object = DETAILS, el?: React.ReactElement) => {
  (API.get as jest.Mock).mockImplementation((url: string) =>
    url === '/hospitals/1/incentive/' ? Promise.resolve({ data: totals })
    : url === '/hospitals/1/payment-details/' ? Promise.resolve({ data: details })
    : Promise.reject(new Error(url)));
  await act(async () => { r = TestRenderer.create(el ?? <StaffIncentive hospitalId={1} />); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const text = () => r.root.findAll((n: any) => n.type === 'Text').map(textsOf).join(' | ');
const input = (placeholder: string) =>
  r.root.findAll((n: any) => n.type === 'TextInput' && n.props.placeholder === placeholder)[0];
const button = (label: string) => r.root.findAll((n: any) =>
  typeof n.props?.onPress === 'function' && n.findAll((c: any) =>
    c.type === 'Text' && textsOf(c) === label).length > 0)[0];
const type = (placeholder: string, v: string) =>
  act(async () => { input(placeholder).props.onChangeText(v); });
const press = (label: string) => act(async () => { await button(label).props.onPress(); });
const putBody = () => (API.put as jest.Mock).mock.calls[0][1];

beforeEach(() => { jest.clearAllMocks(); (API.put as jest.Mock).mockResolvedValue({ data: {} }); });
afterEach(() => act(() => r.unmount()));

describe('the dashboard', () => {
  test('shows the four figures, the history and the rules', async () => {
    await mount();
    const t = text();
    expect(t).toContain('₹47.50');          // this month
    expect(t).toContain('10 bookings');
    expect(t).toContain('₹19.00');          // waiting
    expect(t).toContain('₹95.00');          // paid so far
    expect(t).toContain('Monthly');         // the cycle, in the next-payout tile
    expect(t).toContain('Ravi');
    expect(t).toContain('UTR12345');
    expect(t).toContain('₹4.75');           // the rule, in words, from the server's figure
    expect(t).toContain('Nothing is taken from your doctors or the hospital');
  });

  test('with the flag off it says so and shows no figures', async () => {
    await mount({ ...TOTALS, enabled: false });
    const t = text();
    expect(t).toContain('not switched on yet');
    expect(t).not.toContain('Waiting to be paid');
  });

  test('with no payee it asks for a UPI', async () => {
    await mount({ ...TOTALS, payee_set: false, payee_name: '' });
    expect(text()).toContain('Add a UPI below to start earning');
  });

  test('renders no dashboard if the totals cannot be read, the form still works', async () => {
    (API.get as jest.Mock).mockImplementation((url: string) =>
      url === '/hospitals/1/payment-details/' ? Promise.resolve({ data: DETAILS }) : Promise.reject(new Error('x')));
    await act(async () => { r = TestRenderer.create(<StaffIncentive hospitalId={1} />); });
    expect(text()).not.toContain('Waiting to be paid');
    expect(input('name@bank').props.value).toBe('ravi@okbank');
  });
});

describe('who is paid and how often', () => {
  test('the form starts from what the hospital saved', async () => {
    await mount();
    expect(input('Front-desk person').props.value).toBe('Ravi');
    expect(input('name@bank').props.value).toBe('ravi@okbank');
    expect(input('10-digit mobile (optional)').props.value).toBe('9876543210');
  });

  test('Save sends exactly four keys to the hospital payment-details, then reloads the dashboard', async () => {
    await mount();
    await type('name@bank', ' new@okbank ');
    await press('Save staff incentive');
    expect(API.put).toHaveBeenCalledWith('/hospitals/1/payment-details/', {
      incentive_name: 'Ravi', incentive_upi: 'new@okbank',
      incentive_phone: '9876543210', incentive_frequency: 'MONTHLY',
    });
    const reloads = (API.get as jest.Mock).mock.calls.filter(([u]) => u === '/hospitals/1/incentive/');
    expect(reloads).toHaveLength(2);
  });

  test('a cycle button picks the cycle, and Save sends it', async () => {
    await mount();
    await press('Every 15 days');
    await press('Save staff incentive');
    expect(putBody().incentive_frequency).toBe('FIFTEEN_DAYS');
    expect(putBody()).not.toHaveProperty('amount');
  });

  test('a bad UPI is refused before the round trip, under the UPI box', async () => {
    await mount();
    await type('name@bank', 'not a upi');
    await press('Save staff incentive');
    expect(API.put).not.toHaveBeenCalled();
    expect(text()).toContain('Enter a valid UPI ID');
  });

  test('a bad phone is refused under the phone box, not the UPI box', async () => {
    await mount();
    await type('10-digit mobile (optional)', '12345');
    await press('Save staff incentive');
    expect(API.put).not.toHaveBeenCalled();
    expect(text()).toContain('Enter a valid 10-digit mobile number');
    expect(text()).not.toContain('Enter a valid UPI ID');
  });

  test('the phone box keeps its own ten digits and never sets maxLength', async () => {
    await mount();
    await type('10-digit mobile (optional)', '+91 98765 43210');
    expect(input('10-digit mobile (optional)').props.value).toBe('9876543210');
    expect(input('10-digit mobile (optional)').props.maxLength).toBeUndefined();
  });

  test('the server\'s phone error shows under the phone box', async () => {
    (API.put as jest.Mock).mockRejectedValue({
      response: { data: { errors: { incentive_phone: ['Enter a valid mobile number.'] } } },
    });
    await mount();
    await press('Save staff incentive');
    expect(text()).toContain('Enter a valid mobile number.');
    expect(text()).not.toContain('Enter a valid UPI ID');
  });

  test('an empty UPI is allowed (it clears the payee)', async () => {
    await mount();
    await type('name@bank', '');
    await press('Save staff incentive');
    expect(putBody().incentive_upi).toBe('');
  });
});

describe('the card on the hospital dashboard', () => {
  test('shows the month and what is waiting, and opens the Payments screen', async () => {
    const onOpen = jest.fn();
    await mount(TOTALS, DETAILS, <StaffIncentiveCard hospitalId={1} onOpen={onOpen} />);
    const t = text();
    expect(t).toContain('₹47.50');
    expect(t).toContain('₹19.00');
    await press('See details');
    expect(onOpen).toHaveBeenCalled();
  });

  test('without a payee it points at Payments', async () => {
    await mount({ ...TOTALS, payee_set: false }, DETAILS, <StaffIncentiveCard hospitalId={1} onOpen={() => {}} />);
    expect(text()).toContain('Add a UPI in Payments to start earning');
  });

  test('renders nothing while the flag is off', async () => {
    await mount({ ...TOTALS, enabled: false }, DETAILS, <StaffIncentiveCard hospitalId={1} onOpen={() => {}} />);
    expect(r.toJSON()).toBeNull();
  });
});
