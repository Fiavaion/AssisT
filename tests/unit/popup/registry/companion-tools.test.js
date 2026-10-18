/**
 * @jest-environment jsdom
 *
 * Every companion feature must have a switch in Flat.
 *
 * The companion switches used to be built by popup.js at runtime, inside the accordion, and the
 * registry left them out because the drift test cannot see markup that is not in popup.html. When
 * Flat became the only popup, that made all nine unreachable: a student could not switch any of
 * them on or off. These checks hold COMPANION_FEATURES itself to the registry and to the markup, so
 * a feature added to that list without a switch fails here rather than shipping unreachable.
 */

import fs from 'fs';
import path from 'path';

import {
  COMPANION_FEATURES,
  COMPANION_STORAGE_KEY,
} from '../../../../src/features/companion/companion-settings.js';
import { READING_LEVELS } from '../../../../src/features/companion/reading-level.js';
import { TOOLS } from '../../../../src/popup/registry/tool-registry.js';
import { renderedId } from '../../../../src/popup/registry/control-renderer.js';
import { createControlFinder, mountFlat } from '../../../../src/popup/flat/flat-mount.js';

const POPUP_HTML = fs.readFileSync(
  path.join(__dirname, '../../../../src/popup/popup.html'),
  'utf8'
);

const toolFor = key => TOOLS.find(tool => tool.toggleId === `companion-${key}`);

describe('companion features in the registry', () => {
  it.each(COMPANION_FEATURES.map(feature => [feature.key, feature]))(
    '%s has a tool with its own switch',
    (key, feature) => {
      const tool = toolFor(key);
      expect(tool).toBeDefined();
      expect(tool.name).toBe(feature.label);
      expect(tool.description).toBe(feature.description);
      expect(tool.state).toEqual({
        store: 'local',
        path: `${COMPANION_STORAGE_KEY}.${key}`,
        default: true,
      });
    }
  );

  it('never tells a student a feature is a preview', () => {
    const companion = COMPANION_FEATURES.map(feature => toolFor(feature.key)).filter(Boolean);
    expect(companion).toHaveLength(COMPANION_FEATURES.length);
    companion.forEach(tool => {
      expect(`${tool.name} ${tool.description}`).not.toMatch(/preview/i);
    });
  });

  it('puts the reading-level dial under the summary reading level switch', () => {
    const dial = toolFor('summaryDial').controls.find(c => c.id === 'companion-reading-level');
    expect(dial).toMatchObject({ type: 'select', store: 'local', path: 'companionReadingLevel' });
    expect(dial.options.map(option => option.value)).toEqual(READING_LEVELS.map(l => l.id));
  });
});

describe('companion switches in popup.html', () => {
  it.each(COMPANION_FEATURES.map(feature => [feature.key]))(
    '%s has a checkbox in the markup, not one built at runtime',
    key => {
      expect(POPUP_HTML).toMatch(new RegExp(`<input[^>]*\\sid="companion-${key}"[^>]*>`));
    }
  );
});

describe('companion switches in Flat', () => {
  function setup() {
    document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
    const popup = document.querySelector('.popup-container');
    const container = document.createElement('div');
    container.id = 'flat-root';
    popup.insertBefore(container, document.querySelector('.popup-main'));
    const find = createControlFinder({ root: popup, exclude: '#flat-root' });
    return { container, find };
  }

  beforeEach(() => {
    window.matchMedia =
      window.matchMedia ||
      (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });

  it('draws a switch for every companion feature, showing the accordion state', () => {
    const { container, find } = setup();
    find('[id="companion-flashcards"]').checked = false;
    COMPANION_FEATURES.filter(f => f.key !== 'flashcards').forEach(f => {
      find(`[id="companion-${f.key}"]`).checked = true;
    });
    mountFlat({ container, find, getSettings: () => ({}) });

    COMPANION_FEATURES.forEach(feature => {
      const tool = toolFor(feature.key);
      const flatSwitch = container.querySelector(`[id="${renderedId(tool.id)}"]`);
      expect(flatSwitch).not.toBeNull();
      expect(flatSwitch.checked).toBe(feature.key !== 'flashcards');
    });
  });

  it('offers Start lecture captions under the lecture switch while it is on, not while it is off', () => {
    const { container, find } = setup();
    const real = find('[id="companion-lecture"]');
    real.checked = true;
    const flat = mountFlat({ container, find, getSettings: () => ({}) });
    const launcher = () =>
      container.querySelector(`[id="${renderedId('btn-open-lecture-notes')}"]`);

    expect(launcher()).not.toBeNull();
    expect(launcher().textContent).toBe('Start lecture captions');

    real.checked = false;
    flat.refresh();
    expect(launcher()).toBeNull();
  });

  it('presses the accordion launcher, whose handler talks to the page', () => {
    const { container, find } = setup();
    find('[id="companion-lecture"]').checked = true;
    const real = find('[id="btn-open-lecture-notes"]');
    const pressed = jest.fn();
    real.addEventListener('mousedown', pressed);
    mountFlat({ container, find, getSettings: () => ({}) });

    container
      .querySelector(`[id="${renderedId('btn-open-lecture-notes')}"]`)
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(pressed).toHaveBeenCalled();
  });

  it('shows what the launcher reports, as a live status line', () => {
    const { container, find } = setup();
    find('[id="companion-lecture"]').checked = true;
    mountFlat({ container, find, getSettings: () => ({}) });

    const mirror = container.querySelector('[data-mirrors="lecture-launch-status"]');
    expect(mirror).not.toBeNull();
    expect(find('[id="lecture-launch-status"]').getAttribute('role')).toBe('status');
  });

  it('drives the accordion checkbox, whose handler stores the change', () => {
    const { container, find } = setup();
    const real = find('[id="companion-lecture"]');
    real.checked = true;
    const heard = [];
    real.addEventListener('change', () => heard.push(real.checked));
    mountFlat({ container, find, getSettings: () => ({}) });

    const flatSwitch = container.querySelector(`[id="${renderedId(toolFor('lecture').id)}"]`);
    flatSwitch.checked = false;
    flatSwitch.dispatchEvent(new Event('change', { bubbles: true }));

    expect(real.checked).toBe(false);
    expect(heard).toEqual([false]);
  });
});
