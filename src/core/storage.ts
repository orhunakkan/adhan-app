// Settings persistence over the KeyValueStore port (brief §9, §13.3).
import { defaultSettings } from '../config/defaults';
import { SETTINGS_VERSION, settingsSchema, type Settings } from '../config/schema';
import type { KeyValueStore } from './ports';

export const KEYS = {
  settings: 'adhan.settings',
  lastFired: 'adhan.lastFired',
  log: 'adhan.log',
  reloads: 'adhan.reloads',
  wakeHintShown: 'adhan.wakeHintShown',
} as const;

export type OnStorageError = (message: string, detail: unknown) => void;

/**
 * Migrations from version N to N + 1, applied in order to the raw stored JSON.
 * Add one per settingsVersion bump, plus a tests/fixtures/settings/vN.json.
 */
export type Migrations = Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>;

const MIGRATIONS: Migrations = {};

/** Brings raw stored settings to SETTINGS_VERSION, or null if that is impossible. */
export function migrateSettings(
  raw: Record<string, unknown>,
  migrations: Migrations = MIGRATIONS,
  target: number = SETTINGS_VERSION,
): Record<string, unknown> | null {
  let version = typeof raw.settingsVersion === 'number' ? raw.settingsVersion : target;
  let out = raw;
  while (version < target) {
    const step = migrations[version];
    if (!step) return null;
    out = { ...step(out), settingsVersion: version + 1 };
    version += 1;
  }
  return version === target ? out : null;
}

export function loadSettings(store: KeyValueStore, onError: OnStorageError = () => {}): Settings {
  const text = store.get(KEYS.settings);
  if (text === null) return defaultSettings;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    onError('Corrupt settings JSON; using defaults', e);
    return defaultSettings;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    onError('Invalid settings (not an object); using defaults', raw);
    return defaultSettings;
  }
  const migrated = migrateSettings(raw as Record<string, unknown>);
  if (!migrated) {
    onError(
      'Unsupported settings version; using defaults',
      (raw as Record<string, unknown>).settingsVersion,
    );
    return defaultSettings;
  }
  const parsed = settingsSchema.safeParse(migrated);
  if (parsed.success) return parsed.data;
  return salvageSettings(migrated, parsed.error.issues, onError);
}

/**
 * Keeps every valid top-level section of otherwise-invalid settings and resets
 * only the broken ones, so one bad value (say a theme name from a newer build)
 * does not throw away the location, offsets and PIN.
 */
function salvageSettings(
  raw: Record<string, unknown>,
  issues: unknown,
  onError: OnStorageError,
): Settings {
  let kept: Record<string, unknown> = { ...defaultSettings };
  const reset: string[] = [];
  for (const key of Object.keys(defaultSettings)) {
    if (!(key in raw)) continue;
    const candidate = { ...kept, [key]: raw[key] };
    if (settingsSchema.safeParse(candidate).success) kept = candidate;
    else reset.push(key);
  }
  onError(`Invalid settings; reset ${reset.join(', ') || 'nothing'} to defaults`, issues);
  return settingsSchema.parse(kept);
}

/** Validates before writing; throws on invalid settings so the UI can reject the change. */
export function saveSettings(store: KeyValueStore, settings: Settings): Settings {
  const valid = settingsSchema.parse(settings);
  store.set(KEYS.settings, JSON.stringify(valid));
  return valid;
}
