import { describe, expect, it } from 'vitest';
import { BURN_IN_INTERVAL_MS, createBurnInShift } from '../../src/core/burnIn';
import { seededRng } from '../helpers/seededRng';

const start = new Date('2026-05-10T00:00:00Z').getTime();
const minutes = (n: number) => new Date(start + n * 60_000);

describe('createBurnInShift', () => {
  it('stays within ±8 px and changes only on 10-minute boundaries over 24 h', () => {
    const shift = createBurnInShift(seededRng(1));
    let prev = shift.offsetAt(minutes(0));
    let changes = 0;
    for (let m = 1; m <= 24 * 60; m++) {
      const o = shift.offsetAt(minutes(m));
      expect(Math.abs(o.x)).toBeLessThanOrEqual(8);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(8);
      expect(Number.isInteger(o.x) && Number.isInteger(o.y)).toBe(true);
      if (o.x !== prev.x || o.y !== prev.y) {
        expect(m % 10, `changed at minute ${m}`).toBe(0);
        changes++;
      }
      prev = o;
    }
    expect(changes).toBeGreaterThan(100); // 144 buckets; a few may repeat by chance
  });

  it('is deterministic for a seed and returns the same offset within a bucket', () => {
    const a = createBurnInShift(seededRng(9));
    const b = createBurnInShift(seededRng(9));
    expect(a.offsetAt(minutes(3))).toEqual(b.offsetAt(minutes(3)));
    expect(a.offsetAt(minutes(7))).toEqual(a.offsetAt(minutes(3)));
  });

  it('uses the full ±8 range', () => {
    const shift = createBurnInShift(seededRng(5));
    const xs = Array.from({ length: 500 }, (_, i) => shift.offsetAt(minutes(i * 10)).x);
    expect(Math.min(...xs)).toBe(-8);
    expect(Math.max(...xs)).toBe(8);
  });

  it('exposes a 10-minute interval', () => {
    expect(BURN_IN_INTERVAL_MS).toBe(600_000);
  });
});
