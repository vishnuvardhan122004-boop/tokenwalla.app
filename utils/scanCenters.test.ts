import { asList, BLOOD_CENTER, filterByKind, filterScanCenters, SCAN_CENTER } from './scanCenters';

describe('filterScanCenters', () => {
  it('keeps only explicit scanning centres', () => {
    const rows = [
      { id: 1, name: 'Vijaya Diagnostics', kind: 'SCAN_CENTER' },
      { id: 2, name: 'Sri Sarwodhaya',     kind: 'HOSPITAL' },
    ];
    expect(filterScanCenters(rows).map(r => r.id)).toEqual([1]);
  });

  it('drops everything when the backend predates `kind`', () => {
    // The real hazard: an older /api/hospitals/ ignores ?kind= and returns the
    // whole hospital list with no `kind` field. Rendering those as scanning
    // centres would send a patient to a hospital to ask for an MRI.
    const legacy = [{ id: 1, name: 'Sri Sarwodhaya' }, { id: 2, name: 'City Care' }];
    expect(filterScanCenters(legacy)).toEqual([]);
  });

  it('is not fooled by a near-miss value', () => {
    expect(filterScanCenters([{ id: 1, kind: 'scan_center' }])).toEqual([]);
    expect(filterScanCenters([{ id: 2, kind: 'SCANCENTER' }])).toEqual([]);
  });

  it('survives junk', () => {
    expect(filterScanCenters(null)).toEqual([]);
    expect(filterScanCenters(undefined)).toEqual([]);
    expect(filterScanCenters([null as any, { kind: 'SCAN_CENTER' }])).toHaveLength(1);
  });
});

describe('asList', () => {
  it('unwraps both paginated and plain responses', () => {
    expect(asList([1, 2])).toEqual([1, 2]);
    expect(asList({ results: [3] })).toEqual([3]);
    expect(asList(null)).toEqual([]);
    expect(asList({ detail: 'nope' })).toEqual([]);
  });
});

describe('blood centres', () => {
  const rows = [
    { id: 1, kind: 'SCAN_CENTER',  name: 'Vijaya Diagnostics' },
    { id: 2, kind: 'BLOOD_CENTER', name: 'Lotus Pathology Lab' },
    { id: 3, kind: 'HOSPITAL',     name: 'Sri Sarwodhaya' },
    { id: 4,                       name: 'Old backend, no kind' },
  ];

  it('keeps the two centre lists separate', () => {
    expect(filterByKind(rows, BLOOD_CENTER).map(r => r.id)).toEqual([2]);
    expect(filterByKind(rows, SCAN_CENTER).map(r => r.id)).toEqual([1]);
  });

  it('drops hospitals and kind-less rows from an older backend', () => {
    // The whole reason this file exists — an old /hospitals/ ignores ?kind=.
    expect(filterByKind(rows, BLOOD_CENTER).map(r => r.name))
      .not.toContain('Old backend, no kind');
  });
});

describe('hybrid providers', () => {
  const hybrid = { id: 1, kind: 'HOSPITAL',     segments: ['CONSULT', 'SCAN'], name: 'Sri Sarwodhaya' };
  const centre = { id: 2, kind: 'SCAN_CENTER',  segments: ['SCAN'],            name: 'Vijaya' };
  const lab    = { id: 3, kind: 'BLOOD_CENTER', segments: ['BLOOD'],           name: 'Lotus' };
  const plain  = { id: 4, kind: 'HOSPITAL',     segments: ['CONSULT'],         name: 'City Care' };
  const rows = [hybrid, centre, lab, plain];

  it('keeps a hospital that also sells scans in the scans tab', () => {
    // The whole point: matching on `kind` would drop it, since kind=HOSPITAL.
    expect(filterByKind(rows, SCAN_CENTER).map(r => r.id)).toEqual([1, 2]);
  });

  it('does not put it in a tab it does not sell', () => {
    expect(filterByKind(rows, BLOOD_CENTER).map(r => r.id)).toEqual([3]);
  });

  it('falls back to kind when the backend predates segments', () => {
    // Older backend: no `segments` key at all. Hybrids cannot exist there, so
    // kind is the correct and only answer.
    const legacy = [{ id: 1, kind: 'SCAN_CENTER' }, { id: 2, kind: 'HOSPITAL' }];
    expect(filterByKind(legacy, SCAN_CENTER).map(r => r.id)).toEqual([1]);
  });

  it('still drops everything when an old backend ignores ?kind=', () => {
    const legacy = [{ id: 1, name: 'City Care' }, { id: 2, name: 'Rival' }];
    expect(filterByKind(legacy, BLOOD_CENTER)).toEqual([]);
  });

  it('an empty segments array means it sells nothing', () => {
    expect(filterByKind([{ id: 9, kind: 'HOSPITAL', segments: [] }], SCAN_CENTER))
      .toEqual([]);
  });
});
