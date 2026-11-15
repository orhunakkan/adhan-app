import type { MediaEvent, MediaPlayer } from '../core/ports';

/**
 * MediaPlayer over one HTMLAudioElement. The app creates exactly one, in the
 * Start tap handler, and reuses it for every azan (iOS unlock rule, brief §7).
 */
export function createAudioElementPlayer(doc: Document): MediaPlayer {
  const el = doc.createElement('audio');
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  doc.body.append(el);
  return {
    setSrc(url) {
      el.src = url;
    },
    get src() {
      return el.getAttribute('src') ?? '';
    },
    play: () => el.play(),
    pause: () => el.pause(),
    on(event: MediaEvent, fn: () => void) {
      el.addEventListener(event, fn);
      return () => el.removeEventListener(event, fn);
    },
    get currentTime() {
      return el.currentTime;
    },
    get duration() {
      return el.duration;
    },
    get paused() {
      return el.paused;
    },
  };
}
