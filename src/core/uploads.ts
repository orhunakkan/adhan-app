// Upload rules (security review): caps and types for user files, and which
// stored blobs are still referenced.
import type { Settings } from '../config/schema';

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type UploadProblem = 'tooLarge' | 'wrongType' | 'storageFull';

export class UploadError extends Error {
  constructor(readonly problem: UploadProblem) {
    super(`upload rejected: ${problem}`);
    this.name = 'UploadError';
  }
}

/** Checks an uploaded azan file. iOS sometimes reports an empty MIME type; only a wrong, non-empty one is rejected. */
export function checkUpload(file: Blob): void {
  if (file.type && !file.type.startsWith('audio/')) throw new UploadError('wrongType');
  if (file.size > MAX_AUDIO_BYTES) throw new UploadError('tooLarge');
}

/** Audio blob keys ('user:<key>') still used by some prayer or the dua. */
export function referencedAudioKeys(settings: Settings): Set<string> {
  const sources = [...Object.values(settings.azan.audio), settings.azan.dua.source];
  return new Set(sources.filter((s) => s.startsWith('user:')).map((s) => s.slice('user:'.length)));
}

/**
 * Stored blob keys nothing uses: audio no prayer (or the dua) refers to any
 * more, and anything else, such as photos and thumbnails left by the removed
 * screensaver (ADR-0007). A referenced audio key is never in the result.
 */
export function unreferencedBlobKeys(keys: readonly string[], settings: Settings): string[] {
  const used = referencedAudioKeys(settings);
  return keys.filter((key) => !used.has(key));
}
