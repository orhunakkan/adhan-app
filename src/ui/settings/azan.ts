// Azan (brief §7, §9): enable per prayer, audio per prayer (bundled makam or an
// uploaded file), upload, Test, dua after the azan, late window, pre-alert.
import { DEFAULT_AUDIO, type Settings } from '../../config/schema';
import { AZAN_PRAYERS } from '../../core/prayerTimes';
import { prayerName, t } from '../../i18n';
import { uploadMessage } from './uploadMessage';
import { h } from '../dom';
import { actionButton, group, select, stepper, toggle } from './controls';
import { updateSettingsOrToast, type SettingsContext, type SettingsSection } from './shell';

/** Bundled files the README tells the owner to add under public/audio (never committed). */
export const BUNDLED_SOURCES = [
  { value: 'bundled:saba-sabah', label: 'Saba (sabah)' },
  { value: 'bundled:saba', label: 'Saba' },
  { value: 'bundled:ussak', label: 'Uşşak' },
  { value: 'bundled:rast', label: 'Rast' },
  { value: 'bundled:segah', label: 'Segâh' },
  { value: 'bundled:hicaz', label: 'Hicaz' },
  { value: 'bundled:huseyni', label: 'Hüseynî' },
  { value: 'bundled:dua', label: 'Dua' },
] as const;

function sourceOptions(ctx: SettingsContext, current: string) {
  const opts: Array<{ value: string; label: string }> = [...BUNDLED_SOURCES];
  if (current.startsWith('user:'))
    opts.unshift({ value: current, label: t(ctx.lang, 'azan.uploaded') });
  return opts;
}

const update = (ctx: SettingsContext, azan: Settings['azan']) =>
  updateSettingsOrToast(ctx, { azan });

function uploadButton(ctx: SettingsContext, key: string, onSource: (source: string) => void) {
  const input = h('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void ctx.services
      .saveAudio(file)
      .then(onSource, (err: unknown) => ctx.toast(uploadMessage(ctx.lang, err)));
  });
  const b = actionButton(t(ctx.lang, 'azan.upload'), () => input.click());
  b.dataset.key = `upload:${key}`;
  const wrap = h('span');
  wrap.append(input, b);
  return wrap;
}

export const azanSection: SettingsSection = {
  id: 'azan',
  render(pane, ctx) {
    const lang = ctx.lang;
    const azan = ctx.state.settings.azan;
    /** Merge against the live settings at click time. */
    const cur = () => ctx.app.state().settings.azan;
    const missing = ctx.state.audio.missing;

    for (const p of AZAN_PRAYERS) {
      const g = group(prayerName(lang, p));
      g.el.dataset.prayer = p;
      g.body.append(
        toggle(t(lang, 'azan.enabled'), azan.enabled[p], (v) =>
          update(ctx, { ...cur(), enabled: { ...cur().enabled, [p]: v } }),
        ),
        select(
          `${prayerName(lang, p)} · ${t(lang, 'azan.source')}`,
          sourceOptions(ctx, azan.audio[p]),
          azan.audio[p],
          (v) => update(ctx, { ...cur(), audio: { ...cur().audio, [p]: v } }),
        ),
      );
      if (missing.includes(azan.audio[p]) || missing.includes(DEFAULT_AUDIO[p])) {
        const warn = h('p', 'row row--warning', t(lang, 'azan.missing'));
        warn.setAttribute('role', 'note');
        g.body.append(warn);
      }
      const actions = h('div', 'row row--actions');
      const test = actionButton(t(lang, 'azan.test'), () => void ctx.app.testAudio(azan.audio[p]));
      test.dataset.key = `test:${p}`;
      const stop = actionButton(t(lang, 'azan.testStop'), () => ctx.app.stopTest());
      stop.dataset.key = `stop:${p}`;
      actions.append(
        test,
        stop,
        uploadButton(ctx, p, (source) =>
          update(ctx, { ...cur(), audio: { ...cur().audio, [p]: source } }),
        ),
      );
      g.body.append(actions);
      pane.append(g.el);
    }

    const extra = group();
    extra.body.append(
      toggle(t(lang, 'azan.dua'), azan.dua.enabled, (enabled) =>
        update(ctx, { ...cur(), dua: { ...cur().dua, enabled } }),
      ),
      select(
        t(lang, 'azan.duaSource'),
        sourceOptions(ctx, azan.dua.source),
        azan.dua.source,
        (source) => update(ctx, { ...cur(), dua: { ...cur().dua, source } }),
      ),
      stepper(
        t(lang, 'azan.lateWindow'),
        azan.lateWindowSec,
        { min: 30, max: 600, step: 30, format: (n) => t(lang, 'unit.seconds', { n }) },
        (lateWindowSec) => update(ctx, { ...cur(), lateWindowSec }),
      ),
      stepper(
        t(lang, 'azan.preAlert'),
        azan.preAlertMin,
        { min: 0, max: 60, format: (n) => t(lang, 'unit.minutes', { n }) },
        (preAlertMin) => update(ctx, { ...cur(), preAlertMin }),
      ),
    );
    pane.append(extra.el);
  },
};
