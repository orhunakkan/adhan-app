import { afterEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS } from '../../src/ui/settings/shell';
import { segmented, select, stepper, toggle } from '../../src/ui/settings/controls';
import { setMediaQuery } from '../helpers/matchMedia';
import { mountApp, type Mounted } from '../helpers/mountApp';

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const START = new Date('2026-05-10T17:00:00Z');

function longPress(m: Mounted, ms = LONG_PRESS_MS) {
  const hot = q('.settings-hotspot')!;
  hot.dispatchEvent(new Event('pointerdown'));
  m.clock.advanceBy(ms);
  hot.dispatchEvent(new Event('pointerup'));
}

describe('settings shell', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('opens only after a 3 s long-press on the corner', () => {
    m = mountApp({ start: START });
    expect(q('.settings-hotspot')!.getAttribute('aria-label')).toBe('Ayarlar');
    longPress(m, LONG_PRESS_MS - 1);
    expect(q('.settings')).toBeNull();
    longPress(m);
    expect(q('.settings')!.getAttribute('role')).toBe('dialog');
    expect(q('.settings')!.getAttribute('aria-modal')).toBe('true');
    expect(m.root.querySelector<HTMLElement>('.app-main')!.inert).toBe(true);
  });

  it('a press released early (or cancelled) does not open', () => {
    m = mountApp({ start: START });
    const hot = q('.settings-hotspot')!;
    hot.dispatchEvent(new Event('pointerdown'));
    m.clock.advanceBy(1000);
    hot.dispatchEvent(new Event('pointerleave'));
    m.clock.advanceBy(5000);
    expect(q('.settings')).toBeNull();
  });

  it('shows the sections and the active pane; Close and Escape close it', () => {
    m = mountApp({ start: START });
    longPress(m);
    const sections = [...document.querySelectorAll<HTMLElement>('.settings__section')];
    expect(sections.map((s) => s.dataset.section)).toEqual([
      'location',
      'calculation',
      'azan',
      'display',
      'photos',
      'about',
    ]);
    expect(sections[0]!.getAttribute('aria-current')).toBe('page');
    expect(sections.every((s) => s.classList.contains('touch-target'))).toBe(true);
    expect(q('.settings__pane')!.dataset.section).toBe('location');
    q('.settings')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.settings')).toBeNull();
    expect(m.root.querySelector<HTMLElement>('.app-main')!.inert).toBe(false);
    longPress(m);
    [...document.querySelectorAll<HTMLButtonElement>('.settings__header button')].at(-1)!.click();
    expect(q('.settings-layer')!.hidden).toBe(true);
  });

  it('PIN gate: a wrong PIN is rejected, the right one opens the sheet', () => {
    m = mountApp({ start: START, settings: { pin: '4821' } });
    longPress(m);
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
    longPress(m);
    q('.pin .pill-button')!.click();
    expect(q('.pin')).toBeNull();
  });

  it('drills down in portrait and goes back', () => {
    setMediaQuery('(orientation: portrait)', true);
    m = mountApp({ start: START });
    longPress(m);
    expect(q('.settings')!.classList.contains('settings--portrait')).toBe(true);
    expect(q('.settings__back')!.hidden).toBe(true);
    q('.settings__section')!.click();
    expect(q('.settings')!.classList.contains('settings--drilled')).toBe(true);
    q('.settings__back')!.click();
    expect(q('.settings')!.classList.contains('settings--drilled')).toBe(false);
  });

  it('re-renders on rotation while open', () => {
    m = mountApp({ start: START });
    longPress(m);
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
