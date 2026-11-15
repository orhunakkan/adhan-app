import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listFiles } from './scan';

export const ROOT = resolve(import.meta.dirname, '../../..');
export const DIST = join(ROOT, 'dist');

export function requireDist(): string[] {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error('dist/ is missing: run `npm run build` before `npm run test:build`.');
  }
  return listFiles(DIST);
}

export function readDist(file: string): Buffer {
  return readFileSync(join(DIST, file));
}
