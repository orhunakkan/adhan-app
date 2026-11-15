// Lucide icons (ISC), imported one by one so only these seven are bundled.
import {
  CloudSun,
  createElement,
  Moon,
  Settings,
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

/** A decorative icon: hidden from assistive tech (its control carries the name). */
function icon(node: IconNode): SVGElement {
  const svg = createElement(node, { 'aria-hidden': 'true', class: 'icon' });
  svg.setAttribute('focusable', 'false');
  return svg;
}

export function prayerIcon(prayer: PrayerName): SVGElement {
  return icon(PRAYER_ICONS[prayer]);
}

/** The gear on the Settings button. */
export function settingsIcon(): SVGElement {
  return icon(Settings);
}
