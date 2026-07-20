import { htmlEscape, jsStr } from './webviewSafe';

// The line/paragraph separators that are legal in JSON strings but break raw JS.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('htmlEscape', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(htmlEscape(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes & first so existing text is not double-escaped', () => {
    // If < were escaped before &, "&lt;" would become "&amp;lt;".
    expect(htmlEscape('<')).toBe('&lt;');
    expect(htmlEscape('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('neutralises a </script> injection attempt', () => {
    const out = htmlEscape('</script><script>alert(1)</script>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('&lt;/script&gt;');
  });

  it('leaves ordinary text untouched', () => {
    expect(htmlEscape('Dr. Hari Krishna')).toBe('Dr. Hari Krishna');
  });

  it('coerces null/undefined to an empty string', () => {
    expect(htmlEscape(null)).toBe('');
    expect(htmlEscape(undefined)).toBe('');
  });
});

describe('jsStr', () => {
  it('returns a value wrapped in its own quotes (a JS string literal)', () => {
    expect(jsStr('hello')).toBe('"hello"');
  });

  it('round-trips: JSON.parse of the output equals the original string', () => {
    for (const input of [
      "O'Brien",
      'quote " inside',
      'back\\slash',
      'new\nline\ttab',
      '</script>',
      `${LS}${PS}`,
      'emoji 🩺 and unicode ₹',
      '',
    ]) {
      expect(JSON.parse(jsStr(input))).toBe(input);
    }
  });

  it('coerces null/undefined to an empty JS string literal', () => {
    expect(jsStr(null)).toBe('""');
    expect(jsStr(undefined)).toBe('""');
    expect(JSON.parse(jsStr(null))).toBe('');
  });

  it('neutralises a </script> breakout — no raw angle brackets remain', () => {
    const out = jsStr('x</script><script>evil()</script>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');
  });

  it('contains a quote/paren injection safely inside the literal', () => {
    // A doctor name crafted to break out of  order_id: '...'  and inject JS.
    const evil = "x'); fetch('http://evil'); //";
    const out = jsStr(evil);
    // The whole payload survives as data (round-trips) rather than executing.
    expect(JSON.parse(out)).toBe(evil);
  });

  it('escapes the U+2028 / U+2029 line separators that would break inline JS', () => {
    const out = jsStr(`a${LS}b${PS}c`);
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it("an apostrophe name like Dr. O'Brien no longer breaks the literal", () => {
    // The original bug: single-quote broke the ' ... ' JS string in the WebView.
    // jsStr uses double-quoted JSON, so the apostrophe is just data.
    expect(JSON.parse(jsStr("Dr. O'Brien"))).toBe("Dr. O'Brien");
  });
});
