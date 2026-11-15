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

  it('a reload in the middle of an azan shows Start and never plays that azan again', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    const { maghrib, isha } = times(m);
    await m.clock.advanceToAsync(new Date(maghrib.getTime() + 1000));
    await flush();
    expect(m.app.state().azan?.prayer).toBe('maghrib');
    const { store, blobs } = m;
    m.dispose();
    // iOS reloaded the page 40 s into the azan: same storage, the audio unlock is lost.
    m = mountApp({ start: new Date(maghrib.getTime() + 41_000), store, blobs });
    expect(document.querySelector('.overlay')).not.toBeNull();
    await m.app.tapStart();
    await m.clock.advanceByAsync(60_000); // still inside Maghrib's 120 s fire window
    await flush();
    expect(m.app.state().azan).toBeNull();
    expect(m.player!.sources.filter((src) => src !== SILENCE_URL)).toEqual([]);
    // The next prayer still plays.
    await m.clock.advanceToAsync(new Date(isha.getTime() + 1000));
    await flush();
    expect(m.app.state().azan?.prayer).toBe('isha');
  });

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

  it('cycle 3 #1: a view that throws on the azan render cannot keep the moment up', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    m.app.subscribe((st) => {
      if (st.azan) throw new Error('view crashed');
    });
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await flush();
    expect(m.player!.src).toBe('/audio/ussak.m4a'); // played at once despite the throw
    m.player!.finish();
    await flush();
    expect(m.app.state().azan).toBeNull();
    expect(m.app.log.entries().some((e) => e.msg === 'view listener threw')).toBe(true);
    await m.clock.advanceToAsync(new Date(times(m).asr.getTime() + 1000));
    await flush();
    expect(m.player!.src).toBe('/audio/rast.m4a');
  });

  it('cycle 3 #3: chime fallback inside the replay tap still closes the moment', async () => {
    const audioCfg = {
      ...defaultSettings.azan,
      audio: { ...defaultSettings.azan.audio, dhuhr: 'user:gone' },
    };
    m = mountApp({ start: START, settings: { azan: audioCfg } });
    await m.app.tapStart();
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 60_000));
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    expect(m.app.state().overlay).toBe('enableAzan');
    m.player!.rejectNextPlay('NotSupportedError'); // the silent clip in the tap: lenient
    const tap = m.app.tapStart();
    await flush();
    m.player!.rejectNextPlay('NotSupportedError'); // the bundled file in the replay
    await tap;
    await flush();
    await m.clock.advanceByAsync(5000);
    expect(m.chime.played).toBeGreaterThanOrEqual(1);
    expect(m.app.state().azan).toBeNull();
  });

  it('cycle 3 #4: after a bfcache restore the azan is still attempted; a block shows the loud overlay', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(m.app.state().overlay).toBe('start');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 60_000));
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await flush();
    expect(m.app.state().overlay).toBe('enableAzan');
    await m.clock.advanceByAsync(4 * 60_000);
    await m.app.tapStart();
    await flush();
    expect(m.player!.src).toBe('/audio/ussak.m4a');
    expect(m.app.state().audio.status).toBe('playing');
  });

  it('cycle 3 #4: after a bfcache restore, if playback is still allowed, the azan plays', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await flush();
    expect(m.player!.src).toBe('/audio/ussak.m4a');
  });

  it('cycle 3 #5/#6: a throwing chime never blocks the unlock or the blocked overlay', async () => {
    m = mountApp({ start: START });
    m.chime.unlock = () => {
      throw new Error('AudioContext unavailable');
    };
    m.chime.play = () => {
      throw new Error('AudioContext unavailable');
    };
    await m.app.tapStart();
    expect(m.app.state().audio.status).toBe('ready');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() - 60_000));
    m.player!.rejectNextPlay('NotAllowedError');
    await m.clock.advanceToAsync(new Date(times(m).dhuhr.getTime() + 1000));
    await flush();
    expect(m.app.state().overlay).toBe('enableAzan');
    expect(m.app.state().audio.phase).toBeNull();
  });
});
