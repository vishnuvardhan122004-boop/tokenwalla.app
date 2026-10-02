/**
 * utils/phone.ts
 *
 * Normalising what someone types or pastes into a phone box.
 *
 * Kept identical to tenDigitMobile() in the website's `src/services/phone.js`
 * so a number normalises the same way whether it is entered on the web or in
 * the app. Change one, change the other — mirrored helpers in these two repos
 * have drifted before.
 */

/**
 * Digits only, 10 max, dropping a leading country code when one is clearly
 * there.
 *
 * The country-code step is the part that matters. A plain digit filter turns a
 * pasted "+91 98765 43210" into "9198765432" — ten digits starting with 9, so
 * the 10-digit mobile check ACCEPTS it and a wrong number goes through clean.
 * On a login or forgot-password screen that is a lookup that can never match;
 * on a field that saves, it is a wrong number stored for good. The 91 is
 * dropped only at exactly 12 digits, so a real mobile that begins 91 is left
 * alone.
 *
 * A TextInput using this must NOT also set maxLength. React Native enforces
 * maxLength natively, BEFORE onChangeText fires — on iOS
 * RCTBaseTextInputView truncates the pasted string, writes it, and only then
 * calls textInputDidChange; on Android an InputFilter.LengthFilter does the
 * same ahead of the TextWatcher. So "+91 98765 43210" arrives here already
 * clipped to "+91 98765 " — seven digits, no country code left to recognise,
 * and nothing this function can do about it. The slice below is the length
 * cap; on a controlled input it is the only one needed.
 *
 * `utils/phone.maxlength.test.ts` holds every phone/OTP input in the app to
 * that rule, because no component test here can: the app's jest has no
 * react-native renderer, and a JS-level fireEvent would bypass the native
 * truncation anyway — exactly the blind spot that let the website ship this
 * bug with a green test.
 */
export function tenDigitMobile(raw: string): string {
  return (raw || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(0, 10);
}
