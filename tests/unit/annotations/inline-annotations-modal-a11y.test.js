/**
 * The annotation modal declares aria-modal="true", which is a promise that the rest of the
 * page is unavailable. It kept none of it: Tab walked out into the page behind, and because
 * the Escape handler was bound to the modal, once focus left, Escape stopped closing it —
 * a keyboard trap (SC 2.1.2) with focus dropped to <body> on close (SC 2.4.3).
 *
 * Also covered: alert() and confirm() are gone. Both were unreachable to a screen reader
 * inside the dialog; errors now speak through the modal's live region and delete is
 * confirmed by arming the button in place.
 */

import {
  openAnnotationModal,
  getPositionFromRange,
  initializeInlineAnnotations,
} from '../../../src/features/annotations/inline-annotations.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';
import * as tagManager from '../../../src/features/annotations/tag-manager.js';

jest.mock('../../../src/features/annotations/storage-adapter.js');
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  createTagInput: jest.fn(() => ({ getTags: () => [] })),
  renderTagPills: jest.fn(),
}));

if (!global.chrome.storage.local.onChanged) {
  global.chrome.storage.local.onChanged = { addListener: jest.fn() };
}

const EXISTING = {
  id: 55,
  type: 'annotation',
  url: 'https://example.com',
  selectedText: 'quick',
  comment: 'A note',
  color: 'yellow',
  tags: [],
  position: { startOffset: 4, endOffset: 9, containerXPath: '//*[@id="p"]' },
};

function modal() {
  return document.querySelector('.assist-annotation-modal-overlay');
}

function press(element, key, shiftKey = false) {
  const event = new window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

function clickButton(selector) {
  modal().querySelector(selector).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

describe('Annotation modal keyboard and screen-reader behaviour', () => {
  let mockAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tagManager.createTagInput.mockImplementation(() => ({ getTags: () => [] }));
    document.body.innerHTML =
      '<button id="opener">Annotate</button><p id="p">The quick brown fox.</p>';

    mockAdapter = {
      create: jest.fn(async data => ({ ...data, id: 1 })),
      update: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      getByUrl: jest.fn().mockResolvedValue([]),
    };
    storageAdapter.getStorageAdapter = jest.fn(() => mockAdapter);
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    await initializeInlineAnnotations();
  });

  afterEach(() => {
    modal()?.remove();
  });

  function openForEdit() {
    document.getElementById('opener').focus();
    openAnnotationModal(EXISTING);
  }

  test('Escape closes the dialog even when focus has left the buttons', () => {
    openForEdit();
    // Focus on the dialog container itself — the old handler was bound here, but the bug
    // was that any focus outside the modal subtree escaped it entirely.
    press(modal(), 'Escape');

    expect(modal()).toBeNull();
  });

  // jsdom reports offsetParent as null for everything, so the trap sees a one-element
  // focusable list here; what these two lock is that Tab is intercepted and focus cannot
  // leave the dialog. Real wrap order is a browser check (see the Chrome gate).
  test('Tab is intercepted so focus cannot leave the dialog (SC 2.1.2)', () => {
    openForEdit();
    const dialog = modal();
    const focusable = Array.from(
      dialog.querySelectorAll('button, textarea, [tabindex]:not([tabindex="-1"])')
    );
    const last = focusable[focusable.length - 1];
    last.focus();

    const event = press(dialog, 'Tab');

    expect(event.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test('Shift+Tab is intercepted too, never stepping out to the page behind', () => {
    openForEdit();
    const dialog = modal();
    const focusable = Array.from(
      dialog.querySelectorAll('button, textarea, [tabindex]:not([tabindex="-1"])')
    );
    focusable[0].focus();

    const event = press(dialog, 'Tab', true);

    expect(event.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test('closing returns focus to whatever opened the dialog (SC 2.4.3)', () => {
    const opener = document.getElementById('opener');
    opener.focus();
    openAnnotationModal(EXISTING);
    modal().querySelector('#annotation-comment').focus();
    expect(document.activeElement).not.toBe(opener);

    clickButton('.assist-annotation-btn-cancel');

    expect(document.activeElement).toBe(opener);
  });

  test('the dialog carries a live region for messages', () => {
    openForEdit();
    const status = modal().querySelector('#annotation-modal-status');

    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
  });
});

describe('Delete is confirmed without confirm()', () => {
  let mockAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tagManager.createTagInput.mockImplementation(() => ({ getTags: () => [] }));
    document.body.innerHTML = '<p id="p">The quick brown fox.</p>';

    mockAdapter = {
      create: jest.fn(),
      update: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      getByUrl: jest.fn().mockResolvedValue([]),
    };
    storageAdapter.getStorageAdapter = jest.fn(() => mockAdapter);
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });
    await initializeInlineAnnotations();
    openAnnotationModal(EXISTING);
  });

  afterEach(() => {
    modal()?.remove();
  });

  test('the first press arms the button and announces what will happen', () => {
    clickButton('.assist-annotation-btn-delete');

    const button = modal().querySelector('.assist-annotation-btn-delete');
    expect(button.textContent).toBe('Confirm delete');
    expect(mockAdapter.delete).not.toHaveBeenCalled();
    expect(modal().querySelector('#annotation-modal-status').textContent).toContain(
      'Confirm delete'
    );
    expect(document.activeElement).toBe(button);
  });

  test('the second press deletes and closes', async () => {
    clickButton('.assist-annotation-btn-delete');
    clickButton('.assist-annotation-btn-delete');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockAdapter.delete).toHaveBeenCalledWith(EXISTING.id);
    expect(modal()).toBeNull();
  });

  test('cancelling disarms it, so reopening never deletes on one press', async () => {
    clickButton('.assist-annotation-btn-delete');
    clickButton('.assist-annotation-btn-cancel');

    openAnnotationModal(EXISTING);
    clickButton('.assist-annotation-btn-delete');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockAdapter.delete).not.toHaveBeenCalled();
    expect(modal().querySelector('.assist-annotation-btn-delete').textContent).toBe(
      'Confirm delete'
    );
  });

  test('a failed delete says so in the live region and re-arms nothing', async () => {
    mockAdapter.delete.mockRejectedValue(new Error('storage gone'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    clickButton('.assist-annotation-btn-delete');
    clickButton('.assist-annotation-btn-delete');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(modal()).not.toBeNull();
    expect(modal().querySelector('#annotation-modal-status').textContent).toContain(
      'Could not delete'
    );
    expect(modal().querySelector('.assist-annotation-btn-delete').textContent).toBe('Delete');
  });
});

describe('A failed save reports in the dialog, not in an alert()', () => {
  let mockAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    tagManager.createTagInput.mockImplementation(() => ({ getTags: () => [] }));
    document.body.innerHTML = '<p id="p">The quick brown fox.</p>';

    mockAdapter = {
      create: jest.fn().mockRejectedValue(new Error('storage gone')),
      update: jest.fn(),
      delete: jest.fn(),
      getByUrl: jest.fn().mockResolvedValue([]),
    };
    storageAdapter.getStorageAdapter = jest.fn(() => mockAdapter);
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });
    await initializeInlineAnnotations();
  });

  afterEach(() => {
    modal()?.remove();
  });

  test('keeps the dialog open, announces the failure, and rolls the highlight back', async () => {
    const text = document.getElementById('p').firstChild;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 9);
    openAnnotationModal(null, 'quick', getPositionFromRange(range.cloneRange()), range.cloneRange());

    clickButton('.assist-annotation-btn-save');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(modal()).not.toBeNull();
    expect(modal().querySelector('#annotation-modal-status').textContent).toContain(
      'Could not save'
    );
    // No orphan highlight for an annotation that was never stored.
    expect(document.querySelectorAll('.assist-inline-annotation')).toHaveLength(0);
    expect(document.getElementById('p').textContent).toBe('The quick brown fox.');
  });
});
