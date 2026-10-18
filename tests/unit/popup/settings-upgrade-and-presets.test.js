/**
 * @jest-environment jsdom
 *
 * The settings layer as an upgraded install actually presents it, and the shortcut presets.
 *
 * A student coming from 0.9.3 has a stored settings object that predates the maths, citation and
 * ui_visibility branches. The popup reads those branches directly, so an absent one threw during
 * setup and left every control on screen dead — the same failure shape as the dead-popup bug.
 * StorageManager now merges whatever is stored over the defaults, and the popup's own reads are
 * guarded on top of that, so neither alone can bring it down.
 *
 * The presets were listing 17 of the registry's 18 keys: `action_tray_focus` had been added and no
 * preset knew about it, so picking a preset left the confirmation tray on whatever the previous
 * preset had bound. They are derived from the registry now, which is what these tests pin.
 */

import fs from 'fs';
import path from 'path';
import {
  DEFAULT_SHORTCUTS,
  MIND_MAP_SCOPE,
  PAGE_SCOPE,
  shortcutKeysInScope,
} from '../../../src/utils/keyboard-shortcuts.js';
import { StorageManager } from '../../../src/utils/storage-manager.js';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

let PopupController;
let SHORTCUT_PRESETS;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController, SHORTCUT_PRESETS } = await import('../../../src/popup/popup.js'));
});

/** What a 0.9.3 install has on disk: the branches of that release and nothing newer. */
function storedFrom093() {
  return {
    tts: { enabled: true, voice: 'Aria', rate: 1.35 },
    stt: { enabled: true, language: 'en-IE' },
    textCustomization: { enabled: true, fontFamily: 'opendyslexic' },
    readingGuide: { enabled: true, lineThickness: 4 },
    accessibility: { keyboardShortcuts: true },
    canvasIntegration: { enabled: true },
  };
}

/** @returns {Object} a controller over the real popup markup */
function mountPopup() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  localStorage.clear();
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  chrome.tabs.query = jest.fn().mockResolvedValue([{ id: 7, url: 'https://example.test/' }]);
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  return new PopupController();
}

describe('a popup opened on an install upgraded from 0.9.3', () => {
  it('sets up every control with the merged settings, without throwing', () => {
    const popup = mountPopup();
    popup.settings = StorageManager.withDefaults(storedFrom093());

    expect(() => popup.setupEventListeners()).not.toThrow();

    expect(document.getElementById('maths-enabled').checked).toBe(false);
    expect(document.getElementById('citation-enabled').checked).toBe(true);
  });

  it('survives the raw stored object too, with no merge in front of it', () => {
    const popup = mountPopup();
    popup.settings = storedFrom093();

    expect(() => popup.setupEventListeners()).not.toThrow();

    expect(document.getElementById('maths-enabled').checked).toBe(false);
    expect(document.getElementById('citation-verify-online').checked).toBe(false);
  });

  it('keeps what the student set rather than resetting it to a default', () => {
    const popup = mountPopup();
    popup.settings = StorageManager.withDefaults(storedFrom093());

    expect(popup.settings.tts.rate).toBe(1.35);
    expect(popup.settings.textCustomization.fontFamily).toBe('opendyslexic');
  });
});

describe('a Canvas quiz helper stored as a bare boolean by an older version', () => {
  const legacy = () => ({ canvasIntegration: { enabled: true, quizHelper: false } });

  it.each([
    ['merged over the defaults', () => StorageManager.withDefaults(legacy())],
    ['raw, with no merge in front of it', legacy],
  ])('sets up the quiz helper controls off, with their declared options (%s)', (_name, make) => {
    const popup = mountPopup();
    popup.settings = make();

    expect(() => popup.setupEventListeners()).not.toThrow();

    expect(document.getElementById('canvas-quiz-helper').checked).toBe(false);
    expect(document.getElementById('quiz-helper-options').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('quiz-read-answers').checked).toBe(true);
    expect(document.getElementById('quiz-auto-read').checked).toBe(false);
    expect(document.getElementById('quiz-highlight-color').value).toBe('#4A90E2');
    expect(popup.settings.canvasIntegration.quizHelper).toEqual(
      StorageManager.DEFAULT_SETTINGS.canvasIntegration.quizHelper
    );
  });
});

describe('OCR auto-play in the popup', () => {
  it('shows off for an install that never chose it', () => {
    const popup = mountPopup();
    popup.settings = StorageManager.withDefaults(storedFrom093());

    popup.setupEventListeners();

    expect(document.getElementById('ocr-auto-tts').checked).toBe(false);
  });

  it('shows off for a raw stored object with no ocr branch at all', () => {
    const popup = mountPopup();
    popup.settings = storedFrom093();

    popup.setupEventListeners();

    expect(document.getElementById('ocr-auto-tts').checked).toBe(false);
  });

  it('shows on for a student who switched it on', () => {
    const popup = mountPopup();
    popup.settings = StorageManager.withDefaults({ ...storedFrom093(), ocr: { autoTTS: true } });

    popup.setupEventListeners();

    expect(document.getElementById('ocr-auto-tts').checked).toBe(true);
  });
});

describe('the shortcut presets', () => {
  const registryKeys = Object.keys(DEFAULT_SHORTCUTS).sort();
  const presetNames = ['default', 'minimal', 'oneHanded'];

  it.each(presetNames)('%s lists every key in the registry, and no other', name => {
    expect(Object.keys(SHORTCUT_PRESETS[name]).sort()).toEqual(registryKeys);
  });

  it('the default preset is the registry itself', () => {
    expect(SHORTCUT_PRESETS.default).toEqual(DEFAULT_SHORTCUTS);
  });

  it.each(presetNames)('%s binds the confirmation tray, which none of them used to', name => {
    // Undo is only reachable by keyboard through this shortcut, so no preset may leave it unbound.
    expect(SHORTCUT_PRESETS[name].action_tray_focus).toBeTruthy();
  });

  it.each(presetNames)('%s binds each combination at most once, in each scope', name => {
    // Per scope, because a preset rearranges the page tools while carrying the mind map editor's own
    // keys through untouched, and the two sets never meet: a content script does not run on the
    // editor's extension page, so one-handed Alt+R for the reading guide and the editor's Alt+R for
    // read aloud cannot both be pressed in the same document.
    for (const scope of [PAGE_SCOPE, MIND_MAP_SCOPE]) {
      const bound = shortcutKeysInScope(scope)
        .map(key => SHORTCUT_PRESETS[name][key])
        .filter(Boolean);
      expect(new Set(bound).size).toBe(bound.length);
    }
  });

  it.each(presetNames)('%s leaves the mind map editor its keyboard', name => {
    // The outline IS the editor's interface. A preset that blanked these would leave a student in a
    // document they cannot save, undo or search — which is not a reading preference.
    for (const key of shortcutKeysInScope(MIND_MAP_SCOPE)) {
      expect(SHORTCUT_PRESETS[name][key]).toBe(DEFAULT_SHORTCUTS[key]);
    }
  });

  it('replaces the whole saved set, so no key is left on the previous preset', async () => {
    const popup = mountPopup();
    const stored = { keyboardShortcuts: { tts_play_pause: 'Alt+Q', action_tray_focus: 'Alt+Q' } };
    // Both call forms: the shared settings writer awaits the promise MV3 returns, while the popup's
    // own reads still pass a callback.
    chrome.storage.local.get = jest.fn((_key, cb) => {
      const result = { assist_settings: stored };
      if (typeof cb === 'function') {
        cb(result);
        return undefined;
      }
      return Promise.resolve(result);
    });
    chrome.storage.local.set = jest.fn((items, cb) => {
      Object.assign(stored, items.assist_settings);
      if (typeof cb === 'function') {
        cb();
        return undefined;
      }
      return Promise.resolve();
    });
    popup.loadKeyboardShortcuts = jest.fn();
    popup.injectShortcutBadges = jest.fn();

    await popup.applyShortcutPreset('minimal');

    expect(stored.keyboardShortcuts).toEqual(SHORTCUT_PRESETS.minimal);
  });

  it('saves nothing for a preset name it does not know', async () => {
    const popup = mountPopup();
    chrome.storage.local.set = jest.fn();

    await popup.applyShortcutPreset('nonsense');

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
