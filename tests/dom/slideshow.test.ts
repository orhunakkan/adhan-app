import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { SCHAUMBURG } from '../helpers/days';
import { MemoryBlobStore } from '../helpers/memoryBlobStore';
import { mountApp, type Mounted } from '../helpers/mountApp';
import { objectUrls } from '../helpers/objectUrls';

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);
const INTERVAL = 60_000;
const QUIET = new Date(
  Math.ceil((t.dhuhr.getTime() + 15 * 60_000) / (3 * INTERVAL)) * 3 * INTERVAL,
);

async function withPhotos(n: number) {
  const blobs = new MemoryBlobStore();
  const keys = Array.from({ length: n }, (_, i) => `p${i}`);
  for (const k of keys) await blobs.set(k, new Blob([k], { type: 'image/jpeg' }));
  return { blobs, keys };
}

describe('photo slideshow', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('20 photos over 2 hours: never more than 2 <img>, every object URL revoked (leak guard)', async () => {
    const { blobs, keys } = await withPhotos(20);
    m = mountApp({
      start: QUIET,
      blobs,
      settings: {
        photos: keys,
        display: { ...defaultSettings.display, screensaverMode: 'photos' },
      },
    });
    let maxImgs = 0;
    let photoSlides = 0;
    for (let s = 0; s < 2 * 3600; s += 10) {
      await m.clock.advanceByAsync(10_000);
      maxImgs = Math.max(maxImgs, document.querySelectorAll('img').length);
      // Current slide, the one fading out, and the prepared next photo — never more.
      expect(objectUrls.live.length).toBeLessThanOrEqual(3);
      if (q('.slide--in.photo')) photoSlides++;
    }
    expect(maxImgs).toBeLessThanOrEqual(2);
    expect(photoSlides).toBeGreaterThan(0);
    m.dispose();
    m = undefined;
    expect(objectUrls.created.length).toBeGreaterThan(5);
    expect(objectUrls.live).toEqual([]);
  });

  it('alternate mode interleaves panels and photos', async () => {
    const { blobs, keys } = await withPhotos(3);
    m = mountApp({
      start: QUIET,
      blobs,
      settings: {
        photos: keys,
        display: { ...defaultSettings.display, screensaverMode: 'alternate' },
      },
    });
    const kinds: string[] = [];
    for (let cycle = 0; cycle < 8; cycle++) {
      await m.clock.advanceByAsync(2 * INTERVAL);
      kinds.push(q('.slide--in')!.classList.contains('photo') ? 'photo' : 'panel');
      await m.clock.advanceByAsync(INTERVAL);
    }
    expect(kinds).toContain('photo');
    expect(kinds).toContain('panel');
  });

  it('panels-only mode never loads photos', async () => {
    const { blobs, keys } = await withPhotos(3);
    m = mountApp({ start: QUIET, blobs, settings: { photos: keys } });
    for (let i = 0; i < 9; i++) await m.clock.advanceByAsync(INTERVAL);
    expect(document.querySelector('.photo')).toBeNull();
    expect(objectUrls.created).toEqual([]);
  });

  it('a slide has a scrim over the photo and an empty alt', async () => {
    const { blobs, keys } = await withPhotos(2);
    m = mountApp({
      start: QUIET,
      blobs,
      settings: {
        photos: keys,
        display: { ...defaultSettings.display, screensaverMode: 'photos' },
      },
    });
    for (let i = 0; i < 6 && !q('.slide--in.photo'); i++) await m.clock.advanceByAsync(INTERVAL);
    expect(q('.photo__scrim')).not.toBeNull();
    expect(q('.photo__img')!.getAttribute('alt')).toBe('');
  });
});
