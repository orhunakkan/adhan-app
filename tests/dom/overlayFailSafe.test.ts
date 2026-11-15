// Regression: on the iPad the Start overlay did not appear while the clock ran
// and nothing could be touched. Whatever stops the overlay from drawing, the
// page must not be left inert behind it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountOverlay } from '../../src/ui/startOverlay';

describe('overlay fail-safe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('leaves the page touchable and reports the error when the Start screen fails to draw', () => {
    const root = document.createElement('div');
    const main = document.createElement('div');
    root.append(main);
    document.body.append(root);
    const onError = vi.fn();
    const view = mountOverlay(root, { onStart() {}, onEnable() {}, onResume() {}, onError });
    const real = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'button') throw new Error('boom');
      return real(tag);
    });
    view.render({ overlay: 'start', lang: 'tr' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    expect(main.inert).toBe(false);
    expect(root.querySelector('.overlay')).toBeNull();
    vi.restoreAllMocks();
    // The next render can still show it, and only then is the rest inert.
    view.render({ overlay: 'start', lang: 'en' });
    expect(root.querySelector('.start-button')).not.toBeNull();
    expect(main.inert).toBe(true);
    view.destroy();
    expect(main.inert).toBe(false);
  });
});
