/**
 * utils/scanImport.ts — the pure half of importing a price list from a CSV. The
 * app copy of the helpers in the website's src/hospital/ScanImport.js.
 *
 * Flow: the file is read on the server (nothing saved), every row is shown, the
 * centre unticks or fixes rows, then adds the ticked ones. Slots and days are
 * not part of an import, and neither is the collection mode, so a new test
 * starts as walk-in / service-fee-only and the centre sets the rest.
 */
import type { Unit } from './scanBulk';

export const HEADER = ['Name', 'Type', 'Price', 'Duration (min)', 'Before you come'];

// Two example rows in the centre's own kind, so a blood lab is never shown (and
// never imports by mistake) an MRI. ASCII only: the file is opened in Excel.
const BLOOD_EXAMPLES = [
  ['Complete Blood Count (CBC)', 'Blood Test', '350', '15', 'No fasting needed'],
  ['Lipid Profile', 'Blood Test', '650', '15', '12 hours fasting. Water is fine.'],
];
const SCAN_EXAMPLES = [
  ['MRI Brain', 'MRI', '4500', '45', 'Remove all metal objects'],
  ['X-Ray Chest', 'X-Ray', '400', '10', 'Remove jewellery and metal'],
];

/** The template file's text: a BOM so Excel reads it as UTF-8, CRLF line ends. */
export const templateCsv = (unit: Unit) =>
  `﻿${[HEADER, ...(unit === 'test' ? BLOOD_EXAMPLES : SCAN_EXAMPLES)].map(r => r.join(',')).join('\r\n')}\r\n`;

export function importSummary({ created, skipped }: { created: number; skipped: number }, unit: Unit): string {
  const noun = (n: number) => (n === 1 ? unit : `${unit}s`);
  let msg = `Added ${created} ${noun(created)}.`;
  if (skipped > 0) msg += ` ${skipped} already listed ${skipped === 1 ? 'was' : 'were'} skipped.`;
  if (created > 0) msg += ' They have no time slots yet - open each to add slots so patients can book online.';
  return msg;
}

/** A blank box is null, never 0: a missing price must not turn into a free test.
 *  Anything that is not a number goes up as typed so the server refuses it. */
export const toNum = (v: string): number | string | null => {
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
};

const FIELD_LABEL: Record<string, string> = {
  name: 'Name', modality: 'Type', price: 'Price',
  duration_minutes: 'Minutes', prep_instructions: 'Before you come',
};

/** A serializer-style `{field: [messages]}` as readable lines. */
export const flattenErrors = (errs: Record<string, unknown> | undefined): string[] =>
  Object.entries(errs || {}).map(([k, v]) => {
    const msg = ([] as unknown[]).concat(v).join(' ');
    return FIELD_LABEL[k] ? `${FIELD_LABEL[k]}: ${msg}` : msg;
  });
