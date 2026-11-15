import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIST, readDist, requireDist } from './lib/dist';

const files = requireDist();
const manifest = JSON.parse(readDist('manifest.webmanifest').toString('utf8')) as {
  display: string;
  name: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string }>;
};
const sw = readDist('sw.js').toString('utf8');
// The manifest is injected as JSON ("url":"…") or minified JS (url:"…").
const precached = [...sw.matchAll(/"?url"?:"([^"]+)"/g)].map((m) => m[1]!);
const html = readDist('index.html').toString('utf8');

describe('manifest.webmanifest', () => {
  it('is standalone with a name and the Midnight theme colour', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBe('Ezan Saati');
    expect(manifest.theme_color).toBe('#0B1020');
  });

  it('lists 180×180 and 512×512 icons that exist in dist/', () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['180x180', '512x512']));
    for (const icon of manifest.icons) expect(existsSync(join(DIST, icon.src))).toBe(true);
  });
});

describe('service worker precache', () => {
  it('includes the shell, every JS/CSS file, fonts, cities, patterns and the silent clip', () => {
    const required = files.filter(
      (f) =>
        f === 'index.html' ||
        /^assets\/.*\.(js|css)$/.test(f) ||
        (f.startsWith('fonts/') && f.endsWith('.woff2')) ||
        f.startsWith('patterns/') ||
        f.startsWith('audio/') ||
        f === 'data/cities.json',
    );
    expect(required.length).toBeGreaterThan(10);
    for (const f of required) expect(precached, f).toContain(f);
    expect(precached).toContain('audio/silence.m4a');
  });

  it('serves audio with Range-request support (Safari media requests) and honours SKIP_WAITING', () => {
    expect(sw).toMatch(/[Rr]ange/);
    expect(sw).toContain('206');
    expect(sw).toContain('SKIP_WAITING');
  });

  it('claims the page on first activation, so the first launch already gets 206 audio', () => {
    expect(sw).toMatch(/clients\.claim\(\)/);
  });

  it('is a classic script (Safari 15 has no module service workers)', () => {
    expect(sw).not.toMatch(/^\s*(import|export)\s/m);
  });

  it('does not precache the large iPad startup images', () => {
    expect(precached.some((u) => u.includes('startup-'))).toBe(false);
  });
});

describe('index.html', () => {
  it.each([
    ['apple-mobile-web-app-capable', /name="apple-mobile-web-app-capable" content="yes"/],
    [
      'status bar style',
      /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/,
    ],
    ['web app title', /name="apple-mobile-web-app-title" content="Ezan Saati"/],
    [
      'apple-touch-icon 180',
      /rel="apple-touch-icon" sizes="180x180" href="\/icons\/icon-180\.png"/,
    ],
    ['manifest link', /rel="manifest" href="\/manifest\.webmanifest"/],
    ['startup image', /rel="apple-touch-startup-image"/],
  ])('has the %s tag', (_n, re) => {
    expect(html).toMatch(re);
  });

  it('has no inline scripts or styles (strict CSP)', () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/<style/);
    expect(html).not.toMatch(/\sstyle="/);
  });
});

describe('_headers (Cloudflare Pages)', () => {
  const headers = existsSync(join(DIST, '_headers'))
    ? readFileSync(join(DIST, '_headers'), 'utf8')
    : '';
  const block = (path: string) => {
    const lines = headers.split('\n');
    const i = lines.findIndex((l) => l.trim() === path);
    if (i < 0) return '';
    const out: string[] = [];
    for (const l of lines.slice(i + 1)) {
      if (!/^\s/.test(l) || !l.trim()) break;
      out.push(l.trim());
    }
    return out.join('\n');
  };

  it('exists in dist/', () => {
    expect(headers).not.toBe('');
  });

  it.each(['/assets/*', '/fonts/*'])('caches %s for a year, immutable', (p) => {
    expect(block(p)).toContain('Cache-Control: public, max-age=31536000, immutable');
  });

  it.each(['/', '/index.html', '/sw.js', '/manifest.webmanifest'])('never caches %s', (p) => {
    expect(block(p)).toContain('Cache-Control: no-cache');
  });

  it('sends a strict CSP and hardening headers on every path', () => {
    const all = block('/*');
    expect(all).toMatch(/Content-Security-Policy: default-src 'self'; script-src 'self'/);
    expect(all).toContain("frame-ancestors 'none'");
    expect(all).toContain('X-Content-Type-Options: nosniff');
  });
});
