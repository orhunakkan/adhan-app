// Setup for the `dom` (happy-dom) project. Installs the browser pieces the app
// touches that happy-dom does not provide, or provides in a way we must control.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetMediaQueries, stubMatchMedia } from '../helpers/matchMedia';
import { resetObjectUrls, stubObjectUrls } from '../helpers/objectUrls';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  stubObjectUrls();
  stubMatchMedia();
  // The target iPad (iPadOS 15.8) has no Screen Wake Lock API: unsupported is the default.
  Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true });
});

afterEach(() => {
  resetMediaQueries();
  resetObjectUrls();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-period');
  document.documentElement.removeAttribute('dir');
  document.documentElement.className = '';
  localStorage.clear();
});
