import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { LONG_PRESS_MS } from '../../src/ui/settings/shell';
import { SCHAUMBURG } from '../helpers/days';
import { MemoryStore } from '../helpers/memoryStore';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const value = (key: string) => q(`[data-debug="${key}"] .debug__value`).textContent;
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);

function openDebug(m: Mounted) {
  q('.settings-hotspot').dispatchEvent(new Event('pointerdown'));
  m.clock.advanceBy(LONG_PRESS_MS);
  [...document.querySelectorAll<HTMLElement>('.settings__section')]
    .find((b) => b.dataset.section === 'about')!
    .click();
  q('[data-key="debug"]').click();
}

describe('debug panel', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('is hidden from the sidebar and opened from About', () => {
    m = mountApp({ start: t.asr });
    q('.settings-hotspot').dispatchEvent(new Event('pointerdown'));
    m.clock.advanceBy(LONG_PRESS_MS);
    expect(
      [...document.querySelectorAll<HTMLElement>('.settings__section')].map(
        (b) => b.dataset.section,
      ),
    ).not.toContain('debug');
    [...document.querySelectorAll<HTMLElement>('.settings__section')]
      .find((b) => b.dataset.section === 'about')!
      .click();
    q('[data-key="debug"]').click();
    expect(q('.settings__title').textContent).toBe('Tanılama');
  });

  it('shows version, SW, wake lock, audio, health check, last azan, reloads, storage, period and the log', async () => {
    // A first page load, then a reload on the same storage.
    const first = mountApp({ start: new Date(t.asr.getTime() - 4 * 60_000) });
    const store = first.store;
    first.dispose();
    m = mountApp({ start: new Date(t.asr.getTime() - 4 * 60_000), store });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(t.asr.getTime() + 1000));
    await flush();
    await m.blobs.set('x', new Blob(['1234']));
    openDebug(m);
    await flush();
    expect(value('version')).toMatch(/^v\d/);
    expect(value('debug.sw')).toBe('unsupported');
    expect(value('debug.wakeLock')).toBe('unsupported');
    expect(value('debug.audio')).toBe('playing · azan');
    expect(value('debug.health')).toMatch(/^OK · 2026-05-10T/);
    expect(value('debug.lastFired')).toBe('2026-05-10:asr');
    expect(value('debug.reloads')).toBe('1');
    expect(value('about.storage')).toBe('4 B');
    expect(value('debug.period')).toBe('asr / midnight');
    const log = q('.debug__log').textContent;
    expect(log.split('\n')[0]).toMatch(/INFO azan \{"key":"2026-05-10:asr"\}/);
    expect(log).toContain('app started');
  });

  it('shows dashes before anything happened', () => {
    m = mountApp({ start: new Date(t.asr.getTime() - 30 * 60_000) });
    openDebug(m);
    expect(value('debug.health')).toBe('—');
    expect(value('debug.lastFired')).toBe('—');
    expect(value('debug.reloads')).toBe('0');
  });

  it('reports a waiting update', () => {
    let waiting: (() => void) | null = null;
    m = mountApp({
      start: t.asr,
      serviceWorker: { register: (fn) => (waiting = fn), applyUpdate: () => {} },
    });
    waiting!();
    openDebug(m);
    expect(value('debug.sw')).toBe('update waiting');
  });

  it('treats a corrupt reload counter as zero', () => {
    m = mountApp({ start: t.asr, store: new MemoryStore({ 'adhan.reloads': 'abc' }) });
    expect(m.app.debug().reloads).toBe(0);
    expect(m.store.get('adhan.reloads')).toBe('1');
  });
});
