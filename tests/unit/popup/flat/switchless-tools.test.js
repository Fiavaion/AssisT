/**
 * @jest-environment jsdom
 *
 * A support that is not a yes-or-no must not be drawn as a switch.
 *
 * Overnight release testing pressed Flat's "AI Assist" switch with a real mouse: it slid across,
 * `aiMode` stayed "off", no key in storage changed, nothing opened, and reopening the popup showed
 * it off again. There is no checkbox anywhere in the popup for it to drive — AI Assist's state is
 * the `aiMode` key, and it has four values, not two. A control that lies about what it is and then
 * about what it did is worse than no control (SC 4.1.2).
 *
 * The last test here is the general rule rather than the one case: whatever the view draws as a
 * switch has to have a real switch behind it, in popup.html, for Flat to drive.
 */

import fs from 'fs';
import path from 'path';

import { createFlatView } from '../../../../src/popup/flat/flat-view.js';
import { createFlatModel } from '../../../../src/popup/flat/flat-model.js';
import { renderedId } from '../../../../src/popup/registry/control-renderer.js';
import { TOOLS, toolById } from '../../../../src/popup/registry/tool-registry.js';
import {
  createControlFinder,
  proxyOpen,
  mountFlat,
} from '../../../../src/popup/flat/flat-mount.js';

const POPUP_HTML = fs.readFileSync(
  path.join(__dirname, '../../../../src/popup/popup.html'),
  'utf8'
);

/** Mount the view over a model built from the state given. */
function mount({ local = {}, handlers = {} } = {}) {
  const model = createFlatModel({ settings: {}, local });
  const view = createFlatView({ model, valueOf: control => control.default, ...handlers });
  const container = document.createElement('div');
  document.body.appendChild(container);
  view.mount(container);
  return { model, view, container };
}

/** The whole popup with Flat's container where popup.js puts it. */
function popupWithFlat() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  const popup = document.querySelector('.popup-container');
  const container = document.createElement('div');
  container.id = 'flat-root';
  popup.insertBefore(container, document.querySelector('.popup-main'));
  return { popup, container, find: createControlFinder({ root: popup, exclude: '#flat-root' }) };
}

const aiRow = container => container.querySelector('[data-tool="ai"]');

beforeEach(() => {
  document.body.textContent = '';
  window.matchMedia =
    window.matchMedia ||
    (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

describe('the AI Assist row', () => {
  it('is not a switch', () => {
    const { container } = mount();
    expect(aiRow(container).querySelector('input[role="switch"]')).toBeNull();
  });

  it('says which mode is in use, in words', () => {
    const { container } = mount({ local: { aiMode: 'local' } });
    const button = aiRow(container).querySelector('.assist-flat__state');
    expect(button.textContent).toBe('Local');
    expect(button.getAttribute('aria-label')).toBe('AI Assist: Local. Choose how AI Assist works');
  });

  it('says Off when nothing has been chosen', () => {
    const { container } = mount();
    expect(aiRow(container).querySelector('.assist-flat__state').textContent).toBe('Off');
  });

  it('opens the chooser on a pointer press and on Enter', () => {
    const opened = [];
    const { container } = mount({ handlers: { onOpenTool: tool => opened.push(tool.id) } });
    const button = aiRow(container).querySelector('.assist-flat__state');

    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );

    expect(opened).toEqual(['ai', 'ai']);
  });

  it('counts as in use when a mode is chosen, so the filter can find it', () => {
    const { model } = mount({ local: { aiMode: 'cloud' } });
    expect(model.allRows().find(row => row.tool.id === 'ai').on).toBe(true);
  });
});

describe('opening the chooser in the popup', () => {
  it('presses Set up AI while the wizard has never been run', () => {
    const { find } = popupWithFlat();
    const cta = document.getElementById('btn-ai-setup-cta');
    cta.style.display = '';
    const pressed = [];
    cta.addEventListener('mousedown', () => pressed.push('cta'));
    document
      .getElementById('btn-ai-advanced')
      .addEventListener('mousedown', () => pressed.push('advanced'));

    expect(proxyOpen(find, toolById('ai'))).toBe(true);
    expect(pressed).toEqual(['cta']);
  });

  it('presses Advanced settings once the wizard has been dismissed', () => {
    const { find } = popupWithFlat();
    // popup.html ships the CTA hidden; setupAIAssist only shows it while `aiSetupDismissed` is unset.
    expect(document.getElementById('btn-ai-setup-cta').style.display).toBe('none');
    const pressed = [];
    document
      .getElementById('btn-ai-advanced')
      .addEventListener('mousedown', () => pressed.push('advanced'));

    expect(proxyOpen(find, toolById('ai'))).toBe(true);
    expect(pressed).toEqual(['advanced']);
  });

  it('is wired to the row the mount draws', () => {
    const { container, find } = popupWithFlat();
    const pressed = [];
    document
      .getElementById('btn-ai-advanced')
      .addEventListener('mousedown', () => pressed.push('advanced'));

    mountFlat({ container, find, getSettings: () => ({}), getAiMode: () => 'off' });
    container
      .querySelector('[data-tool="ai"] .assist-flat__state')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(pressed).toEqual(['advanced']);
  });
});

describe('every support the view draws as a switch', () => {
  it('has a switch in popup.html for Flat to drive', () => {
    const { container } = mount();
    // The switch that stands for a SUPPORT, not the switches inside a support's settings block —
    // those belong to declared controls and are held to popup.html by the drift test.
    const drawn = [...container.querySelectorAll('.assist-flat__switch input')].map(
      input => input.id
    );

    expect(drawn.length).toBeGreaterThan(20);
    drawn.forEach(id => {
      const tool = TOOLS.find(candidate => renderedId(candidate.id) === id);
      expect(tool).toBeDefined();
      expect(typeof tool.toggleId).toBe('string');
      expect(tool.toggleId).not.toBe('');
      expect(POPUP_HTML).toContain(`id="${tool.toggleId}"`);
    });
  });

  it('draws no switch for a support that has no toggle to drive', () => {
    const { container } = mount();
    TOOLS.filter(tool => !tool.actionOnly && !tool.toggleId).forEach(tool => {
      const row = container.querySelector(`[data-tool="${tool.id}"]`);
      expect(row).not.toBeNull();
      expect(row.querySelector('input[role="switch"]')).toBeNull();
      expect(row.querySelector('.assist-flat__state')).not.toBeNull();
    });
  });
});

describe('the row is the only way in', () => {
  it('draws no second copy of the chooser underneath, whatever mode is in use', () => {
    const { container } = mount({ local: { aiMode: 'cloud' } });
    expect(aiRow(container)).not.toBeNull();
    expect(container.querySelector('[data-settings-for="ai"]')).toBeNull();
  });
});
