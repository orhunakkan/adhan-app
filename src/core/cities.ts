// Bundled city list (GeoNames, CC BY 4.0) for the Location settings search (brief §5).
import { z } from '../config/zod';
import type { Location } from './prayerTimes';

export const citiesFileSchema = z.object({
  source: z.string(),
  license: z.string(),
  generated: z.string(),
  tz: z.array(z.string().min(1)),
  cities: z.array(
    z.tuple([z.string().min(1), z.string().length(2), z.number(), z.number(), z.int().min(0)]),
  ),
});

export interface City extends Location {
  id: number;
  country: string;
  /** fold(name), computed once at parse time (search runs on every keystroke). */
  folded: string;
}

export function parseCities(json: unknown): City[] {
  const file = citiesFileSchema.parse(json);
  return file.cities.map(([name, country, lat, lng, tzi], id) => {
    const tz = file.tz[tzi];
    if (!tz) throw new Error(`City ${name} has an unknown zone index ${tzi}`);
    return { id, name, country, lat, lng, tz, folded: fold(name) };
  });
}

/** Lower-case, Turkish dotted/dotless i folded, accents stripped: "İstanbul" → "istanbul". */
export function fold(s: string): string {
  return s.replace(/[İIı]/g, 'i').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Prefix matches first (population order is kept), then substring matches. */
export function searchCities(cities: readonly City[], query: string, limit = 20): City[] {
  const qf = fold(query.trim());
  if (!qf) return [];
  const prefix: City[] = [];
  const contains: City[] = [];
  for (const c of cities) {
    const n = c.folded;
    if (n.startsWith(qf)) prefix.push(c);
    else if (n.includes(qf)) contains.push(c);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}

export function cityLabel(c: City): string {
  return `${c.name}, ${c.country}`;
}
