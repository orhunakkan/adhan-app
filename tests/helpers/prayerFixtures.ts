import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const prayerFixtureSchema = z.object({
  source: z.string().min(1),
  url: z.url(),
  fetchedAt: z.iso.date(),
  location: z.object({
    name: z.string(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    tz: z.string(),
  }),
  method: z.enum(['NorthAmerica', 'Turkey', 'MuslimWorldLeague']),
  madhab: z.enum(['Shafi', 'Hanafi']),
  highLatitudeRule: z.enum(['MiddleOfTheNight', 'SeventhOfTheNight', 'TwilightAngle']),
  days: z
    .array(
      z.object({
        date: z.iso.date(),
        fajr: HHMM,
        sunrise: HHMM,
        dhuhr: HHMM,
        asr: HHMM,
        maghrib: HHMM,
        isha: HHMM,
      }),
    )
    .min(28),
});

export type PrayerFixture = z.infer<typeof prayerFixtureSchema>;

const DIR = join(import.meta.dirname, '..', 'fixtures', 'prayer');

export function loadPrayerFixtures(): Array<{ file: string; fixture: PrayerFixture }> {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      fixture: prayerFixtureSchema.parse(JSON.parse(readFileSync(join(DIR, file), 'utf8'))),
    }));
}
