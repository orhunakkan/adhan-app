import { afterEach, describe, expect, it } from 'vitest';
import { mountDiagnostics } from '../../src/ui/diagnostics';

describe('?diag panel', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows the layers, the Start button, touches and uncaught errors, outside #app', () => {
    const app = document.createElement('div');
    app.id = 'app';
    const main = document.createElement('div');
    main.className = 'app-main';
    main.inert = true;
    const layer = document.createElement('div');
    layer.className = 'overlay-layer';
    const button = document.createElement('button');
    button.className = 'start-button touch-target';
    layer.append(button);
    app.append(main, layer);
    document.body.append(app);

    const diag = mountDiagnostics(document, window);
    main.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'TypeError: x is not a function' }));
    diag.record('start failed: boom');
    diag.update();

    const panel = document.querySelector<HTMLElement>('.diag')!;
    expect(panel.closest('#app')).toBeNull();
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    const text = panel.textContent;
    expect(text).toContain('div.app-main [in inert] inert=true');
    expect(text).toContain('div.overlay-layer inert=false');
    expect(text).toContain('start-button ');
    expect(text).toContain('pointerdown → div.app-main [in inert]');
    expect(text).toContain('TypeError: x is not a function');
    expect(text).toContain('start failed: boom');
  });

  it('says when the Start button is missing and when there are no errors', () => {
    const diag = mountDiagnostics(document, window);
    diag.update();
    const text = document.querySelector('.diag')!.textContent;
    expect(text).toContain('start-button: not in the page');
    expect(text).toContain('(none)');
  });
});
