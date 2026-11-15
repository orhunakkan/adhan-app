# Constraints

Last reviewed: 2026-11-14 (initial version, numbers taken from the approved SPEC.md / build brief §13)

This is the project's quality bar. Agents read it before finishing any task and never weaken it to make a change pass. Tightening a number is fine. Loosening one needs the owner's explicit approval in its own commit, with the reason.

## Floor (always enforced)

- No new suppression comments: `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, `istanbul ignore`, `v8 ignore`, `c8 ignore`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`, `TODO` in place of an implementation
- No skipped or deleted tests, and no assertions removed from tests, without a reason in the commit message
- No secrets, `.env*` files, real home coordinates, PINs, family photos or copyrighted azan audio in the repo
- No Playwright, Cypress, WebdriverIO, Puppeteer, Vitest Browser Mode or other browser automation (owner's testing decision)
- This file does not get weakened to make a change pass

Checked by: `node scripts/floor-guard.mjs --base origin/main` (diff-scoped, on every pull request in CI), plus the hygiene build test.

## Enforced with numbers

| Dimension | Rule | Why this number | Checked by | Runs at |
|---|---|---|---|---|
| Types | Zero type errors, TS `lib` capped at ES2021 + selected ES2022 | Newer built-ins crash Safari 15 at runtime | `npm run typecheck` | every edit, CI |
| Lint | Zero errors (incl. side-effect and lookbehind bans) | Ports/adapters boundary is what makes Vitest a substitute for E2E | `npm run lint` | every edit, CI |
| Safari 15 web APIs and CSS | Zero `compat/compat` and `plugin/no-unsupported-browser-features` errors against `iOS >= 15.6` | Target device is frozen on iPadOS 15.8 | `npm run lint` (external: caniuse / MDN compat data) | every edit, CI |
| Coverage: core + design | ≥ 95% lines, branches, functions, statements for `src/core/**`, `src/design/**` | Pure logic decides whether an azan fires; it is cheap to cover fully | `npm run test:coverage` | task end, CI |
| Coverage: ui | ≥ 85% for `src/ui/**` | DOM code has more defensive branches; 85% forces tests on every view | `npm run test:coverage` | task end, CI |
| Coverage: overall | ≥ 90% (excluding `main.ts` and type-only files) | No browser E2E exists, so unit + integration coverage carries the load | `npm run test:coverage` | task end, CI |
| Safari 15 output | Zero static blocks, regex lookbehind, `@container`, `color-mix(`, nested CSS in `dist/` | Catches dependency and bundler output the linters can't see | `npm run test:build` | CI |
| JS budget | App JS < 150 KB gzipped | A8 CPU parse/compile cost; fast cold start after reboot | `npm run test:build` | CI |
| Font budget | ≤ 400 KB total | Precached offline; keeps the SW install small | `npm run test:build` | CI |
| Audio budget | ≤ 30 MB total bundled audio | Precache size on a 16/32 GB iPad | `npm run test:build` | CI |
| Cloudflare limits | No file > 25 MiB, < 20,000 files | Cloudflare Pages free-plan hard limits | `npm run test:build` | CI |
| Dependencies | No known vulnerability at high or above | Below that is mostly dev-tool noise | `npm audit --audit-level=high` (external: GitHub advisory DB) | CI |
| Secrets | No secrets pushed | Public repository | GitHub secret scanning + push protection (external) | every push |

## Measured, not yet enforced

| Metric | Today | Direction |
|---|---|---|
| Benchmarks (year of prayer times, `getDuePrayer`, clock render) | recorded in README after task 35 | must not regress noticeably; informational, not in CI (brief §13.9) |

## Commands

- `npm run check:fast`: typecheck + lint (edit loop, seconds)
- `npm run check:task`: check:fast + core/dom tests with coverage (task end)
- `npm run ci`: lint → typecheck → test:coverage → build → test:build (checkpoints, CI)
- CI additionally runs `npm audit --audit-level=high` and, on pull requests, the floor guard

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|---|---|---|---|---|---|
| (none) | | | | | |
