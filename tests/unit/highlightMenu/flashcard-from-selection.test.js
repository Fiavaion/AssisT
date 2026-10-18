/**
 * @jest-environment jsdom
 *
 * A student with the flashcards support on and nothing stored yet must be able to make their
 * FIRST card. Before this, the only button that made a card lived inside the floating "Cards
 * ready" card, and that card only mounts when a card is already due — so on a fresh profile the
 * one route into the feature did not exist. The highlight menu is where a student already goes
 * with text selected, so the action belongs there, next to Annotate and Save as Citation.
 */

jest.mock('../../../src/features/mindMap/capture.js', () => ({
  captureFromSelection: jest.fn(() => ({ text: 'label', quote: 'quote' })),
}));

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

import { showToast } from '../../../src/core/ui/toast.js';
import { STORE_KEY } from '../../../src/features/flashcards/flashcards-store.js';
import { COMPANION_STORAGE_KEY } from '../../../src/features/companion/companion-settings.js';

const LABEL = 'Make a flashcard';
const EIGHT_WORDS = 'Working memory holds about four things at any one time';

let store;
let storageListeners;

function selectSomeText(text = EIGHT_WORDS) {
  const range = document.createRange();
  range.selectNodeContents(document.getElementById('para'));
  // jsdom has no layout, so the menu's positioning needs a rect of its own.
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
}

function menu() {
  return document.getElementById('assist-highlight-menu');
}

function cardButton() {
  return menu()?.querySelector(`[aria-label="${LABEL}"]`);
}

/** Let the card builder's read-then-write chain settle. */
async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function fireCompanionChange(value) {
  for (const listener of storageListeners) {
    listener({ [COMPANION_STORAGE_KEY]: { newValue: value } }, 'local');
  }
}

// jest.config sets resetMocks, which wipes an implementation given in beforeAll, so the storage
// mocks are (re)installed for every test (jest.config resetMocks wipes factory implementations).
function installStorageMocks() {
  chrome.storage.local.get = jest.fn((keys, callback) => {
    const read = () => {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const key of list) {
        if (key in store) {
          out[key] = store[key];
        }
      }
      return out;
    };
    if (typeof callback === 'function') {
      callback(read());
      return undefined;
    }
    return Promise.resolve(read());
  });
  chrome.storage.local.set = jest.fn(async payload => {
    Object.assign(store, payload);
  });
  chrome.storage.onChanged = { addListener: jest.fn(l => storageListeners.push(l)) };
}

// Loading the content-script module registers document-level listeners, so it is loaded once,
// exactly as a page does it.
beforeAll(() => {
  store = {};
  storageListeners = [];
  installStorageMocks();

  require('../../../src/features/highlightMenu/highlightMenu.js');
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  showToast.mockClear();
  // A fresh profile: the support is on by default and NOTHING is stored.
  for (const key of Object.keys(store)) {
    delete store[key];
  }
  const listeners = storageListeners.slice();
  installStorageMocks();
  storageListeners = listeners;
  document.body.innerHTML = '<p id="para">Working memory holds a little</p>';
  document.title = 'Reading list';
  // A press outside the menu ends any suppression a previous keyboard activation left behind,
  // exactly as it does on a page.
  document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  fireCompanionChange(undefined);
});

afterEach(() => {
  menu()?.remove();
  jest.restoreAllMocks();
});

describe('a first card from a text selection', () => {
  test('the menu offers it with nothing stored and the support on', () => {
    selectSomeText();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(store[STORE_KEY]).toBeUndefined();
    expect(cardButton()).toBeTruthy();
  });

  test('it is one of the menu buttons, so it inherits their 32px target', () => {
    selectSomeText();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(cardButton().className).toBe('assist-hm-btn');
  });

  test('using it by keyboard stores the card and says so once', async () => {
    selectSomeText();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    const button = cardButton();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();

    expect(store[STORE_KEY]).toHaveLength(1);
    expect(store[STORE_KEY][0].sourceType).toBe('highlight');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toMatch(/card/i);
  });

  test('a mouse press stores the card too, and the menu goes away', async () => {
    selectSomeText();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    cardButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await flush();

    expect(store[STORE_KEY]).toHaveLength(1);
    expect(menu()).toBeNull();
  });

  test('too short a selection stores nothing and says what to do', async () => {
    selectSomeText('too short');
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    cardButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await flush();

    expect(store[STORE_KEY]).toBeUndefined();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toMatch(/8 words/);
  });
});

describe('nothing offered when the support is off', () => {
  test('switching flashcards off takes the action out of the menu', () => {
    fireCompanionChange({ flashcards: false });

    selectSomeText();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(cardButton()).toBeFalsy();
  });

  test('switching it back on brings it back', () => {
    fireCompanionChange({ flashcards: false });
    fireCompanionChange({ flashcards: true });

    selectSomeText();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(cardButton()).toBeTruthy();
  });
});
