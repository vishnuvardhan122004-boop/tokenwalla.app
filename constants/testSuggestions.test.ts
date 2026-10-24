import { BLOOD_NAMES, BLOOD_TYPES, SCAN_NAMES, SCAN_TYPES, suggestionsFor, suggestTests } from './testSuggestions';

test('a typed abbreviation finds the full name, anywhere in it', () => {
  expect(suggestTests(BLOOD_NAMES, 'cbc')).toEqual(['Complete Blood Count (CBC)']);
  expect(suggestTests(BLOOD_NAMES, 'thyroid')).toEqual(['Thyroid Profile (T3, T4, TSH)']);
  expect(suggestTests(SCAN_NAMES, 'brain')).toEqual(['MRI Brain', 'CT Brain']);
});

test('nothing typed offers the first few; an exact pick offers none', () => {
  expect(suggestTests(BLOOD_NAMES, '')).toHaveLength(6);
  expect(suggestTests(BLOOD_NAMES, 'ESR')).toEqual([]);
  expect(suggestTests(BLOOD_NAMES, '  esr ')).toEqual([]);
  expect(suggestTests(BLOOD_NAMES, 'zzz')).toEqual([]);
});

test('a lab is never offered an MRI, a hybrid gets both, a non-seller gets nothing', () => {
  expect(suggestionsFor(true, false)).toEqual({ names: BLOOD_NAMES, types: BLOOD_TYPES });
  expect(suggestionsFor(false, true)).toEqual({ names: SCAN_NAMES, types: SCAN_TYPES });
  const both = suggestionsFor(true, true);
  expect(both.names).toEqual([...BLOOD_NAMES, ...SCAN_NAMES]);
  expect(both.types).toEqual([...BLOOD_TYPES, ...SCAN_TYPES]);
  expect(suggestionsFor(false, false)).toEqual({ names: [], types: [] });
});

test('the types stay inside what the patient-side filter already knows', () => {
  expect(SCAN_TYPES).toEqual(expect.arrayContaining(['MRI', 'CT']));
  expect(BLOOD_TYPES).toContain('Blood Test');
});
