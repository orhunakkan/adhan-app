// Hidden diagnostics (brief §14), reached from About. Everything a family
// member can read out over the phone when the azan didn't play.
import { formatBytes } from '../core/blobUsage';
import { INTL_LOCALE, t, type MessageKey } from '../i18n';
import { h } from './dom';
import { group } from './settings/controls';
import type { SettingsSection } from './settings/shell';

export const debugSection: SettingsSection = {
  id: 'debug',
  hidden: true,
  render(pane, ctx) {
    const lang = ctx.lang;
    const s = ctx.state;
    const info = ctx.app.debug();
    const none = t(lang, 'debug.none');
    const g = group(t(lang, 'debug.title'));
    const row = (key: MessageKey | 'version', value: string) => {
      const r = h('div', 'row debug__row');
      r.dataset.debug = key;
      r.append(
        h('span', 'row__label', key === 'version' ? t(lang, 'about.version') : t(lang, key)),
        h('span', 'debug__value', value),
      );
      g.body.append(r);
      return r;
    };
    row('version', `v${info.version}`);
    row('debug.sw', info.serviceWorker);
    row('debug.wakeLock', s.wakeLock);
    row('debug.audio', `${s.audio.status}${s.audio.phase ? ` · ${s.audio.phase}` : ''}`);
    row(
      'debug.health',
      s.lastHealthCheck
        ? `${s.lastHealthCheck.ok ? 'OK' : 'FAILED'} · ${s.lastHealthCheck.at.toISOString()}`
        : none,
    );
    row('debug.lastFired', info.lastFired ?? none);
    row('debug.reloads', String(info.reloads));
    const storage = row('about.storage', '…');
    void ctx.services
      .storageUsed()
      .then((b) => (storage.lastElementChild!.textContent = formatBytes(b, INTL_LOCALE[lang])));
    row('debug.period', `${s.period?.period ?? none} / ${s.settings.display.theme}`);
    pane.append(g.el);

    const logGroup = group(t(lang, 'debug.log'));
    const pre = h('pre', 'debug__log');
    pre.dir = 'ltr';
    pre.textContent = [...info.log]
      .reverse()
      .map(
        (e) =>
          `${e.at} ${e.level.toUpperCase()} ${e.msg}${e.data === undefined ? '' : ` ${JSON.stringify(e.data)}`}`,
      )
      .join('\n');
    logGroup.body.append(pre);
    pane.append(logGroup.el);
  },
};
