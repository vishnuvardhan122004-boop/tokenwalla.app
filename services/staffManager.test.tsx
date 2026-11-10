/**
 * Adding and editing front-desk staff in the app (web ROADMAP 69), the
 * counterpart of src/hospital/StaffManager.test.js: the mobile number is
 * required, the PIN is shown once after a save (the server keeps only a hash),
 * and an edit leaves the PIN out unless a new one is typed.
 */
import React from 'react';
import API from './api';
import StaffManager from '../components/StaffManager';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  apiMessage: (_e: unknown, f: string) => f,
}));
const act = (React as any).act;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SITA = { id: 8, name: 'Sita', upi: '', phone: '', active: true };
let r: any;
const mount = async (data: unknown = [SITA]) => {
  (API.get as jest.Mock).mockResolvedValue({ data });
  await act(async () => { r = TestRenderer.create(<StaffManager hospitalId={3} />); });
};
const textsOf = (n: any) => [n.props.children].flat(Infinity)
  .filter((c: unknown) => typeof c === 'string' || typeof c === 'number').join('');
const text = () => r.root.findAll((n: any) => n.type === 'Text').map(textsOf).join(' | ');
const byLabel = (label: string) => r.root.findAll((n: any) =>
  n.props?.accessibilityLabel === label && (n.props.onPress || n.props.onChangeText))[0];
const press = (label: string) => act(async () => { await byLabel(label).props.onPress(); });
const type = (label: string, v: string) => act(async () => { byLabel(label).props.onChangeText(v); });

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => r.unmount()));

test('an older server (no list) shows nothing', async () => {
  await mount({ detail: 'Not found' });
  expect(text()).not.toContain('Front-desk staff');
});

test('lists people and flags a missing mobile number and UPI', async () => {
  await mount();
  expect(text()).toContain('Sita');
  expect(text()).toContain('add a mobile number');
  expect(text()).toContain('no UPI yet');
});

test('adding a person needs a 10-digit mobile, then shows the PIN once', async () => {
  await mount([]);
  (API.post as jest.Mock).mockResolvedValue({ data: {} });
  await press('Add a person');
  await type('Name', 'Latha');
  await type('4-digit PIN', '4321');
  await press('Add person');
  expect(API.post).not.toHaveBeenCalled();
  expect(text()).toContain('Enter the 10-digit mobile number.');
  await type('Mobile number', '92222-22222');
  await press('Add person');
  expect(API.post).toHaveBeenCalledWith('/hospitals/3/staff/', {
    name: 'Latha', upi: '', phone: '9222222222', active: true, pin: '4321',
  });
  expect(text()).toContain("Saved. Latha's PIN is");
  expect(text()).toContain('4321');
  await press('Hide PIN');
  expect(text()).not.toContain('4321');
});

test('editing leaves the PIN out unless a new one is typed; a reset shows the new one', async () => {
  await mount();
  (API.patch as jest.Mock).mockResolvedValue({ data: {} });
  await press('Edit Sita');
  await type('Mobile number', '9111111111');
  await press('Save changes');
  expect((API.patch as jest.Mock).mock.calls[0][1]).not.toHaveProperty('pin');
  expect(text()).not.toContain('PIN is');
  await press('Reset PIN for Sita');
  await type('Mobile number', '9111111111');
  await type('New PIN (leave blank to keep)', '5678');
  await press('Save changes');
  expect(API.patch).toHaveBeenLastCalledWith('/hospitals/3/staff/8/', expect.objectContaining({ pin: '5678' }));
  expect(text()).toContain('5678');
});

test('a server field error is shown under its field', async () => {
  await mount([]);
  (API.post as jest.Mock).mockRejectedValue({ response: { data: { upi: ['Enter a valid UPI ID (e.g. name@bank).'] } } });
  await press('Add a person');
  await type('Name', 'X');
  await type('Mobile number', '9222222222');
  await type('UPI ID (to pay them)', 'nope');
  await type('4-digit PIN', '1234');
  await press('Add person');
  expect(text()).toContain('Enter a valid UPI ID');
});

test('a pasted +91 number is cleaned and a number not starting 6-9 is refused (web ROADMAP 71)', async () => {
  await mount([]);
  (API.post as jest.Mock).mockResolvedValue({ data: {} });
  await press('Add a person');
  await type('Name', 'Latha');
  await type('4-digit PIN', '4321');
  await type('Mobile number', '5876543210');
  await press('Add person');
  expect(API.post).not.toHaveBeenCalled();
  expect(text()).toContain('A mobile number starts with 6, 7, 8 or 9.');
  await type('Mobile number', '+91 98765 43210');     // a plain digit filter would keep 9198765432
  await press('Add person');
  expect((API.post as jest.Mock).mock.calls[0][1].phone).toBe('9876543210');
});

test('Delete asks first, then hides the person and says their money is still paid', async () => {
  await mount([{ ...SITA, phone: '9111111111', upi: 'sita@ok' }]);
  (API.delete as jest.Mock).mockResolvedValue({ data: { deleted: true, kept_for_payouts: true } });
  await press('Delete Sita');
  expect(API.delete).not.toHaveBeenCalled();
  expect(text()).toContain('Delete Sita?');
  await press('Keep');
  expect(text()).not.toContain('Delete Sita?');
  await press('Delete Sita');
  (API.get as jest.Mock).mockResolvedValue({ data: [] });
  await press('Yes, delete Sita');
  expect(API.delete).toHaveBeenCalledWith('/hospitals/3/staff/8/');
  expect(text()).toContain('still paid to them');
});
