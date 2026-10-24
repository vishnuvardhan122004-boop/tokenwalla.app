import { flattenErrors, HEADER, importSummary, templateCsv, toNum } from './scanImport';

test('the template has the heading row the server expects, then two examples in the centre\'s own kind', () => {
  const blood = templateCsv('test');
  expect(blood.startsWith('﻿')).toBe(true);                    // Excel reads it as UTF-8
  expect(blood.split('\r\n').slice(0, 1)).toEqual([`﻿${HEADER.join(',')}`]);
  expect(blood).toContain('Lipid Profile');
  expect(blood).not.toContain('MRI');
  const scan = templateCsv('scan');
  expect(scan).toContain('MRI Brain');
  expect(scan).not.toContain('Lipid');
  expect(blood.endsWith('\r\n')).toBe(true);
  // Every line is five cells: no example contains a comma that would shift a column.
  blood.replace('﻿', '').trim().split('\r\n').forEach(l => expect(l.split(',')).toHaveLength(5));
  scan.replace('﻿', '').trim().split('\r\n').forEach(l => expect(l.split(',')).toHaveLength(5));
});

test('the summary says what was added, skipped, and that slots are still to do', () => {
  expect(importSummary({ created: 3, skipped: 0 }, 'test'))
    .toBe('Added 3 tests. They have no time slots yet - open each to add slots so patients can book online.');
  expect(importSummary({ created: 1, skipped: 2 }, 'scan'))
    .toBe('Added 1 scan. 2 already listed were skipped. They have no time slots yet - open each to add slots so patients can book online.');
  expect(importSummary({ created: 0, skipped: 1 }, 'test')).toBe('Added 0 tests. 1 already listed was skipped.');
});

test('a blank price is null, never 0; junk goes up as typed so the server refuses it', () => {
  expect(toNum('')).toBeNull();
  expect(toNum('  ')).toBeNull();
  expect(toNum('350')).toBe(350);
  expect(toNum('0')).toBe(0);
  expect(toNum('3x')).toBe('3x');
});

test('server field errors read with the form\'s own labels', () => {
  expect(flattenErrors({ price: ['Price is missing.'], duration_minutes: ['Bad.', 'Worse.'], center: ['Nope.'] }))
    .toEqual(['Price: Price is missing.', 'Minutes: Bad. Worse.', 'Nope.']);
  expect(flattenErrors(undefined)).toEqual([]);
});
