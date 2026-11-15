# ADR-0001: Vitest only, made possible by ports and adapters

## Status
Accepted

## Date
2026-11-14

## Context
The owner decided: no Playwright, no browser automation, no end-to-end framework (SPEC, CLAUDE.md). The target is an old iPad (Safari 15.8) that no CI runner can emulate anyway. The behaviour that matters most — an azan playing on time, once — still has to be proven.

## Decision
- Every side effect (time, timers, randomness, storage, IndexedDB, audio, wake lock, geolocation, service worker, photo resizing) goes through an interface in `src/core/ports.ts`. Only `src/main.ts` and `src/adapters/*` touch the real browser; ESLint enforces it.
- Logic is pure or port-driven and tested in Node; views are `mount(root)` + `render(state)` and tested in happy-dom.
- `tests/helpers/mountApp.ts` mounts the whole app with every port faked: the integration layer that stands in for E2E (full-day runs, overlays, settings, slideshow leak guards).
- Real-device behaviour (autoplay unlock, Guided Access, memory over 24 h, smoothness) is covered by the manual iPad checklist in the README.

## Alternatives considered
- **Playwright/WebKit**: closest to Safari, but ruled out by the owner, and still not iOS 15 audio policy or a 24 h soak.
- **Vitest Browser Mode**: needs a Playwright/WebdriverIO provider — same exclusion.

## Consequences
- The adapters are thin and partly untestable for real (they are unit-tested with stubs).
- Some interface noise in `createApp` deps; worth it for 2,000+ fast, deterministic tests.
