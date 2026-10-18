/**
 * @jest-environment jsdom
 *
 * The highlight menu's extended options — which buttons the student keeps, and how long the
 * menu stays up before it gets out of the way — had no coverage of what they actually do. The
 * suite that once covered them only checked that the popup's switches could be clicked, which
 * says nothing about whether the menu on the page obeys them.
 *
 * So these tests set the same `highlightMenuSettings` object the popup writes, then make a
 * selection and look at the toolbar the content script builds: whether the button is gone,
 * whether the roving tab stop is still sane once one is gone, and whether the auto-hide timer
 * runs for the length the student chose.
 *
 * jsdom is the right environment: every assertion is about the DOM the code builds, about
 * attributes the code sets, and about timers. Nothing rests on layout, on offsetParent or on an
 * inherited computed style, and the toolbar's absence is proven by the element not existing
 * rather than by any notion of visibility.
 */

jest.mock('../../../src/features/mindMap/capture.js', () => ({
  captureFromSelection: jest.fn(),
}));

/** The five per-button switches the popup offers, with the button each one controls. */
const BUTTON_SWITCHES = [
  { key: 'showTTS', label: 'Read Aloud (TTS)' },
  { key: 'showDictionary', label: 'Dictionary Lookup' },
  { key: 'showTranslate', label: 'Translate' },
  { key: 'showAnnotate', label: 'Add Annotation' },
  { key: 'showSpeedRead', label: 'Speed Read (RSVP)' },
];

/** Pretend the student has text selected on the page. */
function selectSomeText(text = 'Working memory holds a little') {
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

/** No text selected any more. */
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

function buttonLabels() {
  return Array.from(menu().querySelectorAll('.assist-hm-btn')).map(b =>
    b.getAttribute('aria-label')
  );
}

/** Show the menu the way a student does: select, then release the mouse. */
function showMenu() {
  selectSomeText();
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
}

/**
 * The storage listener the content script registered at import. It is captured at import time
 * rather than read back from the mock, because jest.config.cjs sets `resetMocks: true` and that
 * clears `mock.calls` before every test.
 *
 * @type {Function}
 */
let storageListener;

/**
 * Push a settings object through the same storage listener the popup's save triggers.
 *
 * @param {Object} settings - The `highlightMenuSettings` value, as the popup writes it.
 */
function pushSettings(settings) {
  storageListener({ highlightMenuSettings: { newValue: settings } }, 'local');
}

/** The defaults the popup ships, so each test changes exactly one thing. */
function defaults(overrides = {}) {
  return {
    enabled: true,
    showTTS: true,
    showDictionary: true,
    showTranslate: true,
    showAnnotate: true,
    showSaveCitation: true,
    showMindMap: true,
    showSpeedRead: true,
    showFlashcard: true,
    autoHideDelay: 5000,
    ...overrides,
  };
}

// The content script is loaded once per page, and loading it registers document-level
// listeners. Requiring it per test would stack those listeners, so it is imported once here,
// exactly as the page does it.
beforeAll(() => {
  chrome.storage.local.get = jest.fn((keys, callback) => {
    if (typeof callback === 'function') {
      callback({ aiMode: 'off' });
      return undefined;
    }
    return Promise.resolve({});
  });
  chrome.storage.onChanged = {
    addListener: listener => {
      storageListener = listener;
    },
  };

  require('../../../src/features/highlightMenu/highlightMenu.js');
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  window.assistFeatures = { rsvp: { start: jest.fn() } };
  document.body.innerHTML = '<p id="para">Working memory holds a little</p>';

  // Back to the shipped defaults with nothing selected and no menu showing.
  pushSettings(defaults());
  clearSelection();
  document.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete window.assistFeatures;
});

describe('per-button visibility', () => {
  test('with everything on, all five switchable buttons are offered', () => {
    showMenu();

    const labels = buttonLabels();
    BUTTON_SWITCHES.forEach(({ label }) => expect(labels).toContain(label));
  });

  test.each(BUTTON_SWITCHES)(
    'turning off $key removes only $label',
    ({ key, label }) => {
      pushSettings(defaults({ [key]: false }));
      showMenu();

      const labels = buttonLabels();
      expect(labels).not.toContain(label);
      BUTTON_SWITCHES.filter(other => other.key !== key).forEach(other =>
        expect(labels).toContain(other.label)
      );
    }
  );

  test('a hidden button leaves exactly one tab stop, on the first button that is left', () => {
    // The toolbar is a roving tab stop: one button at tabindex 0 and the rest at -1. Indices are
    // handed out while the buttons are built, so dropping one must not leave the 0 on a button
    // that no longer exists, which would make the whole toolbar unreachable by keyboard.
    pushSettings(defaults({ showTTS: false }));
    showMenu();

    const buttons = Array.from(menu().querySelectorAll('.assist-hm-btn'));
    const stops = buttons.filter(b => b.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(buttons[0]);
    expect(stops[0].getAttribute('aria-label')).toBe('Dictionary Lookup');
  });

  test('turning every switchable button off still leaves a usable toolbar', () => {
    // Not an empty box with a role of toolbar and nothing in it: the actions that are not behind
    // one of these switches must survive, or the student is left with a menu that does nothing.
    pushSettings(
      defaults(
        BUTTON_SWITCHES.reduce((acc, { key }) => ({ ...acc, [key]: false }), {})
      )
    );
    showMenu();

    const labels = buttonLabels();
    BUTTON_SWITCHES.forEach(({ label }) => expect(labels).not.toContain(label));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).toContain('Save as Citation');
  });
});

describe('auto-hide delay', () => {
  test('the menu is still there one millisecond before the chosen delay', () => {
    pushSettings(defaults({ autoHideDelay: 3000 }));
    showMenu();
    expect(menu()).not.toBeNull();

    jest.advanceTimersByTime(2999);

    expect(menu()).not.toBeNull();
  });

  test('the menu is gone once the chosen delay has passed', () => {
    pushSettings(defaults({ autoHideDelay: 3000 }));
    showMenu();

    jest.advanceTimersByTime(3000);

    expect(menu()).toBeNull();
  });

  test('a longer delay really is longer: the menu outlives the shorter one', () => {
    // Proves the timer uses the saved number rather than a constant that happens to match.
    pushSettings(defaults({ autoHideDelay: 8000 }));
    showMenu();

    jest.advanceTimersByTime(5000);
    expect(menu()).not.toBeNull();

    jest.advanceTimersByTime(3000);
    expect(menu()).toBeNull();
  });

  test('a delay of zero means the menu never hides itself', () => {
    // The bottom of the slider is "stay until I dismiss it" — a student who reads slowly and
    // needs the menu to wait for them.
    pushSettings(defaults({ autoHideDelay: 0 }));
    showMenu();

    jest.advanceTimersByTime(600000);

    expect(menu()).not.toBeNull();
  });

  test('hovering the menu stops it disappearing under the pointer', () => {
    pushSettings(defaults({ autoHideDelay: 3000 }));
    showMenu();

    menu().dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    jest.advanceTimersByTime(60000);

    expect(menu()).not.toBeNull();
  });

  test('leaving the menu starts the delay again from the beginning', () => {
    pushSettings(defaults({ autoHideDelay: 3000 }));
    showMenu();
    const toolbar = menu();

    toolbar.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    jest.advanceTimersByTime(10000);
    toolbar.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: false }));

    jest.advanceTimersByTime(2999);
    expect(menu()).not.toBeNull();

    jest.advanceTimersByTime(1);
    expect(menu()).toBeNull();
  });

  test('a new selection restarts the delay rather than inheriting the old timer', () => {
    pushSettings(defaults({ autoHideDelay: 3000 }));
    showMenu();

    jest.advanceTimersByTime(2500);
    expect(menu()).not.toBeNull();

    showMenu();
    jest.advanceTimersByTime(2500);
    expect(menu()).not.toBeNull();

    jest.advanceTimersByTime(500);
    expect(menu()).toBeNull();
  });
});
