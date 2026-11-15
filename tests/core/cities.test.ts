import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidTimeZone } from '../../src/config/schema';
import { cityLabel, fold, parseCities, searchCities } from '../../src/core/cities';

const FILE = join(import.meta.dirname, '..', '..', 'public', 'data', 'cities.json');
const cities = parseCities(JSON.parse(readFileSync(FILE, 'utf8')));
const NEWER_THAN_SAFARI15 = ['Europe/Kyiv', 'Pacific/Kanton', 'America/Ciudad_Juarez'];

describe('cities dataset', () => {
  it('parses with zod and stays under 500 KB', () => {
    expect(cities.length).toBeGreaterThan(10_000);
    expect(statSync(FILE).size).toBeLessThan(500 * 1024);
  });

  it('has unique ids and plausible coordinates', () => {
    expect(new Set(cities.map((c) => c.id)).size).toBe(cities.length);
    for (const c of cities) {
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lng)).toBeLessThanOrEqual(180);
    }
  });

  it('uses only valid IANA zones, none newer than Safari 15 knows', () => {
    const supported = new Set(Intl.supportedValuesOf('timeZone'));
    const zones = new Set(cities.map((c) => c.tz));
    for (const z of zones) {
      expect(isValidTimeZone(z), z).toBe(true);
      expect(NEWER_THAN_SAFARI15).not.toContain(z);
    }
    // Most zones are canonical in the engine's list (old aliases are accepted too).
    const canonical = [...zones].filter((z) => supported.has(z)).length;
    expect(canonical / zones.size).toBeGreaterThan(0.9);
  });

  it('records its source and licence', () => {
    const raw = JSON.parse(readFileSync(FILE, 'utf8')) as { source: string; license: string };
    expect(raw.source).toMatch(/GeoNames/);
    expect(raw.license).toMatch(/CC BY 4\.0/);
  });

  it('includes the reference cities', () => {
    for (const name of ['Schaumburg', 'Istanbul', 'Oslo', 'Makkah']) {
      expect(
        cities.some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('search', () => {
  it.each(['istanbul', 'İstanbul', 'ISTANBUL', 'Istanbul'])('finds Istanbul for %j', (q) => {
    expect(searchCities(cities, q)[0]!.name).toBe('Istanbul');
  });

  it('is accent-insensitive', () => {
    expect(fold('Şanlıurfa')).toBe('sanliurfa');
    expect(searchCities(cities, 'sanliurfa').map((c) => c.name)).toContain('Şanlıurfa');
    expect(searchCities(cities, 'sao paulo')[0]!.name).toBe('São Paulo');
  });

  it('ranks prefix matches before substring matches and respects the limit', () => {
    const r = searchCities(cities, 'san', 5);
    expect(r).toHaveLength(5);
    expect(r.every((c) => fold(c.name).startsWith('san'))).toBe(true);
    expect(searchCities(cities, 'new york')[0]!.name).toBe('New York City');
  });

  it('returns nothing for an empty query', () => {
    expect(searchCities(cities, '   ')).toEqual([]);
  });

  it('labels a city with its country', () => {
    expect(cityLabel(searchCities(cities, 'schaumburg')[0]!)).toBe('Schaumburg, US');
  });

  it('rejects a file whose zone index is out of range', () => {
    const bad = {
      source: 's',
      license: 'l',
      generated: 'g',
      tz: ['UTC'],
      cities: [['X', 'XX', 0, 0, 3]],
    };
    expect(() => parseCities(bad)).toThrow(/zone index/);
  });
});
