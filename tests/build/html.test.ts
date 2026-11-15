import { describe, expect, it } from 'vitest';
import { readDist, requireDist } from './lib/dist';

const files = requireDist();
const html = readDist('index.html').toString('utf8');

describe('dist/index.html', () => {
  it('has viewport-fit=cover', () => {
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });

  it('preloads the Latin, Latin Extended (Turkish) and Arabic UI fonts', () => {
    for (const f of ['inter-latin-wght', 'inter-latin-ext-wght', 'ibm-plex-sans-arabic-400']) {
      expect(html).toMatch(new RegExp(`rel="preload"[^>]*${f}\\.woff2[^>]*as="font"`));
    }
  });
});

describe('dist/ build hygiene', () => {
  it('does not ship the dev-only styleguide', () => {
    const js = files.filter((f) => f.endsWith('.js')).map((f) => readDist(f).toString('utf8'));
    expect(js.some((c) => c.includes('sg-theme'))).toBe(false);
  });

  it('adds the -webkit- prefixes Safari 15 needs (Lightning CSS)', () => {
    const css = files
      .filter((f) => f.endsWith('.css'))
      .map((f) => readDist(f).toString('utf8'))
      .join('\n');
    expect(css).toContain('-webkit-backdrop-filter');
    expect(css).toContain('-webkit-user-select');
  });
});
