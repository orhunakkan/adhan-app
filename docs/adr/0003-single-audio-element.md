# ADR-0003: One persistent audio element, one Attempt per playback

## Status
Accepted

## Date
2026-11-14

## Context
iOS only allows audio after a user gesture. A web app on an always-on iPad gets that gesture once (the Start tap) and must play five azans a day for weeks without another.

## Decision
- The Start tap creates **one** `HTMLAudioElement` (via the `MediaPlayer` port), unlocks it with a 0.5 s silent clip, and every azan reuses it by changing `src`. The factory is asserted to run exactly once.
- Each playback is an **Attempt** owning its source queue, object URL and "started" flag: user upload (IndexedDB) → bundled file → Web Audio chime. Stale async work compares against the current attempt and cleans up after itself.
- `NotAllowedError` means the unlock is lost → loud "Tap to enable azan" overlay; `AbortError` means interrupted → Resume; other failures → next source, flagged as missing in Settings.
- A health check plays the silent clip 3 minutes before each prayer.
- `play()` and IndexedDB reads have timeouts (4 s / 2 s); the azan moment is capped at 20 minutes on the 1 s tick so the app can never stay stuck.

## Alternatives considered
- **A new `Audio()` per azan**: blocked by iOS without a fresh gesture.
- **Web Audio for everything**: also needs unlocking, obeys the silent switch, and decoding long files costs memory on a 2 GB device; kept only as the chime fallback.

## Consequences
- The controller is the most complex module; two adversarial review cycles shaped it (`tests/dom/audio.test.ts`, `tests/dom/azanLifecycle.test.ts`).
- Volume is the iPad's hardware buttons (iOS ignores `audio.volume`); files are loudness-normalised instead.
