// /styleguide (dev only, brief §8.10): every theme, period gradient and base
// component side by side. The manual visual-review surface that replaces
// screenshot tests; open it on the real iPad at each UI milestone.
import { PRAYERS } from '../core/prayerTimes';
import { contrast, blend, composite } from '../design/contrast';
import {
  applyTokens,
  periodGradients,
  THEME_NAMES,
  themes,
  type ThemeName,
} from '../design/tokens';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Extra samples registered by view modules (clock, ring, timeline, …). */
export type Sample = { title: string; render: (host: HTMLElement, theme: ThemeName) => void };
const samples: Sample[] = [];
export function registerSample(s: Sample): void {
  samples.push(s);
}

function themeSection(theme: ThemeName): HTMLElement {
  const section = el('section', 'sg-theme');
  applyTokens(section, theme);
  section.append(el('h2', 'sg-title', theme));

  const swatches = el('div', 'sg-row');
  const colors: Record<string, string> = { ...themes[theme] };
  for (const [name, value] of Object.entries(colors)) {
    const s = el('div', 'sg-swatch');
    s.style.background = value;
    s.append(el('span', 'sg-label', name));
    swatches.append(s);
  }
  section.append(swatches);

  const periods = el('div', 'sg-row');
  for (const p of PRAYERS) {
    const [a, b] = periodGradients[theme][p];
    const tile = el('div', 'sg-period');
    tile.style.background = `linear-gradient(160deg, ${a}, ${b})`;
    const mid = composite(blend(a, b, 0.5), themes[theme].bg1);
    tile.dataset.period = p;
    tile.append(
      el('strong', '', p),
      el('span', 'sg-label', `${contrast(themes[theme].text1, mid).toFixed(1)}:1`),
    );
    periods.append(tile);
  }
  section.append(periods);

  const components = el('div', 'sg-row');
  const card = el('div', 'card sg-card', 'Card');
  const pill = el('button', 'pill-button touch-target', 'Pill');
  const accent = el('button', 'pill-button pill-button--accent touch-target', 'Accent');
  const start = el('button', 'start-button touch-target');
  start.append(el('span', 'start-button__ring'), el('span', 'start-button__label', 'Start'));
  const danger = el('button', 'start-button start-button--danger touch-target');
  danger.append(el('span', 'start-button__ring'), el('span', 'start-button__label', 'Enable'));
  const toast = el('div', 'toast', 'Update available');
  components.append(card, pill, accent, start, danger, toast);
  section.append(components);

  for (const s of samples) {
    const host = el('div', 'sg-sample');
    host.append(el('h3', 'sg-label', s.title));
    s.render(host, theme);
    section.append(host);
  }
  return section;
}

export function mountStyleguide(root: HTMLElement): void {
  document.body.style.overflow = 'auto';
  root.replaceChildren(...THEME_NAMES.map(themeSection));
}
