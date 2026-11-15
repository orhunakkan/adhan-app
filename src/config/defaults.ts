import { settingsSchema, type Settings } from './schema';

/** Neutral defaults: no location (the first run asks for one), no PIN. */
export const defaultSettings: Settings = settingsSchema.parse({});
