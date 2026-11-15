import { afterEach, describe, expect, it } from 'vitest';
import { SILENCE_URL } from '../../src/core/audio';
import { AZAN_PRAYERS, computeDay } from '../../src/core/prayerTimes';
import { SCHAUMBURG } from '../helpers/days';
import { mountApp, type Mounted } from '../helpers/mountApp';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('a full day through the integration harness', () => {
  let m: Mounted | undefined;
  afterEach(() => m?.dispose());

  it('plays all 5 azans through one player with the makam mapping, health-checking each', async () => {
    m = mountApp({ start: new Date('2026-05-10T05:00:00Z') }); // 00:00 CDT
    await m.app.tapStart();
    const t = computeDay('2026-05-10', SCHAUMBURG, m.app.state().settings.calc);
    const played: string[] = [];
    for (const p of AZAN_PRAYERS) {
      await m.clock.advanceToAsync(new Date(t[p].getTime() + 1000));
      await flush();
      expect(m.app.state().azan?.prayer).toBe(p);
      played.push(m.player!.src);
      m.player!.finish();
      await flush();
      expect(m.app.state().azan).toBeNull();
    }
    expect(played).toEqual([
      '/audio/saba-sabah.m4a',
      '/audio/ussak.m4a',
      '/audio/rast.m4a',
      '/audio/segah.m4a',
      '/audio/hicaz.m4a',
    ]);
    expect(m.players).toHaveLength(1);
    // unlock + one health check per prayer
    expect(m.player!.sources.filter((s) => s === SILENCE_URL)).toHaveLength(1 + 5);
    expect(m.app.log.entries().filter((e) => e.msg === 'azan')).toHaveLength(5);
  });
});
