// The app re-renders every second on an A8 iPad: a steady-state tick must not
// rewrite attributes whose values did not change (each write invalidates style
// and is recorded by every MutationObserver). Only the progress ring moves.
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/config/defaults';
import { computeDay } from '../../src/core/prayerTimes';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const calc = { ...defaultSettings.calc, method: 'NorthAmerica' as const };
const t = computeDay('2026-05-10', SCHAUMBURG, calc);

describe('steady-state render writes', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it.each([
    ['clock screen', 0],
    ['inside the pre-alert window', 1],
  ])('%s: a tick only updates the ring, never re-sets unchanged attributes', async (_name, pre) => {
    // Mid-afternoon, 20 s into a minute; the pre-alert case is 5 min before Asr.
    const base = pre
      ? t.asr.getTime() - 5 * 60_000 + 20_000
      : t.dhuhr.getTime() + 2 * 3_600_000 + 20_000;
    m = mountApp({ start: new Date(base) });
    await m.app.tapStart();
    m.clock.advanceBy(1000);
    await flush();
    const changed: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') {
          changed.push(`${(r.target as Element).className.toString()} [${r.attributeName}]`);
        }
      }
    });
    observer.observe(m.root, { attributes: true, subtree: true });
    for (let i = 0; i < 5; i++) m.clock.advanceBy(1000);
    await flush();
    observer.disconnect();
    expect(changed.filter((c) => !c.endsWith('[stroke-dashoffset]'))).toEqual([]);
  });
});
