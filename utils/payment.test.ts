import { checkoutPayable, parsePaymentMessage } from './payment';

describe('parsePaymentMessage', () => {
  it('parses a SUCCESS message and preserves the order/payment/signature fields', () => {
    const raw = JSON.stringify({
      type: 'SUCCESS',
      orderId: 'order_ABC',
      paymentId: 'pay_XYZ',
      signature: 'sig_123',
    });
    expect(parsePaymentMessage(raw)).toEqual({
      type: 'SUCCESS',
      orderId: 'order_ABC',
      paymentId: 'pay_XYZ',
      signature: 'sig_123',
    });
  });

  it('parses a CANCELLED message', () => {
    expect(parsePaymentMessage(JSON.stringify({ type: 'CANCELLED' }))).toEqual({
      type: 'CANCELLED',
    });
  });

  it('parses a FAILED message with error detail fields', () => {
    const raw = JSON.stringify({
      type: 'FAILED',
      message: 'Payment declined',
      reason: 'insufficient_funds',
      code: 'BAD_REQUEST_ERROR',
      step: 'payment_authentication',
    });
    expect(parsePaymentMessage(raw)).toMatchObject({
      type: 'FAILED',
      message: 'Payment declined',
      reason: 'insufficient_funds',
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parsePaymentMessage('{ not valid json')).toBeNull();
    expect(parsePaymentMessage('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parsePaymentMessage(undefined)).toBeNull();
    expect(parsePaymentMessage(null)).toBeNull();
    expect(parsePaymentMessage(42)).toBeNull();
    expect(parsePaymentMessage({ type: 'SUCCESS' })).toBeNull(); // already an object, not raw string
  });

  it('returns null for JSON that is valid but not an object', () => {
    expect(parsePaymentMessage('123')).toBeNull();
    expect(parsePaymentMessage('true')).toBeNull();
    expect(parsePaymentMessage('"SUCCESS"')).toBeNull();
    expect(parsePaymentMessage('null')).toBeNull();
  });

  it('returns null when the type is missing or unrecognised', () => {
    expect(parsePaymentMessage(JSON.stringify({ orderId: 'x' }))).toBeNull();
    expect(parsePaymentMessage(JSON.stringify({ type: 'HACK' }))).toBeNull();
    expect(parsePaymentMessage(JSON.stringify({ type: 42 }))).toBeNull();
  });

  it('returns null for an array payload', () => {
    expect(parsePaymentMessage(JSON.stringify(['SUCCESS']))).toBeNull();
  });
});

describe('checkoutPayable — what the patient is charged', () => {
  const base = {
    redeemIsFree: false, redeemNeedsPay: false, passSelected: false,
    doctorFeeOnline: 0, passPrice: 35, total: 25.37,
  };

  it('a SERVICE_ONLY redemption is free', () => {
    expect(checkoutPayable({ ...base, redeemIsFree: true })).toBe(0);
  });

  it('a FULL redemption charges the consultation fee alone', () => {
    // The pass waived the service fee; the ₹200 consultation fee still stands.
    expect(checkoutPayable({
      ...base, redeemNeedsPay: true, doctorFeeOnline: 200, total: 225.37,
    })).toBe(200);
  });

  it('buying a pass at a SERVICE_ONLY doctor costs the pass price', () => {
    expect(checkoutPayable({ ...base, passSelected: true })).toBe(35);
  });

  it('buying a pass at a FULL doctor costs the pass price PLUS the fee', () => {
    // The regression this helper exists for: 35 alone would have been shown,
    // then Razorpay would have asked for 235.
    expect(checkoutPayable({
      ...base, passSelected: true, doctorFeeOnline: 200, total: 225.37,
    })).toBe(235);
  });

  it('no pass in play just uses the server total', () => {
    expect(checkoutPayable(base)).toBe(25.37);
    expect(checkoutPayable({ ...base, total: null })).toBeNull();
  });
});
