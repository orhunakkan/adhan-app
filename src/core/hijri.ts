// Hijri date via Intl (brief §5, §13.3): islamic-umalqura → islamic → hidden.

export type HijriCalendar = 'islamic-umalqura' | 'islamic';

const PREFERRED: readonly HijriCalendar[] = ['islamic-umalqura', 'islamic'];

/** The best Islamic calendar the engine supports, or null if none. */
export function hijriCalendar(
  DTF: typeof Intl.DateTimeFormat = Intl.DateTimeFormat,
): HijriCalendar | null {
  for (const calendar of PREFERRED) {
    try {
      if (new DTF('en', { calendar }).resolvedOptions().calendar === calendar) return calendar;
    } catch {
      return null;
    }
  }
  return null;
}

/** "28 Cemaziyelevvel 1448" (day month year, no era), or null when unsupported. */
export function formatHijri(
  date: Date,
  f: { tz: string; locale: string },
  DTF: typeof Intl.DateTimeFormat = Intl.DateTimeFormat,
): string | null {
  const calendar = hijriCalendar(DTF);
  if (!calendar) return null;
  const parts = new DTF(f.locale, {
    calendar,
    timeZone: f.tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(date);
  const values = (['day', 'month', 'year'] as const).map(
    (type) => parts.find((p) => p.type === type)?.value,
  );
  // An engine that can't produce all three parts gets the date hidden, not half-rendered.
  return values.every(Boolean) ? values.join(' ') : null;
}
