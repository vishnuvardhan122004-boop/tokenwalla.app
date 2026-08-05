/**
 * utils/fees.ts
 *
 * Client-side mirror of backend/payments/fees.py (and the website's
 * src/services/fees.js), kept ONLY as a fallback: checkout renders the
 * server-computed `doctor.fee_breakdown`, so the quoted price can't drift from
 * what the backend charges. This mirror runs only when an older backend
 * doesn't serve that field — better a possibly-stale preview than a checkout
 * stuck on "Loading…". The amount actually charged is always the server's
 * order amount. Keep the constants below in sync with payments/fees.py.
 */

export const PLATFORM_FEE = 20.0;
export const GATEWAY_FEE  = 1.5;
export const GST_RATE     = 0.18;

const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Format a rupee amount: whole numbers stay clean, fractions show 2 decimals. */
export const money = (n: number | string): string => {
  const r = round2(Number(n) || 0);
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

// The server sends every figure as a string; the local mirror returns numbers.
export interface FeeBreakdown {
  doctor_fee:         number | string;  // charged ONLINE
  offline_doctor_fee: number | string;  // payable at the clinic (SERVICE_ONLY)
  platform_fee:       number | string;
  gateway_fee:        number | string;
  gst_amount:         number | string;
  final_amount:       number | string;
}

// doctor_fee is a GST-exempt healthcare service; GST applies only to the
// platform + gateway fees. Mirrors compute_fee_breakdown().
//
// Anything other than an explicit "FULL" means the consultation fee is
// collected at the clinic, so nothing is captured online for the doctor —
// `offline_doctor_fee` carries the amount payable at the desk. Blank/unset
// counts as service-only, same as the backend.
export function computeFeeBreakdown(
  doctorFee: number | string,
  collectionMode: string = 'SERVICE_ONLY',
): FeeBreakdown {
  const fee          = round2(Number(doctorFee) || 0);
  const serviceOnly  = collectionMode !== 'FULL';
  const platform_fee = round2(PLATFORM_FEE);
  const gateway_fee  = round2(GATEWAY_FEE);
  const gst_amount   = round2((platform_fee + gateway_fee) * GST_RATE);
  const doctor_fee   = serviceOnly ? 0 : fee;
  return {
    doctor_fee,
    offline_doctor_fee: serviceOnly ? fee : 0,
    platform_fee,
    gateway_fee,
    gst_amount,
    final_amount: round2(doctor_fee + platform_fee + gateway_fee + gst_amount),
  };
}
