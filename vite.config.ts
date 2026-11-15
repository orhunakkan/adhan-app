import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// One browser target for every tool: package.json "browserslist" (iOS >= 15.6).
const cssTargets = browserslistToTargets(browserslist(pkg.browserslist));

export default defineConfig({
  css: {
    transformer: 'lightningcss',
    lightningcss: { targets: cssTargets },
  },
  build: {
    target: ['safari15', 'ios15'],
    cssTarget: 'safari15',
    cssMinify: 'lightningcss',
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
