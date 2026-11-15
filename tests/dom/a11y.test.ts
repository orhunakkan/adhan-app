// Accessibility smoke sweep across the mounted app (brief §13.6): every
// reachable control has a name, is a real button/select/input with the
// touch-target class, live regions are set, and open modals trap focus with
// everything else inert.
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { LONG_PRESS_MS } from '../../src/ui/settings/shell';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);

const unreachable = (el: Element) =>
  Boolean(el.closest('[hidden], [inert], [aria-hidden="true"]')) || (el as HTMLElement).hidden;

function accessibleName(el: HTMLElement): string {
  const by = el.getAttribute('aria-labelledby');
  if (by)
    return by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();
  const wrap = el.closest('label');
  if (wrap) return wrap.textContent.trim();
  return el.textContent.trim();
}

const CONTROLS =
  'button, select, input, [role="switch"], [role="radio"], [role="option"], [role="progressbar"], [tabindex]';

function sweep(state: string) {
  const controls = qa(CONTROLS).filter((el) => !unreachable(el));
  expect(controls.length, state).toBeGreaterThan(0);
  for (const el of controls) {
    const where = `${state}: <${el.tagName.toLowerCase()} class="${el.className}">`;
    expect(accessibleName(el), where).not.toBe('');
    if (el.getAttribute('role') === 'progressbar') continue;
    expect(['BUTTON', 'SELECT', 'INPUT'], where).toContain(el.tagName);
    expect(el.classList.contains('touch-target'), `${where} touch target`).toBe(true);
  }
}

function expectTrapped(dialog: HTMLElement, state: string) {
  const items = [...dialog.querySelectorAll<HTMLElement>('button, select, input')].filter(
    (e) => !unreachable(e),
  );
  const first = items[0]!;
  const last = items.at(-1)!;
  last.focus();
  last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(document.activeElement, `${state}: Tab from last wraps to first`).toBe(first);
  first.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
  );
  expect(document.activeElement, `${state}: Shift+Tab from first wraps to last`).toBe(last);
  const layer = dialog.closest('.overlay-layer, .settings-layer')!;
  for (const sibling of [...document.getElementById('app')!.children] as HTMLElement[]) {
    if (sibling !== layer) expect(sibling.inert, `${state}: ${sibling.className} inert`).toBe(true);
  }
}

function openSettings(m: Mounted) {
  q('.settings-hotspot')!.dispatchEvent(new Event('pointerdown'));
  m.clock.advanceBy(LONG_PRESS_MS);
}

describe.each(['tr', 'ar'] as const)('accessibility sweep (%s)', (language) => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());
  const settings = { display: { ...defaultSettings.display, language } };

  it('start overlay: named, polite, focus trapped, rest inert', async () => {
    m = mountApp({ start: new Date(t.dhuhr.getTime() - 3600_000), settings });
    await flush(); // views mounted after the overlay opened are made inert by an observer
    sweep('start overlay');
    expect(q('.overlay')!.getAttribute('aria-live')).toBe('polite');
    expectTrapped(q('.overlay')!, 'start overlay');
  });

  it('main screen, pre-alert and the update toast', async () => {
    let waiting: (() => void) | null = null;
    m = mountApp({
      start: new Date(t.asr.getTime() - 9 * 60_000),
      settings,
      serviceWorker: {
        register: (fn) => (waiting = fn),
        applyUpdate: () => {},
        checkForUpdate: () => {},
      },
    });
    await m.app.tapStart();
    waiting!();
    sweep('main screen');
    expect(q('.prealert')!.getAttribute('aria-live')).toBe('polite');
    expect(q('.toast-region')!.getAttribute('aria-live')).toBe('polite');
    expect(q('.settings-hotspot')!.getAttribute('aria-label')).toBe(
      language === 'tr' ? 'Ayarlar' : 'الإعدادات',
    );
  });

  it('danger overlay: assertive, focus trapped', async () => {
    m = mountApp({ start: new Date(t.dhuhr.getTime() - 4 * 60_000), settings });
    await m.app.tapStart();
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceByAsync(61_000);
    await flush();
    expect(q('.overlay--danger')!.getAttribute('aria-live')).toBe('assertive');
    sweep('danger overlay');
    expectTrapped(q('.overlay--danger')!, 'danger overlay');
  });

  it('azan screen and the Resume bar', async () => {
    m = mountApp({ start: new Date(t.maghrib.getTime() - 60_000), settings });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(t.maghrib.getTime() + 1000));
    await flush();
    sweep('azan screen');
    expect(accessibleName(q('.azan__progress')!)).not.toBe('');
    m.player!.interrupt();
    expect(q('.resume-bar')!.getAttribute('aria-live')).toBe('polite');
    sweep('resume bar');
  });

  it('PIN pad: named keys, focus trapped, rest inert', () => {
    m = mountApp({ start: t.asr, settings: { ...settings, pin: '4821' } });
    openSettings(m);
    sweep('PIN pad');
    expectTrapped(q('.pin')!, 'PIN pad');
  });

  it('every settings section, including Diagnostics', async () => {
    m = mountApp({ start: t.asr, settings });
    openSettings(m);
    expectTrapped(q('.settings')!, 'settings');
    for (const id of ['location', 'calculation', 'azan', 'display', 'photos', 'about']) {
      qa('.settings__section')
        .find((b) => b.dataset.section === id)!
        .click();
      await flush();
      sweep(`settings › ${id}`);
    }
    q('[data-key="debug"]')!.click();
    sweep('settings › debug');
  });
});

describe('stacked modals', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('a modal opened over Settings is the only reachable layer; closing Settings keeps the earlier modal', async () => {
    m = mountApp({ start: new Date(t.dhuhr.getTime() - 3600_000) });
    await flush();
    openSettings(m); // e.g. the owner opened Settings, then the start overlay is still up
    const settingsLayer = q('.settings')!.closest<HTMLElement>('.settings-layer')!;
    const overlayLayer = q('.overlay')!.closest<HTMLElement>('.overlay-layer')!;
    expect(overlayLayer.inert).toBe(true);
    expect(settingsLayer.inert).toBe(false);
    q('.settings')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(overlayLayer.inert).toBe(false);
    expect(q('.app-main')!.inert).toBe(true);
    expect(q('.settings-hotspot')!.inert).toBe(true);
    await m.app.tapStart();
    expect(q('.app-main')!.inert).toBe(false);
    expect(q('.settings-hotspot')!.inert).toBe(false);
  });
});
