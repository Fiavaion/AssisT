/**
 * @jest-environment jsdom
 *
 * AssisT must not inject anything into a document that is itself a writing surface.
 *
 * Overnight release testing on the TinyMCE shape — an iframe whose
 * `<body class="mce-content-body" contenteditable>` IS the student's essay field — found the
 * sidebar, the text-statistics badge, the citation bar, the companion chips, the first-run hint
 * and the microphone button all appended inside that body, so the field's own text read
 * "Annotations (0) … Cite this source Voice capture ✍️ history 🎙️ lecture … Typed OK." That is the
 * student's work altered, so both orders are covered here: editable before AssisT loads, and
 * editable only after it has (editors routinely set `contenteditable` once their scripts run).
 */

import {
  isEditableDocument,
  watchForEditableDocument,
  removeInjectedAssistUI,
} from '../../../src/content/utils/editable-document.js';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('contenteditable');
  document.body.className = '';
  document.documentElement.removeAttribute('contenteditable');
  document.designMode = 'off';
  jest.useRealTimers();
});

describe('isEditableDocument', () => {
  test('an ordinary page is not a writing surface', () => {
    document.body.innerHTML = '<p>Some reading</p><textarea></textarea>';
    expect(isEditableDocument()).toBe(false);
  });

  test('a contenteditable body is', () => {
    document.body.setAttribute('contenteditable', '');
    expect(isEditableDocument()).toBe(true);
  });

  test('contenteditable="true" on the body is', () => {
    document.body.setAttribute('contenteditable', 'true');
    expect(isEditableDocument()).toBe(true);
  });

  test('contenteditable="false" on the body is not', () => {
    document.body.setAttribute('contenteditable', 'false');
    expect(isEditableDocument()).toBe(false);
  });

  test('a contenteditable documentElement is', () => {
    document.documentElement.setAttribute('contenteditable', 'true');
    expect(isEditableDocument()).toBe(true);
  });

  test('designMode "on" is', () => {
    document.designMode = 'on';
    expect(isEditableDocument()).toBe(true);
  });

  test('a known editor body class is, even before the attribute appears', () => {
    document.body.className = 'mce-content-body';
    expect(isEditableDocument()).toBe(true);
  });

  test('a page with an editable element inside it is NOT the same thing', () => {
    document.body.innerHTML = '<div contenteditable="true">an essay field</div>';
    expect(isEditableDocument()).toBe(false);
  });
});

describe('watchForEditableDocument', () => {
  test('calls back at once when the document is already editable', () => {
    document.body.setAttribute('contenteditable', 'true');
    const onEditable = jest.fn();

    watchForEditableDocument(onEditable);

    expect(onEditable).toHaveBeenCalledTimes(1);
  });

  test('calls back when the body becomes editable later, and only once', async () => {
    const onEditable = jest.fn();
    const stop = watchForEditableDocument(onEditable);
    expect(onEditable).not.toHaveBeenCalled();

    document.body.setAttribute('contenteditable', 'true');
    await Promise.resolve(); // MutationObserver callbacks are microtasks in jsdom
    expect(onEditable).toHaveBeenCalledTimes(1);

    document.body.className = 'mce-content-body';
    await Promise.resolve();
    expect(onEditable).toHaveBeenCalledTimes(1);

    stop();
  });

  test('catches designMode, which no observer reports', () => {
    jest.useFakeTimers();
    const onEditable = jest.fn();
    watchForEditableDocument(onEditable);

    document.designMode = 'on';
    jest.advanceTimersByTime(1000);

    expect(onEditable).toHaveBeenCalledTimes(1);
  });

  test('stop() means no callback however editable the document becomes', async () => {
    const onEditable = jest.fn();
    const stop = watchForEditableDocument(onEditable);

    stop();
    document.body.setAttribute('contenteditable', 'true');
    await Promise.resolve();

    expect(onEditable).not.toHaveBeenCalled();
  });
});

describe('removeInjectedAssistUI', () => {
  test("takes AssisT's own surfaces off and leaves the page alone", () => {
    document.head.innerHTML = '<style id="assist-companion-styles"></style><style></style>';
    document.body.innerHTML = [
      '<p>The student wrote this.</p>',
      '<div id="assist-annotation-sidebar"></div>',
      '<button class="assist-stt-mic-button"></button>',
      '<div id="assist-companion-dock"></div>',
      '<div class="page-footer"></div>',
    ].join('');

    const removed = removeInjectedAssistUI();

    expect(removed).toBe(4);
    expect(document.getElementById('assist-annotation-sidebar')).toBeNull();
    expect(document.querySelector('.assist-stt-mic-button')).toBeNull();
    expect(document.getElementById('assist-companion-dock')).toBeNull();
    expect(document.getElementById('assist-companion-styles')).toBeNull();
    expect(document.querySelector('p').textContent).toBe('The student wrote this.');
    expect(document.querySelector('.page-footer')).not.toBeNull();
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
  });

  test('never reaches inside the page content, so highlighted words keep their text', () => {
    document.body.innerHTML =
      '<p>Working <span class="assist-word">memory</span> holds a little.</p>';

    removeInjectedAssistUI();

    expect(document.querySelector('p').textContent).toBe('Working memory holds a little.');
  });
});

describe('the load-time guard', () => {
  const GUARD = '../../../src/content/editable-document-guard.js';

  test('stops the content script dead on an editable document', () => {
    document.body.setAttribute('contenteditable', 'true');

    // The throw is the mechanism: content-simple.js imports this module first, and an ES module's
    // imports are evaluated before the importing module's body, so nothing short of aborting the
    // bundle stops the self-initialising features from mounting into the student's field.
    expect(() => jest.isolateModules(() => require(GUARD))).toThrow(/editable document/i);
  });

  test('lets an ordinary page through untouched', () => {
    document.body.innerHTML = '<p>Some reading</p>';

    expect(() => jest.isolateModules(() => require(GUARD))).not.toThrow();
    expect(document.body.innerHTML).toBe('<p>Some reading</p>');
  });
});
