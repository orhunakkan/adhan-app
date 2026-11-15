// Lucide icons (ISC), imported one by one so only these six are bundled.
import {
  CloudSun,
  createElement,
  Moon,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  type IconNode,
} from 'lucide';
import type { PrayerName } from '../core/prayerTimes';

/** brief §8.4: sunrise, sun, cloud-sun, sunset, moon, stars. */
const PRAYER_ICONS: Record<PrayerName, IconNode> = {
  fajr: Sunrise,
  sunrise: Sun,
  dhuhr: CloudSun,
  asr: Sunset,
  maghrib: Moon,
  isha: Sparkles,
};

export function prayerIcon(prayer: PrayerName): SVGElement {
  const svg = createElement(PRAYER_ICONS[prayer], { 'aria-hidden': 'true', class: 'icon' });
  svg.setAttribute('focusable', 'false');
  return svg;
}
