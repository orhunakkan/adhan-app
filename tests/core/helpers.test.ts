import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../helpers/fakeClock';
import { FakeMediaPlayer } from '../helpers/fakeMediaPlayer';
import { FakeWakeLock } from '../helpers/fakeWakeLock';
import { MemoryStore } from '../helpers/memoryStore';
import { MemoryBlobStore } from '../helpers/memoryBlobStore';
import { seededRng } from '../helpers/seededRng';

describe('FakeClock', () => {
  let clock: FakeClock | undefined;
  afterEach(() => clock?.dispose());

  it('starts at the given time and advances by ms', () => {
    clock = new FakeClock(new Date('2026-03-01T10:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-03-01T10:00:00.000Z');
    clock.advanceBy(1500);
    expect(clock.now().toISOString()).toBe('2026-03-01T10:00:01.500Z');
  });

  it('runs interval callbacks while advancing to a date', () => {
    clock = new FakeClock(new Date('2026-03-01T10:00:00Z'));
    const seen: string[] = [];
    const h = clock.setInterval(() => seen.push(clock!.now().toISOString()), 1000);
    clock.advanceTo(new Date('2026-03-01T10:00:03Z'));
    expect(seen).toEqual([
      '2026-03-01T10:00:01.000Z',
      '2026-03-01T10:00:02.000Z',
      '2026-03-01T10:00:03.000Z',
    ]);
    clock.clearInterval(h);
    clock.advanceBy(5000);
    expect(seen).toHaveLength(3);
  });

  it('supports short timeouts and clearing them', () => {
    clock = new FakeClock(new Date('2026-03-01T10:00:00Z'));
    const fired = vi.fn();
    const cancelled = vi.fn();
    clock.setTimeout(fired, 100);
    const h = clock.setTimeout(cancelled, 100);
    clock.clearTimeout(h);
    clock.advanceBy(100);
    expect(fired).toHaveBeenCalledOnce();
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('refuses to move backwards', () => {
    clock = new FakeClock(new Date('2026-03-01T10:00:00Z'));
    expect(() => clock!.advanceTo(new Date('2026-03-01T09:00:00Z'))).toThrow(/backwards/);
  });
});

describe('FakeMediaPlayer', () => {
  it('records src changes and play/pause calls', async () => {
    const p = new FakeMediaPlayer();
    p.setSrc('/audio/silence.m4a');
    await p.play();
    p.pause();
    expect(p.calls).toEqual(['setSrc:/audio/silence.m4a', 'play', 'pause']);
    expect(p.src).toBe('/audio/silence.m4a');
    expect(p.paused).toBe(true);
  });

  it('rejects the next play() with a named DOMException-like error, once', async () => {
    const p = new FakeMediaPlayer();
    p.rejectNextPlay('NotAllowedError');
    await expect(p.play()).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(p.paused).toBe(true);
    await expect(p.play()).resolves.toBeUndefined();
    expect(p.paused).toBe(false);
  });

  it('emits events to subscribers until they unsubscribe', () => {
    const p = new FakeMediaPlayer();
    const onEnded = vi.fn();
    const off = p.on('ended', onEnded);
    p.emit('ended');
    off();
    p.emit('ended');
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('exposes settable position and duration', () => {
    const p = new FakeMediaPlayer();
    p.setPosition(30, 120);
    expect(p.currentTime).toBe(30);
    expect(p.duration).toBe(120);
  });

  it('emits pause and keeps paused state on an external interruption', async () => {
    const p = new FakeMediaPlayer();
    const onPause = vi.fn();
    p.on('pause', onPause);
    await p.play();
    p.interrupt();
    expect(p.paused).toBe(true);
    expect(onPause).toHaveBeenCalledOnce();
  });
});

describe('FakeWakeLock', () => {
  it('reports unsupported and rejects requests', async () => {
    const w = new FakeWakeLock({ supported: false });
    expect(w.supported).toBe(false);
    await expect(w.request()).rejects.toThrow(/not supported/);
  });

  it('grants a sentinel that notifies on release', async () => {
    const w = new FakeWakeLock({ supported: true });
    const s = await w.request();
    const onRelease = vi.fn();
    s.onRelease(onRelease);
    await s.release();
    expect(s.released).toBe(true);
    expect(onRelease).toHaveBeenCalledOnce();
    expect(w.requests).toBe(1);
  });

  it('can be told to reject when supported', async () => {
    const w = new FakeWakeLock({ supported: true, reject: true });
    await expect(w.request()).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('lets the system release the lock (e.g. on hide)', async () => {
    const w = new FakeWakeLock({ supported: true });
    const s = await w.request();
    const onRelease = vi.fn();
    s.onRelease(onRelease);
    w.releaseAll();
    expect(s.released).toBe(true);
    expect(onRelease).toHaveBeenCalledOnce();
  });
});

describe('MemoryStore', () => {
  it('gets, sets and removes strings', () => {
    const s = new MemoryStore({ a: '1' });
    expect(s.get('a')).toBe('1');
    expect(s.get('missing')).toBeNull();
    s.set('b', '2');
    s.remove('a');
    expect(s.snapshot()).toEqual({ b: '2' });
  });
});

describe('MemoryBlobStore', () => {
  it('stores and lists blobs', async () => {
    const s = new MemoryBlobStore();
    await s.set('x', new Blob(['abc']));
    expect(await s.keys()).toEqual(['x']);
    expect((await s.get('x'))?.size).toBe(3);
    await s.delete('x');
    expect(await s.get('x')).toBeUndefined();
  });
});

describe('seededRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(7);
    const seqA = Array.from({ length: 1000 }, () => a.next());
    const seqB = Array.from({ length: 1000 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(c.next()).not.toBe(seqA[0]);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
