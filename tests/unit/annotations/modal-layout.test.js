/**
 * @jest-environment jsdom
 *
 * At 1280x800 the annotation dialog had a horizontal scrollbar along its bottom edge, the
 * "Add tags" input ran past the right edge and was cut off, and Cancel/Save sat on the lower
 * edge of the box. The cause is plain CSS: the comment box and the tag input are `width: 100%`
 * with padding and a 2px border and no `box-sizing`, so each is 28px wider than the space it
 * has, and the whole dialog — not its body — was the scroll container.
 *
 * jsdom has no layout, but it does compute the cascade, so these lock the properties that
 * decide the layout. The pixel check itself is a Chrome check.
 */

import {
  openAnnotationModal,
  initializeInlineAnnotations,
} from '../../../src/features/annotations/inline-annotations.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';

jest.mock('../../../src/features/annotations/storage-adapter.js');

function overlay() {
  return document.querySelector('.assist-annotation-modal-overlay');
}

function styleOf(selector) {
  return window.getComputedStyle(overlay().querySelector(selector));
}

describe('annotation dialog layout', () => {
  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    document.body.innerHTML = '<p id="p">The quick brown fox.</p>';

    storageAdapter.getStorageAdapter = jest.fn(() => ({
      create: jest.fn(async data => ({ ...data, id: 1 })),
      update: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      getByUrl: jest.fn().mockResolvedValue([]),
    }));
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    await initializeInlineAnnotations();
    openAnnotationModal(null, 'The quick brown fox', {});
  });

  afterEach(() => {
    overlay()?.remove();
  });

  test('every control in the dialog measures its own padding and border', () => {
    expect(styleOf('.assist-annotation-textarea').boxSizing).toBe('border-box');
    expect(styleOf('.assist-tag-input').boxSizing).toBe('border-box');
  });

  test('the body scrolls, not the dialog, so the buttons keep their padding', () => {
    expect(
      window.getComputedStyle(overlay().querySelector('.assist-annotation-modal')).overflow
    ).toBe('hidden');
    expect(styleOf('.assist-annotation-modal-body').overflowY).toBe('auto');
    expect(
      window.getComputedStyle(overlay().querySelector('.assist-annotation-modal')).flexDirection
    ).toBe('column');
  });

  test('the colour swatches wrap instead of forcing the dialog wider', () => {
    expect(styleOf('.assist-annotation-color-picker').flexWrap).toBe('wrap');
  });
});

describe('annotation dialog focus return', () => {
  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    document.body.innerHTML = '<p id="p">The quick brown fox.</p>';

    storageAdapter.getStorageAdapter = jest.fn(() => ({
      create: jest.fn(async data => ({ ...data, id: 1 })),
      update: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      getByUrl: jest.fn().mockResolvedValue([]),
    }));
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    await initializeInlineAnnotations();
  });

  afterEach(() => {
    overlay()?.remove();
  });

  test('Cancel returns focus to the text the student selected, not the top of the page', () => {
    const para = document.getElementById('p');
    const range = document.createRange();
    range.selectNodeContents(para);

    // Opened from the highlight menu: nothing is focused, because the menu that opened the
    // dialog activated on mousedown and has already been removed.
    openAnnotationModal(null, 'The quick brown fox', {}, range);
    overlay()
      .querySelector('.assist-annotation-btn-cancel')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(para);
  });
});
