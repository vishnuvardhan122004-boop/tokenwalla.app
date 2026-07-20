/**
 * utils/payment.ts
 *
 * Pure helpers for the Razorpay payment flow, extracted so they can be unit
 * tested without a WebView or React tree. Used by `app/(patient)/payment.tsx`
 * and `components/RescheduleModal.tsx`.
 */

/**
 * The message the payment WebView posts back to React Native via
 * `window.ReactNativeWebView.postMessage(...)`. One of three outcomes.
 */
export type PaymentWebViewMessage =
  | { type: 'SUCCESS'; orderId?: string; paymentId?: string; signature?: string }
  | { type: 'CANCELLED' }
  | { type: 'FAILED'; message?: string; reason?: string; code?: string; step?: string };

const KNOWN_TYPES = ['SUCCESS', 'CANCELLED', 'FAILED'] as const;

/**
 * Safely parse a message coming off `event.nativeEvent.data`.
 *
 * Returns the typed message, or `null` when the payload is not a string, not
 * valid JSON, not an object, or doesn't carry a recognised `type`. The caller
 * should ignore a `null` result — this is what stops malformed/hostile WebView
 * output from driving the payment handler.
 */
export function parsePaymentMessage(raw: unknown): PaymentWebViewMessage | null {
  if (typeof raw !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== 'string' || !KNOWN_TYPES.includes(type as (typeof KNOWN_TYPES)[number])) {
    return null;
  }

  return parsed as PaymentWebViewMessage;
}
