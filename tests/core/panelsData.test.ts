import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLOCK_FOCUS_MS, parsePanels, screensaverSlot, shuffle } from '../../src/core/panels';
import { daysAround, MIN, plus } from '../helpers/days';
import { seededRng } from '../helpers/seededRng';

const FILE = join(import.meta.dirname, '..', '..', 'public', 'panels', 'panels.json');
const panels = parsePanels(JSON.parse(readFileSync(FILE, 'utf8')));

describe('panels.json', () => {
  it('has 10–20 valid placeholder panels with sources and unique ids', () => {
    expect(panels.length).toBeGreaterThanOrEqual(10);
    expect(panels.length).toBeLessThanOrEqual(20);
    expect(panels.every((p) => p.id.startsWith('placeholder-'))).toBe(true);
    expect(panels.every((p) => p.source && /Pickthall \(1930\)/.test(p.source))).toBe(true);
  });

  it('keeps lines readable (≤ 600 characters, translation for Arabic panels)', () => {
    for (const p of panels) if (p.lang === 'ar') expect(p.translation, p.id).toBeTruthy();
  });

  it('rejects duplicate ids and bad image paths', () => {
    const dup = [panels[0], panels[0]];
    expect(() => parsePanels(dup)).toThrow(/Duplicate/);
    expect(() => parsePanels([{ ...panels[0], image: 'http://x/y.jpg' }])).toThrow();
  });
});

describe('shuffle', () => {
  it('is a deterministic permutation for a seed', () => {
    const a = shuffle(panels, seededRng(3)).map((p) => p.id);
    const b = shuffle(panels, seededRng(3)).map((p) => p.id);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(panels.map((p) => p.id).sort());
    expect(a).not.toEqual(panels.map((p) => p.id));
  });
});

describe('screensaverSlot', () => {
  const days = daysAround('2026-05-10');
  const interval = 60_000;
  // A time far from any prayer (between Dhuhr+10 min and Asr−10 min), aligned to a 3-slot cycle.
  const quiet = new Date(
    Math.ceil((days.today.dhuhr.getTime() + 30 * MIN) / (3 * interval)) * 3 * interval,
  );

  it('shows two clock intervals then one slide, with a growing index', () => {
    const at = (i: number) =>
      screensaverSlot({
        now: plus(quiet, i * interval),
        intervalMs: interval,
        days,
        suppressed: false,
      });
    expect([at(0), at(1)].map((s) => s.kind)).toEqual(['clock', 'clock']);
    const s2 = at(2);
    const s5 = at(5);
    expect(s2.kind).toBe('slide');
    expect(s5.kind).toBe('slide');
    expect(s5.kind === 'slide' && s2.kind === 'slide' && s5.index - s2.index).toBe(1);
  });

  it('keeps the clock within 10 minutes of an azan prayer, when suppressed, or without times', () => {
    // Every minute across the whole ±10 min window around Asr.
    for (let off = -CLOCK_FOCUS_MS; off <= CLOCK_FOCUS_MS; off += interval) {
      const now = plus(days.today.asr, off);
      expect(screensaverSlot({ now, intervalMs: interval, days, suppressed: false }).kind).toBe(
        'clock',
      );
    }
    expect(
      screensaverSlot({
        now: plus(quiet, 2 * interval),
        intervalMs: interval,
        days,
        suppressed: true,
      }).kind,
    ).toBe('clock');
    expect(
      screensaverSlot({ now: quiet, intervalMs: interval, days: null, suppressed: false }).kind,
    ).toBe('clock');
  });
});
