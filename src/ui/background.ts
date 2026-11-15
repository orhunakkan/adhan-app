// Living background (brief §8.1, §8.3, §8.9): two stacked gradient layers that
// crossfade by opacity when the prayer period changes, plus an optional faint
// geometric pattern. Gradients themselves are never animated.
import type { AppState } from '../app/createApp';
import type { PrayerName } from '../core/prayerTimes';
import { periodGradients, type ThemeName } from '../design/tokens';
import { h, toggleClass } from './dom';

export function gradientFor(theme: ThemeName, period: PrayerName): string {
  const [a, b] = periodGradients[theme][period];
  return `linear-gradient(160deg, ${a} 0%, ${b} 100%)`;
}

export function mountBackground(host: HTMLElement, doc: Document): { render(s: AppState): void } {
  const sky = h('div', 'sky');
  sky.setAttribute('aria-hidden', 'true');
  const layers = [h('div', 'sky__layer'), h('div', 'sky__layer')] as const;
  const pattern = h('div', 'sky__pattern');
  sky.append(layers[0], layers[1], pattern);
  host.prepend(sky);

  let active: 0 | 1 = 0;
  let shown = '';
  return {
    render(s) {
      const theme = s.settings.display.theme;
      const period: PrayerName = s.period?.period ?? 'isha';
      toggleClass(pattern, 'sky__pattern--on', s.settings.display.pattern);
      if (doc.documentElement.dataset.period !== period)
        doc.documentElement.dataset.period = period;
      const key = `${theme}|${period}`;
      if (key === shown) return;
      const first = shown === '';
      shown = key;
      // Paint the hidden layer, then fade it in over the visible one.
      const next: 0 | 1 = first ? active : active === 0 ? 1 : 0;
      layers[next].style.backgroundImage = gradientFor(theme, period);
      toggleClass(layers[next], 'sky__layer--visible', true);
      if (!first) toggleClass(layers[active], 'sky__layer--visible', false);
      active = next;
    },
  };
}
