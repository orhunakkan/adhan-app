// Every side effect the app performs goes through one of these interfaces.
// main.ts wires them to real browser APIs (src/adapters); tests use the fakes in
// tests/helpers. Keep them minimal: add a member only when a module needs it.

export type TimerHandle = number | object;

/** Time source and short timers. Azans are never scheduled with long timeouts (brief §6). */
export interface Clock {
  now(): Date;
  setInterval(fn: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
  /** Short UI timers only (toasts, long-press, fades). */
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export type MediaEvent = 'pause' | 'ended' | 'error' | 'stalled' | 'playing' | 'timeupdate';

/** Wraps the single persistent audio element created at the Start tap (brief §7). */
export interface MediaPlayer {
  setSrc(url: string): void;
  readonly src: string;
  play(): Promise<void>;
  pause(): void;
  /** Subscribes to a media event; returns an unsubscribe function. */
  on(event: MediaEvent, fn: () => void): () => void;
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
}

export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  onRelease(fn: () => void): void;
}

/** Screen Wake Lock, progressive enhancement only — absent on iPadOS 15 (brief §7b). */
export interface WakeLockPort {
  readonly supported: boolean;
  request(): Promise<WakeLockSentinelLike>;
}

/** Synchronous string storage (localStorage in production). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Blob storage for uploaded audio and photos (IndexedDB in production). */
export interface BlobStore {
  get(key: string): Promise<Blob | undefined>;
  set(key: string, value: Blob): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Uniform random numbers in [0, 1). */
export interface Rng {
  next(): number;
}

/** Fallback chime when no azan file can play (Web Audio, brief §10). */
export interface ChimePort {
  /** Must run inside the Start tap so iOS lets the AudioContext make sound. */
  unlock(): void;
  /** Plays the chime; resolves when it has finished. */
  play(): Promise<void>;
}

export interface ObjectUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

/** One-shot position (used once to set the location, brief §5). */
export interface GeolocationPort {
  getPosition(): Promise<{ lat: number; lng: number }>;
}

/** Resizes an uploaded photo to <= 2048 px (long edge), JPEG ~0.85 (brief §9). */
export interface PhotoProcessor {
  resize(file: Blob): Promise<Blob>;
}
