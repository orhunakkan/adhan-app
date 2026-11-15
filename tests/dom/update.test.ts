import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import type { ServiceWorkerPort } from '../../src/core/ports';
import { computeDay } from '../../src/core/prayerTimes';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);

class FakeSw implements ServiceWorkerPort {
  waiting: (() => void) | null = null;
  applied = 0;
  register(onWaiting: () => void) {
    this.waiting = onWaiting;
  }
  applyUpdate() {
    this.applied++;
  }
}

describe('service worker update flow', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows "Update available" with an Apply action when a worker is waiting', () => {
    const sw = new FakeSw();
    m = mountApp({ start: new Date(t.dhuhr.getTime() + 60 * 60_000), serviceWorker: sw });
    expect(q('.toast')).toBeNull();
    sw.waiting!();
    expect(m.app.state().updateAvailable).toBe(true);
    expect(q('.toast__text')!.textContent).toBe('Güncelleme hazır');
    q('.toast__action')!.click();
    expect(sw.applied).toBe(1);
  });

  it('blocks applying within 5 minutes of a prayer and offers it again later', () => {
    const sw = new FakeSw();
    m = mountApp({ start: new Date(t.asr.getTime() - 3 * 60_000), serviceWorker: sw });
    sw.waiting!();
    q('.toast__action')!.click();
    expect(sw.applied).toBe(0);
    expect(q('.toast__text')!.textContent).toMatch(
      /^Ezan vakti yakın; \d\d:\d\d sonrasında uygulayın$/,
    );
    m.clock.advanceBy(10_000);
    expect(q('.toast__text')!.textContent).toBe('Güncelleme hazır');
    m.clock.advanceTo(new Date(t.asr.getTime() + 3 * 60_000));
    q('.toast__action')!.click();
    expect(sw.applied).toBe(1);
  });

  it('blocks applying while an azan is playing', async () => {
    const sw = new FakeSw();
    m = mountApp({ start: new Date(t.maghrib.getTime() - 60_000), serviceWorker: sw });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(t.maghrib.getTime() + 4 * 60_000));
    await flush();
    expect(m.app.state().azan).not.toBeNull();
    sw.waiting!();
    m.app.applyUpdate();
    expect(sw.applied).toBe(0);
  });

  it('does nothing without a waiting worker, and applies without times (no location)', () => {
    const sw = new FakeSw();
    m = mountApp({ start: t.asr, serviceWorker: sw, location: null });
    m.app.applyUpdate();
    expect(sw.applied).toBe(0);
    sw.waiting!();
    m.app.applyUpdate();
    expect(sw.applied).toBe(1);
  });
});
