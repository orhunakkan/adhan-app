// Ring-buffer logger persisted to the KeyValueStore; shown in the debug panel (brief §14).
import type { Clock, KeyValueStore } from './ports';
import { KEYS } from './storage';

export const LOG_CAPACITY = 100;

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  at: string;
  level: LogLevel;
  msg: string;
  data?: unknown;
}

export interface Logger {
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  entries(): readonly LogEntry[];
}

function isEntry(v: unknown): v is LogEntry {
  const e = v as LogEntry;
  return (
    typeof e === 'object' && e !== null && typeof e.at === 'string' && typeof e.msg === 'string'
  );
}

function restore(store: KeyValueStore): LogEntry[] {
  try {
    const raw: unknown = JSON.parse(store.get(KEYS.log) ?? '[]');
    return Array.isArray(raw) && raw.every(isEntry) ? raw.slice(-LOG_CAPACITY) : [];
  } catch {
    return [];
  }
}

function serialisable(data: unknown): unknown {
  try {
    JSON.stringify(data);
    return data;
  } catch {
    return '[unserialisable]';
  }
}

export function createLogger(store: KeyValueStore, clock: Clock): Logger {
  const buffer = restore(store);
  const write = (level: LogLevel, msg: string, data?: unknown) => {
    const entry: LogEntry = { at: clock.now().toISOString(), level, msg };
    if (data !== undefined) entry.data = serialisable(data);
    buffer.push(entry);
    if (buffer.length > LOG_CAPACITY) buffer.splice(0, buffer.length - LOG_CAPACITY);
    try {
      store.set(KEYS.log, JSON.stringify(buffer));
    } catch {
      // Logging must never throw into its caller (storage full or blocked).
    }
  };
  return {
    info: (msg, data) => write('info', msg, data),
    warn: (msg, data) => write('warn', msg, data),
    error: (msg, data) => write('error', msg, data),
    entries: () => buffer,
  };
}
