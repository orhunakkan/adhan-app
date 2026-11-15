# Ezan Saati — azan clock for an always-on iPad

An offline-first web app (PWA) that turns a dedicated iPad into an azan clock. It calculates prayer times on the device, plays the azan at each prayer time, shows a large clock with today's times, and rotates reflection panels and your photos as a screensaver. After the first load it works without Wi-Fi.

Built for an **iPad Air 2 / iPad mini 4 on iPadOS 15.8** (Safari 15.8, 2 GB RAM) that stays plugged in, in Guided Access, with the app always open. It is a static site (Cloudflare Pages free plan); there is no server.

- Specification: [`SPEC.md`](SPEC.md) · detailed brief: [`adhan-app-build-plan.md`](adhan-app-build-plan.md)
- Quality bar: [`CONSTRAINTS.md`](CONSTRAINTS.md) · decisions: [`docs/adr/`](docs/adr)

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install exactly what `package-lock.json` pins (Node 22+; CI uses the current LTS) |
| `npm run dev` | Dev server; `/styleguide` shows every theme, period gradient and component |
| `npm test` | Vitest in watch mode |
| `npm run test:run` | Core (incl. pinned `TZ=UTC` and `TZ=Asia/Tokyo` runs) and DOM tests once |
| `npm run test:coverage` | The same with coverage thresholds (core/design ≥ 95 %, ui ≥ 85 %, overall ≥ 90 %) |
| `npm run test:ui` | Vitest UI |
| `npm run build` | Production build to `dist/` (with the service worker) |
| `npm run test:build` | Checks on `dist/`: Safari 15 syntax/CSS, budgets, manifest, precache, headers, repo hygiene |
| `npm run bench` | Benchmarks (local only) |
| `npm run lint` · `npm run typecheck` | ESLint + Stylelint + Prettier · TypeScript |
| `npm run ci` | Everything CI runs, in order |

Testing is **Vitest only**: no Playwright or other browser automation (see [ADR-0001](docs/adr/0001-vitest-only-ports-and-adapters.md)). Real-device behaviour is covered by the manual checklist below.

### Benchmark baseline (desktop Node, 2026-11-14)

| Benchmark | Result | Budget |
|---|---|---|
| A full year of prayer times | 1.48 ms | < 50 ms |
| `getDuePrayer` (runs every second) | 0.11 µs | < 50 µs |
| One clock + card + timeline render | 36 µs | — (the A8 is ~10–20× slower; a tick has 1000 ms) |

## Azan audio (and the rights note)

This repository is **public**, so it ships **no azan recordings** — only the generated 0.5 s `public/audio/silence.m4a`. `public/audio/*` is git-ignored (except that file), and a build test fails if any other audio is ever committed.

Good sources: albums you bought (personal use), recordings made at your mosque with permission. Two ways to get them onto the iPad:

1. **Upload on the iPad (default):** Settings → Azan → *Dosya yükle* per prayer. Files are stored on that iPad only (IndexedDB).
2. **Bundle them in a local build:** normalise each file and put it in `public/audio/`, then deploy that build by direct upload (see Deploy). Names the app looks for: `saba-sabah` (Fajr, with *es-salâtü hayrun mine'n-nevm*), `saba`, `ussak`, `rast`, `segah`, `hicaz`, `huseyni`, `dua`. Default mapping: Fajr → saba-sabah, Dhuhr → uşşak, Asr → rast, Maghrib → segâh, Isha → hicaz.

```sh
scripts/normalize-audio.sh input.mp3 public/audio/ussak.m4a   # trim silence, -16 LUFS, AAC 128k
scripts/normalize-audio.sh --silence                           # regenerate public/audio/silence.m4a
```

If no file can play for a prayer, a soft chime plays instead and Settings shows a warning under that prayer.

## Deploy (Cloudflare Pages, free plan)

Use **one** method per project; don't mix them.

- **Git integration (recommended):** Cloudflare dashboard → Workers & Pages → Create → Pages → connect this GitHub repo. Build command `npm run build`, output `dist`, production branch `main`, Node LTS. Turn off or limit preview builds (500 builds/month on the free plan). No secrets are needed.
- **Direct upload (for a build that includes your own audio):** `npm run build && npx wrangler pages deploy dist` (run `npx wrangler login` once).

`public/_headers` sets long caching for hashed assets and fonts, `no-cache` for the HTML, service worker and manifest, and a strict Content-Security-Policy.

## iPad kiosk setup (required)

1. Open the site in **Safari** → Share → **Add to Home Screen** → open it from the Home Screen icon.
2. **Settings → Display & Brightness → Auto-Lock → Never.** iPadOS 15 has no Wake Lock API; this is what keeps the screen on.
3. **Settings → General → Software Update → Automatic Updates → Off.** An overnight update reboots the iPad and loses the audio unlock. Install updates by hand, then tap Start again.
4. **Settings → Accessibility → Guided Access → On** with a passcode, and set **Display Auto-Lock → Never** there too (Guided Access has its own auto-lock). Triple-click to start Guided Access in the app.
5. Set the volume with the **hardware buttons** (iOS ignores app volume), tap **Start**, then use **Test** for each prayer in Settings → Azan.
6. In the app, open Settings (press and hold the **top-right corner (top-left in Arabic) for 3 seconds**), set your location (Location → *Konumumu kullan*, a city, or manual), the calculation method and any minute offsets to match your mosque. Optionally set a PIN. Your real location is entered on the iPad only, never committed.
7. **Battery:** this iPad has no charge limit. An old battery kept at 100 % can swell: consider a smart plug that cycles charging, and check now and then for a lifting screen.
8. The Air 2 / mini 4 have LCD screens, so burn-in is a small risk; pixel shift and night dim stay on anyway.
9. Web Inspector (memory, fps) needs a Mac with Safari over USB and Settings → Safari → Advanced → Web Inspector. Without a Mac, use the **reload count** in Settings → About → *Tanılama* as the leak signal.

If the azan ever cannot play (after a reboot, or iOS revoked audio), the screen shows a large pulsing **"Tap to enable azan"** in Turkish, English and Arabic. One tap fixes it.

## Manual test checklist on the iPad (replaces end-to-end tests)

- [ ] The Start tap unlocks audio; **Test** plays for every prayer.
- [ ] 24-hour soak: all 5 azans fire on time; the reload count in *Tanılama* does not increase.
- [ ] Wi-Fi off for a full day: azans still fire; fonts and panels render.
- [ ] Reboot the iPad: the Start overlay appears; one tap and the next azan works.
- [ ] Trigger Siri during an azan: the Resume button appears and works.
- [ ] Photo slideshow for 24 hours: memory stable (Web Inspector) or reload count unchanged.
- [ ] The screen stays on for 24 hours inside Guided Access (both Auto-Lock settings at Never).
- [ ] Deploy an update: the toast appears, *Apply* is refused within 5 minutes of a prayer, and works otherwise.
- [ ] Animations look smooth; turn **Glass effect** on, check it, and leave it off if it stutters.
- [ ] Review `/styleguide` (dev build) and the live screens in every theme, both orientations and Arabic.
- [ ] The clock is readable from across the room, by day and at night.
- [ ] Compare the times with your mosque's timetable for a week; fix differences with per-prayer offsets. (For İstanbul, Asr may differ from Diyanet by up to 2 minutes — an Asr offset fixes it.)

## How it works

- **Prayer times:** `adhan-js` per calendar date at your location, every method, both madhabs, three high-latitude rules, ±30 min offsets; all formatting in your location's time zone.
- **Scheduler:** a 1-second tick and a pure fire rule — an azan plays when 0–120 s past its time, at most once per prayer and date ([ADR-0002](docs/adr/0002-scheduler-tick-and-fired-keys.md)).
- **Audio:** one audio element unlocked by your tap and reused for every azan; health check 3 minutes before each prayer ([ADR-0003](docs/adr/0003-single-audio-element.md), [ADR-0004](docs/adr/0004-no-wake-lock-no-reloads.md)).
- **Screensaver:** two intervals of clock, then a panel or photo; the full clock stays around prayer times ([ADR-0006](docs/adr/0006-screensaver-rhythm.md)). The shipped panels are **placeholders** (Qur'an with Pickthall's 1930 public-domain translation) — review and replace them in `public/panels/panels.json`.

## License and notices

MIT for the project's code ([`LICENSE`](LICENSE)). Fonts are SIL OFL 1.1, the city list is CC BY 4.0 (GeoNames); see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Contributing

Run `npm run test:run` and `npm run test:build` (after `npm run build`) before opening a pull request; CI runs `npm run ci` plus a diff-scoped floor guard (`scripts/floor-guard.mjs`) that rejects new lint/coverage suppressions, skipped tests and removed assertions. Every bug fix needs a regression test. Dependency updates must pass the Safari 15 build checks — a dependency update is the most likely way something stops working on the old iPad.

This project was built with the [agent-skills](https://github.com/addyosmani/agent-skills) lifecycle (`/spec` → `/plan` → `/build` → `/review` → `/ship`); see [`CLAUDE.md`](CLAUDE.md) and [`tasks/`](tasks).
