import { afterEach, describe, expect, it } from 'vitest';
import { createLogger, LOG_CAPACITY } from '../../src/core/logger';
import { KEYS } from '../../src/core/storage';
import { FakeClock } from '../helpers/fakeClock';
import { MemoryStore } from '../helpers/memoryStore';

describe('createLogger', () => {
  let clock: FakeClock;
  afterEach(() => clock.dispose());

  it('records level, message, data and timestamp', () => {
    clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
    const log = createLogger(new MemoryStore(), clock);
    log.warn('health check failed', { name: 'NotAllowedError' });
    expect(log.entries()).toEqual([
      {
        at: '2026-05-10T12:00:00.000Z',
        level: 'warn',
        msg: 'health check failed',
        data: { name: 'NotAllowedError' },
      },
    ]);
  });

  it('keeps only the last 100 entries', () => {
    clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
    const log = createLogger(new MemoryStore(), clock);
    for (let i = 0; i < 250; i++) log.info(`m${i}`);
    const entries = log.entries();
    expect(LOG_CAPACITY).toBe(100);
    expect(entries).toHaveLength(100);
    expect(entries[0]!.msg).toBe('m150');
    expect(entries.at(-1)!.msg).toBe('m249');
  });

  it('persists across instances (a reload)', () => {
    clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
    const store = new MemoryStore();
    createLogger(store, clock).error('boom');
    expect(
      createLogger(store, clock)
        .entries()
        .map((e) => e.msg),
    ).toEqual(['boom']);
  });

  it.each(['not json', '{"a":1}', '[{"bad":true}]'])(
    'starts empty when stored log is %j',
    (stored) => {
      clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
      const log = createLogger(new MemoryStore({ [KEYS.log]: stored }), clock);
      expect(log.entries()).toEqual([]);
      log.info('ok');
      expect(log.entries()).toHaveLength(1);
    },
  );

  it('omits data when none is given and does not keep unserialisable data', () => {
    clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
    const store = new MemoryStore();
    const log = createLogger(store, clock);
    log.info('plain');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    log.info('cyclic', cyclic);
    expect(log.entries()[0]).not.toHaveProperty('data');
    expect(log.entries()[1]!.data).toBe('[unserialisable]');
    expect(() => JSON.parse(store.get(KEYS.log)!)).not.toThrow();
  });
});
