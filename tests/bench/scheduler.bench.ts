import { expect, test } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { getDuePrayer, getUpcoming } from '../../src/core/scheduler';

const loc = { name: 'Schaumburg, IL', lat: 42.0334, lng: -88.0834, tz: 'America/Chicago' };
const days = {
  yesterday: computeDay('2026-05-09', loc, defaultSettings.calc),
  today: computeDay('2026-05-10', loc, defaultSettings.calc),
  tomorrow: computeDay('2026-05-11', loc, defaultSettings.calc),
};
const fired = Array.from({ length: 32 }, (_, i) => ({
  key: `2026-04-${String((i % 28) + 1).padStart(2, '0')}:asr`,
  at: 0,
}));
let t = new Date('2026-05-10T17:00:00Z').getTime();

test('scheduler decisions stay under 0.05 ms per call (they run every second)', async ({
  bench,
}) => {
  const due = await bench('getDuePrayer', () => {
    t += 1000;
    getDuePrayer({
      now: new Date(t),
      days,
      fired,
      enabled: defaultSettings.azan.enabled,
      lateWindowMs: 120_000,
    });
  }).run();
  const upcoming = await bench('getUpcoming', () => {
    t += 1000;
    getUpcoming({ now: new Date(t), days, enabled: defaultSettings.azan.enabled, leadMs: 600_000 });
  }).run();
  console.log(
    `getDuePrayer: ${(due.latency.mean * 1000).toFixed(2)} µs, getUpcoming: ${(upcoming.latency.mean * 1000).toFixed(2)} µs`,
  );
  expect(due.latency.mean).toBeLessThan(0.05);
  expect(upcoming.latency.mean).toBeLessThan(0.05);
});
