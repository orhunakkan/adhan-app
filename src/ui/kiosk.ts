// Kiosk care (brief §9, §8.9): ±8 px burn-in shift every 10 minutes and the
// night-dim overlay. Reduced motion is applied as a class on <html>.
import type { AppState } from '../app/createApp';
import { createBurnInShift } from '../core/burnIn';
import type { Rng } from '../core/ports';
import { h, toggleClass } from './dom';

export function mountKiosk(
  root: HTMLElement,
  deps: { shifted: HTMLElement; rng: Rng; doc: Document },
): { render(s: AppState): void; destroy(): void } {
  const shift = createBurnInShift(deps.rng);
  const dim = h('div', 'night-dim');
  dim.setAttribute('aria-hidden', 'true');
  root.append(dim);
  let lastTransform = '';
  let lastOpacity = '';
  return {
    render(s) {
      const { x, y } = shift.offsetAt(s.now);
      const transform = `translate(${x}px, ${y}px)`;
      if (transform !== lastTransform) {
        lastTransform = transform;
        deps.shifted.style.transform = transform;
      }
      const opacity = s.nightDim.active ? String(s.nightDim.opacity) : '0';
      if (opacity !== lastOpacity) {
        lastOpacity = opacity;
        dim.style.opacity = opacity;
      }
      toggleClass(dim, 'night-dim--active', s.nightDim.active);
      toggleClass(deps.doc.documentElement, 'reduced-motion', s.reducedMotion);
    },
    destroy() {
      dim.remove();
    },
  };
}
