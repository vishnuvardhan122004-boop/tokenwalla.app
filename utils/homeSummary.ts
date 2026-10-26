/**
 * What the home screen offers, derived from the public doctor list.
 *
 * The cities, the hospitals and every count on Home come from the one
 * /doctors/ response, so each number is a real one and a new city or hospital
 * appears with no code change. The home screen used to carry a hard-coded stats
 * row ("2,400+ tokens", "94% on-time", "4.8★") that no data ever supported.
 *
 * Mirrors summarise() in the website's src/componets/Hero.js.
 */

export type HomeCity = { key: string; name: string; doctors: number; hospitals: number };
export type HomeHospital = { id: number | string; name: string; city: string; doctors: number };

/** "Hindupur " and "hindupur" are the same city. */
export const cityKey = (city?: string | null): string =>
  String(city ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function summariseDoctors(doctors: any[]): { cities: HomeCity[]; hospitals: HomeHospital[] } {
  const cities = new Map<string, { key: string; name: string; doctors: number; ids: Set<unknown> }>();
  const hospitals = new Map<unknown, HomeHospital>();

  for (const d of doctors) {
    const key = cityKey(d.city);
    if (key) {
      const c = cities.get(key) ?? { key, name: String(d.city).trim(), doctors: 0, ids: new Set() };
      c.doctors += 1;
      c.ids.add(d.hospital);
      cities.set(key, c);
    }
    const h = hospitals.get(d.hospital)
      ?? { id: d.hospital, name: d.hospital_name, city: String(d.city ?? '').trim(), doctors: 0 };
    h.doctors += 1;
    hospitals.set(d.hospital, h);
  }

  return {
    cities: [...cities.values()]
      .map(({ ids, ...c }) => ({ ...c, hospitals: ids.size }))
      .sort((a, b) => b.doctors - a.doctors),
    hospitals: [...hospitals.values()]
      .sort((a, b) => b.doctors - a.doctors || String(a.name).localeCompare(String(b.name))),
  };
}

/** Bookable-today doctors first; the server's order (popular first) breaks ties. */
export const featuredDoctors = (doctors: any[], max: number): any[] =>
  [...doctors].sort((a, b) => Number(!!b.available) - Number(!!a.available)).slice(0, max);

/** "Dr. Asha Rao" -> "AR". Most hospitals upload no photo; this is the stand-in. */
export const initials = (name?: string | null): string =>
  String(name ?? '').replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean)
    .slice(0, 2).map(w => w[0].toUpperCase()).join('');
