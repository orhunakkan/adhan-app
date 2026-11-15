# ADR-0004: No Wake Lock reliance, no scheduled reloads, gated updates

## Status
Accepted

## Date
2026-11-14

## Context
iPadOS 15.8 has no Screen Wake Lock API. Any page reload loses the audio unlock, and with it the next azan unless someone taps.

## Decision
- The screen stays on through **Settings → Display & Brightness → Auto-Lock → Never** and the same in **Guided Access**; the app shows a one-time hint. Wake Lock is used only if a future device has it.
- No NoSleep-style hacks (looping video, reload tricks) and no scheduled reloads.
- Service-worker updates apply only on a tap, and `canApplyUpdate` blocks them from 5 minutes before an azan prayer through its late window, and while an azan plays.
- After a back/forward-cache restore the unlock is assumed lost: Start overlay again, but the azan is still attempted (a block raises the loud overlay).

## Consequences
- The kiosk setup checklist in the README is required, not optional.
- A reload count in the diagnostics panel is the leak signal on a device without Web Inspector.
