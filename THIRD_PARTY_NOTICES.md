# Third-party notices

The project's own code is MIT licensed (see `LICENSE`). It ships or derives from the following third-party works.

## Runtime code (bundled into `dist/`)

| Component | Version | License | Source |
|---|---|---|---|
| adhan (adhan-js) | 4.4.6 | MIT | https://github.com/batoulapps/adhan-js |
| zod | 4.6.7 | MIT | https://github.com/colinhacks/zod |
| idb-keyval | 6.3.0 | Apache-2.0 | https://github.com/jakearchibald/idb-keyval |
| lucide (six icons, inlined) | 1.73.0 | ISC | https://github.com/lucide-icons/lucide |
| workbox-window | 7.4.1 | MIT | https://github.com/GoogleChrome/workbox |
| Workbox runtime in the generated `sw.js` (core, precaching, routing) | 7.4.1 | MIT | https://github.com/GoogleChrome/workbox |

## Fonts (`public/fonts/`, licence files next to them)

| Font | License |
|---|---|
| Inter (variable, latin + latin-ext) | SIL Open Font License 1.1 — `public/fonts/inter.OFL.txt` |
| IBM Plex Sans Arabic (300/400/600, arabic subset) | SIL Open Font License 1.1 — `public/fonts/ibm-plex-sans-arabic.OFL.txt` |
| Noto Naskh Arabic (variable, arabic subset) | SIL Open Font License 1.1 — `public/fonts/noto-naskh-arabic.OFL.txt` |

The woff2 subsets come from the `@fontsource` packages (`scripts/copy-fonts.mjs`).

## Data and content

| Content | License / status | Attribution |
|---|---|---|
| `public/data/cities.json` | CC BY 4.0 | Derived from GeoNames `cities15000` (https://www.geonames.org), filtered to places with ≥ 50,000 inhabitants by `scripts/build-cities.mjs` |
| Dua text in the azan screen | Arabic hadith text (public domain); Turkish and English renderings written for this project | — |

## Not included

No azan recordings are distributed. `public/audio/` is git-ignored except the generated 0.5 s `silence.m4a` (no rights issues). Owners add their own files; see the README.
