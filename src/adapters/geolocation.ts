import type { GeolocationPort } from '../core/ports';

export function createBrowserGeolocation(nav: Navigator): GeolocationPort {
  return {
    getPosition: () =>
      new Promise((resolve, reject) => {
        if (!('geolocation' in nav)) {
          reject(new Error('Geolocation unavailable'));
          return;
        }
        nav.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          (e) => reject(new Error(e.message)),
          { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
        );
      }),
  };
}
