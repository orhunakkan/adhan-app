import { describe, expect, it, vi } from 'vitest';
import { createAudioElementPlayer } from '../../src/adapters/media';
import { createBrowserWakeLock } from '../../src/adapters/wakeLock';

describe('createAudioElementPlayer', () => {
  it('wraps one inline audio element and forwards calls and events', async () => {
    const p = createAudioElementPlayer(document);
    const els = document.querySelectorAll('audio');
    expect(els).toHaveLength(1);
    const el = els[0]!;
    expect(el.hasAttribute('playsinline')).toBe(true);
    p.setSrc('/audio/silence.m4a');
    expect(p.src).toBe('/audio/silence.m4a');
    await p.play();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    p.pause();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    const onEnded = vi.fn();
    const off = p.on('ended', onEnded);
    el.dispatchEvent(new Event('ended'));
    off();
    el.dispatchEvent(new Event('ended'));
    expect(onEnded).toHaveBeenCalledOnce();
    expect(typeof p.currentTime).toBe('number');
    expect(typeof p.duration).toBe('number');
    expect(typeof p.paused).toBe('boolean');
  });

  it('reports an empty src before one is set', () => {
    expect(createAudioElementPlayer(document).src).toBe('');
  });
});

describe('createBrowserWakeLock', () => {
  it('is unsupported without navigator.wakeLock (iPadOS 15)', async () => {
    const w = createBrowserWakeLock({} as Navigator);
    expect(w.supported).toBe(false);
    await expect(w.request()).rejects.toThrow(/not supported/);
  });

  it('requests a screen lock and forwards release events', async () => {
    const sentinel = Object.assign(new EventTarget(), {
      released: false,
      release: vi.fn(() => Promise.resolve()),
    });
    const request = vi.fn(() => Promise.resolve(sentinel));
    const w = createBrowserWakeLock({ wakeLock: { request } } as unknown as Navigator);
    expect(w.supported).toBe(true);
    const s = await w.request();
    expect(request).toHaveBeenCalledWith('screen');
    const onRelease = vi.fn();
    s.onRelease(onRelease);
    sentinel.dispatchEvent(new Event('release'));
    expect(onRelease).toHaveBeenCalledOnce();
    expect(s.released).toBe(false);
    await s.release();
    expect(sentinel.release).toHaveBeenCalled();
  });
});
