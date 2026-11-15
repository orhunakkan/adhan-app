// The azan moment (brief §8.5): full-screen takeover with the prayer name in
// the UI language and Arabic, its time, a slow breathing glow, the audio
// progress and a Stop button; the dua text while the dua plays.
import type { AppState } from '../app/createApp';
import { formatTime } from '../core/time';
import { INTL_LOCALE, prayerName, t } from '../i18n';
import { h, setAttr, setOwnInert, setText, toggleClass } from './dom';

export interface AzanViewDeps {
  onStop(): void;
  position(): { current: number; duration: number };
}

export function mountAzanView(
  host: HTMLElement,
  deps: AzanViewDeps,
): { render(s: AppState): void } {
  const root = h('section', 'azan');
  root.setAttribute('aria-live', 'assertive');
  root.setAttribute('aria-hidden', 'true');
  const glow = h('div', 'azan__glow');
  glow.setAttribute('aria-hidden', 'true');
  const label = h('p', 'azan__label');
  const name = h('h1', 'azan__name');
  const arabic = h('p', 'azan__arabic');
  arabic.lang = 'ar';
  arabic.dir = 'rtl';
  const time = h('p', 'azan__time');
  const dua = h('div', 'azan__dua');
  const duaTitle = h('p', 'azan__dua-title');
  const duaText = h('p', 'azan__dua-text');
  dua.append(duaTitle, duaText);
  const progress = h('div', 'azan__progress');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  const bar = h('div', 'azan__progress-bar');
  progress.append(bar);
  const stop = h('button', 'pill-button touch-target azan__stop');
  stop.type = 'button';
  stop.addEventListener('click', () => deps.onStop());
  root.append(glow, label, name, arabic, time, dua, progress, stop);
  host.append(root);

  let lastPct = -1;
  return {
    render(s) {
      const az = s.azan;
      const on = az !== null;
      toggleClass(root, 'azan--visible', on);
      setAttr(root, 'aria-hidden', on ? 'false' : 'true');
      setOwnInert(root, !on);
      toggleClass(glow, 'azan__glow--breathing', !s.reducedMotion);
      if (!az) return;
      const lang = s.settings.display.language;
      setText(label, t(lang, 'azan.label'));
      setText(name, prayerName(lang, az.prayer));
      setText(arabic, lang === 'ar' ? '' : prayerName('ar', az.prayer));
      arabic.hidden = lang === 'ar';
      const tz = s.settings.location?.tz ?? 'UTC';
      setText(
        time,
        t(lang, 'azan.time', {
          time: formatTime(az.at, {
            tz,
            hour12: s.settings.display.hour12,
            seconds: false,
            locale: INTL_LOCALE[lang],
          }),
        }),
      );
      const isDua = s.audio.phase === 'dua';
      dua.hidden = !isDua;
      if (isDua) {
        setText(duaTitle, t(lang, 'dua.title'));
        setText(duaText, t(lang, 'dua.text'));
      }
      setText(stop, t(lang, 'azan.stop'));
      if (progress.getAttribute('aria-label') !== t(lang, 'azan.progress')) {
        progress.setAttribute('aria-label', t(lang, 'azan.progress'));
      }
      const { current, duration } = deps.position();
      const pct = duration > 0 ? Math.min(100, Math.round((current / duration) * 100)) : 0;
      if (pct !== lastPct) {
        lastPct = pct;
        bar.style.transform = `scaleX(${pct / 100})`;
        progress.setAttribute('aria-valuenow', String(pct));
      }
    },
  };
}
