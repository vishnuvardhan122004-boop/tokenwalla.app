// Common doctor-specialization suggestions for the hospital's doctor form.
// The field stays free-text — these are quick picks that keep spelling
// consistent ("Dermatologist", not "dermotologist"), which also keeps the
// patient-side specialization search working. Mirrors the website's
// src/services/specializations.js.
export const SPECIALIZATION_OPTIONS = [
  'General Physician',
  'General Medicine',
  'General Surgeon',
  'Cardiologist',
  'Neurologist',
  'Neurosurgeon',
  'Dermatologist',
  'Gynecologist',
  'Obstetrician & Gynecologist',
  'Pediatrician',
  'Orthopedic Surgeon',
  'ENT Specialist',
  'Ophthalmologist',
  'Dentist',
  'Psychiatrist',
  'Urologist',
  'Nephrologist',
  'Gastroenterologist',
  'Pulmonologist',
  'Endocrinologist',
  'Diabetologist',
  'Oncologist',
  'Rheumatologist',
  'Radiologist',
  'Anesthesiologist',
  'Physiotherapist',
];

/**
 * Suggestions for what's typed so far: matches anywhere in the name, and the
 * whole list when the field is empty. An exact match returns nothing — there's
 * nothing left to pick.
 */
export function suggestSpecializations(query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (q && SPECIALIZATION_OPTIONS.some(s => s.toLowerCase() === q)) return [];
  return SPECIALIZATION_OPTIONS
    .filter(s => !q || s.toLowerCase().includes(q))
    .slice(0, limit);
}
