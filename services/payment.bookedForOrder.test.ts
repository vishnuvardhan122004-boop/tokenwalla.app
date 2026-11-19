/**
 * "Book for someone else" rides on the ORDER (web ROADMAP 76f), so the server's
 * Razorpay webhook books the token for that person even if the app is closed
 * before /verify/. A source scan, like payment.reset.test.ts.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../app/(patient)/payment.tsx'), 'utf8');

test('create-order carries the other person\'s name and number when there is one', () => {
  const m = /API\.post\('\/payment\/create-order\/', \{([\s\S]*?)\n {6}\}\);/.exec(src);
  expect(m).not.toBeNull();
  expect(m![1]).toContain('...(bookedForName ? { bookedForName, bookedForMobile } : {})');
});
