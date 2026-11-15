// Screensaver (brief §8.6, §9): panels and/or photos full-bleed, with the clock
// and next prayer as a compact pill whose corner rotates every 10 minutes.
// At most two slide nodes exist at once (current + the one fading out).
import type { AppState } from '../app/createApp';
import { pillCorner } from '../core/burnIn';
import type { Panel } from '../core/panels';
import { screensaverSlot } from '../core/panels';
import type { Clock, TimerHandle } from '../core/ports';
import { formatTime } from '../core/time';
import { INTL_LOCALE, prayerName } from '../i18n';
import { h, setText, toggleClass } from './dom';
import { formatCountdown } from './nextPrayerCard';
import { renderPanel } from './panels';

export const SLIDE_FADE_MS = 600;

export interface ScreensaverDeps {
  clock: Clock;
  /** Shuffled panels, or [] until loaded. */
  panels: () => readonly Panel[];
  /** Photo slides (task 30); returns null when there is no photo for this index. */
  photoSlide?: (index: number) => HTMLElement | null;
  /** Night dim or settings open: keep the clock. */
  suppressed: (s: AppState) => boolean;
}

export function mountScreensaver(
  host: HTMLElement,
  deps: ScreensaverDeps,
): { render(s: AppState): void } {
  const root = h('div', 'screensaver');
  root.setAttribute('aria-hidden', 'true');
  const slides = h('div', 'screensaver__slides');
  const pill = h('div', 'pill card glass');
  const pillTime = h('span', 'pill__time');
  const pillNext = h('span', 'pill__next');
  pill.append(pillTime, pillNext);
  root.append(slides, pill);
  host.append(root);

  let shownIndex: number | null = null;
  let current: HTMLElement | null = null;
  const leaving = new Map<HTMLElement, TimerHandle>();

  const dropLeaving = () => {
    for (const [el, t] of leaving) {
      deps.clock.clearTimeout(t);
      el.remove();
    }
    leaving.clear();
  };

  const slideFor = (s: AppState, index: number): HTMLElement | null => {
    const mode = s.settings.display.screensaverMode;
    const panels = deps.panels();
    const panel = panels.length ? panels[index % panels.length]! : null;
    const photo =
      deps.photoSlide && mode !== 'panels'
        ? mode === 'photos' || index % 2 === 1
          ? deps.photoSlide(index)
          : null
        : null;
    if (photo) return photo;
    if (mode === 'photos' && !panel) return null;
    return panel ? renderPanel(panel) : null;
  };

  const show = (el: HTMLElement | null) => {
    // Never more than two: anything still fading out goes now.
    dropLeaving();
    if (current) {
      const old = current;
      old.classList.remove('slide--in');
      leaving.set(
        old,
        deps.clock.setTimeout(() => {
          leaving.delete(old);
          old.remove();
        }, SLIDE_FADE_MS),
      );
    }
    current = el;
    if (el) {
      el.classList.add('slide');
      slides.append(el);
      // Next frame in real browsers; harmless immediately in tests.
      el.classList.add('slide--in');
    }
  };

  return {
    render(s) {
      const slot = screensaverSlot({
        now: s.now,
        intervalMs: s.settings.display.panelIntervalSec * 1000,
        days: s.days,
        suppressed: Boolean(s.azan) || deps.suppressed(s),
      });
      const active = slot.kind === 'slide';
      toggleClass(root, 'screensaver--active', active);
      root.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (!active) {
        if (current) show(null);
        shownIndex = null;
        return;
      }
      if (slot.index !== shownIndex) {
        shownIndex = slot.index;
        show(slideFor(s, slot.index));
      }
      const lang = s.settings.display.language;
      const locale = INTL_LOCALE[lang];
      const tz = s.settings.location?.tz ?? 'UTC';
      setText(
        pillTime,
        formatTime(s.now, { tz, hour12: s.settings.display.hour12, seconds: false, locale }),
      );
      if (s.period) {
        setText(
          pillNext,
          `${prayerName(lang, s.period.next)} · ${formatCountdown(s.period.end.getTime() - s.now.getTime(), locale)}`,
        );
      }
      const corner = pillCorner(s.now);
      for (const c of ['top-start', 'top-end', 'bottom-end', 'bottom-start'])
        toggleClass(pill, `pill--${c}`, c === corner);
    },
  };
}
