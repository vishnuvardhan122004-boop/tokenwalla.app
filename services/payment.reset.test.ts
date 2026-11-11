/**
 * The payment screen is a persistent tab: a new provider/date/slot must not inherit the
 * last booking's priority seat, pass purchase or "book for someone else" details.
 * A source scan, like utils/maxlength.test.ts: the screen's WebView/Razorpay setup is
 * not worth a renderer for one effect.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../app/(patient)/payment.tsx'), 'utf8');

test('changing provider, date or slot resets the per-booking choices', () => {
  const m = /useEffect\(\(\) => \{([^}]*)\}, \[providerId, date, slot\]\)/.exec(src);
  expect(m).not.toBeNull();
  for (const setter of ['setPriority(false)', 'setBuyPass(false)', 'setForOther(false)', "setOtherName('')", "setOtherMobile('')"]) {
    expect(m![1]).toContain(setter);
  }
});
