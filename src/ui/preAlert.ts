// Pre-alert pill sliding down N minutes before a prayer: "Akşam vaktine 10 dk" (brief §8.4).
import type { AppState } from '../app/createApp';
import { prayerName, t } from '../i18n';
import { h, setText } from './dom';

export function mountPreAlert(host: HTMLElement): { render(s: AppState): void } {
  const pill = h('div', 'prealert');
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-live', 'polite');
  pill.hidden = true;
  host.append(pill);
  return {
    render(s) {
      const pre = s.preAlert;
      pill.hidden = !pre || Boolean(s.azan);
      if (!pre) return;
      const lang = s.settings.display.language;
      const n = Math.max(1, Math.ceil((pre.at.getTime() - s.now.getTime()) / 60_000));
      setText(pill, t(lang, 'prealert.text', { prayer: prayerName(lang, pre.prayer), n }));
    },
  };
}
