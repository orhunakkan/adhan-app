import { expectTypeOf, it } from 'vitest';
import type { PrayerName } from '../../src/core/prayerTimes';
import type { periodGradients, ThemeName, themes, ThemeTokens } from '../../src/design/tokens';

it('every theme defines every token', () => {
  expectTypeOf<(typeof themes)[ThemeName]>().toEqualTypeOf<ThemeTokens>();
  expectTypeOf<keyof typeof themes>().toEqualTypeOf<ThemeName>();
});

it('every theme has a two-stop gradient for every period', () => {
  expectTypeOf<(typeof periodGradients)[ThemeName]>().toEqualTypeOf<
    Readonly<Record<PrayerName, readonly [string, string]>>
  >();
});
