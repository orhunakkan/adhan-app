// Startup cleanup of stored files (ADR-0007): photos and thumbnails left in
// IndexedDB by the removed screensaver are deleted once settings have loaded.
// Uploaded audio is never deleted at startup (settings reset to defaults after
// a storage problem must not take the recordings with them); unused audio goes
// only after the owner changes the azan settings.
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { MemoryBlobStore } from '../helpers/memoryBlobStore';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const START = new Date('2026-05-10T17:00:00Z');
const azan = {
  ...defaultSettings.azan,
  audio: { ...defaultSettings.azan.audio, fajr: 'user:a1', isha: 'user:a1' },
  dua: { enabled: true, source: 'user:a2' },
};
const logged = (m: Mounted, msg: string) => m.app.debug().log.filter((e) => e.msg === msg);

describe('orphaned blob cleanup on startup', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('deletes old photos and thumbnails at startup; keeps all audio, even unreferenced', async () => {
    const blobs = new MemoryBlobStore();
    await blobs.set('a1', new Blob(['fajr'], { type: 'audio/mp4' }));
    await blobs.set('a2', new Blob(['dua'], { type: 'audio/mp4' }));
    await blobs.set('astale', new Blob(['old'], { type: 'audio/mp4' }));
    await blobs.set('pmp1k2a0', new Blob(['photo'], { type: 'image/jpeg' }));
    await blobs.set('pmp1k2a0-t', new Blob(['thumb'], { type: 'image/jpeg' }));
    m = mountApp({ start: START, blobs, settings: { azan } });
    await flush();
    expect((await blobs.keys()).sort()).toEqual(['a1', 'a2', 'astale']);
    expect(await blobs.get('a1')).toBeDefined();
    expect(logged(m, 'unreferenced files deleted').map((e) => e.data)).toEqual([{ count: 2 }]);
    // Changing the azan settings removes the audio nothing refers to, never a used file.
    m.app.updateSettings({ azan: { ...azan, preAlertMin: azan.preAlertMin + 1 } });
    await flush();
    expect((await blobs.keys()).sort()).toEqual(['a1', 'a2']);
  });

  it('settings lost and reset to defaults: startup keeps every uploaded recording', async () => {
    const blobs = new MemoryBlobStore();
    await blobs.set('a1', new Blob(['fajr'], { type: 'audio/mp4' }));
    await blobs.set('a2', new Blob(['dua'], { type: 'audio/mp4' }));
    m = mountApp({ start: START, blobs }); // defaults: nothing refers to a1/a2
    await flush();
    expect((await blobs.keys()).sort()).toEqual(['a1', 'a2']);
  });

  it('removes nothing (and logs nothing) when every stored file is in use', async () => {
    const blobs = new MemoryBlobStore();
    await blobs.set('a1', new Blob(['fajr'], { type: 'audio/mp4' }));
    await blobs.set('a2', new Blob(['dua'], { type: 'audio/mp4' }));
    m = mountApp({ start: START, blobs, settings: { azan } });
    await flush();
    expect((await blobs.keys()).sort()).toEqual(['a1', 'a2']);
    expect(logged(m, 'unreferenced files deleted')).toEqual([]);
  });

  it('a failing store is logged and the clock keeps running', async () => {
    class BrokenBlobs extends MemoryBlobStore {
      override keys(): Promise<string[]> {
        return Promise.reject(new Error('InvalidStateError'));
      }
    }
    m = mountApp({ start: START, blobs: new BrokenBlobs() });
    await flush();
    expect(logged(m, 'file cleanup failed')).toHaveLength(1);
    m.clock.advanceBy(2000);
    expect(m.app.state().now.toISOString()).toBe('2026-05-10T17:00:02.000Z');
  });
});
