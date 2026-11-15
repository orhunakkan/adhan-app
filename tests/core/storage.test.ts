import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { SETTINGS_VERSION, settingsSchema } from '../../src/config/schema';
import { KEYS, loadSettings, migrateSettings, saveSettings } from '../../src/core/storage';
import { MemoryStore } from '../helpers/memoryStore';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'settings');

describe('defaults', () => {
  it('are valid, versioned and contain no location or PIN (public repo)', () => {
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
    expect(defaultSettings.settingsVersion).toBe(SETTINGS_VERSION);
    expect(defaultSettings.location).toBeNull();
    expect(defaultSettings.pin).toBeNull();
    expect(defaultSettings).not.toHaveProperty('photos');
  });

  it('use the Turkish makam mapping with a separate Fajr file and dark theme', () => {
    expect(defaultSettings.azan.audio).toEqual({
      fajr: 'bundled:saba-sabah',
      dhuhr: 'bundled:ussak',
      asr: 'bundled:rast',
      maghrib: 'bundled:segah',
      isha: 'bundled:hicaz',
    });
    expect(defaultSettings.display.theme).toBe('midnight');
    expect(defaultSettings.azan.lateWindowSec).toBe(120);
    expect(defaultSettings.azan.preAlertMin).toBe(10);
    expect(defaultSettings.display.nightDim.opacity).toBe(0.7);
  });
});

describe('loadSettings / saveSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(new MemoryStore())).toEqual(defaultSettings);
  });

  it('round-trips', () => {
    const store = new MemoryStore();
    const s = settingsSchema.parse(JSON.parse(readFileSync(join(FIXTURES, 'v1.json'), 'utf8')));
    saveSettings(store, s);
    expect(loadSettings(store)).toEqual(s);
  });

  it('falls back to defaults and logs on corrupt JSON', () => {
    const onError = vi.fn();
    const store = new MemoryStore({ [KEYS.settings]: '{"settingsVersion":1,' });
    expect(loadSettings(store, onError)).toEqual(defaultSettings);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/corrupt/i), expect.anything());
  });

  it('works without an error callback', () => {
    const store = new MemoryStore({ [KEYS.settings]: 'not json' });
    expect(loadSettings(store)).toEqual(defaultSettings);
  });

  it('falls back to defaults and logs when stored values are invalid', () => {
    const onError = vi.fn();
    const bad = { ...defaultSettings, display: { ...defaultSettings.display, theme: 'neon' } };
    const store = new MemoryStore({ [KEYS.settings]: JSON.stringify(bad) });
    expect(loadSettings(store, onError)).toEqual(defaultSettings);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/invalid/i), expect.anything());
  });

  it('keeps the valid sections (location, offsets, PIN) and resets only the broken one', () => {
    const onError = vi.fn();
    const location = { name: 'Test', lat: 41.01, lng: 28.97, tz: 'Europe/Istanbul' };
    const calc = { ...defaultSettings.calc, method: 'MuslimWorldLeague' as const };
    const bad = {
      ...defaultSettings,
      location,
      calc: { ...calc, offsets: { ...calc.offsets, asr: 2 } },
      pin: '4821',
      display: { ...defaultSettings.display, theme: 'neon' },
    };
    const store = new MemoryStore({ [KEYS.settings]: JSON.stringify(bad) });
    const s = loadSettings(store, onError);
    expect(s.location).toEqual(location);
    expect(s.calc.method).toBe('MuslimWorldLeague');
    expect(s.calc.offsets.asr).toBe(2);
    expect(s.pin).toBe('4821');
    expect(s.display).toEqual(defaultSettings.display);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      'Invalid settings; reset display to defaults',
      expect.anything(),
    );
  });

  it('falls back to defaults for a settingsVersion from the future', () => {
    const onError = vi.fn();
    const store = new MemoryStore({ [KEYS.settings]: JSON.stringify({ settingsVersion: 99 }) });
    expect(loadSettings(store, onError)).toEqual(defaultSettings);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/version/i), expect.anything());
  });

  it('fills fields added within a version from defaults', () => {
    const partial = { settingsVersion: SETTINGS_VERSION, display: { theme: 'sand' } };
    const store = new MemoryStore({ [KEYS.settings]: JSON.stringify(partial) });
    const s = loadSettings(store);
    expect(s.display.theme).toBe('sand');
    expect(s.display.language).toBe(defaultSettings.display.language);
    expect(s.azan).toEqual(defaultSettings.azan);
  });

  it('loads settings stored before the screensaver was removed (ADR-0007), keeping every other value', () => {
    // A real pre-removal object: photos, display.screensaverMode and display.panelIntervalSec.
    const raw = JSON.parse(readFileSync(join(FIXTURES, 'v1.json'), 'utf8')) as Record<
      string,
      unknown
    > & { display: Record<string, unknown> };
    expect(raw.photos).toEqual(['p1', 'p2']);
    expect(raw.display.screensaverMode).toBe('alternate');
    expect(raw.display.panelIntervalSec).toBe(60);
    const store = new MemoryStore({ [KEYS.settings]: JSON.stringify(raw) });
    const onError = vi.fn();
    const s = loadSettings(store, onError);
    expect(onError).not.toHaveBeenCalled();
    expect(s.settingsVersion).toBe(SETTINGS_VERSION);
    expect(s.location).toEqual(raw.location);
    expect(s.pin).toBe('4821');
    expect(s.calc).toEqual(raw.calc);
    expect(s.azan).toEqual(raw.azan);
    expect(s.display.theme).toBe('emerald');
    expect(s.display.showSeconds).toBe(true);
    expect(s.display.nightDim).toEqual(raw.display.nightDim);
    // The removed keys are dropped, and the next save no longer writes them.
    expect(s).not.toHaveProperty('photos');
    expect(s.display).not.toHaveProperty('screensaverMode');
    expect(s.display).not.toHaveProperty('panelIntervalSec');
    saveSettings(store, s);
    const saved = JSON.parse(store.get(KEYS.settings)!) as Record<string, unknown>;
    expect(saved).not.toHaveProperty('photos');
    expect(saved.display).not.toHaveProperty('screensaverMode');
    expect(loadSettings(store)).toEqual(s);
  });

  it('refuses to save invalid settings', () => {
    const store = new MemoryStore();
    const bad = { ...defaultSettings, pin: '12' };
    expect(() => saveSettings(store, bad)).toThrow();
    expect(store.get(KEYS.settings)).toBeNull();
  });
});

describe('migrations', () => {
  const fixtures = readdirSync(FIXTURES).filter((f) => /^v\d+\.json$/.test(f));

  it('has a fixture for every settings version up to the current one', () => {
    const versions = fixtures.map((f) => Number(f.slice(1, -5))).sort((a, b) => a - b);
    expect(versions).toEqual(Array.from({ length: SETTINGS_VERSION }, (_, i) => i + 1));
  });

  it.each(fixtures)('migrates %s to the current version without losing data', (file) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as {
      settingsVersion: number;
    };
    const store = new MemoryStore({ [KEYS.settings]: JSON.stringify(raw) });
    const onError = vi.fn();
    const s = loadSettings(store, onError);
    expect(onError).not.toHaveBeenCalled();
    expect(s.settingsVersion).toBe(SETTINGS_VERSION);
    expect(s).not.toEqual(defaultSettings);
  });
});

describe('migrateSettings', () => {
  const migrations = {
    1: (raw: Record<string, unknown>) => ({ ...raw, renamed: raw.old }),
    2: (raw: Record<string, unknown>) => ({ ...raw, added: true }),
  };

  it('applies each step in order up to the target version', () => {
    expect(migrateSettings({ settingsVersion: 1, old: 'x' }, migrations, 3)).toEqual({
      settingsVersion: 3,
      old: 'x',
      renamed: 'x',
      added: true,
    });
  });

  it('returns null when a step is missing', () => {
    expect(migrateSettings({ settingsVersion: 0 }, migrations, 3)).toBeNull();
  });

  it('treats a missing version as current', () => {
    expect(migrateSettings({ a: 1 }, migrations, 3)).toEqual({ a: 1 });
  });
});

describe('loadSettings with non-object JSON', () => {
  it.each(['[]', '42', 'null', '"text"'])('falls back to defaults for %s', (text) => {
    const onError = vi.fn();
    expect(loadSettings(new MemoryStore({ [KEYS.settings]: text }), onError)).toEqual(
      defaultSettings,
    );
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('settingsSchema validation', () => {
  const base = defaultSettings;
  it.each([
    ['latitude out of range', { location: { name: 'x', lat: 91, lng: 0, tz: 'UTC' } }],
    ['unknown time zone', { location: { name: 'x', lat: 0, lng: 0, tz: 'Mars/Olympus' } }],
    ['offset beyond 30', { calc: { ...base.calc, offsets: { ...base.calc.offsets, isha: 31 } } }],
    [
      'non-integer offset',
      { calc: { ...base.calc, offsets: { ...base.calc.offsets, isha: 1.5 } } },
    ],
    ['3-digit PIN', { pin: '123' }],
    ['non-numeric PIN', { pin: '12a4' }],
    [
      'opacity above 1',
      { display: { ...base.display, nightDim: { ...base.display.nightDim, opacity: 1.2 } } },
    ],
    [
      'unknown audio source',
      { azan: { ...base.azan, audio: { ...base.azan.audio, asr: 'http://evil' } } },
    ],
    ['late window below 30 s', { azan: { ...base.azan, lateWindowSec: 10 } }],
  ])('rejects %s', (_name, patch) => {
    expect(settingsSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });

  it('accepts a valid manual location', () => {
    const s = {
      ...base,
      location: { name: 'İstanbul', lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' },
    };
    expect(settingsSchema.safeParse(s).success).toBe(true);
  });
});
