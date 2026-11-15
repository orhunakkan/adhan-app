// Photos (brief §9): upload (resized before storing) and delete.
import { t } from '../../i18n';
import { uploadMessage } from './uploadMessage';
import { h } from '../dom';
import { actionButton, group } from './controls';
import type { SettingsSection } from './shell';

/** Thumbnail URLs of the current render; revoked by destroy() (re-render or close). */
let thumbs: string[] = [];
let revoke: (url: string) => void = () => {};

export const photosSection: SettingsSection = {
  id: 'photos',
  destroy() {
    for (const url of thumbs) revoke(url);
    thumbs = [];
  },
  render(pane, ctx) {
    const lang = ctx.lang;
    revoke = (url) => ctx.services.revokeUrl(url);
    const keys = ctx.state.settings.photos;

    const add = group();
    const input = h('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      if (!files.length) return;
      void ctx.services.savePhotos(files).then(
        () => ctx.toast(t(lang, 'settings.saved')),
        (err: unknown) => ctx.toast(uploadMessage(lang, err)),
      );
    });
    const button = actionButton(t(lang, 'photos.add'), () => input.click(), 'pill-button--accent');
    button.dataset.key = 'photos-add';
    add.body.append(
      input,
      button,
      h(
        'p',
        'row row__hint photos__count',
        keys.length ? t(lang, 'photos.count', { n: keys.length }) : t(lang, 'photos.empty'),
      ),
    );
    pane.append(add.el);

    const list = group();
    const grid = h('ul', 'photos__grid');
    keys.forEach((key, i) => {
      const li = h('li', 'photos__item');
      li.dataset.photo = key;
      const img = h('img', 'photos__thumb');
      img.alt = t(lang, 'photos.item', { n: i + 1 });
      img.loading = 'lazy';
      void ctx.services.photoUrl(key).then((url) => {
        if (!url) return;
        thumbs.push(url);
        img.src = url;
      });
      const del = actionButton(t(lang, 'photos.delete'), () => void ctx.services.deletePhoto(key));
      del.dataset.key = `photo-delete:${key}`;
      li.append(img, del);
      grid.append(li);
    });
    list.body.append(grid);
    pane.append(list.el);
  },
};
