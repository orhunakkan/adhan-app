# ADR-0006: Screensaver rhythm

## Status
Accepted (interpretation of the brief; owner may change it)

## Date
2026-11-14

## Context
The brief says panels and photos rotate "as a screensaver" with the clock kept visible as a pill, but not when the screensaver runs on a kiosk that is never touched.

## Decision
Epoch-based, timer-free rhythm: two intervals of the full clock, then one slide (`panelIntervalSec`, default 60 s), repeating. The full clock stays from 10 minutes before to 10 minutes after each azan prayer, during an azan, during night dim and while settings are open. Mode: panels, photos or alternate.

## Consequences
- The big clock is on screen two thirds of the time and always around prayer times.
- Changing the rhythm is a change to `screensaverSlot()` in `src/core/panels.ts` and its tests.
