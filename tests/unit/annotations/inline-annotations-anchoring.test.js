/**
 * The storage half of the anchoring contract, checked through the feature rather than the
 * pure module: what gets written on save, and what happens to a record that cannot be placed.
 *
 * Both matter to somebody's existing data. Real annotations are in storage right now carrying
 * only the old `position` fields, and an annotation that fails to anchor today may anchor
 * perfectly tomorrow — a lazy-loaded section arrives, or the reader comes back to the article.
 */

import {
  getPositionFromRange,
  initializeInlineAnnotations,
  openAnnotationModal,
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

const PAGE =
  '<div id="c"><p id="p1">The deemed disposal rule no longer applies to these funds.</p></div>';

describe('Anchoring, through the feature', () => {
  let mockAdapter;
  let stored;

  function mountAdapter(existing = []) {
    stored = [];
    mockAdapter = {
      create: jest.fn(async data => {
        const record = { ...data, id: 7 };
        stored.push(record);
        return record;
      }),
      update: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      getByUrl: jest.fn().mockResolvedValue(existing),
    };
    storageAdapter.getStorageAdapter = jest.fn(() => mockAdapter);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    tagManager.createTagInput.mockImplementation(() => ({ getTags: () => [] }));
    document.body.innerHTML = PAGE;
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });
  });

  afterEach(() => {
    document.querySelector('.assist-annotation-modal-overlay')?.remove();
  });

  test('saving writes the new selectors WITHOUT dropping the fields an older build reads', async () => {
    mountAdapter();
    await initializeInlineAnnotations();

    const node = document.getElementById('p1').firstChild;
    const at = node.data.indexOf('deemed disposal rule');
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 'deemed disposal rule'.length);

    openAnnotationModal(null, range.toString(), getPositionFromRange(range.cloneRange()), range);
    const modal = document.querySelector('.assist-annotation-modal-overlay');
    modal.querySelector('#annotation-comment').value = 'Worth remembering';
    modal
      .querySelector('.assist-annotation-btn-save')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    const { position } = stored[0];
    expect(position.quote.exact).toBe('deemed disposal rule');
    expect(Number.isInteger(position.textPosition.start)).toBe(true);
    // Still everything the shipped build wrote, so nothing regresses for an older reader.
    expect(position.containerXPath).toBe('//*[@id="p1"]');
    expect(position.endOffset - position.startOffset).toBe('deemed disposal rule'.length);
  });

  test('an annotation that cannot be anchored is kept in storage, not deleted', async () => {
    mountAdapter([
      {
        id: 99,
        type: 'annotation',
        url: window.location.href,
        selectedText: 'text that is no longer on this page',
        comment: 'From a previous version of the article',
        color: 'yellow',
        position: {
          startOffset: 0,
          endOffset: 35,
          containerXPath: '//*[@id="a-container-that-is-gone"]',
          quote: {
            exact: 'text that is no longer on this page',
            prefix: 'Before it: ',
            suffix: ' after it.',
          },
          textPosition: { start: 11, end: 46 },
        },
      },
    ]);

    await initializeInlineAnnotations();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.querySelectorAll('.assist-inline-annotation').length).toBe(0);
    expect(mockAdapter.delete).not.toHaveBeenCalled();
    expect(mockAdapter.update).not.toHaveBeenCalled();
  });

  test('a record saved by the shipped build restores on page load', async () => {
    mountAdapter([
      {
        id: 5,
        type: 'annotation',
        url: window.location.href,
        selectedText: 'deemed disposal rule',
        comment: 'Saved before the anchoring change',
        color: 'yellow',
        position: { startOffset: 4, endOffset: 24, containerXPath: '//*[@id="p1"]' },
      },
    ]);

    await initializeInlineAnnotations();
    await new Promise(resolve => setTimeout(resolve, 0));

    const spans = Array.from(document.querySelectorAll('.assist-inline-annotation'));
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('deemed disposal rule');
  });
});
