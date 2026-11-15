# Implementation Plan: Azan Clock (iPad Kiosk PWA) — V1

Source spec: SPEC.md

Task list: `tasks/todo.md` (acceptance criteria, verification and files per task). This file holds the decisions, ordering and risks.

## Overview

Build the static, offline-first azan clock PWA described in SPEC.md, in 8 phases and 39 tasks. The order follows risk: first the toolchain and Safari 15 compat gates, then the prayer-time engine, then the scheduler and audio path that decides whether an azan plays. The UI, settings, screensaver and PWA come after the core is proven. Every task is test-first (Vitest), leaves `npm run ci` green, and is one commit.

## Architecture Decisions

- **Ports and adapters everywhere** (brief §4). `src/core/ports.ts` defines Clock, MediaPlayer, WakeLockPort, KeyValueStore, BlobStore and Rng. Only `main.ts` and `src/adapters/*` touch real browser globals, and ESLint enforces it. This is what lets Vitest stand in for E2E.
- **A 1 s tick plus a pure `getDuePrayer`, never long timeouts.** The fire decision is a pure function of `(now, times, lastFired, settings)`, and `lastFired` persists. Reload safety comes from the late window and idempotency, not from timers.
- **One media element for the app's lifetime.** The audio adapter factory is called once in the Start tap handler. Every later source change goes through `setSrc`. A test asserts the factory call count.
- **Tiny explicit store, no framework.** `createStore(initial)` with named actions and a `subscribe` listener. Views are `mount(root, deps)` + `render(state)`, and they diff by toggling classes/text, never rebuilding subtrees on each tick (A8 budget).
- **Tokens in TS, emitted to CSS vars at startup.** Contrast and completeness are testable. Derived colors are precomputed `rgba()` strings, because Safari 15 has no `color-mix()`.
- **Safari 15 compat in three layers** (TS lib, compat linters, `dist/` AST/CSS tests). The `dist/` tests land in Phase 1, so every later dependency is checked from day one. That partly replaces the brief's "deploy a smoke build to the iPad on day one", which needs the owner (see Checkpoint 1).
- **Testing:** Vitest only. "E2E" means the `mountApp()` happy-dom harness plus the manual iPad checklist. No browser automation, per SPEC and CLAUDE.md.
- **ADRs** in `docs/adr/` for these decisions (written in task 37).

## Phases

| Phase | Tasks | Brief milestones | Theme |
|---|---|---|---|
| 1 Foundation | 1–5 | M1 | Toolchain, lint, Vitest projects, dist compat tests, CI, GitHub repo |
| 2 Prayer engine | 6–10 | M4 (+ pure parts of M10/M11) | Reference fixtures, prayerTimes, TZ/DST, hijri, period, nightDim, burnIn, updateGate |
| 3 Scheduler and audio | 11–17 | M2, M6, M7 | Storage/schema, logger, store + `mountApp()`, scheduler, audio, overlays, wake lock, toast |
| 4 Design system and main UI | 18–24 | M3, M5, M6 (view) | Tokens, contrast, i18n, fonts/styles, styleguide, clock, ring, timeline, background, azan view |
| 5 Settings | 25–28 | M8 | Shell + PIN, cities data, location/calculation, azan/display/about |
| 6 Screensaver and kiosk | 29–31 | M9, M10 | Panels, slideshow, burn-in shift, night dim, reduced motion |
| 7 PWA and ship-readiness | 32–37 | M11, M12, M13 | PWA/offline, update flow, debug panel, type tests + benches, audio pipeline, docs |
| 8 Ship | 38–39 | M14 | `/review` + `/code-simplify` + `/ship` fan-out, deploy, iPad checklist |

Checkpoints follow every phase (see todo.md). Each runs the full `npm run ci` and checks coverage against CONSTRAINTS.md.

## Dependency Graph (simplified)

```
toolchain → lint → vitest projects/helpers/ports → dist compat tests → CI/repo
                                  │
         fixtures → prayerTimes → tz/hijri → period/nightDim/burnIn/updateGate
                                  │
           schema/storage → logger → store+mountApp → scheduler → audio → overlays/wakeLock/toast
                                  │
           tokens → i18n → fonts/styles/styleguide → clock → ring/timeline → background → azanView
                                  │
           settings shell → cities → location/calc → azan/display/about
                                  │
           panels → slideshow → burn-in/night dim/reduced motion
                                  │
           PWA → update flow → debug panel → types/bench → audio script → docs → ship
```

## Parallelization

The build runs sequentially in a single session (`/build auto`), since each task commits on `main`. Phase 2 (pure engine) and the token/i18n tasks (18–19) are independent and could run in parallel if ever needed. The shared contract (`ports.ts`, store shape) is defined in Phase 1/3 first.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A dependency (or Vite's own output) emits syntax Safari 15 can't run | High | `dist/` acorn + Lightning CSS tests in task 4, run in CI on every change; pin versions in the lockfile |
| adhan-js Turkey method differs from Diyanet's published table by more than 2 min | Med | Per-prayer offsets exist for exactly this. Fixture tolerance stays ±2 min. If a prayer is consistently off, document the offset in README rather than loosening the test |
| Diyanet reference data unreachable from this machine | Low | Fall back to Aladhan method 13 and label the fixture source (SPEC assumption 5) |
| happy-dom gaps (SVG attributes, `<dialog>`, `matchMedia`, `HTMLMediaElement`) | Med | Stub in the dom setup file, and assert on attributes/classes rather than layout |
| 95% branch coverage on core is strict | Med | Pure functions by design, table-driven tests. No threshold edits (CONSTRAINTS.md) |
| Font budget (≤ 400 KB) with three families | Med | Use pre-subset woff2 files, drop extra weights, and measure in the build test |
| iOS behaviors untestable here (autoplay unlock, Guided Access, memory) | High | Strict adapter boundaries + the manual iPad checklist. The owner runs it in task 39 |
| Autonomous run drifts from spec | Med | Each task traces to a brief section; checkpoint summaries list deviations |

## Owner Actions (cannot be done by the agent)

- After Checkpoint 1 (recommended, non-blocking): connect Cloudflare Pages to the repo, open the smoke build on the iPad from the Home Screen, and report whether the computed prayer time shows.
- Task 39: confirm the deploy method (Cloudflare Git integration vs `wrangler`), then run the manual iPad checklist.

## Open Questions

- Cloudflare deploy method (SPEC resolved-question 4). Default: Git integration via the dashboard. Only blocks task 39.
