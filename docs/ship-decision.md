# Ship decision — v1.0.0 (Task 38)

**Decision: GO** for the first production deploy, provided the owner completes the Task 39 steps below. The first `/ship` review returned **NO-GO**. Every blocker it raised is now fixed with a regression test, and `npm run ci` is green on `phase-8-ship`.

## How it was reviewed

- Five-axis review (`code-review-and-quality`) of the whole app, then the `/ship` fan-out: code reviewer, security auditor, test engineer. There were no E2E proposals; see [ADR-0001](adr/0001-vitest-only-ports-and-adapters.md).
- Three cycles of doubt-driven adversarial review on the audio unlock, the scheduler and the update gate. Every Critical finding was fixed.
- A behaviour-preserving simplification pass (`code-simplification`).

## Blockers from the first review, and their fixes

| Area | Problem | Fix |
|---|---|---|
| Photos and uploads | Unbounded uploads; full-size images in the settings grid; a missing photo was polled every second | Size, type and count limits with clear messages; 320 px thumbnails; bad photos skipped; URLs revoked (`3fe4543`) |
| Location | Blank manual coordinates were accepted; the city list was parsed on every open | Rejected; the list loads and folds once (`1103188`) |
| Service worker | Precached audio failed Range requests (Safari's `<audio>` sends them); updates were checked only on reload, and the app never reloads | Custom SW with `RangeRequestsPlugin`; an update check every new day (`f548c17`) |
| Settings safety | There was no way to set a PIN, no lockout, and Settings stayed open forever and stayed open over an azan | PIN set and remove, 5 tries then a 30 s lockout, 2 min idle close, closes when an azan starts (`575011c`) |
| Accessibility | The Settings button name stayed Turkish; the progress bar had no name; Settings and the PIN pad didn't trap focus | Localized names, a focus trap, stacked inert layers, and a sweep test in Turkish and Arabic (`21c03bb`) |
| Contrast | Past timeline chips fell to 1.9–3.4:1 | ≥ 4.5:1 in every theme, with a test (`21c03bb`) |
| Storage | One invalid value reset all settings, including the location and PIN; a closed IndexedDB connection broke every upload and photo; zod's eval probe broke the CSP | Each section is salvaged on its own; IndexedDB reconnects once; zod runs jitless (`5262b89`) |
| Tests | Countdowns were never checked exactly; there was no DST, mid-azan-reload or reduced-motion-with-photos test; newer JS built-ins weren't checked in `dist` | All added (`3d7b0c4`) |
| Performance | Attributes were rewritten on every 1 s render | Writes now happen only on change, guarded by a test (`672873a`) |
| Docs | Bundled audio on a public site; no PIN vs Guided Access guidance; no VoiceOver or offline checks | README warnings and new checklist lines (`9aa9cf2`) |

## Accepted trade-offs

- **Deep polar night** (e.g. Utqiagvik, 71°N): adhan's polar resolution can return times days away from their date, and those prayers don't fire ([ADR-0002](adr/0002-scheduler-tick-and-fired-keys.md)). This doesn't affect the target location.
- **Two browser tabs:** they share the persisted list of fired prayers and merge it before each azan, so normally only one plays. Two tabs that both reach the same prayer in the same second can still both play it. In Guided Access the kiosk has one tab.
- **Changing the location during the day:** a prayer that already played today doesn't play again at the new location. This is the accepted cost of "never twice" (ADR-0002).
- **Blocked azan screen:** if iOS refuses playback, the azan screen stays up behind the "Tap to enable azan" overlay. It closes when the next health check succeeds, or at the safety cap: 20 minutes with audio, 3 minutes for a silent moment.
- **Screensaver rhythm:** "two intervals of clock, then a panel or photo" follows our reading of the brief ([ADR-0006](adr/0006-screensaver-rhythm.md)).
- **Panels are placeholders:** Qur'an with Pickthall's public-domain translation. The owner should review and replace them.
- **`npm audit`:** moderate advisories remain in dev-only tooling. CI fails on high.

## Residual risks, covered by the manual iPad checklist (README)

Real-device audio unlock after a reboot, a 24-hour soak (reload count stays flat), airplane mode, Siri interruptions, Guided Access screen-on, VoiceOver, and smoothness of the glass effect on the A8. None of these can be automated under the Vitest-only decision.

## Rollback plan

1. Cloudflare dashboard → Workers & Pages → the project → **Deployments** → choose the previous production deployment → **Rollback to this deployment**. It takes effect within seconds. No data is involved: settings and uploads live on the iPad.
2. The iPad picks up the rolled-back service worker at its next daily update check. To apply it at once, open Settings → About → *Apply update* (refused within 5 minutes of a prayer).
3. If the app itself is unusable on the iPad, remove the Home Screen icon and add it again from Safari. This loses the uploaded files but not the deployed audio.
4. Revert the offending commit on `main` with a PR so the next build matches the rollback.

## Owner steps (Task 39)

1. Choose the deploy method: dashboard Git integration (recommended) or direct upload with wrangler (only for a build that bundles your own audio; read the README warning first).
2. Deploy from `main`, then check that the `*.pages.dev` URL serves the `_headers` (CSP, `no-cache` on `index.html` and `sw.js`).
3. Set up the iPad by the README kiosk steps, then run the manual checklist and the 7-day acceptance run. Record the results in `tasks/todo.md`.
