import { tenDigitMobile } from './phone';

describe('tenDigitMobile', () => {
  it('keeps a plain 10-digit number unchanged', () => {
    expect(tenDigitMobile('9876543210')).toBe('9876543210');
  });

  it('strips separators from a pasted number', () => {
    expect(tenDigitMobile('98765-43210')).toBe('9876543210');
    expect(tenDigitMobile('(98765) 43210')).toBe('9876543210');
    expect(tenDigitMobile('98765 43210')).toBe('9876543210');
  });

  it('drops a +91 country code — the way WhatsApp shows a contact', () => {
    expect(tenDigitMobile('+91 98765 43210')).toBe('9876543210');
    expect(tenDigitMobile('919876543210')).toBe('9876543210');
  });

  it('leaves a real mobile that begins 91 alone', () => {
    // 9198765432 is ten digits already — stripping "91" here would corrupt a
    // valid number, so the rule only fires at exactly twelve.
    expect(tenDigitMobile('9198765432')).toBe('9198765432');
  });

  it('truncates anything longer than 10 digits', () => {
    expect(tenDigitMobile('98765432109999')).toBe('9876543210');
  });

  it('handles empty and junk input without throwing', () => {
    expect(tenDigitMobile('')).toBe('');
    expect(tenDigitMobile('abc')).toBe('');
    expect(tenDigitMobile(undefined as unknown as string)).toBe('');
  });
});
