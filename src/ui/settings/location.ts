// Location (brief §5): "Use my location" once, city search, or manual entry.
import { isValidTimeZone, locationSchema } from '../../config/schema';
import { cityLabel, searchCities, type City } from '../../core/cities';
import type { Location } from '../../core/prayerTimes';
import { t } from '../../i18n';
import { h } from '../dom';
import { actionButton, field, group } from './controls';
import type { SettingsContext, SettingsSection } from './shell';

const EARTH_KM = 6371;
const NEAREST_CITY_KM = 50;

export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
}

export function nearestCity(
  cities: readonly City[],
  at: { lat: number; lng: number },
): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    const d = distanceKm(c, at);
    if (d < bestKm) [best, bestKm] = [c, d];
  }
  return bestKm <= NEAREST_CITY_KM ? best : null;
}

function apply(ctx: SettingsContext, location: Location): boolean {
  try {
    ctx.app.updateSettings({ location: locationSchema.parse(location) });
    ctx.toast(t(ctx.lang, 'settings.saved'));
    return true;
  } catch {
    ctx.toast(t(ctx.lang, 'settings.invalid'));
    return false;
  }
}

export const locationSection: SettingsSection = {
  id: 'location',
  render(pane, ctx) {
    const lang = ctx.lang;
    const loc = ctx.state.settings.location;

    const current = group(t(lang, 'location.current'));
    current.body.append(
      h(
        'p',
        'row location__current',
        loc
          ? `${loc.name} · ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} · ${loc.tz}`
          : t(lang, 'location.missing'),
      ),
    );
    const mine = actionButton(t(lang, 'location.useMine'), () => {
      void (async () => {
        try {
          const pos = await ctx.services.geolocation.getPosition();
          const city = nearestCity(await ctx.services.loadCities(), pos);
          apply(ctx, {
            name: city ? cityLabel(city) : t(lang, 'location.mine'),
            lat: Math.round(pos.lat * 10_000) / 10_000,
            lng: Math.round(pos.lng * 10_000) / 10_000,
            tz: city?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        } catch {
          ctx.toast(t(lang, 'location.geoError'));
        }
      })();
    });
    mine.dataset.key = 'use-my-location';
    current.body.append(mine);
    pane.append(current.el);

    const search = group(t(lang, 'location.search'));
    const input = h('input', 'input touch-target');
    input.type = 'search';
    input.dataset.key = 'city-search';
    input.setAttribute('aria-label', t(lang, 'location.search'));
    input.autocomplete = 'off';
    const results = h('ul', 'results');
    results.setAttribute('role', 'listbox');
    let cities: City[] | null = null;
    const show = () => {
      results.replaceChildren();
      if (!cities || !input.value.trim()) return;
      const found = searchCities(cities, input.value, 8);
      if (!found.length) results.append(h('li', 'results__empty', t(lang, 'location.noResults')));
      for (const c of found) {
        const li = h('li');
        const b = h('button', 'results__item touch-target', cityLabel(c));
        b.type = 'button';
        b.setAttribute('role', 'option');
        b.addEventListener('click', () =>
          apply(ctx, { name: cityLabel(c), lat: c.lat, lng: c.lng, tz: c.tz }),
        );
        li.append(b);
        results.append(li);
      }
    };
    input.addEventListener('input', () => {
      if (cities) show();
      else
        void ctx.services.loadCities().then(
          (list) => ((cities = list), show()),
          () => results.replaceChildren(h('li', 'results__empty', t(lang, 'location.noResults'))),
        );
    });
    search.body.append(input, results);
    pane.append(search.el);

    const manual = group(t(lang, 'location.manual'));
    const name = h('input', 'input touch-target');
    name.value = loc?.name ?? '';
    const lat = h('input', 'input touch-target');
    const lng = h('input', 'input touch-target');
    for (const [i, v] of [
      [lat, loc?.lat],
      [lng, loc?.lng],
    ] as const) {
      i.type = 'number';
      i.step = 'any';
      i.inputMode = 'decimal';
      i.value = v === undefined ? '' : String(v);
    }
    const tz = h('select', 'select touch-target');
    const zones = Intl.supportedValuesOf('timeZone');
    const selected = loc?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    for (const z of zones.includes(selected) || !isValidTimeZone(selected)
      ? zones
      : [selected, ...zones]) {
      const o = h('option', '', z);
      o.value = z;
      o.selected = z === selected;
      tz.append(o);
    }
    name.dataset.key = 'manual-name';
    lat.dataset.key = 'manual-lat';
    lng.dataset.key = 'manual-lng';
    tz.dataset.key = 'manual-tz';
    const save = actionButton(
      t(lang, 'location.save'),
      () => {
        // Number('') is 0: a blank field must not silently become 0,0 (wrong times).
        if (!lat.value.trim() || !lng.value.trim() || !name.value.trim()) {
          ctx.toast(t(lang, 'settings.invalid'));
          return;
        }
        apply(ctx, {
          name: name.value,
          lat: Number(lat.value),
          lng: Number(lng.value),
          tz: tz.value,
        });
      },
      'pill-button--accent',
    );
    save.dataset.key = 'manual-save';
    manual.body.append(
      field(t(lang, 'location.name'), name),
      field(t(lang, 'location.lat'), lat),
      field(t(lang, 'location.lng'), lng),
      field(t(lang, 'location.tz'), tz),
      save,
    );
    pane.append(manual.el);
  },
};
