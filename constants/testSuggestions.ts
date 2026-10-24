/**
 * Quick picks for the Name and Type boxes on a blood / scanning centre's test
 * form — the app copy of the website's src/services/testSuggestions.js. The
 * fields stay free text: these only save typing and keep spelling consistent.
 * The abbreviation sits inside the name ("Complete Blood Count (CBC)") because a
 * pick matches on what is typed anywhere in it, so "cbc" finds it.
 *
 * Types feed the patient-side modality filter (matched case-insensitively), and
 * the seeded centres already use "MRI", "CT" and "Blood Test" — keep to those.
 */
export const BLOOD_NAMES = [
  'Complete Blood Count (CBC)',
  'Hemoglobin (Hb)',
  'ESR',
  'CRP (C-Reactive Protein)',
  'Blood Sugar Fasting',
  'Blood Sugar Post Meal (PP)',
  'Random Blood Sugar (RBS)',
  'HbA1c',
  'Lipid Profile',
  'Thyroid Profile (T3, T4, TSH)',
  'TSH',
  'Liver Function Test (LFT)',
  'Kidney Function Test (KFT)',
  'Serum Creatinine',
  'Blood Urea',
  'Uric Acid',
  'Vitamin D',
  'Vitamin B12',
  'Calcium',
  'Iron Studies',
  'Widal Test (Typhoid)',
  'Dengue NS1 / IgM',
  'Malaria Parasite (MP)',
  'Blood Group & Rh Factor',
  'Urine Routine',
  'Full Body Checkup',
];

export const SCAN_NAMES = [
  'MRI Brain',
  'MRI Spine (Lumbar)',
  'MRI Spine (Cervical)',
  'MRI Knee',
  'CT Brain',
  'CT Chest',
  'CT Abdomen',
  'X-Ray Chest',
  'X-Ray Spine',
  'X-Ray Knee',
  'Ultrasound Abdomen',
  'Ultrasound Pelvis',
  'Ultrasound Pregnancy (Obstetric)',
  'Doppler',
  'ECG',
  '2D Echo',
  'TMT (Stress Test)',
  'Mammography',
  'Bone Density (DEXA)',
];

export const BLOOD_TYPES = ['Blood Test', 'Urine Test', 'Health Checkup'];
export const SCAN_TYPES  = ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'ECG', 'Echo', 'Mammography', 'DEXA'];

/** What a centre's quick picks are, by what the account sells. A hybrid gets both. */
export const suggestionsFor = (sellsBlood: boolean, sellsScans: boolean) => ({
  names: [...(sellsBlood ? BLOOD_NAMES : []), ...(sellsScans ? SCAN_NAMES : [])],
  types: [...(sellsBlood ? BLOOD_TYPES : []), ...(sellsScans ? SCAN_TYPES : [])],
});

/** Up to `limit` picks containing what is typed; none once it is an exact pick. */
export function suggestTests(options: string[], query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (q && options.some(o => o.toLowerCase() === q)) return [];
  return options.filter(o => !q || o.toLowerCase().includes(q)).slice(0, limit);
}
