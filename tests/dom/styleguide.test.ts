import { describe, expect, it } from 'vitest';
import { PRAYERS } from '../../src/core/prayerTimes';
import { THEME_NAMES } from '../../src/design/tokens';
import { mountStyleguide, registerSample } from '../../src/ui/styleguide';

describe('styleguide', () => {
  it('renders every theme with every period gradient, base components and registered samples', () => {
    registerSample({ title: 'Sample', render: (host, theme) => host.append(theme) });
    const root = document.createElement('div');
    document.body.append(root);
    mountStyleguide(root);
    const sections = [...root.querySelectorAll<HTMLElement>('.sg-theme')];
    expect(sections.map((s) => s.dataset.theme)).toEqual([...THEME_NAMES]);
    for (const s of sections) {
      expect(
        [...s.querySelectorAll<HTMLElement>('.sg-period')].map((p) => p.dataset.period),
      ).toEqual([...PRAYERS]);
      expect(s.querySelector('.start-button--danger')).not.toBeNull();
      expect(s.style.getPropertyValue('--bg-1')).not.toBe('');
      expect(s.querySelector('.sg-sample')!.textContent).toContain(s.dataset.theme);
    }
  });
});
