import { EMPTY_PAYOUT, payoutPayload, validatePayout } from './payout';

const form = (over: Partial<typeof EMPTY_PAYOUT>) => ({ ...EMPTY_PAYOUT, ...over });

describe('validatePayout', () => {
  it('accepts an unset method — a hospital can save notes before picking a rail', () => {
    expect(validatePayout(EMPTY_PAYOUT)).toEqual({});
  });

  it('requires a well-formed UPI ID when the method is UPI', () => {
    expect(validatePayout(form({ payment_method: 'UPI' })).upi_id).toBeTruthy();
    expect(validatePayout(form({ payment_method: 'UPI', upi_id: 'clinic' })).upi_id).toBeTruthy();
    expect(validatePayout(form({ payment_method: 'UPI', upi_id: 'clinic@okhdfc' }))).toEqual({});
  });

  it('requires holder, number and a valid IFSC for a bank payout', () => {
    const errs = validatePayout(form({ payment_method: 'BANK' }));
    expect(Object.keys(errs).sort()).toEqual(['account_holder_name', 'account_number', 'ifsc_code']);
    expect(validatePayout(form({
      payment_method: 'BANK', account_holder_name: 'City Care', account_number: '12345678',
      ifsc_code: 'HDFC0001234',
    }))).toEqual({});
    expect(validatePayout(form({
      payment_method: 'BANK', account_holder_name: 'City Care', account_number: '12345678',
      ifsc_code: 'HDFC1234',
    })).ifsc_code).toBeTruthy();
  });

  it('still rejects a malformed IFSC left behind after switching to UPI', () => {
    expect(validatePayout(form({
      payment_method: 'UPI', upi_id: 'clinic@okhdfc', ifsc_code: 'nope',
    })).ifsc_code).toBeTruthy();
  });

  it('payoutPayload trims and upper-cases the IFSC', () => {
    const p = payoutPayload(form({ ifsc_code: ' hdfc0001234 ', upi_id: ' a@b ' }));
    expect(p.ifsc_code).toBe('HDFC0001234');
    expect(p.upi_id).toBe('a@b');
  });
});
