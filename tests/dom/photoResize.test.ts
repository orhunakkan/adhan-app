import { describe, expect, it, vi } from 'vitest';
import {
  createCanvasPhotoProcessor,
  fitWithin,
  MAX_PHOTO_EDGE,
  PHOTO_QUALITY,
} from '../../src/adapters/photoResize';
import { objectUrls } from '../helpers/objectUrls';

describe('fitWithin', () => {
  it.each([
    [4032, 3024, { w: 2048, h: 1536 }],
    [3024, 4032, { w: 1536, h: 2048 }],
    [1000, 800, { w: 1000, h: 800 }],
    [2048, 1024, { w: 2048, h: 1024 }],
  ])('%s×%s → %j', (w, h, out) => {
    expect(fitWithin(w, h)).toEqual(out);
  });
});

function fakeDoc(opts: { fail?: 'decode' | 'context' | 'encode'; huge?: boolean } = {}) {
  const canvases: Array<{ width: number; height: number }> = [];
  const toBlob = vi.fn((cb: (b: Blob | null) => void, type: string, q: number) =>
    cb(opts.fail === 'encode' ? null : new Blob(['jpg'], { type: `${type}|${q}` })),
  );
  const drawImage = vi.fn();
  const doc = {
    createElement(tag: string) {
      if (tag === 'img') {
        const img = {
          naturalWidth: opts.huge ? 9000 : 4032,
          naturalHeight: opts.huge ? 6000 : 3024,
          onload: null as null | (() => void),
          onerror: null as null | (() => void),
        };
        Object.defineProperty(img, 'src', {
          set: () =>
            queueMicrotask(() => (opts.fail === 'decode' ? img.onerror?.() : img.onload?.())),
        });
        return img;
      }
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => (opts.fail === 'context' ? null : { drawImage }),
        toBlob,
      };
      canvases.push(canvas);
      return canvas;
    },
  } as unknown as Document;
  return { doc, canvases, toBlob, drawImage };
}

describe('createCanvasPhotoProcessor', () => {
  it('resizes to the 2048 px long edge as JPEG 0.85 and releases the canvas and URL', async () => {
    const f = fakeDoc();
    const out = await createCanvasPhotoProcessor(f.doc).resize(new Blob(['raw']));
    expect(f.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, MAX_PHOTO_EDGE, 1536);
    expect(out.type).toBe(`image/jpeg|${PHOTO_QUALITY}`);
    expect(f.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(objectUrls.live).toEqual([]);
  });

  it.each(['decode', 'context', 'encode'] as const)(
    'rejects on %s failure and still cleans up',
    async (fail) => {
      const f = fakeDoc({ fail });
      await expect(createCanvasPhotoProcessor(f.doc).resize(new Blob(['raw']))).rejects.toThrow();
      expect(objectUrls.live).toEqual([]);
      for (const c of f.canvases) expect(c).toMatchObject({ width: 0, height: 0 });
    },
  );

  it('resizes to a smaller edge for thumbnails', async () => {
    const f = fakeDoc();
    await createCanvasPhotoProcessor(f.doc).resize(new Blob(['raw']), 320);
    expect(f.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 320, 240);
  });

  it('refuses images above 40 MP before drawing them', async () => {
    const f = fakeDoc({ huge: true });
    await expect(createCanvasPhotoProcessor(f.doc).resize(new Blob(['raw']))).rejects.toThrow(
      /too large/,
    );
    expect(f.drawImage).not.toHaveBeenCalled();
    expect(objectUrls.live).toEqual([]);
  });
});
