#!/usr/bin/env node
// Copies the self-hosted woff2 subsets and their SIL OFL 1.1 licences from the
// @fontsource packages into public/fonts (brief §8.2, §12.1). Re-run after a
// font package update and commit the result.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'public', 'fonts');
const nm = (p) => join(root, 'node_modules', p);

const FONTS = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-latin-wght.woff2'],
  [
    '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2',
    'inter-latin-ext-wght.woff2',
  ],
  [
    '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-300-normal.woff2',
    'ibm-plex-sans-arabic-300.woff2',
  ],
  [
    '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
    'ibm-plex-sans-arabic-400.woff2',
  ],
  [
    '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
    'ibm-plex-sans-arabic-600.woff2',
  ],
  [
    '@fontsource-variable/noto-naskh-arabic/files/noto-naskh-arabic-arabic-wght-normal.woff2',
    'noto-naskh-arabic-wght.woff2',
  ],
];
const LICENSES = [
  ['@fontsource-variable/inter/LICENSE', 'inter.OFL.txt'],
  ['@fontsource/ibm-plex-sans-arabic/LICENSE', 'ibm-plex-sans-arabic.OFL.txt'],
  ['@fontsource-variable/noto-naskh-arabic/LICENSE', 'noto-naskh-arabic.OFL.txt'],
];

mkdirSync(out, { recursive: true });
for (const [from, to] of [...FONTS, ...LICENSES]) {
  copyFileSync(nm(from), join(out, to));
  console.log(`public/fonts/${to}`);
}
