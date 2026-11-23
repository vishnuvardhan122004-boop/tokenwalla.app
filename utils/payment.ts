/**
 * utils/payment.ts
 *
 * Pure helpers for the Razorpay payment flow, extracted so they can be unit
 * tested without a WebView or React tree. Used by `app/(patient)/payment.tsx`
 * and `components/RescheduleModal.tsx`.
 */
import { Linking } from 'react-native';

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
 * a pass PURCHASE replaces the service fee with ₹40, it does not replace the
 * consultation fee, so at a FULL doctor the bill is ₹40 PLUS that fee. While
 * the pass was only ever offered at SERVICE_ONLY doctors `doctorFeeOnline` was
 * always 0 and the missing term was invisible — the moment the pass became
 * universal it would have shown ₹40 and then opened Razorpay for ₹240.
 *
 * `total` is the server's own `final_amount` for an ordinary booking, so the
 * no-pass case does no arithmetic at all. Returns null while the fee breakdown
 * is still loading, which is what keeps the Pay button disabled.
 */
/**
 * Whether checkout shows the promo-code box. Only while the server says codes
 * are on (`promo_codes_enabled` on /payment/pass/, i.e. INFLUENCER_CODES_ENABLED):
 * off, every code is refused, so the box only invites a "no". A server that
 * doesn't say hides it too. And a code is for a plain booking only: not a scan,
 * not with a pass bought or spent.
 */
export function promoOffered(opts: {
  passData: { promo_codes_enabled?: boolean; [field: string]: unknown } | null | undefined;
  isScan: boolean; redeemIsFree: boolean; redeemNeedsPay: boolean; passSelected: boolean;
}): boolean {
  const { passData, isScan, redeemIsFree, redeemNeedsPay, passSelected } = opts;
  return passData?.promo_codes_enabled === true
    && !isScan && !redeemIsFree && !redeemNeedsPay && !passSelected;
}

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
  // An influencer promo code's saving (0 = none). The server says how much;
  // it only ever applies to a plain booking, so it comes off `total` alone.
  promoSaving?: number;
}): number | null {
  const { redeemIsFree, redeemNeedsPay, passSelected,
          doctorFeeOnline, passPrice, total, priorityExtra = 0, promoSaving = 0 } = opts;
  if (redeemIsFree)   return 0;
  if (redeemNeedsPay) return doctorFeeOnline + priorityExtra;
  if (passSelected)   return doctorFeeOnline + passPrice + priorityExtra;
  return total === null ? null : total + priorityExtra - promoSaving;
}

/**
 * A link the payment WebView must hand to the phone instead of loading itself,
 * or null for a normal web page. With `webview_intent: true` Razorpay's PhonePe /
 * GPay / Paytm buttons navigate to `upi://…`, an app scheme, or Android's
 * `intent://…#Intent;scheme=upi;…;end` wrapper; a WebView can load none of them.
 * The wrapper is unwrapped to `upi://…`, which React Native's Linking can open.
 */
export function externalPaymentUrl(url: string): string | null {
  if (/^(https?|about|data|blob|javascript):/i.test(url)) return null;
  const intent = /^intent:\/\/([^#]*)#Intent;(.*)$/i.exec(url);
  if (intent) {
    const scheme = /(?:^|;)scheme=([^;]+)/i.exec(intent[2])?.[1];
    return scheme ? `${scheme}://${intent[1]}` : null;
  }
  return url;
}

/**
 * The payment WebView's `onShouldStartLoadWithRequest`: opens a UPI app link
 * in that app (and calls `onNoApp` if none is installed), loads everything else.
 * Needed because the WebView's `originWhitelist={['*']}` keeps every link inside.
 */
export function handlePaymentLink(url: string, onNoApp: () => void): boolean {
  const ext = externalPaymentUrl(url);
  if (!ext) return true;
  Linking.openURL(ext).catch(onNoApp);
  return false;
}

/**
 * What to tell a patient whose verify failed AFTER the card was charged.
 *  - 'server':   the server already put the money back and said so in plain
 *                words (`refunded` is true or false) — show its message.
 *  - 'received': anything else (a dropped connection, a 5xx, a mismatch). The
 *                webhook may already have made the token, so say the payment
 *                arrived and not to pay again; never "verification failed".
 */
export function afterPayFailure(data: any): 'server' | 'received' {
  return data && data.refunded !== undefined && data.message ? 'server' : 'received';
}
