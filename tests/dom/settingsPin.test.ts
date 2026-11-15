import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import {
  LONG_PRESS_MS,
  PIN_LOCKOUT_MS,
  PIN_MAX_TRIES,
  SETTINGS_IDLE_MS,
} from '../../src/ui/settings/shell';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const START = new Date('2026-05-10T17:00:00Z');

function openSettings(m: Mounted) {
  q('.settings-hotspot')!.dispatchEvent(new Event('pointerdown'));
  m.clock.advanceBy(LONG_PRESS_MS);
}
function openAbout(m: Mounted) {
  openSettings(m);
  qa('.settings__section')
    .find((b) => b.dataset.section === 'about')!
    .click();
}
const key = (d: string) =>
  qa('.pin__key')
    .find((b) => b.textContent === d)!
    .click();

describe('settings PIN', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('can be set from About (entered twice), then gates the sheet, and removed', () => {
    m = mountApp({ start: START });
    openAbout(m);
    const pin = (k: string) => q(`[data-key="${k}"]`) as HTMLInputElement;
    pin('pin-new').value = '1234';
    pin('pin-repeat').value = '1243';
    q('[data-key="pin-save"]')!.click();
    expect(m.app.state().settings.pin).toBeNull();
    expect(q('.toast')!.textContent).toBe("PIN'ler eşleşmiyor veya 4 rakam değil");
    pin('pin-new').value = '1234';
    pin('pin-repeat').value = '1234';
    q('[data-key="pin-save"]')!.click();
    expect(m.app.state().settings.pin).toBe('1234');
    expect(JSON.parse(m.store.get('adhan.settings')!).pin).toBe('1234');

    q('.settings')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    openSettings(m);
    expect(q('.pin')).not.toBeNull();
    for (const d of '1234') key(d);
    qa('.settings__section')
      .find((b) => b.dataset.section === 'about')!
      .click();
    q('[data-key="pin-remove"]')!.click();
    expect(m.app.state().settings.pin).toBeNull();
  });

  it(`locks the pad for ${PIN_LOCKOUT_MS / 1000} s after ${PIN_MAX_TRIES} wrong PINs`, () => {
    m = mountApp({ start: START, settings: { pin: '4821' } });
    openSettings(m);
    for (let i = 0; i < PIN_MAX_TRIES; i++) for (const d of '0000') key(d);
    expect(q('.pin__error')!.textContent).toBe('Çok fazla deneme; 30 sn bekleyin');
    for (const d of '4821') key(d); // the right PIN is ignored while locked
    expect(q('.settings')).toBeNull();
    m.clock.advanceBy(PIN_LOCKOUT_MS);
    for (const d of '4821') key(d);
    expect(q('.settings')).not.toBeNull();
  });

  it('closes and re-locks after 2 minutes without a touch', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart(); // otherwise the start overlay keeps the main screen inert
    openSettings(m);
    m.clock.advanceBy(SETTINGS_IDLE_MS - 1000);
    q('.settings')!.dispatchEvent(new Event('pointerdown', { bubbles: true })); // activity
    m.clock.advanceBy(SETTINGS_IDLE_MS - 1000);
    expect(q('.settings')).not.toBeNull();
    m.clock.advanceBy(2000);
    expect(q('.settings')).toBeNull();
    expect(m.root.querySelector<HTMLElement>('.app-main')!.inert).toBe(false);
  });

  it('closes when an azan starts, so the azan screen and Stop are reachable', async () => {
    const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
    const t = computeDay('2026-05-10', SCHAUMBURG, calc);
    m = mountApp({ start: new Date(t.asr.getTime() - 30_000) });
    await m.app.tapStart();
    openSettings(m);
    expect(q('.settings')).not.toBeNull();
    await m.clock.advanceToAsync(new Date(t.asr.getTime() + 1000));
    await flush();
    expect(q('.settings')).toBeNull();
    expect(q('.azan')!.classList.contains('azan--visible')).toBe(true);
  });

  it('About offers Apply update while one is waiting', () => {
    let applied = 0;
    let waiting: (() => void) | null = null;
    m = mountApp({
      start: new Date('2026-05-10T19:00:00Z'),
      serviceWorker: {
        register: (fn) => (waiting = fn),
        applyUpdate: () => applied++,
        checkForUpdate: () => {},
      },
    });
    waiting!();
    openAbout(m);
    q('[data-key="apply-update"]')!.click();
    expect(applied).toBe(1);
  });
});
