# ADR-0007: Main screen only (no screensaver)

## Status
Accepted (owner decision)

## Date
2026-11-15

## Context
The owner wants the iPad to show only the main screen: clock, dates, next-prayer card and timeline. The screensaver from ADR-0006 (reflection panels, a photo slideshow and a clock pill) is not wanted in any form. Settings was reached through an invisible 3 s corner long-press that the household could not discover.

## Decision
- Remove the screensaver, reflection panels and photos end to end: the views, `src/core/panels.ts`, `src/core/photos.ts`, the photo resize adapter, the Photos settings section, the screensaver controls in Display, `public/panels/`, their CSS, i18n strings and tests. ADR-0006 is superseded.
- Settings drop `photos`, `display.screensaverMode` and `display.panelIntervalSec`. No `settingsVersion` bump: the schema strips unknown keys, so settings stored by the old build still load with every other value kept.
- On startup, after settings load, delete every IndexedDB blob that the azan audio settings do not reference (old photos `p…`, thumbnails `…-t`, unused audio), and log the count. A referenced azan file is never deleted.
- Settings opens with one tap on a subtle gear button in the top inline-start corner (still behind the PIN when one is set), replacing the long-press.

## Consequences
- Burn-in protection relies on the ±8 px pixel shift every 10 minutes and night dim. The Air 2 / mini 4 have LCD panels, where burn-in is a small risk.
- Less memory and IndexedDB use: no image decodes, object URLs or slide timers on the A8, and no photo blobs on the device.
- Devices upgraded from the old build lose their stored photos on the next start; there is no way to view them in the app any more.
- The gear is always visible (at 35 % opacity), so Settings is discoverable; the PIN and Guided Access remain the guards.
