// One reflection panel (brief §8.6): editorial type, Arabic above the translation,
// the source in small caps underneath.
import type { Panel } from '../core/panels';
import { h } from './dom';

export function renderPanel(panel: Panel): HTMLElement {
  const el = h('figure', 'panel');
  el.dataset.panel = panel.id;
  const text = h('blockquote', `panel__text panel__text--${panel.lang}`, panel.text);
  text.lang = panel.lang;
  text.dir = panel.lang === 'ar' ? 'rtl' : 'ltr';
  el.append(text);
  if (panel.translation) {
    const tr = h('p', 'panel__translation', panel.translation);
    tr.lang = 'en';
    el.append(tr);
  }
  if (panel.source) el.append(h('figcaption', 'panel__source', panel.source));
  return el;
}
