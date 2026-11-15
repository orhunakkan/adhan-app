import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebAudioChime } from '../../src/adapters/chime';

function fakeAudioContext() {
  const oscillators: Array<{ start: ReturnType<typeof vi.fn>; frequency: { value: number } }> = [];
  class Ctx {
    currentTime = 0;
    destination = {};
    resume = vi.fn(() => Promise.resolve());
    createOscillator() {
      const o = {
        type: '',
        frequency: { value: 0 },
        connect: (g: unknown) => g,
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(o);
      return o;
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: (d: unknown) => d,
      };
    }
  }
  return { Ctx, oscillators };
}

describe('createWebAudioChime', () => {
  afterEach(() => vi.useRealTimers());

  it('does nothing without Web Audio or before unlock', async () => {
    const chime = createWebAudioChime({ setTimeout });
    chime.unlock();
    await expect(chime.play()).resolves.toBeUndefined();
  });

  it('creates the context on unlock (webkit prefix too) and plays two notes', async () => {
    vi.useFakeTimers();
    const { Ctx, oscillators } = fakeAudioContext();
    const win = {
      webkitAudioContext: Ctx as unknown as new () => AudioContext,
      setTimeout: globalThis.setTimeout,
    };
    const chime = createWebAudioChime(win);
    chime.unlock();
    chime.unlock(); // reuses the same context
    const done = chime.play();
    expect(oscillators.map((o) => o.frequency.value)).toEqual([659.25, 523.25]);
    expect(oscillators.every((o) => o.start.mock.calls.length === 1)).toBe(true);
    vi.advanceTimersByTime(2700);
    await expect(done).resolves.toBeUndefined();
  });
});
