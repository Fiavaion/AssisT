/**
 * @jest-environment jsdom
 *
 * The highlight menu's buttons are wired with the shared helper, which activates on
 * mousedown. The menu itself is shown from a document-level `mouseup` listener whenever
 * text is selected. So a real click on "Speed" hid the menu on mousedown and the paired
 * mouseup — with the selection still in place — put it straight back, on top of the RSVP
 * overlay it had just opened.
 *
 * An action dismisses the menu for that click: the mouseup that finishes the same press
 * must not re-show it, while the next genuine selection still does.
 */

jest.mock('../../../src/features/mindMap/capture.js', () => ({
  captureFromSelection: jest.fn(),
}));

/** Pretend the student has text selected on the page. */
function selectSomeText(text = 'Working memory holds a little') {
  const range = document.createRange();
  const target = document.getElementById('para');
  range.selectNodeContents(target);
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

function buttonLabelled(label) {
  return menu().querySelector(`[aria-label="${label}"]`);
}

let rsvpStart;

// The content script is loaded once per page, and loading it registers document-level
// listeners. Requiring it per test would stack those listeners and let a stale copy
// re-open the menu, so it is imported once here, exactly as the page does it.
beforeAll(() => {
  chrome.storage.local.get = jest.fn((keys, callback) => {
    if (typeof callback === 'function') {
      callback({ aiMode: 'off' });
      return undefined;
    }
    return Promise.resolve({});
  });
  chrome.storage.onChanged = { addListener: jest.fn() };

  require('../../../src/features/highlightMenu/highlightMenu.js');
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  rsvpStart = jest.fn();
  window.assistFeatures = { rsvp: { start: rsvpStart } };

  // Back to a page with nothing selected and no menu showing.
  document.body.innerHTML = '<p id="para">Working memory holds a little</p>';
  clearSelection();
  document.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
});

afterEach(() => {
  jest.useRealTimers();
  delete window.assistFeatures;
});

describe('highlight menu — an action dismisses it for that click', () => {
  test('a selection shows the menu on mouseup', () => {
    selectSomeText();
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    expect(menu()).not.toBeNull();
  });

  test('Speed Read starts RSVP and the menu does not come back on the paired mouseup', () => {
    selectSomeText();
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    const speed = buttonLabelled('Speed Read (RSVP)');
    expect(speed).not.toBeNull();

    // A real click: mousedown activates the button, then mouseup reaches the document.
    speed.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    // The overlay is handed the element the selection sits in: the button that opened it is
    // gone by the time it closes, so that is where focus goes back to.
    expect(rsvpStart).toHaveBeenCalledWith('Working memory holds a little', {
      returnFocus: document.getElementById('para'),
    });
    expect(menu()).toBeNull();

    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    expect(menu()).toBeNull();
  });

  test('every other action is dismissed the same way', () => {
    selectSomeText();
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    const cite = buttonLabelled('Save as Citation');
    expect(cite).not.toBeNull();

    cite.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    expect(menu()).toBeNull();
  });

  test('the next genuine selection still shows the menu', () => {
    selectSomeText();
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    buttonLabelled('Speed Read (RSVP)').dispatchEvent(
      new window.MouseEvent('mousedown', { bubbles: true })
    );
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    expect(menu()).toBeNull();

    // A fresh drag-select somewhere else on the page.
    selectSomeText('a second passage');
    document.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    expect(menu()).not.toBeNull();
  });

  test('a keyboard activation does not swallow a later selection', () => {
    selectSomeText();
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    buttonLabelled('Speed Read (RSVP)').dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(rsvpStart).toHaveBeenCalled();
    expect(menu()).toBeNull();

    selectSomeText('a second passage');
    document.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    expect(menu()).not.toBeNull();
  });

  test('a mouseup with nothing selected leaves the menu hidden', () => {
    clearSelection();
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    expect(menu()).toBeNull();
  });
});
