// First setup: with no location, a visible button opens Settings at Location.
// Before, only the hidden 3-second corner hold reached Settings, and on the
// first run nothing on screen could be clicked.
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const START = new Date('2026-05-10T17:00:00Z');

describe('Set location button', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows without a location and opens Settings straight at Location', async () => {
    m = mountApp({ start: START, settings: { location: null } });
    await m.app.tapStart();
    const button = q('.clock__set-location')!;
    expect(button.hidden).toBe(false);
    expect(button.tagName).toBe('BUTTON');
    expect(button.classList.contains('touch-target')).toBe(true);
    expect(button.textContent).toBe('Konum seç');
    button.click();
    expect(q('.settings')).not.toBeNull();
    expect(q('.settings__pane')!.dataset.section).toBe('location');
  });

  it('asks for the PIN first when one is set, then shows Location', async () => {
    m = mountApp({ start: START, settings: { location: null, pin: '4821' } });
    await m.app.tapStart();
    q('.clock__set-location')!.click();
    expect(q('.pin')).not.toBeNull();
    for (const d of '4821') {
      [...document.querySelectorAll<HTMLElement>('.pin__key')]
        .find((k) => k.textContent === d)!
        .click();
    }
    expect(q('.settings__pane')!.dataset.section).toBe('location');
  });

  it('is hidden once a location is set, and follows the language', async () => {
    m = mountApp({
      start: START,
      settings: { location: null, display: { ...defaultSettings.display, language: 'en' } },
    });
    await m.app.tapStart();
    expect(q('.clock__set-location')!.textContent).toBe('Set location');
    m.app.updateSettings({ location: SCHAUMBURG });
    m.clock.advanceBy(1000);
    expect(q('.clock__set-location')!.hidden).toBe(true);
  });
});
