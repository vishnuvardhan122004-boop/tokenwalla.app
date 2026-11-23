import { checkoutPayable, parsePaymentMessage, promoOffered } from './payment';

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

describe('checkoutPayable — a priority seat on top', () => {
  const base = {
    redeemIsFree: false, redeemNeedsPay: false, passSelected: false,
    doctorFeeOnline: 0, passPrice: 40, total: 26,
  };
  it('adds the GST-inclusive priority price to an ordinary bill', () => {
    expect(checkoutPayable({ ...base, priorityExtra: 59 })).toBeCloseTo(85, 2);
  });
  it('rides on a pass purchase and on a paid FULL redemption', () => {
    expect(checkoutPayable({ ...base, passSelected: true, priorityExtra: 59 })).toBe(99);
    expect(checkoutPayable({
      ...base, redeemNeedsPay: true, doctorFeeOnline: 200, priorityExtra: 59,
    })).toBe(259);
  });
  it('takes a promo saving off a plain booking only', () => {
    expect(checkoutPayable({ ...base, promoSaving: 5 })).toBe(21);
    expect(checkoutPayable({ ...base, promoSaving: 5, priorityExtra: 59 })).toBe(80);
  });
  it('never turns a free redemption into a charge, or a loading bill into a number', () => {
    expect(checkoutPayable({ ...base, redeemIsFree: true, priorityExtra: 59 })).toBe(0);
    expect(checkoutPayable({ ...base, total: null, priorityExtra: 59 })).toBeNull();
  });
});

describe('checkoutPayable — what the patient is charged', () => {
  const base = {
    redeemIsFree: false, redeemNeedsPay: false, passSelected: false,
    doctorFeeOnline: 0, passPrice: 40, total: 26,
  };

  it('a SERVICE_ONLY redemption is free', () => {
    expect(checkoutPayable({ ...base, redeemIsFree: true })).toBe(0);
  });

  it('a FULL redemption charges the consultation fee alone', () => {
    // The pass waived the service fee; the ₹200 consultation fee still stands.
    expect(checkoutPayable({
      ...base, redeemNeedsPay: true, doctorFeeOnline: 200, total: 226,
    })).toBe(200);
  });

  it('buying a pass at a SERVICE_ONLY doctor costs the pass price', () => {
    expect(checkoutPayable({ ...base, passSelected: true })).toBe(40);
  });

  it('buying a pass at a FULL doctor costs the pass price PLUS the fee', () => {
    // The regression this helper exists for: 40 alone would have been shown,
    // then Razorpay would have asked for 240.
    expect(checkoutPayable({
      ...base, passSelected: true, doctorFeeOnline: 200, total: 226,
    })).toBe(240);
  });

  it('no pass in play just uses the server total', () => {
    expect(checkoutPayable(base)).toBe(26);
    expect(checkoutPayable({ ...base, total: null })).toBeNull();
  });
});

describe('promoOffered — the promo box at checkout', () => {
  const plain = { isScan: false, redeemIsFree: false, redeemNeedsPay: false, passSelected: false };
  const on = { enabled: false, promo_codes_enabled: true };

  it('shows only while the server says promo codes are on', () => {
    expect(promoOffered({ ...plain, passData: on })).toBe(true);
    expect(promoOffered({ ...plain, passData: { promo_codes_enabled: false } })).toBe(false);
  });

  it('hides when the server does not say (older backend) or /payment/pass/ failed', () => {
    expect(promoOffered({ ...plain, passData: { enabled: true } })).toBe(false);
    expect(promoOffered({ ...plain, passData: null })).toBe(false);
  });

  it('is for a plain booking only, even with codes on', () => {
    expect(promoOffered({ ...plain, passData: on, isScan: true })).toBe(false);
    expect(promoOffered({ ...plain, passData: on, redeemIsFree: true })).toBe(false);
    expect(promoOffered({ ...plain, passData: on, redeemNeedsPay: true })).toBe(false);
    expect(promoOffered({ ...plain, passData: on, passSelected: true })).toBe(false);
  });
});
