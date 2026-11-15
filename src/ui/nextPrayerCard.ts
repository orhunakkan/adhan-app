// "Next prayer" hero card: name, time, and the ring with the live countdown (brief §8.4).
import type { AppState } from '../app/createApp';
import { formatTime } from '../core/time';
import { INTL_LOCALE, prayerName, t } from '../i18n';
import { h, setHidden, setText } from './dom';
import { createProgressRing } from './progressRing';

const countdownFormats = new Map<string, { pad: Intl.NumberFormat; plain: Intl.NumberFormat }>();

/** Formatters are cached per locale: the countdown renders every second. */
function formatsFor(locale: string) {
  let f = countdownFormats.get(locale);
  if (!f) {
    f = {
      pad: new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }),
      plain: new Intl.NumberFormat(locale),
    };
    countdownFormats.set(locale, f);
  }
  return f;
}

export function formatCountdown(ms: number, locale: string): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const { pad, plain } = formatsFor(locale);
  return `${hh > 0 ? `${plain.format(hh)}:` : ''}${pad.format(mm)}:${pad.format(ss)}`;
}

export function mountNextPrayerCard(host: HTMLElement): { render(s: AppState): void } {
  const card = h('div', 'next-card card glass');
  const label = h('p', 'next-card__label');
  const name = h('p', 'next-card__name');
  const time = h('p', 'next-card__time');
  const ringWrap = h('div', 'next-card__ring');
  const ring = createProgressRing();
  const countdown = h('p', 'next-card__countdown');
  countdown.setAttribute('role', 'timer');
  const remaining = h('p', 'next-card__remaining');
  const center = h('div', 'next-card__center');
  center.append(countdown, remaining);
  ringWrap.append(ring.el, center);
  card.append(label, name, time, ringWrap);
  host.append(card);

  return {
    render(s) {
      setHidden(card, !s.period);
      const { period } = s;
      if (!period || !s.settings.location) return;
      const lang = s.settings.display.language;
      const locale = INTL_LOCALE[lang];
      setText(label, t(lang, 'clock.next'));
      setText(name, prayerName(lang, period.next));
      setText(
        time,
        formatTime(period.end, {
          tz: s.settings.location.tz,
          hour12: s.settings.display.hour12,
          seconds: false,
          locale,
        }),
      );
      setText(countdown, formatCountdown(period.end.getTime() - s.now.getTime(), locale));
      setText(remaining, t(lang, 'clock.remaining'));
      ring.setProgress(period.progress);
    },
  };
}
