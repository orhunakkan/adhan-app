import { describe, expect, it } from 'vitest';
import { loadPrayerFixtures } from '../helpers/prayerFixtures';

const fixtures = loadPrayerFixtures();

describe('prayer reference fixtures', () => {
  it('covers İstanbul (Diyanet) and Oslo under every high-latitude rule', () => {
    const keys = fixtures.map(
      ({ fixture: f }) => `${f.location.name}|${f.method}|${f.highLatitudeRule}`,
    );
    expect(new Set(keys)).toEqual(
      new Set([
        'İstanbul|Turkey|MiddleOfTheNight',
        'Oslo|MuslimWorldLeague|MiddleOfTheNight',
        'Oslo|MuslimWorldLeague|SeventhOfTheNight',
        'Oslo|MuslimWorldLeague|TwilightAngle',
      ]),
    );
  });

  it.each(fixtures)('$file records its source and has unique consecutive dates', ({ fixture }) => {
    expect(fixture.source).not.toBe('');
    const dates = fixture.days.map((d) => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });
});
