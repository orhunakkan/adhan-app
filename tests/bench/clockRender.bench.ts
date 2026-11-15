// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import type { AppState } from '../../src/app/createApp';
import { defaultSettings } from '../../src/config/defaults';
import { periodAt } from '../../src/core/period';
import { computeDay } from '../../src/core/prayerTimes';
import { mountClockView } from '../../src/ui/clockView';
import { mountNextPrayerCard } from '../../src/ui/nextPrayerCard';
import { mountTimeline } from '../../src/ui/timeline';

const loc = { name: 'Schaumburg, IL', lat: 42.0334, lng: -88.0834, tz: 'America/Chicago' };
const days = {
  yesterday: computeDay('2026-05-09', loc, defaultSettings.calc),
  today: computeDay('2026-05-10', loc, defaultSettings.calc),
  tomorrow: computeDay('2026-05-11', loc, defaultSettings.calc),
};

test('one per-second render of clock, card and timeline is cheap', async ({ bench }) => {
  const host = document.createElement('div');
  document.body.append(host);
  const views = [mountClockView(host), mountNextPrayerCard(host), mountTimeline(host)];
  let t = new Date('2026-05-10T17:00:00Z').getTime();
  const base = {
    settings: { ...defaultSettings, location: loc },
    days,
    needsLocation: false,
  } as unknown as AppState;
  const r = await bench('render tick', () => {
    t += 1000;
    const now = new Date(t);
    const s = { ...base, now, period: periodAt(now, days) };
    for (const v of views) v.render(s);
  }).run();
  console.log(`render tick: ${(r.latency.mean * 1000).toFixed(1)} µs`);
  // Desktop Node; the A8 is ~10–20× slower, and a tick has 1000 ms.
  expect(r.latency.mean).toBeLessThan(2);
});
