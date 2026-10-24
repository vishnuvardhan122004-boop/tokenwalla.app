/**
 * utils/scanBulk.ts — the maths and the wording behind Select mode on a centre's
 * tests list. The app copy of the website's src/hospital/ScanBulkEdit.js.
 *
 * The client works out each test's final values (a +10% price differs per test)
 * and sends one row per test. The server re-validates every row like a normal
 * save, in one transaction per request. It takes at most 300 rows a request, so
 * a bigger selection goes up in turns; each turn is all-or-nothing, the whole
 * run is not.
 */
import API from '../services/api';

export type Unit = 'scan' | 'test';

/** The server's per-request cap (scans.importer.MAX_ROWS). */
export const BATCH = 300;

const noun = (n: number, unit: Unit) => (n === 1 ? unit : `${unit}s`);

/**
 * POST `items` to `url` as `{ [key]: chunk }`, 300 at a time, adding up the
 * numbers the server returns. A failing later chunk rethrows with `doneCount`
 * (how many were already saved) so the screen can say how far it got.
 */
export async function postInBatches(
  url: string, key: string, items: unknown[],
): Promise<Record<string, number>> {
  const total: Record<string, number> = {};
  for (let i = 0; i < items.length; i += BATCH) {
    try {
      const { data } = await API.post(url, { [key]: items.slice(i, i + BATCH) });
      Object.entries(data as Record<string, number>).forEach(([k, v]) => { total[k] = (total[k] || 0) + v; });
    } catch (err: any) {
      err.doneCount = i;
      throw err;
    }
  }
  return total;
}

export const bulkEditSummary = ({ updated }: { updated: number }, unit: Unit) =>
  `Updated ${updated} ${noun(updated, unit)}.`;

export function bulkDeleteSummary(
  { deleted, hidden }: { deleted?: number; hidden?: number }, unit: Unit,
): string {
  const parts: string[] = [];
  if (deleted && deleted > 0) parts.push(`Deleted ${deleted} ${noun(deleted, unit)}.`);
  if (hidden && hidden > 0) {
    parts.push(
      `${hidden} ${noun(hidden, unit)} ${hidden === 1 ? 'has' : 'have'} booking history, so ` +
      `${hidden === 1 ? 'it was' : 'they were'} set to Hidden instead of deleted. ` +
      `Patients can still see ${hidden === 1 ? 'it' : 'them'} but cannot book.`,
    );
  }
  return parts.join(' ');
}

/** What the server said went wrong with a bulk save, as one sentence. */
export function bulkError(err: any, fallback: string): string {
  const d = err?.response?.data;
  const lines: string[] = Array.isArray(d?.errors)
    ? d.errors.map((p: any) => `${p.name}: ${Object.values(p.errors || {}).flat().join(' ')}`)
    : [];
  return [d?.message || fallback, ...lines].join(' ');
}

export type PriceEdit =
  | { mode: 'set'; value: string }
  | { mode: 'change'; dir: 'up' | 'down'; by: 'percent' | 'amount'; amount: string };

interface Priced { name: string; price: number | string }

/**
 * Each test's new price for the edit typed so far. `ready` is false until the
 * box holds a usable number, or if the change would take any test below ₹0;
 * `problem` says why. A blank box is "not typed yet", not an error.
 */
export function priceRows<T extends Priced>(scans: T[], e: PriceEdit): {
  rows: { sc: T; to: number }[]; ready: boolean; problem: string;
} {
  const amount = e.mode === 'change' ? Number(e.amount) : 0;
  const sign = e.mode === 'change' && e.dir === 'down' ? -1 : 1;
  const newPrice = (sc: T) => (e.mode === 'set'
    ? Number(e.value)
    : Math.round(e.by === 'percent'
      ? Number(sc.price) * (1 + (sign * amount) / 100)
      : Number(sc.price) + sign * amount));

  let ready = false;
  let problem = '';
  if (e.mode === 'set') {
    if (e.value.trim() !== '') {
      ready = Number.isInteger(Number(e.value)) && Number(e.value) >= 0;
      if (!ready) problem = 'Enter a whole number of rupees, 0 or more.';
    }
  } else if (e.amount.trim() !== '') {
    ready = Number.isFinite(amount) && amount > 0;
    if (!ready) problem = 'Enter an amount above 0.';
  }
  const rows = ready ? scans.map(sc => ({ sc, to: newPrice(sc) })) : [];
  const below = rows.find(r => r.to < 0);
  if (below) {
    return { rows, ready: false, problem: `That would take "${below.sc.name}" below ₹0. Lower it by less.` };
  }
  return { rows, ready, problem };
}
