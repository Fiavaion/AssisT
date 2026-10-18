/**
 * @jest-environment jsdom
 *
 * Tests for mounting Flat over the real popup markup.
 *
 * These load popup.html itself rather than a fixture, because the whole design rests on Flat
 * reaching the controls that are actually there: it sets their value and fires the event their
 * existing handler listens for, so the handler does the storing and the telling-the-content-script.
 * A test against a hand-built fixture would prove nothing about that.
 */

import fs from 'fs';
import path from 'path';

import {
  createControlFinder,
  mountFlat,
  proxySwitch,
  proxyControl,
  proxyAction,
} from '../../../../src/popup/flat/flat-mount.js';
import { toolById } from '../../../../src/popup/registry/tool-registry.js';

const POPUP_HTML = fs.readFileSync(
  path.join(__dirname, '../../../../src/popup/popup.html'),
  'utf8'
);

/**
 * The popup's own markup, with Flat's container placed exactly where popup.js puts it: inside
 * `.popup-container`, immediately before `<main>`. The geometry matters — Flat's own controls reuse
 * the accordion's element ids and sit EARLIER in the document, so a resolver that merely searched
 * the container would find Flat's copy first and Flat would proxy to itself.
 */
function setup() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  const popup = document.querySelector('.popup-container');
  const controlsRoot = document.querySelector('.popup-main');
  const container = document.createElement('div');
  container.id = 'flat-root';
  popup.insertBefore(container, controlsRoot);
  const find = createControlFinder({ root: popup, exclude: '#flat-root' });
  return { popup, controlsRoot, container, find };
}

beforeEach(() => {
  window.matchMedia =
    window.matchMedia ||
    (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

describe('the popup markup this depends on', () => {
  it('contains the controls the registry names', () => {
    const { controlsRoot } = setup();
    expect(controlsRoot).not.toBeNull();
    expect(controlsRoot.querySelector('#tts-enabled')).not.toBeNull();
    expect(controlsRoot.querySelector('#rate-slider')).not.toBeNull();
  });
});

describe('proxySwitch', () => {
  it('flips the real checkbox and tells its handler', () => {
    const { controlsRoot, find } = setup();
    const real = controlsRoot.querySelector('#tts-enabled');
    const heard = [];
    real.addEventListener('change', () => heard.push(real.checked));

    expect(proxySwitch(find, 'tts-enabled', true)).toBe(true);
    expect(real.checked).toBe(true);
    expect(heard).toEqual([true]);
  });

  it('stays quiet when the control is already in that state', () => {
    // Firing anyway would make the popup save and message the tab for a change that did not happen.
    const { controlsRoot, find } = setup();
    const real = controlsRoot.querySelector('#tts-enabled');
    real.checked = true;
    const heard = [];
    real.addEventListener('change', () => heard.push(1));

    proxySwitch(find, 'tts-enabled', true);
    expect(heard).toEqual([]);
  });

  it('reports honestly when the control is not there', () => {
    const { find } = setup();
    expect(proxySwitch(find, 'no-such-control', true)).toBe(false);
  });
});

describe('proxyControl', () => {
  it('drives a slider on input, which is what its handler listens for', () => {
    const { controlsRoot, find } = setup();
    const control = toolById('tts').controls.find(c => c.id === 'rate-slider');
    const real = controlsRoot.querySelector('#rate-slider');
    const heard = [];
    real.addEventListener('input', () => heard.push(real.value));

    proxyControl(find, control, 1.5);
    expect(real.value).toBe('1.5');
    expect(heard).toEqual(['1.5']);
  });

  it('scales a value back into the units the real slider uses', () => {
    // Letter spacing is stored in em and the slider works in whole percent points.
    const { controlsRoot, find } = setup();
    const control = toolById('text-customization').controls.find(
      c => c.id === 'text-letter-spacing'
    );
    proxyControl(find, control, 0.2);
    expect(controlsRoot.querySelector('#text-letter-spacing').value).toBe('20');
  });

  it('drives a select on change', () => {
    const { controlsRoot, find } = setup();
    const control = toolById('tts').controls.find(c => c.id === 'reading-scope');
    const real = controlsRoot.querySelector('#reading-scope');
    const heard = [];
    real.addEventListener('change', () => heard.push(real.value));

    proxyControl(find, control, 'page');
    expect(real.value).toBe('page');
    expect(heard).toEqual(['page']);
  });

  it('checks the radio the student chose, flags and all', () => {
    const { controlsRoot, find } = setup();
    const bionic = toolById('dyslexia-mode').controls.find(c => c.id === 'dyslexia-bionic');
    const real = controlsRoot.querySelector('#dyslexia-bionic');
    const heard = [];
    real.addEventListener('change', () => heard.push(real.checked));

    proxyControl(find, bionic, {
      syllableHighlighting: false,
      grammarColors: false,
      bionicReading: true,
    });
    expect(real.checked).toBe(true);
    expect(heard).toEqual([true]);
  });

  it('presses only the chips whose state has to change', () => {
    const { controlsRoot, find } = setup();
    const chips = toolById('stt').controls.find(c => c.type === 'chips');
    const medical = controlsRoot.querySelector('#vocab-preset-medical');
    const stem = controlsRoot.querySelector('#vocab-preset-stem');
    medical.setAttribute('aria-pressed', 'true');
    stem.setAttribute('aria-pressed', 'false');

    const pressed = [];
    [medical, stem].forEach(chip =>
      chip.addEventListener('mousedown', () => pressed.push(chip.id))
    );

    proxyControl(find, chips, ['medical', 'stem']);
    expect(pressed).toEqual(['vocab-preset-stem']);
  });
});

describe('proxyAction', () => {
  it('presses the real button the way its handler listens', () => {
    const { controlsRoot, find } = setup();
    const real = controlsRoot.querySelector('#btn-read-page');
    const pressed = [];
    real.addEventListener('mousedown', () => pressed.push(1));

    expect(proxyAction(find, { id: 'btn-read-page' })).toBe(true);
    expect(pressed).toEqual([1]);
  });
});

describe('mountFlat', () => {
  it('draws the whole registry over the real popup', () => {
    const { container, find } = setup();
    mountFlat({ find, container, getSettings: () => ({}) });
    expect(container.querySelectorAll('.assist-flat__row').length).toBeGreaterThan(20);
  });

  it('switching a support on in Flat flips the accordion control', () => {
    const { controlsRoot, container, find } = setup();
    mountFlat({ find, container, getSettings: () => ({}) });

    const flatSwitch = container.querySelector('#flat-tts');
    flatSwitch.checked = true;
    flatSwitch.dispatchEvent(new Event('change'));

    expect(controlsRoot.querySelector('#tts-enabled').checked).toBe(true);
  });

  it('reads a control value from the live element rather than a stale copy', () => {
    const { controlsRoot, container, find } = setup();
    controlsRoot.querySelector('#tts-enabled').checked = true;
    controlsRoot.querySelector('#rate-slider').value = '1.8';

    mountFlat({
      find,
      container,
      getSettings: () => ({ tts: { enabled: true } }),
    });

    expect(container.querySelector('#flat-rate-slider').value).toBe('1.8');
  });

  it('leaves the switch the student just touched exactly where it was', () => {
    // Redrawing would replace it under their finger and drop focus to the top of the popup.
    const { container, find } = setup();
    mountFlat({ find, container, getSettings: () => ({}) });

    const flatSwitch = container.querySelector('#flat-tts');
    flatSwitch.focus();
    flatSwitch.checked = true;
    flatSwitch.dispatchEvent(new Event('change'));

    expect(container.querySelector('#flat-tts')).toBe(flatSwitch);
    expect(document.activeElement).toBe(flatSwitch);
  });

  it('reveals a support’s settings under its row when it is switched on', () => {
    const { container, find } = setup();
    mountFlat({ find, container, getSettings: () => ({ tts: { enabled: false } }) });
    expect(container.querySelector('[data-settings-for="tts"]')).toBeNull();

    const flatSwitch = container.querySelector('#flat-tts');
    flatSwitch.checked = true;
    flatSwitch.dispatchEvent(new Event('change'));

    expect(container.querySelector('[data-settings-for="tts"]')).not.toBeNull();
  });

  it('brings a support drawn inside another in with it, wired to the real control', () => {
    const { controlsRoot, container, find } = setup();
    mountFlat({
      find,
      container,
      getSettings: () => ({ tts: { enabled: false, highlightEnabled: true } }),
    });
    // Out of sight while Read Aloud is off, and said so on Read Aloud's own row.
    expect(container.querySelector('#flat-highlight')).toBeNull();
    expect(
      container.querySelector('[data-tool="tts"] .assist-flat__holds').textContent
    ).toMatch(/Highlight While Reading/);

    const flatSwitch = container.querySelector('#flat-tts');
    flatSwitch.checked = true;
    flatSwitch.dispatchEvent(new Event('change'));

    const nested = container.querySelector('[data-nested-under="tts"]');
    expect(nested.getAttribute('aria-label')).toBe('Read Aloud options');
    expect(nested.querySelector('#flat-highlight')).not.toBeNull();

    // And it drives the accordion's own checkbox, which is the whole design.
    const flatHighlight = container.querySelector('#flat-highlight');
    flatHighlight.checked = false;
    flatHighlight.dispatchEvent(new Event('change'));
    expect(controlsRoot.querySelector('#highlight-enabled').checked).toBe(false);
  });

  it('gives the container back on destroy, leaving the popup untouched', () => {
    const { controlsRoot, container, find } = setup();
    const flat = mountFlat({ find, container, getSettings: () => ({}) });
    flat.destroy();
    expect(container.textContent).toBe('');
    expect(controlsRoot.querySelector('#tts-enabled')).not.toBeNull();
  });
});

describe('createControlFinder', () => {
  it('reaches a control that lives outside the accordion sections', () => {
    // Show Text Stats sits in `.text-stats-bar`, a sibling of `<main>`. A resolver scoped to the
    // accordion would return null here, and Flat would draw a row that reports nothing and does
    // nothing — a dead control that lies about its state.
    const { find } = setup();
    expect(find('[id="main-text-stats-toggle"]')).not.toBeNull();
  });

  it('never resolves into Flat’s own markup', () => {
    // Flat's rendered sub-controls carry the SAME ids as the accordion's and sit earlier in the
    // document. Resolving one of those would make Flat proxy to itself: the real handler never
    // runs, nothing is saved, and the control still appears to move.
    const { controlsRoot, container, find } = setup();
    const decoy = document.createElement('input');
    decoy.type = 'checkbox';
    decoy.id = 'tts-enabled';
    container.appendChild(decoy);

    const found = find('[id="tts-enabled"]');
    expect(found).toBe(controlsRoot.querySelector('#tts-enabled'));
    expect(container.contains(found)).toBe(false);
  });

  it('works before Flat has a root to exclude', () => {
    document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
    const popup = document.querySelector('.popup-container');
    const find = createControlFinder({ root: popup, exclude: '#flat-root' });
    expect(find('[id="tts-enabled"]')).not.toBeNull();
  });

  it('answers null rather than throwing when nothing matches', () => {
    const { find } = setup();
    expect(find('[id="no-such-control"]')).toBeNull();
  });
});

describe('Show Text Stats, the support outside every section', () => {
  it('reads its true state from the bar’s switch', () => {
    const { controlsRoot, container, find } = setup();
    document.querySelector('#main-text-stats-toggle').checked = true;

    mountFlat({ find, container, getSettings: () => ({}) });

    expect(container.querySelector('#flat-text-stats').checked).toBe(true);
    expect(controlsRoot.querySelector('#main-text-stats-toggle')).toBeNull();
  });

  it('flips the bar’s switch and tells its handler', () => {
    const { container, find } = setup();
    const real = document.querySelector('#main-text-stats-toggle');
    const heard = [];
    real.addEventListener('change', () => heard.push(real.checked));

    mountFlat({ find, container, getSettings: () => ({}) });
    const flatSwitch = container.querySelector('#flat-text-stats');
    flatSwitch.checked = true;
    flatSwitch.dispatchEvent(new Event('change'));

    expect(real.checked).toBe(true);
    expect(heard).toEqual([true]);
  });
});

describe('proxying while Flat is drawing controls of its own', () => {
  it('drives the accordion’s slider, not the copy Flat drew', () => {
    const { controlsRoot, container, find } = setup();
    controlsRoot.querySelector('#tts-enabled').checked = true;
    mountFlat({ find, container, getSettings: () => ({ tts: { enabled: true } }) });

    const flatSlider = container.querySelector('[data-settings-for="tts"] #flat-rate-slider');
    expect(flatSlider).not.toBeNull();

    const real = controlsRoot.querySelector('#rate-slider');
    const heard = [];
    real.addEventListener('input', () => heard.push(real.value));

    flatSlider.value = '1.6';
    flatSlider.dispatchEvent(new Event('input'));

    expect(real.value).toBe('1.6');
    expect(heard).toEqual(['1.6']);
  });
});

describe('the ids Flat draws', () => {
  /** Switch several supports on so Flat draws their sub-controls, not just their rows. */
  function mountWithSettingsShowing() {
    const parts = setup();
    ['tts-enabled', 'word-by-word-enabled', 'focus-mode-enabled', 'stt-enabled'].forEach(id => {
      parts.controlsRoot.querySelector(`#${id}`).checked = true;
    });
    mountFlat({
      find: parts.find,
      container: parts.container,
      getSettings: () => ({
        tts: { enabled: true, wordByWordEnabled: true },
        stt: { enabled: true },
        focusMode: { enabled: true },
      }),
    });
    return parts;
  }

  it('never repeats an id the popup already uses', () => {
    // Flat draws a second copy of controls the accordion still owns. If the copies carry the
    // accordion's ids, the document has duplicate ids: invalid markup, an ambiguous `for`/`id`
    // association for a screen reader, and `getElementById` answering with Flat's copy because
    // Flat is drawn first.
    mountWithSettingsShowing();

    const seen = new Set();
    const repeated = [];
    document.querySelectorAll('[id]').forEach(node => {
      if (seen.has(node.id)) {
        repeated.push(node.id);
      } else {
        seen.add(node.id);
      }
    });

    expect(repeated).toEqual([]);
  });

  it('points its own label at its own control, and leaves the accordion’s pointing at the accordion’s', () => {
    const { controlsRoot, container } = mountWithSettingsShowing();

    const flatLabel = container.querySelector('[data-settings-for="focus-mode"] label[for]');
    expect(flatLabel).not.toBeNull();
    const flatTarget = document.getElementById(flatLabel.getAttribute('for'));
    expect(flatTarget).not.toBeNull();
    expect(container.contains(flatTarget)).toBe(true);

    const realLabel = controlsRoot.querySelector('label[for="focus-mode-width"]');
    expect(realLabel).not.toBeNull();
    const realTarget = document.getElementById(realLabel.getAttribute('for'));
    expect(controlsRoot.contains(realTarget)).toBe(true);
  });

  it('keeps its radio groups out of the accordion’s', () => {
    // Radios sharing a `name` are one group. Were Flat's copies to join the accordion's group,
    // choosing an option in Flat would silently unchoose the accordion's — and the accordion's
    // radio is the one the proxy sets and the one Flat reads its value back from.
    const { controlsRoot, container } = mountWithSettingsShowing();

    const real = controlsRoot.querySelector('#whm-boundary');
    real.checked = true;

    const flatRadio = container.querySelector(
      '[data-settings-for="word-by-word"] input[type="radio"]'
    );
    expect(flatRadio).not.toBeNull();
    expect(flatRadio.name).not.toBe(real.name);

    flatRadio.checked = true;
    expect(real.checked).toBe(true);
  });
});

/**
 * A shut accordion section is now `inert`, so that its seventy hidden controls are not tab stops
 * and Space cannot land on one of them. Flat drives those very controls, so every route it uses
 * has to keep working through it: `inert` blocks focus and real user input, not a dispatched event
 * or a programmatic `.click()`. If that were ever to change, Flat would go silently dead on one
 * layout and not the other — which is the one thing the two-faces design must never do.
 */
describe('proxying into a section that is shut and inert', () => {
  /** Shut every accordion section the way setAccordionState does once the collapse has run. */
  function shutEverySection() {
    document.querySelectorAll('.accordion-content').forEach(content => {
      content.setAttribute('data-expanded', 'false');
      content.setAttribute('inert', '');
      content.classList.add('accordion-content--shut');
    });
  }

  it('still flips a switch inside it', () => {
    const { find } = setup();
    shutEverySection();
    const real = document.getElementById('stt-enabled');
    const heard = [];
    real.addEventListener('change', () => heard.push(real.checked));

    expect(proxySwitch(find, 'stt-enabled', true)).toBe(true);
    expect(heard).toEqual([true]);
  });

  it('still moves a slider inside it', () => {
    const { find } = setup();
    shutEverySection();
    const control = toolById('tts').controls.find(entry => entry.id === 'rate-slider');
    const real = document.getElementById('rate-slider');
    const heard = [];
    real.addEventListener('input', () => heard.push(real.value));

    expect(proxyControl(find, control, 1.5)).toBe(true);
    expect(heard).toHaveLength(1);
  });

  it('still presses a button inside it', () => {
    const { find } = setup();
    shutEverySection();
    const pressed = [];
    document
      .getElementById('btn-ai-advanced')
      .addEventListener('mousedown', () => pressed.push('advanced'));

    expect(proxyAction(find, { id: 'btn-ai-advanced' })).toBe(true);
    expect(pressed).toEqual(['advanced']);
  });

  it('still reaches a control the Console clicks directly', () => {
    setup();
    shutEverySection();
    const real = document.getElementById('tts-enabled');
    const heard = [];
    real.addEventListener('click', () => heard.push('clicked'));

    real.click();
    expect(heard).toEqual(['clicked']);
  });
});

describe('status lines the accordion writes', () => {
  // The accordion is hidden, so words it writes as the student works (a result, a note) would be
  // seen and heard by nobody. Flat shows a copy that follows the original.
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  it('shows what the accordion line says, announced the way the original is', () => {
    const { controlsRoot, container, find } = setup();
    controlsRoot.querySelector('#learning-profile-delete-status').textContent =
      'Recording from now on.';
    mountFlat({ find, container, getSettings: () => ({}) });

    const copy = container.querySelector('#flat-learning-profile-delete-status');
    expect(copy.textContent).toBe('Recording from now on.');
    expect(copy.getAttribute('role')).toBe('status');
  });

  it('follows the words when the accordion changes them', async () => {
    const { controlsRoot, container, find } = setup();
    mountFlat({ find, container, getSettings: () => ({}) });

    controlsRoot.querySelector('#learning-profile-delete-status').textContent =
      'Deleted. Nothing about how you work is stored on this device.';
    await settle();

    expect(container.querySelector('#flat-learning-profile-delete-status').textContent).toBe(
      'Deleted. Nothing about how you work is stored on this device.'
    );
  }, 30000);

  it('stops watching the accordion once Flat is gone', () => {
    const { container, find } = setup();
    const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
    const flat = mountFlat({ find, container, getSettings: () => ({}) });
    expect(disconnect).not.toHaveBeenCalled();

    flat.destroy();

    expect(disconnect).toHaveBeenCalled();
    disconnect.mockRestore();
  });
});

describe('Read Aloud’s speed presets', () => {
  const on = { tts: { enabled: true } };

  function mountOn(controlsRoot, container, find, settings) {
    controlsRoot.querySelector('#tts-enabled').checked = true;
    return mountFlat({ find, container, getSettings: () => settings });
  }

  it('are drawn under the speed slider and drive the real one', () => {
    const { controlsRoot, container, find } = setup();
    mountOn(controlsRoot, container, find, on);
    const real = controlsRoot.querySelector('#rate-slider');
    const heard = [];
    real.addEventListener('input', () => heard.push(real.value));

    const presets = [...container.querySelectorAll('.assist-reg-preset')];
    expect(presets.map(button => button.textContent)).toEqual(['0.5x', '1x', '1.5x', '2x']);
    presets[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(real.value).toBe('1.5');
    expect(heard).toEqual(['1.5']);
  });

  it('are left out when the student has hidden them in Advanced Options', () => {
    const { controlsRoot, container, find } = setup();
    mountOn(controlsRoot, container, find, { ...on, ui_visibility: { show_speed_presets: false } });
    expect(container.querySelectorAll('.assist-reg-preset')).toHaveLength(0);
  });
});
