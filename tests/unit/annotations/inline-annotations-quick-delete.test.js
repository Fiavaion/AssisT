/**
 * Quick delete: Alt+click (or Delete/Backspace when focused) removes an annotation in ONE
 * action, with an Undo tray instead of a confirmation step. A confirm step in front of every
 * delete costs our audience more than the occasional undo does.
 *
 * These tests pin the parts that are easy to get wrong:
 *   - Alt+click must delete and must NOT also open the editor.
 *   - Neither delete may fire while the student is mid-selection (the text inside a highlight
 *     is deliberately selectable), and the Alt cue must not promise a delete in that state.
 *   - Undo must bring back the record AND the highlight spans.
 *   - The page's own text must be left intact and unfragmented.
 */

import {
  createInlineAnnotation,
  getPositionFromRange,
  initializeInlineAnnotations,
  openAnnotationModal,
} from '../../../src/features/annotations/inline-annotations.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';
import * as tagManager from '../../../src/features/annotations/tag-manager.js';
import { showInfoTray } from '../../../src/utils/action-tray.js';

jest.mock('../../../src/features/annotations/storage-adapter.js');
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  createTagInput: jest.fn(() => ({ getTags: () => [] })),
  renderTagPills: jest.fn(),
}));
jest.mock('../../../src/utils/action-tray.js', () => ({
  showInfoTray: jest.fn(),
  hideTray: jest.fn(),
}));

if (!global.chrome.storage.local.onChanged) {
  global.chrome.storage.local.onChanged = { addListener: jest.fn() };
}
if (!global.chrome.runtime.onMessage) {
  global.chrome.runtime.onMessage = { addListener: jest.fn() };
}

const CUE_CLASS = 'assist-inline-annotation-delete-cue';
const POSITION = { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' };

function highlights() {
  return Array.from(document.querySelectorAll('.assist-inline-annotation'));
}

function modalIsOpen() {
  return Boolean(document.querySelector('.assist-annotation-modal-overlay'));
}

function mouse(element, type, init = {}) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

function key(target, type, init) {
  const event = new window.KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function selectInside(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Let the delete/undo promise chain settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('One-action annotation delete', () => {
  let adapter;
  let stored;
  // The module keeps a live map of rendered annotations, so each test needs a fresh id.
  let nextId = 1;
  let createdId;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tagManager.createTagInput.mockImplementation(() => ({ getTags: () => [] }));
    document.body.innerHTML = '<div><p id="para">test text here</p></div>';
    window.getSelection().removeAllRanges();
    stored = [];

    adapter = {
      create: jest.fn(async data => {
        const record = { ...data, id: nextId++ };
        stored.push(record);
        return record;
      }),
      update: jest.fn(async () => {}),
      delete: jest.fn(async id => {
        stored = stored.filter(record => record.id !== id);
        return true;
      }),
      getByUrl: jest.fn().mockResolvedValue([]),
    };
    storageAdapter.getStorageAdapter = jest.fn(() => adapter);
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    await initializeInlineAnnotations();
  });

  afterEach(() => {
    document.querySelector('.assist-annotation-modal-overlay')?.remove();
    key(document, 'keyup', { key: 'Alt' });
  });

  /** One single-span annotation over the first word of #para. */
  async function annotate(comment = 'my note') {
    const record = await createInlineAnnotation({
      selectedText: 'test',
      position: POSITION,
      comment,
      color: 'green',
      tags: ['reading'],
    });
    createdId = record.id;
    return highlights()[0];
  }

  describe('Alt+click', () => {
    test('deletes the annotation from storage and from the page', async () => {
      const highlight = await annotate();

      mouse(highlight, 'click', { altKey: true });
      await settle();

      expect(adapter.delete).toHaveBeenCalledWith(createdId);
      expect(highlights()).toHaveLength(0);
    });

    test('does not also open the editor', async () => {
      const highlight = await annotate();

      mouse(highlight, 'click', { altKey: true });
      await settle();

      expect(modalIsOpen()).toBe(false);
    });

    test('a plain click still opens the editor', async () => {
      const highlight = await annotate();

      mouse(highlight, 'click');

      expect(modalIsOpen()).toBe(true);
      expect(adapter.delete).not.toHaveBeenCalled();
    });

    test('does nothing while a selection covers the highlight', async () => {
      const highlight = await annotate();
      selectInside(highlight.firstChild);

      mouse(highlight, 'click', { altKey: true });
      await settle();

      expect(adapter.delete).not.toHaveBeenCalled();
      expect(highlights()).toHaveLength(1);
      expect(modalIsOpen()).toBe(false);
    });

    test('removes every span of a multi-span annotation', async () => {
      document.body.innerHTML = '<div><p id="p1">first para text</p><p id="p2">second para</p></div>';
      const range = document.createRange();
      range.setStart(document.getElementById('p1').firstChild, 0);
      range.setEnd(document.getElementById('p2').firstChild, 6);
      const position = getPositionFromRange(range.cloneRange());
      openAnnotationModal(null, range.toString(), position, range.cloneRange());
      document.querySelector('#annotation-comment').value = 'spans two blocks';
      mouse(document.querySelector('.assist-annotation-btn-save'), 'mousedown');
      await settle();
      expect(highlights().length).toBeGreaterThan(1);

      mouse(highlights()[1], 'click', { altKey: true });
      await settle();

      expect(highlights()).toHaveLength(0);
    });
  });

  describe('Keyboard equivalent (SC 2.1.1)', () => {
    test.each(['Delete', 'Backspace'])('%s on the focused annotation deletes it', async keyName => {
      const highlight = await annotate();

      const event = key(highlight, 'keydown', { key: keyName });
      await settle();

      expect(adapter.delete).toHaveBeenCalledWith(createdId);
      expect(highlights()).toHaveLength(0);
      // Backspace would otherwise navigate the page back.
      expect(event.defaultPrevented).toBe(true);
    });

    test('Enter still opens the editor', async () => {
      const highlight = await annotate();

      key(highlight, 'keydown', { key: 'Enter' });

      expect(modalIsOpen()).toBe(true);
      expect(adapter.delete).not.toHaveBeenCalled();
    });

    test('Space still opens the editor', async () => {
      const highlight = await annotate();

      key(highlight, 'keydown', { key: ' ' });

      expect(modalIsOpen()).toBe(true);
      expect(adapter.delete).not.toHaveBeenCalled();
    });
  });

  describe('Undo', () => {
    test('offers Undo in the tray rather than asking for confirmation first', async () => {
      const highlight = await annotate();

      mouse(highlight, 'click', { altKey: true });
      await settle();

      expect(showInfoTray).toHaveBeenCalledTimes(1);
      const opts = showInfoTray.mock.calls[0][0];
      expect(opts.actionLabel).toBe('Undo');
      expect(typeof opts.onAction).toBe('function');
      expect(opts.message).toMatch(/deleted/i);
    });

    test('restores the stored record with its comment, colour and tags', async () => {
      const highlight = await annotate('keep this one');

      mouse(highlight, 'click', { altKey: true });
      await settle();
      await showInfoTray.mock.calls[0][0].onAction();
      await settle();

      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        selectedText: 'test',
        comment: 'keep this one',
        color: 'green',
        tags: ['reading'],
        position: POSITION,
      });
    });

    test('restores the highlight spans on the page', async () => {
      const highlight = await annotate('keep this one');

      mouse(highlight, 'click', { altKey: true });
      await settle();
      expect(highlights()).toHaveLength(0);

      await showInfoTray.mock.calls[0][0].onAction();
      await settle();

      const restored = highlights();
      expect(restored).toHaveLength(1);
      expect(restored[0].getAttribute('aria-label')).toBe('Annotation: keep this one');
      // The restored highlight is live: it opens the editor like any other.
      mouse(restored[0], 'click');
      expect(modalIsOpen()).toBe(true);
    });
  });

  describe('The page is left as it was', () => {
    test('deleting lifts the text back into one unfragmented text node', async () => {
      const highlight = await annotate();

      mouse(highlight, 'click', { altKey: true });
      await settle();

      const para = document.getElementById('para');
      expect(para.textContent).toBe('test text here');
      expect(para.childNodes).toHaveLength(1);
      expect(para.firstChild.nodeType).toBe(Node.TEXT_NODE);
    });

    test('no tooltip is left pointing at the removed highlight', async () => {
      const highlight = await annotate();
      mouse(highlight, 'mouseenter');
      expect(document.querySelector('.assist-annotation-tooltip')).not.toBeNull();

      mouse(highlight, 'click', { altKey: true });
      await settle();

      expect(document.querySelector('.assist-annotation-tooltip')).toBeNull();
    });
  });

  describe('Discoverability', () => {
    test('the tooltip names both ways to delete alongside the comment', async () => {
      const highlight = await annotate('my note');

      mouse(highlight, 'mouseenter');
      const tooltip = document.querySelector('.assist-annotation-tooltip');

      expect(tooltip.querySelector('.assist-annotation-tooltip-comment').textContent).toBe(
        'my note'
      );
      const hint = tooltip.querySelector('.assist-annotation-tooltip-hint').textContent;
      expect(hint).toMatch(/alt/i);
      expect(hint).toMatch(/delete/i);
    });
  });
});

describe('The Alt-held delete cue', () => {
  let adapter;
  let nextId = 500;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tagManager.createTagInput.mockImplementation(() => ({ getTags: () => [] }));
    document.body.innerHTML = '<div><p id="p1">first para text</p><p id="p2">second para</p></div>';
    window.getSelection().removeAllRanges();

    adapter = {
      create: jest.fn(async data => ({ ...data, id: nextId++ })),
      update: jest.fn(async () => {}),
      delete: jest.fn(async () => true),
      getByUrl: jest.fn().mockResolvedValue([]),
    };
    storageAdapter.getStorageAdapter = jest.fn(() => adapter);
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    await initializeInlineAnnotations();
  });

  afterEach(() => {
    document.querySelector('.assist-annotation-modal-overlay')?.remove();
    key(document, 'keyup', { key: 'Alt' });
  });

  /** An annotation spanning both paragraphs, so it owns more than one span. */
  async function annotateAcrossParagraphs() {
    const range = document.createRange();
    range.setStart(document.getElementById('p1').firstChild, 0);
    range.setEnd(document.getElementById('p2').firstChild, 6);
    const position = getPositionFromRange(range.cloneRange());
    openAnnotationModal(null, range.toString(), position, range.cloneRange());
    document.querySelector('#annotation-comment').value = 'across two blocks';
    mouse(document.querySelector('.assist-annotation-btn-save'), 'mousedown');
    await settle();
    return highlights();
  }

  function cued() {
    return highlights().filter(span => span.classList.contains(CUE_CLASS));
  }

  test('hovering with Alt already held cues the annotation', async () => {
    const spans = await annotateAcrossParagraphs();

    key(document, 'keydown', { key: 'Alt', altKey: true });
    mouse(spans[0], 'mouseenter');

    expect(cued()).toHaveLength(spans.length);
  });

  test('pressing Alt while already hovering cues it', async () => {
    const spans = await annotateAcrossParagraphs();

    mouse(spans[0], 'mouseenter');
    expect(cued()).toHaveLength(0);

    key(document, 'keydown', { key: 'Alt', altKey: true });

    expect(cued()).toHaveLength(spans.length);
  });

  test('cues EVERY span, so the student sees how much text will go', async () => {
    const spans = await annotateAcrossParagraphs();
    expect(spans.length).toBeGreaterThan(1);

    mouse(spans[1], 'mouseenter');
    key(document, 'keydown', { key: 'Alt', altKey: true });

    spans.forEach(span => expect(span.classList.contains(CUE_CLASS)).toBe(true));
  });

  test('does not appear while a selection intersects it — the delete would not fire', async () => {
    const spans = await annotateAcrossParagraphs();
    selectInside(spans[0].firstChild);

    mouse(spans[0], 'mouseenter');
    key(document, 'keydown', { key: 'Alt', altKey: true });

    expect(cued()).toHaveLength(0);
  });

  test('releasing Alt clears it', async () => {
    const spans = await annotateAcrossParagraphs();
    mouse(spans[0], 'mouseenter');
    key(document, 'keydown', { key: 'Alt', altKey: true });
    expect(cued()).not.toHaveLength(0);

    key(document, 'keyup', { key: 'Alt' });

    expect(cued()).toHaveLength(0);
  });

  test('leaving the annotation with Alt still held clears it', async () => {
    const spans = await annotateAcrossParagraphs();
    mouse(spans[0], 'mouseenter');
    key(document, 'keydown', { key: 'Alt', altKey: true });

    mouse(spans[0], 'mouseleave');

    expect(cued()).toHaveLength(0);
  });

  test('Alt+Tab away cannot leave the cue stuck on (window blur)', async () => {
    const spans = await annotateAcrossParagraphs();
    mouse(spans[0], 'mouseenter');
    key(document, 'keydown', { key: 'Alt', altKey: true });
    expect(cued()).not.toHaveLength(0);

    window.dispatchEvent(new window.Event('blur'));

    expect(cued()).toHaveLength(0);
  });

  test('a hidden tab cannot leave the cue stuck on (visibilitychange)', async () => {
    const spans = await annotateAcrossParagraphs();
    mouse(spans[0], 'mouseenter');
    key(document, 'keydown', { key: 'Alt', altKey: true });

    document.dispatchEvent(new window.Event('visibilitychange'));

    expect(cued()).toHaveLength(0);
  });

  test('a bare Alt press over an annotation does not reach the browser menu bar', async () => {
    const spans = await annotateAcrossParagraphs();
    mouse(spans[0], 'mouseenter');

    const event = key(document, 'keydown', { key: 'Alt', altKey: true });

    expect(event.defaultPrevented).toBe(true);
  });

  test('Alt anywhere else on the page is left alone', async () => {
    await annotateAcrossParagraphs();

    const event = key(document, 'keydown', { key: 'Alt', altKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(cued()).toHaveLength(0);
  });
});
