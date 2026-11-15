import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// Lints snippets with the real eslint.config.js (type-aware rules disabled so
// virtual file paths work) to prove the Safari 15 and side-effect guards fire.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: tseslint.configs.disableTypeChecked,
});

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

const BANNED: Array<[string, string]> = [
  ['Date.now()', 'export const t = Date.now();'],
  ['argless new Date()', 'export const d = new Date();'],
  ['Math.random', 'export const r = Math.random();'],
  ['navigator.wakeLock', 'export const w = navigator.wakeLock;'],
  ['new Audio()', 'export const a = new Audio();'],
  ['window.localStorage', 'export const s = window.localStorage;'],
  ['globalThis.setInterval', 'globalThis.setInterval(() => 0, 1);'],
];

const BANNED_GLOBALS: Array<[string, string]> = [
  ['setInterval', 'setInterval(() => 0, 1);'],
  ['localStorage', 'export const s = localStorage;'],
  ['indexedDB', 'export const i = indexedDB;'],
];

describe('eslint side-effect guards', () => {
  it.each(BANNED)('reports %s in src/core', async (_name, code) => {
    expect(await ruleIds(code, 'src/core/probe.ts')).toContain('no-restricted-syntax');
  });

  it.each(BANNED_GLOBALS)('reports global %s in src/ui', async (_name, code) => {
    expect(await ruleIds(code, 'src/ui/probe.ts')).toContain('no-restricted-globals');
  });

  it.each([...BANNED, ...BANNED_GLOBALS])('allows %s in adapters and main.ts', async (_n, code) => {
    for (const file of ['src/adapters/probe.ts', 'src/main.ts']) {
      const ids = await ruleIds(code, file);
      expect(ids).not.toContain('no-restricted-syntax');
      expect(ids).not.toContain('no-restricted-globals');
    }
  });

  it('allows new Date(value) with arguments', async () => {
    expect(await ruleIds('export const d = new Date(0);', 'src/core/probe.ts')).toEqual([]);
  });
});

describe('eslint Safari 15 regex guard', () => {
  it.each([
    ['lookbehind literal', 'export const r = /(?<=a)b/;'],
    ['negative lookbehind literal', 'export const r = /(?<!a)b/;'],
    ['lookbehind in new RegExp', "export const r = new RegExp('(?<=a)b');"],
  ])('reports %s everywhere, including adapters', async (_name, code) => {
    expect(await ruleIds(code, 'src/core/probe.ts')).toContain('no-restricted-syntax');
    expect(await ruleIds(code, 'src/adapters/probe.ts')).toContain('no-restricted-syntax');
  });

  it('allows named capture groups', async () => {
    expect(await ruleIds('export const r = /(?<year>\\d{4})/;', 'src/core/probe.ts')).toEqual([]);
  });
});

describe('eslint-plugin-compat against browserslist (iOS >= 15.6)', () => {
  it.each([
    ['requestIdleCallback', 'requestIdleCallback(() => undefined);'],
    ['OffscreenCanvas', 'export const c = new OffscreenCanvas(1, 1);'],
  ])('reports %s', async (_name, code) => {
    const ids = await ruleIds(code, 'src/ui/probe.ts');
    expect(ids.some((id) => id === 'compat/compat' || id === 'no-restricted-globals')).toBe(true);
  });
});
