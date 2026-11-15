// "Tap to Start", the danger "Tap to enable azan" and the Resume bar (brief §7, §8.7).
import { LANGS, t, type Lang } from '../i18n';

export type OverlayKind = 'start' | 'enableAzan' | 'resume' | null;

export interface OverlayDeps {
  onStart(): void;
  onEnable(): void;
  onResume(): void;
  /** Content behind the overlay, made inert while a modal overlay is open. */
  background: HTMLElement;
}

export interface OverlayView {
  render(s: { overlay: OverlayKind; lang: Lang }): void;
  destroy(): void;
}

export function mountOverlay(root: HTMLElement, deps: OverlayDeps): OverlayView {
  const layer = document.createElement('div');
  layer.className = 'overlay-layer';
  root.append(layer);
  let shown: string | null = null;

  const modal = (danger: boolean, lang: Lang) => {
    const el = document.createElement('div');
    el.className = `overlay${danger ? ' overlay--danger' : ''}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-live', danger ? 'assertive' : 'polite');
    el.setAttribute('aria-labelledby', 'overlay-label');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `start-button touch-target${danger ? ' start-button--danger' : ''}`;
    button.innerHTML = '<span class="start-button__ring" aria-hidden="true"></span>';
    const label = document.createElement('span');
    label.id = 'overlay-label';
    label.className = 'start-button__label';
    label.textContent = t(lang, danger ? 'enable.tap' : 'start.tap');
    button.append(label);
    button.addEventListener('click', () => (danger ? deps.onEnable() : deps.onStart()));
    el.append(button);
    if (danger) {
      // A family member may not read the UI language: say it in all three.
      const all = document.createElement('div');
      all.className = 'overlay__languages';
      for (const l of LANGS) {
        const p = document.createElement('p');
        p.lang = l;
        p.dir = l === 'ar' ? 'rtl' : 'ltr';
        p.textContent = t(l, 'enable.tap');
        all.append(p);
      }
      el.append(all);
    } else {
      const title = document.createElement('p');
      title.className = 'overlay__title';
      title.textContent = t(lang, 'app.name');
      const hint = document.createElement('p');
      hint.className = 'overlay__hint';
      hint.textContent = t(lang, 'start.hint');
      el.append(title, hint);
    }
    // Focus trap: the dialog has one control, so Tab keeps focus on it.
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        button.focus();
      }
    });
    return { el, focus: () => button.focus() };
  };

  const resumeBar = (lang: Lang) => {
    const el = document.createElement('div');
    el.className = 'resume-bar';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pill-button touch-target';
    button.textContent = t(lang, 'azan.resume');
    button.addEventListener('click', () => deps.onResume());
    el.append(button);
    return { el, focus: () => button.focus() };
  };

  return {
    render({ overlay, lang }) {
      const id = overlay ? `${overlay}:${lang}` : null;
      if (id === shown) return;
      shown = id;
      layer.replaceChildren();
      const isModal = overlay === 'start' || overlay === 'enableAzan';
      deps.background.inert = isModal;
      if (!overlay) return;
      const view = overlay === 'resume' ? resumeBar(lang) : modal(overlay === 'enableAzan', lang);
      layer.append(view.el);
      view.focus();
    },
    destroy() {
      deps.background.inert = false;
      layer.remove();
    },
  };
}
