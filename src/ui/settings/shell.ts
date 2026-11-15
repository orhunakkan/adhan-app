// Settings sheet (brief §8.8, §9): opened by a 3 s long-press on a corner,
// optionally behind a 4-digit PIN. Landscape: sidebar + pane. Portrait:
// drill-down list. A translucent sheet, so changes preview live behind it.
import type { App, AppState } from '../../app/createApp';
import type { Settings } from '../../config/schema';
import type { City } from '../../core/cities';
import type { Clock, GeolocationPort, TimerHandle } from '../../core/ports';
import { t, type Lang, type MessageKey } from '../../i18n';
import { h, openModal, setAttr, toggleClass, trapTab } from '../dom';
import { actionButton } from './controls';

export const LONG_PRESS_MS = 3000;
/** The sheet closes (and re-locks) after this long without a touch. */
export const SETTINGS_IDLE_MS = 2 * 60_000;
export const PIN_MAX_TRIES = 5;
export const PIN_LOCKOUT_MS = 30_000;

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

/** Applies a change made with a settings control; an invalid value shows a toast instead of throwing. */
export function updateSettingsOrToast(ctx: SettingsContext, patch: Partial<Settings>): void {
  try {
    ctx.app.updateSettings(patch);
  } catch {
    ctx.toast(t(ctx.lang, 'settings.invalid'));
  }
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
  /** Opens the sheet, optionally straight at one section (after the PIN, if set). */
  open(section?: SectionId): void;
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
    matchMedia: (q: string) => MediaQueryList;
    toast: (message: string) => void;
    services: SettingsServices;
  },
): SettingsView {
  const hotspot = h('button', 'settings-hotspot touch-target');
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
  let idleTimer: TimerHandle | null = null;
  let wrongTries = 0;
  let restoreInert: (() => void) | null = null;
  let lockedUntil = 0;

  const armIdle = () => {
    if (idleTimer !== null) deps.clock.clearTimeout(idleTimer);
    idleTimer = open ? deps.clock.setTimeout(() => view.close(), SETTINGS_IDLE_MS) : null;
  };
  for (const ev of ['pointerdown', 'keydown', 'input']) layer.addEventListener(ev, armIdle, true);
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

  const openSection = (id: SectionId) => {
    current = id;
    drilled = true;
    draw(true);
  };

  const ctx = (): SettingsContext => ({
    app: deps.app,
    services: deps.services,
    state: deps.app.state(),
    lang: lang(),
    refresh: () => draw(true),
    navigate: openSection,
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
    const lockedFor = () => Math.max(0, lockedUntil - deps.clock.now().getTime());
    const showLock = () => {
      const ms = lockedFor();
      if (ms > 0) error.textContent = t(lang(), 'pin.locked', { n: Math.ceil(ms / 1000) });
      return ms > 0;
    };
    const press = (d: string) => {
      if (showLock()) return;
      entered += d;
      show();
      if (entered.length < 4) return;
      if (entered === deps.app.state().settings.pin) {
        wrongTries = 0;
        unlocked = true;
        draw(true);
        return;
      }
      entered = '';
      wrongTries += 1;
      error.textContent = tr('pin.wrong');
      if (wrongTries >= PIN_MAX_TRIES) {
        wrongTries = 0;
        lockedUntil = deps.clock.now().getTime() + PIN_LOCKOUT_MS;
        showLock();
      }
      show();
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
    const close = actionButton(tr('settings.close'), () => view.close());
    pad.append(title, dots, error, keys, close);
    pad.addEventListener('keydown', (e) => trapTab(pad, e));
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
    const back = actionButton(
      tr('settings.back'),
      () => {
        drilled = false;
        draw(true);
      },
      'settings__back',
    );
    const close = actionButton(tr('settings.close'), () => view.close());
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
      b.addEventListener('click', () => openSection(s.id));
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
      trapTab(el, e);
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
    open(section) {
      open = true;
      unlocked = deps.app.state().settings.pin === null;
      drilled = section !== undefined;
      if (section) current = section;
      layer.hidden = false;
      restoreInert = openModal(root, layer);
      lastKey = undefined;
      draw(true, true);
      armIdle();
    },
    close() {
      if (!open) return;
      open = false;
      if (idleTimer !== null) deps.clock.clearTimeout(idleTimer);
      idleTimer = null;
      unlocked = false;
      layer.hidden = true;
      for (const sec of deps.sections) sec.destroy?.();
      layer.replaceChildren();
      restoreInert?.();
      restoreInert = null;
      deps.app.stopTest();
    },
    isOpen: () => open,
    render(s) {
      // The corner button's name follows the UI language.
      setAttr(hotspot, 'aria-label', t(s.settings.display.language, 'settings.title'));
      draw();
    },
    destroy() {
      cancelPress();
      if (idleTimer !== null) deps.clock.clearTimeout(idleTimer);
      hotspot.remove();
      layer.remove();
    },
  };
  hotspot.setAttribute('aria-label', tr('settings.title'));
  portrait.addEventListener('change', () => draw(true));
  return view;
}
