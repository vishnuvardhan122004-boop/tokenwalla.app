import { computeFeeBreakdown, money } from './fees';

// These figures must match backend/payments/fees.py — the mirror is only a
// fallback preview, but a wrong fallback quotes a price we never charge.
describe('computeFeeBreakdown', () => {
  it('SERVICE_ONLY (the default) charges only the service fee online', () => {
    const b = computeFeeBreakdown(200);
    expect(b.doctor_fee).toBe(0);
    expect(b.offline_doctor_fee).toBe(200);
    expect(b.final_amount).toBe(25.37);   // 20 + 1.5 + 3.87 GST
  });

  it('treats a blank or unknown mode as SERVICE_ONLY', () => {
    expect(computeFeeBreakdown(200, '').final_amount).toBe(25.37);
    expect(computeFeeBreakdown(200, 'WHATEVER').final_amount).toBe(25.37);
  });

  it('FULL adds the consultation fee to the online total', () => {
    const b = computeFeeBreakdown(200, 'FULL');
    expect(b.doctor_fee).toBe(200);
    expect(b.offline_doctor_fee).toBe(0);
    expect(b.final_amount).toBe(225.37);
  });

  it('money() keeps whole rupees clean and pads fractions to 2dp', () => {
    expect(money(200)).toBe('200');
    expect(money('25.37')).toBe('25.37');
    expect(money(25.4)).toBe('25.40');
  });
});
