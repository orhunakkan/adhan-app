import { describe, expect, it } from 'vitest';
import { blend, composite, contrast, luminance, parseColor } from '../../src/design/contrast';

describe('parseColor', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255, a: 1 }],
    ['#0B1020', { r: 11, g: 16, b: 32, a: 1 }],
    ['rgba(255, 255, 255, 0.08)', { r: 255, g: 255, b: 255, a: 0.08 }],
    ['rgb(1,2,3)', { r: 1, g: 2, b: 3, a: 1 }],
  ])('%s', (input, rgba) => {
    expect(parseColor(input)).toEqual(rgba);
  });

  it('rejects unsupported formats', () => {
    expect(() => parseColor('hsl(0 0% 0%)')).toThrow(/Unsupported/);
    expect(() => parseColor('#12345')).toThrow(/Unsupported/);
  });
});

describe('WCAG math', () => {
  it('matches the WCAG reference values', () => {
    expect(luminance('#000')).toBe(0);
    expect(luminance('#fff')).toBeCloseTo(1, 6);
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 3);
    expect(contrast('#777', '#fff')).toBeCloseTo(4.48, 2);
    expect(contrast('#fff', '#777')).toBeCloseTo(contrast('#777', '#fff'), 10);
  });

  it('composites translucent colours over a base', () => {
    expect(composite('rgba(255,255,255,0.5)', '#000')).toBe('#808080');
    expect(composite('#123456', '#fff')).toBe('#123456');
  });

  it('blends two colours at a ratio', () => {
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(blend('#102030', '#102030', 0.3)).toBe('#102030');
  });
});
