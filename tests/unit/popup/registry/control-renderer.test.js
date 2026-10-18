/**
 * @jest-environment jsdom
 *
 * Tests for drawing a control from its declaration.
 *
 * These pin the accessibility rules the generic renderer exists to guarantee — every control named
 * with its tool, state announced in words rather than carried by colour, a radio group asking its
 * question — and the two unit traps: a slider whose stored unit differs from the one on screen,
 * and a variant stored as parallel booleans.
 */

import {
  renderControl,
  renderControls,
  renderRadioGroup,
  renderAction,
} from '../../../../src/popup/registry/control-renderer.js';
import { toolById } from '../../../../src/popup/registry/tool-registry.js';

const tool = { id: 'tts', name: 'Read Aloud' };

/** Find the interactive element inside a rendered control. */
const inputIn = node => node.querySelector('input, select, button');

describe('switch', () => {
  const control = { type: 'switch', id: 'x-on', label: 'Auto-play', path: 'x.on', default: false };

  it('names itself with its tool', () => {
    const node = renderControl(tool, control, { value: false });
    expect(inputIn(node).getAttribute('aria-label')).toBe('Read Aloud — Auto-play');
  });

  it('announces its state in words, not only by where the slider sits', () => {
    const node = renderControl(tool, control, { value: true });
    const input = inputIn(node);
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.getAttribute('aria-checked')).toBe('true');
  });

  it('keeps aria-checked in step when flipped', () => {
    const node = renderControl(tool, control, { value: false });
    const input = inputIn(node);
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    expect(input.getAttribute('aria-checked')).toBe('true');
  });

  it('reports the new value', () => {
    const changes = [];
    const node = renderControl(tool, control, { value: false, onChange: v => changes.push(v) });
    const input = inputIn(node);
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    expect(changes).toEqual([true]);
  });
});

describe('range', () => {
  const speed = {
    type: 'range',
    id: 'rate',
    label: 'Speed',
    path: 'tts.rate',
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: 'x',
  };

  it('names itself with its tool, so no student meets a bare "Speed"', () => {
    const node = renderControl(tool, speed, { value: 1.5 });
    expect(inputIn(node).getAttribute('aria-label')).toBe('Read Aloud — Speed');
  });

  it('shows the current value with its unit', () => {
    const node = renderControl(tool, speed, { value: 1.5 });
    expect(node.querySelector('#flat-rate-value').textContent).toBe('1.5x');
  });

  it('falls back to the declared default rather than rendering NaN', () => {
    const node = renderControl(tool, speed, {});
    expect(inputIn(node).value).toBe('1');
  });

  describe('when the stored unit differs from the one on screen', () => {
    // Letter spacing is stored in em and shown in whole percent points.
    const spacing = {
      type: 'range',
      id: 'letter',
      label: 'Letter Spacing',
      path: 'textCustomization.letterSpacing',
      default: 0.12,
      min: 0,
      max: 0.5,
      step: 0.01,
      scale: 100,
      unit: '%',
    };

    it('shows the scaled value', () => {
      const node = renderControl(tool, spacing, { value: 0.12 });
      expect(inputIn(node).value).toBe('12');
      expect(node.querySelector('#flat-letter-value').textContent).toBe('12%');
    });

    it('hands back the stored value, not the one on screen', () => {
      // The bug this prevents: saving 12em where 0.12em was meant.
      const changes = [];
      const node = renderControl(tool, spacing, { value: 0.12, onChange: v => changes.push(v) });
      const input = inputIn(node);
      input.value = '20';
      input.dispatchEvent(new Event('input'));
      expect(changes).toEqual([0.2]);
    });
  });

  describe('a fraction shown as a percentage', () => {
    // Not a fixture: the two controls that shipped reading "1%" and "0.7%" in the Flat popup,
    // taken from the registry itself so the declaration is what is under test.
    const controlIn = (toolId, controlId) => {
      const owner = toolById(toolId);
      return [owner, owner.controls.find(control => control.id === controlId)];
    };

    it('shows full volume as 100%, over a slider that travels 0 to 100', () => {
      const [owner, volume] = controlIn('tts', 'volume-slider');
      const node = renderControl(owner, volume, { value: 1 });
      const input = inputIn(node);
      expect([input.min, input.max, input.step]).toEqual(['0', '100', '10']);
      expect(node.querySelector('#flat-volume-slider-value').textContent).toBe('100%');
    });

    it('shows a stored 0.7 opacity as 70%', () => {
      const [owner, opacity] = controlIn('highlight', 'highlight-opacity');
      const node = renderControl(owner, opacity, { value: 0.7 });
      expect(inputIn(node).value).toBe('70');
      expect(node.querySelector('#flat-highlight-opacity-value').textContent).toBe('70%');
    });

    it('stores the fraction back when the slider is moved to 70', () => {
      // The whole point of the scaling: the engine and the accordion popup read 0–1.
      const [owner, volume] = controlIn('tts', 'volume-slider');
      const changes = [];
      const node = renderControl(owner, volume, { value: 1, onChange: v => changes.push(v) });
      const input = inputIn(node);
      input.value = '70';
      input.dispatchEvent(new Event('input'));
      expect(changes).toEqual([0.7]);
    });
  });
});

describe('select', () => {
  const control = {
    type: 'select',
    id: 'scope',
    label: 'Read on click',
    path: 'tts.readingScope',
    default: 'paragraph',
    options: [
      { value: 'paragraph', label: 'This paragraph' },
      { value: 'page', label: 'Whole page' },
    ],
  };

  it('draws its declared options and selects the current one', () => {
    const node = renderControl(tool, control, { value: 'page' });
    const select = inputIn(node);
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe('page');
    expect(select.getAttribute('aria-label')).toBe('Read Aloud — Read on click');
  });

  it('takes options supplied at runtime, for lists only the engine knows', () => {
    const voices = {
      type: 'select',
      id: 'voice',
      label: 'Voice',
      path: 'tts.voice',
      optionsFrom: 'voices',
    };
    const node = renderControl(tool, voices, {
      value: 'Fred',
      options: [{ value: 'Fred', label: 'Fred' }],
    });
    expect(inputIn(node).value).toBe('Fred');
  });
});

describe('radio group', () => {
  const modes = [
    {
      type: 'radio',
      id: 'm-a',
      label: 'Boundary events',
      path: 'tts.wordHighlightMode',
      group: 'whm',
      groupLabel: 'Highlight sync method',
      value: 'boundary',
    },
    {
      type: 'radio',
      id: 'm-b',
      label: 'Timer',
      path: 'tts.wordHighlightMode',
      group: 'whm',
      value: 'timer',
    },
  ];

  it('asks its question in the legend, rather than repeating an answer', () => {
    const node = renderRadioGroup(tool, modes, 'Highlight sync method', { value: 'timer' });
    expect(node.querySelector('legend').textContent).toBe('Highlight sync method');
  });

  it('checks the option matching the stored value', () => {
    const node = renderRadioGroup(tool, modes, 'Highlight sync method', { value: 'timer' });
    expect(node.querySelector('#flat-m-a').checked).toBe(false);
    expect(node.querySelector('#flat-m-b').checked).toBe(true);
  });

  it('reports the value the chosen option selects', () => {
    const changes = [];
    const node = renderRadioGroup(tool, modes, 'Sync', {
      value: 'boundary',
      onChange: v => changes.push(v),
    });
    const timer = node.querySelector('#flat-m-b');
    timer.checked = true;
    timer.dispatchEvent(new Event('change'));
    expect(changes).toEqual(['timer']);
  });

  describe('when the choice is stored as parallel booleans', () => {
    const variants = toolById('dyslexia-mode').controls.filter(c => c.group === 'dyslexia-variant');

    it('checks the option whose flags all match', () => {
      const node = renderRadioGroup(tool, variants, 'How text is shaped', {
        value: { syllableHighlighting: false, grammarColors: true, bionicReading: false },
      });
      expect(node.querySelector('#flat-dyslexia-grammar').checked).toBe(true);
      expect(node.querySelector('#flat-dyslexia-syllable').checked).toBe(false);
    });

    it('reports the whole set of flags to write', () => {
      const changes = [];
      const node = renderRadioGroup(tool, variants, 'How text is shaped', {
        value: { syllableHighlighting: true, grammarColors: false, bionicReading: false },
        onChange: v => changes.push(v),
      });
      const bionic = node.querySelector('#flat-dyslexia-bionic');
      bionic.checked = true;
      bionic.dispatchEvent(new Event('change'));
      expect(changes).toEqual([
        { syllableHighlighting: false, grammarColors: false, bionicReading: true },
      ]);
    });
  });
});

describe('chips', () => {
  const control = toolById('stt').controls.find(c => c.type === 'chips');

  it('announces each chip as pressed or not', () => {
    const node = renderControl(toolById('stt'), control, { value: ['medical'] });
    expect(node.querySelector('#flat-vocab-preset-medical').getAttribute('aria-pressed')).toBe('true');
    expect(node.querySelector('#flat-vocab-preset-stem').getAttribute('aria-pressed')).toBe('false');
  });

  it('adds and removes membership of the stored array', () => {
    const changes = [];
    const node = renderControl(toolById('stt'), control, {
      value: ['medical'],
      onChange: v => changes.push(v),
    });
    node
      .querySelector('#flat-vocab-preset-stem')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(changes[0]).toEqual(['medical', 'stem']);

    node
      .querySelector('#flat-vocab-preset-medical')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(changes[1]).toEqual(['stem']);
  });

  it('toggles from the keyboard, not the pointer alone', () => {
    const changes = [];
    const node = renderControl(toolById('stt'), control, {
      value: [],
      onChange: v => changes.push(v),
    });
    node
      .querySelector('#flat-vocab-preset-stem')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(changes[0]).toEqual(['stem']);
  });
});

describe('renderControls', () => {
  it('collects radios into one group instead of drawing each alone', () => {
    const dyslexia = toolById('dyslexia-mode');
    const nodes = renderControls(dyslexia, () => ({ value: {} }));
    const fieldsets = nodes.filter(node => node.tagName === 'FIELDSET');
    expect(fieldsets).toHaveLength(1);
    expect(fieldsets[0].querySelectorAll('input[type="radio"]')).toHaveLength(3);
  });

  it('can draw only the controls of one surface', () => {
    const annotations = toolById('annotations');
    expect(renderControls(annotations, () => ({}), { surface: 'popup' })).toHaveLength(0);
    expect(renderControls(annotations, () => ({}), { surface: 'advanced' }).length).toBeGreaterThan(
      0
    );
  });

  it('draws every control a real tool declares', () => {
    const tts = toolById('tts');
    expect(renderControls(tts, control => ({ value: control.default }))).toHaveLength(
      tts.controls.length
    );
  });
});

describe('renderAction', () => {
  it('names itself with its tool and reports being invoked', () => {
    const invoked = [];
    const action = { id: 'btn-read-page', label: 'Read Page' };
    const button = renderAction(tool, action, a => invoked.push(a.id));
    expect(button.getAttribute('aria-label')).toBe('Read Aloud — Read Page');
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(invoked).toEqual(['btn-read-page']);
  });

  it('answers the keyboard as well as the pointer', () => {
    const invoked = [];
    const button = renderAction(tool, { id: 'btn-read-page', label: 'Read Page' }, a =>
      invoked.push(a.id)
    );
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(invoked).toEqual(['btn-read-page', 'btn-read-page']);
  });
});

describe('range — presets', () => {
  // Read Aloud's four speed presets: one press to a common speed, rather than a fine drag.
  const control = {
    type: 'range',
    id: 'rate-slider',
    label: 'Speed',
    path: 'tts.rate',
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: 'x',
    presets: [0.5, 1, 1.5, 2],
  };
  const presetsIn = node => [...node.querySelectorAll('button')];
  const pressWith = (button, init) =>
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

  it('draws one button per preset, in a group named for the slider it sets', () => {
    const node = renderControl(tool, control, { value: 1, presets: control.presets });
    const buttons = presetsIn(node);
    expect(buttons.map(button => button.textContent)).toEqual(['0.5x', '1x', '1.5x', '2x']);
    expect(buttons[0].closest('[role="group"]').getAttribute('aria-label')).toBe(
      'Read Aloud — Speed presets'
    );
    expect(buttons[2].getAttribute('aria-label')).toBe('Read Aloud — Speed 1.5x');
  });

  it('says which preset the slider is on', () => {
    const node = renderControl(tool, control, { value: 1.5, presets: control.presets });
    expect(presetsIn(node).map(button => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
  });

  it('a press moves the slider, reports the value, and marks itself', () => {
    const changes = [];
    const node = renderControl(tool, control, {
      value: 1,
      presets: control.presets,
      onChange: value => changes.push(value),
    });
    const fast = presetsIn(node)[3];
    fast.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(node.querySelector('input[type="range"]').value).toBe('2');
    expect(node.querySelector('#flat-rate-slider-value').textContent).toBe('2x');
    expect(changes).toEqual([2]);
    expect(fast.getAttribute('aria-pressed')).toBe('true');
    expect(presetsIn(node)[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('works from the keyboard', () => {
    const changes = [];
    const node = renderControl(tool, control, {
      value: 1,
      presets: control.presets,
      onChange: value => changes.push(value),
    });
    pressWith(presetsIn(node)[0], { key: 'Enter' });
    expect(changes).toEqual([0.5]);
  });

  it('moving the slider moves the marking with it', () => {
    const node = renderControl(tool, control, { value: 1, presets: control.presets });
    const slider = node.querySelector('input[type="range"]');
    slider.value = '1.5';
    slider.dispatchEvent(new Event('input'));
    expect(presetsIn(node)[2].getAttribute('aria-pressed')).toBe('true');
    expect(presetsIn(node)[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('draws none when the student has hidden them', () => {
    const node = renderControl(tool, control, { value: 1, presets: [] });
    expect(presetsIn(node)).toEqual([]);
  });
});
