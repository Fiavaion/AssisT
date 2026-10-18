/**
 * @jest-environment jsdom
 *
 * The popup's three STT dialogs — "View all voice commands", "Add Custom Word" and
 * "Manage Custom Words".
 *
 * Overnight release testing found neither was a dialog at all: no `role="dialog"`, no `aria-modal`,
 * no accessible name, a close button whose only label was "×", `<label>`s bound to nothing, Tab
 * walking straight out into the page behind the overlay, Escape dead on the Add dialog, focus
 * dropped on `<body>` after "Add Word", and a native `alert()` for a duplicate word. Each
 * assertion below is one of those, so the dialogs cannot regress to being overlays again.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

let PopupController;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

/** The real popup body with a controller whose side effects are stubbed. @returns {Object} */
function mountPopup() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  const popup = new PopupController();
  popup.settings = { stt: { vocabulary: { customWords: [], enabledPresets: [] } } };
  popup.saveSettings = jest.fn();
  popup.sendCommandToTab = jest.fn();
  popup.updateVocabularyStats = jest.fn();
  popup.updateStatus = jest.fn();
  return popup;
}

/** trapFocus moves focus in on the next macrotask, so let it run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** @param {HTMLElement} element @param {string} key @returns {KeyboardEvent} */
function pressKey(element, key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/** @param {HTMLElement} element */
function pressPointer(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('the voice commands dialog', () => {
  /** @returns {Promise<{popup, opener, backdrop, dialog}>} */
  async function open() {
    const popup = mountPopup();
    const opener = document.getElementById('stt-show-commands');
    popup.showVoiceCommandsModal(opener);
    await settle();
    const backdrop = document.getElementById('voice-commands-modal');
    return { popup, opener, backdrop, dialog: backdrop.querySelector('[role="dialog"]') };
  }

  it('is a modal dialog named by its own heading', async () => {
    const { dialog } = await open();
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby'));
    expect(heading.textContent).toMatch(/voice commands/i);
  });

  it('gives the close button a name a screen reader can read out', async () => {
    await open();
    const close = document.getElementById('close-voice-commands-modal');
    expect(close.getAttribute('aria-label')).toMatch(/close/i);
  });

  it('moves the keyboard into the dialog on open', async () => {
    const { dialog } = await open();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('keeps Tab inside itself', async () => {
    const { dialog } = await open();
    expect(pressKey(document.activeElement, 'Tab').defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and hands the keyboard back to the button that opened it', async () => {
    const { opener } = await open();
    pressKey(document.activeElement, 'Escape');
    expect(document.getElementById('voice-commands-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on the close button and hands the keyboard back', async () => {
    const { opener } = await open();
    pressKey(document.getElementById('close-voice-commands-modal'), 'Enter');
    expect(document.getElementById('voice-commands-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a press outside the dialog', async () => {
    const { backdrop } = await open();
    pressPointer(backdrop);
    expect(document.getElementById('voice-commands-modal')).toBeNull();
  });
});

describe('the add custom word dialog', () => {
  /** @returns {Promise<{popup, opener, backdrop, dialog, word, phonetic}>} */
  async function open() {
    const popup = mountPopup();
    const opener = document.getElementById('btn-add-vocab-word');
    popup.showAddVocabularyWordModal(opener);
    await settle();
    const backdrop = document.getElementById('add-vocab-modal');
    return {
      popup,
      opener,
      backdrop,
      dialog: backdrop.querySelector('[role="dialog"]'),
      word: document.getElementById('vocab-word-input'),
      phonetic: document.getElementById('vocab-phonetic-input'),
    };
  }

  it('is a modal dialog named by its own heading', async () => {
    const { dialog } = await open();
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby'));
    expect(heading.textContent).toMatch(/add custom word/i);
  });

  it('gives the close button a name', async () => {
    await open();
    expect(document.getElementById('close-add-vocab-modal').getAttribute('aria-label')).toMatch(
      /close/i
    );
  });

  it('binds every label to the field it names', async () => {
    const { dialog, word, phonetic } = await open();
    const labels = Array.from(dialog.querySelectorAll('label')).map(l => l.getAttribute('for'));
    expect(labels).toEqual([word.id, phonetic.id]);
  });

  it('puts the keyboard in the word field, not on the close button', async () => {
    const { word } = await open();
    expect(document.activeElement).toBe(word);
  });

  it('keeps Tab inside itself', async () => {
    const { dialog } = await open();
    expect(pressKey(document.activeElement, 'Tab').defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('lets a space be typed into the word field — a phrase is two words', async () => {
    const { word } = await open();
    expect(pressKey(word, ' ').defaultPrevented).toBe(false);
  });

  it('closes on Escape and hands the keyboard back to the button that opened it', async () => {
    const { opener } = await open();
    pressKey(document.activeElement, 'Escape');
    expect(document.getElementById('add-vocab-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Cancel and hands the keyboard back', async () => {
    const { opener } = await open();
    pressKey(document.getElementById('cancel-add-vocab'), 'Enter');
    expect(document.getElementById('add-vocab-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('saves the word, closes, and hands the keyboard back after Add Word', async () => {
    const { popup, opener, word, phonetic } = await open();
    word.value = 'adenocarcinoma';
    phonetic.value = 'ad-uh-no-kar-suh-NO-muh';

    pressKey(document.getElementById('confirm-add-vocab'), 'Enter');
    await settle();

    expect(popup.settings.stt.vocabulary.customWords).toEqual([
      { word: 'adenocarcinoma', phonetic: 'ad-uh-no-kar-suh-NO-muh' },
    ]);
    expect(document.getElementById('add-vocab-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('submits on Enter in the word field', async () => {
    const { popup, word } = await open();
    word.value = 'anaphora';
    pressKey(word, 'Enter');
    await settle();
    expect(popup.settings.stt.vocabulary.customWords).toEqual([{ word: 'anaphora', phonetic: '' }]);
  });

  it('answers a duplicate word inline and announced, never with a native alert', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const { popup, word } = await open();
    popup.settings.stt.vocabulary.customWords = [{ word: 'anaphora', phonetic: '' }];
    word.value = 'Anaphora';

    pressKey(document.getElementById('confirm-add-vocab'), 'Enter');
    await settle();

    const error = document.getElementById('vocab-word-error');
    expect(error.textContent).toMatch(/already/i);
    expect(error.getAttribute('role')).toBe('alert');
    expect(word.getAttribute('aria-describedby')).toContain('vocab-word-error');
    expect(word.getAttribute('aria-invalid')).toBe('true');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(document.getElementById('add-vocab-modal')).not.toBeNull();
    expect(popup.settings.stt.vocabulary.customWords).toHaveLength(1);
    alertSpy.mockRestore();
  });

  it('says so inline when the word field is empty', async () => {
    const { popup } = await open();
    pressKey(document.getElementById('confirm-add-vocab'), 'Enter');
    await settle();
    expect(document.getElementById('vocab-word-error').textContent).toMatch(/enter/i);
    expect(popup.saveSettings).not.toHaveBeenCalled();
  });

  it('clears the inline message once the student edits the field', async () => {
    const { word } = await open();
    pressKey(document.getElementById('confirm-add-vocab'), 'Enter');
    await settle();
    expect(document.getElementById('vocab-word-error').textContent).not.toBe('');

    word.value = 'a';
    word.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.getElementById('vocab-word-error').textContent).toBe('');
    expect(word.getAttribute('aria-invalid')).toBeNull();
  });
});

describe('the manage custom words dialog', () => {
  /** @returns {Promise<{popup, opener, backdrop, dialog}>} */
  async function open(customWords = [{ word: 'anaphora', phonetic: 'uh-NAF-or-uh' }]) {
    const popup = mountPopup();
    popup.settings.stt.vocabulary.customWords = customWords;
    const opener = document.getElementById('btn-manage-vocabulary');
    popup.showManageVocabularyModal(opener);
    await settle();
    const backdrop = document.getElementById('manage-vocab-modal');
    return { popup, opener, backdrop, dialog: backdrop.querySelector('[role="dialog"]') };
  }

  it('is a modal dialog named by its own heading', async () => {
    const { dialog } = await open();
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby'));
    expect(heading.textContent).toMatch(/manage custom words/i);
  });

  it('gives the close button a name a screen reader can read out', async () => {
    await open();
    expect(document.getElementById('close-manage-vocab-modal').getAttribute('aria-label')).toMatch(
      /close/i
    );
  });

  it('moves the keyboard into the dialog on open', async () => {
    const { dialog } = await open();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('keeps Tab inside itself', async () => {
    const { dialog } = await open();
    expect(pressKey(document.activeElement, 'Tab').defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and hands the keyboard back to the button that opened it', async () => {
    const { opener } = await open();
    pressKey(document.activeElement, 'Escape');
    expect(document.getElementById('manage-vocab-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Done and hands the keyboard back', async () => {
    const { opener } = await open();
    pressKey(document.getElementById('done-manage-vocab'), 'Enter');
    expect(document.getElementById('manage-vocab-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a press outside the dialog', async () => {
    const { backdrop } = await open();
    pressPointer(backdrop);
    expect(document.getElementById('manage-vocab-modal')).toBeNull();
  });

  it('keeps the keyboard in the reopened dialog after a word is deleted', async () => {
    const { popup } = await open([
      { word: 'anaphora', phonetic: '' },
      { word: 'caesura', phonetic: '' },
    ]);

    pressKey(document.querySelector('.delete-vocab-word'), 'Enter');
    await settle();

    expect(popup.settings.stt.vocabulary.customWords).toEqual([{ word: 'caesura', phonetic: '' }]);
    const reopened = document.getElementById('manage-vocab-modal');
    expect(reopened).not.toBeNull();
    expect(reopened.querySelector('[role="dialog"]').contains(document.activeElement)).toBe(true);
  });

  it('closes cleanly on Escape after a word is deleted, with the keyboard back on the opener', async () => {
    const { opener } = await open([{ word: 'anaphora', phonetic: '' }]);

    pressKey(document.querySelector('.delete-vocab-word'), 'Enter');
    await settle();
    pressKey(document.activeElement, 'Escape');

    expect(document.getElementById('manage-vocab-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
