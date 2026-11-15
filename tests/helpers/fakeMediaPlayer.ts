import type { MediaEvent, MediaPlayer } from '../../src/core/ports';

/** Records every interaction; can reject play() or emit media events on demand. */
export class FakeMediaPlayer implements MediaPlayer {
  readonly calls: string[] = [];
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  private nextPlayError: string | null = null;
  private readonly listeners = new Map<MediaEvent, Set<() => void>>();

  setSrc(url: string): void {
    this.calls.push(`setSrc:${url}`);
    this.src = url;
    this.currentTime = 0;
  }

  play(): Promise<void> {
    this.calls.push('play');
    if (this.nextPlayError) {
      const name = this.nextPlayError;
      this.nextPlayError = null;
      this.paused = true;
      return Promise.reject(Object.assign(new Error(`play() rejected: ${name}`), { name }));
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.calls.push('pause');
    this.paused = true;
  }

  on(event: MediaEvent, fn: () => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  /** Makes the next play() reject with an error of the given name (e.g. NotAllowedError). */
  rejectNextPlay(name = 'NotAllowedError'): void {
    this.nextPlayError = name;
  }

  emit(event: MediaEvent): void {
    if (event === 'ended') this.paused = true;
    for (const fn of [...(this.listeners.get(event) ?? [])]) fn();
  }

  setPosition(currentTime: number, duration: number): void {
    this.currentTime = currentTime;
    this.duration = duration;
  }

  /** Simulates the OS pausing playback (Siri, an alarm, a call). */
  interrupt(): void {
    this.paused = true;
    this.emit('pause');
  }

  /** The src values set so far, in order. */
  get sources(): string[] {
    return this.calls.filter((c) => c.startsWith('setSrc:')).map((c) => c.slice('setSrc:'.length));
  }
}
