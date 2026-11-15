// About (brief §9): version (more in task 28).
import { group } from './controls';
import type { SettingsSection } from './shell';
import { h } from '../dom';

export const aboutSection: SettingsSection = {
  id: 'about',
  render(pane) {
    const g = group();
    g.body.append(h('p', 'row', `v${__APP_VERSION__}`));
    pane.append(g.el);
  },
};
