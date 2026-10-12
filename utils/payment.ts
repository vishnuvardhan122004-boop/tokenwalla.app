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

/**
 * What the patient is charged right now, given what the pass is doing.
 *
 * Extracted because this is the one line the FULL-doctor pass path got wrong:
 * a pass PURCHASE replaces the service fee with ₹35, it does not replace the
 * consultation fee, so at a FULL doctor the bill is ₹35 PLUS that fee. While
 * the pass was only ever offered at SERVICE_ONLY doctors `doctorFeeOnline` was
 * always 0 and the missing term was invisible — the moment the pass became
 * universal it would have shown ₹35 and then opened Razorpay for ₹235.
 *
 * `total` is the server's own `final_amount` for an ordinary booking, so the
 * no-pass case does no arithmetic at all. Returns null while the fee breakdown
 * is still loading, which is what keeps the Pay button disabled.
 */
export function checkoutPayable(opts: {
  redeemIsFree: boolean;     // SERVICE_ONLY redemption — nothing left to charge
  redeemNeedsPay: boolean;   // FULL redemption — the consultation fee stands
  passSelected: boolean;     // buying a pass with this booking
  doctorFeeOnline: number;   // breakdown.doctor_fee (0 unless FULL)
  passPrice: number;
  total: number | null;
  // A priority seat, GST included (0 = none). Rides on top of every paid
  // case; a free redemption never offers one (there is no checkout to carry it).
  priorityExtra?: number;
}): number | null {
  const { redeemIsFree, redeemNeedsPay, passSelected,
          doctorFeeOnline, passPrice, total, priorityExtra = 0 } = opts;
  if (redeemIsFree)   return 0;
  if (redeemNeedsPay) return doctorFeeOnline + priorityExtra;
  if (passSelected)   return doctorFeeOnline + passPrice + priorityExtra;
  return total === null ? null : total + priorityExtra;
}
