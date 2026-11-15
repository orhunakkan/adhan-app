// On-screen diagnostics for a device without Web Inspector (no Mac): open the
// app with `?diag` and photograph the panel. It lists uncaught errors, what each
// top-level layer is doing (inert, hidden, size, stacking), where the Start
// button is, which element sits under the centre and the Settings corner, and
// what each touch actually hit. It lives outside #app so a modal can never make
// it inert, and ignores pointer events so it never changes what a touch hits.

const MAX_LINES = 8;

const describe = (el: Element | null): string => {
  if (!el) return '(nothing)';
  const cls =
    typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).join('.')}`
      : '';
  const inert = el.closest('[inert]') ? ' [in inert]' : '';
  return `${el.tagName.toLowerCase()}${cls}${inert}`;
};

const rect = (el: Element): string => {
  const r = el.getBoundingClientRect();
  return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
};

export interface Diagnostics {
  /** Redraws the panel (call about once a second). */
  update(): void;
  /** Adds a line to the error list. */
  record(message: string): void;
}

export function mountDiagnostics(doc: Document, win: Window): Diagnostics {
  const panel = doc.createElement('pre');
  panel.className = 'diag';
  panel.setAttribute('aria-hidden', 'true');
  doc.body.append(panel);
  const errors: string[] = [];
  const touches: string[] = [];
  let seq = 0;
  const push = (list: string[], line: string) => {
    seq += 1;
    list.push(`#${seq} ${line}`);
    if (list.length > MAX_LINES) list.shift();
  };

  win.addEventListener('error', (e) => {
    const ev = e;
    push(errors, `${ev.message} @ ${ev.filename ?? ''}:${ev.lineno ?? ''}:${ev.colno ?? ''}`);
  });
  win.addEventListener('unhandledrejection', (e) => {
    push(errors, `unhandled rejection: ${String(e.reason)}`);
  });
  for (const type of ['touchstart', 'pointerdown', 'click']) {
    doc.addEventListener(
      type,
      (e) => {
        const t = e.target instanceof Element ? e.target : null;
        push(touches, `${type} → ${describe(t)}`);
      },
      { capture: true, passive: true },
    );
  }

  const nav = win.navigator as Navigator & { standalone?: boolean };
  return {
    record: (message) => push(errors, message),
    update() {
      const w = win.innerWidth;
      const h = win.innerHeight;
      const lines = [
        `UA ${nav.userAgent}`,
        `viewport ${w}x${h} standalone=${String(nav.standalone)} inert-support=${String('inert' in doc.body)}`,
        '— #app layers —',
      ];
      const app = doc.getElementById('app');
      for (const child of app ? [...app.children] : []) {
        const cs = win.getComputedStyle(child);
        lines.push(
          `${describe(child)} inert=${String((child as HTMLElement).inert)} hidden=${String((child as HTMLElement).hidden)} ` +
            `display=${cs.display} vis=${cs.visibility} op=${cs.opacity} z=${cs.zIndex} pe=${cs.pointerEvents} ${rect(child)} kids=${child.childElementCount}`,
        );
      }
      const start = doc.querySelector('.start-button');
      if (start) {
        const cs = win.getComputedStyle(start);
        lines.push(
          `start-button ${rect(start)} display=${cs.display} vis=${cs.visibility} op=${cs.opacity}`,
        );
      } else lines.push('start-button: not in the page');
      lines.push(`at centre: ${describe(doc.elementFromPoint(w / 2, h / 2))}`);
      lines.push(`at top-right: ${describe(doc.elementFromPoint(w - 20, 20))}`);
      lines.push('— touches —', ...touches, '— errors —', ...(errors.length ? errors : ['(none)']));
      panel.textContent = lines.join('\n');
    },
  };
}
