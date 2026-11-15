import { describe, expect, it } from 'vitest';
import { blend, composite, contrast, parseColor } from '../../src/design/contrast';
import {
  applyTokens,
  cssVariables,
  motion,
  periodGradients,
  THEME_NAMES,
  themes,
  type ThemeName,
} from '../../src/design/tokens';
import { PRAYERS } from '../../src/core/prayerTimes';

/** Every background the text can sit on: both stops and their midpoint, over the theme base. */
function backgrounds(theme: ThemeName): string[] {
  return PRAYERS.flatMap((p) => {
    const [a, b] = periodGradients[theme][p];
    return [a, b, blend(a, b, 0.5)].map((c) => composite(c, themes[theme].bg1));
  });
}

describe.each(THEME_NAMES)('theme %s contrast (WCAG)', (theme) => {
  const t = themes[theme];

  it('primary text ≥ 4.5:1 on every period gradient stop and midpoint', () => {
    for (const bg of backgrounds(theme))
      expect(contrast(t.text1, bg), bg).toBeGreaterThanOrEqual(4.5);
  });

  it('secondary text ≥ 3:1 on every period gradient stop and midpoint', () => {
    for (const bg of backgrounds(theme))
      expect(contrast(t.text2, bg), bg).toBeGreaterThanOrEqual(3);
  });

  it('primary text ≥ 4.5:1 on a card surface over every background', () => {
    for (const bg of backgrounds(theme)) {
      expect(contrast(t.text1, composite(t.surface, bg)), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('secondary text ≥ 4.5:1 on a card surface (past chips, labels at normal size)', () => {
    for (const bg of backgrounds(theme)) {
      expect(contrast(t.text2, composite(t.surface, bg)), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accent ≥ 3:1 on a card surface over every background', () => {
    for (const bg of backgrounds(theme)) {
      expect(contrast(t.accent, composite(t.surface, bg)), bg).toBeGreaterThanOrEqual(3);
    }
  });

  it('danger overlay text ≥ 4.5:1 on the danger colour', () => {
    expect(contrast(t.dangerText, t.danger)).toBeGreaterThanOrEqual(4.5);
  });

  it('defines every token as a parseable colour', () => {
    for (const v of Object.values(t)) expect(() => parseColor(v)).not.toThrow();
  });
});

describe('burn-in guard', () => {
  it.each(['midnight', 'emerald'] as const)(
    '%s uses no pure white for large static surfaces',
    (theme) => {
      const t = themes[theme];
      const surfaces = [t.bg1, t.bg2, ...PRAYERS.flatMap((p) => periodGradients[theme][p])];
      for (const c of surfaces) {
        const { r, g, b } = parseColor(c);
        expect(r + g + b, c).toBeLessThan(3 * 255);
        expect(c.toLowerCase()).not.toMatch(/^#fff(fff)?$/);
      }
      expect(t.text1.toLowerCase()).not.toMatch(/^#fff(fff)?$/);
    },
  );

  it('keeps dark-theme gradients dark (low luminance) so they never flash', () => {
    for (const theme of ['midnight', 'emerald'] as const) {
      for (const bg of backgrounds(theme)) expect(contrast(bg, '#000')).toBeLessThan(2.5);
    }
  });
});

describe('cssVariables', () => {
  it('emits the custom properties for a theme', () => {
    const vars = cssVariables('midnight');
    expect(Object.keys(vars)).toEqual(
      expect.arrayContaining([
        '--bg-1',
        '--bg-2',
        '--surface',
        '--surface-border',
        '--text-1',
        '--text-2',
        '--accent',
        '--accent-soft',
        '--danger',
        '--danger-text',
        '--radius-md',
        '--radius-lg',
        '--space-4',
        '--shadow-soft',
        '--ease-out',
        '--dur-fast',
        '--dur-base',
        '--dur-slow',
      ]),
    );
    expect(vars['--ease-out']).toBe('cubic-bezier(.2,.8,.2,1)');
    expect({ dur: [vars['--dur-fast'], vars['--dur-base'], vars['--dur-slow']] })
      .toMatchInlineSnapshot(`
      {
        "dur": [
          "150ms",
          "300ms",
          "600ms",
        ],
      }
    `);
  });

  it('applyTokens sets data-theme and the variables on the root element', () => {
    const style = new Map<string, string>();
    const root = {
      dataset: {} as Record<string, string>,
      style: { setProperty: (k: string, v: string) => style.set(k, v) },
    };
    applyTokens(root as unknown as HTMLElement, 'sand');
    expect(root.dataset.theme).toBe('sand');
    expect(style.get('--bg-1')).toBe(themes.sand.bg1);
    expect(style.get('--text-1')).toBe(themes.sand.text1);
  });

  it("motion durations are the brief's 150 / 300 / 600 ms", () => {
    expect(motion.durations).toEqual({ fast: 150, base: 300, slow: 600 });
  });
});

describe('effective contrast in the stylesheet', () => {
  it('never dims text-bearing chips or cards with opacity (it would break the ratios above)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const postcss = (await import('postcss')).default;
    const css = readFileSync(
      join(import.meta.dirname, '..', '..', 'src', 'styles', 'views.css'),
      'utf8',
    );
    const offenders: string[] = [];
    postcss.parse(css).walkDecls('opacity', (d) => {
      const rule = d.parent as { selector?: string };
      const sel = rule.selector ?? '';
      const value = Number(d.value);
      if (/\.chip(--[a-z]+)?$|\.chip__(name|time)|\.next-card|\.clock__/.test(sel) && value < 1)
        offenders.push(`${sel} { opacity: ${d.value} }`);
    });
    expect(offenders).toEqual([]);
  });
});
