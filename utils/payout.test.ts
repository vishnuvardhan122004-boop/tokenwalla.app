import { EMPTY_PAYOUT, normaliseIfsc, payoutPayload, validatePayout } from './payout';

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

describe('normaliseIfsc', () => {
  it('keeps a clean code unchanged', () => {
    expect(normaliseIfsc('HDFC0001234')).toBe('HDFC0001234');
  });

  it('upper-cases what was typed in lower case', () => {
    expect(normaliseIfsc('hdfc0001234')).toBe('HDFC0001234');
  });

  it('drops the packaging a pasted code arrives with', () => {
    // The cases that used to fail the form: a copy out of a bank SMS or
    // statement carries spaces, and maxLength clipped the tail off instead.
    expect(normaliseIfsc(' HDFC0001234 ')).toBe('HDFC0001234');
    expect(normaliseIfsc('HDFC 0001234')).toBe('HDFC0001234');
    expect(normaliseIfsc('HDFC-0001234')).toBe('HDFC0001234');
    expect(normaliseIfsc('\nHDFC0001234\n')).toBe('HDFC0001234');
  });

  it('caps at 11, which is what makes maxLength unnecessary', () => {
    expect(normaliseIfsc('HDFC0001234EXTRA')).toBe('HDFC0001234');
    expect(normaliseIfsc('HDFC0001234')).toHaveLength(11);
  });

  it('handles empty and junk input without throwing', () => {
    expect(normaliseIfsc('')).toBe('');
    expect(normaliseIfsc('   ')).toBe('');
    expect(normaliseIfsc(undefined as unknown as string)).toBe('');
  });

  it('produces a value validatePayout accepts', () => {
    const f = {
      ...EMPTY_PAYOUT, payment_method: 'BANK' as const,
      account_holder_name: 'City Care', account_number: '12345678',
      ifsc_code: normaliseIfsc(' hdfc 0001234 '),
    };
    expect(validatePayout(f)).toEqual({});
    expect(payoutPayload(f).ifsc_code).toBe('HDFC0001234');
  });
});
