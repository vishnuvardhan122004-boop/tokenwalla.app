/**
 * Two pieces of hospital-screen state that must not survive into the next use.
 *
 * ROADMAP 28, claims 9 and 10. Both are the same defect: something scoped to
 * one booking or one edit outlived it.
 *
 *   - ScanEditorModal is mounted unconditionally (dashboard.tsx), so one
 *     instance serves every edit. Its open-reset cleared `form` and `error`
 *     but not `picked`, so a photo chosen for one scan was uploaded onto the
 *     next scan saved — and since `picked` also decides multipart-vs-JSON, a
 *     save that touched no image still shipped the previous file.
 *   - The dashboard's "already seen" id set was built from waiting +
 *     inProgress + completed, omitting onHold. Holding a patient dropped them
 *     out of the set, so resuming them announced "New Appointment Booked" for
 *     someone who had been at the desk all along.
 *
 * Source scans, following utils/maxlength.test.ts: this repo's jest covers
 * pure logic and has no react-native renderer, so neither a modal's effect nor
 * a 10-second poll can be driven here. A scan still fails if the line is
 * removed, which is the regression worth catching.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');

/** Source with comments removed — a scan asserting something is ABSENT has to
 *  look at code, or a comment explaining the fix fails the test for it. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const MODAL     = read('../../components/ScanEditorModal.tsx');
const DASHBOARD = read('dashboard.tsx');
const ANALYTICS = read('analytics.tsx');

/** The body of the `if (!visible) return;` reset effect. */
function openResetEffect(src: string): string {
  const start = src.indexOf('if (!visible) return;');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('}, [visible', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('ScanEditorModal clears the picked photo on open (claim 9)', () => {
  it('resets picked in the same effect that resets the form', () => {
    expect(openResetEffect(MODAL)).toMatch(/setPicked\(null\)/);
  });

  it('still resets the form and the error, so the fix added rather than replaced', () => {
    const body = openResetEffect(MODAL);
    expect(body).toMatch(/setForm\(/);
    expect(body).toMatch(/setError\(''\)/);
  });

  it('only attaches an image when one was picked for THIS edit', () => {
    // The guard that makes the stale `picked` dangerous. If this stops being
    // conditional, every save becomes multipart and the arrays break too.
    expect(MODAL).toMatch(/if \(picked\) \{/);
    expect(MODAL).toMatch(/fd\.append\('image', picked/);
  });
});

describe('the dashboard counts held patients as already seen (claim 10)', () => {
  it('builds the seen-id baseline from all four queue buckets', () => {
    const m = DASHBOARD.match(/const allIds = \[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const buckets = m![1];
    for (const bucket of ['waiting', 'onHold', 'inProgress', 'completed']) {
      expect(buckets).toContain(`...${bucket}`);
    }
  });

  it('reads onHold off the queue response in the first place', () => {
    expect(DASHBOARD).toMatch(/const onHold\s+= Array\.isArray\(data\.onHold\)/);
  });
});

describe('analytics counts today, not the whole queue window (claim 8)', () => {
  it('narrows every row it counts through rowsForDay', () => {
    // The assignment itself, not just the import: `rowsForDay` appearing
    // somewhere in the file is not evidence that allToday is filtered.
    expect(codeOnly(ANALYTICS))
      .toMatch(/const allToday = rowsForDay\(\s*\[[\s\S]*?\],\s*todayISO,?\s*\)/);
    // And all four buckets reach it, so a held patient is still counted.
    const m = codeOnly(ANALYTICS).match(/const allToday = rowsForDay\(\s*\[([\s\S]*?)\]/);
    expect(m).not.toBeNull();
    for (const bucket of ['waiting', 'onHold', 'inProgress', 'completed']) {
      expect(m![1]).toContain(`...queue.${bucket}`);
    }
    // The local-date helper, never toISOString — which would shift the day for
    // every user after 18:30 IST and silently report yesterday.
    expect(ANALYTICS).toMatch(/toLocalISODate\(new Date\(\)\)/);
    expect(codeOnly(ANALYTICS)).not.toMatch(/toISOString/);
  });

  it('counts each per-status tile for today too, so the tiles reconcile', () => {
    // A tile reading `queue.completed.length` unfiltered could exceed the
    // "Today Total" it is meant to break down.
    for (const bucket of ['waiting', 'onHold', 'inProgress', 'completed']) {
      expect(ANALYTICS).toContain(`todayIn(queue.${bucket})`);
      expect(ANALYTICS).not.toContain(`val: queue.${bucket}.length`);
    }
  });

  it('keeps both halves of the completion rate on the same day', () => {
    expect(ANALYTICS).toMatch(/todayIn\(queue\.completed\) \/ total/);
  });
});
