import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import type { Settings } from '../../src/config/schema';
import { computeDay, AZAN_PRAYERS } from '../../src/core/prayerTimes';
import { createScheduler, type PrayerEvent, type SchedulerEvent } from '../../src/core/scheduler';
import { KEYS } from '../../src/core/storage';
import { FakeClock } from '../helpers/fakeClock';
import { MemoryStore } from '../helpers/memoryStore';
import { OSLO, SCHAUMBURG } from '../helpers/days';

const H = 3_600_000;
const settingsAt = (over: Partial<Settings> = {}): Settings => ({
  ...defaultSettings,
  location: SCHAUMBURG,
  calc: { ...defaultSettings.calc, method: 'NorthAmerica' },
  ...over,
});

const ofType = (events: SchedulerEvent[], type: PrayerEvent['type']) =>
  events.filter((e): e is PrayerEvent => e.type === type);

function harness(start: Date, settings: Settings, store = new MemoryStore()) {
  const clock = new FakeClock(start);
  const events: SchedulerEvent[] = [];
  let current = settings;
  const scheduler = createScheduler({
    clock,
    store,
    getSettings: () => current,
    onEvent: (e) => events.push(e),
  });
  return {
    clock,
    store,
    events,
    scheduler,
    azans: () => ofType(events, 'azan'),
    setSettings(s: Settings) {
      current = s;
      scheduler.refresh();
    },
  };
}

describe('scheduler loop', () => {
  let h: ReturnType<typeof harness> | undefined;
  afterEach(() => {
    h?.scheduler.stop();
    h?.clock.dispose();
  });

  it('fires exactly 10 azans in 48 hours, in order, each once', () => {
    // 00:00 local (CDT, UTC−5) on 2026-05-10.
    h = harness(new Date('2026-05-10T05:00:00Z'), settingsAt());
    h.scheduler.start();
    h.clock.advanceBy(48 * H);
    const azans = h.azans();
    expect(azans.map((e) => e.key)).toEqual(
      ['2026-05-10', '2026-05-11'].flatMap((d) => AZAN_PRAYERS.map((p) => `${d}:${p}`)),
    );
    for (const e of azans) {
      const expected = computeDay(e.key.slice(0, 10), SCHAUMBURG, settingsAt().calc)[e.prayer];
      expect(e.firedAt.getTime() - expected.getTime()).toBeGreaterThanOrEqual(0);
      expect(e.firedAt.getTime() - expected.getTime()).toBeLessThanOrEqual(1000);
    }
    expect(JSON.parse(h.store.get(KEYS.lastFired)!).at(-1).key).toBe('2026-05-11:isha');
  });

  it('does not repeat or burst after a mid-day reload', () => {
    const store = new MemoryStore();
    h = harness(new Date('2026-05-10T05:00:00Z'), settingsAt(), store);
    h.scheduler.start();
    const dhuhr = computeDay('2026-05-10', SCHAUMBURG, settingsAt().calc).dhuhr;
    h.clock.advanceTo(new Date(dhuhr.getTime() + 30_000)); // reload 30 s into the dhuhr azan window
    h.scheduler.stop();
    const firstRun = h.azans().map((e) => e.key);
    expect(firstRun).toEqual(['2026-05-10:fajr', '2026-05-10:dhuhr']);

    // New scheduler instance over the same persisted store = page reload.
    const events: SchedulerEvent[] = [];
    const reloaded = createScheduler({
      clock: h.clock,
      store,
      getSettings: () => settingsAt(),
      onEvent: (e) => events.push(e),
    });
    reloaded.start();
    h.clock.advanceBy(H);
    reloaded.stop();
    expect(ofType(events, 'azan')).toEqual([]);
  });

  it('after a long sleep, fires nothing late, then resumes with the next prayer', () => {
    h = harness(new Date('2026-05-10T05:00:00Z'), settingsAt());
    const t = computeDay('2026-05-10', SCHAUMBURG, settingsAt().calc);
    h.scheduler.start();
    h.scheduler.stop(); // iPad asleep / timers frozen
    h.clock.advanceTo(new Date(t.asr.getTime() - 60_000));
    h.scheduler.start();
    h.clock.advanceTo(new Date(t.asr.getTime() + 5000));
    expect(h.azans().map((e) => e.prayer)).toEqual(['asr']);
  });

  it.each([
    ['spring forward', '2026-03-07T06:00:00Z'],
    ['fall back', '2026-10-31T05:00:00Z'],
  ])('fires 10 azans across the %s DST weekend', (_n, startIso) => {
    h = harness(new Date(startIso), settingsAt());
    h.scheduler.start();
    h.clock.advanceBy(48 * H);
    const keys = h.azans().map((e) => e.key);
    expect(keys).toHaveLength(10);
    expect(new Set(keys).size).toBe(10);
  });

  it('recomputes times when the local date changes mid-run (midnight rollover)', () => {
    h = harness(new Date('2026-05-10T04:59:50Z'), settingsAt()); // 23:59:50 local on 05-09
    h.scheduler.start();
    expect(h.scheduler.days()?.today.dateKey).toBe('2026-05-09');
    h.clock.advanceBy(20_000);
    expect(h.scheduler.days()?.today.dateKey).toBe('2026-05-10');
    expect(h.events.filter((e) => e.type === 'day')).toHaveLength(2); // start + rollover
  });

  it('handles Isha after midnight at high latitude without skipping or doubling', () => {
    const oslo = settingsAt({
      location: OSLO,
      calc: {
        ...defaultSettings.calc,
        method: 'MuslimWorldLeague',
        highLatitudeRule: 'TwilightAngle',
      },
    });
    h = harness(new Date('2026-06-20T10:00:00Z'), oslo);
    h.scheduler.start();
    h.clock.advanceBy(24 * H);
    const keys = h.azans().map((e) => e.key);
    expect(keys).toContain('2026-06-20:isha');
    expect(new Set(keys).size).toBe(keys.length);
    const isha = h.azans().find((e) => e.key === '2026-06-20:isha')!;
    expect(isha.firedAt.toISOString() > '2026-06-20T22:00:00Z').toBe(true); // after local midnight
  });

  it('skips disabled prayers and stays idle without a location', () => {
    h = harness(
      new Date('2026-05-10T05:00:00Z'),
      settingsAt({
        azan: { ...defaultSettings.azan, enabled: { ...defaultSettings.azan.enabled, asr: false } },
      }),
    );
    h.scheduler.start();
    h.clock.advanceBy(24 * H);
    expect(h.azans().map((e) => e.prayer)).toEqual(['fajr', 'dhuhr', 'maghrib', 'isha']);

    h.setSettings(settingsAt({ location: null }));
    h.clock.advanceBy(24 * H);
    expect(h.azans()).toHaveLength(4);
    expect(h.scheduler.days()).toBeNull();
  });

  it('applies settings changes on refresh (e.g. an offset)', () => {
    h = harness(new Date('2026-05-10T05:00:00Z'), settingsAt());
    h.scheduler.start();
    const base = computeDay('2026-05-10', SCHAUMBURG, settingsAt().calc).dhuhr;
    const calc = { ...settingsAt().calc, offsets: { ...settingsAt().calc.offsets, dhuhr: 10 } };
    h.setSettings(settingsAt({ calc }));
    h.clock.advanceTo(new Date(base.getTime() + 5 * 60_000));
    expect(h.azans().map((e) => e.prayer)).toEqual(['fajr']);
    h.clock.advanceBy(6 * 60_000);
    expect(h.azans().map((e) => e.prayer)).toEqual(['fajr', 'dhuhr']);
  });

  it('emits a pre-alert N minutes before and a health check 3 minutes before each azan, once each', () => {
    h = harness(new Date('2026-05-10T05:00:00Z'), settingsAt());
    h.scheduler.start();
    h.clock.advanceBy(24 * H);
    const pre = ofType(h.events, 'preAlert');
    const health = ofType(h.events, 'healthCheck');
    expect(pre.map((e) => e.prayer)).toEqual([...AZAN_PRAYERS]);
    expect(health.map((e) => e.prayer)).toEqual([...AZAN_PRAYERS]);
    const asr = computeDay('2026-05-10', SCHAUMBURG, settingsAt().calc).asr.getTime();
    expect(pre.find((e) => e.prayer === 'asr')!.firedAt.getTime()).toBe(asr - 10 * 60_000);
    expect(health.find((e) => e.prayer === 'asr')!.firedAt.getTime()).toBe(asr - 3 * 60_000);
  });

  it('does not emit pre-alerts when preAlertMin is 0', () => {
    h = harness(
      new Date('2026-05-10T05:00:00Z'),
      settingsAt({ azan: { ...defaultSettings.azan, preAlertMin: 0 } }),
    );
    h.scheduler.start();
    h.clock.advanceBy(24 * H);
    expect(ofType(h.events, 'preAlert')).toEqual([]);
  });

  it('calls onTick once per second with the current days', () => {
    const clock = new FakeClock(new Date('2026-05-10T05:00:00Z'));
    const ticks: Array<string | undefined> = [];
    const s = createScheduler({
      clock,
      store: new MemoryStore(),
      getSettings: () => settingsAt(),
      onEvent: () => {},
      onTick: (_now, days) => ticks.push(days?.today.dateKey),
    });
    s.start();
    clock.advanceBy(3000);
    s.stop();
    clock.dispose();
    expect(ticks).toEqual(['2026-05-10', '2026-05-10', '2026-05-10', '2026-05-10']);
  });

  it('start() is idempotent and stop() halts ticking', () => {
    h = harness(new Date('2026-05-10T05:00:00Z'), settingsAt());
    h.scheduler.start();
    h.scheduler.start();
    h.clock.advanceBy(24 * H);
    expect(h.azans()).toHaveLength(5);
    h.scheduler.stop();
    h.clock.advanceBy(24 * H);
    expect(h.azans()).toHaveLength(5);
  });
});
