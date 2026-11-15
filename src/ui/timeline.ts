// Six prayer chips with icons: past dimmed, current highlighted, next outlined (brief §8.4).
import type { AppState } from '../app/createApp';
import { PRAYERS, type PrayerName } from '../core/prayerTimes';
import { formatTime } from '../core/time';
import { INTL_LOCALE, prayerName } from '../i18n';
import { h, setHidden, setText, toggleAttr, toggleClass } from './dom';
import { prayerIcon } from './icons';

export const CHIP_STATES = ['past', 'current', 'next', 'upcoming'] as const;
export type ChipState = (typeof CHIP_STATES)[number];

export function mountTimeline(host: HTMLElement): { render(s: AppState): void } {
  const list = h('ol', 'timeline');
  const chips = new Map<PrayerName, { li: HTMLLIElement; name: HTMLElement; time: HTMLElement }>();
  for (const p of PRAYERS) {
    const li = h('li', 'chip');
    li.dataset.prayer = p;
    li.append(prayerIcon(p));
    const name = h('span', 'chip__name');
    const time = h('span', 'chip__time');
    li.append(name, time);
    list.append(li);
    chips.set(p, { li, name, time });
  }
  host.append(list);

  return {
    render(s) {
      setHidden(list, !s.days || !s.period);
      const { days, period } = s;
      const location = s.settings.location;
      if (!days || !period || !location) return;
      const lang = s.settings.display.language;
      const fmt = {
        tz: location.tz,
        hour12: s.settings.display.hour12,
        seconds: false,
        locale: INTL_LOCALE[lang],
      };
      const nowMs = s.now.getTime();
      for (const p of PRAYERS) {
        const c = chips.get(p)!;
        const isNext = p === period.next;
        // The next chip shows the actual next time (tomorrow's Fajr after Isha).
        const at = isNext ? period.end : days.today[p];
        const isCurrent = p === period.period && days.today[p].getTime() === period.start.getTime();
        const state: ChipState = isCurrent
          ? 'current'
          : isNext
            ? 'next'
            : at.getTime() <= nowMs
              ? 'past'
              : 'upcoming';
        setText(c.name, prayerName(lang, p));
        setText(c.time, formatTime(at, fmt));
        for (const k of CHIP_STATES) toggleClass(c.li, `chip--${k}`, k === state);
        toggleAttr(c.li, 'aria-current', isCurrent ? 'time' : null);
      }
    },
  };
}
