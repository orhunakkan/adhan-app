import { describe, expect, it } from 'vitest';
import { createBrowserGeolocation } from '../../src/adapters/geolocation';

describe('createBrowserGeolocation', () => {
  it('resolves the coordinates', async () => {
    const nav = {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 41, longitude: 29 } } as GeolocationPosition),
      },
    } as unknown as Navigator;
    await expect(createBrowserGeolocation(nav).getPosition()).resolves.toEqual({
      lat: 41,
      lng: 29,
    });
  });

  it('rejects on error or when unavailable', async () => {
    const denied = {
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({ message: 'denied' } as GeolocationPositionError),
      },
    } as unknown as Navigator;
    await expect(createBrowserGeolocation(denied).getPosition()).rejects.toThrow('denied');
    await expect(createBrowserGeolocation({} as Navigator).getPosition()).rejects.toThrow(
      /unavailable/,
    );
  });
});
