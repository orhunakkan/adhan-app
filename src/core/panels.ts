// Reflection panels (brief §9): validated content plus a pure screensaver
// schedule. The shipped set is placeholders (Pickthall 1930, public domain).
import { z } from 'zod';
import type { ThreeDays } from './period';
import { AZAN_PRAYERS } from './prayerTimes';
import type { Rng } from './ports';

export const panelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  lang: z.enum(['tr', 'en', 'ar']),
  text: z.string().trim().min(1).max(600),
  translation: z.string().trim().min(1).max(600).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  image: z
    .string()
    .regex(/^\/panels\/[a-z0-9-]+\.(webp|jpg|png)$/)
    .optional(),
});
export const panelsSchema = z
  .array(panelSchema)
  .min(1)
  .refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length, 'Duplicate panel id');

export type Panel = z.infer<typeof panelSchema>;

export function parsePanels(json: unknown): Panel[] {
  return panelsSchema.parse(json);
}

/** Fisher–Yates with the injected RNG (deterministic in tests). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The clock stays full-size from this long before until this long after each azan prayer. */
export const CLOCK_FOCUS_MS = 10 * 60_000;

export type Slot = { kind: 'clock' } | { kind: 'slide'; index: number };

/**
 * Screensaver rhythm: two intervals of clock, then one slide, repeating
 * (epoch-based, so it needs no timers and survives reloads). Suppressed near
 * prayers so the clock and next prayer are large when they matter.
 */
export function screensaverSlot(input: {
  now: Date;
  intervalMs: number;
  days: ThreeDays | null;
  suppressed: boolean;
}): Slot {
  if (input.suppressed || !input.days) return { kind: 'clock' };
  const t = input.now.getTime();
  for (const d of [input.days.yesterday, input.days.today, input.days.tomorrow]) {
    for (const p of AZAN_PRAYERS) {
      if (Math.abs(d[p].getTime() - t) <= CLOCK_FOCUS_MS) return { kind: 'clock' };
    }
  }
  const slot = Math.floor(t / input.intervalMs);
  return slot % 3 === 2 ? { kind: 'slide', index: Math.floor(slot / 3) } : { kind: 'clock' };
}
