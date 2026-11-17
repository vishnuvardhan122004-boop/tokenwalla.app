/**
 * constants/searchKeywords.ts — Google-style typeahead terms for doctor search.
 *
 * Two consumers:
 *   • Patient "Find Doctors" search box — suggests what to type, mixed with
 *     terms pulled from the real doctor list so a pick always has results.
 *   • Hospital "Search Keywords" field on the doctor form — suggests terms to
 *     tag a doctor with, so patient searches actually reach them.
 *
 * Keep roughly in sync with the website's keyword list.
 */

// Ordered loosely by how often patients search them — the head of this list is
// what shows as "top searches" when the box is focused but empty.
export const SEARCH_KEYWORD_OPTIONS: string[] = [
  'fever', 'cold', 'cough', 'general checkup', 'body pain', 'headache',
  'chest pain', 'heart', 'bp', 'blood pressure', 'ecg',
  'sugar', 'diabetes', 'thyroid',
  'skin', 'rash', 'acne', 'hair fall', 'allergy',
  'tooth pain', 'dental', 'teeth cleaning', 'braces',
  'child', 'vaccination', 'newborn',
  'joint pain', 'back pain', 'knee pain', 'fracture', 'bones',
  'eye', 'vision', 'spectacles', 'cataract',
  'ear pain', 'nose', 'throat', 'sinus', 'tonsils',
  'pregnancy', 'period problem', 'women health', 'infertility',
  'migraine', 'seizure', 'nerve pain', 'paralysis',
  'stress', 'anxiety', 'depression', 'sleep problem',
  'kidney stone', 'urine problem', 'dialysis',
  'stomach pain', 'acidity', 'gas', 'piles', 'liver',
  'asthma', 'breathing problem', 'tb',
  'physiotherapy', 'rehab', 'weakness', 'weight loss',
];

/** Fold to a comparable form so "BP " and "bp" dedupe. */
const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Suggestions for what's typed so far.
 *
 * Ranking is Google-ish: terms that *start with* the query come before terms
 * that merely contain it, and each group keeps the source order (popularity for
 * the built-in list, then whatever `extra` provides). An exact match returns
 * nothing — there's nothing left to complete. An empty query returns the top
 * searches.
 *
 * @param query  what the user has typed
 * @param extra  extra candidates, e.g. terms harvested from live doctor data
 * @param limit  max rows to show
 */
export function suggestKeywords(query: string, extra: string[] = [], limit = 6): string[] {
  const q = norm(query);

  // Dedupe across both sources, keeping the first spelling seen.
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const raw of [...extra, ...SEARCH_KEYWORD_OPTIONS]) {
    const term = raw.trim();
    if (!term || seen.has(norm(term))) continue;
    seen.add(norm(term));
    pool.push(term);
  }

  if (!q) return pool.filter(t => SEARCH_KEYWORD_OPTIONS.includes(t)).slice(0, limit);
  if (pool.some(t => norm(t) === q)) return [];

  const startsWith = pool.filter(t => norm(t).startsWith(q));
  const contains   = pool.filter(t => !norm(t).startsWith(q) && norm(t).includes(q));
  return [...startsWith, ...contains].slice(0, limit);
}

// What patients type when they need each kind of doctor, so an orthopedic
// surgeon is offered "joint pain" and "fracture" first, not "fever". Matched
// against the free-text specialization. Same table as the website's copy.
const BY_SPECIALTY: [RegExp, string[]][] = [
  [/cardio|heart/i,                 ['chest pain', 'heart', 'bp', 'blood pressure', 'ecg']],
  [/diabet|endocrin/i,              ['sugar', 'diabetes', 'thyroid', 'weight loss']],
  [/dermat|skin/i,                  ['skin', 'rash', 'acne', 'hair fall', 'allergy']],
  [/dent|oral/i,                    ['tooth pain', 'dental', 'teeth cleaning', 'braces']],
  [/pa?ediat|child|neonat/i,        ['child', 'vaccination', 'newborn', 'fever', 'cough']],
  [/ortho|bone|joint/i,             ['joint pain', 'back pain', 'knee pain', 'fracture', 'bones']],
  [/ophthal|eye|optom/i,            ['eye', 'vision', 'spectacles', 'cataract']],
  [/\bent\b|otolar|throat/i,       ['ear pain', 'nose', 'throat', 'sinus', 'tonsils']],
  [/gyn|obstet|women|maternity/i,   ['pregnancy', 'period problem', 'women health', 'infertility']],
  [/neuro/i,                        ['migraine', 'headache', 'seizure', 'nerve pain', 'paralysis']],
  [/psych|mental/i,                 ['stress', 'anxiety', 'depression', 'sleep problem']],
  [/nephro|urolog|kidney|renal/i,   ['kidney stone', 'urine problem', 'dialysis']],
  [/gastro|stomach|liver|hepat/i,   ['stomach pain', 'acidity', 'gas', 'piles', 'liver']],
  [/pulmon|lung|chest|respir/i,     ['asthma', 'breathing problem', 'cough', 'tb']],
  [/physio|rehab/i,                 ['physiotherapy', 'rehab', 'back pain', 'joint pain']],
  [/general|physician|family|medicine/i, ['fever', 'cold', 'cough', 'general checkup', 'body pain', 'bp', 'sugar']],
];

/** The terms that fit this specialization, most specific group first. */
export function keywordsForSpecialization(specialization = ''): string[] {
  return BY_SPECIALTY.filter(([re]) => re.test(specialization)).flatMap(([, terms]) => terms);
}

// The last segment is "done" when nothing completes it: a saved list like
// "bones, knee pain" (no trailing comma) or a word of the hospital's own. Then
// the chips offer new terms and a tap adds after it instead of replacing it.
const lastIsDone = (value: string): boolean => {
  const current = value.split(',').pop() ?? '';
  return Boolean(current.trim()) && suggestKeywords(current).length === 0;
};

/**
 * Same idea for a comma-separated field: completes only the segment the caret
 * is in, ignoring terms already present in the field. Terms that fit the
 * doctor's specialization lead.
 *
 * `suggestKeywordsForList('heart, ch')` → suggestions for "ch" minus "heart".
 */
export function suggestKeywordsForList(value: string, limit = 6, specialization = ''): string[] {
  const parts   = (lastIsDone(value) ? `${value},` : value).split(',');
  const current = parts[parts.length - 1];
  const already = new Set(parts.slice(0, -1).map(norm).filter(Boolean));
  return suggestKeywords(current, keywordsForSpecialization(specialization), limit + already.size)
    .filter(t => !already.has(norm(t)))
    .slice(0, limit);
}

/** Replace the segment being typed with `term` (or add after a finished one), leaving a trailing ", ". */
export function appendKeyword(value: string, term: string): string {
  const parts = (lastIsDone(value) ? `${value.trimEnd()},` : value).split(',');
  parts[parts.length - 1] = ` ${term}`;
  return `${parts.join(',').replace(/^\s+/, '')}, `;
}
