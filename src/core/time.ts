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
