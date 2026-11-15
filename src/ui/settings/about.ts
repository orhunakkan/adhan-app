// About (brief §9): version, storage used (Blob sum; no estimate() on iOS 15), reset.
import { defaultSettings } from '../../config/defaults';
import { formatBytes } from '../../core/blobUsage';
import { INTL_LOCALE, t } from '../../i18n';
import { h } from '../dom';
import { actionButton, group } from './controls';
import type { SettingsSection } from './shell';

export const aboutSection: SettingsSection = {
  id: 'about',
  render(pane, ctx) {
    const lang = ctx.lang;
    const g = group();
    const version = h('div', 'row');
    version.append(
      h('span', 'row__label', t(lang, 'about.version')),
      h('span', 'about__version', `v${__APP_VERSION__}`),
    );
    const storage = h('div', 'row');
    const used = h('span', 'about__storage', '…');
    storage.append(h('span', 'row__label', t(lang, 'about.storage')), used);
    void ctx.services
      .storageUsed()
      .then((bytes) => (used.textContent = formatBytes(bytes, INTL_LOCALE[lang])));
    g.body.append(version, storage);
    pane.append(g.el);

    const danger = group();
    let armed = false;
    const reset = actionButton(t(lang, 'about.reset'), () => {
      if (!armed) {
        armed = true;
        reset.textContent = t(lang, 'about.resetConfirm');
        reset.classList.add('pill-button--danger');
        return;
      }
      ctx.app.updateSettings(defaultSettings);
      ctx.toast(t(defaultSettings.display.language, 'settings.saved'));
    });
    reset.dataset.key = 'reset';
    const debug = actionButton(t(lang, 'about.debug'), () => ctx.navigate('debug'));
    debug.dataset.key = 'debug';
    danger.body.append(debug, reset);
    pane.append(danger.el);
  },
};
