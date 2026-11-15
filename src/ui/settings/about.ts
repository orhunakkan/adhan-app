// About (brief §9): version, storage used (Blob sum; no estimate() on iOS 15), reset.
import { defaultSettings } from '../../config/defaults';
import { formatBytes } from '../../core/blobUsage';
import { INTL_LOCALE, t } from '../../i18n';
import { h } from '../dom';
import { actionButton, field, group } from './controls';
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

    if (ctx.state.updateAvailable) {
      const upd = actionButton(
        t(lang, 'about.update'),
        () => ctx.app.applyUpdate(),
        'pill-button--accent',
      );
      upd.dataset.key = 'apply-update';
      g.body.append(upd);
    }

    // Settings PIN (a convenience gate for a family kiosk; Guided Access is the strong control).
    const pinGroup = group(t(lang, 'pin.section'));
    if (ctx.state.settings.pin) {
      pinGroup.body.append(h('p', 'row', t(lang, 'pin.active')));
      const remove = actionButton(t(lang, 'pin.remove'), () =>
        ctx.app.updateSettings({ pin: null }),
      );
      remove.dataset.key = 'pin-remove';
      pinGroup.body.append(remove);
    } else {
      const pinInput = (label: string, key: string) => {
        const input = h('input', 'input touch-target');
        input.type = 'password';
        input.inputMode = 'numeric';
        input.maxLength = 4;
        input.autocomplete = 'off';
        input.dataset.key = key;
        input.setAttribute('aria-label', label);
        pinGroup.body.append(field(label, input));
        return input;
      };
      const first = pinInput(t(lang, 'pin.new'), 'pin-new');
      const second = pinInput(t(lang, 'pin.repeat'), 'pin-repeat');
      const save = actionButton(t(lang, 'pin.save'), () => {
        if (!/^\d{4}$/.test(first.value) || first.value !== second.value) {
          ctx.toast(t(lang, 'pin.mismatch'));
          return;
        }
        ctx.app.updateSettings({ pin: first.value });
        ctx.toast(t(lang, 'settings.saved'));
      });
      save.dataset.key = 'pin-save';
      pinGroup.body.append(save);
    }
    pane.append(pinGroup.el);

    const danger = group();
    let armed = false;
    const reset = actionButton(t(lang, 'about.reset'), () => {
      if (!armed) {
        armed = true;
        reset.textContent = t(lang, 'about.resetConfirm');
        reset.classList.add('pill-button--danger');
        return;
      }
      // Reset also removes uploaded audio files (nothing left behind).
      void ctx.services.clearFiles();
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
