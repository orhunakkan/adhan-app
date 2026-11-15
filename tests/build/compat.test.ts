import { describe, expect, it } from 'vitest';
import { readDist, requireDist } from './lib/dist';
import { findCssCompatIssues, findJsCompatIssues } from './lib/scan';

const files = requireDist();
const js = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
const css = files.filter((f) => f.endsWith('.css'));

describe('dist/ is Safari 15 compatible', () => {
  it('has JavaScript to check', () => {
    expect(js.length).toBeGreaterThan(0);
  });

  it.each(js)('%s parses as ES2022 with no static blocks or lookbehind', (file) => {
    expect(findJsCompatIssues(readDist(file).toString('utf8'))).toEqual([]);
  });

  it.each(css.length ? css : ['(no css yet)'])(
    '%s has no @container, color-mix() or nesting',
    (file) => {
      if (!file.endsWith('.css')) return;
      expect(findCssCompatIssues(readDist(file).toString('utf8'))).toEqual([]);
    },
  );
});
