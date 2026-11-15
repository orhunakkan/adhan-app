import type { WakeLockPort, WakeLockSentinelLike } from '../../src/core/ports';

class FakeSentinel implements WakeLockSentinelLike {
  released = false;
  private readonly fns: Array<() => void> = [];

  release(): Promise<void> {
    this.fire();
    return Promise.resolve();
  }

  onRelease(fn: () => void): void {
    this.fns.push(fn);
  }

  fire(): void {
    if (this.released) return;
    this.released = true;
    for (const fn of this.fns) fn();
  }
}

export class FakeWakeLock implements WakeLockPort {
  readonly supported: boolean;
  requests = 0;
  private readonly reject: boolean;
  private readonly sentinels: FakeSentinel[] = [];

  constructor(opts: { supported: boolean; reject?: boolean }) {
    this.supported = opts.supported;
    this.reject = opts.reject ?? false;
  }

  request(): Promise<WakeLockSentinelLike> {
    this.requests += 1;
    if (!this.supported) return Promise.reject(new Error('Wake Lock API not supported'));
    if (this.reject) {
      return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    }
    const s = new FakeSentinel();
    this.sentinels.push(s);
    return Promise.resolve(s);
  }

  /** Simulates the browser releasing locks (page hidden, low battery). */
  releaseAll(): void {
    for (const s of this.sentinels) s.fire();
  }
}
