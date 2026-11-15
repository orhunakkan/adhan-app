// Toast notices: a bottom-centre pill that auto-dismisses (brief §8.7).
import type { Clock, TimerHandle } from '../core/ports';

export interface ToastOptions {
  message: string;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

export interface ToastView {
  show(opts: ToastOptions): void;
  hide(): void;
  destroy(): void;
}

export const TOAST_MS = 4000;

export function mountToast(root: HTMLElement, clock: Clock): ToastView {
  const region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  root.append(region);
  let timer: TimerHandle | null = null;

  const hide = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    region.replaceChildren();
  };

  return {
    show({ message, action, durationMs = TOAST_MS }) {
      hide();
      const pill = document.createElement('div');
      pill.className = 'toast';
      const text = document.createElement('span');
      text.className = 'toast__text';
      text.textContent = message;
      pill.append(text);
      if (action) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'toast__action touch-target';
        b.textContent = action.label;
        b.addEventListener('click', () => {
          hide();
          action.onClick();
        });
        pill.append(b);
      }
      region.append(pill);
      timer = clock.setTimeout(hide, durationMs);
    },
    hide,
    destroy() {
      hide();
      region.remove();
    },
  };
}
