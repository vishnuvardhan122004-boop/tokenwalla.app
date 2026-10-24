import { matchesTest } from './matchTest';

// Mirrors the website's src/services/matchTest.test.js: the two must agree.
const mri = { name: 'MRI Brain', modality: 'MRI', keywords: 'brain scan, head' };

test('every word must match, in any order, in name, type or synonyms', () => {
  expect(matchesTest(mri, 'brain')).toBe(true);
  expect(matchesTest(mri, 'MRI head')).toBe(true);
  expect(matchesTest(mri, 'head mri')).toBe(true);
  expect(matchesTest(mri, 'brain knee')).toBe(false);
});

test('synonyms alone can carry a match', () => {
  expect(matchesTest({ name: 'MRI Brain', modality: 'MRI', keywords: 'headache' }, 'headache')).toBe(true);
  expect(matchesTest({ name: 'MRI Brain', modality: 'MRI', keywords: '' }, 'headache')).toBe(false);
});

test('a blank query matches everything, and missing fields do not throw', () => {
  expect(matchesTest(mri, '')).toBe(true);
  expect(matchesTest(mri, '   ')).toBe(true);
  expect(matchesTest({ name: 'CBC' }, 'cbc')).toBe(true);
  expect(matchesTest({ name: 'CBC' }, 'undefined')).toBe(false);
});
