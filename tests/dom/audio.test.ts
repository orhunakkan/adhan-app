import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import type { Settings } from '../../src/config/schema';
import {
  createAudioController,
  PLAY_TIMEOUT_MS,
  SILENCE_URL,
  type AudioState,
} from '../../src/core/audio';
import { createLogger } from '../../src/core/logger';
import { FakeChime } from '../helpers/fakeChime';
import { FakeClock } from '../helpers/fakeClock';
import { FakeMediaPlayer } from '../helpers/fakeMediaPlayer';
import { MemoryBlobStore } from '../helpers/memoryBlobStore';
import { MemoryStore } from '../helpers/memoryStore';
import { objectUrls } from '../helpers/objectUrls';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(settings: Settings = defaultSettings, hook?: (s: AudioState) => void) {
  const players: FakeMediaPlayer[] = [];
  const blobs = new MemoryBlobStore();
  const chime = new FakeChime();
  const states: AudioState[] = [];
  const clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
  clock.dispose(); // real timers for promise flushing; the logger only needs now()
  let current = settings;
  const audio = createAudioController({
    createPlayer: () => {
      const p = new FakeMediaPlayer();
      players.push(p);
      return p;
    },
    blobs,
    chime,
    objectUrls: { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) },
    clock: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    log: createLogger(new MemoryStore(), clock),
    getSettings: () => current,
    onChange: (s) => {
      states.push(s);
      hook?.(s);
    },
  });
  return {
    audio,
    players,
    blobs,
    chime,
    states,
    get player() {
      return players[0]!;
    },
    setSettings(s: Settings) {
      current = s;
    },
  };
}

const withDua: Settings = {
  ...defaultSettings,
  azan: { ...defaultSettings.azan, dua: { enabled: true, source: 'bundled:dua' } },
};

describe('unlock (the Start tap)', () => {
  it('creates the player once and plays the silent clip', async () => {
    const t = setup();
    expect(t.audio.state().status).toBe('locked');
    expect(await t.audio.unlock()).toBe(true);
    expect(t.players).toHaveLength(1);
    expect(t.player.calls).toEqual([`setSrc:${SILENCE_URL}`, 'play']);
    expect(t.audio.state().status).toBe('ready');
    expect(t.chime.unlocked).toBe(1);
  });

  it('reports blocked when play() is rejected, and re-unlocks the same element', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('NotAllowedError');
    expect(await t.audio.unlock()).toBe(false);
    expect(t.audio.state().status).toBe('blocked');
    expect(await t.audio.unlock()).toBe(true);
    expect(t.players).toHaveLength(1);
  });
});

describe('playAzan', () => {
  it('reuses the same player instance for every azan across a day', async () => {
    const t = setup();
    await t.audio.unlock();
    const first = t.player;
    for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
      await t.audio.playAzan(p);
      expect(t.audio.state()).toMatchObject({ status: 'playing', phase: 'azan', prayer: p });
      t.player.finish();
      await flush();
    }
    expect(t.players).toHaveLength(1);
    expect(t.players[0]).toBe(first);
    expect(first.sources.slice(1)).toEqual([
      '/audio/saba-sabah.m4a',
      '/audio/ussak.m4a',
      '/audio/rast.m4a',
      '/audio/segah.m4a',
      '/audio/hicaz.m4a',
    ]);
  });

  it('prefers the user upload from IndexedDB and revokes its URL after ended', async () => {
    const t = setup({
      ...defaultSettings,
      azan: {
        ...defaultSettings.azan,
        audio: { ...defaultSettings.azan.audio, asr: 'user:my-asr' },
      },
    });
    await t.blobs.set('my-asr', new Blob(['x'], { type: 'audio/mp4' }));
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    const url = t.player.src;
    expect(url).toMatch(/^blob:/);
    expect(objectUrls.live).toEqual([url]);
    t.player.finish();
    await flush();
    expect(objectUrls.live).toEqual([]);
    expect(t.audio.state().status).toBe('ready');
  });

  it('falls back to the bundled file when the uploaded blob is gone', async () => {
    const t = setup({
      ...defaultSettings,
      azan: {
        ...defaultSettings.azan,
        audio: { ...defaultSettings.azan.audio, asr: 'user:deleted' },
      },
    });
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    expect(t.player.src).toBe('/audio/rast.m4a');
  });

  it('falls back to the chime and flags the source when the file cannot play', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('NotSupportedError');
    await t.audio.playAzan('dhuhr');
    await flush();
    expect(t.chime.played).toBe(1);
    expect(t.audio.state().missing).toEqual(['bundled:ussak']);
    expect(t.audio.state().status).toBe('ready');
  });

  it('flags a missing source only once', async () => {
    const t = setup();
    await t.audio.unlock();
    for (let i = 0; i < 2; i++) {
      t.player.rejectNextPlay('NotSupportedError');
      await t.audio.playAzan('dhuhr');
      await flush();
    }
    expect(t.audio.state().missing).toEqual(['bundled:ussak']);
  });

  it('falls back when the element reports an error after play() resolved (e.g. 404)', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('dhuhr');
    t.player.emit('error');
    await flush();
    expect(t.chime.played).toBe(1);
    expect(t.audio.state().missing).toEqual(['bundled:ussak']);
  });

  it('tries the default bundled file after a failing upload, then the chime', async () => {
    const t = setup({
      ...defaultSettings,
      azan: {
        ...defaultSettings.azan,
        audio: { ...defaultSettings.azan.audio, isha: 'user:broken' },
      },
    });
    await t.blobs.set('broken', new Blob(['x']));
    await t.audio.unlock();
    t.player.rejectNextPlay('NotSupportedError');
    await t.audio.playAzan('isha');
    await flush();
    expect(t.player.sources.at(-1)).toBe('/audio/hicaz.m4a');
    expect(t.audio.state().missing).toEqual(['user:broken']);
    expect(objectUrls.live).toEqual([]);
  });

  it('becomes blocked (needs a tap) when play() is not allowed', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('NotAllowedError');
    await t.audio.playAzan('maghrib');
    expect(t.audio.state()).toMatchObject({ status: 'blocked', phase: null, prayer: null });
    expect(t.chime.played).toBe(1); // best effort: Web Audio has its own unlock
  });

  it('cannot play before the Start tap', async () => {
    const t = setup();
    await t.audio.playAzan('fajr');
    expect(t.players).toHaveLength(0);
    expect(t.audio.state()).toMatchObject({ status: 'locked', phase: null, prayer: null });
  });

  it('plays the dua after the azan when enabled, then returns to ready', async () => {
    const t = setup(withDua);
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    t.player.finish();
    await flush();
    expect(t.audio.state()).toMatchObject({ status: 'playing', phase: 'dua', prayer: 'asr' });
    expect(t.player.src).toBe('/audio/dua.m4a');
    t.player.finish();
    await flush();
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null, prayer: null });
  });

  it('ends quietly when the dua file is missing (no chime)', async () => {
    const t = setup(withDua);
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    t.player.rejectNextPlay('NotSupportedError');
    t.player.finish();
    await flush();
    expect(t.chime.played).toBe(0);
    expect(t.audio.state().status).toBe('ready');
  });
});

describe('interruptions', () => {
  it('an unexpected pause during an azan becomes interrupted; resume plays again', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('isha');
    t.player.interrupt();
    expect(t.audio.state().status).toBe('interrupted');
    await t.audio.resume();
    expect(t.audio.state().status).toBe('playing');
    expect(t.player.calls.at(-1)).toBe('play');
  });

  it('resume that is not allowed becomes blocked', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('isha');
    t.player.interrupt();
    t.player.rejectNextPlay('NotAllowedError');
    await t.audio.resume();
    expect(t.audio.state().status).toBe('blocked');
  });

  it('the natural end (pause then ended) is not an interruption', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('isha');
    t.player.finish();
    await flush();
    expect(t.states.some((s) => s.status === 'interrupted')).toBe(false);
  });

  it('stop() pauses without counting as an interruption and cleans up', async () => {
    const t = setup({
      ...defaultSettings,
      azan: { ...defaultSettings.azan, audio: { ...defaultSettings.azan.audio, fajr: 'user:f' } },
    });
    await t.blobs.set('f', new Blob(['x']));
    await t.audio.unlock();
    await t.audio.playAzan('fajr');
    t.audio.stop();
    t.player.emit('pause');
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
    expect(objectUrls.live).toEqual([]);
  });

  it('pause or ended while idle are ignored, and resume does nothing unless interrupted', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.emit('pause');
    t.player.emit('ended');
    t.player.emit('error');
    await t.audio.resume();
    expect(t.audio.state().status).toBe('ready');
  });

  it('logs stalls without changing state', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('dhuhr');
    t.player.emit('stalled');
    expect(t.audio.state().status).toBe('playing');
  });
});

describe('healthCheck', () => {
  it('plays the silent clip and stays ready on success', async () => {
    const t = setup();
    await t.audio.unlock();
    expect(await t.audio.healthCheck()).toBe(true);
    expect(t.player.sources.at(-1)).toBe(SILENCE_URL);
  });

  it('reports blocked on NotAllowedError (or any non-abort error)', async () => {
    for (const name of ['NotAllowedError', 'NotSupportedError']) {
      const t = setup();
      await t.audio.unlock();
      t.player.rejectNextPlay(name);
      expect(await t.audio.healthCheck()).toBe(false);
      expect(t.audio.state().status).toBe('blocked');
    }
  });

  it('is skipped while an azan is playing', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    const calls = t.player.calls.length;
    expect(await t.audio.healthCheck()).toBe(true);
    expect(t.player.calls.length).toBe(calls);
  });

  it('does not replace an azan that is still starting (source loading)', async () => {
    const t = setup({
      ...defaultSettings,
      azan: { ...defaultSettings.azan, audio: { ...defaultSettings.azan.audio, asr: 'user:a' } },
    });
    await t.blobs.set('a', new Blob(['x']));
    await t.audio.unlock();
    const pending = t.audio.playAzan('asr');
    expect(await t.audio.healthCheck()).toBe(true);
    await pending;
    expect(t.player.src).toMatch(/^blob:/);
    expect(t.audio.state().status).toBe('playing');
  });

  it('an unlock tap while an azan is starting does not replace it', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.holdNextPlay();
    const pending = t.audio.playAzan('asr');
    await flush();
    expect(await t.audio.unlock()).toBe(true);
    t.player.release();
    await pending;
    expect(t.player.src).toBe('/audio/rast.m4a');
    expect(t.audio.state().status).toBe('playing');
  });

  it('fails before the Start tap', async () => {
    expect(await setup().audio.healthCheck()).toBe(false);
  });
});

describe('testSource (settings "Test azan")', () => {
  it('plays the given source with phase test and stop() ends it', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.testSource('bundled:segah');
    expect(t.player.src).toBe('/audio/segah.m4a');
    expect(t.audio.state()).toMatchObject({ status: 'playing', phase: 'test', prayer: null });
    t.audio.stop();
    expect(t.audio.state().status).toBe('ready');
  });

  it('falls back to the chime when the tested source fails', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('NotSupportedError');
    await t.audio.testSource('bundled:segah');
    await flush();
    expect(t.chime.played).toBe(1);
  });
});

describe('races (stale async work never wins)', () => {
  it('stop() while an uploaded source is still loading leaves the player untouched', async () => {
    const t = setup({
      ...defaultSettings,
      azan: { ...defaultSettings.azan, audio: { ...defaultSettings.azan.audio, fajr: 'user:f' } },
    });
    await t.blobs.set('f', new Blob(['x']));
    await t.audio.unlock();
    const pending = t.audio.playAzan('fajr');
    t.audio.stop();
    await pending;
    expect(t.player.sources).toEqual([SILENCE_URL]);
    expect(t.audio.state().status).toBe('ready');
  });

  it('a play() that resolves after stop() does not flip the state back to playing', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.holdNextPlay();
    const pending = t.audio.playAzan('asr');
    await flush();
    t.audio.stop();
    t.player.release();
    await pending;
    expect(t.audio.state().status).toBe('ready');
  });

  it('a play() that rejects after stop() is ignored', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.holdNextPlay();
    const pending = t.audio.playAzan('asr');
    await flush();
    t.audio.stop();
    t.player.release('NotAllowedError');
    await pending;
    expect(t.audio.state().status).toBe('ready');
    expect(t.audio.state().missing).toEqual([]);
  });

  it('a chime that finishes after a new azan started does not end the new one', async () => {
    const t = setup();
    await t.audio.unlock();
    t.chime.hold = true;
    t.player.rejectNextPlay('NotSupportedError');
    const first = t.audio.playAzan('dhuhr');
    await flush();
    t.chime.hold = false;
    await t.audio.playAzan('asr');
    t.chime.finish();
    await first;
    expect(t.audio.state()).toMatchObject({ status: 'playing', prayer: 'asr' });
  });

  it('a tap (unlock) during a playing azan does not interrupt it', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('isha');
    expect(await t.audio.unlock()).toBe(true);
    expect(t.player.src).toBe('/audio/hicaz.m4a');
    expect(t.audio.state().status).toBe('playing');
  });

  it('testSource before the Start tap does nothing', async () => {
    const t = setup();
    await t.audio.testSource('bundled:rast');
    expect(t.players).toHaveLength(0);
  });
});

describe('position', () => {
  it('reports playback progress for the azan view', async () => {
    const t = setup();
    expect(t.audio.position()).toEqual({ current: 0, duration: 0 });
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    t.player.setPosition(30, 120);
    expect(t.audio.position()).toEqual({ current: 30, duration: 120 });
    t.player.setPosition(0, Number.NaN);
    expect(t.audio.position()).toEqual({ current: 0, duration: 0 });
  });
});

describe('audio review regressions', () => {
  it('C1: overlapping starts never leak an object URL', async () => {
    const t = setup();
    await t.blobs.set('a', new Blob(['a']));
    await t.blobs.set('b', new Blob(['b']));
    await t.audio.unlock();
    const first = t.audio.testSource('user:a');
    const second = t.audio.testSource('user:b');
    await Promise.all([first, second]);
    expect(objectUrls.live).toEqual([t.player.src]);
    t.audio.stop();
    expect(objectUrls.live).toEqual([]);
  });

  it('C2: an IndexedDB failure falls back to the bundled file and flags the upload', async () => {
    const t = setup({
      ...defaultSettings,
      azan: { ...defaultSettings.azan, audio: { ...defaultSettings.azan.audio, asr: 'user:a' } },
    });
    t.blobs.get = () => Promise.reject(new Error('Connection to Indexed Database server lost'));
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    expect(t.player.src).toBe('/audio/rast.m4a');
    expect(t.audio.state()).toMatchObject({ status: 'playing', missing: ['user:a'] });
  });

  it('C3: a play() that never settles times out and falls back', async () => {
    const t = setup();
    vi.useFakeTimers();
    try {
      await t.audio.unlock();
      t.player.holdNextPlay();
      const pending = t.audio.playAzan('dhuhr');
      await vi.advanceTimersByTimeAsync(PLAY_TIMEOUT_MS);
      await pending;
      t.player.release(); // a late resolve after the timeout is ignored
      await vi.advanceTimersByTimeAsync(0);
      expect(t.audio.state().missing).toEqual(['bundled:ussak']);
      expect(t.chime.played).toBe(1);
      expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('C4: stop() pauses a playback that is still starting', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.holdNextPlay();
    const pending = t.audio.playAzan('dhuhr');
    await flush();
    t.audio.stop();
    expect(t.player.calls.at(-1)).toBe('pause');
    t.player.release();
    await pending;
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
  });

  it('C5: an OS auto-resume (playing event) clears the interrupted state', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('isha');
    t.player.interrupt();
    expect(t.audio.state().status).toBe('interrupted');
    t.player.emit('playing');
    expect(t.audio.state().status).toBe('playing');
    t.player.finish();
    await flush();
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
  });

  it('C6: a blocked test leaves no phase behind, so health checks keep working', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('NotAllowedError');
    await t.audio.testSource('bundled:rast');
    expect(t.audio.state()).toMatchObject({ status: 'blocked', phase: null });
    expect(await t.audio.unlock()).toBe(true);
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
    t.player.rejectNextPlay('NotAllowedError');
    expect(await t.audio.healthCheck()).toBe(false);
  });

  it('I1: an error event before play() settles does not start a second loop', async () => {
    const t = setup(withDua);
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    t.player.holdNextPlay();
    t.player.finish(); // dua starts
    await flush();
    t.player.emit('error'); // before the dua play() settles: ignored
    t.player.release('NotSupportedError');
    await flush();
    expect(t.chime.played).toBe(0);
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
  });

  it('I3: a missing uploaded blob is flagged', async () => {
    const t = setup({
      ...defaultSettings,
      azan: { ...defaultSettings.azan, audio: { ...defaultSettings.azan.audio, asr: 'user:gone' } },
    });
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    expect(t.audio.state().missing).toEqual(['user:gone']);
  });

  it('I4: AbortError while loading means interrupted (Resume), not a broken file', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('AbortError');
    await t.audio.playAzan('maghrib');
    expect(t.audio.state()).toMatchObject({ status: 'interrupted', missing: [] });
    await t.audio.resume();
    expect(t.player.src).toBe('/audio/segah.m4a');
    expect(t.audio.state().status).toBe('playing');
  });

  it('I4: an aborted silent clip is inconclusive, not blocked', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('AbortError');
    expect(await t.audio.healthCheck()).toBe(true);
    expect(t.audio.state().status).toBe('ready');
  });

  it('I6: a resume that settles after stop() does not flip back to playing', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('isha');
    t.player.interrupt();
    t.player.holdNextPlay();
    const pending = t.audio.resume();
    t.audio.stop();
    t.player.release();
    await pending;
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
  });

  it('resume that fails moves on to the next source', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('isha');
    t.player.interrupt();
    t.player.rejectNextPlay('NotSupportedError');
    await t.audio.resume();
    expect(t.audio.state().missing).toEqual(['bundled:hicaz']);
  });

  it('I7: stop() keeps blocked and locked', async () => {
    const t = setup();
    t.audio.stop();
    expect(t.audio.state().status).toBe('locked');
    await t.audio.unlock();
    t.player.rejectNextPlay('NotAllowedError');
    await t.audio.playAzan('fajr');
    t.audio.stop();
    expect(t.audio.state().status).toBe('blocked');
  });

  it('I8: a test never preempts an azan', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    await t.audio.testSource('bundled:segah');
    expect(t.audio.state()).toMatchObject({ phase: 'azan', prayer: 'asr' });
    expect(t.player.src).toBe('/audio/rast.m4a');
  });

  it('M3: a source that plays again is removed from the missing list', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('NotSupportedError');
    await t.audio.testSource('bundled:segah');
    await flush();
    expect(t.audio.state().missing).toEqual(['bundled:segah']);
    await t.audio.testSource('bundled:segah');
    expect(t.audio.state().missing).toEqual([]);
  });

  it('M6: an invalid source is rejected without touching the element', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.testSource('http://example.com/x.mp3');
    expect(t.player.sources).toEqual([SILENCE_URL]);
    expect(t.audio.state().missing).toEqual(['http://example.com/x.mp3']);
  });

  it('a superseded silent clip does not report', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.holdNextPlay();
    const check = t.audio.healthCheck();
    await t.audio.playAzan('asr');
    t.player.release('NotAllowedError');
    expect(await check).toBe(true);
    expect(t.audio.state().status).toBe('playing');
  });

  it('stop() during a start that began while blocked keeps blocked', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.rejectNextPlay('NotAllowedError');
    await t.audio.healthCheck();
    t.player.holdNextPlay();
    const pending = t.audio.playAzan('asr');
    await flush();
    t.audio.stop();
    t.player.release();
    await pending;
    expect(t.audio.state().status).toBe('blocked');
  });

  it('a stop() from inside onChange during the fallback loop ends it cleanly', async () => {
    let stopped = false;
    const t = setup(defaultSettings, (s) => {
      if (!stopped && s.missing.length) {
        stopped = true;
        t.audio.stop();
      }
    });
    await t.audio.unlock();
    t.player.rejectNextPlay('NotSupportedError');
    await t.audio.playAzan('dhuhr');
    expect(t.chime.played).toBe(0);
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
  });

  it('a resume aborted again stays interrupted', async () => {
    const t = setup();
    await t.audio.unlock();
    await t.audio.playAzan('isha');
    t.player.interrupt();
    t.player.rejectNextPlay('AbortError');
    await t.audio.resume();
    expect(t.audio.state().status).toBe('interrupted');
  });

  it('playing and stalled events while idle change nothing', async () => {
    const t = setup();
    await t.audio.unlock();
    t.player.emit('playing');
    t.player.emit('stalled');
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
  });

  it('a stop() from inside onChange for an unavailable upload ends it cleanly', async () => {
    let stopped = false;
    const t = setup(
      {
        ...defaultSettings,
        azan: {
          ...defaultSettings.azan,
          audio: { ...defaultSettings.azan.audio, asr: 'user:gone' },
        },
      },
      (s) => {
        if (!stopped && s.missing.length) {
          stopped = true;
          t.audio.stop();
        }
      },
    );
    await t.audio.unlock();
    await t.audio.playAzan('asr');
    expect(t.player.sources).toEqual([SILENCE_URL]);
    expect(t.audio.state()).toMatchObject({ status: 'ready', phase: null });
  });
});
