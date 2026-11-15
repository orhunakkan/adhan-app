// Screensaver (brief §8.6, §9): panels and/or photos full-bleed, with the clock
// and next prayer as a compact pill whose corner rotates every 10 minutes.
// At most two slide nodes exist at once (current + the one fading out), and a
// photo slide's object URL is released the moment it leaves the DOM.
import type { AppState } from '../app/createApp';
import { pillCorner } from '../core/burnIn';
import { screensaverSlot, type Panel } from '../core/panels';
import type { PhotoSlide } from '../core/photos';
import type { Clock, TimerHandle } from '../core/ports';
import { formatTime } from '../core/time';
import { INTL_LOCALE, prayerName } from '../i18n';
import { h, setText, toggleClass } from './dom';
import { formatCountdown } from './nextPrayerCard';
import { renderPanel } from './panels';

export const SLIDE_FADE_MS = 600;
const CORNERS = ['top-start', 'top-end', 'bottom-end', 'bottom-start'] as const;

export interface ScreensaverDeps {
  clock: Clock;
  /** Shuffled panels, or [] until loaded. */
  panels: () => readonly Panel[];
  /** The next photo slide, or null if none is ready (a panel is shown instead). */
  photoSlide?: () => PhotoSlide | null;
  /** Called during clock time so the next photo is loaded before its slide. */
  primePhotos?: () => void;
  /** Night dim or settings open: keep the clock. */
  suppressed: (s: AppState) => boolean;
}

export function mountScreensaver(
  host: HTMLElement,
  deps: ScreensaverDeps,
): { render(s: AppState): void; destroy(): void } {
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
  let current: PhotoSlide | null = null;
  const leaving = new Map<PhotoSlide, TimerHandle>();

  /** Removes a slide from the DOM and releases its resources (photo object URL). */
  const discard = (el: PhotoSlide) => {
    el.remove();
    el.release?.();
  };

  const dropLeaving = () => {
    for (const [el, timer] of leaving) {
      deps.clock.clearTimeout(timer);
      discard(el);
    }
    leaving.clear();
  };

  const slideFor = (s: AppState, index: number): PhotoSlide | null => {
    const mode = s.settings.display.screensaverMode;
    const wantsPhoto = mode === 'photos' || (mode === 'alternate' && index % 2 === 1);
    const photo = wantsPhoto ? (deps.photoSlide?.() ?? null) : null;
    if (photo) {
      toggleClass(photo, 'photo--kenburns', !s.reducedMotion);
      return photo;
    }
    const panels = deps.panels();
    return panels.length ? renderPanel(panels[index % panels.length]!) : null;
  };

  const show = (el: PhotoSlide | null) => {
    // Never more than two: anything still fading out goes now.
    dropLeaving();
    if (current) {
      const old = current;
      old.classList.remove('slide--in');
      leaving.set(
        old,
        deps.clock.setTimeout(() => {
          leaving.delete(old);
          discard(old);
        }, SLIDE_FADE_MS),
      );
    }
    current = el;
    if (el) {
      el.classList.add('slide');
      slides.append(el);
      el.classList.add('slide--in');
    }
  };

  return {
    destroy() {
      dropLeaving();
      if (current) discard(current);
      current = null;
      root.remove();
    },
    render(s) {
      const display = s.settings.display;
      const slot = screensaverSlot({
        now: s.now,
        intervalMs: display.panelIntervalSec * 1000,
        days: s.days,
        suppressed: Boolean(s.azan) || deps.suppressed(s),
      });
      const active = slot.kind === 'slide';
      toggleClass(root, 'screensaver--active', active);
      root.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (slot.kind === 'clock') {
        if (current) show(null);
        shownIndex = null;
        if (display.screensaverMode !== 'panels') deps.primePhotos?.();
        return;
      }
      if (slot.index !== shownIndex) {
        shownIndex = slot.index;
        show(slideFor(s, slot.index));
      }
      const lang = display.language;
      const locale = INTL_LOCALE[lang];
      const tz = s.settings.location?.tz ?? 'UTC';
      setText(pillTime, formatTime(s.now, { tz, hour12: display.hour12, seconds: false, locale }));
      if (s.period) {
        const left = formatCountdown(s.period.end.getTime() - s.now.getTime(), locale);
        setText(pillNext, `${prayerName(lang, s.period.next)} · ${left}`);
      }
      const corner = pillCorner(s.now);
      for (const c of CORNERS) toggleClass(pill, `pill--${c}`, c === corner);
    },
  };
}
