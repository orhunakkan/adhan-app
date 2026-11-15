// Upload rules (security review): caps and types for user files, and which
// stored blobs are still referenced.
import type { Settings } from '../config/schema';

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
/** Before resizing: very large originals can exhaust a 2 GB iPad while decoding. */
export const MAX_PHOTO_UPLOAD_BYTES = 40 * 1024 * 1024;
export const MAX_PHOTOS = 200;

export type UploadProblem = 'tooLarge' | 'wrongType' | 'tooMany' | 'storageFull';

export class UploadError extends Error {
  constructor(readonly problem: UploadProblem) {
    super(`upload rejected: ${problem}`);
    this.name = 'UploadError';
  }
}

/** iOS sometimes reports an empty MIME type; only a wrong, non-empty one is rejected. */
export function checkUpload(file: Blob, kind: 'audio' | 'image'): void {
  if (file.type && !file.type.startsWith(`${kind}/`)) throw new UploadError('wrongType');
  const max = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_PHOTO_UPLOAD_BYTES;
  if (file.size > max) throw new UploadError('tooLarge');
}

/** Audio blob keys ('user:<key>') still used by some prayer or the dua. */
export function referencedAudioKeys(settings: Settings): Set<string> {
  const sources = [...Object.values(settings.azan.audio), settings.azan.dua.source];
  return new Set(sources.filter((s) => s.startsWith('user:')).map((s) => s.slice('user:'.length)));
}
