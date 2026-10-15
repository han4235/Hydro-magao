import $ from 'jquery';
import Notification from 'vj/components/notification';
import LanguageSelectAutoComplete from 'vj/components/autocomplete/LanguageSelectAutoComplete';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, request, tpl,
} from 'vj/utils';

function avatarSrcFromValue(raw: string, fallback: string) {
  if (!raw) return fallback;
  if (raw.startsWith('url:')) return raw.slice(4);
  return fallback;
}

const page = new NamedPage('domain_edit', () => {
  LanguageSelectAutoComplete.getOrConstruct($('[name=langs]'), { multi: true });

  const $avatar = $('[name="avatar"]');
  if (!$avatar.length) return;

  const fallbackPreview = ($('[data-domain-avatar-preview]').attr('src') as string) || '/img/team_avatar.png';
  const $file = $('<input type="file" accept=".jpg,.jpeg,.png" style="display:none">');
  const $wrap = $(tpl`
    <div class="domain-avatar-upload row" style="margin-top:-8px;margin-bottom:12px">
      <div class="medium-5 columns form__item"></div>
      <div class="medium-7 columns">
        <div class="domain-avatar-upload__actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="button" class="button rounded domain-avatar-browse">${i18n('Browse local image')}</button>
          <button type="button" class="button rounded primary domain-avatar-upload-btn">${i18n('Upload domain icon')}</button>
          <img class="domain-avatar-preview" src="${fallbackPreview}" width="48" height="48" alt="" style="border-radius:8px;background:#f4f7fb">
        </div>
        <p class="supplementary" style="margin-top:6px">${i18n('JPG or PNG, up to 8 MiB. After upload the URL field above is filled; you can still save other changes with Save All Changes.')}</p>
      </div>
    </div>
  `);
  const $preview = $wrap.find('.domain-avatar-preview');
  const $browse = $wrap.find('.domain-avatar-browse');
  const $upload = $wrap.find('.domain-avatar-upload-btn');

  const syncPreview = () => {
    $preview.attr('src', avatarSrcFromValue(String($avatar.val() || ''), fallbackPreview));
  };

  const $formRow = $avatar.closest('.row');
  if ($formRow.length) $formRow.after($wrap);
  else $avatar.parent().append($wrap);
  $('body').append($file);
  syncPreview();

  $browse.on('click', () => $file.trigger('click'));
  $file.on('change', () => {
    const f = ($file[0] as HTMLInputElement).files?.[0];
    if (!f) return;
    $browse.text(`${i18n('Browse local image')} (${f.name})`);
  });

  $upload.on('click', async () => {
    const f = ($file[0] as HTMLInputElement).files?.[0];
    if (!f) {
      Notification.error(i18n('Please select a local image first.'));
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', f);
      await request.postFile('/domain/avatar', formData);
      Notification.success(i18n('Upload success.'));
      await delay(600);
      window.location.reload();
    } catch (e: any) {
      Notification.error(e.message || i18n('Upload Failed'));
    }
  });

  $avatar.on('input', syncPreview);
});

export default page;
