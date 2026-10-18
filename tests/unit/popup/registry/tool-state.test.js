/**
 * Tests for reading tool state from settings via the registry.
 *
 * The behaviours pinned here are the ones the popup's own handlers already have and the ones the
 * Flat view depends on: a stored `false` beats a default of `true`, a hidden tool is absent rather
 * than off, a tool whose parent is off is unavailable rather than broken, and the in-use set is a
 * snapshot rather than a live predicate.
 */

import {
  resolveValue,
  isToolOn,
  isToolVisible,
  isToolAvailable,
  readToolStates,
  inUseToolIds,
  inUseCounts,
} from '../../../../src/popup/registry/tool-state.js';
import { toolById } from '../../../../src/popup/registry/tool-registry.js';

describe('resolveValue', () => {
  it('returns the stored value when there is one', () => {
    expect(
      resolveValue({ path: 'tts.rate', default: 1 }, { settings: { tts: { rate: 1.5 } } })
    ).toBe(1.5);
  });

  it('falls back to the declared default when nothing is stored', () => {
    expect(resolveValue({ path: 'tts.rate', default: 1 }, { settings: {} })).toBe(1);
  });

  it('lets a stored false beat a default of true', () => {
    // The failure this prevents: treating `false` as "unset" and switching a tool the student
    // deliberately turned off back on.
    const declaration = { path: 'ocr.enabled', default: true };
    expect(resolveValue(declaration, { settings: { ocr: { enabled: false } } })).toBe(false);
  });

  it('reads the local store when the declaration says so', () => {
    const declaration = { store: 'local', path: 'aiMode', default: 'off' };
    expect(resolveValue(declaration, { local: { aiMode: 'cloud' }, settings: {} })).toBe('cloud');
  });
});

describe('isToolOn', () => {
  const tts = () => toolById('tts');
  const ai = () => toolById('ai');

  it('is off when nothing is stored and the default is off', () => {
    expect(isToolOn(tts(), { settings: {} })).toBe(false);
  });

  it('is on when stored on', () => {
    expect(isToolOn(tts(), { settings: { tts: { enabled: true } } })).toBe(true);
  });

  it('honours an on-by-default tool with nothing stored', () => {
    expect(isToolOn(toolById('ocr'), { settings: {} })).toBe(true);
  });

  it('reads AI Assist as on for any mode that is not off', () => {
    expect(isToolOn(ai(), { local: { aiMode: 'cloud' } })).toBe(true);
    expect(isToolOn(ai(), { local: { aiMode: 'webllm' } })).toBe(true);
  });

  it('reads AI Assist as off for the off mode, and when unset', () => {
    expect(isToolOn(ai(), { local: { aiMode: 'off' } })).toBe(false);
    expect(isToolOn(ai(), { local: {} })).toBe(false);
  });

  it('never reports an action-only tool as in use', () => {
    // Translate Page has no switch. Calling it "on" would strand it in an in-use list it could
    // never leave, and imply a control the student does not have.
    expect(isToolOn(toolById('translation'), { settings: {} })).toBe(false);
  });

  it('is off for nothing at all', () => {
    expect(isToolOn(null, {})).toBe(false);
  });
});

describe('isToolVisible', () => {
  it('is visible when the tool declares no visibility key', () => {
    expect(isToolVisible(toolById('tts'), {})).toBe(true);
  });

  it('is visible when the key is absent, since defaults are on', () => {
    expect(isToolVisible(toolById('ocr'), {})).toBe(true);
  });

  it('is hidden when the student has hidden it', () => {
    expect(isToolVisible(toolById('ocr'), { show_ocr: false })).toBe(false);
  });
});

describe('isToolAvailable', () => {
  it('is available when it depends on nothing', () => {
    expect(isToolAvailable(toolById('tts'), { settings: {} })).toBe(true);
  });

  it('is unavailable while the tool it depends on is off', () => {
    // Highlight While Reading is stored under `tts.*` and does nothing without Read Aloud.
    expect(isToolAvailable(toolById('highlight'), { settings: { tts: { enabled: false } } })).toBe(
      false
    );
  });

  it('becomes available once its parent is on', () => {
    expect(isToolAvailable(toolById('highlight'), { settings: { tts: { enabled: true } } })).toBe(
      true
    );
  });
});

describe('readToolStates', () => {
  it('reports every tool in the registry', () => {
    const states = readToolStates({ settings: {} });
    expect(states.length).toBeGreaterThan(20);
    states.forEach(state => {
      expect(typeof state.on).toBe('boolean');
      expect(typeof state.visible).toBe('boolean');
      expect(typeof state.available).toBe('boolean');
    });
  });

  it('can be given a subset to read', () => {
    const states = readToolStates({ settings: {}, tools: [toolById('tts')] });
    expect(states).toHaveLength(1);
    expect(states[0].tool.id).toBe('tts');
  });
});

describe('inUseToolIds', () => {
  const settings = { tts: { enabled: true }, pomodoro: { enabled: true } };

  it('collects the tools that are switched on', () => {
    const ids = inUseToolIds({ settings });
    expect(ids.has('tts')).toBe(true);
    expect(ids.has('pomodoro')).toBe(true);
  });

  it('leaves out a tool the student has hidden, even when it is on', () => {
    const ids = inUseToolIds({
      settings: { ...settings, ocr: { enabled: true } },
      visibility: { show_ocr: false },
    });
    expect(ids.has('ocr')).toBe(false);
  });

  it('is a snapshot, not a live view', () => {
    // The filter must keep showing what it captured: switching a support off while filtering must
    // not make its row disappear from under the pointer.
    const ids = inUseToolIds({ settings });
    settings.tts.enabled = false;
    expect(ids.has('tts')).toBe(true);
  });
});

describe('inUseCounts', () => {
  it('splits the visible tools into in-use and hidden', () => {
    const counts = inUseCounts({ settings: { tts: { enabled: true } } });
    expect(counts.inUse + counts.hidden).toBe(counts.total);
    expect(counts.inUse).toBeGreaterThan(0);
  });

  it('does not count a tool the student has hidden in either column', () => {
    const all = inUseCounts({ settings: {} });
    const withOneHidden = inUseCounts({ settings: {}, visibility: { show_ocr: false } });
    expect(withOneHidden.total).toBe(all.total - 1);
  });
});
