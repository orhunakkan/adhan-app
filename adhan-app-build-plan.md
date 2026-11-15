# Build Brief: Azan Clock Web App (iPad Kiosk PWA)

## 1. Goal
Build a self-hosted web app (PWA) that turns a dedicated iPad into an always-on azan clock, similar to the AYiNE TV "Ezan Saati" device, but with a **modern, polished UI**. It calculates prayer times on the device, plays the azan at each prayer time, shows a clock and today's prayer times, and rotates reflection panels and personal photos as a screensaver. After the first load it must work fully offline.

### Target environment
- An older iPad on **iPadOS 15.8.x** (Safari 15.8 engine), added to the Home Screen (standalone mode). iPadOS 15 is the final version for the iPad Air 2 and iPad mini 4: A8/A8X chip, 2 GB RAM, 2048×1536 LCD. Treat that as the performance floor.
- Always plugged in, display always on (via Auto-Lock → Never, see §7b), Guided Access enabled, app always in the foreground.
- Source code in a **public GitHub repository** (see §12.1 for what that implies: licenses, no copyrighted audio, no personal data, no secrets).
- Hosted as a purely static site on the **Cloudflare Pages free plan**, over HTTPS (the free `*.pages.dev` subdomain includes a certificate). HTTPS is required for the service worker. No Pages Functions, Workers, KV or other paid or server-side features. See §12 for the free-tier limits.

### Platform constraints (iPadOS 15.8 / Safari 15.8)
These features are **not available** on the target and must not be relied on:
- Screen Wake Lock API (Safari 16.4; only reliable in Home Screen apps from iOS 18.4).
- CSS container queries (16.0), native CSS nesting (16.5), `color-mix()` (16.2).
- JS: regex lookbehind `(?<=…)` / `(?<!…)` (16.4), class static blocks (16.4), `Array.prototype.toSorted/toReversed/with` (16.0), `Object.groupBy` (17.4), `Promise.withResolvers` (17.4), new `Set` methods (17.0), `AbortSignal.timeout` (16.0), `OffscreenCanvas` (16.4), `requestIdleCallback` (never in Safari).
- `navigator.storage.estimate()` (17.0). `navigator.storage.persist()` exists (15.2+).
- Web Push (16.4). It's a non-goal anyway.

These **are** available and fine to use: ES modules, top-level await, class fields and private methods, `Array.prototype.at`, `Object.hasOwn`, `structuredClone`, `crypto.randomUUID`, `Intl.supportedValuesOf` (15.4), `:has()`, `:focus-visible`, `@layer`, `dvh`/`svh` units, `<dialog>`, `inert` (15.5), CSS logical properties, `clamp()`, `aspect-ratio`, flex `gap`, variable woff2 fonts, `-webkit-backdrop-filter`, service workers, IndexedDB with Blobs, Web Audio.

### Non-goals (do NOT build)
- Playing the azan while the iPad is locked or the app is in the background. iOS doesn't allow this for web apps, so don't attempt workarounds.
- Web push notifications.
- A native iOS app.
- A backend server or database. Everything runs client-side.
- Copying AYiNE's panels, videos, layout or branding.
- **Playwright or any other browser-automation / end-to-end test framework.** Testing is Vitest only (§13). Real-device behavior is verified with the manual iPad checklist (§15.4).

## 2. Tech stack
- **Build:** Vite + TypeScript (strict mode). Vanilla TS with small modules, no UI framework. Keep the bundle small (JS under 150 KB gzipped, excluding fonts and audio).
- **Browser target:** `browserslist: ["iOS >= 15.6"]` (the caniuse bucket for 15.6–15.8) in `package.json`, shared by every tool. Vite `build.target: ['safari15', 'ios15']` and `build.cssTarget: 'safari15'`. Use Lightning CSS as the CSS transformer and minifier (`css.transformer: 'lightningcss'`, `build.cssMinify: 'lightningcss'`) with browserslist-derived targets, so nesting is compiled away. `tsconfig` `lib: ["ES2021", "ES2022.Intl", "ES2022.Object", "ES2022.Array", "DOM", "DOM.Iterable"]`, so newer JS built-ins fail to typecheck. No `@vitejs/plugin-legacy` is needed, because Safari 15 supports ES modules.
- **Prayer times:** `adhan` (adhan-js) npm package.
- **PWA:** `vite-plugin-pwa` (Workbox) for precaching and the manifest.
- **Storage:** `localStorage` for settings and the scheduler state. IndexedDB (via `idb-keyval`) for user-uploaded azan audio and photos.
- **Styling:** plain modern CSS (custom properties, `clamp()`, media queries, logical properties, `@layer`, and nesting in source only, compiled out by Lightning CSS). **No container queries and no `color-mix()`**, because Safari 15 doesn't support them. Derived colors (soft accents, translucent surfaces) are precomputed in `tokens.ts`. No CSS framework. Design tokens live in TypeScript as the single source of truth and are emitted as CSS custom properties (see §8.3), so tests can check them.
- **Icons:** Lucide (ISC license), imported as individual inline SVGs.
- **Fonts:** self-hosted variable woff2 files (see §8.2), precached for offline use.
- **Validation:** `zod` for the settings schema, `panels.json` and the cities dataset.
- **Testing (Vitest only):**
  - `vitest` with **projects**: `core` (Node environment), `dom` (`happy-dom` environment) and `build` (Node environment, runs against `dist/` after build).
  - `@vitest/coverage-v8` with enforced thresholds.
  - `@vitest/ui` for local development.
  - `fake-indexeddb` for IndexedDB, and Vitest fake timers (`vi.useFakeTimers`, `vi.setSystemTime`) for all time-based logic.
  - Vitest's built-in type testing (`expectTypeOf`, `--typecheck`) and benchmarks (`vitest bench`).
  - Do NOT use Vitest Browser Mode, because it needs a Playwright/WebdriverIO provider.
- **Lint/format:** ESLint + Prettier + Stylelint, plus compat guards against the browserslist target: `eslint-plugin-compat` (web APIs) and `stylelint-no-unsupported-browser-features` (CSS; ignore `css-nesting`, since it's compiled out).
- **Hosting:** Cloudflare Pages. Build command `npm run build`, output folder `dist`.

## 3. Project structure
```
/src
  main.ts                 # bootstrap: creates real adapters, wires modules
  config/defaults.ts      # default settings
  config/schema.ts        # zod schemas: settings, panels, cities
  core/prayerTimes.ts     # adhan wrapper → today/tomorrow times (pure)
  core/scheduler.ts       # getDuePrayer (pure) + tick loop (injected clock)
  core/audio.ts           # unlock, single persistent audio, health checks (injected media adapter)
  core/wakeLock.ts        # Screen Wake Lock, feature-detected only (absent on iPadOS 15; injected navigator)
  core/storage.ts         # settings (localStorage) + blobs (IndexedDB), migrations
  core/hijri.ts           # Hijri date via Intl, with fallback
  core/period.ts          # current prayer period → drives theme sky colors (pure)
  core/nightDim.ts        # dim schedule logic (pure)
  core/burnIn.ts          # pixel-shift offset generator (injected RNG)
  core/updateGate.ts      # when an SW update may be applied (pure)
  core/logger.ts          # ring-buffer logger for debug panel
  core/ports.ts           # interfaces: Clock, MediaPlayer, WakeLockPort, Storage, Rng
  design/tokens.ts        # design tokens (source of truth) → CSS vars
  design/contrast.ts      # WCAG contrast helpers
  ui/startOverlay.ts      # "Tap to Start" / "Tap to resume azan"
  ui/clockView.ts         # main screen: clock, dates, next prayer, timeline
  ui/progressRing.ts      # SVG ring/arc countdown to next prayer
  ui/azanView.ts          # full-screen azan moment
  ui/panels.ts            # tefekkür panel rotation
  ui/slideshow.ts         # personal photo screensaver
  ui/settings.ts          # settings screen
  ui/toast.ts             # toast notices
  ui/debugPanel.ts        # hidden diagnostics screen
  i18n/{tr,en,ar}.json    # UI strings (Arabic = RTL)
  styles/
    base.css              # reset, typography, layout primitives
    components.css        # cards, buttons, lists, toggles, overlays
    views.css             # clock, azan, panels, settings layouts
/public
  audio/                  # bundled azan files (see §10 — rights!)
  fonts/                  # self-hosted woff2 (Latin + Arabic)
  panels/panels.json      # panel content (placeholder set)
  patterns/               # optional subtle geometric SVG patterns
  icons/                  # PWA icons, apple-touch-icon
  _headers                # Cloudflare Pages caching headers
/scripts
  normalize-audio.sh      # ffmpeg loudness normalization
/tests
  core/*.test.ts          # Node environment
  dom/*.test.ts           # happy-dom environment
  build/*.test.ts         # runs against dist/ after `npm run build`
  bench/*.bench.ts        # vitest bench
  types/*.test-d.ts       # type tests
  fixtures/               # reference prayer tables, sample settings, panels
  helpers/                # fake adapters: FakeClock, FakeMediaPlayer, FakeWakeLock, seeded RNG
vitest.config.ts          # projects + coverage thresholds
README.md                 # setup, iPad kiosk guide, deploy, rights note
```

## 4. Architecture for testability (required)
Because there are no browser end-to-end tests, the code must be structured so Vitest can cover nearly everything:
- **Pure core logic:** prayer calculation, scheduling decisions, periods, night dim, update gating and settings migration are pure functions that take inputs and return outputs, with no DOM, timers or globals.
- **Ports and adapters** (`core/ports.ts`): every side effect goes through an interface that `main.ts` wires to the real browser APIs and tests replace with fakes:
  - `Clock { now(): Date; setInterval(fn, ms): Handle; clearInterval(h) }`
  - `MediaPlayer { setSrc(url); play(): Promise<void>; pause(); on(event, fn); currentTime; duration }`
  - `WakeLockPort { request(): Promise<Sentinel>; supported: boolean }`
  - `KeyValueStore` (localStorage) and `BlobStore` (IndexedDB)
  - `Rng { next(): number }` for pixel shift and panel shuffle
- **UI modules** export `mount(root: HTMLElement, deps)` and `render(state)` functions, and receive state plus callbacks. They don't reach into globals, so they can be mounted in happy-dom and asserted on.
- **App state:** a small store (`state = { settings, times, period, nextPrayer, audioStatus, overlay, … }`) with explicit actions. Tests drive actions and check the resulting state and DOM.

## 5. Prayer time calculation (`core/prayerTimes.ts`)
- Use adhan-js `Coordinates`, `CalculationParameters` and `PrayerTimes`.
- Settings to support:
  - **Location:** one location only. Store lat, lng, display name and IANA timezone. Set it with "Use my location" (Geolocation, used once and then stored) or by entering lat/lng manually plus a timezone picker (`Intl.supportedValuesOf('timeZone')`). Optional: a bundled JSON of major world cities (name, country, lat, lng, tz) with search, under 500 KB.
  - **Calculation method:** every adhan-js method, including Turkey (Diyanet), North America (ISNA), Egyptian, Umm al-Qura, Muslim World League, Karachi, Dubai, Kuwait, Qatar, Singapore, Tehran, Moonsighting Committee.
  - **Madhab** for Asr (Shafi or Hanafi).
  - **High-latitude rule:** middle of the night, seventh of the night, twilight angle.
  - **Per-prayer minute offsets** (−30 to +30) so times can match the local mosque or Diyanet's table.
- Output today's and tomorrow's times: Fajr (İmsak), Sunrise (Güneş, shown but no azan), Dhuhr, Asr, Maghrib, Isha.
- Format every time with `Intl.DateTimeFormat` in the configured timezone. Never rely on the device timezone implicitly.
- Recalculate at local midnight, whenever settings change, and on `visibilitychange` / `pageshow`.

## 6. Azan scheduler (`core/scheduler.ts`)
- A single interval tick every 1 s through the injected `Clock`. Do NOT schedule long `setTimeout`s, because iOS throttles and drifts them.
- On each tick, call the pure `getDuePrayer(now, times, lastFired, settings)` and fire if it returns a prayer.
- **Fire rule:** fire only if `now - prayerTime` is between 0 and the `lateWindow` (default 120 s). This prevents a burst of azans after a reload or wake.
- **Idempotency:** store `lastFired = "YYYY-MM-DD:prayerName"` in the `KeyValueStore` and never fire the same key twice.
- Skip prayers the user has disabled. Sunrise never plays an azan.
- Optionally play a dua file right after the azan ends (setting).
- Optional pre-alert: a visual countdown banner N minutes before each prayer (default 10).
- Handle midnight rollover, and Isha falling after midnight at high latitudes in summer.

## 7. Audio (`core/audio.ts`) — the most critical module
- iOS blocks audio playback until the user taps, so:
  1. On launch, show the full-screen **"Tap to Start"** overlay (`ui/startOverlay.ts`).
  2. In the tap handler, create ONE persistent `HTMLAudioElement` (wrapped by the `MediaPlayer` adapter) and play a short silent clip (`/audio/silence.m4a`, 0.5 s) to unlock it.
  3. Reuse this same element for every azan by changing `src` and calling `play()`. Never create new audio elements after the unlock. The adapter must enforce this (a test checks the factory is called exactly once).
- **Health check:** 3 minutes before each prayer, play the silent clip.
  - If `play()` rejects with `NotAllowedError` (or any error), show the **"Tap to enable azan"** overlay: large, high-contrast and pulsing, so a family member notices it.
- Listen for `pause`, `error`, `stalled` and `ended`. An unexpected pause during an azan (Siri, an alarm, a call) should show a "Resume" button.
- On `pageshow` with `event.persisted`, or after any reload, assume the unlock is lost and show the start overlay again.
- Volume: iOS ignores `audio.volume`. Document that volume is set with the iPad's hardware buttons, and rely on loudness-normalized files (§10).
- Audio sources, resolved in this order: user-uploaded Blob from IndexedDB (via an object URL, revoked after use), then the bundled file in `/public/audio`.
- A per-prayer audio mapping in settings, with a separate Fajr file (it includes "es-salâtü hayrun mine'n-nevm"). Default Turkish makam mapping, editable:
  - fajr → saba, dhuhr → uşşak, asr → rast, maghrib → segah, isha → hicaz
- Visuals during the azan: see §8.5. A background video, if used, must be `muted playsinline autoplay` (allowed on iOS without a tap), with the sound coming from the unlocked audio element.

## 7b. Wake lock and kiosk behavior (`core/wakeLock.ts`)
- **On the target iPad (iPadOS 15.8) the Wake Lock API doesn't exist.** The screen is kept on by the OS settings instead: Settings → Display & Brightness → Auto-Lock → Never, **and** Settings → Accessibility → Guided Access → Display Auto-Lock → Never (Guided Access has its own auto-lock that overrides the main one while a session is running). These are required setup steps, not a fallback.
- Keep the wake lock module, but only as a progressive enhancement: if `navigator.wakeLock` exists (a future, newer iPad), call `wakeLock.request('screen')` after the Start tap and re-acquire it on `visibilitychange`. If it's missing or rejected, show a one-time hint: "Set Auto-Lock → Never (Display & Brightness, and Guided Access)".
- Don't use the NoSleep-style hacks (looping hidden video, or a page reload trick). They're unreliable on iOS 15, waste power, and the reload variant loses the audio unlock.
- Never do a scheduled full-page reload, because that loses the audio unlock.

## 8. Visual design — modern UI (required)

### 8.1 Design direction
- **Overall feel:** calm, premium and minimal, like a high-end smart display or a modern iPadOS widget, not a dated "religious software" look. Generous whitespace, strong type hierarchy, soft depth, and smooth, restrained motion.
- **Readable from across the room:** the clock and next-prayer info must be legible from about 4 m. Everything else is secondary and quieter.
- **Dark-first:** the default theme is dark (kinder to burn-in, better at night). Two more themes are selectable.
- **Living background:** the background is a slow, subtle gradient whose colors follow the current prayer period (see §8.3), so the screen feels alive without being distracting.
- **Islamic geometric accent (optional, subtle):** a faint geometric line pattern (SVG at 3–6% opacity) behind the content. It should be tasteful, never busy.
- No skeuomorphism, stock-photo mosques, clip-art, heavy borders, drop-shadow-heavy cards or gaudy gold gradients.

### 8.2 Typography
- **Latin/Turkish:** Inter (variable, self-hosted woff2) with `font-feature-settings: "tnum", "cv11"`, so the clock and times use tabular numerals and digits don't jump.
- **Arabic:** IBM Plex Sans Arabic or Noto Kufi Arabic for the UI, and Noto Naskh Arabic for verse text in panels.
- Subset fonts to the needed glyphs (Latin Extended for Turkish ş/ğ/ı/İ, plus Arabic) and preload them.
- **Type scale** (fluid, via `clamp()` against the viewport):
  - Clock: `clamp(6rem, 16vw, 14rem)`, weight 200–300, letter-spacing −0.03em.
  - Next prayer name: `clamp(2rem, 4vw, 3.5rem)`, weight 600.
  - Countdown: `clamp(1.5rem, 3vw, 2.5rem)`, tabular, weight 500.
  - Times list: `clamp(1.25rem, 2.2vw, 2rem)`.
  - Secondary text (dates, location): `clamp(1rem, 1.6vw, 1.4rem)`, about 60% opacity.

### 8.3 Color and themes (`design/tokens.ts`)
- Tokens are defined in TypeScript (`themes`, `periodGradients`, `space`, `radius`, `motion`, `type`) and written to `:root` / `[data-theme]` as CSS custom properties at startup: `--bg-1`, `--bg-2`, `--surface`, `--surface-border`, `--text-1`, `--text-2`, `--accent`, `--accent-soft`, `--danger`, `--radius-*`, `--space-*`, `--shadow-*`, `--ease-*`, `--dur-*`.
- **Themes:**
  - **Midnight** (default): near-black navy base (#0B1020 range), soft white text, teal or emerald accent.
  - **Emerald:** deep green base, cream text, soft gold accent (muted, not shiny).
  - **Sand:** warm light theme for daytime-only rooms. It is automatically overridden by night dim at night.
- **Period-driven sky gradient** (`core/period.ts`): each period sets two gradient stops that blend into the theme base:
  - Fajr → deep indigo to violet
  - Sunrise to Dhuhr → soft dawn blue
  - Dhuhr → clear sky blue
  - Asr → warm amber
  - Maghrib → rose / orange dusk
  - Isha → deep night blue
- Crossfade between periods over about 60 s. Keep the gradients low-saturation so text contrast holds.
- **Contrast:** primary text must meet WCAG AA (4.5:1) against every theme × period gradient stop. This is enforced by Vitest (§13).

### 8.4 Main screen layout (`ui/clockView.ts`)
- **Landscape (primary):** two zones.
  - Left (about 60%): the large clock, with the Gregorian date and Hijri date beneath it, and the location shown small.
  - Right (about 40%): a "Next prayer" hero card with the prayer name, its time, and an **SVG progress ring** (`ui/progressRing.ts`) showing time elapsed in the current period plus the live countdown inside the ring.
  - Bottom strip: a **horizontal timeline** of the six prayer times as pill chips, each with a small Lucide icon (sunrise, sun, cloud-sun, sunset, moon, stars). Past prayers are dimmed, the current one is highlighted with the accent and a soft glow, and the next is outlined.
- **Portrait:** the same pieces stacked: clock → next-prayer card → vertical times list.
- Use media queries (`orientation`, `min-width`/`max-width`) for layout changes. Container queries aren't available on Safari 15.
- **Cards:** semi-transparent surfaces (`--surface` at about 8–12% white, precomputed as `rgba()` in tokens), a 1 px hairline border, and radius 24–32 px. **Blur is off by default** because the A8-class GPU is weak. It's a Display setting ("Glass effect") that applies `-webkit-backdrop-filter: blur(20px)` (with the unprefixed version too) to at most 2 large elements. The solid surface is the primary design and must look finished on its own.
- The pre-alert banner (N minutes before a prayer) slides down from the top as a pill: "Akşam in 10 min".

### 8.5 Azan moment (`ui/azanView.ts`)
- A full-screen takeover with a smooth 600 ms fade and scale-in.
- Prayer name in large display type (TR + Arabic), the time below it, and a slow breathing glow or ring animation in the accent color.
- A thin progress bar for the azan audio position, plus a small "Stop" button (and "Resume" if it was interrupted).
- When the azan ends, fade back to the clock view. If a dua is enabled, show its text while it plays.

### 8.6 Panels and photos styling
- **Panels:** centered, editorial typography with large quote-style text, generous line height (1.5–1.7), at most about 60 characters per line, and the source in small caps underneath. Arabic text sits above the translation when both exist. Crossfade with a slight blur-in.
- **Photos:** full-bleed with a slow Ken Burns pan/zoom (scale 1.0 → 1.06 over the interval) and a dark gradient scrim at the bottom so the clock overlay stays readable.
- During the screensaver, the clock and next prayer stay visible as a compact glass pill in a corner. Its position rotates every 10 minutes to help with burn-in.

### 8.7 Start and status overlays
- "Tap to Start": a centered large circular button with an accent ring pulse and the app name, on a blurred backdrop of the clock.
- "Tap to enable azan" (the failed health check): the same component in the `--danger` accent, pulsing more urgently, with the text in TR/EN/AR.
- Toast system (`ui/toast.ts`) for minor notices (update available, settings saved), as a bottom-center pill that auto-dismisses.

### 8.8 Settings UI (`ui/settings.ts`)
- Styled like iPadOS Settings but modern: a left sidebar of sections and a right content pane in landscape; a drill-down list in portrait.
- Grouped inset lists, custom toggles and segmented controls, steppers for offsets, and touch targets of at least 48 px.
- Live preview: changing the theme, method or offsets updates the clock and times behind a translucent sheet right away.
- "Test azan" buttons appear next to each prayer's audio picker.

### 8.9 Motion
- Use tokens: `--ease-out: cubic-bezier(.2,.8,.2,1)`, durations of 150 / 300 / 600 ms.
- Animate only `opacity` and `transform` (GPU-friendly). Nothing should animate continuously except the subtle ring, glow and background drift, and those should be slow (at least 20 s cycles). Never animate gradients, `filter` or `box-shadow`. The period crossfade is two stacked gradient layers with an opacity transition. On the A8-class target, at most 2 continuous animations should run at once.
- Respect `prefers-reduced-motion`: disable Ken Burns, breathing and drift, and use plain fades.
- Seconds on the clock are optional (a setting). If shown, update the text only, with no per-second animation.

### 8.10 Design QA
- Build a `/styleguide` route (dev only) that renders every component, theme and period gradient side by side. This is the **manual visual review surface** that replaces screenshot testing. Review it on the real iPad at each UI milestone.
- Vitest covers structure, tokens, contrast and state-driven classes (§13). It does not cover pixels.

## 9. Other UI behavior
### Panels (`ui/panels.ts`)
- Load `panels/panels.json` (validated with zod): `[{ id, lang: "tr"|"en"|"ar", text, translation?, source?, image? }]`.
- Rotate every N seconds (setting, default 60).
- Ship 10–20 placeholder panels of public-domain Quran verse translations and hadith with sources, clearly marked as placeholders. Don't scrape or copy AYiNE content.

### Photo screensaver (`ui/slideshow.ts`)
- The user uploads photos in settings; store them in IndexedDB (resize to at most 2048 px on the long edge, which matches the 2048×1536 screen, and re-encode to JPEG at about 0.85 before storing). Resize with a regular `<canvas>` and `canvas.toBlob()`. `OffscreenCanvas` isn't available. Release the canvas afterwards (`width = height = 0`), because iOS has a tight total canvas memory limit.
- Keep at most 2 images in the DOM (current and next), and revoke object URLs immediately. Memory leaks are the main cause of iOS reloading the page, and with only 2 GB RAM the margin is small.
- Mode setting: panels only, photos only, or alternate.

### Burn-in and night mode (`core/burnIn.ts`, `core/nightDim.ts`)
- Pixel shift: move the main layout by a random ±8 px every 10 minutes (injected RNG).
- Night dim: a black overlay at configurable opacity (default 70%) from Isha + X minutes until Fajr − Y minutes. Automatically lift it 1 minute before an azan and during it.
- Avoid pure-white static elements. The dark theme is the default.

### Settings content
- Opened with a long-press (3 s) on a corner, protected by an optional 4-digit PIN.
- Sections: Location, Calculation (method, madhab, high latitude, offsets), Azan (enable per prayer, file per prayer, upload custom file, test-play, dua after azan, late window), Display (theme, language TR/EN/AR, 12/24 h, show seconds, panel interval, screensaver mode, geometric pattern on/off, night dim schedule and opacity), Photos (upload/delete), About (version, storage used, "Reset all settings").
- Every change applies immediately, persists, and is validated with the zod schema. Include a `settingsVersion` plus migrations.

### i18n
- Turkish, English and Arabic. Set `dir="rtl"` for Arabic and use CSS logical properties (`margin-inline`, `inset-inline`) throughout so RTL mirrors correctly.
- Prayer names per language, e.g. TR: İmsak, Güneş, Öğle, İkindi, Akşam, Yatsı.

## 10. Audio content pipeline and rights
- `scripts/normalize-audio.sh`: use ffmpeg to normalize every source file to the same loudness and encode AAC:
  `ffmpeg -i in.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 128k out.m4a`
- Also trim leading and trailing silence, and generate `silence.m4a` (0.5 s).
- The size budget for all bundled audio is about 30 MB or less (enforced by a build test).
- **Rights:** the repo is public, so it ships ONLY `silence.m4a` (generated by the script, so it's free of rights issues) plus a README section explaining how to add files. `.gitignore` **must** contain `public/audio/*` with an exception for `!public/audio/silence.m4a`, and the build test in §13.7 enforces it. Expected sources: purchased azan albums (personal use), recordings made at the local mosque with permission, or user uploads through settings, which stay on that iPad only.
- If no azan file is available for a prayer, fall back to a generated soft chime (Web Audio oscillator) and show a warning in settings.

## 11. Offline and PWA
- Manifest: `display: "standalone"`, landscape-friendly, theme color matching Midnight, icons including `apple-touch-icon` (180×180). iOS 15 mostly ignores manifest icons and name, so the Apple meta tags are what actually count: `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, and the `black-translucent` status-bar style. Optionally add `apple-touch-startup-image` for the iPad resolution to avoid a white launch flash. Handle `env(safe-area-inset-*)` padding.
- Precache the app shell, fonts, `panels.json`, panel images, patterns and bundled audio.
- Call `navigator.storage.persist()` after the Start tap (feature-detected). `navigator.storage.estimate()` doesn't exist on iOS 15, so "storage used" in About and the debug panel is computed by summing the Blob sizes in IndexedDB, plus the known precache size from the build.
- Update strategy: when a new service worker is waiting, show a toast: "Update available — tap to apply". Apply it only on a user tap, and the pure `core/updateGate.ts` blocks it within 5 minutes of a prayer, because the reload would lose the audio unlock.
- All prayer calculation is offline. Geolocation is only needed once.

## 12. Deployment
- Cloudflare Pages (**free plan**) connected to the Git repo. Build `npm run build`, output `dist`, Node LTS. Static assets only: no `functions/` directory.
- Free-tier limits to stay within: 500 builds per month and 1 concurrent build (don't trigger builds on every push to every branch; limit preview builds or turn them off), at most 20,000 files per deployment, and **at most 25 MiB per file** (each normalized azan `.m4a` is well under this; the build test in §13.7 should also assert it). Bandwidth and requests for static assets are unlimited on the free plan.
- Copyrighted azan files aren't in Git (§10), so a Git-connected build can't include them. Either upload them through the settings screen on the iPad (stored in IndexedDB, the default path), or deploy a local build that includes them with `npx wrangler pages deploy dist` (direct upload, also free). Use one deployment method per project and don't mix them.
- `_headers` file (supported on the free plan): long cache for hashed assets and fonts, `no-cache` for `index.html` and `sw.js`.
- CI order: `lint` → `typecheck` → `vitest run --project core --project dom --coverage` → `build` → `vitest run --project build`.
- Optional custom subdomain.

### 12.1 Public GitHub repository
- **CI:** GitHub Actions (free and unlimited for public repos) runs the full CI order above on every pull request and on every push to `main`, with Node LTS and `npm ci`. Branch protection on `main` requires CI to pass. Cloudflare Pages only builds and deploys. To save the 500 builds a month, build production from `main` only and turn off or limit preview builds. Cloudflare doesn't build pull requests from forks.
- **No secrets in the repo:** the app needs none. The Cloudflare Git integration is authorized through the Cloudflare GitHub app, not with tokens. If deploys ever move to `wrangler` in Actions, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` go in GitHub Actions secrets. Turn on GitHub secret scanning and push protection.
- **No personal data:** don't commit the exact home coordinates, a PIN, real family photos or a populated settings export. `config/defaults.ts` uses a neutral default location (e.g. Mecca, or no location with the setup prompt shown on first run), and the real location is entered on the iPad only. City-level test fixtures (Schaumburg, Istanbul, Oslo) are fine. Keep this plan file in mind too: if it's committed, it's public.
- **Licenses:**
  - Add an MIT `LICENSE` for the project's own code.
  - Ship the font licenses (SIL OFL 1.1 for Inter, IBM Plex Sans Arabic and Noto) next to the files in `public/fonts/`.
  - Add a `THIRD_PARTY_NOTICES.md` covering adhan-js (MIT), Lucide (ISC), zod, idb-keyval, Workbox and the cities dataset (use a dataset with an open license, e.g. GeoNames CC BY 4.0, with attribution).
  - Panel texts: use public-domain translations only, with sources (already required in §9).
- **Dependencies:** commit `package-lock.json`. Dependabot (or Renovate) is optional, but every update must pass the Safari 15 compat build tests (§13.7) before it's merged, because a dependency update is the most likely way something stops working on the old iPad.
- **`.gitignore`:** `node_modules/`, `dist/`, `coverage/`, `.wrangler/`, `.env*`, and `public/audio/*` except `silence.m4a`.

## 13. Testing — Vitest only (use it to its full extent)
No Playwright, no browser automation, no Vitest Browser Mode. End-to-end behavior on the real iPad is covered by the manual checklist (§15.4). Everything else is covered by Vitest as follows.

### 13.1 Configuration (`vitest.config.ts`)
- **Projects:**
  - `core`: `environment: 'node'`, `tests/core/**`
  - `dom`: `environment: 'happy-dom'`, `tests/dom/**`, setup file that installs `fake-indexeddb/auto`, stubs `HTMLMediaElement.prototype.play/pause`, `URL.createObjectURL/revokeObjectURL`, `navigator.wakeLock` and `matchMedia`.
  - `build`: `environment: 'node'`, `tests/build/**`, runs only after `npm run build`.
- **Coverage** (`@vitest/coverage-v8`) with thresholds that fail CI:
  - `src/core/**` and `src/design/**`: lines, branches, functions and statements ≥ 95%
  - `src/ui/**`: ≥ 85%
  - overall: ≥ 90%
  - Exclude `main.ts` (wiring only) and type-only files.
- `typecheck: { enabled: true }` for `*.test-d.ts`.
- Use `test.each` / `describe.each` for table-driven tests, `test.concurrent` where it's safe, and `vi.useFakeTimers({ toFake: ['setInterval','clearInterval','setTimeout','clearTimeout','Date'] })` plus `vi.setSystemTime()` for all time travel.
- Snapshot files live next to tests. Prefer `toMatchInlineSnapshot` for small outputs and `toMatchFileSnapshot` for rendered HTML of views.
- Scripts: `test` (watch), `test:run`, `test:coverage`, `test:ui` (`@vitest/ui`), `test:build`, `bench`.

### 13.2 Test helpers (`tests/helpers/`)
- `FakeClock`: built on Vitest fake timers; `advanceTo(date)` and `advanceBy(ms)`.
- `FakeMediaPlayer`: records `setSrc` / `play` / `pause` calls; can be told to reject the next `play()` with `NotAllowedError`, or to emit `pause`/`ended`/`error`.
- `FakeWakeLock`: supported or unsupported, resolve or reject, and emits `release`.
- `MemoryStore` (KeyValueStore) and `fake-indexeddb` (BlobStore).
- `seededRng(seed)` for deterministic pixel shift and shuffle.
- `mountApp(overrides)`: mounts the full app into a happy-dom document with all fakes injected, and returns handles for driving and asserting. This is the "integration harness" that stands in for E2E.

### 13.3 Core logic tests (`tests/core`, Node)
- **Prayer times:** `describe.each` over fixtures comparing calculated times against reference tables with a ±2 min tolerance:
  - Schaumburg, IL (42.0334, −88.0834, America/Chicago): North America and Turkey methods, one full month in winter and one in summer.
  - Istanbul: Turkey method vs Diyanet's published table.
  - A high-latitude city (e.g. Oslo or Helsinki in June) with each high-latitude rule, checking that no times are NaN or missing.
  - Each method × madhab produces valid ascending times (Fajr < Sunrise < Dhuhr < Asr < Maghrib < Isha, with Isha possibly after midnight).
  - Offsets shift times exactly by the configured minutes.
- **Timezone and DST:** spring-forward and fall-back days in America/Chicago and Europe/Istanbul (which has no DST), plus formatting in the configured timezone while the process runs in a different `TZ`. Run this suite under `TZ=UTC` and `TZ=Asia/Tokyo` with `vi.stubEnv` plus a separate project run, so it never depends on the machine's timezone.
- **Scheduler (`getDuePrayer`), table-driven:** fires exactly at time T; doesn't fire at T − 1 s; fires at T + 119 s; doesn't fire at T + 121 s (late window); never fires the same key twice; skips disabled prayers; never fires for Sunrise; handles midnight rollover and Isha after midnight; behaves correctly when the date changes during a tick.
- **Scheduler loop with FakeClock:** simulate a full 48 hours with `advanceBy` and check that exactly 10 azans fire with correct sources and order. Simulate a "reload" mid-day (a new scheduler instance with the persisted `lastFired`) and check there are no duplicates or bursts.
- **Period (`period.ts`):** correct period at and around every boundary.
- **Night dim (`nightDim.ts`):** active and inactive windows across midnight; lifted 1 minute before and during the azan; custom X/Y values.
- **Burn-in:** with a seeded RNG, offsets stay within ±8 px and change only every 10 minutes.
- **Update gate:** blocked within 5 minutes before a prayer and during an azan, allowed otherwise.
- **Hijri:** returns a formatted Hijri date when `islamic-umalqura` is supported. Stub `Intl.DateTimeFormat` to simulate it being unsupported and check the fallback to `islamic`, then to hidden.
- **Storage and migrations:** settings round-trip; corrupt JSON falls back to defaults and logs; migration from every past `settingsVersion` fixture to the current one; zod rejects invalid values.
- **Logger:** the ring buffer keeps the last 100 entries and persists.
- **Data validation:** `panels.json` and the cities dataset parse with zod; no duplicate ids; every city has a valid IANA timezone (`Intl.supportedValuesOf`).
- **i18n completeness:** tr/en/ar have identical key sets, no empty strings, and interpolation placeholders match across languages.

### 13.4 Design-token tests (`tests/core`, Node)
- **Contrast:** for every theme × period gradient stop (both stops, plus the blend midpoint), `contrast(text-1, bg) ≥ 4.5` and `contrast(text-2, bg) ≥ 3.0`; the accent on surface is ≥ 3.0; the danger overlay text is ≥ 4.5.
- Every theme defines every required token, enforced with a type test (`expectTypeOf`) and a runtime check.
- The CSS variable emitter produces the expected custom properties (inline snapshot).
- No pure white (`#fff`) is used for large static surfaces in dark themes (burn-in guard).

### 13.5 Audio and wake-lock tests (`tests/dom`, happy-dom)
- The Start tap unlocks audio: `play()` is called with `silence.m4a`, the audio factory is called **exactly once** for the app's lifetime, and later azans reuse the same instance (assert identity).
- Health check 3 minutes before a prayer: on success there's no overlay; when it rejects with `NotAllowedError`, the "Tap to enable azan" overlay shows with the danger styling, and tapping it re-unlocks and hides it.
- An unexpected `pause` during an azan shows "Resume"; `ended` returns to the clock view and starts the dua if enabled.
- Source resolution: a user Blob in IndexedDB wins over the bundled file; object URLs are revoked after `ended`.
- A missing file leads to the chime fallback being used and a warning flag in settings state.
- `pageshow` with `persisted: true` shows the start overlay.
- Wake lock: the **unsupported** path is the primary case (the target iPad): no errors are thrown, the one-time Auto-Lock hint shows and doesn't show again after a reload. When supported, it's requested after Start and re-requested on `visibilitychange` to visible; when rejected, the hint shows.
- Storage usage: with `navigator.storage.estimate` absent, the reported value is the sum of the IndexedDB Blob sizes.

### 13.6 UI tests (`tests/dom`, happy-dom) — the integration layer
Use `mountApp()` with all fakes injected and drive it with time travel and DOM events:
- **Full-day simulation:** advance from 00:00 to 23:59 in Schaumburg. At each prayer, check that the azan view appears, the timeline chip states (past/current/next) update, the next-prayer card and countdown text are correct, `data-period` on `<html>` changes, and the view returns to the clock after `ended`.
- **Pre-alert banner** appears N minutes before a prayer with the correct text.
- **Progress ring:** `stroke-dashoffset` is correct at 0%, 50% and 100% of the period.
- **Clock view:** 12/24 h formatting, the seconds toggle, and the Gregorian and Hijri dates. Snapshot the rendered HTML structure with `toMatchFileSnapshot` for landscape and portrait (orientation class toggled via a stubbed `matchMedia`).
- **Themes:** switching sets `data-theme`, and the CSS variables update.
- **RTL:** Arabic sets `dir="rtl"` and `lang="ar"`, prayer names come from `ar.json`, and the snapshot is stable.
- **Panels:** rotate on interval with the fake timers; Arabic above the translation; at most 2 panel nodes in the DOM.
- **Slideshow:** with 20 fake photos over 2 simulated hours, there are never more than 2 `<img>` nodes, and `revokeObjectURL` is called for every URL created (leak guard).
- **Reduced motion:** with `matchMedia('(prefers-reduced-motion: reduce)')` stubbed to true, the `reduced-motion` class is applied and the Ken Burns and breathing classes are absent.
- **Night dim:** the overlay is present at 01:00, removed at Fajr − 1 min, and removed during the azan.
- **Burn-in:** the layout transform changes every 10 minutes and stays within bounds.
- **Settings:** a 3 s long-press opens it; the PIN gate works; each control updates state and persists; live preview changes the clock behind the sheet; "Test azan" calls the player with the right source; invalid input is rejected; "Reset" restores defaults.
- **Toast:** the update-available toast appears and its apply action is blocked by the update gate near prayer time.
- **Debug panel:** shows the reload count, wake-lock state, audio state and `lastFired`.
- **Accessibility smoke checks:** every interactive element has an accessible name, buttons are `<button>`, touch targets have the min-size class, and overlays trap focus and set `aria-live` where appropriate.

### 13.7 Build verification tests (`tests/build`, Node, against `dist/`)
- `manifest.webmanifest`: `display: standalone`, name, `theme_color`, icons (including 180×180 and 512×512).
- The generated service worker's precache manifest includes `index.html`, all JS/CSS, every font file, `panels.json`, `silence.m4a` and all bundled audio and patterns.
- `index.html` contains the `apple-mobile-web-app-capable` and status-bar meta tags, `viewport-fit=cover`, and font preloads.
- `_headers` exists in `dist/` with the expected caching rules.
- Budgets: JS under 150 KB gzipped (compute with `zlib.gzipSync`), fonts at most 400 KB total, audio at most 30 MB total, no single file in `dist/` over 25 MiB, and fewer than 20,000 files (Cloudflare Pages free-tier limits).
- No copyrighted audio in the repo: `git ls-files public/audio` returns only `silence.m4a`. Skip this only when not in a git checkout, and never skip it in CI (`process.env.CI`).
- Public-repo hygiene: `git ls-files` contains no `.env*` files, `LICENSE` and `THIRD_PARTY_NOTICES.md` exist, and every font file in `dist/` has a matching license file in `public/fonts/`.
- **Safari 15 compatibility of the output** (catches anything that slipped past the linters, including code from dependencies):
  - Every JS file in `dist/` (app chunks and the service worker) parses with `acorn` (`ecmaVersion: 2022`), and an AST walk finds no `StaticBlock` nodes and no regex literals or `new RegExp` strings containing lookbehind (`(?<=` or `(?<!`). Named groups `(?<name>` are fine.
  - No CSS file in `dist/` contains `@container`, `color-mix(` or nested rules (parse with Lightning CSS or PostCSS and check that no rule has child rules).

### 13.8 Type tests (`tests/types/*.test-d.ts`)
- The settings type equals `z.infer<typeof settingsSchema>`.
- Ports: the fakes satisfy the port interfaces (`expectTypeOf<FakeMediaPlayer>().toMatchTypeOf<MediaPlayer>()`).
- The theme token map has all required keys for every theme.

### 13.9 Benchmarks (`tests/bench/*.bench.ts`, `vitest bench`)
- Calculating a full year of prayer times stays under 50 ms.
- `getDuePrayer` runs in under 0.05 ms per call (it runs every second, forever).
- Rendering the clock view on each tick stays cheap.
- Benchmarks are informational: run them locally and record the baseline in the README. They aren't run in CI.

### 13.10 What Vitest intentionally does NOT cover (manual only)
- Runtime use of JS built-ins missing from Safari 15 inside dependencies (the TS `lib` setting only guards our own code), real iOS Safari autoplay and unlock behavior, the screen staying on via Auto-Lock settings, Guided Access, Siri interruptions, service worker install/update on the device, real offline behavior after a reboot, rendering fidelity, blur performance and 60 fps animation. These are all in the manual iPad checklist (§15.4).

## 14. Debug panel
- A hidden screen (from settings) showing: app version, service worker status, wake lock state, audio unlock state, last health-check result, `lastFired`, reload count since install, storage usage, current period/theme, and the last 100 log lines kept in the ring buffer in localStorage.

## 15. README must include
1. Local dev commands: `dev`, `test`, `test:ui`, `test:coverage`, `build`, `test:build`, `bench`.
2. How to add azan audio files and run the normalize script, plus the rights note (the audio is never committed to this public repo, so either upload it on the iPad or direct-upload a local build, see §12).
2b. License, third-party notices, and a short "Contributing" note (run `npm run test:run` and `npm run test:build` before opening a PR).
3. **iPad kiosk setup checklist:**
   - Open the URL in Safari → Share → Add to Home Screen → open it from the Home Screen icon.
   - Settings → Display & Brightness → Auto-Lock → Never. (This is required: iPadOS 15 has no Wake Lock API.)
   - Settings → General → Software Update → Automatic Updates → OFF. Apple still ships occasional 15.8.x security updates, and an overnight install reboots the iPad and loses the audio unlock. Install them by hand, then tap Start again.
   - Battery: iPadOS 15 on this iPad has no charge limit or optimized-charging option, and an old battery kept at 100% around the clock can swell. Consider a smart plug that cycles charging (measure how long the battery lasts with the app running first), and check the iPad now and then for a lifting screen or bulging case.
   - Settings → Accessibility → Guided Access → ON with a passcode, and set **Display Auto-Lock → Never** there too. Then triple-click to start it in the app.
   - Set the volume with the hardware buttons, tap Start, and use "Test azan" in settings.
   - The iPad Air 2 and mini 4 have LCD screens, so burn-in is much less of a concern than on OLED. Keep pixel shift and night dim anyway (image retention, and the room at night).
   - Web Inspector (for the memory and fps checks below) needs a Mac running Safari, connected over USB, with Settings → Safari → Advanced → Web Inspector ON on the iPad. Without a Mac, use the debug panel's reload count as the leak signal.
4. **Manual test checklist on a real iPad** (this replaces E2E testing):
   - The Start tap unlocks audio, and "Test azan" plays for each prayer.
   - 24-hour soak test: all 5 azans fire on time, no page reload (check the reload count in the debug panel).
   - Turn Wi-Fi off for a full day; azans still fire and fonts and panels still render.
   - Reboot the iPad; the start overlay appears and the azan works after one tap.
   - Trigger Siri during an azan; the resume button appears and works.
   - Leave the photo slideshow running 24 hours; memory stays stable (Safari Web Inspector over USB).
   - The screen stays on for 24 hours inside a Guided Access session (both Auto-Lock settings at Never).
   - Deploy an update; the toast appears, it's blocked near prayer time, and applying it works.
   - Animations look smooth with no visible stutter (Web Inspector timeline if a Mac is available). Turn the "Glass effect" blur on, check it, and leave it off if it janks.
   - Review `/styleguide` and the live screens in every theme, both orientations, and Arabic RTL.
   - The clock is readable from across the room in daylight and at night.
   - Compare times against the local mosque's timetable for one week.

## 16. Code quality rules
- No direct use of `Date.now()`, `new Date()` without arguments, `setInterval`, `Math.random`, `localStorage`, `indexedDB`, `navigator.wakeLock` or `new Audio()` outside the adapters in `main.ts`. Enforce this with ESLint `no-restricted-globals` / `no-restricted-syntax` rules (exempting `main.ts` and the adapter files).
- Safari 15 compatibility is enforced in three layers: the TS `lib` setting (JS built-ins), `eslint-plugin-compat` and `stylelint-no-unsupported-browser-features` (web APIs and CSS), and the `dist/` compat build tests (§13.7). Also add an ESLint `no-restricted-syntax` rule that bans regex lookbehind in our own source. Before adding a dependency, check its published output for the APIs listed in §1.
- Every bug fix comes with a regression test in Vitest.

## 17. Milestones (commit after each, keep tests and coverage thresholds green)
1. Scaffold: public GitHub repo with `LICENSE`, `.gitignore` and branch protection; Vite + TS, ESLint/Stylelint/Prettier, browserslist + Safari 15 targets + compat linters, Vitest projects (core/dom/build), coverage thresholds, test helpers and fakes, GitHub Actions CI workflow. **Deploy a smoke build** (bundling `adhan`, `zod` and `idb-keyval`, and showing a computed prayer time) to Cloudflare Pages and open it on the real iPad from the Home Screen, so any incompatible dependency shows up on day one.
2. Ports/adapters + app store + `mountApp()` harness.
3. Design system: `tokens.ts`, CSS variable emitter, themes, fonts, base components, `/styleguide` route + contrast tests.
4. `prayerTimes` + `period` + fixtures + timezone/DST tests.
5. Main clock UI (landscape and portrait): clock, dates, next-prayer card with progress ring, timeline, period-driven gradient + DOM tests and snapshots.
6. Audio unlock, single media player, scheduler, azan view + full-day simulation tests.
7. Health check + start/resume overlays + wake lock + toasts + tests.
8. Settings screen + zod schema + persistence + migrations + live preview + i18n (TR/EN/AR, RTL) + tests.
9. Panels + photo slideshow (IndexedDB, Ken Burns) + leak-guard tests.
10. Burn-in shift + night dim + reduced-motion support + tests.
11. PWA/offline + update gate + `_headers` + build verification tests.
12. Type tests + benchmarks + debug panel.
13. Audio pipeline script, README, kiosk guide, manual checklist.
14. Deploy to Cloudflare Pages (free plan), then run the full manual iPad checklist.

## 18. Acceptance criteria
- With the iPadOS 15.8 iPad set up as described, every enabled azan plays within 2 seconds of its calculated time for 7 days straight, with Wi-Fi on or off (verified manually).
- After a reboot or reload, one tap restores azan playback, and the need for that tap is shown loudly on screen.
- Calculated times match the reference tables within ±2 minutes, and offsets allow an exact match.
- No duplicate or late-burst azans after a reload, DST change or midnight rollover (proven by Vitest simulations).
- The app runs 24 hours with the slideshow without Safari reloading the page.
- **UI:** it looks modern and polished on iPad in both orientations and all three themes; the clock and next prayer are readable from about 4 m; text contrast is at least 4.5:1 in every theme and period (enforced by Vitest); animations are smooth on the A8-class iPad with no visible stutter and respect reduced motion; Arabic RTL renders correctly; the `dist/` Safari 15 compat tests pass.
- **Tests:** all Vitest projects (core, dom, build) and type tests pass; coverage meets the thresholds (core/design ≥ 95%, ui ≥ 85%, overall ≥ 90%); the repo has no Playwright or other E2E dependency; it contains no copyrighted audio, personal data or secrets; and the license and third-party notice files are present.