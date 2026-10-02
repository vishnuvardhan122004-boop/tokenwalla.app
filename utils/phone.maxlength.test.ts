/**
 * Every phone and OTP TextInput in the app, held to one rule: no maxLength.
 *
 * React Native enforces maxLength natively, BEFORE onChangeText fires (iOS
 * RCTBaseTextInputView truncates the paste then calls textInputDidChange;
 * Android uses an InputFilter.LengthFilter ahead of the TextWatcher). So a
 * pasted "+91 98765 43210" reaches the handler already clipped to "+91 98765 "
 * — seven digits, country code gone — and no amount of filtering in JS can get
 * it back. The handler's own slice is the length cap instead.
 *
 * This is a source scan rather than a component test on purpose. This repo's
 * jest covers pure logic only (no react-native renderer), and even with one, a
 * JS-level fireEvent calls onChangeText directly and never exercises the native
 * truncation — so it would pass whether maxLength is there or not. That exact
 * blind spot is how the website shipped this bug under a green test. A scan
 * cannot be fooled by it.
 */
import fs from 'fs';
import path from 'path';

const APP = path.join(__dirname, '..', 'app');

/** Inputs where maxLength is the legitimate cap: free text with no filter. */
const ALLOWED = [
  /value=\{form\.announcement\}/,          // 300 chars of notice text
  /value=\{form\.open_time\}/,             // "09:00"
  /value=\{form\.close_time\}/,            // "18:00"
  /value=\{otherName\}/,                   // the other patient's name
  /ifsc_code/,                             // 11-char bank code, its own format
];

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

/** Each <TextInput …> opening tag in a file, with its 1-based line number. */
function textInputs(src: string): { block: string; line: number }[] {
  const out: { block: string; line: number }[] = [];
  const re = /<TextInput\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push({ block: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

const inputs = walk(APP).flatMap((file) =>
  textInputs(fs.readFileSync(file, 'utf8')).map((t) => ({
    ...t,
    where: `${path.relative(path.join(__dirname, '..'), file)}:${t.line}`,
  })),
);

// The login screens have ONE box that takes a password or an OTP, bound to
// `password` and secureTextEntry. It is deliberately uncapped — a password has no
// 6-digit limit — so it is not a phone/OTP input for this rule's purposes.
const isPassword = (b: string) => /value=\{password\}|secureTextEntry/.test(b);
const isPhoneish = (b: string) =>
  !isPassword(b) && /mobile|otp|whatsapp|landline/i.test(b);

describe('maxLength on phone and OTP inputs', () => {
  it('finds the inputs at all (guards against the scan silently matching nothing)', () => {
    expect(inputs.length).toBeGreaterThan(20);
    expect(inputs.filter((i) => isPhoneish(i.block)).length).toBeGreaterThanOrEqual(18);
  });

  it('no phone or OTP input carries maxLength', () => {
    const offenders = inputs
      .filter((i) => isPhoneish(i.block) && /maxLength=/.test(i.block))
      .filter((i) => !ALLOWED.some((re) => re.test(i.block)))
      .map((i) => i.where);
    expect(offenders).toEqual([]);
  });

  it('every phone or OTP input caps its own length instead', () => {
    // Dropping maxLength without a cap in the handler leaves the box unbounded —
    // which is what tenDigitMobile() or an explicit .slice() is there for.
    const uncapped = inputs
      .filter((i) => isPhoneish(i.block))
      .filter((i) => !/tenDigitMobile|\.slice\(/.test(i.block))
      .map((i) => i.where);
    expect(uncapped).toEqual([]);
  });

  it('no OTP input country-code strips — a 6-digit code is not a phone number', () => {
    const wrong = inputs
      .filter((i) => /\botp\b/i.test(i.block) && /tenDigitMobile/.test(i.block))
      .map((i) => i.where);
    expect(wrong).toEqual([]);
  });
});
