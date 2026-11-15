import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIST, readDist, requireDist } from './lib/dist';
import { gzipSize } from './lib/scan';

const KB = 1024;
const MiB = 1024 * 1024;
const files = requireDist();
const size = (f: string) => statSync(join(DIST, f)).size;
const sum = (list: string[], fn: (f: string) => number) => list.reduce((n, f) => n + fn(f), 0);

// Budgets from SPEC "Success Criteria" / brief §13.7 and Cloudflare Pages free-tier limits.
describe('dist/ budgets', () => {
  it('app JavaScript is under 150 KB gzipped (service worker excluded)', () => {
    const appJs = files.filter((f) => f.startsWith('assets/') && f.endsWith('.js'));
    expect(sum(appJs, (f) => gzipSize(readDist(f)))).toBeLessThan(150 * KB);
  });

  it('fonts total at most 400 KB', () => {
    expect(
      sum(
        files.filter((f) => /\.(woff2?|ttf|otf)$/.test(f)),
        size,
      ),
    ).toBeLessThanOrEqual(400 * KB);
  });

  it('bundled audio totals at most 30 MB', () => {
    expect(
      sum(
        files.filter((f) => /\.(m4a|mp3|aac|wav|ogg)$/.test(f)),
        size,
      ),
    ).toBeLessThanOrEqual(30 * MiB);
  });

  it('no single file exceeds 25 MiB (Cloudflare Pages per-file limit)', () => {
    expect(files.filter((f) => size(f) > 25 * MiB)).toEqual([]);
  });

  it('has fewer than 20,000 files (Cloudflare Pages per-deployment limit)', () => {
    expect(files.length).toBeLessThan(20_000);
  });
});
