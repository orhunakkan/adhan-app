#!/usr/bin/env node
// Builds public/data/cities.json from GeoNames cities15000 (CC BY 4.0).
//   curl -O https://download.geonames.org/export/dump/cities15000.zip && unzip cities15000.zip
//   node scripts/build-cities.mjs path/to/cities15000.txt
// Keeps places with population >= 50,000 (Schaumburg, IL is 74,693), sorted by
// population so search ranks big cities first. Coordinates to 3 decimals (~100 m).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIN_POPULATION = 50_000;
/**
 * Zone names introduced after Safari 15's ICU (2021): the iPad's Intl would
 * reject them, so use the older alias with the same rules.
 */
export const SAFARI15_ZONE_ALIASES = {
  'Europe/Kyiv': 'Europe/Kiev',
  'Pacific/Kanton': 'Pacific/Enderbury',
  'America/Ciudad_Juarez': 'America/Denver',
};
const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/build-cities.mjs <cities15000.txt>');
  process.exit(2);
}

const rows = readFileSync(input, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split('\t'))
  .map((c) => ({
    name: c[1],
    cc: c[8],
    lat: Number(c[4]),
    lng: Number(c[5]),
    pop: Number(c[14]),
    tz: SAFARI15_ZONE_ALIASES[c[17]] ?? c[17],
  }))
  .filter((c) => c.pop >= MIN_POPULATION && c.tz && c.name)
  .sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name));

const tz = [...new Set(rows.map((c) => c.tz))].sort();
const tzIndex = new Map(tz.map((z, i) => [z, i]));
const round = (n) => Math.round(n * 1000) / 1000;

const out = {
  source: 'GeoNames cities15000 (https://www.geonames.org), population >= 50,000',
  license: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
  generated: new Date().toISOString().slice(0, 10),
  tz,
  /** [name, countryCode, lat, lng, tzIndex] */
  cities: rows.map((c) => [c.name, c.cc, round(c.lat), round(c.lng), tzIndex.get(c.tz)]),
};

const file = join(import.meta.dirname, '..', 'public', 'data', 'cities.json');
writeFileSync(file, JSON.stringify(out));
console.log(`${rows.length} cities, ${tz.length} zones → public/data/cities.json`);
