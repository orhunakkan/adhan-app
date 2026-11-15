// WCAG 2.x contrast helpers (brief §8.3, §13.4). Pure; used by tests and the styleguide.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): Rgba {
  const s = input.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (fn) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

const toHex = ({ r, g, b }: Rgba) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** A translucent colour painted over an opaque base, as an opaque hex. */
export function composite(top: string, base: string): string {
  const t = parseColor(top);
  const b = parseColor(base);
  const mix = (x: number, y: number) => x * t.a + y * (1 - t.a);
  return toHex({ r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b), a: 1 });
}

/** Linear blend between two opaque colours (0 = a, 1 = b). */
export function blend(a: string, b: string, ratio: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const mix = (p: number, q: number) => p + (q - p) * ratio;
  return toHex({ r: mix(x.r, y.r), g: mix(x.g, y.g), b: mix(x.b, y.b), a: 1 });
}

export function luminance(color: string): number {
  const { r, g, b } = parseColor(color);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
