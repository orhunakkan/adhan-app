import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import {
  checkUpload,
  MAX_AUDIO_BYTES,
  referencedAudioKeys,
  unreferencedBlobKeys,
  UploadError,
} from '../../src/core/uploads';

const blob = (size: number, type: string) => ({ size, type }) as Blob;

describe('checkUpload', () => {
  it('accepts audio of the right type and size (and an empty type)', () => {
    expect(() => checkUpload(blob(1000, 'audio/mp4'))).not.toThrow();
    expect(() => checkUpload(blob(1000, ''))).not.toThrow();
    expect(() => checkUpload(blob(MAX_AUDIO_BYTES, 'audio/mpeg'))).not.toThrow();
  });

  it.each([
    [blob(10, 'text/html'), 'wrongType'],
    [blob(10, 'image/jpeg'), 'wrongType'],
    [blob(MAX_AUDIO_BYTES + 1, 'audio/mp4'), 'tooLarge'],
  ] as const)('rejects %# as %s', (file, problem) => {
    expect(() => checkUpload(file)).toThrow(UploadError);
    try {
      checkUpload(file);
    } catch (e) {
      expect((e as UploadError).problem).toBe(problem);
    }
  });
});

describe('referencedAudioKeys', () => {
  it('collects the uploaded sources of every prayer and the dua', () => {
    const s = {
      ...defaultSettings,
      azan: {
        ...defaultSettings.azan,
        audio: { ...defaultSettings.azan.audio, asr: 'user:a1', isha: 'user:a2' },
        dua: { enabled: true, source: 'user:d1' },
      },
    };
    expect(referencedAudioKeys(s)).toEqual(new Set(['a1', 'a2', 'd1']));
    expect(referencedAudioKeys(defaultSettings)).toEqual(new Set());
  });
});

describe('unreferencedBlobKeys', () => {
  const settings = {
    ...defaultSettings,
    azan: {
      ...defaultSettings.azan,
      audio: { ...defaultSettings.azan.audio, fajr: 'user:a1' },
      dua: { enabled: false, source: 'user:a2' },
    },
  };

  it('lists unused audio, old photos and thumbnails, never a referenced audio key', () => {
    const keys = ['a1', 'a2', 'a3', 'pabc0', 'pabc0-t', 'other'];
    expect(unreferencedBlobKeys(keys, settings)).toEqual(['a3', 'pabc0', 'pabc0-t', 'other']);
  });

  it('is empty when every key is referenced or nothing is stored', () => {
    expect(unreferencedBlobKeys(['a1', 'a2'], settings)).toEqual([]);
    expect(unreferencedBlobKeys([], defaultSettings)).toEqual([]);
  });
});
