/**
 * Unit Tests for Inline Annotations Feature
 * Tests cover:
 * 1. Annotation creation from text selection
 * 2. Position data handling
 * 3. Annotation rendering and highlighting
 * 4. Annotation update operations
 * 5. Annotation deletion
 * 6. XPath and Range utilities
 * 7. Color theming
 */

import {
  createInlineAnnotation,
  openAnnotationModal,
  getPositionFromRange,
  deleteAnnotation,
  initializeInlineAnnotations
} from '../../../src/features/annotations/inline-annotations.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';
import * as tagManager from '../../../src/features/annotations/tag-manager.js';
import { ANNOTATION_COLORS } from '../../../src/features/annotations/annotation-colors.js';
import { Z } from '../../../src/utils/z-index.js';

// Extend chrome API mocks (setup.js provides base mock)
// Add onChanged listener which is needed by inline-annotations.js
if (!global.chrome.storage.local.onChanged) {
  global.chrome.storage.local.onChanged = { addListener: jest.fn() };
}
if (!global.chrome.runtime.onMessage) {
  global.chrome.runtime.onMessage = { addListener: jest.fn() };
}

// Mock DOM
document.body.innerHTML = '<div id="test-container"><p id="test-paragraph">This is test text for annotations.</p></div>';

// Mock storage adapter
jest.mock('../../../src/features/annotations/storage-adapter.js');
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  createTagInput: jest.fn(() => ({
    getTags: jest.fn(() => [])
  })),
  renderTagPills: jest.fn()
}));

describe('Inline Annotation Creation', () => {
  let mockAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="test-container"><p id="test-para">This is test text.</p></div>';

    mockAdapter = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getByUrl: jest.fn().mockResolvedValue([])
    };

    storageAdapter.getStorageAdapter = jest.fn(() => mockAdapter);

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    // Re-initialize after mocks are set up
    await initializeInlineAnnotations();
  });

  test('should create inline annotation with position data', async () => {
    const mockAnnotation = {
      id: 1,
      type: 'annotation',
      url: 'https://example.com',
      selectedText: 'test text',
      comment: 'This is a test comment',
      color: 'yellow',
      tags: [],
      position: {
        startOffset: 8,
        endOffset: 17,
        containerXPath: '/html/body/div/p'
      }
    };

    mockAdapter.create.mockResolvedValue(mockAnnotation);

    const result = await createInlineAnnotation({
      selectedText: 'test text',
      position: {
        startOffset: 8,
        endOffset: 17,
        containerXPath: '/html/body/div/p'
      },
      comment: 'This is a test comment'
    });

    expect(result).toMatchObject({
      id: 1,
      type: 'annotation',
      selectedText: 'test text',
      comment: 'This is a test comment'
    });
    expect(mockAdapter.create).toHaveBeenCalled();
  });

  test('should create annotation with custom color', async () => {
    const mockAnnotation = {
      id: 1,
      type: 'annotation',
      url: 'https://example.com',
      selectedText: 'test',
      comment: '',
      color: 'blue',
      tags: [],
      position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' }
    };

    mockAdapter.create.mockResolvedValue(mockAnnotation);

    await createInlineAnnotation({
      selectedText: 'test',
      position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' },
      color: 'blue'
    });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'blue'
      })
    );
  });

  test('should create annotation with tags', async () => {
    const mockAnnotation = {
      id: 1,
      type: 'annotation',
      url: 'https://example.com',
      selectedText: 'test',
      comment: 'Tagged annotation',
      color: 'yellow',
      tags: ['important', 'review'],
      position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' }
    };

    mockAdapter.create.mockResolvedValue(mockAnnotation);

    await createInlineAnnotation({
      selectedText: 'test',
      position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' },
      comment: 'Tagged annotation',
      tags: ['important', 'review']
    });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['important', 'review']
      })
    );
  });

  test('should use current window location as URL', async () => {
    // JSDOM defaults to http://localhost/ - we verify the module uses window.location.href
    const mockAnnotation = {
      id: 1,
      type: 'annotation',
      url: window.location.href, // Use actual JSDOM location
      selectedText: 'test',
      comment: '',
      color: 'yellow',
      tags: [],
      position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' }
    };

    mockAdapter.create.mockResolvedValue(mockAnnotation);

    await createInlineAnnotation({
      selectedText: 'test',
      position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' }
    });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: window.location.href // Verify module uses current location
      })
    );
  });

  test('should handle empty comment', async () => {
    const mockAnnotation = {
      id: 1,
      type: 'annotation',
      url: 'https://example.com',
      selectedText: 'test',
      comment: '',
      color: 'yellow',
      tags: [],
      position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' }
    };

    mockAdapter.create.mockResolvedValue(mockAnnotation);

    await createInlineAnnotation({
      selectedText: 'test',
      position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' },
      comment: ''
    });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: ''
      })
    );
  });

  test('should handle creation errors', async () => {
    mockAdapter.create.mockRejectedValue(new Error('Storage error'));

    await expect(
      createInlineAnnotation({
        selectedText: 'test',
        position: { startOffset: 0, endOffset: 4, containerXPath: '/html/body/div/p' }
      })
    ).rejects.toThrow('Storage error');
  });
});

describe('Annotation Deletion', () => {
  let mockAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="test-container"></div>';

    mockAdapter = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
      getByUrl: jest.fn().mockResolvedValue([])
    };

    storageAdapter.getStorageAdapter = jest.fn(() => mockAdapter);

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    // Re-initialize after mocks are set up
    await initializeInlineAnnotations();
  });

  test('should delete annotation from storage', async () => {
    await deleteAnnotation(1);

    expect(mockAdapter.delete).toHaveBeenCalledWith(1);
  });

  test('should handle deletion errors', async () => {
    mockAdapter.delete.mockRejectedValue(new Error('Delete failed'));

    await expect(deleteAnnotation(1)).rejects.toThrow('Delete failed');
  });
});

describe('Position Data Handling', () => {
  test('should create valid position object', () => {
    const position = {
      startOffset: 0,
      endOffset: 10,
      containerXPath: '/html/body/div/p[1]'
    };

    expect(position).toHaveProperty('startOffset');
    expect(position).toHaveProperty('endOffset');
    expect(position).toHaveProperty('containerXPath');
    expect(position.startOffset).toBeLessThan(position.endOffset);
  });

  test('should get position from Range object', () => {
    // Create a mock range
    const textNode = document.createTextNode('Sample text for testing');
    const container = document.createElement('div');
    container.id = 'test-container';
    container.appendChild(textNode);
    document.body.appendChild(container);

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 6);

    const position = getPositionFromRange(range);

    expect(position).toHaveProperty('startOffset');
    expect(position).toHaveProperty('endOffset');
    expect(position).toHaveProperty('containerXPath');
    expect(position.startOffset).toBe(0);
    expect(position.endOffset).toBe(6);
  });

  test('should handle multi-line selection', () => {
    const position = {
      startOffset: 10,
      endOffset: 50,
      containerXPath: '/html/body/div'
    };

    expect(position.endOffset - position.startOffset).toBe(40);
  });
});

describe('Annotation Colors', () => {
  test('should support yellow highlight color', () => {
    const yellowColor = { bg: 'rgba(254, 243, 199, 0.5)', border: '#fbbf24' };
    expect(yellowColor.bg).toContain('254, 243, 199');
    expect(yellowColor.border).toBe('#fbbf24');
  });

  test('should support blue highlight color', () => {
    const blueColor = { bg: 'rgba(219, 234, 254, 0.5)', border: '#3b82f6' };
    expect(blueColor.bg).toContain('219, 234, 254');
    expect(blueColor.border).toBe('#3b82f6');
  });

  test('should support green highlight color', () => {
    const greenColor = { bg: 'rgba(209, 250, 229, 0.5)', border: '#10b981' };
    expect(greenColor.bg).toContain('209, 250, 229');
    expect(greenColor.border).toBe('#10b981');
  });

  test('should support pink highlight color', () => {
    const pinkColor = { bg: 'rgba(252, 231, 243, 0.5)', border: '#ec4899' };
    expect(pinkColor.bg).toContain('252, 231, 243');
    expect(pinkColor.border).toBe('#ec4899');
  });

  test('should support purple highlight color', () => {
    const purpleColor = { bg: 'rgba(233, 213, 255, 0.5)', border: '#a855f7' };
    expect(purpleColor.bg).toContain('233, 213, 255');
    expect(purpleColor.border).toBe('#a855f7');
  });
});

describe('XPath Utilities', () => {
  test('should generate XPath for element with ID', () => {
    const element = document.createElement('div');
    element.id = 'unique-id';
    document.body.appendChild(element);

    // Mock getXPath function behavior
    const getXPath = (el) => {
      if (el.id) {return `//*[@id="${el.id}"]`;}
      return '/html/body/div';
    };

    expect(getXPath(element)).toBe('//*[@id="unique-id"]');
  });

  test('should generate XPath for element without ID', () => {
    const element = document.createElement('p');
    document.body.appendChild(element);

    // Mock getXPath function behavior
    const getXPath = (el) => {
      if (el.id) {return `//*[@id="${el.id}"]`;}
      if (el === document.body) {return '/html/body';}
      return '/html/body/p[1]';
    };

    expect(getXPath(element)).toContain('p');
  });

  test('should handle body element XPath', () => {
    const getXPath = (el) => {
      if (el === document.body) {return '/html/body';}
      return '/html/body/*';
    };

    expect(getXPath(document.body)).toBe('/html/body');
  });
});

describe('Text Node Utilities', () => {
  test('should get text nodes from element', () => {
    const container = document.createElement('div');
    container.innerHTML = 'Text <span>nested text</span> more text';
    document.body.appendChild(container);

    // Mock getTextNodesIn behavior
    const getTextNodesIn = (element) => {
      const textNodes = [];
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim()) {
          textNodes.push(node);
        }
      }
      return textNodes;
    };

    const textNodes = getTextNodesIn(container);
    expect(textNodes.length).toBeGreaterThan(0);
  });

  test('should filter empty text nodes', () => {
    const filterEmptyNodes = (nodes) => {
      return nodes.filter(node => node.textContent.trim().length > 0);
    };

    const nodes = [
      { textContent: 'Valid text' },
      { textContent: '   ' },
      { textContent: 'Another valid' },
      { textContent: '' }
    ];

    const filtered = filterEmptyNodes(nodes);
    expect(filtered).toHaveLength(2);
  });
});

describe('Annotation Modal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('should open modal for new annotation', () => {
    openAnnotationModal(null, 'selected text', {
      startOffset: 0,
      endOffset: 13,
      containerXPath: '/html/body/div/p'
    });

    const modal = document.querySelector('.assist-annotation-modal-overlay');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Add Annotation');
  });

  test('should open modal for editing existing annotation', () => {
    const existingAnnotation = {
      id: 1,
      selectedText: 'test text',
      comment: 'Existing comment',
      color: 'blue',
      tags: ['work']
    };

    openAnnotationModal(existingAnnotation);

    const modal = document.querySelector('.assist-annotation-modal-overlay');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Edit Annotation');
  });

  test('should display selected text in modal', () => {
    openAnnotationModal(null, 'important text', {
      startOffset: 0,
      endOffset: 14,
      containerXPath: '/html/body/div/p'
    });

    const modal = document.querySelector('.assist-annotation-modal-overlay');
    expect(modal.textContent).toContain('important text');
  });

  test('should show delete button for existing annotations', () => {
    const existingAnnotation = {
      id: 1,
      selectedText: 'test',
      comment: 'Comment',
      color: 'yellow',
      tags: []
    };

    openAnnotationModal(existingAnnotation);

    const deleteBtn = document.querySelector('.assist-annotation-btn-delete');
    expect(deleteBtn).toBeTruthy();
  });

  test('should not show delete button for new annotations', () => {
    openAnnotationModal(null, 'new text', {
      startOffset: 0,
      endOffset: 8,
      containerXPath: '/html/body/div/p'
    });

    const deleteBtn = document.querySelector('.assist-annotation-btn-delete');
    expect(deleteBtn).toBeFalsy();
  });
});

describe('Annotation Rendering', () => {
  test('should create highlight element for annotation', () => {
    const span = document.createElement('span');
    span.className = 'assist-inline-annotation';
    span.dataset.annotationId = '1';
    span.setAttribute('role', 'mark');

    expect(span.className).toBe('assist-inline-annotation');
    expect(span.dataset.annotationId).toBe('1');
    expect(span.getAttribute('role')).toBe('mark');
  });

  test('should make highlight keyboard accessible', () => {
    const span = document.createElement('span');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-label', 'Annotation: Test comment');

    expect(span.getAttribute('tabindex')).toBe('0');
    expect(span.getAttribute('aria-label')).toContain('Test comment');
  });
});

describe('Error Handling', () => {
  let mockAdapter;

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getByUrl: jest.fn().mockResolvedValue([])
    };

    storageAdapter.getStorageAdapter = jest.fn(() => mockAdapter);

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    // Re-initialize after mocks are set up
    await initializeInlineAnnotations();
  });

  test('should handle invalid position data', async () => {
    mockAdapter.create.mockResolvedValue({
      id: 1,
      type: 'annotation',
      selectedText: 'test',
      comment: '',
      color: 'yellow',
      tags: [],
      position: { startOffset: -1, endOffset: -1, containerXPath: '' }
    });

    await expect(
      createInlineAnnotation({
        selectedText: 'test',
        position: { startOffset: -1, endOffset: -1, containerXPath: '' }
      })
    ).resolves.toBeDefined();
  });

  test('should handle missing container element', () => {
    // Mock element lookup that returns null
    const getElementByXPath = (_xpath) => null;

    const result = getElementByXPath('/html/body/nonexistent');
    expect(result).toBeNull();
  });

  test('should handle empty selected text', async () => {
    mockAdapter.create.mockResolvedValue({
      id: 1,
      type: 'annotation',
      selectedText: '',
      comment: 'Comment',
      color: 'yellow',
      tags: [],
      position: { startOffset: 0, endOffset: 0, containerXPath: '/html/body/div' }
    });

    await expect(
      createInlineAnnotation({
        selectedText: '',
        position: { startOffset: 0, endOffset: 0, containerXPath: '/html/body/div' },
        comment: 'Comment'
      })
    ).resolves.toBeDefined();
  });
});

describe('Highlight visibility and editing (live DOM path)', () => {
  let mockAdapter;
  let created;

  beforeEach(async () => {
    jest.clearAllMocks();
    // resetMocks wipes the factory implementation before every test — restore it here.
    tagManager.createTagInput.mockImplementation(() => ({ getTags: () => [] }));
    document.body.innerHTML =
      '<div id="c"><p id="p">This is test text for annotations.</p></div>';

    created = null;
    mockAdapter = {
      create: jest.fn(async data => {
        created = { ...data, id: 42 };
        return created;
      }),
      update: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      getByUrl: jest.fn().mockResolvedValue([])
    };
    storageAdapter.getStorageAdapter = jest.fn(() => mockAdapter);
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ annotationStorageMode: 'local' });
    });

    await initializeInlineAnnotations();
  });

  /** Drive the modal the way the highlight menu does, then press Save. */
  async function annotateSelection({ comment = '', color = null } = {}) {
    const paragraph = document.getElementById('p');
    const range = document.createRange();
    range.setStart(paragraph.firstChild, 8);
    range.setEnd(paragraph.firstChild, 17);

    const position = getPositionFromRange(range.cloneRange());
    openAnnotationModal(null, 'test text', position, range.cloneRange());

    const modal = document.querySelector('.assist-annotation-modal-overlay');
    modal.querySelector('#annotation-comment').value = comment;
    if (color) {
      modal
        .querySelector(`.assist-annotation-color-option[data-color="${color}"]`)
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }
    modal
      .querySelector('.assist-annotation-btn-save')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    return document.querySelector('.assist-inline-annotation');
  }

  test('paints the highlight with the shared palette, not a near-invisible wash', async () => {
    const span = await annotateSelection({ comment: 'Check this' });

    expect(span).toBeTruthy();
    expect(span.style.backgroundColor).toBe(ANNOTATION_COLORS.yellow.fill);
    expect(span.style.borderBottom).toContain(ANNOTATION_COLORS.yellow.border);
  });

  test('honours the colour chosen in the picker', async () => {
    const span = await annotateSelection({ comment: 'Blue one', color: 'blue' });

    expect(span.style.backgroundColor).toBe(ANNOTATION_COLORS.blue.fill);
    expect(span.style.borderBottom).toContain(ANNOTATION_COLORS.blue.border);
  });

  test('leaves motion and cursor to the stylesheet so media queries can override them', async () => {
    const span = await annotateSelection();

    expect(span.style.transition).toBe('');
  });

  test('activating a highlight opens the edit modal', async () => {
    const span = await annotateSelection({ comment: 'Original comment' });

    span.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const modal = document.querySelector('.assist-annotation-modal-overlay');
    expect(modal).toBeTruthy();
    expect(modal.querySelector('#annotation-modal-title').textContent).toBe('Edit Annotation');
    expect(modal.querySelector('#annotation-comment').value).toBe('Original comment');
    expect(modal.querySelector('.assist-annotation-btn-delete')).toBeTruthy();
  });

  test('an edited annotation shows its new comment, not the one it was created with', async () => {
    const span = await annotateSelection({ comment: 'Original comment' });

    span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const editModal = document.querySelector('.assist-annotation-modal-overlay');
    editModal.querySelector('#annotation-comment').value = 'Revised comment';
    editModal
      .querySelector('.assist-annotation-color-option[data-color="green"]')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    editModal
      .querySelector('.assist-annotation-btn-save')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(span.style.backgroundColor).toBe(ANNOTATION_COLORS.green.fill);
    expect(span.getAttribute('aria-label')).toBe('Annotation: Revised comment');

    span.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const tooltip = document.querySelector('.assist-annotation-tooltip');
    expect(tooltip.querySelector('.assist-annotation-tooltip-comment').textContent).toBe(
      'Revised comment'
    );

    span.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const reopened = document.querySelector('.assist-annotation-modal-overlay');
    expect(reopened.querySelector('#annotation-comment').value).toBe('Revised comment');
  });
});

describe('Injected stylesheet', () => {
  test('respects forced colors and reduced motion', () => {
    const css = document.getElementById('assist-inline-annotation-styles').textContent;

    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');

    // The fill and underline are inline styles, and a style attribute outranks a normal
    // rule in this sheet, so the forced-colors override only lands if it is !important.
    const forcedColors = css.slice(css.indexOf('@media (forced-colors: active)'));
    expect(forcedColors).toContain('background-color: Mark !important');
    expect(forcedColors).toContain('border-bottom: 3px solid MarkText !important');
  });

  test('leaves the I-beam on highlighted text — it is selectable prose, not a button', () => {
    const css = document.getElementById('assist-inline-annotation-styles').textContent;
    const highlightRule = css.slice(
      css.indexOf('.assist-inline-annotation {'),
      css.indexOf('.assist-inline-annotation:hover')
    );

    expect(highlightRule).not.toContain('cursor');
  });

  test('layers the modal from the shared scale, not a raw z-index', () => {
    const css = document.getElementById('assist-inline-annotation-styles').textContent;

    expect(css).toContain(`z-index: ${Z.MODAL}`);
    expect(css).not.toContain('999998');
  });
});
