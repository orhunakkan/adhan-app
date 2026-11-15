// Smoke build (task 1): proves adhan, zod and idb-keyval bundle and run on the target.
import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';
import { createStore } from 'idb-keyval';
import { z } from 'zod';

const sample = z.object({ lat: z.number(), lng: z.number() }).parse({ lat: 21.4225, lng: 39.8262 });
const times = new PrayerTimes(
  new Coordinates(sample.lat, sample.lng),
  new Date(),
  CalculationMethod.UmmAlQura(),
);
const fmt = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});
createStore('adhan-app', 'smoke');

const root = document.getElementById('app');
if (root) {
  root.textContent = `Smoke ${__APP_VERSION__} — Mecca Dhuhr ${fmt.format(times.dhuhr)}`;
}
