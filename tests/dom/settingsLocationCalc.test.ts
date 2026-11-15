import { afterEach, describe, expect, it } from 'vitest';
import { LONG_PRESS_MS } from '../../src/ui/settings/shell';
import { distanceKm, nearestCity } from '../../src/ui/settings/location';
import { mountApp, testCities, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const START = new Date('2026-05-10T17:00:00Z');

function openSection(m: Mounted, id: string) {
  const hot = q('.settings-hotspot');
  hot.dispatchEvent(new Event('pointerdown'));
  m.clock.advanceBy(LONG_PRESS_MS);
  qa('.settings__section')
    .find((b) => b.dataset.section === id)!
    .click();
}

describe('location section', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('shows the current location', () => {
    m = mountApp({ start: START });
    openSection(m, 'location');
    expect(q('.location__current').textContent).toBe(
      'Schaumburg, IL · 42.0334, -88.0834 · America/Chicago',
    );
  });

  it('finds a city by an accent-insensitive search and applies it live', async () => {
    m = mountApp({ start: START });
    openSection(m, 'location');
    const input = q('input[type="search"]') as HTMLInputElement;
    input.value = 'istanbul';
    input.dispatchEvent(new Event('input'));
    await flush();
    const first = qa('.results__item')[0]!;
    expect(first.textContent).toBe('Istanbul, TR');
    first.click();
    expect(m.app.state().settings.location).toMatchObject({
      name: 'Istanbul, TR',
      tz: 'Europe/Istanbul',
    });
    expect(q('.clock__location').textContent).toBe('Istanbul, TR'); // behind the sheet
    expect(m.app.state().days?.today.dateKey).toBe('2026-05-10');
    expect(q('.toast').textContent).toBe('Kaydedildi');
  });

  it('shows "no results" for an unknown city and nothing for an empty query', async () => {
    m = mountApp({ start: START });
    openSection(m, 'location');
    const input = q('input[type="search"]') as HTMLInputElement;
    input.value = 'zzzqqq';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(q('.results').textContent).toBe('Sonuç yok');
    input.value = ' ';
    input.dispatchEvent(new Event('input'));
    expect(q('.results').children).toHaveLength(0);
  });

  it('uses the device position once, named after the nearest city', async () => {
    m = mountApp({
      start: START,
      geolocation: { getPosition: () => Promise.resolve({ lat: 41.03, lng: 28.98 }) },
    });
    openSection(m, 'location');
    qa('button')
      .find((b) => b.textContent === 'Konumumu kullan')!
      .click();
    await flush();
    // Named after the nearest GeoNames place (an Istanbul district here).
    expect(m.app.state().settings.location).toMatchObject({
      lat: 41.03,
      lng: 28.98,
      tz: 'Europe/Istanbul',
    });
    expect(m.app.state().settings.location?.name).toMatch(/, TR$/);
  });

  it('falls back to "My location" and the device zone far from any city', async () => {
    m = mountApp({
      start: START,
      geolocation: { getPosition: () => Promise.resolve({ lat: -60, lng: -120 }) },
    });
    openSection(m, 'location');
    qa('button')
      .find((b) => b.textContent === 'Konumumu kullan')!
      .click();
    await flush();
    expect(m.app.state().settings.location?.name).toBe('Konumum');
  });

  it('reports a geolocation failure', async () => {
    m = mountApp({ start: START });
    openSection(m, 'location');
    qa('button')
      .find((b) => b.textContent === 'Konumumu kullan')!
      .click();
    await flush();
    expect(q('.toast').textContent).toBe('Konum alınamadı');
  });

  it('saves a valid manual location and rejects an invalid one', () => {
    m = mountApp({ start: START, location: null });
    openSection(m, 'location');
    const [name, lat, lng] = qa('.settings__pane input:not([type="search"])') as HTMLInputElement[];
    const tz = q('.settings__pane select') as HTMLSelectElement;
    name!.value = 'Home';
    lat!.value = '41.0082';
    lng!.value = '28.9784';
    tz.value = 'Europe/Istanbul';
    qa('button')
      .find((b) => b.textContent === 'Kaydet')!
      .click();
    expect(m.app.state().settings.location).toEqual({
      name: 'Home',
      lat: 41.0082,
      lng: 28.9784,
      tz: 'Europe/Istanbul',
    });
    const [, lat2] = qa('.settings__pane input:not([type="search"])') as HTMLInputElement[];
    lat2!.value = '95';
    qa('button')
      .find((b) => b.textContent === 'Kaydet')!
      .click();
    expect(q('.toast').textContent).toBe('Geçersiz değer');
    expect(m.app.state().settings.location?.lat).toBe(41.0082);
  });
});

describe('nearest city', () => {
  it('measures great-circle distance', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.2, 0);
  });

  it('finds Schaumburg next to its coordinates and nothing in the ocean', () => {
    expect(nearestCity(testCities(), { lat: 42.03, lng: -88.08 })?.name).toBe('Schaumburg');
    expect(nearestCity(testCities(), { lat: 0, lng: -150 })).toBeNull();
  });
});

describe('calculation section', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('changes method, madhab and high-latitude rule, persisting each', () => {
    m = mountApp({ start: START });
    openSection(m, 'calculation');
    const [method, highLat] = qa('.settings__pane select') as HTMLSelectElement[];
    expect([...method!.options].map((o) => o.textContent)).toContain('Diyanet (Türkiye)');
    method!.value = 'Turkey';
    method!.dispatchEvent(new Event('change'));
    qa('[role="radio"]')
      .find((r) => r.textContent === 'Hanefi')!
      .click();
    const hl = qa('.settings__pane select')[1] as HTMLSelectElement;
    hl.value = 'TwilightAngle';
    hl.dispatchEvent(new Event('change'));
    expect(m.app.state().settings.calc).toMatchObject({
      method: 'Turkey',
      madhab: 'Hanafi',
      highLatitudeRule: 'TwilightAngle',
    });
    expect(JSON.parse(m.store.get('adhan.settings')!).calc.madhab).toBe('Hanafi');
    expect(highLat).toBeDefined();
  });

  it('offset steppers shift the time shown behind the sheet immediately (live preview)', () => {
    m = mountApp({ start: START });
    const timeBefore = q('.chip[data-prayer="asr"] .chip__time').textContent;
    openSection(m, 'calculation');
    const plus = q('.stepper__button[aria-label="İkindi +"]');
    plus.click();
    expect(q('.stepper__value[aria-live]')).not.toBeNull();
    expect(m.app.state().settings.calc.offsets.asr).toBe(1);
    expect(q('.chip[data-prayer="asr"] .chip__time').textContent).not.toBe(timeBefore);
    // Focus stays on the same stepper button across the re-render.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('İkindi +');
    const value = qa('.stepper__value').find((o) => o.textContent === '+1 dk');
    expect(value).toBeDefined();
  });
});
