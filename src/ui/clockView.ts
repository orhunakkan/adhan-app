// The large clock with Gregorian and Hijri dates and the location (brief §8.4).
import type { AppState } from '../app/createApp';
import { formatHijri } from '../core/hijri';
import { formatDate, timeParts } from '../core/time';
import { INTL_LOCALE, t } from '../i18n';
import { h, setText, toggleClass } from './dom';

export interface ClockView {
  render(s: AppState): void;
}

/** Device zone, used only until a location is configured. */
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function mountClockView(host: HTMLElement): ClockView {
  const root = h('div', 'clock');
  const time = h('p', 'clock__time');
  const hm = h('span', 'clock__hm');
  const sec = h('span', 'clock__sec');
  const ampm = h('span', 'clock__ampm');
  time.append(hm, sec, ampm);
  const date = h('p', 'clock__date');
  const hijri = h('p', 'clock__hijri');
  const place = h('p', 'clock__location');
  const prompt = h('p', 'clock__prompt');
  root.append(time, date, hijri, place, prompt);
  host.append(root);

  let dateKey = '';
  return {
    render(s) {
      const { display, location } = s.settings;
      const lang = display.language;
      const locale = INTL_LOCALE[lang];
      const tz = location?.tz ?? deviceZone();
      const parts = timeParts(s.now, {
        tz,
        locale,
        hour12: display.hour12,
        seconds: display.showSeconds,
      });
      setText(hm, parts.hm);
      setText(sec, parts.seconds ? `:${parts.seconds}` : '');
      setText(ampm, parts.dayPeriod);
      toggleClass(root, 'clock--seconds', display.showSeconds);

      // Dates change once a day; only re-format when the calendar day or language changes.
      const key = `${s.days?.today.dateKey ?? ''}|${lang}|${tz}|${s.now.toDateString()}`;
      if (key !== dateKey) {
        dateKey = key;
        setText(date, formatDate(s.now, { tz, locale }));
        const hij = formatHijri(s.now, { tz, locale });
        setText(hijri, hij ?? '');
        hijri.hidden = hij === null;
      }
      setText(place, location?.name ?? t(lang, 'location.missing'));
      setText(prompt, s.needsLocation ? t(lang, 'location.prompt') : '');
      prompt.hidden = !s.needsLocation;
    },
  };
}
