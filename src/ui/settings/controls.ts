// Settings controls (brief §8.8): iPadOS-style grouped rows with toggles,
// segmented controls, steppers and selects; 48 px touch targets, real
// <button>/<select> elements with accessible names.
import { h } from '../dom';

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

export function group(title?: string): { el: HTMLElement; body: HTMLElement } {
  const el = h('section', 'group');
  if (title) el.append(h('h3', 'group__title', title));
  const body = h('div', 'group__body');
  el.append(body);
  return { el, body };
}

function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const r = h('div', 'row');
  const text = h('div', 'row__text');
  const l = h('span', 'row__label', label);
  l.id = nextId('label');
  text.append(l);
  if (hint) text.append(h('span', 'row__hint', hint));
  control.setAttribute('aria-labelledby', l.id);
  // Lets the sheet restore focus to the same control after a re-render.
  if (!control.dataset.key) control.dataset.key = label;
  r.append(text, control);
  return r;
}

export function toggle(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLElement {
  const b = h('button', 'switch touch-target');
  b.type = 'button';
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(checked));
  b.append(h('span', 'switch__thumb'));
  b.addEventListener('click', () => onChange(b.getAttribute('aria-checked') !== 'true'));
  return row(label, b);
}

export function segmented<T extends string>(
  label: string,
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const g = h('div', 'segmented');
  g.setAttribute('role', 'radiogroup');
  for (const o of options) {
    const b = h('button', 'segmented__option touch-target', o.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(o.value === value));
    b.dataset.value = o.value;
    b.dataset.key = `${label}:${o.value}`;
    b.addEventListener('click', () => onChange(o.value));
    g.append(b);
  }
  return row(label, g);
}

export function stepper(
  label: string,
  value: number,
  opts: { min: number; max: number; step?: number; format?: (v: number) => string },
  onChange: (v: number) => void,
): HTMLElement {
  const step = opts.step ?? 1;
  const g = h('div', 'stepper');
  g.setAttribute('role', 'group');
  const minus = h('button', 'stepper__button touch-target', '−');
  const plus = h('button', 'stepper__button touch-target', '+');
  const out = h('output', 'stepper__value', (opts.format ?? String)(value));
  out.setAttribute('aria-live', 'polite');
  minus.type = plus.type = 'button';
  minus.setAttribute('aria-label', `${label} −`);
  plus.setAttribute('aria-label', `${label} +`);
  minus.dataset.key = `${label}:-`;
  plus.dataset.key = `${label}:+`;
  minus.disabled = value - step < opts.min;
  plus.disabled = value + step > opts.max;
  minus.addEventListener('click', () => onChange(Math.max(opts.min, value - step)));
  plus.addEventListener('click', () => onChange(Math.min(opts.max, value + step)));
  g.append(minus, out, plus);
  return row(label, g);
}

export function select<T extends string>(
  label: string,
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const s = h('select', 'select touch-target');
  for (const o of options) {
    const opt = h('option', '', o.label);
    opt.value = o.value;
    opt.selected = o.value === value;
    s.append(opt);
  }
  s.addEventListener('change', () => onChange(s.value as T));
  return row(label, s);
}

export function actionButton(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const b = h('button', `pill-button touch-target ${variant}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
