import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountToast, TOAST_MS } from '../../src/ui/toast';
import { FakeClock } from '../helpers/fakeClock';

describe('toast', () => {
  let clock: FakeClock;
  afterEach(() => clock.dispose());

  it('shows a polite status pill that auto-dismisses', () => {
    clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
    const t = mountToast(document.body, clock);
    t.show({ message: 'Settings saved' });
    const region = document.querySelector('.toast-region')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Settings saved');
    clock.advanceBy(TOAST_MS - 1);
    expect(region.textContent).toBe('Settings saved');
    clock.advanceBy(1);
    expect(region.textContent).toBe('');
    t.destroy();
    expect(document.querySelector('.toast-region')).toBeNull();
  });

  it('runs the action on tap and dismisses; a new toast replaces the old one', () => {
    clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
    const t = mountToast(document.body, clock);
    const onClick = vi.fn();
    t.show({ message: 'first' });
    t.show({
      message: 'Update available',
      action: { label: 'Apply', onClick },
      durationMs: 10_000,
    });
    expect(document.querySelectorAll('.toast')).toHaveLength(1);
    const b = document.querySelector<HTMLButtonElement>('.toast__action')!;
    expect(b.textContent).toBe('Apply');
    expect(b.classList.contains('touch-target')).toBe(true);
    b.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(document.querySelector('.toast')).toBeNull();
    t.hide();
  });
});
