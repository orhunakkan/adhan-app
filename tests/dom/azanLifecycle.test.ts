// Regression tests from the second doubt-driven review of the azan moment lifecycle.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { MAX_AZAN_MS } from '../../src/app/createApp';
import { SILENCE_URL } from '../../src/core/audio';
import { computeDay } from '../../src/core/prayerTimes';
import { OSLO, SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const START = new Date('2026-05-10T17:00:00Z');
const times = (m: Mounted) => computeDay('2026-05-10', SCHAUMBURG, m.app.state().settings.calc);

describe('azan moment lifecycle (review cycle 2)', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('C1: the safety cap survives an Enable-tap replay that is then interrupted and left alone', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 60_000));
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    expect(m.app.state().overlay).toBe('enableAzan');
    await m.app.tapStart();
    await flush();
    expect(m.app.state().audio.status).toBe('playing');
    m.player!.interrupt();
    expect(m.app.state().overlay).toBe('resume');
    await m.clock.advanceByAsync(MAX_AZAN_MS);
    expect(m.app.state().azan).toBeNull();
    expect(m.app.state().audio.phase).toBeNull();
  });

  it('C1: a blocked azan screen closes when the next health check succeeds, and the next azan plays', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 60_000));
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    expect(m.app.state().azan?.prayer).toBe('dhuhr');
    await m.clock.advanceToAsync(new Date(times(m).asr.getTime() + 1000));
    await flush();
    expect(m.app.state().azan?.prayer).toBe('asr');
    expect(m.player!.src).toBe('/audio/rast.m4a');
  });

  it('I1: the cap hands over to a queued azan with its own screen and audio', async () => {
    const calc = { ...defaultSettings.calc, method: 'MuslimWorldLeague' as const };
    const fajr = computeDay('2026-06-21', OSLO, calc).fajr;
    m = mountApp({ start: new Date(fajr.getTime() - 60_000), location: OSLO, settings: { calc } });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(fajr.getTime() + 2000));
    expect(m.app.state().azan?.key).toBe('2026-06-20:isha');
    await m.clock.advanceByAsync(MAX_AZAN_MS); // Isha never ends on its own here
    await flush();
    expect(m.app.state().azan?.key).toBe('2026-06-21:fajr');
    expect(m.player!.src).toBe('/audio/saba-sabah.m4a');
    expect(m.app.state().audio.status).toBe('playing');
  });

  it('stopAzan keeps the queue: the coincident second azan still plays', async () => {
    const calc = { ...defaultSettings.calc, method: 'MuslimWorldLeague' as const };
    const fajr = computeDay('2026-06-21', OSLO, calc).fajr;
    m = mountApp({ start: new Date(fajr.getTime() - 60_000), location: OSLO, settings: { calc } });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(fajr.getTime() + 2000));
    m.app.stopAzan();
    await flush();
    expect(m.app.state().azan?.key).toBe('2026-06-21:fajr');
  });

  it('M8: a double Start tap unlocks once', async () => {
    m = mountApp({ start: START });
    const a = m.app.tapStart();
    const b = m.app.tapStart();
    expect(a).toBe(b);
    await a;
    expect(m.player!.sources).toEqual([SILENCE_URL]);
  });

  it('an Enable tap long after the prayer closes the stale moment instead of replaying', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 60_000));
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await m.clock.advanceByAsync(10 * 60_000);
    await m.app.tapStart();
    expect(m.app.state().azan).toBeNull();
    expect(m.player!.src).toBe(SILENCE_URL);
  });

  it('stopTest stops only a settings test; stopAzan with no azan stops audio', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    await m.app.testAudio('bundled:rast');
    expect(m.app.state().audio.phase).toBe('test');
    m.app.stopTest();
    expect(m.app.state().audio.phase).toBeNull();
    m.app.stopTest(); // no-op when nothing is testing
    await m.app.testAudio('bundled:rast');
    m.app.stopAzan();
    expect(m.app.state().audio.phase).toBeNull();
  });

  it('after the iPad slept past the queue age, a queued azan is logged and skipped', async () => {
    const calc = { ...defaultSettings.calc, method: 'MuslimWorldLeague' as const };
    const fajr = computeDay('2026-06-21', OSLO, calc).fajr;
    m = mountApp({ start: new Date(fajr.getTime() - 60_000), location: OSLO, settings: { calc } });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(fajr.getTime() + 2000));
    expect(m.app.state().azan?.key).toBe('2026-06-20:isha');
    vi.setSystemTime(new Date(fajr.getTime() + 30 * 60_000)); // asleep: no ticks ran
    await m.clock.advanceByAsync(1000);
    await flush();
    expect(m.app.state().azan).toBeNull();
    expect(m.app.log.entries().some((e) => e.msg === 'queued azan too old; skipped')).toBe(true);
  });

  it('a playAzan that throws is logged, not unhandled', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    m.blobs.get = () => {
      throw new Error('sync throw');
    };
    const s = m.app.state().settings;
    m.app.updateSettings({ azan: { ...s.azan, audio: { ...s.azan.audio, dhuhr: 'user:x' } } });
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await flush();
    expect(m.app.state().audio.status).toBe('playing'); // fell back to the bundled file
  });
});
