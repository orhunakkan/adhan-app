import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { MAX_AZAN_MS, SILENT_AZAN_MS } from '../../src/app/createApp';
import { SILENCE_URL } from '../../src/core/audio';
import { computeDay } from '../../src/core/prayerTimes';
import { mountApp, type Mounted } from '../helpers/mountApp';
import { OSLO, SCHAUMBURG } from '../helpers/days';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const START = new Date('2026-05-10T17:00:00Z'); // 12:00 CDT, before Dhuhr
const times = (m: Mounted) => computeDay('2026-05-10', SCHAUMBURG, m.app.state().settings.calc);
const overlay = () => document.querySelector<HTMLElement>('.overlay');
const button = () => document.querySelector<HTMLButtonElement>('.overlay button')!;

async function tapStart(m: Mounted) {
  button().click();
  await flush();
  expect(m.app.state().overlay).toBeNull();
}

describe('start overlay and audio unlock', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows "Tap to Start" on launch as a modal dialog, with the app behind it inert', () => {
    m = mountApp({ start: START });
    const o = overlay()!;
    expect(o.getAttribute('role')).toBe('dialog');
    expect(o.getAttribute('aria-modal')).toBe('true');
    expect(o.classList.contains('overlay--danger')).toBe(false);
    expect(button().textContent).toContain('Başlatmak için dokunun');
    expect(button().classList.contains('touch-target')).toBe(true);
    expect(document.activeElement).toBe(button());
    expect(m.root.querySelector<HTMLElement>('.app-main')!.inert).toBe(true);
  });

  it('tapping creates exactly one player, plays the silent clip and hides the overlay', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    expect(m.players).toHaveLength(1);
    expect(m.player!.sources).toEqual([SILENCE_URL]);
    expect(m.app.state().audio.status).toBe('ready');
    expect(overlay()).toBeNull();
    expect(m.root.querySelector<HTMLElement>('.app-main')!.inert).toBe(false);
    expect(m.chime.unlocked).toBe(1);
  });

  it('keeps the overlay when the unlock tap itself is rejected', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    m.player!.rejectNextPlay('NotAllowedError');
    m.app.state(); // same player reused below
    await m.app.tapStart();
    expect(m.app.state().overlay).toBe('enableAzan');
  });

  it('plays the azan through the same player when the prayer arrives, then clears it', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    const first = m.player;
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await flush();
    expect(m.player!.src).toBe('/audio/ussak.m4a');
    expect(m.app.state().azan?.prayer).toBe('dhuhr');
    expect(m.app.state().audio).toMatchObject({ status: 'playing', phase: 'azan' });
    m.player!.finish();
    await flush();
    expect(m.app.state().azan).toBeNull();
    expect(m.players).toEqual([first]);
  });

  it('ends a stuck azan moment after the safety cap', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    expect(m.app.state().azan?.prayer).toBe('dhuhr');
    await m.clock.advanceByAsync(MAX_AZAN_MS);
    expect(m.app.state().azan).toBeNull();
    expect(m.app.state().audio.status).toBe('ready');
  });

  it('stopAzan ends the azan moment', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await flush();
    m.app.stopAzan();
    await flush();
    expect(m.app.state().azan).toBeNull();
    expect(m.app.state().audio.status).toBe('ready');
  });
});

describe('health check 3 minutes before each prayer', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('plays the silent clip and shows nothing when playback is allowed', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 3 * 60_000));
    await flush();
    expect(m.player!.sources).toEqual([SILENCE_URL, SILENCE_URL]);
    expect(overlay()).toBeNull();
  });

  it('shows the urgent danger overlay in TR/EN/AR when play() is not allowed; tapping re-unlocks', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 3 * 60_000));
    await flush();
    const o = overlay()!;
    expect(o.classList.contains('overlay--danger')).toBe(true);
    expect(o.getAttribute('aria-live')).toBe('assertive');
    expect(button().classList.contains('start-button--danger')).toBe(true);
    const langs = [...o.querySelectorAll('.overlay__languages p')].map((p) =>
      p.getAttribute('lang'),
    );
    expect(langs).toEqual(['tr', 'en', 'ar']);
    expect(o.querySelector('[lang="ar"]')!.getAttribute('dir')).toBe('rtl');
    expect(o.textContent).toContain('Tap to enable azan');
    await tapStart(m);
    expect(m.players).toHaveLength(1);
    expect(m.app.state().audio.status).toBe('ready');
  });

  it('replays a just-missed azan after the enable tap', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 60_000));
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await flush();
    expect(m.app.state().overlay).toBe('enableAzan');
    await tapStart(m);
    expect(m.player!.src).toBe('/audio/ussak.m4a');
    expect(m.app.state().audio.status).toBe('playing');
  });
});

describe('interruptions and restores', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows Resume after an unexpected pause and resumes on tap', async () => {
    m = mountApp({
      start: START,
      settings: {
        azan: {
          ...defaultSettings.azan,
          enabled: { ...defaultSettings.azan.enabled, dhuhr: false },
        },
      },
    });
    await tapStart(m);
    await m.clock.advanceToAsync(new Date(times(m).asr.getTime() + 1000));
    await flush();
    m.player!.interrupt();
    expect(m.app.state().overlay).toBe('resume');
    const bar = document.querySelector('.resume-bar')!;
    expect(bar.getAttribute('aria-live')).toBe('polite');
    expect(m.root.querySelector<HTMLElement>('.app-main')!.inert).toBe(false);
    bar.querySelector('button')!.click();
    await flush();
    expect(m.app.state().audio.status).toBe('playing');
    expect(m.app.state().overlay).toBeNull();
  });

  it('shows the start overlay again on a back/forward cache restore', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(m.app.state().overlay).toBe('start');
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(m.app.state().overlay).toBe('start');
    await tapStart(m);
    expect(m.players).toHaveLength(1);
  });

  it('without the Start tap, shows the azan moment silently and returns to the clock', async () => {
    m = mountApp({ start: START });
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    expect(m.app.state().azan?.prayer).toBe('dhuhr');
    expect(m.players).toHaveLength(0);
    await m.clock.advanceByAsync(SILENT_AZAN_MS);
    expect(m.app.state().azan).toBeNull();
    expect(m.app.state().overlay).toBe('start');
  });

  it('plays coincident azans one after another (Oslo, Isha = Fajr)', async () => {
    const calc = { ...defaultSettings.calc, method: 'MuslimWorldLeague' as const };
    const fajr = computeDay('2026-06-21', OSLO, calc).fajr;
    m = mountApp({ start: new Date(fajr.getTime() - 60_000), location: OSLO, settings: { calc } });
    await tapStart(m);
    await m.clock.advanceToAsync(new Date(fajr.getTime() + 2000));
    await flush();
    expect(m.app.state().azan?.key).toBe('2026-06-20:isha');
    m.player!.finish();
    await flush();
    expect(m.app.state().azan?.key).toBe('2026-06-21:fajr');
    expect(m.player!.src).toBe('/audio/saba-sabah.m4a');
  });

  it('test-plays a source from settings', async () => {
    m = mountApp({ start: START });
    await tapStart(m);
    await m.app.testAudio('bundled:rast');
    expect(m.player!.src).toBe('/audio/rast.m4a');
  });

  it('keeps focus inside the modal on Tab', () => {
    m = mountApp({ start: START });
    const o = overlay()!;
    const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    o.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button());
    o.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
});
