// Audio controller (brief §7) — the most critical module. iOS blocks audio
// until a tap, so ONE player is created in the Start tap handler, unlocked with
// a silent clip, and reused for every azan by changing its src.
//
// Every playback is an Attempt object. Async continuations compare against
// the current attempt and clean up after themselves when they are stale, so an
// overlapping start, a stop, or a late promise can never leak an object URL,
// leave a phase set with nothing playing, or flip state back to "playing".
import { audioSourceSchema, DEFAULT_AUDIO, type Settings } from '../config/schema';
import type { Logger } from './logger';
import type { BlobStore, ChimePort, Clock, MediaPlayer, ObjectUrls } from './ports';
import type { AzanPrayer } from './prayerTimes';

export const SILENCE_URL = '/audio/silence.m4a';
/** play() that has not settled by then counts as failed (stalled load, hung SW). */
export const PLAY_TIMEOUT_MS = 4000;
/** An IndexedDB read of an uploaded file that takes longer is treated as unavailable. */
export const BLOB_TIMEOUT_MS = 2000;
/** A pause with no `ended` within this delay is an interruption (duration unknown). */
export const INTERRUPT_CONFIRM_MS = 250;

export type AudioStatus = 'locked' | 'ready' | 'playing' | 'interrupted' | 'blocked';
export type AudioPhase = 'azan' | 'dua' | 'test';

export interface AudioState {
  status: AudioStatus;
  /** Non-null exactly while an attempt is in progress. */
  phase: AudioPhase | null;
  prayer: AzanPrayer | null;
  /** Sources that failed to play (shown as a warning in settings); cleared when one plays. */
  missing: readonly string[];
}

export interface AudioController {
  /** Call from the Start (or "Tap to enable azan") tap handler only. */
  unlock(): Promise<boolean>;
  playAzan(prayer: AzanPrayer): Promise<void>;
  testSource(source: string): Promise<void>;
  stop(): void;
  resume(): Promise<void>;
  /** Plays the silent clip to prove playback is still allowed (3 min before each prayer). */
  healthCheck(): Promise<boolean>;
  position(): { current: number; duration: number };
  state(): AudioState;
}

interface Attempt {
  phase: AudioPhase;
  prayer: AzanPrayer | null;
  queue: string[];
  source: string | null;
  url: string | null;
  /** play() resolved for the current source: element events now belong to it. */
  started: boolean;
  /** A source loop (next) or a resume is running for this attempt. */
  busy: boolean;
}

type PlayResult = 'ok' | 'notAllowed' | 'abort' | 'failed';

export function bundledUrl(source: string): string | null {
  return source.startsWith('bundled:') ? `/audio/${source.slice('bundled:'.length)}.m4a` : null;
}

export function createAudioController(deps: {
  createPlayer: () => MediaPlayer;
  blobs: BlobStore;
  chime: ChimePort;
  objectUrls: ObjectUrls;
  clock: Pick<Clock, 'setTimeout' | 'clearTimeout'>;
  log: Logger;
  getSettings: () => Settings;
  onChange: (s: AudioState) => void;
}): AudioController {
  let player: MediaPlayer | null = null;
  let state: AudioState = { status: 'locked', phase: null, prayer: null, missing: [] };
  let attempt: Attempt | null = null;
  /** Identity of the latest silent-clip play, so a superseded one can't report. */
  let silenceToken: object | null = null;

  const set = (patch: Partial<AudioState>) => {
    state = { ...state, ...patch };
    try {
      deps.onChange(state);
    } catch (e) {
      deps.log.error('audio onChange listener threw', String(e));
    }
  };

  const markMissing = (source: string) => {
    if (!state.missing.includes(source)) set({ missing: [...state.missing, source] });
  };
  const unmarkMissing = (source: string) => {
    if (state.missing.includes(source)) set({ missing: state.missing.filter((s) => s !== source) });
  };

  const revoke = (url: string | null) => {
    if (url?.startsWith('blob:')) deps.objectUrls.revoke(url);
  };

  /** Ends an attempt. Status stays 'blocked'/'locked' (the unlock is still lost); otherwise 'ready'. */
  const finish = (a: Attempt, status?: AudioStatus) => {
    if (attempt !== a) return;
    revoke(a.url);
    a.url = null;
    attempt = null; // before pausing, so our pause is not an interruption
    player?.pause();
    const keep = state.status === 'blocked' || state.status === 'locked';
    set({ status: status ?? (keep ? state.status : 'ready'), phase: null, prayer: null });
  };

  const resolveUrl = async (source: string): Promise<string | null> => {
    if (!audioSourceSchema.safeParse(source).success) return null;
    const bundled = bundledUrl(source);
    if (bundled) return bundled;
    try {
      const blob = await withTimeout(deps.blobs.get(source.slice('user:'.length)), BLOB_TIMEOUT_MS);
      return blob ? deps.objectUrls.create(blob) : null;
    } catch (e) {
      deps.log.warn('could not read uploaded audio', { source, error: String(e) });
      return null;
    }
  };

  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = deps.clock.setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
      promise.then(
        (v) => {
          deps.clock.clearTimeout(timer);
          resolve(v);
        },
        (e: unknown) => {
          deps.clock.clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });

  /** play() with a watchdog; the timeout only pauses the element if this play is still current. */
  const playWithTimeout = (p: MediaPlayer, isCurrent: () => boolean): Promise<PlayResult> =>
    new Promise((resolve) => {
      let settled = false;
      const done = (r: PlayResult) => {
        if (settled) return;
        settled = true;
        deps.clock.clearTimeout(timer);
        resolve(r);
      };
      const timer = deps.clock.setTimeout(() => {
        if (isCurrent()) p.pause(); // a late resolve must not start audio we gave up on
        done('failed');
      }, PLAY_TIMEOUT_MS);
      p.play().then(
        () => done('ok'),
        (e: unknown) => {
          const name = (e as { name?: string } | null)?.name;
          done(
            name === 'NotAllowedError' ? 'notAllowed' : name === 'AbortError' ? 'abort' : 'failed',
          );
        },
      );
    });

  /** Tries the attempt's remaining sources; the chime is the last resort for azan/test. */
  const next = async (a: Attempt): Promise<void> => {
    if (a.busy) return; // one loop per attempt (e.g. a double Resume tap)
    a.busy = true;
    try {
      await loop(a);
    } finally {
      a.busy = false;
    }
  };

  const loop = async (a: Attempt): Promise<void> => {
    const p = player!;
    while (a.queue.length) {
      const source = a.queue.shift()!;
      const url = await resolveUrl(source);
      if (attempt !== a) {
        revoke(url);
        return;
      }
      if (!url) {
        deps.log.warn('audio source unavailable', { source });
        markMissing(source);
        if (attempt !== a) return;
        continue;
      }
      revoke(a.url);
      a.source = source;
      a.url = url;
      a.started = false;
      p.setSrc(url);
      const result = await playWithTimeout(p, () => attempt === a);
      if (attempt !== a) return;
      if (result === 'ok') {
        a.started = true;
        unmarkMissing(source);
        set({ status: 'playing' });
        return;
      }
      if (result === 'notAllowed') {
        deps.log.warn('play() not allowed: unlock lost', { source });
        // Best effort: Web Audio has its own unlock and may still sound.
        if (a.phase === 'azan') void deps.chime.play();
        finish(a, 'blocked');
        return;
      }
      if (result === 'abort') {
        // Interrupted while loading (Siri, a call): the file is fine; offer Resume.
        a.queue.unshift(source);
        deps.log.warn('play() aborted', { source });
        set({ status: 'interrupted' });
        return;
      }
      deps.log.warn('audio source failed', { source });
      markMissing(source); // onChange may re-enter (e.g. stop()): checked below
      if (attempt !== a) return;
    }
    if (a.phase === 'dua') {
      finish(a);
      return;
    }
    deps.log.warn('no playable audio file: chime fallback');
    revoke(a.url);
    a.url = null;
    a.source = null;
    set({ status: 'playing' });
    try {
      await deps.chime.play();
    } catch (e) {
      deps.log.error('chime failed', String(e));
    }
    finish(a);
  };

  const begin = async (phase: AudioPhase, prayer: AzanPrayer | null, sources: string[]) => {
    if (attempt) halt(attempt);
    const a: Attempt = {
      phase,
      prayer,
      queue: [...new Set(sources)],
      source: null,
      url: null,
      started: false,
      busy: false,
    };
    attempt = a;
    silenceToken = null;
    set({ phase, prayer });
    await next(a);
  };

  /** Stops the element for an attempt without touching status (used before a new one). */
  const halt = (a: Attempt) => {
    attempt = null; // first, so the pause we cause is not seen as an interruption
    revoke(a.url);
    a.url = null;
    player?.pause();
  };

  const onEnded = () => {
    const a = attempt;
    if (!a?.started) return;
    const s = deps.getSettings();
    if (a.phase === 'azan' && s.azan.dua.enabled) {
      void begin('dua', a.prayer, [s.azan.dua.source]);
    } else {
      finish(a);
    }
  };

  const onPause = () => {
    const a = attempt;
    if (!a?.started || !player || state.status !== 'playing') return;
    const interrupted = () => {
      deps.log.warn('playback interrupted', { phase: a.phase });
      set({ status: 'interrupted' });
    };
    const { currentTime, duration } = player;
    if (!Number.isFinite(duration)) {
      // Unknown length: a real element fires `pause` right before `ended` at
      // the natural end, so only call it an interruption if `ended` doesn't follow.
      deps.clock.setTimeout(() => {
        if (attempt === a && a.started && state.status === 'playing' && player?.paused)
          interrupted();
      }, INTERRUPT_CONFIRM_MS);
      return;
    }
    if (currentTime >= duration - 0.5) return; // the natural end
    interrupted();
  };

  const onPlaying = () => {
    // The OS or Control Center resumed playback on its own after an interruption.
    if (attempt?.started && state.status === 'interrupted') set({ status: 'playing' });
  };

  const onError = () => {
    const a = attempt;
    // Only after play() resolved: before that, the play() rejection drives the fallback.
    if (!a?.started || !a.source) return;
    deps.log.warn('audio element error', { source: a.source });
    markMissing(a.source);
    a.started = false;
    void next(a);
  };

  const ensurePlayer = (): MediaPlayer => {
    if (player) return player;
    const p = deps.createPlayer();
    p.on('ended', onEnded);
    p.on('pause', onPause);
    p.on('playing', onPlaying);
    p.on('error', onError);
    p.on('stalled', () => deps.log.warn('audio stalled', { source: attempt?.source ?? null }));
    player = p;
    return p;
  };

  /**
   * Plays the silent clip. Inside the Start tap (`unlocking`) the gesture itself
   * is what unlocks iOS, so only NotAllowedError means failure; a health check
   * treats any error as a lost unlock (contract: loud rather than silent).
   */
  const playSilence = async (unlocking: boolean): Promise<boolean> => {
    const p = player!;
    const token = {};
    silenceToken = token;
    p.setSrc(SILENCE_URL);
    const result = await playWithTimeout(p, () => silenceToken === token && !attempt);
    // Superseded by an azan (or a newer check): no evidence either way.
    if (silenceToken !== token || attempt) return true;
    if (result === 'ok' || (unlocking && result !== 'notAllowed')) {
      if (result !== 'ok') deps.log.error('silent clip did not play during unlock', { result });
      set({ status: 'ready', phase: null, prayer: null });
      return true;
    }
    deps.log.warn('silent clip rejected', { result });
    set({ status: 'blocked', phase: null, prayer: null });
    return false;
  };

  return {
    async unlock() {
      ensurePlayer();
      deps.chime.unlock();
      // A tap must not cut off audio that is actually playing; anything else
      // (starting, interrupted, a test) gives way so the gesture re-unlocks.
      if (attempt && state.status === 'playing') return true;
      if (attempt) halt(attempt);
      return playSilence(true);
    },
    async playAzan(prayer) {
      if (!player) {
        deps.log.warn('azan due before the Start tap', { prayer });
        return;
      }
      await begin('azan', prayer, [deps.getSettings().azan.audio[prayer], DEFAULT_AUDIO[prayer]]);
    },
    async testSource(source) {
      if (!player) return;
      if (attempt && attempt.phase !== 'test') return; // never preempt an azan or dua
      await begin('test', null, [source]);
    },
    stop() {
      if (attempt) finish(attempt);
      player?.pause();
    },
    async resume() {
      const a = attempt;
      if (!a || state.status !== 'interrupted' || !player) return;
      if (!a.started) {
        // Aborted while loading: start the same source again (next() allows one loop).
        await next(a);
        return;
      }
      if (a.busy) return; // a second Resume tap while the first is settling
      a.busy = true;
      const result = await playWithTimeout(player, () => attempt === a);
      a.busy = false;
      if (attempt !== a) return;
      if (result === 'ok') set({ status: 'playing' });
      else if (result === 'notAllowed') finish(a, 'blocked');
      else if (result === 'abort') deps.log.warn('resume aborted');
      else {
        markMissing(a.source!);
        a.started = false;
        await next(a);
      }
    },
    async healthCheck() {
      if (!player) return false;
      // Never stomp on an azan or dua; a settings test gives way to the check.
      if (attempt && attempt.phase !== 'test') return true;
      if (attempt) halt(attempt);
      return playSilence(false);
    },
    position() {
      if (!player) return { current: 0, duration: 0 };
      const d = player.duration;
      return { current: player.currentTime, duration: Number.isFinite(d) ? d : 0 };
    },
    state: () => state,
  };
}
