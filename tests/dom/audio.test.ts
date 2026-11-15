import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import type { Settings } from '../../src/config/schema';
import { createAudioController, SILENCE_URL, type AudioState } from '../../src/core/audio';
import { createLogger } from '../../src/core/logger';
import { FakeChime } from '../helpers/fakeChime';
import { FakeClock } from '../helpers/fakeClock';
import { FakeMediaPlayer } from '../helpers/fakeMediaPlayer';
import { MemoryBlobStore } from '../helpers/memoryBlobStore';
import { MemoryStore } from '../helpers/memoryStore';
import { objectUrls } from '../helpers/objectUrls';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(settings: Settings = defaultSettings) {
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
    log: createLogger(new MemoryStore(), clock),
    getSettings: () => current,
    onChange: (s) => states.push(s),
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
    expect(t.audio.state()).toMatchObject({ status: 'blocked', prayer: 'maghrib' });
    expect(t.chime.played).toBe(0);
  });

  it('cannot play before the Start tap', async () => {
    const t = setup();
    await t.audio.playAzan('fajr');
    expect(t.players).toHaveLength(0);
    expect(t.audio.state()).toMatchObject({ status: 'locked', prayer: 'fajr' });
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

  it('reports blocked on NotAllowedError (or any error)', async () => {
    for (const name of ['NotAllowedError', 'AbortError']) {
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
