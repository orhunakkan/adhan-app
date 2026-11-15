import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import {
  checkUpload,
  MAX_AUDIO_BYTES,
  MAX_PHOTO_UPLOAD_BYTES,
  referencedAudioKeys,
  UploadError,
} from '../../src/core/uploads';

const blob = (size: number, type: string) => ({ size, type }) as Blob;

describe('checkUpload', () => {
  it('accepts audio and images of the right type and size (and an empty type)', () => {
    expect(() => checkUpload(blob(1000, 'audio/mp4'), 'audio')).not.toThrow();
    expect(() => checkUpload(blob(1000, ''), 'audio')).not.toThrow();
    expect(() => checkUpload(blob(1000, 'image/jpeg'), 'image')).not.toThrow();
  });

  it.each([
    [blob(10, 'text/html'), 'audio', 'wrongType'],
    [blob(10, 'audio/mp4'), 'image', 'wrongType'],
    [blob(MAX_AUDIO_BYTES + 1, 'audio/mp4'), 'audio', 'tooLarge'],
    [blob(MAX_PHOTO_UPLOAD_BYTES + 1, 'image/heic'), 'image', 'tooLarge'],
  ] as const)('rejects %# as %s', (file, kind, problem) => {
    expect(() => checkUpload(file, kind)).toThrow(UploadError);
    try {
      checkUpload(file, kind);
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
