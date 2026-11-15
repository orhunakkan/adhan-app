import { afterEach, describe, expect, it } from 'vitest';
import { computeDay } from '../../src/core/prayerTimes';
import { MemoryStore } from '../helpers/memoryStore';
import { mountApp, type Mounted } from '../helpers/mountApp';
import { SCHAUMBURG } from '../helpers/days';

describe('createApp (mountApp harness)', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('computes days and the current period on start', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') }); // 12:00 CDT
    const s = m.app.state();
    expect(s.days?.today.dateKey).toBe('2026-05-10');
    expect(s.period?.period).toBe('sunrise'); // before Dhuhr
    expect(s.now.toISOString()).toBe('2026-05-10T17:00:00.000Z');
  });

  it('dispatches the azan action when a prayer time arrives', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    const dhuhr = computeDay('2026-05-10', SCHAUMBURG, m.app.state().settings.calc).dhuhr;
    m.clock.advanceTo(new Date(dhuhr.getTime() + 1000));
    expect(m.app.state().azan).toMatchObject({ prayer: 'dhuhr', key: '2026-05-10:dhuhr' });
    expect(m.app.state().period?.period).toBe('dhuhr');
  });

  it('updates now and the period every second', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    m.clock.advanceBy(5000);
    expect(m.app.state().now.toISOString()).toBe('2026-05-10T17:00:05.000Z');
  });

  it('recalculates at local midnight', () => {
    m = mountApp({ start: new Date('2026-05-11T04:59:00Z') }); // 23:59 CDT
    expect(m.app.state().days?.today.dateKey).toBe('2026-05-10');
    m.clock.advanceBy(2 * 60_000);
    expect(m.app.state().days?.today.dateKey).toBe('2026-05-11');
  });

  it('persists a settings change and recalculates immediately', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    const before = m.app.state().days!.today.dhuhr.getTime();
    const calc = m.app.state().settings.calc;
    m.app.updateSettings({ calc: { ...calc, offsets: { ...calc.offsets, dhuhr: 7 } } });
    expect(m.app.state().days!.today.dhuhr.getTime() - before).toBe(7 * 60_000);
    expect(JSON.parse(m.store.get('adhan.settings')!).calc.offsets.dhuhr).toBe(7);
  });

  it('rejects an invalid settings change and keeps the old settings', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    const before = m.app.state().settings;
    expect(() => m!.app.updateSettings({ pin: '1' })).toThrow();
    expect(m.app.state().settings).toBe(before);
  });

  it('recalculates when the page becomes visible again', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    const days = m.app.state().days;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(m.app.state().days).not.toBe(days);
    expect(m.app.state().days?.today.dateKey).toBe('2026-05-10');
  });

  it('notifies subscribers and stops them on unsubscribe', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    let calls = 0;
    const off = m.app.subscribe(() => calls++);
    m.clock.advanceBy(1000);
    off();
    m.clock.advanceBy(3000);
    expect(calls).toBe(1);
  });

  it('stays idle without a location and asks for one', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z'), location: null });
    expect(m.app.state().days).toBeNull();
    expect(m.app.state().period).toBeNull();
    expect(m.app.state().needsLocation).toBe(true);
  });

  it('ends the azan moment on request', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    const dhuhr = computeDay('2026-05-10', SCHAUMBURG, m.app.state().settings.calc).dhuhr;
    m.clock.advanceTo(new Date(dhuhr.getTime() + 1000));
    m.app.stopAzan();
    expect(m.app.state().azan).toBeNull();
  });

  it('goes idle when the location is cleared', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    m.app.updateSettings({ location: null });
    expect(m.app.state()).toMatchObject({ days: null, period: null, needsLocation: true });
  });

  it('ignores visibilitychange while hidden', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    const days = m.app.state().days;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    expect(m.app.state().days).toBe(days);
  });

  it('starts on defaults and logs a warning when stored settings are corrupt', () => {
    m = mountApp({ store: new MemoryStore({ 'adhan.settings': '{oops' }) });
    expect(m.app.state().needsLocation).toBe(true);
    expect(m.app.log.entries().some((e) => e.level === 'warn' && /Corrupt/.test(e.msg))).toBe(true);
  });

  it('logs scheduler errors (e.g. lastFired cannot be persisted)', () => {
    class FailingStore extends MemoryStore {
      override set(key: string, value: string) {
        if (key === 'adhan.lastFired') throw new Error('QuotaExceededError');
        super.set(key, value);
      }
    }
    const store = new FailingStore();
    const first = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    store.set('adhan.settings', first.store.get('adhan.settings')!);
    first.dispose();
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z'), store });
    const dhuhr = computeDay('2026-05-10', SCHAUMBURG, m.app.state().settings.calc).dhuhr;
    m.clock.advanceTo(new Date(dhuhr.getTime() + 1000));
    expect(m.app.log.entries().some((e) => e.level === 'error' && /persist/.test(e.msg))).toBe(
      true,
    );
  });

  it('applies theme, locale and glass to <html> on start and on change', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    const html = document.documentElement;
    expect(html.dataset.theme).toBe('midnight');
    expect(html.lang).toBe('tr');
    expect(html.style.getPropertyValue('--bg-1')).toBe('#0B1020');
    const display = m.app.state().settings.display;
    m.app.updateSettings({ display: { ...display, theme: 'sand', language: 'ar', glass: true } });
    expect(html.dataset.theme).toBe('sand');
    expect(html.dir).toBe('rtl');
    expect(html.dataset.glass).toBe('');
    m.app.updateSettings({ display: { ...display, glass: false } });
    expect(html.dataset.glass).toBeUndefined();
  });

  it('logs startup to the ring buffer', () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    expect(m.app.log.entries().some((e) => e.msg === 'app started')).toBe(true);
  });
});
