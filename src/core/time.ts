// Calendar-date and time-zone helpers. Every function takes the IANA zone
// explicitly; nothing relies on the device's time zone (brief §5).

/** A calendar date as 'YYYY-MM-DD'. */
export type DateKey = string;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    // Some engines format midnight as 24 even with h23.
    hour: out.hour! % 24,
    minute: out.minute!,
    second: out.second!,
  };
}

/** The calendar date at `date` in `tz`. */
export function dateKeyInZone(date: Date, tz: string): DateKey {
  const { year, month, day } = zonedParts(date, tz);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export interface TimeFormat {
  tz: string;
  hour12: boolean;
  seconds: boolean;
  /** BCP 47 tag, e.g. 'tr', 'en', 'ar-u-nu-arab'. */
  locale: string;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** Clock-style time in the configured zone (never the device zone). */
export function formatTime(date: Date, f: TimeFormat): string {
  const key = `${f.locale}|${f.tz}|${f.hour12}|${f.seconds}`;
  let fmt = timeFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(f.locale, {
      timeZone: f.tz,
      hour: f.hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      ...(f.seconds ? { second: '2-digit' as const } : {}),
      hourCycle: f.hour12 ? 'h12' : 'h23',
    });
    timeFormatters.set(key, fmt);
  }
  return fmt.format(date);
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Long Gregorian date with weekday in the configured zone. */
export function formatDate(date: Date, f: { tz: string; locale: string }): string {
  const key = `${f.locale}|${f.tz}`;
  let fmt = dateFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(f.locale, {
      timeZone: f.tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    dateFormatters.set(key, fmt);
  }
  return fmt.format(date);
}

export interface TimeParts {
  /** "14:05" / "2:05" (localised digits). */
  hm: string;
  /** "09" or "" when seconds are off. */
  seconds: string;
  /** "PM" / "ÖS" in 12-hour mode, otherwise "". */
  dayPeriod: string;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

/** The clock split into parts so the view can style seconds and AM/PM separately. */
export function timeParts(date: Date, f: TimeFormat): TimeParts {
  const key = `${f.locale}|${f.tz}|${f.hour12}`;
  let fmt = partFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(f.locale, {
      timeZone: f.tz,
      hour: f.hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: f.hour12 ? 'h12' : 'h23',
    });
    partFormatters.set(key, fmt);
  }
  const parts = fmt.formatToParts(date);
  const value = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)!.value;
  // Hour, the locale's separator and minute, exactly as the locale writes them.
  const hm = parts
    .slice(
      parts.findIndex((p) => p.type === 'hour'),
      parts.findIndex((p) => p.type === 'minute') + 1,
    )
    .map((p) => p.value)
    .join('');
  return {
    hm,
    seconds: f.seconds ? value('second') : '',
    dayPeriod: f.hour12 ? value('dayPeriod') : '',
  };
}
