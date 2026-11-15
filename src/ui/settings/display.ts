// Display (brief §9): theme, language (RTL), 12/24 h, seconds, panels, screensaver,
// pattern, glass, night dim schedule and opacity.
import { LANGUAGES, SCREENSAVER_MODES, THEMES, type Settings } from '../../config/schema';
import { t } from '../../i18n';
import { group, segmented, stepper, toggle } from './controls';
import type { SettingsContext, SettingsSection } from './shell';

const LANGUAGE_NAMES = { tr: 'Türkçe', en: 'English', ar: 'العربية' } as const;

function update(ctx: SettingsContext, display: Settings['display']) {
  try {
    ctx.app.updateSettings({ display });
  } catch {
    ctx.toast(t(ctx.lang, 'settings.invalid'));
  }
}

export const displaySection: SettingsSection = {
  id: 'display',
  render(pane, ctx) {
    const lang = ctx.lang;
    const d = ctx.state.settings.display;
    /** Merge against the live settings at click time, not the ones this pane was drawn with. */
    const cur = () => ctx.app.state().settings.display;
    const look = group();
    look.body.append(
      segmented(
        t(lang, 'display.theme'),
        THEMES.map((v) => ({ value: v, label: t(lang, `theme.${v}`) })),
        d.theme,
        (theme) => update(ctx, { ...cur(), theme }),
      ),
      segmented(
        t(lang, 'display.language'),
        LANGUAGES.map((v) => ({ value: v, label: LANGUAGE_NAMES[v] })),
        d.language,
        (language) => update(ctx, { ...cur(), language }),
      ),
      segmented(
        t(lang, 'display.hourFormat'),
        [
          { value: '24', label: '24' },
          { value: '12', label: '12' },
        ],
        d.hour12 ? '12' : '24',
        (v) => update(ctx, { ...cur(), hour12: v === '12' }),
      ),
      toggle(t(lang, 'display.seconds'), d.showSeconds, (showSeconds) =>
        update(ctx, { ...cur(), showSeconds }),
      ),
      toggle(t(lang, 'display.pattern'), d.pattern, (pattern) =>
        update(ctx, { ...cur(), pattern }),
      ),
      toggle(t(lang, 'display.glass'), d.glass, (glass) => update(ctx, { ...cur(), glass })),
    );
    pane.append(look.el);

    const saver = group(t(lang, 'display.screensaver'));
    saver.body.append(
      segmented(
        t(lang, 'display.screensaver'),
        SCREENSAVER_MODES.map((v) => ({ value: v, label: t(lang, `screensaver.${v}`) })),
        d.screensaverMode,
        (screensaverMode) => update(ctx, { ...cur(), screensaverMode }),
      ),
      stepper(
        t(lang, 'display.panelInterval'),
        d.panelIntervalSec,
        { min: 15, max: 600, step: 15, format: (n) => t(lang, 'unit.seconds', { n }) },
        (panelIntervalSec) => update(ctx, { ...cur(), panelIntervalSec }),
      ),
    );
    pane.append(saver.el);

    const night = group(t(lang, 'display.nightDim'));
    const nd = d.nightDim;
    const setNight = (patch: Partial<Settings['display']['nightDim']>) =>
      update(ctx, { ...cur(), nightDim: { ...nd, ...patch } });
    night.body.append(
      toggle(t(lang, 'display.nightDim'), nd.enabled, (enabled) => setNight({ enabled })),
      stepper(
        t(lang, 'display.nightDimAfter'),
        nd.afterIshaMin,
        { min: 0, max: 240, step: 15, format: (n) => t(lang, 'unit.minutes', { n }) },
        (afterIshaMin) => setNight({ afterIshaMin }),
      ),
      stepper(
        t(lang, 'display.nightDimBefore'),
        nd.beforeFajrMin,
        { min: 0, max: 240, step: 15, format: (n) => t(lang, 'unit.minutes', { n }) },
        (beforeFajrMin) => setNight({ beforeFajrMin }),
      ),
      stepper(
        t(lang, 'display.nightDimOpacity'),
        Math.round(nd.opacity * 10),
        { min: 0, max: 10, format: (n) => t(lang, 'unit.percent', { n: n * 10 }) },
        (v) => setNight({ opacity: v / 10 }),
      ),
    );
    pane.append(night.el);
  },
};
