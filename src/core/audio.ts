// Audio controller (brief §7) — the most critical module. iOS blocks audio
// until a tap, so ONE player is created in the Start tap handler, unlocked with
// a silent clip, and reused for every azan by changing its src.
import { DEFAULT_AUDIO, type Settings } from '../config/schema';
import type { Logger } from './logger';
import type { BlobStore, ChimePort, MediaPlayer, ObjectUrls } from './ports';
import type { AzanPrayer } from './prayerTimes';

export const SILENCE_URL = '/audio/silence.m4a';

export type AudioStatus = 'locked' | 'ready' | 'playing' | 'interrupted' | 'blocked';
export type AudioPhase = 'azan' | 'dua' | 'test';

export interface AudioState {
  status: AudioStatus;
  phase: AudioPhase | null;
  prayer: AzanPrayer | null;
  /** Sources that failed to play this session (shown as a warning in settings). */
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

const isNotAllowed = (e: unknown) => (e as { name?: string } | null)?.name === 'NotAllowedError';

export function bundledUrl(source: string): string | null {
  return source.startsWith('bundled:') ? `/audio/${source.slice('bundled:'.length)}.m4a` : null;
}

export function createAudioController(deps: {
  createPlayer: () => MediaPlayer;
  blobs: BlobStore;
  chime: ChimePort;
  objectUrls: ObjectUrls;
  log: Logger;
  getSettings: () => Settings;
  onChange: (s: AudioState) => void;
}): AudioController {
  let player: MediaPlayer | null = null;
  let state: AudioState = { status: 'locked', phase: null, prayer: null, missing: [] };
  let objectUrl: string | null = null;
  /** Sources still to try for the current phase if the current one fails. */
  let queue: string[] = [];
  let currentSource: string | null = null;
  /** Bumped on every new playback so stale async continuations bail out. */
  let generation = 0;

  const set = (patch: Partial<AudioState>) => {
    state = { ...state, ...patch };
    deps.onChange(state);
  };

  const releaseUrl = () => {
    if (objectUrl) deps.objectUrls.revoke(objectUrl);
    objectUrl = null;
  };

  const idle = () => {
    releaseUrl();
    queue = [];
    currentSource = null;
    set({ status: 'ready', phase: null, prayer: null });
  };

  const markMissing = (source: string) => {
    if (!state.missing.includes(source)) set({ missing: [...state.missing, source] });
  };

  const resolveUrl = async (source: string): Promise<string | null> => {
    const bundled = bundledUrl(source);
    if (bundled) return bundled;
    const blob = await deps.blobs.get(source.slice('user:'.length));
    if (!blob) return null;
    objectUrl = deps.objectUrls.create(blob);
    return objectUrl;
  };

  /** Tries queued sources in order; the chime is the last resort for azan/test. */
  const playNext = async (gen: number): Promise<void> => {
    const p = player!;
    releaseUrl();
    while (queue.length) {
      const source = queue.shift()!;
      const url = await resolveUrl(source);
      if (gen !== generation) return;
      if (!url) {
        deps.log.warn('audio source unavailable', { source });
        continue;
      }
      currentSource = source;
      p.setSrc(url);
      try {
        await p.play();
        if (gen !== generation) return;
        set({ status: 'playing' });
        return;
      } catch (e) {
        if (gen !== generation) return;
        if (isNotAllowed(e)) {
          deps.log.warn('play() not allowed: unlock lost', { source });
          set({ status: 'blocked' });
          return;
        }
        deps.log.warn('audio source failed', { source, error: String(e) });
        markMissing(source);
        releaseUrl();
      }
    }
    currentSource = null;
    if (state.phase === 'dua') {
      idle();
      return;
    }
    deps.log.warn('no playable azan file: chime fallback');
    set({ status: 'playing' });
    await deps.chime.play();
    if (gen === generation) idle();
  };

  const start = async (phase: AudioPhase, prayer: AzanPrayer | null, sources: string[]) => {
    generation += 1;
    queue = [...new Set(sources)];
    set({ phase, prayer });
    await playNext(generation);
  };

  const onEnded = () => {
    if (state.status !== 'playing' || !currentSource) return;
    releaseUrl();
    const s = deps.getSettings();
    if (state.phase === 'azan' && s.azan.dua.enabled) {
      void start('dua', state.prayer, [s.azan.dua.source]);
    } else {
      idle();
    }
  };

  const onPause = () => {
    if (state.status !== 'playing' || !currentSource || !player) return;
    const { currentTime, duration } = player;
    // A real element fires `pause` right before `ended` at the natural end.
    if (Number.isFinite(duration) && currentTime >= duration - 0.5) return;
    deps.log.warn('playback interrupted', { phase: state.phase });
    set({ status: 'interrupted' });
  };

  const onError = () => {
    if (state.status !== 'playing' || !currentSource) return;
    deps.log.warn('audio element error', { source: currentSource });
    markMissing(currentSource);
    void playNext(generation);
  };

  const ensurePlayer = (): MediaPlayer => {
    if (player) return player;
    const p = deps.createPlayer();
    p.on('ended', onEnded);
    p.on('pause', onPause);
    p.on('error', onError);
    p.on('stalled', () => deps.log.warn('audio stalled', { source: currentSource }));
    player = p;
    return p;
  };

  const playSilence = async (): Promise<boolean> => {
    const p = player!;
    generation += 1;
    currentSource = null;
    p.setSrc(SILENCE_URL);
    try {
      await p.play();
      set({ status: 'ready' });
      return true;
    } catch (e) {
      deps.log.warn('silent clip rejected', { error: String(e) });
      set({ status: 'blocked' });
      return false;
    }
  };

  const azanSources = (prayer: AzanPrayer) => [
    deps.getSettings().azan.audio[prayer],
    DEFAULT_AUDIO[prayer],
  ];

  return {
    async unlock() {
      ensurePlayer();
      deps.chime.unlock();
      // A tap during a playing azan must not replace it with the silent clip.
      if (state.status === 'playing') return true;
      return playSilence();
    },
    async playAzan(prayer) {
      if (!player) {
        deps.log.warn('azan due before the Start tap', { prayer });
        set({ prayer });
        return;
      }
      await start('azan', prayer, azanSources(prayer));
    },
    async testSource(source) {
      if (!player) return;
      await start('test', null, [source]);
    },
    stop() {
      generation += 1;
      if (player && state.status === 'playing') {
        currentSource = null; // the pause we cause is not an interruption
        player.pause();
      }
      idle();
    },
    async resume() {
      if (state.status !== 'interrupted' || !player) return;
      try {
        await player.play();
        set({ status: 'playing' });
      } catch (e) {
        deps.log.warn('resume rejected', { error: String(e) });
        set({ status: 'blocked' });
      }
    },
    async healthCheck() {
      if (!player) return false;
      if (state.status === 'playing' || state.status === 'interrupted') return true;
      return playSilence();
    },
    position() {
      if (!player) return { current: 0, duration: 0 };
      const d = player.duration;
      return { current: player.currentTime, duration: Number.isFinite(d) ? d : 0 };
    },
    state: () => state,
  };
}
