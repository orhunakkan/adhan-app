# Spec: Azan Clock (iPad Kiosk PWA) — V1

Status: approved (2026-11-14)

Detailed requirements: `adhan-app-build-plan.md` (the "brief"). This spec is the agreed contract. It lists every requirement area and points to the brief section that holds the detail, instead of copying it. If the two disagree, this spec wins and the brief gets corrected.

## Objective

Turn a dedicated, always-plugged-in iPad (iPadOS 15.8, Safari 15.8, A8/A8X, 2 GB RAM, 2048×1536 LCD) into an always-on azan clock that:

1. Calculates prayer times on-device for one configured location (adhan-js), with method, madhab, high-latitude rule and per-prayer offsets (brief §5).
2. Plays the azan at each enabled prayer within 2 s of its time, never twice, never in a late burst after a reload, wake, DST change or midnight (brief §6, §7).
3. Shows a modern, calm, dark-first clock screen readable from about 4 m: clock, Gregorian and Hijri dates, next-prayer card with progress ring and countdown, six-prayer timeline, and a period-driven sky gradient (brief §8).
4. Rotates reflection panels and personal photos as a screensaver, with burn-in shift and night dim (brief §9).
5. Works fully offline after the first load, and survives 24 h+ without Safari reloading the page (brief §11, §18).

**Users:** the household that owns the iPad (sees the screen, hears the azan, occasionally taps "Start" after a reboot), and the maintainer (sets it up, uploads azan audio, changes settings behind a PIN).

**Explicit non-goals:** background/locked-screen audio, web push, native app, any backend or database, copying AYiNE's content or branding, and any browser-automation or E2E test framework (brief §1 Non-goals).

## Tech Stack

Per brief §2, with versions pinned in `package-lock.json` at scaffold time (latest stable releases, APIs checked against official docs per `source-driven-development`):

- Vite + TypeScript (strict), vanilla TS modules, no UI framework. Lightning CSS transformer and minifier.
- Targets: `browserslist: ["iOS >= 15.6"]`, Vite `build.target: ['safari15','ios15']`, `cssTarget: 'safari15'`, TS `lib` limited to ES2021 + the listed ES2022 parts.
- `adhan`, `zod`, `idb-keyval`, `vite-plugin-pwa` (Workbox), Lucide icons (individual SVGs).
- Self-hosted variable woff2 fonts: Inter, IBM Plex Sans Arabic (or Noto Kufi Arabic), Noto Naskh Arabic.
- Vitest (+ `@vitest/coverage-v8`, `@vitest/ui`, `happy-dom`, `fake-indexeddb`), ESLint + `eslint-plugin-compat`, Stylelint + `stylelint-no-unsupported-browser-features`, Prettier, `acorn` for dist compat tests.
- CI: GitHub Actions on Node LTS. Hosting: Cloudflare Pages free plan (static only).

Adding any runtime dependency not listed here is an **Ask first** item (see Boundaries).

## Commands

```
npm run dev            # Vite dev server (includes /styleguide route)
npm run lint           # eslint . && stylelint "src/**/*.css" && prettier --check .
npm run typecheck      # tsc --noEmit (app) + vitest --typecheck type tests
npm test               # vitest (watch)
npm run test:run       # vitest run --project core --project dom
npm run test:coverage  # vitest run --project core --project dom --coverage
npm run test:ui        # vitest --ui
npm run build          # vite build → dist/
npm run test:build     # vitest run --project build (requires dist/)
npm run bench          # vitest bench (local only, not in CI)
npm run ci             # lint → typecheck → test:coverage → build → test:build
scripts/normalize-audio.sh <in> <out.m4a>   # ffmpeg loudnorm + trim; also generates silence.m4a
```

## Project Structure

As in brief §3, plus the lifecycle artifacts:

```
src/config      → defaults, zod schemas (settings, panels, cities)
src/core        → pure logic + ports (prayerTimes, scheduler, audio, wakeLock, storage, hijri,
                  period, nightDim, burnIn, updateGate, logger, ports)
src/design      → tokens.ts (source of truth → CSS vars), contrast.ts
src/ui          → mount/render view modules (overlays, clock, ring, azan, panels, slideshow,
                  settings, toast, debug panel, styleguide)
src/i18n        → tr.json, en.json, ar.json
src/styles      → base.css, components.css, views.css (@layer, nesting compiled out)
src/main.ts     → the only place real browser adapters are created
public/         → audio/silence.m4a, fonts/ (+ OFL licenses), panels/, patterns/, icons/, _headers
scripts/        → normalize-audio.sh, data build scripts (cities, icons)
tests/          → core/, dom/, build/, bench/, types/, fixtures/, helpers/
docs/adr/       → architecture decision records
tasks/          → plan.md, todo.md
SPEC.md, CONSTRAINTS.md, CLAUDE.md, README.md, LICENSE, THIRD_PARTY_NOTICES.md
```

## Code Style

Small modules, named exports, no default exports. Side effects only through ports. UI modules expose `mount(root, deps)` and `render(state)`. Pure functions take `now` explicitly.

```ts
// src/core/scheduler.ts
import type { PrayerName, DayTimes } from './prayerTimes';

export interface DueInput {
  now: Date;
  times: DayTimes;                    // today's (and yesterday's Isha if after midnight)
  lastFired: string | null;           // "YYYY-MM-DD:prayer"
  enabled: Readonly<Record<PrayerName, boolean>>;
  lateWindowMs: number;               // default 120_000
}

export function getDuePrayer(input: DueInput): { key: string; prayer: PrayerName } | null {
  for (const p of AZAN_PRAYERS) {     // excludes sunrise
    const at = input.times[p];
    const late = input.now.getTime() - at.getTime();
    const key = `${input.times.dateKey}:${p}`;
    if (input.enabled[p] && late >= 0 && late <= input.lateWindowMs && key !== input.lastFired) {
      return { key, prayer: p };
    }
  }
  return null;
}
```

- Prettier defaults (single quotes, 100 cols), ESLint with the restricted-globals and no-lookbehind rules from brief §16.
- CSS: `@layer reset, base, components, views, utilities;`. Logical properties only, tokens only (no raw colors in CSS), and animations limited to `opacity`/`transform`.
- File names are camelCase `.ts`. Tests mirror source: `src/core/period.ts` → `tests/core/period.test.ts`.

## Testing Strategy

**Vitest only. No Playwright or any browser automation (decision fixed by the owner).** Full detail in brief §13; summary:

| Level | Project / env | Covers |
|---|---|---|
| Unit (pure core) | `core` / node | prayer times vs reference fixtures (±2 min), TZ/DST under `TZ=UTC` and `TZ=Asia/Tokyo`, `getDuePrayer` tables, 48 h scheduler simulation, period, night dim, burn-in, update gate, hijri fallback, storage + migrations, logger, data validation, i18n parity, design tokens and WCAG contrast |
| Integration ("E2E substitute") | `dom` / happy-dom | `mountApp()` harness with FakeClock, FakeMediaPlayer, FakeWakeLock, MemoryStore, fake-indexeddb, seeded RNG: full-day simulation, audio unlock/health check/resume, overlays, settings, RTL, panels, slideshow leak guard, reduced motion, night dim, a11y smoke checks, file snapshots |
| Build verification | `build` / node vs `dist/` | manifest, SW precache list, meta tags, `_headers`, JS/fonts/audio/file-count budgets, Safari 15 syntax/CSS compat via acorn + Lightning CSS, repo hygiene (no audio, no `.env`, licenses present) |
| Types | `--typecheck` | settings type = `z.infer`, fakes satisfy ports, token maps complete |
| Bench | `vitest bench` (local) | year of times < 50 ms, `getDuePrayer` < 0.05 ms, clock render per tick |
| Manual | real iPad | brief §15.4 checklist (autoplay unlock, 24 h soak, offline day, reboot, Siri, memory, Guided Access, update toast, visuals, 1-week timetable comparison) |

Coverage thresholds (CI-failing): `src/core/**` + `src/design/**` ≥ 95% (lines, branches, functions, statements); `src/ui/**` ≥ 85%; overall ≥ 90%; `main.ts` and type-only files excluded. TDD: write the failing test first for every behavior; every bug fix gets a regression test.

## Boundaries

- **Always:** run `npm run ci` (or the relevant subset at task end; the full run at checkpoints) before committing; write the test first; keep every side effect behind a port; check new dependency output against the Safari 15 list; keep one commit per task, staged by explicit path; update SPEC/plan when a decision changes.
- **Ask first:** adding a runtime dependency not in Tech Stack; changing a coverage threshold or budget; creating or pushing to the GitHub repo, changing branch protection; connecting or deploying to Cloudflare Pages; anything touching the user's accounts; replacing the placeholder panel content source.
- **Never:** Playwright / Cypress / WebdriverIO / Puppeteer / Vitest Browser Mode / Chrome DevTools MCP / Lighthouse automation; commit audio other than `silence.m4a`; commit real coordinates, a PIN, photos, `.env*` or secrets; scheduled page reloads or NoSleep hacks; long `setTimeout` scheduling of azans; weaken `CONSTRAINTS.md` to get green.

## Success Criteria

Verified automatically (by the agent, in CI):

- [ ] `npm run ci` passes from a clean checkout: lint, typecheck, `core` + `dom` with coverage thresholds met, build, `build` project.
- [ ] Calculated times match reference fixtures within ±2 min (Istanbul Turkey method vs Diyanet's published table; Oslo June under every high-latitude rule vs Aladhan, with no NaN) and the NOAA solar-position oracle within ±90 s for every day of 2026 (Schaumburg, Istanbul, Mecca; ISNA + Turkey; both madhabs); offsets shift exactly.
- [ ] Scheduler simulations prove: exactly 10 azans in 48 h in correct order; no duplicate or burst after a simulated reload, DST transition or midnight rollover; T−1 s / T / T+119 s / T+121 s boundaries hold.
- [ ] The audio factory is called exactly once per app lifetime, and every azan reuses that instance. A failed health check shows the danger "Tap to enable azan" overlay.
- [ ] Every theme × period gradient stop (and midpoint): text-1 ≥ 4.5:1, text-2 ≥ 3:1, accent on surface ≥ 3:1.
- [ ] Slideshow over 20 photos and 2 simulated hours: ≤ 2 `<img>` in the DOM at any time, every object URL revoked.
- [ ] `dist/`: JS < 150 KB gzipped, fonts ≤ 400 KB, audio ≤ 30 MB, no file > 25 MiB, < 20,000 files, no `@container` / `color-mix(` / nested CSS rules / static blocks / lookbehind.
- [ ] Repo contains no Playwright/E2E dependency, no audio except `silence.m4a`, no `.env*`; `LICENSE`, `THIRD_PARTY_NOTICES.md` and font licenses present.

Verified manually by the owner on the iPad (agent cannot do these):

- [ ] Brief §18: every enabled azan plays within 2 s for 7 days, Wi-Fi on or off; one tap restores audio after reboot; 24 h slideshow without a page reload; looks polished in both orientations, all three themes and Arabic RTL; smooth on the A8 iPad; times match the local mosque within ±2 min.

## Out of Scope (Deferred)

- Playing azan while locked/backgrounded, web push, native app, backend (platform-impossible or non-goal).
- Multiple saved locations (brief says one location only).
- Background video during azan (brief §7 allows it as optional; deferred to keep the A8 GPU budget for the ring/glow).
- Wrangler deploys from GitHub Actions (Cloudflare Git integration is the V1 path).
- Dependabot/Renovate (optional in brief; can be added after V1 with the compat gate).

## Assumptions (correct any of these)

1. **One spec, phased plan.** The brief bundles several capabilities, but they all ship together as one app for one consumer, so I'm using a single SPEC.md with a phased plan instead of per-module specs.
2. **Default location:** none. First run shows a setup prompt (no Mecca default), so no coordinates live in the repo.
3. **Fonts** come from the `@fontsource` npm packages (OFL 1.1), using their pre-subset woff2 files (latin, latin-ext, arabic) copied into `public/fonts/` with the license files. If the 400 KB budget is tight, I drop to fewer weights rather than raise the budget.
4. **Cities dataset:** included. Generated by a script from GeoNames `cities15000` (CC BY 4.0), filtered by population to stay under 500 KB, with attribution.
5. **Prayer-time reference fixtures:** Diyanet's published table for Istanbul and the Aladhan API for Oslo, committed as JSON with their source recorded. Schaumburg is checked against an in-repo NOAA solar-position oracle instead of Aladhan (decided 2026-11-14: Aladhan's winter Asr there is ~1.7 min early vs NOAA, while adhan-js is within 90 s).
6. **PWA icons and the startup image** are generated by a script (simple geometric mark, no branding), committed as PNGs.
7. **Placeholder panels:** English from Pickthall's Qur'an translation (public domain) plus the Arabic text, with sources, clearly marked as placeholders. See Open Question 3 about Turkish.
8. **Real-device steps are yours:** Cloudflare Pages connection (needs your Cloudflare login), adding to Home Screen, and the manual iPad checklist. I prepare everything, and README documents each step.

## Resolved Questions (2026-11-14)

1. **GitHub:** approved. Create a public `adhan-app` repo on the owner's account once the scaffold is green, push `main`, enable branch protection (require CI), secret scanning and push protection.
2. **Build brief:** commit it to the repo as-is.
3. **Turkish panel text:** no answer given, so the spec default applies: EN (Pickthall) + AR placeholders. Turkish UI strings are fully translated, and the owner adds Turkish panels later.
4. **Cloudflare deploy method:** still open. It only blocks the final deploy task. Default: Git integration through the Cloudflare dashboard (the brief's preferred path), connected by the owner.
