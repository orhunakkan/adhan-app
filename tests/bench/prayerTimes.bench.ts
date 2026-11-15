import { expect, test } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { addDays } from '../../src/core/time';

const loc = { name: 'Schaumburg, IL', lat: 42.0334, lng: -88.0834, tz: 'America/Chicago' };
const days = Array.from({ length: 365 }, (_, i) => addDays('2026-01-01', i));

test('a full year of prayer times stays under 50 ms', async ({ bench }) => {
  const r = await bench('computeDay × 365', () => {
    for (const d of days) computeDay(d, loc, defaultSettings.calc);
  }).run();
  console.log(`computeDay × 365: mean ${r.latency.mean.toFixed(2)} ms`);
  expect(r.latency.mean).toBeLessThan(50);
});
