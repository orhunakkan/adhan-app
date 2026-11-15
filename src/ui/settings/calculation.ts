// Calculation (brief §5): method, madhab, high-latitude rule, per-prayer offsets.
import type { Settings } from '../../config/schema';
import {
  CALCULATION_METHODS,
  HIGH_LATITUDE_RULES,
  MADHABS,
  OFFSET_LIMIT_MIN,
  PRAYERS,
  type CalculationMethodName,
} from '../../core/prayerTimes';
import { prayerName, t } from '../../i18n';
import { group, segmented, select, stepper } from './controls';
import type { SettingsContext, SettingsSection } from './shell';

/** Proper names of the adhan-js methods (not translated). */
export const METHOD_LABELS: Record<CalculationMethodName, string> = {
  MuslimWorldLeague: 'Muslim World League',
  Egyptian: 'Egyptian General Authority',
  Karachi: 'University of Islamic Sciences, Karachi',
  UmmAlQura: 'Umm al-Qura, Makkah',
  Dubai: 'Dubai',
  MoonsightingCommittee: 'Moonsighting Committee',
  NorthAmerica: 'ISNA (North America)',
  Kuwait: 'Kuwait',
  Qatar: 'Qatar',
  Singapore: 'Singapore',
  Tehran: 'Tehran',
  Turkey: 'Diyanet (Türkiye)',
};

function update(ctx: SettingsContext, calc: Settings['calc']) {
  try {
    ctx.app.updateSettings({ calc });
  } catch {
    ctx.toast(t(ctx.lang, 'settings.invalid'));
  }
}

export const calculationSection: SettingsSection = {
  id: 'calculation',
  render(pane, ctx) {
    const lang = ctx.lang;
    const calc = ctx.state.settings.calc;
    /** Merge against the live settings at click time. */
    const cur = () => ctx.app.state().settings.calc;
    const main = group();
    main.body.append(
      select(
        t(lang, 'calc.method'),
        CALCULATION_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] })),
        calc.method,
        (method) => update(ctx, { ...cur(), method }),
      ),
      segmented(
        t(lang, 'calc.madhab'),
        MADHABS.map((m) => ({ value: m, label: t(lang, `calc.madhab.${m}`) })),
        calc.madhab,
        (madhab) => update(ctx, { ...cur(), madhab }),
      ),
      select(
        t(lang, 'calc.highLat'),
        HIGH_LATITUDE_RULES.map((r) => ({ value: r, label: t(lang, `calc.highLat.${r}`) })),
        calc.highLatitudeRule,
        (highLatitudeRule) => update(ctx, { ...cur(), highLatitudeRule }),
      ),
    );
    pane.append(main.el);

    const offsets = group(t(lang, 'calc.offsets'));
    for (const p of PRAYERS) {
      offsets.body.append(
        stepper(
          prayerName(lang, p),
          calc.offsets[p],
          {
            min: -OFFSET_LIMIT_MIN,
            max: OFFSET_LIMIT_MIN,
            format: (v) => t(lang, 'offset.minutes', { n: v > 0 ? `+${v}` : v }),
          },
          (v) => update(ctx, { ...cur(), offsets: { ...cur().offsets, [p]: v } }),
        ),
      );
    }
    pane.append(offsets.el);
  },
};
