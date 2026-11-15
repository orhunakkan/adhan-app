// Tiny DOM helpers shared by the views. Views keep their nodes and only touch
// text/attributes that changed, so the once-a-second render is cheap on A8.

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Writes an attribute only when it changes (renders run every second). */
export function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Sets `hidden` only when it changes. */
export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

/** Sets or removes an attribute only when that changes. */
export function toggleAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else setAttr(el, name, value);
}

export function toggleClass(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

const FOCUSABLE =
  'button:not([disabled]), select:not([disabled]), input:not([disabled]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab / Shift+Tab inside `container` (modal dialogs). Call from a keydown handler. */
export function trapTab(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hidden && !el.closest('[hidden]'),
  );
  if (!items.length) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && container.contains(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

/*
 * Inert has two sources: a view's own state (the hidden azan screen) and the
 * open modals. Modals stack per root; only the topmost modal layer stays
 * reachable, so a later modal (the danger overlay) wins over an earlier one
 * (Settings). Children added while a modal is open are made inert too.
 */
interface ModalStack {
  layers: HTMLElement[];
  observer: MutationObserver;
}
const stacks = new WeakMap<HTMLElement, ModalStack>();
const ownInert = new WeakSet<HTMLElement>();

function applyInert(el: HTMLElement, top: HTMLElement | undefined): void {
  const want = ownInert.has(el) || (top !== undefined && el !== top);
  if (el.inert !== want) el.inert = want;
}

function applyAll(root: HTMLElement): void {
  const top = stacks.get(root)?.layers.at(-1);
  for (const child of [...root.children] as HTMLElement[]) applyInert(child, top);
}

/** Sets a direct child of the app root inert for its own reasons, composed with any open modal. */
export function setOwnInert(el: HTMLElement, own: boolean): void {
  if (own) ownInert.add(el);
  else ownInert.delete(el);
  const root = el.parentElement;
  applyInert(el, root ? stacks.get(root)?.layers.at(-1) : undefined);
}

/**
 * Makes every other child of `root` inert while the modal `layer` is open;
 * returns the function that closes it (safe to call twice).
 */
export function openModal(root: HTMLElement, layer: HTMLElement): () => void {
  let stack = stacks.get(root);
  if (!stack) {
    const observer = new MutationObserver(() => applyAll(root));
    stack = { layers: [], observer };
    stacks.set(root, stack);
    observer.observe(root, { childList: true });
  }
  const s = stack;
  s.layers.push(layer);
  applyAll(root);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const i = s.layers.lastIndexOf(layer);
    if (i >= 0) s.layers.splice(i, 1);
    if (!s.layers.length) {
      s.observer.disconnect();
      stacks.delete(root);
    }
    applyAll(root);
  };
}
