import { describe, expect, it } from 'vitest';
import { findCssCompatIssues, findJsCompatIssues, gzipSize } from '../build/lib/scan';

describe('findJsCompatIssues (Safari 15 output check)', () => {
  it('accepts ES2022 code with class fields, private methods and named groups', () => {
    const code = `
      class A { #x = 1; static y = 2; #m() { return this.#x; } get v() { return this.#m(); } }
      const r = /(?<year>\\d{4})-(?<m>\\d{2})/;
      export const out = [1, 2].at(-1) ?? new A().v;
    `;
    expect(findJsCompatIssues(code)).toEqual([]);
  });

  it('flags class static blocks', () => {
    expect(findJsCompatIssues('class A { static { this.x = 1; } }')).toEqual([
      expect.stringMatching(/static block/i),
    ]);
  });

  it.each([
    ['positive lookbehind literal', 'const r = /(?<=a)b/;'],
    ['negative lookbehind literal', 'const r = /(?<!a)b/u;'],
    ['lookbehind in new RegExp', "const r = new RegExp('(?<=a)b');"],
    ['lookbehind in RegExp()', 'const r = RegExp("(?<!a)b", "g");'],
  ])('flags %s', (_name, code) => {
    expect(findJsCompatIssues(code)).toEqual([expect.stringMatching(/lookbehind/i)]);
  });

  it('parses classic scripts (e.g. a service worker) too', () => {
    expect(findJsCompatIssues('var self2 = this; with (self2) {}')).toEqual([]);
  });

  it('reports syntax the ES2022 parser rejects', () => {
    expect(findJsCompatIssues('const x = a |> f;')).toEqual([
      expect.stringMatching(/does not parse/i),
    ]);
  });
});

describe('findCssCompatIssues', () => {
  it('accepts flat CSS with media queries and layers', () => {
    const css = '@layer base{a{color:red}}@media (orientation:portrait){.b{gap:1rem}}';
    expect(findCssCompatIssues(css)).toEqual([]);
  });

  it.each([
    ['container queries', '@container (min-width:1px){.a{color:red}}', /@container/],
    ['color-mix', '.a{color:color-mix(in srgb,red,blue)}', /color-mix/],
    ['nested rules', '.a{color:red;.b{color:blue}}', /nested/i],
    ['nested rules inside a layer', '@layer x{.a{&:hover{color:blue}}}', /nested/i],
  ])('flags %s', (_name, css, pattern) => {
    expect(findCssCompatIssues(css)).toEqual([expect.stringMatching(pattern)]);
  });
});

describe('gzipSize', () => {
  it('returns the gzip-compressed byte length', () => {
    const size = gzipSize(Buffer.from('a'.repeat(10_000)));
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(200);
  });
});
