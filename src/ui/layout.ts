// Main-screen layout (brief §8.4): landscape = clock zone (≈60%) + next-prayer
// zone (≈40%) over a timeline strip; portrait = the same pieces stacked.
// Media queries switch the layout; the class mirrors it for tests and JS.
import { h, toggleClass } from './dom';

export interface Layout {
  /** The whole layout, shifted for burn-in. */
  root: HTMLElement;
  clock: HTMLElement;
  next: HTMLElement;
  timeline: HTMLElement;
  destroy(): void;
}

const PORTRAIT = '(orientation: portrait)';

export function mountLayout(host: HTMLElement, matchMedia: (q: string) => MediaQueryList): Layout {
  const root = h('div', 'layout');
  const clock = h('section', 'zone zone--clock');
  const next = h('section', 'zone zone--next');
  const timeline = h('section', 'zone zone--timeline');
  root.append(clock, next, timeline);
  host.append(root);

  const mq = matchMedia(PORTRAIT);
  const apply = () => {
    toggleClass(root, 'layout--portrait', mq.matches);
    toggleClass(root, 'layout--landscape', !mq.matches);
  };
  apply();
  // Safari 15 supports addEventListener on MediaQueryList (14+).
  mq.addEventListener('change', apply);

  return {
    root,
    clock,
    next,
    timeline,
    destroy() {
      mq.removeEventListener('change', apply);
      root.remove();
    },
  };
}
