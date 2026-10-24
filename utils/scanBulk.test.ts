import API from '../services/api';
import { BATCH, bulkDeleteSummary, bulkEditSummary, bulkError, postInBatches, priceRows } from './scanBulk';

jest.mock('../services/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = API.post as jest.Mock;
beforeEach(() => post.mockReset());

const t = (name: string, price: number) => ({ name, price });

describe('priceRows', () => {
  const two = [t('A', 100), t('B', 450)];

  test('set: every test gets the one price; blank is not typed yet', () => {
    expect(priceRows(two, { mode: 'set', value: '' })).toEqual({ rows: [], ready: false, problem: '' });
    const set = priceRows(two, { mode: 'set', value: '500' });
    expect(set.ready).toBe(true);
    expect(set.rows.map(r => r.to)).toEqual([500, 500]);
    expect(priceRows(two, { mode: 'set', value: '0' }).ready).toBe(true);   // free is allowed
    expect(priceRows(two, { mode: 'set', value: '1.5' })).toMatchObject({ ready: false, problem: expect.stringMatching(/whole number/) });
  });

  test('raise / lower by percent or rupees works out each test on its own', () => {
    expect(priceRows(two, { mode: 'change', dir: 'up', by: 'percent', amount: '10' }).rows.map(r => r.to)).toEqual([110, 495]);
    expect(priceRows(two, { mode: 'change', dir: 'down', by: 'percent', amount: '10' }).rows.map(r => r.to)).toEqual([90, 405]);
    expect(priceRows(two, { mode: 'change', dir: 'up', by: 'amount', amount: '25' }).rows.map(r => r.to)).toEqual([125, 475]);
    // Rounded to a whole rupee: 333 * 1.1 = 366.3
    expect(priceRows([t('C', 333)], { mode: 'change', dir: 'up', by: 'percent', amount: '10' }).rows[0].to).toBe(366);
  });

  test('a price that arrives as a string ("350.00") is still a number', () => {
    expect(priceRows([{ name: 'S', price: '350.00' }], { mode: 'change', dir: 'up', by: 'amount', amount: '50' }).rows[0].to).toBe(400);
  });

  test('a change that would take any test below zero is refused, naming it', () => {
    const res = priceRows([t('A', 100), t('Cheap', 50)], { mode: 'change', dir: 'down', by: 'amount', amount: '80' });
    expect(res.ready).toBe(false);
    expect(res.problem).toBe('That would take "Cheap" below ₹0. Lower it by less.');
  });

  test('zero or junk amounts are refused', () => {
    expect(priceRows(two, { mode: 'change', dir: 'up', by: 'percent', amount: '0' }).problem).toBe('Enter an amount above 0.');
    expect(priceRows(two, { mode: 'change', dir: 'up', by: 'percent', amount: 'abc' }).ready).toBe(false);
  });
});

describe('postInBatches', () => {
  test('sends 300 at a time and adds up what the server says', async () => {
    post.mockImplementation((_u: string, body: any) => Promise.resolve({ data: { deleted: body.ids.length - 1, hidden: 1 } }));
    const ids = Array.from({ length: 650 }, (_, i) => i + 1);
    const total = await postInBatches('/scans/bulk-delete/', 'ids', ids);
    expect(post.mock.calls.map(c => c[1].ids.length)).toEqual([300, 300, 50]);
    expect(BATCH).toBe(300);
    expect(total).toEqual({ deleted: 647, hidden: 3 });
  });

  test('a failing later batch says how many were already saved', async () => {
    post.mockResolvedValueOnce({ data: { updated: 300 } }).mockRejectedValueOnce(new Error('boom'));
    await expect(postInBatches('/x/', 'rows', new Array(400).fill({}))).rejects.toMatchObject({ doneCount: 300 });
  });

  test('a failing first batch has nothing saved (doneCount 0)', async () => {
    post.mockRejectedValueOnce(new Error('boom'));
    await expect(postInBatches('/x/', 'rows', [{}])).rejects.toMatchObject({ doneCount: 0 });
  });

  test('nothing to send posts nothing', async () => {
    expect(await postInBatches('/x/', 'rows', [])).toEqual({});
    expect(post).not.toHaveBeenCalled();
  });
});

describe('wording', () => {
  test('edit summary pluralises', () => {
    expect(bulkEditSummary({ updated: 1 }, 'test')).toBe('Updated 1 test.');
    expect(bulkEditSummary({ updated: 3 }, 'scan')).toBe('Updated 3 scans.');
  });

  test('delete summary says what was hidden instead, and that patients can still see it', () => {
    expect(bulkDeleteSummary({ deleted: 2, hidden: 0 }, 'test')).toBe('Deleted 2 tests.');
    expect(bulkDeleteSummary({ deleted: 0, hidden: 1 }, 'test')).toBe(
      '1 test has booking history, so it was set to Hidden instead of deleted. Patients can still see it but cannot book.');
    expect(bulkDeleteSummary({ deleted: 1, hidden: 2 }, 'scan')).toBe(
      'Deleted 1 scan. 2 scans have booking history, so they were set to Hidden instead of deleted. Patients can still see them but cannot book.');
  });

  test('a server refusal reads as one sentence with each test\'s reason', () => {
    const err = { response: { data: { message: 'Some tests could not be updated, so none were.',
      errors: [{ name: 'CBC', errors: { price: ['Too high.'] } }] } } };
    expect(bulkError(err, 'fallback')).toBe('Some tests could not be updated, so none were. CBC: Too high.');
    expect(bulkError({}, 'Could not save the changes.')).toBe('Could not save the changes.');
  });
});
