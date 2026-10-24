/**
 * The search rule for a centre's tests — the app copy of the website's
 * src/services/matchTest.js. Keep the two identical: a patient typing "brain"
 * must get the same tests on the site and in the app.
 *
 * Every typed word must appear somewhere in the test's name, type or synonyms
 * (`keywords`), case-insensitive, so "brain scan" finds "MRI Brain" when its
 * synonyms say so.
 */
export const matchesTest = (
  sc: { name?: string; modality?: string; keywords?: string },
  query: string,
): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [sc.name, sc.modality, sc.keywords].filter(Boolean).join(' ').toLowerCase();
  return words.every(w => text.includes(w));
};

/** A short menu needs no search box. Past this many tests the box appears. */
export const SEARCH_ABOVE = 5;
