import { describe, expect, it } from 'vitest';
import { loadPrayerFixtures } from '../helpers/prayerFixtures';

const fixtures = loadPrayerFixtures();

describe('prayer reference fixtures', () => {
  it('covers every location, method and high-latitude rule the spec requires', () => {
    const keys = fixtures.map(
      ({ fixture: f }) => `${f.location.name}|${f.method}|${f.highLatitudeRule}`,
    );
    expect(new Set(keys)).toEqual(
      new Set([
        'Schaumburg, IL|NorthAmerica|MiddleOfTheNight',
        'Schaumburg, IL|Turkey|MiddleOfTheNight',
        'İstanbul|Turkey|MiddleOfTheNight',
        'Oslo|MuslimWorldLeague|MiddleOfTheNight',
        'Oslo|MuslimWorldLeague|SeventhOfTheNight',
        'Oslo|MuslimWorldLeague|TwilightAngle',
      ]),
    );
  });

  it('includes a winter and a summer month for Schaumburg', () => {
    const months = fixtures
      .filter(({ fixture }) => fixture.location.name === 'Schaumburg, IL')
      .map(({ fixture }) => fixture.days[0]!.date.slice(5, 7));
    expect(new Set(months)).toEqual(new Set(['01', '07']));
  });

  it.each(fixtures)('$file records its source and has unique consecutive dates', ({ fixture }) => {
    expect(fixture.source).not.toBe('');
    const dates = fixture.days.map((d) => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });
});
