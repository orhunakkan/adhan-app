import type { PhotoProcessor } from '../core/ports';

export const MAX_PHOTO_EDGE = 2048; // the iPad's 2048×1536 screen
export const PHOTO_QUALITY = 0.85;

export function fitWithin(w: number, h: number, max = MAX_PHOTO_EDGE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/**
 * Canvas resize (no OffscreenCanvas on Safari 15). The canvas is shrunk to
 * 0×0 afterwards because iOS caps total canvas memory per page (brief §9).
 */
export function createCanvasPhotoProcessor(doc: Document): PhotoProcessor {
  return {
    async resize(file) {
      const url = URL.createObjectURL(file);
      try {
        const img = doc.createElement('img');
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('image decode failed'));
          img.src = url;
        });
        const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight);
        const canvas = doc.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('2d context unavailable');
          ctx.drawImage(img, 0, 0, w, h);
          return await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
              'image/jpeg',
              PHOTO_QUALITY,
            ),
          );
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };
}
