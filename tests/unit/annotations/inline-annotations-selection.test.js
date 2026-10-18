/**
 * Regression tests: a student must be able to SELECT and COPY the text inside their own
 * highlight, while the highlight still opens the editor on click and on Enter/Space.
 *
 * The defect: attachAccessibleHandler bound mousedown and called preventDefault(), which
 * cancels text selection. Highlights now opt out via `allowTextSelection`.
 */

import { createInlineAnnotation, initializeInlineAnnotations } from '../../../src/features/annotations/inline-annotations.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';

jest.mock('../../../src/features/annotations/storage-adapter.js');
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  createTagInput: jest.fn(() => ({ getTags: jest.fn(() => []) })),
  renderTagPills: jest.fn(),
}));

if (!global.chrome.storage.local.onChanged) {
  global.chrome.storage.local.onChanged = { addListener: jest.fn() };
}
if (!global.chrome.runtime.onMessage) {
  global.chrome.runtime.onMessage = { addListener: jest.fn() };
}

const POSITION = { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' };

function modalIsOpen() {
  return Boolean(document.querySelector('.assist-annotation-modal-overlay'));
}

function dispatch(element, type) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe('Annotation highlights stay selectable', () => {
  let highlight;
  // The module keeps a live map of rendered annotations, so each test needs a fresh id.
  let nextId = 1;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    document.body.innerHTML = '<div><p id="test-para">test text here</p></div>';
    window.getSelection().removeAllRanges();

    const adapter = {
      create: jest.fn().mockResolvedValue({
        id: nextId++,
        type: 'annotation',
        url: 'https://example.com',
        selectedText: 'test',
        comment: 'note',
        color: 'yellow',
        tags: [],
        position: POSITION,
      }),
      update: jest.fn(),
      delete: jest.fn(),
      getByUrl: jest.fn().mockResolvedValue([]),
    };
    storageAdapter.getStorageAdapter = jest.fn(() => adapter);
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    await initializeInlineAnnotations();
    await createInlineAnnotation({ selectedText: 'test', position: POSITION, comment: 'note' });

    highlight = document.querySelector('.assist-inline-annotation');
    expect(highlight).not.toBeNull();
  });

  afterEach(() => {
    document.querySelector('.assist-annotation-modal-overlay')?.remove();
  });

  test('mousedown neither opens the editor nor cancels selection', () => {
    const event = dispatch(highlight, 'mousedown');

    expect(event.defaultPrevented).toBe(false);
    expect(modalIsOpen()).toBe(false);
  });

  test('a plain click opens the editor', () => {
    dispatch(highlight, 'click');

    expect(modalIsOpen()).toBe(true);
  });

  test('a click that ends a drag-select leaves the selection alone', () => {
    const range = document.createRange();
    range.selectNodeContents(highlight.firstChild);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    dispatch(highlight, 'click');

    expect(modalIsOpen()).toBe(false);
    expect(String(window.getSelection())).toBe('test');
  });

  test('Enter still opens the editor (SC 2.1.1)', () => {
    highlight.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );

    expect(modalIsOpen()).toBe(true);
  });
});
