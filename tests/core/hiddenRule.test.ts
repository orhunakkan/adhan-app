// Regression: the closed settings layer (hidden, but `display: grid` from its
// class) stayed on screen as an invisible full-screen layer above the app and
// swallowed every touch, so nothing could be tapped after Start. happy-dom does
// no hit-testing, so this is pinned at the CSS level.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname, '..', '..', 'src', 'styles');
const sheets = readdirSync(DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ file: f, root: postcss.parse(readFileSync(join(DIR, f), 'utf8')) }));
const base = sheets.find((s) => s.file === 'base.css')!.root;

describe('[hidden] always hides', () => {
  it('base.css forces display: none !important for [hidden] in the first cascade layer', () => {
    const order = base.nodes.find(
      (n): n is AtRule => n.type === 'atrule' && n.name === 'layer' && !n.nodes,
    );
    const first = order!.params.split(',')[0]!.trim();
    let found: Rule | undefined;
    base.walkRules('[hidden]', (r) => {
      found = r;
    });
    expect(found, 'a [hidden] rule').toBeDefined();
    const parent = found!.parent as AtRule;
    expect(parent.type === 'atrule' && parent.name === 'layer' && parent.params).toBe(first);
    const decl = found!.nodes.find((n) => n.type === 'decl' && n.prop === 'display');
    expect(decl).toMatchObject({ value: 'none', important: true });
  });

  it('no other rule sets display with !important (it would beat [hidden])', () => {
    const offenders: string[] = [];
    for (const { file, root } of sheets) {
      root.walkDecls('display', (d) => {
        const rule = d.parent as Rule;
        if (d.important && rule.selector !== '[hidden]')
          offenders.push(`${file}: ${rule.selector}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
