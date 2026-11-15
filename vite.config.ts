import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
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
  plugins: [
    VitePWA({
      // The app registers the worker itself (src/adapters/sw.ts) and only applies
      // an update on a tap the update gate allows (brief §11).
      injectRegister: false,
      registerType: 'prompt',
      manifest: {
        name: 'Ezan Saati',
        short_name: 'Ezan Saati',
        description: 'Offline azan clock for an always-on iPad',
        lang: 'tr',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        theme_color: '#0B1020',
        background_color: '#0B1020',
        icons: [
          { src: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Everything the clock needs offline after the first load (brief §11).
        globPatterns: ['**/*.{html,js,css,woff2,json,svg,png,m4a,webmanifest}'],
        globIgnores: ['icons/startup-*.png'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
});
