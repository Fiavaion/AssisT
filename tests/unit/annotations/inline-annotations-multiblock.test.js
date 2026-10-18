/**
 * Regression gate: a selection that spans more than one block element must produce ONE
 * highlight span PER TEXT RUN, never a single inline span wrapping whole <p> elements.
 *
 * The defect (confirmed in a live browser): `range.surroundContents` throws on a
 * multi-block range, and the catch fell back to extractContents() → one inline <span>
 * containing two <p> children. An inline box cannot paint a background behind block
 * children, so the highlight was invisible — only :hover { filter } showed anything.
 */

import {
  openAnnotationModal,
  getPositionFromRange,
  initializeInlineAnnotations,
  deleteAnnotation,
} from '../../../src/features/annotations/inline-annotations.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';
import * as tagManager from '../../../src/features/annotations/tag-manager.js';
import { ANNOTATION_COLORS } from '../../../src/features/annotations/annotation-colors.js';

jest.mock('../../../src/features/annotations/storage-adapter.js');
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  createTagInput: jest.fn(() => ({ getTags: () => [] })),
  renderTagPills: jest.fn(),
}));

if (!global.chrome.storage.local.onChanged) {
  global.chrome.storage.local.onChanged = { addListener: jest.fn() };
}

const TWO_PARAGRAPHS =
  '<div id="c"><p id="p1">No deemed disposal here.</p><p id="p2">A tax-free allowance.</p></div>';

function highlights() {
  return Array.from(document.querySelectorAll('.assist-inline-annotation'));
}

describe('Multi-block selections (the invisible-highlight defect)', () => {
  let mockAdapter;
  let stored;
  let nextId;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tagManager.createTagInput.mockImplementation(() => ({ getTags: () => [] }));
    document.body.innerHTML = TWO_PARAGRAPHS;
    nextId = 100;

    stored = [];
    mockAdapter = {
      create: jest.fn(async data => {
        const record = { ...data, id: nextId++ };
        stored.push(record);
        return record;
      }),
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
    document.querySelector('.assist-annotation-modal-overlay')?.remove();
  });

  /** Select from mid-p1 to mid-p2 and save it through the modal, as the highlight menu does. */
  async function annotateAcrossParagraphs(comment = 'Across two blocks') {
    const p1 = document.getElementById('p1');
    const p2 = document.getElementById('p2');
    const range = document.createRange();
    range.setStart(p1.firstChild, 3);
    range.setEnd(p2.firstChild, 9);

    const position = getPositionFromRange(range.cloneRange());
    openAnnotationModal(null, range.toString(), position, range.cloneRange());

    const modal = document.querySelector('.assist-annotation-modal-overlay');
    modal.querySelector('#annotation-comment').value = comment;
    modal
      .querySelector('.assist-annotation-btn-save')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    return highlights();
  }

  test('wraps each text run in its own span — no span ever contains an element child', async () => {
    const spans = await annotateAcrossParagraphs();

    expect(spans.length).toBeGreaterThan(1);
    spans.forEach(span => {
      expect(span.children.length).toBe(0);
      expect(span.querySelector('p')).toBeNull();
      expect(span.style.backgroundColor).toBe(ANNOTATION_COLORS.yellow.fill);
      expect(span.style.borderBottom).toContain(ANNOTATION_COLORS.yellow.border);
    });
  });

  test('each span stays inside its own paragraph, so the fill paints', async () => {
    await annotateAcrossParagraphs();

    expect(document.querySelectorAll('#p1 .assist-inline-annotation').length).toBe(1);
    expect(document.querySelectorAll('#p2 .assist-inline-annotation').length).toBe(1);
    expect(document.getElementById('p1').textContent).toBe('No deemed disposal here.');
    expect(document.getElementById('p2').textContent).toBe('A tax-free allowance.');
  });

  test('highlights start exactly where the selection started', async () => {
    const spans = await annotateAcrossParagraphs();

    expect(spans[0].textContent).toBe('deemed disposal here.');
    expect(spans[1].textContent).toBe('A tax-fre');
  });

  test('one annotation is one tab stop and one accessible name', async () => {
    const spans = await annotateAcrossParagraphs('Check this');

    expect(spans[0].getAttribute('tabindex')).toBe('0');
    expect(spans[0].getAttribute('aria-label')).toBe('Annotation: Check this');
    spans.slice(1).forEach(span => {
      expect(span.getAttribute('tabindex')).toBe('-1');
      expect(span.hasAttribute('aria-label')).toBe(false);
      expect(span.getAttribute('role')).toBe('mark');
    });
  });

  test('every span carries the annotation id and opens the editor on click', async () => {
    const spans = await annotateAcrossParagraphs();
    const id = stored[0].id;

    spans.forEach(span => expect(span.dataset.annotationId).toBe(String(id)));

    spans[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.assist-annotation-modal-overlay')).toBeTruthy();
  });

  test('deleting unwraps every span and leaves the text intact and unduplicated', async () => {
    await annotateAcrossParagraphs();
    const id = stored[0].id;

    await deleteAnnotation(id);

    expect(highlights().length).toBe(0);
    expect(document.getElementById('p1').textContent).toBe('No deemed disposal here.');
    expect(document.getElementById('p2').textContent).toBe('A tax-free allowance.');
    expect(document.body.textContent).toBe('No deemed disposal here.A tax-free allowance.');
  });

  test('restoring from storage rebuilds the same per-run spans', async () => {
    const record = {
      id: 7,
      type: 'annotation',
      url: window.location.href,
      selectedText: 'deemed disposal here.A tax-fre',
      comment: 'Restored',
      color: 'blue',
      tags: [],
      position: { startOffset: 3, endOffset: 33, containerXPath: '//*[@id="c"]' },
    };
    mockAdapter.getByUrl.mockResolvedValue([record]);
    document.body.innerHTML = TWO_PARAGRAPHS;

    await initializeInlineAnnotations();

    const spans = highlights();
    expect(spans.length).toBe(2);
    spans.forEach(span => {
      expect(span.children.length).toBe(0);
      expect(span.style.backgroundColor).toBe(ANNOTATION_COLORS.blue.fill);
    });
    expect(spans[0].getAttribute('aria-label')).toBe('Annotation: Restored');
    expect(spans[1].hasAttribute('aria-label')).toBe(false);
  });
});
