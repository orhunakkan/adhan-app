import { describe, expect, it } from 'vitest';
import { createProgressRing, RING_CIRCUMFERENCE } from '../../src/ui/progressRing';

describe('progress ring', () => {
  it.each([
    [0, RING_CIRCUMFERENCE],
    [0.5, RING_CIRCUMFERENCE / 2],
    [1, 0],
    [-1, RING_CIRCUMFERENCE],
    [2, 0],
  ])('progress %s → stroke-dashoffset %s', (p, offset) => {
    const ring = createProgressRing();
    ring.setProgress(p);
    const bar = ring.el.querySelector('.ring__bar')!;
    expect(Number(bar.getAttribute('stroke-dashoffset'))).toBeCloseTo(offset, 2);
    expect(Number(bar.getAttribute('stroke-dasharray'))).toBeCloseTo(RING_CIRCUMFERENCE, 2);
  });

  it('is decorative for screen readers', () => {
    expect(createProgressRing().el.getAttribute('aria-hidden')).toBe('true');
  });
});
