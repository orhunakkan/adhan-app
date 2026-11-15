import { afterEach, describe, expect, it } from 'vitest';
import { LONG_PRESS_MS } from '../../src/ui/settings/shell';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];

function open(m: Mounted) {
  q('.settings-hotspot').dispatchEvent(new Event('pointerdown'));
  m.clock.advanceBy(LONG_PRESS_MS);
  qa('.settings__section')
    .find((b) => b.dataset.section === 'photos')!
    .click();
}

describe('photos section', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('uploads several photos into IndexedDB and lists them; delete removes one', async () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    open(m);
    expect(q('.photos__count').textContent).toBe('Henüz fotoğraf yok');
    const input = q('.settings__pane input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(true);
    Object.defineProperty(input, 'files', {
      value: [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['bb'], 'b.jpg', { type: 'image/jpeg' }),
      ],
    });
    input.dispatchEvent(new Event('change'));
    await flush();
    const keys = m.app.state().settings.photos;
    expect(keys).toHaveLength(2);
    expect(await m.blobs.keys()).toEqual(keys);
    await flush();
    expect(qa('.photos__item')).toHaveLength(2);
    expect(q('.photos__count').textContent).toBe('2 fotoğraf');
    q(`[data-key="photo-delete:${keys[0]}"]`).click();
    await flush();
    expect(m.app.state().settings.photos).toEqual([keys[1]]);
    expect(await m.blobs.keys()).toEqual([keys[1]]);
  });

  it('shows thumbnails and revokes their URLs on the next render', async () => {
    m = mountApp({ start: new Date('2026-05-10T17:00:00Z') });
    await m.blobs.set('p1', new Blob(['x']));
    m.app.updateSettings({ photos: ['p1'] });
    open(m);
    await flush();
    const first = q('.photos__thumb').getAttribute('src');
    expect(first).toMatch(/^blob:/);
    m.app.updateSettings({ display: { ...m.app.state().settings.display, glass: true } });
    await flush();
    expect(q('.photos__thumb').getAttribute('src')).not.toBe(first);
  });
});
