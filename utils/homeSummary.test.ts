import { cityKey, featuredDoctors, initials, summariseDoctors } from './homeSummary';

const doc = (over: object) => ({
  id: 1, name: 'Asha Rao', city: 'Hindupur', hospital: 10, hospital_name: 'Sri Sai Hospital',
  available: true, ...over,
});

describe('summariseDoctors', () => {
  const list = [
    doc({ id: 1, hospital: 10, hospital_name: 'Sri Sai Hospital' }),
    doc({ id: 2, hospital: 10, hospital_name: 'Sri Sai Hospital' }),
    doc({ id: 3, hospital: 11, hospital_name: 'City Care Hospital' }),
    doc({ id: 4, hospital: 12, hospital_name: 'Lotus Clinic', city: 'Anantapur' }),
  ];

  it('counts doctors and distinct hospitals per city, busiest city first', () => {
    expect(summariseDoctors(list).cities).toEqual([
      { key: 'hindupur',  name: 'Hindupur',  doctors: 3, hospitals: 2 },
      { key: 'anantapur', name: 'Anantapur', doctors: 1, hospitals: 1 },
    ]);
  });

  it('lists each hospital once with its doctor count, busiest first', () => {
    expect(summariseDoctors(list).hospitals.map(h => [h.name, h.doctors, h.city])).toEqual([
      ['Sri Sai Hospital', 2, 'Hindupur'],
      ['City Care Hospital', 1, 'Hindupur'],
      ['Lotus Clinic', 1, 'Anantapur'],
    ]);
  });

  it('treats "Hindupur " and "hindupur" as one city, keeping the first spelling', () => {
    const { cities } = summariseDoctors([doc({ city: 'Hindupur ' }), doc({ id: 2, city: 'hindupur' })]);
    expect(cities).toHaveLength(1);
    expect(cities[0]).toMatchObject({ name: 'Hindupur', doctors: 2 });
  });

  it('keeps a hospital with no city out of the city list but still lists it', () => {
    const s = summariseDoctors([doc({ city: '', hospital: 20, hospital_name: 'No City Clinic' })]);
    expect(s.cities).toEqual([]);
    expect(s.hospitals).toHaveLength(1);
  });

  it('is empty for an empty list', () => {
    expect(summariseDoctors([])).toEqual({ cities: [], hospitals: [] });
  });
});

describe('featuredDoctors', () => {
  it('puts bookable doctors first without reordering within a group, and caps the list', () => {
    const list = [
      doc({ id: 1, available: false }), doc({ id: 2 }), doc({ id: 3, available: false }), doc({ id: 4 }),
    ];
    expect(featuredDoctors(list, 3).map(d => d.id)).toEqual([2, 4, 1]);
  });

  it('does not mutate the list it was given', () => {
    const list = [doc({ id: 1, available: false }), doc({ id: 2 })];
    featuredDoctors(list, 5);
    expect(list.map(d => d.id)).toEqual([1, 2]);
  });
});

describe('initials / cityKey', () => {
  it('drops the title and takes two letters', () => {
    expect(initials('Dr. Asha Rao')).toBe('AR');
    expect(initials('dr asha')).toBe('A');
    expect(initials('Dr.Keerthi S')).toBe('KS');
    expect(initials('Drishti Rao')).toBe('DR');
    expect(initials('Ravi Kumar Reddy')).toBe('RK');
    expect(initials('')).toBe('');
    expect(initials(null)).toBe('');
  });

  it('normalises case, edges and inner spacing', () => {
    expect(cityKey('  New   Delhi ')).toBe('new delhi');
    expect(cityKey(undefined)).toBe('');
  });
});
