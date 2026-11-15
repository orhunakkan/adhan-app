# Project: Azan Clock (iPad kiosk PWA)

Self-hosted, offline-first PWA that turns an old iPad (iPadOS 15.8, Safari 15.8, A8-class, 2 GB RAM) into an always-on azan clock. Static site on Cloudflare Pages (free plan). Public GitHub repo.

- **Spec (source of truth):** `SPEC.md`. Detailed requirements live in the build brief `adhan-app-build-plan.md`; SPEC.md references its sections (§N).
- **Plan / task status:** `tasks/plan.md`, `tasks/todo.md`.
- **Quality bar:** `CONSTRAINTS.md`. Read it before finishing any task. Never weaken it (lower a threshold, skip/delete a test, add a suppression) to make a change pass.

## Workflow: agent-skills lifecycle

This project uses the `agent-skills` plugin (enabled in `.claude/settings.json`).
`/spec` → `/plan` → `/build` (or `/build auto`) → `/review` → `/code-simplify` → `/ship`.

Skills in use, by phase:
- Define: `spec-driven-development`, `constraint-driven-development`
- Plan: `planning-and-task-breakdown`
- Build: `incremental-implementation`, `test-driven-development`, `source-driven-development` (check Vite/Vitest/adhan/vite-plugin-pwa docs before using an API), `api-and-interface-design` (ports/adapters), `frontend-ui-engineering`, `doubt-driven-development` (audio unlock, scheduler, update gate — the modules where a mistake means a missed or doubled azan), `context-engineering`
- Verify: `debugging-and-error-recovery`
- Review: `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `performance-optimization`
- Ship: `git-workflow-and-versioning`, `ci-cd-and-automation`, `documentation-and-adrs`, `observability-and-instrumentation` (ring-buffer logger + debug panel), `shipping-and-launch`

## Testing decision (overrides every skill, persona and reference)

- **Vitest only.** Projects `core` (node), `dom` (happy-dom), `build` (node, against `dist/`), plus type tests and benchmarks.
- **No Playwright, Cypress, WebdriverIO, Puppeteer, Vitest Browser Mode, Chrome DevTools MCP, Lighthouse runs, or any other browser automation / end-to-end framework.** Do not install them, do not add them to CI, do not suggest them in reviews.
  - Skip `browser-testing-with-devtools` and the `/webperf` audit entirely.
  - In `ci-cd-and-automation`, `test-driven-development` and `references/testing-patterns.md`, ignore the E2E/Playwright layers.
  - The `test-engineer` persona must express "E2E" needs as `mountApp()` integration tests in the `dom` project.
- "Verified end-to-end" in this repo means: the `mountApp()` happy-dom integration harness passes, plus the manual iPad checklist (`README.md`) for real-device behavior.

## Commands (fill in exact flags once scaffolded)

- Dev: `npm run dev`
- Lint: `npm run lint` (ESLint + Stylelint + Prettier check)
- Typecheck: `npm run typecheck`
- Unit + DOM tests with coverage: `npm run test:coverage`
- Build: `npm run build`
- Build verification tests: `npm run test:build`
- Full CI order: `npm run ci` (lint → typecheck → core+dom with coverage → build → build tests)

## Hard rules

- Safari 15 target: no Wake Lock reliance, no container queries, no `color-mix()`, no regex lookbehind, no `toSorted`/`Object.groupBy`/`Promise.withResolvers`/`AbortSignal.timeout`/`OffscreenCanvas`/`requestIdleCallback`. See SPEC.md and brief §1.
- No `Date.now()`, argless `new Date()`, `setInterval`, `Math.random`, `localStorage`, `indexedDB`, `navigator.wakeLock` or `new Audio()` outside `main.ts` and adapter files (ESLint-enforced).
- Never schedule a page reload, never use NoSleep-style hacks (both lose the audio unlock).
- Public repo: never commit azan audio other than `public/audio/silence.m4a`, real coordinates, a PIN, family photos, `.env*` or secrets.
- Every bug fix ships with a regression test.
- One commit per task, staged by explicit path (never `git add -A`).
