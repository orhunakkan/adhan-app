// Regression tests from the doubt-driven review of the scheduler (Checkpoint 3).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import type { Settings } from '../../src/config/schema';
import type { KeyValueStore } from '../../src/core/ports';
import { computeDay } from '../../src/core/prayerTimes';
import {
  createScheduler,
  getDuePrayer,
  getUpcoming,
  MAX_DELIVERY_ATTEMPTS,
  type PrayerEvent,
  type SchedulerEvent,
} from '../../src/core/scheduler';
import { KEYS } from '../../src/core/storage';
import { daysAround, ISNA, MIN, OSLO, plus, SCHAUMBURG, SEC } from '../helpers/days';
import { FakeClock } from '../helpers/fakeClock';
import { MemoryStore } from '../helpers/memoryStore';

const H = 3_600_000;
const ALL_ON = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
const ISTANBUL = { name: 'İstanbul', lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' };
const NEW_YORK = { name: 'New York', lat: 40.7128, lng: -74.006, tz: 'America/New_York' };
const base = (over: Partial<Settings> = {}): Settings => ({
  ...defaultSettings,
  location: SCHAUMBURG,
  ...over,
});

function run(
  start: Date,
  settings: () => Settings,
  store: KeyValueStore = new MemoryStore(),
  onError = vi.fn(),
) {
  const clock = new FakeClock(start);
  const events: SchedulerEvent[] = [];
  const scheduler = createScheduler({
    clock,
    store,
    getSettings: settings,
    onEvent: (e) => events.push(e),
    onError,
  });
  const azans = () => events.filter((e): e is PrayerEvent => e.type === 'azan');
  return {
    clock,
    events,
    scheduler,
    azans,
    onError,
    dispose: () => (scheduler.stop(), clock.dispose()),
  };
}

describe('scheduler review regressions', () => {
  let r: ReturnType<typeof run> | undefined;
  afterEach(() => r?.dispose());

  it('#1 fires Isha even when the next Fajr comes before it (Oslo, July, default rule)', () => {
    const turkey = { ...ISNA, method: 'Turkey' as const };
    const d = daysAround('2026-07-16', OSLO, turkey);
    expect(d.yesterday.isha.getTime()).toBeGreaterThan(d.today.fajr.getTime()); // precondition
    r = run(new Date('2026-07-15T08:00:00Z'), () =>
      base({ location: OSLO, calc: { ...defaultSettings.calc, method: 'Turkey' } }),
    );
    r.scheduler.start();
    r.clock.advanceBy(24 * H);
    const keys = r.azans().map((e) => e.key);
    expect(keys).toContain('2026-07-15:isha');
    expect(keys).toContain('2026-07-16:fajr');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('#2 fires both Isha and Fajr when they coincide, Isha first', () => {
    const mwl = () =>
      base({ location: OSLO, calc: { ...defaultSettings.calc, method: 'MuslimWorldLeague' } });
    const d = daysAround('2026-06-21', OSLO, { ...ISNA, method: 'MuslimWorldLeague' });
    expect(d.yesterday.isha).toEqual(d.today.fajr);
    r = run(plus(d.today.fajr, -MIN), mwl);
    r.scheduler.start();
    r.clock.advanceBy(3 * MIN);
    expect(r.azans().map((e) => e.key)).toEqual(['2026-06-20:isha', '2026-06-21:fajr']);
    const pre = r.events.filter((e) => e.type === 'healthCheck');
    expect(pre.map((e) => (e as PrayerEvent).key)).toEqual(['2026-06-20:isha', '2026-06-21:fajr']);
  });

  it('#3 never fires for NaN times (latitude near the pole)', () => {
    const pole = { name: 'Pole', lat: 89.95, lng: 0, tz: 'UTC' };
    r = run(new Date('2026-12-21T00:00:00Z'), () => base({ location: pole }));
    r.scheduler.start();
    r.clock.advanceBy(48 * H);
    // Solar noon (and some others) still exist at the pole; NaN times must never fire.
    for (const e of r.azans()) expect(Number.isFinite(e.at.getTime())).toBe(true);
    expect(
      getDuePrayer({
        now: new Date(Number.NaN),
        days: daysAround('2026-05-10'),
        fired: [],
        enabled: ALL_ON,
        lateWindowMs: 120_000,
      }),
    ).toBeNull();
  });

  it("#4 a westward location change does not block that day's remaining azans (key-only)", () => {
    // Isha already fired in Istanbul today. After moving to New York, Dhuhr/Asr/Maghrib
    // (not yet fired today) still play; Isha's key fired, so it does not play twice.
    const store = new MemoryStore({ [KEYS.lastFired]: JSON.stringify(['2026-11-14:isha']) });
    let loc = ISTANBUL;
    r = run(new Date('2026-11-14T15:30:00Z'), () => base({ location: loc }), store);
    r.scheduler.start();
    loc = NEW_YORK;
    r.scheduler.refresh();
    r.clock.advanceBy(12 * H);
    expect(r.azans().map((e) => e.key)).toEqual([
      '2026-11-14:dhuhr',
      '2026-11-14:asr',
      '2026-11-14:maghrib',
    ]);
  });

  it('cycle 2 C3: a madhab change never replays an azan that already played', () => {
    const LONDON = { name: 'London', lat: 51.5074, lng: -0.1278, tz: 'Europe/London' };
    let s = base({ location: LONDON });
    const asr = computeDay('2026-06-21', LONDON, s.calc).asr;
    r = run(plus(asr, -MIN), () => s);
    r.scheduler.start();
    r.clock.advanceBy(2 * MIN);
    s = base({ location: LONDON, calc: { ...s.calc, madhab: 'Hanafi' } });
    r.clock.advanceBy(3 * H);
    expect(r.azans().filter((e) => e.key === '2026-06-21:asr')).toHaveLength(1);
  });

  it('#4 a fired key from a wrong future clock does not suppress later azans', () => {
    const store = new MemoryStore({ [KEYS.lastFired]: JSON.stringify(['2026-12-01:fajr']) });
    r = run(new Date('2026-05-10T05:00:00Z'), () => base(), store);
    r.scheduler.start();
    r.clock.advanceBy(24 * H);
    expect(r.azans()).toHaveLength(5);
  });

  it('#5 still plays the azan exactly once when persisting lastFired throws', () => {
    const throwing: KeyValueStore = {
      get: () => null,
      set: () => {
        throw new Error('QuotaExceededError');
      },
      remove: () => {},
    };
    r = run(new Date('2026-05-10T05:00:00Z'), () => base(), throwing);
    r.scheduler.start();
    r.clock.advanceBy(24 * H);
    expect(r.azans()).toHaveLength(5);
    expect(r.onError).toHaveBeenCalled();
  });

  it('#6 keeps ticking when a tick throws, and reports the error once per message', () => {
    let calls = 0;
    const flaky = () => {
      calls++;
      if (calls <= 3) throw new Error('settings unavailable');
      return base();
    };
    r = run(new Date('2026-05-10T05:00:00Z'), flaky);
    r.scheduler.start();
    r.clock.advanceBy(24 * H);
    expect(r.azans()).toHaveLength(5);
    expect(r.onError).toHaveBeenCalledTimes(1);
  });

  it('#6 an onEvent handler that always throws: bounded retries, and the loop keeps going', () => {
    const clock = new FakeClock(new Date('2026-05-10T05:00:00Z'));
    const seen: string[] = [];
    const onError = vi.fn();
    const s = createScheduler({
      clock,
      store: new MemoryStore(),
      getSettings: () => base(),
      onEvent: (e) => {
        if (e.type !== 'azan') return;
        seen.push(e.key);
        throw new Error('view crashed');
      },
      onError,
    });
    s.start();
    clock.advanceBy(24 * H);
    s.stop();
    clock.dispose();
    expect(new Set(seen).size).toBe(5);
    expect(seen).toHaveLength(5 * MAX_DELIVERY_ATTEMPTS);
    expect(onError).toHaveBeenCalled();
  });

  it('cycle 2 C2: an azan whose delivery threw once is retried on the next tick', () => {
    const clock = new FakeClock(new Date('2026-05-10T05:00:00Z'));
    const delivered: string[] = [];
    let failOnce = true;
    const s = createScheduler({
      clock,
      store: new MemoryStore(),
      getSettings: () => base(),
      onEvent: (e) => {
        if (e.type !== 'azan') return;
        if (failOnce) {
          failOnce = false;
          throw new Error('transient');
        }
        delivered.push(e.key);
      },
    });
    s.start();
    clock.advanceBy(24 * H);
    s.stop();
    clock.dispose();
    expect(delivered).toHaveLength(5);
    expect(new Set(delivered).size).toBe(5);
  });

  it('cycle 2 C1: an error sink that throws (storage full) cannot suppress azans', () => {
    const throwing: KeyValueStore = {
      get: () => null,
      set: () => {
        throw new Error('QuotaExceededError');
      },
      remove: () => {},
    };
    const onError = vi.fn(() => {
      throw new Error('logger also failed');
    });
    r = run(new Date('2026-05-10T05:00:00Z'), () => base(), throwing, onError);
    r.scheduler.start();
    r.clock.advanceBy(24 * H);
    expect(r.azans()).toHaveLength(5);
  });

  it('cycle 2 I6: an error that cannot be printed is still reported', () => {
    const unprintable = Object.assign(new Error('x'), {
      toString(): string {
        throw new Error('cannot print');
      },
    }); // String() throws on it
    let thrown = false;
    const settings = () => {
      if (!thrown) {
        thrown = true;
        throw unprintable;
      }
      return base();
    };
    r = run(new Date('2026-05-10T05:00:00Z'), settings);
    r.scheduler.start();
    r.clock.advanceBy(2 * SEC);
    expect(r.onError).toHaveBeenCalledWith('scheduler tick failed', unprintable);
  });

  it('keeps at most 20 distinct reported faults in memory', () => {
    let n = 0;
    const settings = () => {
      n++;
      if (n <= 25) throw new Error(`fault ${n}`);
      return base();
    };
    r = run(new Date('2026-05-10T05:00:00Z'), settings);
    r.scheduler.start();
    r.clock.advanceBy(30 * SEC);
    expect(r.onError).toHaveBeenCalledTimes(25);
  });

  it('bounds the retry bookkeeping over a week of failing deliveries', () => {
    const clock = new FakeClock(new Date('2026-05-10T05:00:00Z'));
    const keys = new Set<string>();
    const s = createScheduler({
      clock,
      store: new MemoryStore(),
      getSettings: () => base(),
      onEvent: (e) => {
        if (e.type !== 'azan') return;
        keys.add(e.key);
        throw new Error('always');
      },
    });
    s.start();
    clock.advanceBy(7 * 24 * H);
    s.stop();
    clock.dispose();
    expect(keys.size).toBe(35);
  }, 30_000);

  it('cycle 2 I1: a failed computation is retried instead of keeping stale times', () => {
    let fail = true;
    const s = base();
    const settings = () => {
      if (fail) return { ...s, calc: { ...s.calc, offsets: { ...s.calc.offsets, dhuhr: 45 } } };
      return s;
    };
    r = run(new Date('2026-05-10T15:00:00Z'), settings);
    r.scheduler.start();
    expect(r.scheduler.days()).toBeNull();
    fail = false;
    r.clock.advanceBy(SEC);
    expect(r.scheduler.days()?.today.dateKey).toBe('2026-05-10');
  });

  it('cycle 2 I2: a store whose reads throw does not stop the scheduler', () => {
    const store: KeyValueStore = {
      get: () => {
        throw new Error('SecurityError');
      },
      set: () => {},
      remove: () => {},
    };
    r = run(new Date('2026-05-10T05:00:00Z'), () => base(), store);
    r.scheduler.start();
    r.clock.advanceBy(24 * H);
    expect(r.azans()).toHaveLength(5);
  });

  it('cycle 2 I4: no pre-alert or health check for an azan that already played', () => {
    const asr = computeDay('2026-05-10', SCHAUMBURG, defaultSettings.calc).asr;
    const store = new MemoryStore({ [KEYS.lastFired]: JSON.stringify(['2026-05-10:asr']) });
    r = run(plus(asr, -20 * MIN), () => base(), store);
    r.scheduler.start();
    r.clock.advanceBy(25 * MIN);
    const asrEvents = r.events.filter((e) => 'key' in e && e.key === '2026-05-10:asr');
    expect(asrEvents).toEqual([]);
  });

  it('cycle 2 I5: a second instance on the same store does not replay what the first fired', () => {
    const store = new MemoryStore();
    const dhuhr = computeDay('2026-05-10', SCHAUMBURG, defaultSettings.calc).dhuhr;
    r = run(plus(dhuhr, -MIN), () => base(), store);
    const events2: SchedulerEvent[] = [];
    const second = createScheduler({
      clock: r.clock,
      store,
      getSettings: () => base(),
      onEvent: (e) => events2.push(e),
    });
    second.start(); // read the store before the first fired anything
    r.scheduler.start();
    r.clock.advanceBy(3 * MIN);
    second.stop();
    const all = [...r.azans(), ...events2.filter((e) => e.type === 'azan')];
    expect(all).toHaveLength(1);
  });

  it('#6 an onTick handler that throws does not stop the loop', () => {
    const clock = new FakeClock(new Date('2026-05-10T05:00:00Z'));
    const onError = vi.fn();
    const azans: string[] = [];
    const s = createScheduler({
      clock,
      store: new MemoryStore(),
      getSettings: () => base(),
      onEvent: (e) => e.type === 'azan' && azans.push(e.key),
      onTick: () => {
        throw new Error('render failed');
      },
      onError,
    });
    s.start();
    clock.advanceBy(24 * H);
    s.stop();
    clock.dispose();
    expect(azans).toHaveLength(5);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('#8 lead-time events reach every prayer within the lead, not only the earliest', () => {
    const d = daysAround('2026-05-10');
    const ups = getUpcoming({
      now: plus(d.today.asr, -6 * H),
      days: d,
      enabled: ALL_ON,
      leadMs: 7 * H,
    });
    expect(ups.map((u) => u.prayer)).toEqual(['dhuhr', 'asr']);
  });

  it('#9 recomputes when location or calc settings change, even without refresh()', () => {
    let s = base();
    r = run(new Date('2026-05-10T15:00:00Z'), () => s);
    r.scheduler.start();
    const before = r.scheduler.days()!.today.dhuhr.getTime();
    s = base({ calc: { ...s.calc, offsets: { ...s.calc.offsets, dhuhr: 5 } } });
    r.clock.advanceBy(SEC);
    expect(r.scheduler.days()!.today.dhuhr.getTime() - before).toBe(5 * MIN);
  });

  it('#12 going idle reports days: null', () => {
    let s = base();
    r = run(new Date('2026-05-10T15:00:00Z'), () => s);
    r.scheduler.start();
    s = base({ location: null });
    r.clock.advanceBy(SEC);
    expect(r.events.at(-1)).toMatchObject({ type: 'day', days: null });
    expect(r.scheduler.days()).toBeNull();
  });

  it('#15 refresh() decides immediately instead of waiting for the next tick', () => {
    const d = computeDay('2026-05-10', SCHAUMBURG, defaultSettings.calc);
    r = run(plus(d.dhuhr, -500), () => base());
    r.scheduler.start();
    r.scheduler.stop(); // frozen timers while the iPad sleeps
    r.clock.advanceBy(1000);
    r.scheduler.refresh(); // visibilitychange on wake
    expect(r.azans().map((e) => e.prayer)).toEqual(['dhuhr']);
  });

  it('reports no last fired azan before any has fired', () => {
    r = run(new Date('2026-05-10T05:00:00Z'), () => base());
    expect(r.scheduler.lastFired()).toBeNull();
  });

  it('keeps the fired list bounded and accepts the legacy single-key format', () => {
    const legacy = new MemoryStore({ [KEYS.lastFired]: '2026-05-10:fajr' });
    r = run(new Date('2026-05-10T05:00:00Z'), () => base(), legacy);
    r.scheduler.start();
    r.clock.advanceBy(7 * 24 * H);
    const fired = JSON.parse(legacy.get(KEYS.lastFired)!) as Array<{ key: string }>;
    expect(r.azans().map((e) => e.key)).not.toContain('2026-05-10:fajr');
    expect(fired).toHaveLength(32);
    expect(fired.at(-1)!.key).toBe('2026-05-16:isha');
    expect(r.scheduler.lastFired()).toBe('2026-05-16:isha');
  }, 30_000);
});
