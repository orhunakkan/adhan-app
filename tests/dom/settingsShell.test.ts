import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { segmented, select, stepper, toggle } from '../../src/ui/settings/controls';
import { setMediaQuery } from '../helpers/matchMedia';
import { mountApp, type Mounted } from '../helpers/mountApp';

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const START = new Date('2026-05-10T17:00:00Z');

function openSettings() {
  q('.settings-button')!.click();
}

describe('settings shell', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('one tap on the gear button opens it', () => {
    m = mountApp({ start: START });
    expect(q('.settings')).toBeNull();
    openSettings();
    expect(q('.settings')!.getAttribute('role')).toBe('dialog');
    expect(q('.settings')!.getAttribute('aria-modal')).toBe('true');
    expect(m.root.querySelector<HTMLElement>('.app-main')!.inert).toBe(true);
  });

  it('shows the sections and the active pane; Close and Escape close it', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart(); // otherwise the start overlay keeps the main screen inert
    openSettings();
    const sections = [...document.querySelectorAll<HTMLElement>('.settings__section')];
    expect(sections.map((s) => s.dataset.section)).toEqual([
      'location',
      'calculation',
      'azan',
      'display',
      'about',
    ]);
    expect(sections[0]!.getAttribute('aria-current')).toBe('page');
    expect(sections.every((s) => s.classList.contains('touch-target'))).toBe(true);
    expect(q('.settings__pane')!.dataset.section).toBe('location');
    q('.settings')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.settings')).toBeNull();
    expect(m.root.querySelector<HTMLElement>('.app-main')!.inert).toBe(false);
    openSettings();
    [...document.querySelectorAll<HTMLButtonElement>('.settings__header button')].at(-1)!.click();
    expect(q('.settings-layer')!.hidden).toBe(true);
  });

  it('PIN gate: a wrong PIN is rejected, the right one opens the sheet', () => {
    m = mountApp({ start: START, settings: { pin: '4821' } });
    openSettings();
    expect(q('.settings')).toBeNull();
    const key = (d: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('.pin__key')]
        .find((b) => b.textContent === d)!
        .click();
    for (const d of '1234') key(d);
    expect(q('.pin__error')!.textContent).toBe('Yanlış PIN');
    expect(q('.pin__dots')!.textContent).toBe('○○○○');
    key('9');
    document.querySelector<HTMLButtonElement>('.pin__key[aria-label="Sil"]')!.click();
    for (const d of '4821') key(d);
    expect(q('.settings')).not.toBeNull();
  });

  it('PIN pad can be closed', () => {
    m = mountApp({ start: START, settings: { pin: '4821' } });
    openSettings();
    q('.pin .pill-button')!.click();
    expect(q('.pin')).toBeNull();
  });

  it('drills down in portrait and goes back', () => {
    setMediaQuery('(orientation: portrait)', true);
    m = mountApp({ start: START });
    openSettings();
    expect(q('.settings')!.classList.contains('settings--portrait')).toBe(true);
    expect(q('.settings__back')!.hidden).toBe(true);
    q('.settings__section')!.click();
    expect(q('.settings')!.classList.contains('settings--drilled')).toBe(true);
    q('.settings__back')!.click();
    expect(q('.settings')!.classList.contains('settings--drilled')).toBe(false);
  });

  it('re-renders on rotation while open', () => {
    m = mountApp({ start: START });
    openSettings();
    setMediaQuery('(orientation: portrait)', true);
    expect(q('.settings')!.classList.contains('settings--portrait')).toBe(true);
  });
});

describe('settings controls', () => {
  it('toggle is a labelled switch with a 48 px target', () => {
    const onChange = vi.fn();
    const row = toggle('Saniyeler', false, onChange);
    document.body.append(row);
    const sw = row.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(document.getElementById(sw.getAttribute('aria-labelledby')!)!.textContent).toBe(
      'Saniyeler',
    );
    expect(sw.classList.contains('touch-target')).toBe(true);
    sw.click();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('segmented is a radiogroup', () => {
    const onChange = vi.fn();
    const row = segmented(
      'Tema',
      [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      'a',
      onChange,
    );
    const radios = [...row.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    radios[1]!.click();
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('stepper clamps to its range and disables at the ends', () => {
    const onChange = vi.fn();
    const row = stepper('Öğle', 30, { min: -30, max: 30, format: (v) => `${v} dk` }, onChange);
    const [minus, plus] = row.querySelectorAll<HTMLButtonElement>('.stepper__button');
    expect(row.querySelector('output')!.textContent).toBe('30 dk');
    expect(plus!.disabled).toBe(true);
    expect(plus!.getAttribute('aria-label')).toBe('Öğle +');
    minus!.click();
    expect(onChange).toHaveBeenCalledWith(29);
    const low = stepper('x', -30, { min: -30, max: 30 }, onChange);
    expect(low.querySelector<HTMLButtonElement>('.stepper__button')!.disabled).toBe(true);
    low.querySelectorAll<HTMLButtonElement>('.stepper__button')[1]!.click();
    expect(onChange).toHaveBeenLastCalledWith(-29);
  });

  it('select reports the chosen value', () => {
    const onChange = vi.fn();
    const row = select(
      'Yöntem',
      [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      'b',
      onChange,
    );
    const s = row.querySelector('select')!;
    expect(s.value).toBe('b');
    s.value = 'a';
    s.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

describe('settings button', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());
  const lang = (language: 'tr' | 'en' | 'ar') => ({
    display: { ...defaultSettings.display, language },
  });

  it.each([
    ['tr', 'Ayarlar'],
    ['ar', 'الإعدادات'],
  ] as const)('is a gear button named in %s; one click opens Settings', (language, name) => {
    m = mountApp({ start: START, settings: lang(language) });
    const button = q('.settings-button')!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.classList.contains('touch-target')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe(name);
    expect(button.querySelector('svg.icon')!.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('.settings-hotspot')).toHaveLength(0);
    button.click();
    expect(q('.settings')!.getAttribute('aria-labelledby')).toBe('settings-title');
    expect(q('.settings__title')!.textContent).toBe(name);
  });

  it('follows a language change', () => {
    m = mountApp({ start: START });
    expect(q('.settings-button')!.getAttribute('aria-label')).toBe('Ayarlar');
    m.app.updateSettings(lang('ar'));
    expect(q('.settings-button')!.getAttribute('aria-label')).toBe('الإعدادات');
    m.app.updateSettings(lang('en'));
    expect(q('.settings-button')!.getAttribute('aria-label')).toBe('Settings');
  });

  it('with a PIN set, a click shows the PIN pad instead of the sheet', () => {
    m = mountApp({ start: START, settings: { pin: '4821' } });
    openSettings();
    expect(q('.pin')!.getAttribute('role')).toBe('dialog');
    expect(q('.settings')).toBeNull();
  });
});
