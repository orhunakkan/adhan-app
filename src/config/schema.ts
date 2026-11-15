// zod schemas: the single source of truth for settings shape AND defaults
// (brief §9 "Settings content"). Defaults live here so a stored object from an
// older build that lacks a newly added field still parses.
import { z } from './zod';
import {
  AZAN_PRAYERS,
  CALCULATION_METHODS,
  HIGH_LATITUDE_RULES,
  MADHABS,
  OFFSET_LIMIT_MIN,
} from '../core/prayerTimes';

export const SETTINGS_VERSION = 1;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const locationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  tz: z.string().refine(isValidTimeZone, 'Unknown IANA time zone'),
});

const offset = z.int().min(-OFFSET_LIMIT_MIN).max(OFFSET_LIMIT_MIN).default(0);

/** 'bundled:<file>' (public/audio/<file>.m4a) or 'user:<blob key>' (IndexedDB). */
export const audioSourceSchema = z.string().regex(/^(bundled:[a-z0-9-]+|user:[A-Za-z0-9_-]+)$/);

const perAzan = <T extends z.ZodType>(schema: (p: (typeof AZAN_PRAYERS)[number]) => T) =>
  z.object(
    Object.fromEntries(AZAN_PRAYERS.map((p) => [p, schema(p)])) as Record<
      (typeof AZAN_PRAYERS)[number],
      T
    >,
  );

/** Default Turkish makam per prayer; Fajr has its own file ("es-salâtü hayrun mine'n-nevm"). */
export const DEFAULT_AUDIO = {
  fajr: 'bundled:saba-sabah',
  dhuhr: 'bundled:ussak',
  asr: 'bundled:rast',
  maghrib: 'bundled:segah',
  isha: 'bundled:hicaz',
} as const;

export const THEMES = ['midnight', 'emerald', 'sand'] as const;
export const LANGUAGES = ['tr', 'en', 'ar'] as const;
export const SCREENSAVER_MODES = ['panels', 'photos', 'alternate'] as const;

export const settingsSchema = z.object({
  settingsVersion: z.literal(SETTINGS_VERSION).default(SETTINGS_VERSION),
  location: locationSchema.nullable().default(null),
  calc: z
    .object({
      method: z.enum(CALCULATION_METHODS).default('Turkey'),
      madhab: z.enum(MADHABS).default('Shafi'),
      highLatitudeRule: z.enum(HIGH_LATITUDE_RULES).default('MiddleOfTheNight'),
      offsets: z
        .object({
          fajr: offset,
          sunrise: offset,
          dhuhr: offset,
          asr: offset,
          maghrib: offset,
          isha: offset,
        })
        .prefault({}),
    })
    .prefault({}),
  azan: z
    .object({
      enabled: perAzan(() => z.boolean().default(true)).prefault({}),
      audio: perAzan((p) => audioSourceSchema.default(DEFAULT_AUDIO[p])).prefault({}),
      dua: z
        .object({
          enabled: z.boolean().default(false),
          source: audioSourceSchema.default('bundled:dua'),
        })
        .prefault({}),
      /** How late (seconds after the prayer time) an azan may still start (brief §6). */
      lateWindowSec: z.int().min(30).max(600).default(120),
      /** Pre-alert banner lead time in minutes; 0 disables it. */
      preAlertMin: z.int().min(0).max(60).default(10),
    })
    .prefault({}),
  display: z
    .object({
      theme: z.enum(THEMES).default('midnight'),
      language: z.enum(LANGUAGES).default('tr'),
      hour12: z.boolean().default(false),
      showSeconds: z.boolean().default(false),
      panelIntervalSec: z.int().min(15).max(600).default(60),
      screensaverMode: z.enum(SCREENSAVER_MODES).default('panels'),
      pattern: z.boolean().default(true),
      glass: z.boolean().default(false),
      nightDim: z
        .object({
          enabled: z.boolean().default(true),
          afterIshaMin: z.int().min(0).max(240).default(60),
          beforeFajrMin: z.int().min(0).max(240).default(30),
          opacity: z.number().min(0).max(1).default(0.7),
        })
        .prefault({}),
    })
    .prefault({}),
  /** IndexedDB keys of uploaded photos, in display order. */
  photos: z
    .array(z.string().regex(/^[A-Za-z0-9_-]+$/))
    .max(200)
    .default([]),
  /** Optional 4-digit settings PIN. */
  pin: z
    .string()
    .regex(/^\d{4}$/)
    .nullable()
    .default(null),
});

export type Settings = z.infer<typeof settingsSchema>;
