/**
 * Tests for the tool-registry schema (Option 7 "Flat", slice 1).
 *
 * The schema exists because the popup has never had a list of its own tools: every icon, label,
 * control and default is hand-written into a fixed position in popup.html, and every surface that
 * needs to answer "what tools are there, and what is switched on?" has so far re-derived it by
 * scraping the rendered DOM. These tests pin the shape a tool must have before any view reads it.
 */

import {
  validateTool,
  validateControl,
  validateRegistry,
  controlAriaLabel,
  readSettingPath,
} from '../../../../src/popup/registry/tool-schema.js';

/** A minimal valid tool, spread-and-override in each test rather than repeated. */
const baseTool = () => ({
  id: 'tts',
  icon: '🔊',
  name: 'Read Aloud',
  description: 'Reads selected text aloud',
  section: 'reading',
  group: 'Reading',
  toggleId: 'tts-enabled',
  state: { store: 'settings', path: 'tts.enabled', default: false },
  keywords: 'speech voice audio listen read',
  controls: [],
  actions: [],
});

describe('validateTool', () => {
  it('accepts a well-formed tool', () => {
    expect(validateTool(baseTool())).toEqual([]);
  });

  it.each([
    ['id', 'id'],
    ['name', 'name'],
    ['icon', 'icon'],
    ['section', 'section'],
    ['group', 'group'],
  ])('rejects a tool with no %s', (_label, field) => {
    const tool = baseTool();
    delete tool[field];
    expect(validateTool(tool).join(' ')).toContain(field);
  });

  it('accepts a tool marked beta, and one that says nothing about it', () => {
    expect(validateTool({ ...baseTool(), beta: true })).toEqual([]);
    expect(validateTool(baseTool())).toEqual([]);
  });

  it('rejects a beta flag that is not a boolean, so a view can trust it', () => {
    expect(validateTool({ ...baseTool(), beta: 'yes' }).join(' ')).toContain('beta');
  });

  it('rejects a group outside the five Flat groups', () => {
    expect(validateTool({ ...baseTool(), group: 'Miscellaneous' }).join(' ')).toContain('group');
  });

  it('requires a state block, because a tool with no state cannot be switched', () => {
    const tool = baseTool();
    delete tool.state;
    expect(validateTool(tool).join(' ')).toContain('state');
  });

  it('rejects an unknown storage area', () => {
    const tool = { ...baseTool(), state: { store: 'sync', path: 'tts.enabled', default: false } };
    expect(validateTool(tool).join(' ')).toContain('store');
  });

  it('accepts the top-level local-storage form that AI Assist needs', () => {
    const ai = {
      ...baseTool(),
      id: 'ai',
      name: 'AI Assist',
      toggleId: null,
      state: { store: 'local', path: 'aiMode', default: 'off', offValue: 'off' },
    };
    expect(validateTool(ai)).toEqual([]);
  });

  it('carries dependsOn so a sub-option promoted to its own row stays honest', () => {
    const highlight = {
      ...baseTool(),
      id: 'highlight',
      name: 'Highlight While Reading',
      toggleId: 'highlight-enabled',
      state: { store: 'settings', path: 'tts.highlightEnabled', default: true },
      dependsOn: 'tts',
    };
    expect(validateTool(highlight)).toEqual([]);
  });

  it('rejects a dependsOn that names no tool in the registry', () => {
    const tools = [{ ...baseTool(), id: 'highlight', dependsOn: 'nonexistent' }];
    expect(validateRegistry(tools).join(' ')).toContain('nonexistent');
  });
});

describe('validateControl', () => {
  it('accepts a range with its bounds', () => {
    const control = {
      type: 'range',
      id: 'rate-slider',
      label: 'Speed',
      path: 'tts.rate',
      default: 1.0,
      min: 0.5,
      max: 2.0,
      step: 0.1,
    };
    expect(validateControl(control)).toEqual([]);
  });

  it('rejects a range with no bounds — an unbounded slider cannot be rendered', () => {
    const control = { type: 'range', id: 'rate-slider', label: 'Speed', path: 'tts.rate' };
    expect(validateControl(control).join(' ')).toMatch(/min|max/);
  });

  it('rejects a select with no options', () => {
    const control = { type: 'select', id: 'voice-select', label: 'Voice', path: 'tts.voice' };
    expect(validateControl(control).join(' ')).toContain('options');
  });

  it('accepts a select whose options are supplied at runtime', () => {
    const control = {
      type: 'select',
      id: 'voice-select',
      label: 'Voice',
      path: 'tts.voice',
      default: '',
      optionsFrom: 'voices',
    };
    expect(validateControl(control)).toEqual([]);
  });

  it('rejects an unknown control type', () => {
    const control = { type: 'colour-wheel', id: 'x', label: 'X', path: 'a.b' };
    expect(validateControl(control).join(' ')).toContain('type');
  });

  it('accepts a radio whose choice is stored as parallel booleans', () => {
    const control = {
      type: 'radio',
      id: 'dyslexia-syllable',
      label: 'Syllable colours',
      path: 'dyslexiaMode',
      group: 'dyslexia-variant',
      writes: { syllableHighlighting: true, grammarColors: false, bionicReading: false },
    };
    expect(validateControl(control)).toEqual([]);
  });

  it('rejects a radio that neither selects a value nor writes anything', () => {
    const control = {
      type: 'radio',
      id: 'dyslexia-syllable',
      label: 'Syllable colours',
      path: 'dyslexiaMode',
      group: 'dyslexia-variant',
    };
    expect(validateControl(control).join(' ')).toContain('value');
  });

  it('requires a radio group to name the group it belongs to', () => {
    const control = {
      type: 'radio',
      id: 'whm-boundary',
      label: 'Boundary events',
      path: 'tts.wordHighlightMode',
      value: 'boundary',
    };
    expect(validateControl(control).join(' ')).toContain('group (input name)');
  });
});

describe('validateControl — chips, mirrors and scale', () => {
  const chips = () => ({
    type: 'chips',
    id: 'vocab-presets',
    label: 'Subject vocabulary',
    path: 'stt.vocabulary.enabledPresets',
    default: [],
    options: [
      { id: 'vocab-preset-medical', value: 'medical', label: 'Medical' },
      { id: 'vocab-preset-stem', value: 'stem', label: 'STEM' },
    ],
  });

  it('accepts a chip group', () => {
    expect(validateControl(chips())).toEqual([]);
  });

  it('rejects a chip group with no options', () => {
    expect(validateControl({ ...chips(), options: [] }).join(' ')).toContain('options');
  });

  it('requires each chip to carry its own element id', () => {
    const control = chips();
    delete control.options[0].id;
    expect(validateControl(control).join(' ')).toContain('element id');
  });

  it('requires each chip to say what it adds to the array', () => {
    const control = chips();
    delete control.options[1].value;
    expect(validateControl(control).join(' ')).toContain('value');
  });

  it('accepts a control that mirrors onto further keys', () => {
    const control = {
      type: 'switch',
      id: 'stt-punctuation',
      label: 'Punctuation Help',
      path: 'stt.punctuationCommands',
      alsoWrites: ['stt.autoPunctuation'],
      default: true,
    };
    expect(validateControl(control)).toEqual([]);
  });

  it('rejects an empty mirror list, which says nothing', () => {
    const control = {
      type: 'switch',
      id: 'stt-punctuation',
      label: 'Punctuation Help',
      path: 'stt.punctuationCommands',
      alsoWrites: [],
      default: true,
    };
    expect(validateControl(control).join(' ')).toContain('alsoWrites');
  });
});

describe('validateTool — action-only tools', () => {
  const translate = () => ({
    id: 'translation',
    icon: '🌐',
    name: 'Translate Page',
    description: 'Translates the page or selected text',
    section: 'lookup',
    group: 'Reading',
    toggleId: null,
    actionOnly: true,
    keywords: 'translate language',
    controls: [],
    actions: [{ id: 'btn-translate-page', label: 'Translate page' }],
  });

  it('accepts a tool that is something you do, not something you switch on', () => {
    expect(validateTool(translate())).toEqual([]);
  });

  it('rejects an action-only tool that also claims state', () => {
    const tool = {
      ...translate(),
      state: { store: 'settings', path: 'translation.enabled', default: true },
    };
    expect(validateTool(tool).join(' ')).toContain('must not claim state');
  });

  it('rejects an action-only tool with no actions — it would be unreachable', () => {
    expect(validateTool({ ...translate(), actions: [] }).join(' ')).toContain(
      'at least one action'
    );
  });
});

describe('validateControl — surface', () => {
  const base = () => ({
    type: 'switch',
    id: 'annotations-auto-save',
    label: 'Save notes as you make them',
    path: 'annotations.autoSave',
    default: true,
  });

  it('defaults to the popup surface when unstated', () => {
    expect(validateControl(base())).toEqual([]);
  });

  it('accepts a control drawn in the Advanced Options modal', () => {
    expect(validateControl({ ...base(), surface: 'advanced' })).toEqual([]);
  });

  it('rejects a surface nobody draws', () => {
    expect(validateControl({ ...base(), surface: 'sidebar' }).join(' ')).toContain('surface');
  });
});

describe('controlAriaLabel', () => {
  it('names every control with its tool, so no student meets a bare "Speed"', () => {
    expect(controlAriaLabel({ name: 'Read Aloud' }, { label: 'Speed' })).toBe('Read Aloud — Speed');
  });

  it('does not repeat the tool name when the label already carries it', () => {
    expect(controlAriaLabel({ name: 'Read Aloud' }, { label: 'Read Aloud' })).toBe('Read Aloud');
  });
});

describe('readSettingPath', () => {
  it('reads a nested path', () => {
    expect(readSettingPath({ tts: { rate: 1.5 } }, 'tts.rate')).toBe(1.5);
  });

  it('reads a top-level path', () => {
    expect(readSettingPath({ aiMode: 'cloud' }, 'aiMode')).toBe('cloud');
  });

  it('returns undefined rather than throwing when the branch is absent', () => {
    expect(readSettingPath({}, 'tts.rate')).toBeUndefined();
    expect(readSettingPath(null, 'tts.rate')).toBeUndefined();
  });
});

describe('validateTool — status lines', () => {
  // A line the accordion writes into (a result, a note that depends on the computer's settings) is
  // hidden with the accordion. Declaring it is how Flat shows the student the same words.
  const speed = {
    type: 'range',
    id: 'rate-slider',
    label: 'Speed',
    path: 'tts.rate',
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
  };

  it('accepts a line on the row, and a line under one of the tool’s own controls', () => {
    const tool = {
      ...baseTool(),
      controls: [speed],
      statusLines: [{ id: 'tts-note' }, { id: 'rate-words', after: 'rate-slider' }],
    };
    expect(validateTool(tool)).toEqual([]);
  });

  it('rejects a line with no element id', () => {
    expect(validateTool({ ...baseTool(), statusLines: [{}] }).join(' ')).toContain('status line');
  });

  it('rejects a line placed under a control the tool does not have', () => {
    const tool = { ...baseTool(), statusLines: [{ id: 'rate-words', after: 'nowhere' }] };
    expect(validateTool(tool).join(' ')).toContain('status line');
  });

  it('rejects statusLines that is not a list', () => {
    expect(validateTool({ ...baseTool(), statusLines: 'tts-note' }).join(' ')).toContain(
      'status line'
    );
  });
});

describe('validateControl — presets', () => {
  const range = () => ({
    type: 'range',
    id: 'rate-slider',
    label: 'Speed',
    path: 'tts.rate',
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
  });

  it('accepts presets inside the range', () => {
    expect(validateControl({ ...range(), presets: [0.5, 1, 1.5, 2] })).toEqual([]);
  });

  it('rejects a preset the slider cannot reach', () => {
    expect(validateControl({ ...range(), presets: [0.5, 3] }).join(' ')).toContain('preset');
  });

  it('rejects presets on a control that is not a range', () => {
    const select = {
      type: 'select',
      id: 'voice',
      label: 'Voice',
      path: 'tts.voice',
      default: '',
      options: [{ value: 'a', label: 'A' }],
      presets: [1],
    };
    expect(validateControl(select).join(' ')).toContain('preset');
  });
});
