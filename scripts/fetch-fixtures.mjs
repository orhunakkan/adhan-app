#!/usr/bin/env node
// One-time fetch of reference prayer tables for tests/core/prayerTimes.test.ts.
// Not run in CI: the committed JSON files are the fixtures. Re-run only to
// refresh them, and review the diff.
//
// Sources:
// - Aladhan API (https://aladhan.com/prayer-times-api): an independent
//   implementation of the same calculation methods, used for Schaumburg and Oslo.
// - Diyanet İşleri Başkanlığı published table for İstanbul, via the public
//   ezanvakti.emushaf.net mirror of namazvakti.diyanet.gov.tr (ilçe id 9541).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'tests', 'fixtures', 'prayer');
const FETCHED_AT = new Date().toISOString().slice(0, 10);

const ALADHAN_METHOD = { NorthAmerica: 2, MuslimWorldLeague: 3, Turkey: 13 };
// Aladhan latitudeAdjustmentMethod: 1 = middle of the night, 2 = one seventh, 3 = angle based.
const ALADHAN_HIGH_LAT = { MiddleOfTheNight: 1, SeventhOfTheNight: 2, TwilightAngle: 3 };

const hhmm = (iso) => iso.slice(11, 16);
const isoDate = (ddmmyyyy) => {
  const [d, m, y] = ddmmyyyy.split(/[-.]/);
  return `${y}-${m}-${d}`;
};

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'adhan-app-fixtures/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function aladhanMonth({ name, slug, lat, lng, tz }, year, month, method, highLatitudeRule) {
  const url =
    `https://api.aladhan.com/v1/calendar/${year}/${month}?latitude=${lat}&longitude=${lng}` +
    `&method=${ALADHAN_METHOD[method]}&school=0&latitudeAdjustmentMethod=${ALADHAN_HIGH_LAT[highLatitudeRule]}` +
    `&timezonestring=${encodeURIComponent(tz)}&iso8601=true`;
  const body = await getJson(url);
  const days = body.data.map((d) => ({
    date: isoDate(d.date.gregorian.date),
    fajr: hhmm(d.timings.Fajr),
    sunrise: hhmm(d.timings.Sunrise),
    dhuhr: hhmm(d.timings.Dhuhr),
    asr: hhmm(d.timings.Asr),
    maghrib: hhmm(d.timings.Maghrib),
    isha: hhmm(d.timings.Isha),
  }));
  const mm = String(month).padStart(2, '0');
  write(`${slug}-${year}-${mm}-${method}-${highLatitudeRule}.json`, {
    source: `Aladhan API (method ${ALADHAN_METHOD[method]}, latitudeAdjustmentMethod ${ALADHAN_HIGH_LAT[highLatitudeRule]})`,
    url,
    fetchedAt: FETCHED_AT,
    location: { name, lat, lng, tz },
    method,
    madhab: 'Shafi',
    highLatitudeRule,
    days,
  });
}

async function diyanetIstanbul() {
  const url = 'https://ezanvakti.emushaf.net/vakitler/9541';
  const body = await getJson(url);
  const days = body.map((d) => ({
    date: isoDate(d.MiladiTarihKisa),
    fajr: d.Imsak,
    sunrise: d.Gunes,
    dhuhr: d.Ogle,
    asr: d.Ikindi,
    maghrib: d.Aksam,
    isha: d.Yatsi,
  }));
  write('istanbul-diyanet.json', {
    source:
      'Diyanet İşleri Başkanlığı published table (İstanbul, ilçe 9541) via ezanvakti.emushaf.net',
    url,
    fetchedAt: FETCHED_AT,
    location: { name: 'İstanbul', lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' },
    method: 'Turkey',
    madhab: 'Shafi',
    highLatitudeRule: 'MiddleOfTheNight',
    days,
  });
}

function write(file, data) {
  writeFileSync(join(OUT, file), JSON.stringify(data, null, 1) + '\n');
  console.log(`wrote ${file} (${data.days.length} days)`);
}

mkdirSync(OUT, { recursive: true });
const schaumburg = {
  name: 'Schaumburg, IL',
  slug: 'schaumburg',
  lat: 42.0334,
  lng: -88.0834,
  tz: 'America/Chicago',
};
const oslo = { name: 'Oslo', slug: 'oslo', lat: 59.9139, lng: 10.7522, tz: 'Europe/Oslo' };

for (const method of ['NorthAmerica', 'Turkey']) {
  for (const month of [1, 7])
    await aladhanMonth(schaumburg, 2026, month, method, 'MiddleOfTheNight');
}
for (const rule of ['MiddleOfTheNight', 'SeventhOfTheNight', 'TwilightAngle']) {
  await aladhanMonth(oslo, 2026, 6, 'MuslimWorldLeague', rule);
}
await diyanetIstanbul();
