import { parsePaymentMessage } from './payment';

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
