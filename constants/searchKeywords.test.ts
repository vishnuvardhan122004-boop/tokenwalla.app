import {
  appendKeyword,
  keywordsForSpecialization,
  suggestKeywords,
  suggestKeywordsForList,
} from './searchKeywords';

describe('suggestKeywords', () => {
  it('returns top searches for an empty query', () => {
    const out = suggestKeywords('', [], 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe('fever');
  });

  it('ranks prefix matches ahead of substring matches', () => {
    // "ear pain" starts with the query; "hair fall" only contains it.
    const out = suggestKeywords('ea', ['Earache clinic']);
    const firstContains = out.findIndex(t => !t.toLowerCase().startsWith('ea'));
    const lastStarts    = out.map(t => t.toLowerCase().startsWith('ea')).lastIndexOf(true);
    expect(firstContains).toBeGreaterThan(-1);
    expect(lastStarts).toBeLessThan(firstContains);
  });

  it('puts live-data terms before the generic list', () => {
    const out = suggestKeywords('card', ['Cardiologist']);
    expect(out[0]).toBe('Cardiologist');
  });

  it('dedupes case-insensitively', () => {
    const out = suggestKeywords('fev', ['Fever']);
    expect(out.filter(t => t.toLowerCase() === 'fever')).toHaveLength(1);
  });

  it('returns nothing for an exact match', () => {
    expect(suggestKeywords('fever')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(suggestKeywords('a', [], 3).length).toBeLessThanOrEqual(3);
  });
});

describe('suggestKeywordsForList', () => {
  it('completes only the segment after the last comma', () => {
    const out = suggestKeywordsForList('heart, ches');
    expect(out).toContain('chest pain');
  });

  it('skips terms already in the field', () => {
    const out = suggestKeywordsForList('chest pain, ches');
    expect(out).not.toContain('chest pain');
  });
});

describe('appendKeyword', () => {
  it('appends to an empty field', () => {
    expect(appendKeyword('', 'fever')).toBe('fever, ');
  });

  it('replaces the segment being typed', () => {
    expect(appendKeyword('heart, ches', 'chest pain')).toBe('heart, chest pain, ');
  });

  it('keeps earlier terms intact', () => {
    expect(appendKeyword('bp, ecg, ', 'heart')).toBe('bp, ecg, heart, ');
  });
});

// The doctor form leads with terms that fit the specialization (same tests as the website's copy).
describe('keywordsForSpecialization', () => {
  it('offers an orthopedic surgeon joint and bone terms first, not fever', () => {
    const out = suggestKeywordsForList('', 5, 'Orthopedic Surgeon');
    expect(out).toEqual(['joint pain', 'back pain', 'knee pain', 'fracture', 'bones']);
  });

  it('does not read "ENT" into Dentist or Gastroenterologist', () => {
    expect(keywordsForSpecialization('Dentist')).not.toContain('ear pain');
    expect(keywordsForSpecialization('Gastroenterologist')).not.toContain('ear pain');
    expect(keywordsForSpecialization('ENT Specialist')).toContain('ear pain');
  });

  it('falls back to the top searches for an unknown or blank specialization', () => {
    expect(suggestKeywordsForList('', 3, 'Ayurveda')).toEqual(['fever', 'cold', 'cough']);
    expect(suggestKeywordsForList('', 3)).toEqual(['fever', 'cold', 'cough']);
  });

  it('still completes what is typed', () => {
    expect(suggestKeywordsForList('kn', 5, 'Orthopedic Surgeon')[0]).toBe('knee pain');
  });
});

// A saved list with no trailing comma still gets chips on edit.
describe('a finished last word', () => {
  it('a saved list still gets suggestions, minus what it already has', () => {
    const out = suggestKeywordsForList('bones, knee pain', 5, 'Orthopedic Surgeon');
    expect(out).toEqual(['joint pain', 'back pain', 'fracture', 'fever', 'cold']);
  });

  it('a saved list gets chips even with no specialization', () => {
    expect(suggestKeywordsForList('bones, knee pain', 3)).toEqual(['fever', 'cold', 'cough']);
  });

  it('a tap adds after it instead of replacing it', () => {
    expect(appendKeyword('bones', 'fracture')).toBe('bones, fracture, ');
    expect(appendKeyword('bone clinic', 'fracture')).toBe('bone clinic, fracture, ');
  });

  it('a half-typed word is still completed', () => {
    expect(appendKeyword('bones, fra', 'fracture')).toBe('bones, fracture, ');
  });
});
