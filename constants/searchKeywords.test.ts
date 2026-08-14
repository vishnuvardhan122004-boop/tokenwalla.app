import {
  appendKeyword,
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
