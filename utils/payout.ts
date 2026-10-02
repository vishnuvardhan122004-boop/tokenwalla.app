/**
 * utils/payout.ts
 *
 * Payout-account shapes and validation, shared by the hospital's Doctor
 * Payments screen (a doctor's own account) and the hospital profile (the
 * hospital's account, used for salaried doctors). Mirrors the backend
 * validation so staff get the error before the round-trip — the server
 * validates again and stays the authority.
 */

export interface PayoutForm {
  payment_method: '' | 'UPI' | 'BANK';
  upi_id: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  payout_notes: string;
}

export const EMPTY_PAYOUT: PayoutForm = {
  payment_method: '',
  upi_id: '',
  account_holder_name: '',
  bank_name: '',
  account_number: '',
  ifsc_code: '',
  payout_notes: '',
};

export const PAYMENT_METHODS: { value: PayoutForm['payment_method']; label: string }[] = [
  { value: '',     label: 'Not set'      },
  { value: 'UPI',  label: 'UPI'          },
  { value: 'BANK', label: 'Bank Account' },
];

const UPI_RE  = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
const IFSC_RE = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

/**
 * What an IFSC box should keep from what someone types or pastes.
 *
 * An IFSC is exactly eleven alphanumerics (four letters, a 0, then six more),
 * so anything else in the string is packaging — the spaces in "HDFC 0001234",
 * or the whitespace that comes with a copy out of a bank SMS or statement.
 * Dropping it turns a paste that used to fail validation into one that works.
 *
 * The slice is also the length cap, and the reason the input must NOT set
 * maxLength: React Native applies maxLength natively BEFORE onChangeText fires,
 * so " HDFC0001234" arrived here already cut to " HDFC000123" — eleven
 * characters of the wrong string, with the real last digit gone.
 *
 * Unlike a phone number, a clipped IFSC could never pass silently: IFSC_RE pins
 * the fifth character to "0" and the length to eleven, so leading junk always
 * failed the form loudly. This is a paste that starts working, not a wrong
 * value that stops being saved.
 *
 * `utils/maxlength.test.ts` holds both IFSC boxes to the no-maxLength rule.
 */
export function normaliseIfsc(raw: string): string {
  return (raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 11);
}

/** Field → message. Empty object means the form is good to send. */
export function validatePayout(f: PayoutForm): Record<string, string> {
  const e: Record<string, string> = {};

  if (f.payment_method === 'UPI') {
    if (!f.upi_id.trim())            e.upi_id = 'UPI ID is required for a UPI payout.';
    else if (!UPI_RE.test(f.upi_id.trim())) e.upi_id = 'Enter a valid UPI ID (e.g. name@bank).';
  }

  if (f.payment_method === 'BANK') {
    if (!f.account_holder_name.trim()) e.account_holder_name = 'Account holder name is required.';
    if (!f.account_number.trim())      e.account_number = 'Account number is required.';
    if (!f.ifsc_code.trim())           e.ifsc_code = 'IFSC is required.';
    else if (!IFSC_RE.test(f.ifsc_code.trim()))
      e.ifsc_code = 'Enter a valid 11-character IFSC (e.g. HDFC0001234).';
  }

  // A stray IFSC left behind by a method switch is still checked — the backend
  // stores it either way, and a malformed one would fail the payout later.
  if (f.ifsc_code.trim() && f.payment_method !== 'BANK' && !IFSC_RE.test(f.ifsc_code.trim()))
    e.ifsc_code = 'Enter a valid 11-character IFSC (e.g. HDFC0001234).';

  return e;
}

/** Trim + normalise for the PUT body (IFSC is stored upper-case). */
export function payoutPayload(f: PayoutForm) {
  return {
    payment_method:      f.payment_method,
    upi_id:              f.upi_id.trim(),
    account_holder_name: f.account_holder_name.trim(),
    bank_name:           f.bank_name.trim(),
    account_number:      f.account_number.trim(),
    ifsc_code:           f.ifsc_code.trim().toUpperCase(),
    payout_notes:        f.payout_notes.trim(),
  };
}

/** Fill a form from whatever the payment-details endpoint returned. */
export function payoutFromApi(d: Record<string, any> | null | undefined): PayoutForm {
  return {
    payment_method:      (d?.payment_method || '') as PayoutForm['payment_method'],
    upi_id:              d?.upi_id || '',
    account_holder_name: d?.account_holder_name || '',
    bank_name:           d?.bank_name || '',
    account_number:      d?.account_number || '',
    ifsc_code:           d?.ifsc_code || '',
    payout_notes:        d?.payout_notes || '',
  };
}
