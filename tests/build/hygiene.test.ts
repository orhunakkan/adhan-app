import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './lib/dist';

function gitLsFiles(...args: string[]): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', ...args], { cwd: ROOT, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

const tracked = gitLsFiles();
const inCi = Boolean(process.env.CI);

describe('public-repo hygiene', () => {
  it('runs inside a git checkout (required in CI)', () => {
    if (inCi) expect(tracked).not.toBeNull();
  });

  it.skipIf(!tracked && !inCi)('tracks no audio except public/audio/silence.m4a', () => {
    const audio = gitLsFiles('public/audio') ?? [];
    expect(audio.filter((f) => f !== 'public/audio/silence.m4a')).toEqual([]);
    const anyAudio = (tracked ?? []).filter((f) => /\.(m4a|mp3|aac|wav|ogg|flac)$/i.test(f));
    expect(anyAudio.filter((f) => f !== 'public/audio/silence.m4a')).toEqual([]);
  });

  it.skipIf(!tracked && !inCi)('tracks no .env files', () => {
    expect((tracked ?? []).filter((f) => /(^|\/)\.env/.test(f))).toEqual([]);
  });

  it('.gitignore keeps azan audio out of the repo', () => {
    const lines = readFileSync(join(ROOT, '.gitignore'), 'utf8')
      .split('\n')
      .map((l) => l.trim());
    expect(lines).toContain('public/audio/*');
    expect(lines).toContain('!public/audio/silence.m4a');
    for (const entry of ['node_modules/', 'dist/', 'coverage/', '.wrangler/', '.env*']) {
      expect(lines).toContain(entry);
    }
  });

  it('ships an MIT LICENSE', () => {
    expect(readFileSync(join(ROOT, 'LICENSE'), 'utf8')).toMatch(/MIT License/);
  });

  it('has no Playwright or other browser-automation dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >;
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const banned =
      /playwright|puppeteer|cypress|webdriver|selenium|@vitest\/browser|chrome-devtools-mcp|lighthouse/i;
    expect(deps.filter((d) => banned.test(d))).toEqual([]);
    expect(existsSync(join(ROOT, 'playwright.config.ts'))).toBe(false);
  });
});

describe('fonts', () => {
  it('every font file in dist/ has a matching OFL licence in public/fonts/', async () => {
    const { requireDist } = await import('./lib/dist');
    const fonts = requireDist().filter((f) => f.endsWith('.woff2'));
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      const family = f
        .replace(/^fonts\//, '')
        .replace(/-(latin|latin-ext|\d{3}|wght).*$/, '')
        .replace(/-latin$/, '');
      expect(existsSync(join(ROOT, 'public', 'fonts', `${family}.OFL.txt`)), f).toBe(true);
    }
  });
});

describe('fonts', () => {
  it('every font file in dist/ has a matching OFL licence in public/fonts/', async () => {
    const { requireDist } = await import('./lib/dist');
    const fonts = requireDist().filter((f) => f.endsWith('.woff2'));
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      const family = f
        .replace(/^fonts\//, '')
        .replace(/\.woff2$/, '')
        .replace(/-(latin-ext-wght|latin-wght|wght|\d{3})$/, '');
      expect(existsSync(join(ROOT, 'public', 'fonts', `${family}.OFL.txt`)), f).toBe(true);
    }
  });
});

describe('docs', () => {
  it('ships THIRD_PARTY_NOTICES.md naming every runtime dependency', () => {
    const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const dep of Object.keys(pkg.dependencies)) expect(notices, dep).toContain(dep);
    expect(notices).toMatch(/GeoNames/);
    expect(notices).toMatch(/OFL/);
  });

  it('every relative link in README and docs resolves', () => {
    const files = ['README.md', 'THIRD_PARTY_NOTICES.md'];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      for (const m of text.matchAll(/\]\((?!https?:|#)([^)#]+)\)/g)) {
        expect(existsSync(join(ROOT, m[1]!)), `${f} → ${m[1]}`).toBe(true);
      }
    }
  });
});
