/**
 * The reward card after Done / a QR scan (2026-11-23). It replaced a one-line
 * green bar that ran off a phone screen. No React renderer in this suite, so
 * the words are tested as plain logic and the wiring by reading the source.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { rewardLines } from '../components/RewardCard';

describe('rewardLines', () => {
  it('puts the amount big, the name, and today under it', () => {
    expect(rewardLines({ name: 'Lata', count: 5, amount: 35, per_booking: 7 }))
      .toEqual({ amount: '+₹7', name: 'Lata', line: '5 patients today · ₹35' });
  });

  it('says 1 patient, not 1 patients', () => {
    expect(rewardLines({ name: 'Ravi', count: 1, amount: 7, per_booking: 7 }).line).toBe('1 patient today · ₹7');
  });

  it('works out the per-booking amount from an older server', () => {
    expect(rewardLines({ name: 'Lata', count: 2, amount: 14 }).amount).toBe('+₹7');
  });

  it('promises no ₹ while the incentive is off (₹0)', () => {
    expect(rewardLines({ name: 'Lata', count: 3, amount: 0 }))
      .toEqual({ amount: null, name: 'Lata', line: '3 patients today' });
  });
});

describe('both reward moments use the card', () => {
  const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

  it.each(['app/(hospital)/(tabs)/dashboard.tsx', 'app/(hospital)/(tabs)/scanner.tsx'])('%s', (f) => {
    expect(src(f)).toContain('<RewardCard today=');
  });

  it('the scanner pill no longer carries the reward text on one line', () => {
    expect(src('app/(hospital)/(tabs)/scanner.tsx')).toContain('handledBy && !handledToday');
  });
});
