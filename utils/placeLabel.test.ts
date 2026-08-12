import { isUsableCoord, MIN_CONFIRM_ZOOM, placeFromFeature } from './placeLabel';

const feat = (properties: Record<string, unknown>) => ({ properties });

describe('placeFromFeature', () => {
  it('returns null for a missing feature', () => {
    expect(placeFromFeature(null)).toBeNull();
    expect(placeFromFeature(undefined)).toBeNull();
  });

  it('builds a readable label and picks the city', () => {
    const out = placeFromFeature(feat({
      name: 'Apollo Hospital', housenumber: '12-3', street: 'Ring Road',
      district: 'Gachibowli', city: 'Hyderabad', state: 'Telangana', postcode: '500032',
    }));
    expect(out).toEqual({
      city: 'Hyderabad',
      label: 'Apollo Hospital, 12-3 Ring Road, Gachibowli, Hyderabad, Telangana, 500032',
    });
  });

  it('falls back through town/village/county when city is absent', () => {
    expect(placeFromFeature(feat({ town:    'Tenali'    }))!.city).toBe('Tenali');
    expect(placeFromFeature(feat({ village: 'Kuchipudi' }))!.city).toBe('Kuchipudi');
    expect(placeFromFeature(feat({ county:  'Guntur'    }))!.city).toBe('Guntur');
  });

  it('drops empty parts instead of leaving stray commas', () => {
    expect(placeFromFeature(feat({ city: 'Vijayawada', state: 'Andhra Pradesh' }))!.label)
      .toBe('Vijayawada, Andhra Pradesh');
  });

  it('does not repeat the name when it is just the street', () => {
    expect(placeFromFeature(feat({ name: 'Ring Road', street: 'Ring Road', city: 'Guntur' }))!.label)
      .toBe('Ring Road, Guntur');
  });

  it('does not repeat the district when it equals the city', () => {
    expect(placeFromFeature(feat({ district: 'Guntur', city: 'Guntur', state: 'Andhra Pradesh' }))!.label)
      .toBe('Guntur, Andhra Pradesh');
  });

  it('survives a feature with no usable properties', () => {
    expect(placeFromFeature(feat({}))).toEqual({ city: '', label: '' });
    expect(placeFromFeature({})).toEqual({ city: '', label: '' });
  });
});

describe('isUsableCoord', () => {
  it('accepts real coordinates', () => {
    expect(isUsableCoord(16.3067, 80.4365)).toBe(true);
    expect(isUsableCoord(0, 0)).toBe(true);
  });

  it('rejects nulls, strings and NaN — these reach the map HTML', () => {
    expect(isUsableCoord(null, 80)).toBe(false);
    expect(isUsableCoord(16, undefined)).toBe(false);
    expect(isUsableCoord('16.3' as unknown as number, 80)).toBe(false);
    expect(isUsableCoord(NaN, 80)).toBe(false);
    expect(isUsableCoord(16, Infinity)).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(isUsableCoord(91, 80)).toBe(false);
    expect(isUsableCoord(-91, 80)).toBe(false);
    expect(isUsableCoord(16, 181)).toBe(false);
    expect(isUsableCoord(16, -181)).toBe(false);
  });
});

describe('MIN_CONFIRM_ZOOM', () => {
  it('is at neighbourhood level, not city level', () => {
    expect(MIN_CONFIRM_ZOOM).toBe(14);
  });
});
