# Task List: Azan Clock V1

Source spec: SPEC.md · Plan: tasks/plan.md · Brief: adhan-app-build-plan.md (§N)

The standard verification for every task (on top of its own checks) is: the new tests fail before the change and pass after; `npm run lint && npm run typecheck && npm run test:coverage` is green; `npm run build` succeeds; one commit staged by explicit path. Each checkpoint additionally runs `npm run ci` in full.

---

## Phase 1: Foundation

- [x] **Task 1: Toolchain scaffold + smoke page** (M) — brief §2, §17.1
  - Acceptance: Vite + strict TS project with `browserslist`, Safari 15 build/CSS targets, Lightning CSS, restricted TS `lib`; `index.html` + `src/main.ts` render one computed prayer time using `adhan`, validate a sample with `zod`, and touch `idb-keyval`; `.gitignore` per brief §12.1 (incl. `public/audio/*` + `!silence.m4a`), MIT `LICENSE`
  - Verify: `npm run build` produces `dist/`; `npm run dev` serves the page with a time shown; `npx tsc --noEmit` passes, and a probe using `Array.prototype.toSorted` fails typecheck
  - Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `.gitignore`, `LICENSE`
  - Deps: none

- [x] **Task 2: Lint, format and compat guards** (S) — §2, §16
  - Acceptance: ESLint flat config with `eslint-plugin-compat`, `no-restricted-globals`/`no-restricted-syntax` for `Date.now`, argless `new Date`, `setInterval`, `Math.random`, `localStorage`, `indexedDB`, `navigator.wakeLock`, `new Audio` (exempting `main.ts`, `src/adapters/**`, `tests/**`) and a regex-lookbehind ban; Stylelint with `stylelint-no-unsupported-browser-features` (ignore `css-nesting`); Prettier
  - Verify: `npm run lint` passes; `tests/core/lintRules.test.ts` runs the ESLint Node API on fixture snippets and asserts each banned construct is reported in `src/` but allowed in adapters
  - Files: `eslint.config.js`, `.stylelintrc.json`, `.prettierrc`, `tests/core/lintRules.test.ts`, `package.json`
  - Deps: 1

- [x] **Task 3: Vitest projects, ports and fakes** (M) — §4, §13.1, §13.2
  - Acceptance: `vitest.config.ts` with `core`/`dom`/`build` projects (+ TZ-pinned core variants), coverage-v8 thresholds per SPEC, typecheck for `*.test-d.ts`; dom setup file (fake-indexeddb, media play/pause stubs, object URL stubs, matchMedia, wakeLock); `src/core/ports.ts`; helpers `FakeClock`, `FakeMediaPlayer`, `FakeWakeLock`, `MemoryStore`, `seededRng`
  - Verify: `tests/core/helpers.test.ts` exercises every fake; `tests/types/ports.test-d.ts` asserts the fakes satisfy the ports; all scripts from SPEC Commands exist
  - Files: `vitest.config.ts`, `tests/setup/dom.ts`, `src/core/ports.ts`, `tests/helpers/*.ts`, `tests/core/helpers.test.ts`, `tests/types/ports.test-d.ts`
  - Deps: 1

- [x] **Task 4: Build verification project (compat, budgets, hygiene)** (M) — §13.7
  - Acceptance: `tests/build/` checks every `dist/` JS file parses with acorn (ES2022) with no `StaticBlock` and no lookbehind; CSS has no `@container`/`color-mix(`/nested rules; JS < 150 KB gz, fonts ≤ 400 KB, audio ≤ 30 MB, no file > 25 MiB, < 20,000 files; `git ls-files public/audio` is only `silence.m4a` (never skipped when `CI`); no `.env*` tracked; `LICENSE` exists. Manifest/SW/meta/headers checks come in task 32
  - Verify: `npm run build && npm run test:build` green on the smoke build; a temp fixture with a static block and `color-mix(` makes the checks fail (unit-tested against the checker functions in `tests/build/lib/`)
  - Files: `tests/build/compat.test.ts`, `tests/build/budgets.test.ts`, `tests/build/hygiene.test.ts`, `tests/build/lib/scan.ts`, `tests/core/scan.test.ts`
  - Deps: 1, 3

- [x] **Task 5: CONSTRAINTS.md, `npm run ci`, GitHub Actions, public repo** (S) — §12, §12.1, constraint-driven-development
  - Acceptance: `CONSTRAINTS.md` records the floor, coverage numbers, budgets and the Vitest-only rule, each with its reason and command; `npm run ci` runs lint → typecheck → test:coverage → build → test:build; `.github/workflows/ci.yml` runs it on PRs and pushes to `main` (Node LTS, `npm ci`); public repo `adhan-app` created, `main` pushed, branch protection requires CI, secret scanning + push protection on
  - Verify: `npm run ci` green locally; the GitHub Actions run on `main` is green (`gh run watch`); `gh api repos/:owner/adhan-app/branches/main/protection` shows the required check
  - Files: `CONSTRAINTS.md`, `package.json`, `.github/workflows/ci.yml`, `CLAUDE.md`
  - Deps: 1–4

### Checkpoint 1: Foundation
- [x] `npm run ci` green locally and in GitHub Actions
- [ ] Owner (non-blocking): connect Cloudflare Pages, open the smoke build on the iPad from the Home Screen, confirm the prayer time renders

---

## Phase 2: Prayer engine (pure)

- [x] **Task 6: Reference fixtures** (S) — §13.3
  - Acceptance: `scripts/fetch-fixtures.mjs` (run once, not in CI) writes JSON tables with recorded source/URL/date: Schaumburg ISNA + Turkey for one winter month and one summer month; Istanbul Turkey (Diyanet table, or Aladhan method 13 labeled as such); Oslo June for each high-latitude rule
  - Verify: fixtures validate against a zod fixture schema in `tests/core/fixtures.test.ts`; each file records its source
  - Files: `scripts/fetch-fixtures.mjs`, `tests/fixtures/prayer/*.json`, `tests/core/fixtures.test.ts`
  - Deps: 3

- [ ] **Task 7: `prayerTimes` core** (M) — §5
  - Acceptance: `computeDay(date, location, calc)` returns fajr/sunrise/dhuhr/asr/maghrib/isha + `dateKey` for today and tomorrow, for every adhan method, both madhabs, all high-latitude rules, and offsets −30…+30; times compared to fixtures within ±2 min; ascending-order invariant across method × madhab (Isha may cross midnight)
  - Verify: `tests/core/prayerTimes.test.ts` (`describe.each`); Oslo June has no NaN/missing values; offset tests shift exactly
  - Files: `src/core/prayerTimes.ts`, `tests/core/prayerTimes.test.ts`
  - Deps: 6

- [ ] **Task 8: Time zones, DST, formatting and Hijri** (M) — §5, §13.3
  - Acceptance: `formatTime`/`formatDate` use `Intl.DateTimeFormat` with the configured IANA zone, 12/24 h; the local-midnight computation is zone-aware; DST spring/fall in America/Chicago and Istanbul handled; `hijri.ts` uses `islamic-umalqura` → `islamic` → hidden
  - Verify: suite runs under the `core-tz-utc` and `core-tz-tokyo` projects with identical results; Intl stub tests cover both fallbacks
  - Files: `src/core/time.ts`, `src/core/hijri.ts`, `tests/core/time.test.ts`, `tests/core/hijri.test.ts`, `vitest.config.ts`
  - Deps: 7

- [ ] **Task 9: Period and update gate** (S) — §8.3, §11
  - Acceptance: `currentPeriod(now, times)` returns fajr/sunrise/dhuhr/asr/maghrib/isha correct at and around each boundary (incl. after midnight → isha, before fajr); `canApplyUpdate(now, times, azanPlaying)` blocks within 5 min before any azan prayer and during an azan
  - Verify: table-driven boundary tests at T−1 s / T / T+1 s
  - Files: `src/core/period.ts`, `src/core/updateGate.ts`, `tests/core/period.test.ts`, `tests/core/updateGate.test.ts`
  - Deps: 7

- [ ] **Task 10: Night dim and burn-in offset** (S) — §9
  - Acceptance: `nightDimState(now, times, {afterIshaMin, beforeFajrMin, opacity})` handles the cross-midnight window and lifts 1 min before and during an azan; `burnInOffset(now, rng)` returns ±8 px values that change only on 10-minute boundaries
  - Verify: table tests plus a seeded-RNG test over 24 h of 1-minute steps
  - Files: `src/core/nightDim.ts`, `src/core/burnIn.ts`, `tests/core/nightDim.test.ts`, `tests/core/burnIn.test.ts`
  - Deps: 7

### Checkpoint 2: Prayer engine
- [ ] `npm run ci` green; core coverage ≥ 95% on all four metrics
- [ ] Summary of any fixture deviations > 1 min (candidates for documented offsets)

---

## Phase 3: Scheduler and audio (critical path; doubt-driven review on 13, 14, 15)

- [ ] **Task 11: Settings schema, defaults, storage and migrations** (M) — §9 Settings, §13.3
  - Acceptance: zod `settingsSchema` (location nullable, calc, azan per prayer, display, photos, pin), `defaults.ts` (no location), `settingsVersion` + migrations from every past version fixture; `loadSettings`/`saveSettings` via KeyValueStore (corrupt JSON → defaults + log); BlobStore over idb-keyval for audio/photos
  - Verify: round-trip, corrupt, migration and invalid-value tests; `tests/types/settings.test-d.ts` asserts `Settings` equals `z.infer`
  - Files: `src/config/schema.ts`, `src/config/defaults.ts`, `src/core/storage.ts`, `tests/core/storage.test.ts`, `tests/types/settings.test-d.ts`
  - Deps: 3

- [ ] **Task 12: Logger ring buffer** (XS) — §14
  - Acceptance: `createLogger(store, clock)` keeps the last 100 entries, persists them, survives corrupt storage
  - Verify: `tests/core/logger.test.ts`
  - Files: `src/core/logger.ts`, `tests/core/logger.test.ts`
  - Deps: 11

- [ ] **Task 13: Scheduler (pure `getDuePrayer` + tick loop)** (M) — §6
  - Acceptance: fires at T, not at T−1 s, at T+119 s, not at T+121 s; never the same key twice; skips disabled prayers and sunrise; midnight rollover and Isha after midnight; date change mid-tick; tick loop via injected Clock persists `lastFired`; pre-alert event N minutes before
  - Verify: table tests + 48 h FakeClock simulation (exactly 10 azans, correct order) + mid-day "reload" with persisted `lastFired` (no duplicates or bursts) + DST-day simulation
  - Files: `src/core/scheduler.ts`, `tests/core/scheduler.test.ts`, `tests/core/schedulerLoop.test.ts`
  - Deps: 7, 8, 11

- [ ] **Task 14: App store + `mountApp()` harness + app shell** (M) — §4, §13.2
  - Acceptance: `createStore` with explicit actions (settings, times, period, nextPrayer, audioStatus, overlay); `createApp(deps)` wires the scheduler, recalculation at local midnight, settings change, and `visibilitychange`/`pageshow`; `mountApp(overrides)` mounts it into happy-dom with all fakes
  - Verify: `tests/dom/app.test.ts`: advancing FakeClock through a prayer dispatches the azan action; midnight triggers recalculation
  - Files: `src/app/store.ts`, `src/app/createApp.ts`, `tests/helpers/mountApp.ts`, `tests/dom/app.test.ts`, `src/main.ts`
  - Deps: 12, 13

- [ ] **Task 15: Audio controller (single element, sources, events)** (M) — §7
  - Acceptance: `unlock()` creates the player exactly once and plays `silence.m4a`; azans reuse it (identity asserted); source order user Blob → bundled → Web Audio chime fallback with a warning flag; object URLs revoked after `ended`; `pause` during azan → interrupted status; `ended` → dua if enabled → idle
  - Verify: `tests/dom/audio.test.ts` with FakeMediaPlayer + fake-indexeddb; the factory call count is 1 across a simulated day
  - Files: `src/core/audio.ts`, `src/adapters/media.ts`, `tests/dom/audio.test.ts`
  - Deps: 11, 14

- [ ] **Task 16: Start overlay, health check, resume, pageshow** (M) — §7, §8.7
  - Acceptance: "Tap to Start" on launch; health check 3 min before each prayer; a `NotAllowedError` (or any error) shows the danger "Tap to enable azan" overlay (TR/EN/AR), and tapping it re-unlocks and hides it; `pageshow` persisted → start overlay; interrupted azan shows Resume; overlays trap focus and use `aria-live`
  - Verify: `tests/dom/overlays.test.ts` drives each path through `mountApp()`
  - Files: `src/ui/startOverlay.ts`, `src/app/createApp.ts`, `tests/dom/overlays.test.ts`
  - Deps: 15

- [ ] **Task 17: Wake lock (progressive) + toast** (S) — §7b, §8.7
  - Acceptance: unsupported path (primary): no throw, the one-time Auto-Lock hint shows once and never after a reload; supported: requested after Start, re-requested on visible; rejected → hint; toast pill auto-dismisses and supports an action button
  - Verify: `tests/dom/wakeLock.test.ts`, `tests/dom/toast.test.ts`
  - Files: `src/core/wakeLock.ts`, `src/ui/toast.ts`, `tests/dom/wakeLock.test.ts`, `tests/dom/toast.test.ts`
  - Deps: 14

### Checkpoint 3: Azan path proven
- [ ] `npm run ci` green; `doubt-driven-development` review of tasks 13–15 done, findings fixed or recorded
- [ ] A `mountApp()` full-day run fires 5 azans through FakeMediaPlayer with the right sources

---

## Phase 4: Design system and main UI

- [ ] **Task 18: Design tokens, emitter and contrast** (M) — §8.3, §13.4
  - Acceptance: `tokens.ts` (themes Midnight/Emerald/Sand, periodGradients, space, radius, motion, type), `applyTokens(root, theme)` sets CSS vars + `data-theme`; `contrast.ts` (WCAG); contrast ≥ 4.5 / 3.0 / 3.0 / 4.5 across every theme × period stop + midpoint; no `#fff` large surfaces in dark themes
  - Verify: `tests/core/tokens.test.ts` (incl. an inline snapshot of the emitted vars), `tests/types/tokens.test-d.ts`
  - Files: `src/design/tokens.ts`, `src/design/contrast.ts`, `tests/core/tokens.test.ts`, `tests/core/contrast.test.ts`, `tests/types/tokens.test-d.ts`
  - Deps: 3

- [ ] **Task 19: i18n (TR/EN/AR, RTL)** (S) — §9 i18n
  - Acceptance: `t(key, vars)` with tr/en/ar JSON; prayer names per language; `applyLocale(doc, lang)` sets `lang` + `dir`
  - Verify: parity test (identical keys, no empty strings, matching placeholders); RTL attribute test
  - Files: `src/i18n/index.ts`, `src/i18n/{tr,en,ar}.json`, `tests/core/i18n.test.ts`
  - Deps: 3

- [ ] **Task 20: Fonts, base/component styles, styleguide route** (M) — §8.2, §8.4 Cards, §8.9, §8.10
  - Acceptance: self-hosted woff2 (Inter, IBM Plex Sans Arabic, Noto Naskh Arabic) + OFL files in `public/fonts/`, `@font-face` + preloads; `base.css`/`components.css` with `@layer`, logical properties, 48 px touch-target class, optional glass class; `/styleguide` (dev only) renders every component, theme and period gradient
  - Verify: fonts ≤ 400 KB in the build test; the styleguide is excluded from the prod build (build test); Stylelint compat passes
  - Files: `public/fonts/*`, `src/styles/base.css`, `src/styles/components.css`, `src/ui/styleguide.ts`, `index.html`
  - Deps: 18

- [ ] **Task 21: Clock view** (M) — §8.4, §8.2
  - Acceptance: large clock (12/24 h, optional seconds, text-only updates), Gregorian + Hijri date, location; landscape 60/40 and portrait stacked via media-query classes
  - Verify: `tests/dom/clockView.test.ts` with `toMatchFileSnapshot` for landscape/portrait; seconds-toggle and format tests; the render-per-tick path doesn't recreate nodes (node identity assertion)
  - Files: `src/ui/clockView.ts`, `src/styles/views.css`, `tests/dom/clockView.test.ts`
  - Deps: 14, 19, 20

- [ ] **Task 22: Next-prayer card, progress ring, timeline, pre-alert** (M) — §8.4
  - Acceptance: hero card with name/time/countdown inside an SVG ring; `stroke-dashoffset` correct at 0/50/100%; six timeline chips with Lucide icons and past/current/next states; pre-alert pill "Akşam in 10 min" N minutes before
  - Verify: `tests/dom/progressRing.test.ts`, `tests/dom/timeline.test.ts`, pre-alert test via FakeClock
  - Files: `src/ui/progressRing.ts`, `src/ui/nextPrayerCard.ts`, `src/ui/timeline.ts`, `tests/dom/progressRing.test.ts`, `tests/dom/timeline.test.ts`
  - Deps: 21

- [ ] **Task 23: Living background + full-day UI simulation** (S) — §8.1, §8.3, §13.6
  - Acceptance: two stacked gradient layers crossfading over about 60 s by opacity; `data-period` on `<html>`; optional geometric SVG pattern at 3–6% opacity; theme switch updates `data-theme` + vars
  - Verify: `tests/dom/fullDay.test.ts`: 00:00→23:59 in Schaumburg, checking chip states, next-prayer card, countdown and `data-period` changes at each prayer
  - Files: `src/ui/background.ts`, `public/patterns/*.svg`, `tests/dom/fullDay.test.ts`, `tests/dom/themes.test.ts`
  - Deps: 18, 22

- [ ] **Task 24: Azan view** (M) — §8.5
  - Acceptance: full-screen takeover (600 ms fade/scale), name TR + AR, time, breathing glow, audio progress bar, Stop + Resume, dua text while it plays, back to the clock on end
  - Verify: `tests/dom/azanView.test.ts` and the full-day test asserts takeover appears and leaves at each azan
  - Files: `src/ui/azanView.ts`, `src/styles/views.css`, `tests/dom/azanView.test.ts`, `tests/dom/fullDay.test.ts`
  - Deps: 16, 23

### Checkpoint 4: Main experience
- [ ] `npm run ci` green; ui coverage ≥ 85%
- [ ] Owner (non-blocking): review `/styleguide` and the main screen in the browser or on the iPad

---

## Phase 5: Settings

- [ ] **Task 25: Settings shell, long-press, PIN, controls** (M) — §8.8, §9 Settings
  - Acceptance: 3 s corner long-press opens a sheet; optional 4-digit PIN gate; sidebar (landscape) / drill-down (portrait); toggle, segmented, stepper and list primitives with accessible names and ≥ 48 px targets
  - Verify: `tests/dom/settingsShell.test.ts` (long-press timing with fake timers, PIN right/wrong, a11y checks)
  - Files: `src/ui/settings/shell.ts`, `src/ui/settings/controls.ts`, `src/styles/components.css`, `tests/dom/settingsShell.test.ts`
  - Deps: 11, 20

- [ ] **Task 26: Cities dataset** (S) — §5
  - Acceptance: `scripts/build-cities.mjs` generates `public/data/cities.json` from GeoNames cities15000 (CC BY 4.0), < 500 KB, with name/country/lat/lng/tz; search helper (accent-insensitive)
  - Verify: `tests/core/cities.test.ts`: zod parse, size < 500 KB, no duplicate ids, every tz in `Intl.supportedValuesOf('timeZone')`, search finds "istanbul" for "İstanbul"
  - Files: `scripts/build-cities.mjs`, `public/data/cities.json`, `src/core/cities.ts`, `tests/core/cities.test.ts`
  - Deps: 11

- [ ] **Task 27: Location and Calculation sections + live preview** (M) — §5, §8.8
  - Acceptance: "Use my location" (injected geolocation, used once), manual lat/lng + timezone picker, city search; method, madhab, high-latitude rule, per-prayer offset steppers; every change validates, persists, and updates the clock behind the sheet immediately
  - Verify: `tests/dom/settingsLocationCalc.test.ts` (invalid input rejected, persistence, live preview changes the times shown)
  - Files: `src/ui/settings/location.ts`, `src/ui/settings/calculation.ts`, `tests/dom/settingsLocationCalc.test.ts`
  - Deps: 25, 26

- [ ] **Task 28: Azan, Display and About sections** (M) — §9 Settings, §7
  - Acceptance: per-prayer enable, audio mapping (default makam map), upload to IndexedDB, Test azan, dua toggle, late window; theme, language (RTL), 12/24 h, seconds, panel interval, screensaver mode, pattern, glass, night dim schedule and opacity; About: version, storage used (Blob sum, no `estimate()`), Reset all
  - Verify: `tests/dom/settingsAzanDisplay.test.ts` (Test azan calls the player with the right source, Reset restores defaults, RTL snapshot stable, storage sum without `estimate`)
  - Files: `src/ui/settings/azan.ts`, `src/ui/settings/display.ts`, `src/ui/settings/about.ts`, `tests/dom/settingsAzanDisplay.test.ts`
  - Deps: 25

### Checkpoint 5: Configurable
- [ ] `npm run ci` green; the settings flow runs end to end in `mountApp()`

---

## Phase 6: Screensaver and kiosk

- [ ] **Task 29: Panels** (S) — §9 Panels, §8.6
  - Acceptance: `public/panels/panels.json` (10–20 placeholder EN Pickthall + AR entries with sources, marked placeholder) validated by zod; rotation every N s; Arabic above translation; ≤ 2 panel nodes; crossfade
  - Verify: `tests/core/panelsData.test.ts`, `tests/dom/panels.test.ts`
  - Files: `public/panels/panels.json`, `src/ui/panels.ts`, `tests/core/panelsData.test.ts`, `tests/dom/panels.test.ts`
  - Deps: 19, 20

- [ ] **Task 30: Photos: upload/resize + slideshow** (M) — §9 Photo screensaver
  - Acceptance: resize to ≤ 2048 px with `<canvas>` + `toBlob` (JPEG 0.85), canvas released; store in IndexedDB; Photos settings section (upload/delete); slideshow with Ken Burns + scrim, ≤ 2 `<img>`, immediate revoke; modes panels/photos/alternate; compact clock pill rotating corners every 10 min
  - Verify: `tests/dom/slideshow.test.ts` (20 photos × 2 h: ≤ 2 imgs, revoke count = create count), `tests/dom/photoResize.test.ts`
  - Files: `src/core/photos.ts`, `src/ui/slideshow.ts`, `src/ui/settings/photos.ts`, `tests/dom/slideshow.test.ts`, `tests/dom/photoResize.test.ts`
  - Deps: 28, 29

- [ ] **Task 31: Burn-in shift, night dim overlay, reduced motion** (S) — §9, §8.9
  - Acceptance: layout transform from `burnInOffset` every 10 min; dim overlay at 01:00, removed at Fajr − 1 min and during azan; `prefers-reduced-motion` → `reduced-motion` class, no Ken Burns/breathing classes
  - Verify: `tests/dom/kiosk.test.ts`
  - Files: `src/ui/kiosk.ts`, `src/app/createApp.ts`, `tests/dom/kiosk.test.ts`
  - Deps: 10, 24, 30

### Checkpoint 6: Feature complete
- [ ] `npm run ci` green, all coverage thresholds met
- [ ] Every brief §13.6 bullet maps to a passing test (list in the checkpoint summary)

---

## Phase 7: PWA and ship-readiness

- [ ] **Task 32: PWA, Apple meta, icons, headers** (M) — §11, §12, §13.7
  - Acceptance: vite-plugin-pwa manifest (standalone, theme color, 180/192/512 icons) and precache (shell, fonts, panels, patterns, silence, cities); Apple meta tags, `viewport-fit=cover`, startup image, safe-area padding; `storage.persist()` after Start (feature-detected); `public/_headers`; icon generation script
  - Verify: build tests for manifest, precache list, meta tags, preloads, `_headers` rules
  - Files: `vite.config.ts`, `index.html`, `public/_headers`, `scripts/build-icons.mjs`, `tests/build/pwa.test.ts`
  - Deps: 20, 26, 29

- [ ] **Task 33: Service worker update flow** (S) — §11
  - Acceptance: a waiting SW shows the "Update available — tap to apply" toast; apply is blocked by `canApplyUpdate` near prayers or during an azan (with a toast explaining it), allowed otherwise
  - Verify: `tests/dom/update.test.ts` with an injected SW-registration port
  - Files: `src/core/swUpdate.ts`, `src/adapters/sw.ts`, `tests/dom/update.test.ts`
  - Deps: 9, 17, 32

- [ ] **Task 34: Debug panel** (S) — §14, observability
  - Acceptance: hidden screen from About showing version, SW status, wake-lock state, audio unlock, last health check, `lastFired`, reload count since install, storage used, period/theme, last 100 log lines
  - Verify: `tests/dom/debugPanel.test.ts`
  - Files: `src/ui/debugPanel.ts`, `src/app/createApp.ts`, `tests/dom/debugPanel.test.ts`
  - Deps: 12, 28, 33

- [ ] **Task 35: Type tests completion + benchmarks** (S) — §13.8, §13.9
  - Acceptance: all §13.8 type tests present; benches for a year of times (< 50 ms), `getDuePrayer` (< 0.05 ms) and clock render per tick; baseline recorded for README
  - Verify: `npm run typecheck`, `npm run bench`
  - Files: `tests/types/*.test-d.ts`, `tests/bench/*.bench.ts`
  - Deps: 31

- [ ] **Task 36: Audio pipeline** (S) — §10
  - Acceptance: `scripts/normalize-audio.sh` (loudnorm, AAC 128k, trims silence, `--silence` generates the 0.5 s `silence.m4a`); `public/audio/silence.m4a` committed; audio budget + gitignore enforced by build tests
  - Verify: run the script on a generated test tone; build hygiene test passes
  - Files: `scripts/normalize-audio.sh`, `public/audio/silence.m4a`
  - Deps: 4

- [ ] **Task 37: README, notices, ADRs** (S) — §12.1, §15, documentation-and-adrs
  - Acceptance: README with dev commands, audio + rights, deploy (both Cloudflare paths), iPad kiosk checklist, manual test checklist, bench baseline, contributing; `THIRD_PARTY_NOTICES.md`; ADRs for the ports/adapters, 1 s tick, single audio element, no wake lock / no reload, and Vitest-only testing decisions
  - Verify: the build hygiene test (notices + licenses) passes; links resolve
  - Files: `README.md`, `THIRD_PARTY_NOTICES.md`, `docs/adr/*.md`
  - Deps: 35, 36

### Checkpoint 7: Release candidate
- [ ] `npm run ci` green locally and on GitHub
- [ ] All SPEC automated success criteria checked off

---

## Phase 8: Ship

- [ ] **Task 38: Review, simplify, ship decision** (M) — code-review-and-quality, code-simplification, shipping-and-launch
  - Acceptance: five-axis review; simplification pass with behavior preserved; `/ship` fan-out (code-reviewer, security-auditor, test-engineer — no E2E proposals) merged into a GO/NO-GO with a rollback plan (Cloudflare Pages "rollback to previous deployment")
  - Verify: Critical/Required findings fixed with tests; `npm run ci` green
  - Files: as findings require
  - Deps: 37

- [ ] **Task 39: Deploy + manual iPad checklist** (S, owner-gated)
  - Acceptance: the owner confirms the deploy method; production deploy from `main`; owner runs the README manual checklist and the 7-day acceptance run
  - Verify: the live `*.pages.dev` URL serves the build with correct `_headers`; checklist results recorded in `tasks/todo.md`
  - Files: `README.md` (deploy URL), `tasks/todo.md`
  - Deps: 38

### Checkpoint 8: Shipped
- [ ] SPEC success criteria (automated + manual) all checked; SPEC `Status: implemented`
