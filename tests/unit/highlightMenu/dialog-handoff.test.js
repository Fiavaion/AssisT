/**
 * @jest-environment jsdom
 *
 * Handing a selection over to a dialog.
 *
 * Overnight testing found the highlight menu still floating over the Annotation and
 * Translation dialogs, with Tab walking out of the dialog and onto the menu's buttons. The
 * menu now goes away *before* the dialog is opened, so a dialog is never asked to trap focus
 * on a page that still has the menu on it.
 *
 * The same hand-off carries the element the selection lives in, because the menu button the
 * dialog would otherwise return focus to no longer exists by the time the dialog closes.
 *
 * "Add to mind map" is also covered: it used to be offered with the mind map switched off and
 * then did nothing a student could see.
 */

jest.mock('../../../src/features/mindMap/capture.js', () => ({
  captureFromSelection: jest.fn(text => ({ text, quote: text })),
}));

jest.mock('../../../src/core/ui/toast.js', () => ({
  showToast: jest.fn(),
}));

const { showToast } = require('../../../src/core/ui/toast.js');
const { captureFromSelection } = require('../../../src/features/mindMap/capture.js');

let storageChanged;

function selectParagraph(text = 'Working memory holds a little') {
  const range = document.createRange();
  range.selectNodeContents(document.getElementById('para'));
  range.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    right: 300,
    bottom: 220,
    width: 200,
    height: 20,
  });
  window.getSelection = jest.fn(() => ({
    toString: () => text,
    rangeCount: 1,
    getRangeAt: () => range,
  }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
}

function clearSelection() {
  window.getSelection = jest.fn(() => ({
    toString: () => '',
    rangeCount: 0,
    getRangeAt: () => null,
  }));
}

function menu() {
  return document.getElementById('assist-highlight-menu');
}

function press(label) {
  menu()
    .querySelector(`[aria-label="${label}"]`)
    .dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
}

/** Tell the feature the mind map setting changed, the way chrome.storage does. */
function setMindMapEnabled(enabled) {
  storageChanged({ assist_settings: { newValue: { mindMap: { enabled } } } }, 'local');
}

beforeAll(() => {
  chrome.storage.local.get = jest.fn((keys, callback) => {
    if (typeof callback === 'function') {
      callback({ aiMode: 'off' });
      return undefined;
    }
    return Promise.resolve({});
  });
  chrome.storage.onChanged = {
    addListener: jest.fn(listener => {
      storageChanged = listener;
    }),
  };

  require('../../../src/features/highlightMenu/highlightMenu.js');
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  showToast.mockClear();
  // resetMocks wipes what the jest.mock factory set up, so the implementation is restored here.
  captureFromSelection.mockImplementation(text => ({ text, quote: text }));

  document.body.innerHTML = '<p id="para">Working memory holds a little</p>';
  clearSelection();
  document.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  setMindMapEnabled(true);
});

afterEach(() => {
  delete window.assistFeatures;
});

describe('the menu is gone before a dialog opens', () => {
  test.each([
    ['Add Annotation', 'inlineAnnotations'],
    ['Translate', 'translationUI'],
    ['Dictionary Lookup', 'dictionary'],
  ])('%s', (label, _feature) => {
    let menuWhenOpened = 'not called';
    window.assistFeatures = {
      inlineAnnotations: {
        openAnnotationModal: () => {
          menuWhenOpened = menu();
        },
        getPositionFromRange: () => ({}),
      },
      translationUI: {
        openModal: () => {
          menuWhenOpened = menu();
        },
      },
      dictionary: {
        lookup: () => {
          menuWhenOpened = menu();
        },
      },
    };

    selectParagraph();
    press(label);

    expect(menuWhenOpened).toBeNull();
    expect(menu()).toBeNull();
  });
});

describe('the dialog is told where to put focus back', () => {
  test('Dictionary is given the element the selection sits in', () => {
    const lookup = jest.fn();
    window.assistFeatures = { dictionary: { lookup } };

    selectParagraph();
    press('Dictionary Lookup');

    expect(lookup).toHaveBeenCalledWith(
      'Working memory holds a little',
      expect.objectContaining({ returnFocus: document.getElementById('para') })
    );
  });

  test('Translate is given the same element', () => {
    const openModal = jest.fn();
    window.assistFeatures = { translationUI: { openModal } };

    selectParagraph();
    press('Translate');

    expect(openModal).toHaveBeenCalledWith(
      'Working memory holds a little',
      null,
      null,
      expect.objectContaining({ returnFocus: document.getElementById('para') })
    );
  });
});

describe('Add to mind map', () => {
  test('is not offered while the mind map is switched off', () => {
    window.assistFeatures = {};
    setMindMapEnabled(false);

    selectParagraph();

    expect(menu().querySelector('[aria-label="Add to mind map"]')).toBeNull();
  });

  test('confirms in words which map the note landed in', async () => {
    window.assistFeatures = {};
    chrome.runtime.sendMessage = jest
      .fn()
      .mockResolvedValue({ success: true, mapTitle: 'Reading notes' });

    selectParagraph();
    press('Add to mind map');
    await Promise.resolve();
    await Promise.resolve();

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('Reading notes'),
      expect.anything(),
      expect.anything()
    );
  });

  test('says so in a sentence when the note could not be added', async () => {
    window.assistFeatures = {};
    chrome.runtime.sendMessage = jest.fn().mockRejectedValue(new Error('no receiver'));

    selectParagraph();
    press('Add to mind map');
    await Promise.resolve();
    await Promise.resolve();

    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/could not add/i),
      expect.anything(),
      expect.anything()
    );
  });
});
