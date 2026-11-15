import { afterEach, describe, expect, it } from 'vitest';
import { LONG_PRESS_MS } from '../../src/ui/settings/shell';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const START = new Date('2026-05-10T17:00:00Z');

function openSection(m: Mounted, id: string) {
  q('.settings-hotspot').dispatchEvent(new Event('pointerdown'));
  m.clock.advanceBy(LONG_PRESS_MS);
  qa('.settings__section')
    .find((b) => b.dataset.section === id)!
    .click();
}
const group = (p: string) => q(`.group[data-prayer="${p}"]`);

describe('azan section', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('Test plays the selected source through the single player; Stop ends it', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    openSection(m, 'azan');
    group('asr').querySelector<HTMLButtonElement>('[data-key="test:asr"]')!.click();
    await flush();
    expect(m.player!.src).toBe('/audio/rast.m4a');
    expect(m.app.state().audio.phase).toBe('test');
    group('asr').querySelector<HTMLButtonElement>('[data-key="stop:asr"]')!.click();
    expect(m.app.state().audio.phase).toBeNull();
    expect(m.players).toHaveLength(1);
  });

  it('enables/disables a prayer and changes its source, persisting both', () => {
    m = mountApp({ start: START });
    openSection(m, 'azan');
    group('asr').querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    const sel = group('dhuhr').querySelector('select')!;
    sel.value = 'bundled:hicaz';
    sel.dispatchEvent(new Event('change'));
    const saved = JSON.parse(m.store.get('adhan.settings')!);
    expect(saved.azan.enabled.asr).toBe(false);
    expect(saved.azan.audio.dhuhr).toBe('bundled:hicaz');
  });

  it('uploads a file to IndexedDB and assigns it to the prayer', async () => {
    m = mountApp({ start: START });
    openSection(m, 'azan');
    const input = group('isha').querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe('audio/*');
    const file = new File(['abcd'], 'isha.m4a', { type: 'audio/mp4' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    const source = m.app.state().settings.azan.audio.isha;
    expect(source).toMatch(/^user:a[0-9a-z]+$/);
    expect((await m.blobs.get(source.slice(5)))?.size).toBe(4);
    expect(group('isha').querySelector('select')!.value).toBe(source);
    expect(group('isha').querySelector('option')!.textContent).toBe('Yüklenen dosya');
  });

  it('warns when a prayer source could not play (chime fallback)', async () => {
    m = mountApp({ start: START });
    await m.app.tapStart();
    m.player!.rejectNextPlay('NotSupportedError');
    await m.app.testAudio('bundled:rast');
    await flush();
    openSection(m, 'azan');
    expect(group('asr').querySelector('.row--warning')!.textContent).toMatch(/zil/);
    expect(group('dhuhr').querySelector('.row--warning')).toBeNull();
  });

  it('dua toggle, late window and pre-alert steppers', () => {
    m = mountApp({ start: START });
    openSection(m, 'azan');
    qa('.settings [role="switch"]').at(-1)!.click();
    q('.stepper__button[aria-label="Gecikme penceresi +"]').click();
    q('.stepper__button[aria-label="Ön uyarı −"]').click();
    expect(m.app.state().settings.azan).toMatchObject({
      dua: { enabled: true },
      lateWindowSec: 150,
      preAlertMin: 9,
    });
  });
  it('dua source select persists the chosen file', () => {
    m = mountApp({ start: START });
    openSection(m, 'azan');
    const sel = q('select[data-key="Dua sesi"]') as HTMLSelectElement;
    const other = [...sel.options].find((o) => o.value !== sel.value)!.value;
    sel.value = other;
    sel.dispatchEvent(new Event('change'));
    expect(m.app.state().settings.azan.dua.source).toBe(other);
    expect(JSON.parse(m.store.get('adhan.settings')!).azan.dua.source).toBe(other);
  });
});

describe('display section', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('switches theme and language (RTL) live', async () => {
    m = mountApp({ start: START });
    openSection(m, 'display');
    qa('[role="radio"]')
      .find((r) => r.textContent === 'Kum')!
      .click();
    expect(document.documentElement.dataset.theme).toBe('sand');
    qa('[role="radio"]')
      .find((r) => r.textContent === 'العربية')!
      .click();
    expect(document.documentElement.dir).toBe('rtl');
    expect(q('.settings__title').textContent).toBe('الإعدادات');
    expect(q('.next-card__label').textContent).toBe('الصلاة التالية');
    // Generated label ids depend on how many controls earlier tests rendered.
    const html = q('.settings').outerHTML.replace(/\blabel-\d+\b/g, 'label-N');
    await expect(html).toMatchFileSnapshot('./__snapshots__/settings.display.ar.html');
  });

  it('12-hour clock, seconds, pattern, glass, screensaver and panel interval', () => {
    m = mountApp({ start: START });
    openSection(m, 'display');
    qa('[role="radio"]')
      .find((r) => r.textContent === '12')!
      .click();
    qa('.settings [role="switch"]')[0]!.click(); // seconds
    qa('.settings [role="switch"]')[2]!.click(); // glass (re-queried: the pane re-rendered)
    qa('[role="radio"]')
      .find((r) => r.textContent === 'Karışık')!
      .click();
    q('.stepper__button[aria-label="Pano süresi +"]').click();
    const d = m.app.state().settings.display;
    expect(d).toMatchObject({
      hour12: true,
      showSeconds: true,
      glass: true,
      screensaverMode: 'alternate',
      panelIntervalSec: 75,
    });
    expect(q('.clock__ampm').textContent).not.toBe('');
  });

  it('a handler from an earlier render merges against the live settings', () => {
    m = mountApp({ start: START });
    openSection(m, 'display');
    const stale = qa('.settings [role="switch"]');
    stale[0]!.click(); // seconds on → pane re-renders
    stale[2]!.click(); // glass, via the detached node
    expect(m.app.state().settings.display).toMatchObject({ showSeconds: true, glass: true });
  });

  it('night dim schedule and opacity', () => {
    m = mountApp({ start: START });
    openSection(m, 'display');
    q('.stepper__button[aria-label="Yatsıdan sonra −"]').click();
    q('.stepper__button[aria-label="İmsaktan önce +"]').click();
    q('.stepper__button[aria-label="Karartma +"]').click();
    expect(m.app.state().settings.display.nightDim).toMatchObject({
      afterIshaMin: 45,
      beforeFajrMin: 45,
      opacity: 0.8,
    });
    expect(qa('.stepper__value').some((o) => o.textContent === '%80')).toBe(true);
  });

  it('pattern and night-dim switches flip their setting and the live view', () => {
    m = mountApp({ start: START });
    openSection(m, 'display');
    const before = m.app.state().settings.display;
    q('[data-key="Geometrik desen"]').click();
    expect(m.app.state().settings.display.pattern).toBe(!before.pattern);
    expect(q('.sky__pattern').classList.contains('sky__pattern--on')).toBe(!before.pattern);
    q('[data-key="Gece karartma"]').click();
    expect(m.app.state().settings.display.nightDim.enabled).toBe(!before.nightDim.enabled);
    expect(q('[data-key="Gece karartma"]').getAttribute('aria-checked')).toBe(
      String(!before.nightDim.enabled),
    );
  });
});

describe('about section', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows the version and storage used without navigator.storage.estimate', async () => {
    m = mountApp({ start: START });
    await m.blobs.set('x', new Blob(['12345678']));
    openSection(m, 'about');
    await flush();
    expect(q('.about__version').textContent).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(q('.about__storage').textContent).toBe('8 B');
  });

  it('Reset also deletes every uploaded file', async () => {
    m = mountApp({ start: START });
    await m.blobs.set('a1', new Blob(['x']));
    await m.blobs.set('p1', new Blob(['y']));
    openSection(m, 'about');
    q('[data-key="reset"]').click();
    q('[data-key="reset"]').click();
    await flush();
    expect(await m.blobs.keys()).toEqual([]);
  });

  it('replacing an uploaded azan deletes the old file once nothing uses it', async () => {
    m = mountApp({ start: START });
    await m.blobs.set('aold', new Blob(['old']));
    const s = m.app.state().settings;
    m.app.updateSettings({
      azan: { ...s.azan, audio: { ...s.azan.audio, asr: 'user:aold', isha: 'user:aold' } },
    });
    await flush();
    m.app.updateSettings({
      azan: {
        ...m.app.state().settings.azan,
        audio: { ...m.app.state().settings.azan.audio, asr: 'bundled:rast' },
      },
    });
    await flush();
    expect(await m.blobs.keys()).toEqual(['aold']); // Isha still uses it
    m.app.updateSettings({
      azan: {
        ...m.app.state().settings.azan,
        audio: { ...m.app.state().settings.azan.audio, isha: 'bundled:hicaz' },
      },
    });
    await flush();
    expect(await m.blobs.keys()).toEqual([]);
  });

  it('rejects a non-audio upload with a clear message', async () => {
    m = mountApp({ start: START });
    openSection(m, 'azan');
    const input = q('.group[data-prayer="isha"] input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'x.png', { type: 'image/png' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(q('.toast').textContent).toBe('Bu dosya türü desteklenmiyor');
  });

  it('Reset needs a second tap, then restores defaults', () => {
    m = mountApp({ start: START, settings: { pin: null } });
    openSection(m, 'about');
    q('[data-key="reset"]').click();
    expect(m.app.state().settings.location).not.toBeNull();
    expect(q('[data-key="reset"]').textContent).toBe('Sıfırlamayı onaylayın');
    q('[data-key="reset"]').click();
    expect(m.app.state().settings.location).toBeNull();
    expect(m.app.state().needsLocation).toBe(true);
  });
});
