import { UploadError } from '../../core/uploads';
import { t, type Lang } from '../../i18n';

/** A user-facing message for a failed upload. */
export function uploadMessage(lang: Lang, err: unknown): string {
  return err instanceof UploadError
    ? t(lang, `upload.${err.problem}`)
    : t(lang, 'upload.storageFull');
}
