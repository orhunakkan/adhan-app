import { expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type { Settings, settingsSchema } from '../../src/config/schema';
import type { CalcSettings, Location } from '../../src/core/prayerTimes';

it('Settings is exactly z.infer of the schema', () => {
  expectTypeOf<Settings>().toEqualTypeOf<z.infer<typeof settingsSchema>>();
});

it('stored calc and location fit the prayer engine inputs', () => {
  expectTypeOf<Settings['calc']>().toExtend<CalcSettings>();
  expectTypeOf<NonNullable<Settings['location']>>().toExtend<Location>();
});
