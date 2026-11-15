// Design tokens: the single source of truth (brief §8.3). Emitted as CSS custom
// properties at startup. Derived colours are precomputed rgba() strings because
// Safari 15 has no color-mix().
import type { PrayerName } from '../core/prayerTimes';

export const THEME_NAMES = ['midnight', 'emerald', 'sand'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export interface ThemeTokens {
  bg1: string;
  bg2: string;
  surface: string;
  surfaceBorder: string;
  text1: string;
  text2: string;
  accent: string;
  accentSoft: string;
  danger: string;
  dangerText: string;
  shadow: string;
}

export const themes: Record<ThemeName, ThemeTokens> = {
  midnight: {
    bg1: '#0B1020',
    bg2: '#111A33',
    surface: 'rgba(255, 255, 255, 0.08)',
    surfaceBorder: 'rgba(255, 255, 255, 0.12)',
    text1: '#EEF2F8',
    text2: '#A6B1C6',
    accent: '#4FD1C5',
    accentSoft: 'rgba(79, 209, 197, 0.16)',
    danger: '#B42318',
    dangerText: '#FFF4EE',
    shadow: 'rgba(0, 0, 0, 0.35)',
  },
  emerald: {
    bg1: '#0A1F17',
    bg2: '#0F2A20',
    surface: 'rgba(255, 248, 230, 0.07)',
    surfaceBorder: 'rgba(255, 248, 230, 0.12)',
    text1: '#F3EBD8',
    text2: '#C2B89F',
    accent: '#C8A96A',
    accentSoft: 'rgba(200, 169, 106, 0.16)',
    danger: '#B42318',
    dangerText: '#FFF4EE',
    shadow: 'rgba(0, 0, 0, 0.35)',
  },
  sand: {
    bg1: '#F4EDE1',
    bg2: '#EADFCB',
    surface: 'rgba(255, 255, 255, 0.55)',
    surfaceBorder: 'rgba(60, 44, 24, 0.12)',
    text1: '#2B2118',
    text2: '#5C5043',
    accent: '#8A4F14',
    accentSoft: 'rgba(138, 79, 20, 0.12)',
    danger: '#B42318',
    dangerText: '#FFF4EE',
    shadow: 'rgba(60, 44, 24, 0.12)',
  },
};

/** Two low-saturation sky stops per prayer period, per theme (brief §8.3). */
export const periodGradients: Record<
  ThemeName,
  Readonly<Record<PrayerName, readonly [string, string]>>
> = {
  midnight: {
    fajr: ['#1B1840', '#2A2152'], // deep indigo → violet
    sunrise: ['#14243F', '#1E3556'], // soft dawn blue
    dhuhr: ['#10294A', '#173A63'], // clear sky blue
    asr: ['#2A2216', '#3A2C18'], // warm amber
    maghrib: ['#2E1A22', '#3D2020'], // rose / orange dusk
    isha: ['#0B1226', '#0E1830'], // deep night blue
  },
  emerald: {
    fajr: ['#16203A', '#1F2547'],
    sunrise: ['#102A2C', '#16373A'],
    dhuhr: ['#0E2F2A', '#123C35'],
    asr: ['#26261A', '#33301C'],
    maghrib: ['#2A1E1E', '#36231F'],
    isha: ['#0A1C18', '#0C221D'],
  },
  sand: {
    fajr: ['#E3DEEF', '#D8D0E8'],
    sunrise: ['#E4ECF4', '#D6E3F0'],
    dhuhr: ['#DCEAF6', '#CBE0F2'],
    asr: ['#F3E3C6', '#ECD6AE'],
    maghrib: ['#F2D9CF', '#EBC9BA'],
    isha: ['#D9DCE8', '#CDD2E2'],
  },
};

export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '24px',
  6: '32px',
  7: '48px',
  8: '64px',
} as const;
export const radius = { sm: '12px', md: '24px', lg: '32px', pill: '999px' } as const;
export const motion = {
  easeOut: 'cubic-bezier(.2,.8,.2,1)',
  durations: { fast: 150, base: 300, slow: 600 },
} as const;
/** Fluid type scale (brief §8.2), against the viewport. */
export const type = {
  clock: 'clamp(6rem, 16vw, 14rem)',
  nextName: 'clamp(2rem, 4vw, 3.5rem)',
  countdown: 'clamp(1.5rem, 3vw, 2.5rem)',
  times: 'clamp(1.25rem, 2.2vw, 2rem)',
  secondary: 'clamp(1rem, 1.6vw, 1.4rem)',
} as const;

const kebab = (s: string) => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

export function cssVariables(theme: ThemeName): Record<string, string> {
  const vars: Record<string, string> = {};
  const colors: Record<string, string> = { ...themes[theme] };
  for (const [k, v] of Object.entries(colors)) vars[`--${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(space)) vars[`--space-${k}`] = v;
  for (const [k, v] of Object.entries(radius)) vars[`--radius-${k}`] = v;
  for (const [k, v] of Object.entries(type)) vars[`--type-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(motion.durations)) vars[`--dur-${k}`] = `${v}ms`;
  vars['--ease-out'] = motion.easeOut;
  vars['--shadow-soft'] = `0 12px 40px ${themes[theme].shadow}`;
  return vars;
}

export function applyTokens(root: HTMLElement, theme: ThemeName): void {
  root.dataset.theme = theme;
  for (const [k, v] of Object.entries(cssVariables(theme))) root.style.setProperty(k, v);
}
