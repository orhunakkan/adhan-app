# ADR-0002: A 1-second tick, a pure fire rule, and "a key fires at most once"

## Status
Accepted

## Date
2026-11-14

## Context
iOS throttles and drifts long timers, and the page can sleep, reload or lose its timers at any time. The azan must play within 2 s of its time and never twice, including after a reload, DST, midnight, high-latitude edge cases and settings or location changes.

## Decision
- One `setInterval` of 1 s; every tick calls pure `getDuePrayer(now, days, fired, enabled, lateWindow)`.
- An azan is due when `0 ≤ now − time ≤ lateWindow` (default 120 s), so a wake or reload never bursts old azans.
- Idempotency is the **set** of recently fired keys `YYYY-MM-DD:prayer` (last 32, persisted to `adhan.lastFired`), compared by key. Instants — not key order — decide what is due: at high latitude adhan can put Isha(D) after Fajr(D+1) (Oslo, July) or Asr before Dhuhr (polar circle).
- The key is recorded before notifying; a consumer that throws gets bounded retries (3) within the window.
- Times are recomputed when the location's calendar date or the location/calculation settings change.

## Alternatives considered
- **A single "last fired" high-water mark** (first version): failed an adversarial review — key order is not time order at high latitude, and a westward location change blocked the rest of the day.
- **Matching by key and instant**: let a madhab/rule change replay an azan more than an hour away; rejected for "never twice".

## Consequences
- After a same-day location change, a prayer that already played today does not play again at the new location (accepted cost of "never twice").
- Deep inside the polar circle (e.g. Utqiagvik, 71°N, polar night) adhan's polar resolution can return times days away from their date; those do not fire (documented limitation).
- Three review cycles and their regressions live in `tests/core/schedulerReview.test.ts`.
