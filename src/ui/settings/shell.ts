// Settings sheet (brief §8.8, §9): opened by a 3 s long-press on a corner,
// optionally behind a 4-digit PIN. Landscape: sidebar + pane. Portrait:
// drill-down list. A translucent sheet, so changes preview live behind it.
import type { App, AppState } from '../../app/createApp';
import type { City } from '../../core/cities';
import type { Clock, GeolocationPort, TimerHandle } from '../../core/ports';
import { t, type Lang, type MessageKey } from '../../i18n';
import { h, toggleClass } from '../dom';

export const LONG_PRESS_MS = 3000;

export type SectionId =
  'location' | 'calculation' | 'azan' | 'display' | 'photos' | 'about' | 'debug';

export interface SettingsServices {
  geolocation: GeolocationPort;
  /** Lazy: the 460 KB city list is fetched only when the Location section needs it. */
  loadCities(): Promise<City[]>;
  /** Stores an uploaded audio file in IndexedDB; resolves to its 'user:<key>' source. */
  saveAudio(file: Blob): Promise<string>;
  /** Bytes used by uploaded files. */
  storageUsed(): Promise<number>;
  /** Resizes, stores and appends photos to settings.photos (rejects with UploadError). */
  savePhotos(files: Blob[]): Promise<void>;
  /** Deletes every uploaded file (Reset all settings). */
  clearFiles(): Promise<void>;
  deletePhoto(key: string): Promise<void>;
  /** An object URL for a stored photo (caller revokes with revokeUrl), or null. */
  photoUrl(key: string): Promise<string | null>;
  revokeUrl(url: string): void;
}

export interface SettingsContext {
  app: App;
  services: SettingsServices;
  state: AppState;
  lang: Lang;
  /** Re-render the current pane (e.g. after an async upload). */
  refresh(): void;
  /** Opens another section (e.g. About → Diagnostics). */
  navigate(id: SectionId): void;
  toast(message: string): void;
}

export interface SettingsSection {
  id: SectionId;
  /** Not listed in the sidebar (reached from another section, e.g. Diagnostics). */
  hidden?: boolean;
  /** Releases what the last render created (object URLs); called before re-render and on close. */
  destroy?(): void;
  render(pane: HTMLElement, ctx: SettingsContext): void;
}

export interface SettingsView {
  open(): void;
  close(): void;
  isOpen(): boolean;
  render(s: AppState): void;
  destroy(): void;
}

export function mountSettings(
  root: HTMLElement,
  deps: {
    app: App;
    clock: Clock;
    sections: SettingsSection[];
    background: HTMLElement;
    matchMedia: (q: string) => MediaQueryList;
    toast: (message: string) => void;
    services: SettingsServices;
  },
): SettingsView {
  const hotspot = h('button', 'settings-hotspot');
  hotspot.type = 'button';
  const layer = h('div', 'settings-layer');
  layer.hidden = true;
  root.append(hotspot, layer);

  let open = false;
  let unlocked = false;
  let current: SectionId = deps.sections[0]!.id;
  let drilled = false;
  let renderedSettings: AppState['settings'] | null = null;
  let renderedKey = '';
  let pressTimer: TimerHandle | null = null;
  const portrait = deps.matchMedia('(orientation: portrait)');

  const lang = () => deps.app.state().settings.display.language;
  const tr = (key: MessageKey) => t(lang(), key);

  const cancelPress = () => {
    if (pressTimer !== null) deps.clock.clearTimeout(pressTimer);
    pressTimer = null;
  };
  hotspot.addEventListener('pointerdown', () => {
    cancelPress();
    pressTimer = deps.clock.setTimeout(() => {
      pressTimer = null;
      view.open();
    }, LONG_PRESS_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
    hotspot.addEventListener(ev, cancelPress);

  const ctx = (): SettingsContext => ({
    app: deps.app,
    services: deps.services,
    state: deps.app.state(),
    lang: lang(),
    refresh: () => draw(true),
    navigate: (id) => {
      current = id;
      drilled = true;
      draw(true);
    },
    toast: deps.toast,
  });

  const pinPad = () => {
    const pad = h('div', 'pin');
    pad.setAttribute('role', 'dialog');
    pad.setAttribute('aria-modal', 'true');
    const title = h('h2', 'pin__title', tr('pin.title'));
    title.id = 'pin-title';
    pad.setAttribute('aria-labelledby', title.id);
    const dots = h('p', 'pin__dots');
    dots.setAttribute('aria-live', 'polite');
    const error = h('p', 'pin__error');
    error.setAttribute('role', 'alert');
    let entered = '';
    const show = () =>
      (dots.textContent = '•'.repeat(entered.length) + '○'.repeat(4 - entered.length));
    show();
    const keys = h('div', 'pin__keys');
    const press = (d: string) => {
      entered += d;
      show();
      if (entered.length < 4) return;
      if (entered === deps.app.state().settings.pin) {
        unlocked = true;
        draw(true);
      } else {
        entered = '';
        error.textContent = tr('pin.wrong');
        show();
      }
    };
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      const b = h('button', 'pin__key touch-target', d);
      b.type = 'button';
      b.addEventListener('click', () => press(d));
      keys.append(b);
    }
    const del = h('button', 'pin__key touch-target', '⌫');
    del.type = 'button';
    del.setAttribute('aria-label', tr('pin.delete'));
    del.addEventListener('click', () => {
      entered = entered.slice(0, -1);
      show();
    });
    keys.append(del);
    const close = h('button', 'pill-button touch-target', tr('settings.close'));
    close.type = 'button';
    close.addEventListener('click', () => view.close());
    pad.append(title, dots, error, keys, close);
    return pad;
  };

  const sheet = () => {
    const el = h('div', 'settings');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const header = h('header', 'settings__header');
    const title = h(
      'h2',
      'settings__title',
      tr(current === 'debug' ? 'debug.title' : 'settings.title'),
    );
    title.id = 'settings-title';
    el.setAttribute('aria-labelledby', title.id);
    const back = h('button', 'pill-button touch-target settings__back', tr('settings.back'));
    back.type = 'button';
    back.addEventListener('click', () => {
      drilled = false;
      draw(true);
    });
    const close = h('button', 'pill-button touch-target', tr('settings.close'));
    close.type = 'button';
    close.addEventListener('click', () => view.close());
    header.append(back, title, close);

    const nav = h('nav', 'settings__nav');
    const list = h('ul', 'settings__sections');
    for (const s of deps.sections) {
      if (s.hidden) continue;
      const li = h('li');
      const b = h('button', 'settings__section touch-target', tr(`section.${s.id}`));
      b.type = 'button';
      b.dataset.section = s.id;
      if (s.id === current) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', () => {
        current = s.id;
        drilled = true;
        draw(true);
      });
      li.append(b);
      list.append(li);
    }
    nav.append(list);
    const pane = h('div', 'settings__pane');
    pane.dataset.section = current;
    deps.sections.find((s) => s.id === current)!.render(pane, ctx());
    el.append(header, nav, pane);
    const isPortrait = portrait.matches;
    toggleClass(el, 'settings--portrait', isPortrait);
    toggleClass(el, 'settings--drilled', isPortrait && drilled);
    back.hidden = !(isPortrait && drilled);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') view.close();
    });
    return el;
  };

  /**
   * Safari does not focus a tapped button, so remember the last control the
   * user touched: after a re-render, focus (and the pane scroll) return to it.
   */
  let lastKey: string | undefined;
  layer.addEventListener(
    'click',
    (e) => {
      lastKey = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-key]')?.dataset.key;
    },
    true,
  );

  /** Rebuilds the open layer, keeping focus and scroll on the same control when possible. */
  const draw = (force = false, opening = false) => {
    if (!open) return;
    const s = deps.app.state();
    const key = `${unlocked}|${current}|${drilled}|${portrait.matches}`;
    if (!force && s.settings === renderedSettings && key === renderedKey) return;
    const sameView = !opening && key === renderedKey;
    renderedSettings = s.settings;
    renderedKey = key;
    const scroll = layer.querySelector('.settings__pane')?.scrollTop ?? 0;
    const active = document.activeElement as HTMLElement | null;
    const focusKey =
      (active && layer.contains(active)
        ? active.closest<HTMLElement>('[data-key]')?.dataset.key
        : undefined) ?? lastKey;
    for (const sec of deps.sections) sec.destroy?.();
    layer.replaceChildren(unlocked ? sheet() : pinPad());
    const pane = layer.querySelector('.settings__pane');
    if (pane && sameView) pane.scrollTop = scroll;
    const target = focusKey
      ? [...layer.querySelectorAll<HTMLElement>('[data-key]')].find(
          (e) => e.dataset.key === focusKey,
        )
      : undefined;
    if (target && sameView) target.focus({ preventScroll: true });
    else if (!sameView) layer.querySelector<HTMLElement>('button')?.focus();
  };

  const view: SettingsView = {
    open() {
      open = true;
      unlocked = deps.app.state().settings.pin === null;
      drilled = false;
      layer.hidden = false;
      deps.background.inert = true;
      lastKey = undefined;
      draw(true, true);
    },
    close() {
      open = false;
      unlocked = false;
      layer.hidden = true;
      for (const sec of deps.sections) sec.destroy?.();
      layer.replaceChildren();
      deps.background.inert = false;
      deps.app.stopTest();
    },
    isOpen: () => open,
    render() {
      draw();
    },
    destroy() {
      cancelPress();
      hotspot.remove();
      layer.remove();
    },
  };
  hotspot.setAttribute('aria-label', tr('settings.title'));
  portrait.addEventListener('change', () => draw(true));
  return view;
}
