// SVG ring showing time elapsed in the current period (brief §8.4).
const SVG_NS = 'http://www.w3.org/2000/svg';

export const RING_RADIUS = 46;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface ProgressRing {
  el: SVGSVGElement;
  /** 0 … 1; clamped. Only the dash offset changes (no layout work). */
  setProgress(p: number): void;
}

export function createProgressRing(): ProgressRing {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVG_NS, 'circle');
  const bar = document.createElementNS(SVG_NS, 'circle');
  for (const c of [track, bar]) {
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', String(RING_RADIUS));
  }
  track.setAttribute('class', 'ring__track');
  bar.setAttribute('class', 'ring__bar');
  bar.setAttribute('stroke-dasharray', RING_CIRCUMFERENCE.toFixed(3));
  svg.append(track, bar);
  let last = '';
  return {
    el: svg,
    setProgress(p) {
      const clamped = Math.min(1, Math.max(0, p));
      const offset = (RING_CIRCUMFERENCE * (1 - clamped)).toFixed(3);
      if (offset !== last) {
        last = offset;
        bar.setAttribute('stroke-dashoffset', offset);
      }
    },
  };
}
