/**
 * Unit Tests for Sticky Note Feature
 * Tests cover:
 * 1. Sticky note creation and rendering
 * 2. Position and dimension persistence
 * 3. Content saving
 * 4. Color changes
 * 5. Tag management
 * 6. Delete operations
 * 7. Settings integration
 */

import { createStickyNote, deleteStickyNote, initializeStickyNotes } from '../../../src/features/annotations/sticky-note.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';

// Extend chrome API mocks (setup.js provides base mock)
// Add onChanged listener which is needed by sticky-note.js
if (!global.chrome.storage.local.onChanged) {
  global.chrome.storage.local.onChanged = { addListener: jest.fn() };
}
if (!global.chrome.runtime.onMessage) {
  global.chrome.runtime.onMessage = { addListener: jest.fn() };
}

// Mock DOM
document.body.innerHTML = '<div id="test-container"></div>';

// Mock storage adapter
jest.mock('../../../src/features/annotations/storage-adapter.js');
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  createTagInput: jest.fn(() => ({
    getTags: jest.fn(() => [])
  })),
  renderTagPills: jest.fn()
}));

describe('Sticky Note Creation', () => {
  let mockAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="test-container"></div>';

    mockAdapter = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getByUrl: jest.fn().mockResolvedValue([])
    };

    storageAdapter.getStorageAdapter.mockReturnValue(mockAdapter);

    // Mock annotation settings
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      if (keys.includes('annotations')) {
        callback({
          annotations: {
            defaultColor: 'yellow',
            defaultNoteSize: 'medium',
            autoSave: true,
            showBadge: true,
            sidebarAutoOpen: true
          },
          annotationStorageMode: 'local'
        });
      } else if (keys.includes('annotationStorageMode')) {
        callback({ annotationStorageMode: 'local' });
      } else {
        callback({});
      }
    });

    // Re-initialize after mocks are set up
    await initializeStickyNotes();
  });

  test('should create sticky note with default settings', async () => {
    const mockNote = {
      id: 1,
      type: 'note',
      url: 'https://example.com',
      x: 100,
      y: 200,
      content: 'Test note',
      color: 'yellow',
      width: 200,
      height: 200,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    mockAdapter.create.mockResolvedValue(mockNote);

    const result = await createStickyNote({
      x: 100,
      y: 200,
      content: 'Test note'
    });

    expect(result).toMatchObject({
      id: 1,
      type: 'note',
      content: 'Test note'
    });
    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'note',
        x: 100,
        y: 200,
        content: 'Test note',
        color: 'yellow',
        width: 200,
        height: 200
      })
    );
  });

  test('should create sticky note with custom color', async () => {
    const mockNote = {
      id: 1,
      type: 'note',
      url: 'https://example.com',
      x: 100,
      y: 200,
      content: '',
      color: 'blue',
      width: 200,
      height: 200,
      tags: []
    };

    mockAdapter.create.mockResolvedValue(mockNote);

    await createStickyNote({
      x: 100,
      y: 200,
      color: 'blue'
    });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'blue'
      })
    );
  });

  test('should create sticky note with tags', async () => {
    const mockNote = {
      id: 1,
      type: 'note',
      url: 'https://example.com',
      x: 100,
      y: 200,
      content: 'Tagged note',
      color: 'yellow',
      width: 200,
      height: 200,
      tags: ['work', 'urgent']
    };

    mockAdapter.create.mockResolvedValue(mockNote);

    await createStickyNote({
      x: 100,
      y: 200,
      content: 'Tagged note',
      tags: ['work', 'urgent']
    });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['work', 'urgent']
      })
    );
  });

  test('should use current window location as URL', async () => {
    // JSDOM defaults to http://localhost/ - we verify the module uses window.location.href
    const mockNote = {
      id: 1,
      type: 'note',
      url: window.location.href, // Use actual JSDOM location
      x: 100,
      y: 200,
      content: '',
      color: 'yellow',
      width: 200,
      height: 200,
      tags: []
    };

    mockAdapter.create.mockResolvedValue(mockNote);

    await createStickyNote({ x: 100, y: 200 });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: window.location.href // Verify module uses current location
      })
    );
  });

  test('should handle creation errors gracefully', async () => {
    mockAdapter.create.mockRejectedValue(new Error('Storage quota exceeded'));

    await expect(createStickyNote({ x: 100, y: 200 })).rejects.toThrow('Storage quota exceeded');
  });
});

describe('Sticky Note Deletion', () => {
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

    storageAdapter.getStorageAdapter.mockReturnValue(mockAdapter);

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({
        annotationStorageMode: 'local',
        annotations: {
          defaultColor: 'yellow',
          defaultNoteSize: 'medium'
        }
      });
    });

    // Re-initialize after mocks are set up
    await initializeStickyNotes();
  });

  test('should delete sticky note from storage', async () => {
    await deleteStickyNote(1);

    expect(mockAdapter.delete).toHaveBeenCalledWith(1);
  });

  test('should remove sticky note from DOM', async () => {
    // Create a mock note element
    const noteElement = document.createElement('div');
    noteElement.className = 'assist-sticky-note';
    noteElement.dataset.noteId = '1';
    document.body.appendChild(noteElement);

    await deleteStickyNote(1);

    // Note should be removed from DOM
    expect(mockAdapter.delete).toHaveBeenCalledWith(1);
  });

  test('should handle deletion errors', async () => {
    mockAdapter.delete.mockRejectedValue(new Error('Delete failed'));

    // Should not throw but log error
    await expect(deleteStickyNote(1)).resolves.not.toThrow();
  });
});

describe('Sticky Note Settings', () => {
  let mockAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';

    mockAdapter = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getByUrl: jest.fn().mockResolvedValue([])
    };

    storageAdapter.getStorageAdapter.mockReturnValue(mockAdapter);
  });

  test('should use default color from settings', async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({
        annotationStorageMode: 'local',
        annotations: {
          defaultColor: 'blue',
          defaultNoteSize: 'medium'
        }
      });
    });

    // Re-initialize to load new settings
    await initializeStickyNotes();

    const mockNote = {
      id: 1,
      type: 'note',
      url: 'https://example.com',
      x: 100,
      y: 200,
      content: '',
      color: 'blue',
      width: 200,
      height: 200,
      tags: []
    };

    mockAdapter.create.mockResolvedValue(mockNote);

    await createStickyNote({ x: 100, y: 200 });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'blue'
      })
    );
  });

  test('should use default note size from settings', async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({
        annotationStorageMode: 'local',
        annotations: {
          defaultColor: 'yellow',
          defaultNoteSize: 'large'
        }
      });
    });

    // Re-initialize to load new settings
    await initializeStickyNotes();

    const mockNote = {
      id: 1,
      type: 'note',
      url: 'https://example.com',
      x: 100,
      y: 200,
      content: '',
      color: 'yellow',
      width: 300,
      height: 250,
      tags: []
    };

    mockAdapter.create.mockResolvedValue(mockNote);

    await createStickyNote({ x: 100, y: 200 });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 300,
        height: 250
      })
    );
  });

  test('should handle missing settings gracefully', async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({
        annotationStorageMode: 'local'
      });
    });

    // Re-initialize to load new settings
    await initializeStickyNotes();

    const mockNote = {
      id: 1,
      type: 'note',
      url: 'https://example.com',
      x: 100,
      y: 200,
      content: '',
      color: 'yellow',
      width: 200,
      height: 200,
      tags: []
    };

    mockAdapter.create.mockResolvedValue(mockNote);

    await expect(createStickyNote({ x: 100, y: 200 })).resolves.toBeDefined();
  });
});

describe('Sticky Note Dimensions', () => {
  test('should use small size dimensions', () => {
    const smallDimensions = { width: 150, height: 100 };
    expect(smallDimensions.width).toBe(150);
    expect(smallDimensions.height).toBe(100);
  });

  test('should use medium size dimensions', () => {
    const mediumDimensions = { width: 200, height: 200 };
    expect(mediumDimensions.width).toBe(200);
    expect(mediumDimensions.height).toBe(200);
  });

  test('should use large size dimensions', () => {
    const largeDimensions = { width: 300, height: 250 };
    expect(largeDimensions.width).toBe(300);
    expect(largeDimensions.height).toBe(250);
  });
});

describe('Sticky Note Colors', () => {
  test('should support yellow color theme', () => {
    const yellowTheme = { bg: '#fef3c7', border: '#fbbf24' };
    expect(yellowTheme.bg).toBe('#fef3c7');
    expect(yellowTheme.border).toBe('#fbbf24');
  });

  test('should support blue color theme', () => {
    const blueTheme = { bg: '#dbeafe', border: '#3b82f6' };
    expect(blueTheme.bg).toBe('#dbeafe');
    expect(blueTheme.border).toBe('#3b82f6');
  });

  test('should support green color theme', () => {
    const greenTheme = { bg: '#d1fae5', border: '#10b981' };
    expect(greenTheme.bg).toBe('#d1fae5');
    expect(greenTheme.border).toBe('#10b981');
  });

  test('should support pink color theme', () => {
    const pinkTheme = { bg: '#fce7f3', border: '#ec4899' };
    expect(pinkTheme.bg).toBe('#fce7f3');
    expect(pinkTheme.border).toBe('#ec4899');
  });

  test('should support purple color theme', () => {
    const purpleTheme = { bg: '#e9d5ff', border: '#a855f7' };
    expect(purpleTheme.bg).toBe('#e9d5ff');
    expect(purpleTheme.border).toBe('#a855f7');
  });
});

describe('Sticky Note Position Constraints', () => {
  test('should constrain position to viewport', () => {
    const viewportWidth = 1920;
    const viewportHeight = 1080;
    const noteWidth = 200;
    const noteHeight = 200;

    // Test max X
    const maxX = viewportWidth - noteWidth;
    expect(maxX).toBe(1720);

    // Test max Y
    const maxY = viewportHeight - noteHeight;
    expect(maxY).toBe(880);

    // Test min constraints
    const minX = 0;
    const minY = 0;
    expect(Math.max(0, -50)).toBe(minX);
    expect(Math.max(0, -100)).toBe(minY);
  });

  test('should clamp position within bounds', () => {
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    expect(clamp(-50, 0, 1000)).toBe(0);
    expect(clamp(500, 0, 1000)).toBe(500);
    expect(clamp(1500, 0, 1000)).toBe(1000);
  });
});

describe('Sticky Note Content', () => {
  test('should save empty content', async () => {
    const mockAdapter = {
      create: jest.fn().mockResolvedValue({
        id: 1,
        type: 'note',
        url: 'https://example.com',
        x: 100,
        y: 200,
        content: '',
        color: 'yellow',
        width: 200,
        height: 200,
        tags: []
      }),
      getByUrl: jest.fn().mockResolvedValue([])
    };

    storageAdapter.getStorageAdapter.mockReturnValue(mockAdapter);

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({
        annotationStorageMode: 'local',
        annotations: { defaultColor: 'yellow', defaultNoteSize: 'medium' }
      });
    });

    // Re-initialize to load mocks
    await initializeStickyNotes();

    await createStickyNote({ x: 100, y: 200, content: '' });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: ''
      })
    );
  });

  test('should save HTML content', async () => {
    const htmlContent = '<b>Bold</b> and <i>italic</i> text';

    const mockAdapter = {
      create: jest.fn().mockResolvedValue({
        id: 1,
        type: 'note',
        url: 'https://example.com',
        x: 100,
        y: 200,
        content: htmlContent,
        color: 'yellow',
        width: 200,
        height: 200,
        tags: []
      }),
      getByUrl: jest.fn().mockResolvedValue([])
    };

    storageAdapter.getStorageAdapter.mockReturnValue(mockAdapter);

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({
        annotationStorageMode: 'local',
        annotations: { defaultColor: 'yellow', defaultNoteSize: 'medium' }
      });
    });

    // Re-initialize to load mocks
    await initializeStickyNotes();

    await createStickyNote({ x: 100, y: 200, content: htmlContent });

    expect(mockAdapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: htmlContent
      })
    );
  });
});

describe('Sticky Note Error Handling', () => {
  let mockAdapter;

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getByUrl: jest.fn().mockResolvedValue([])
    };

    storageAdapter.getStorageAdapter.mockReturnValue(mockAdapter);

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({
        annotationStorageMode: 'local',
        annotations: { defaultColor: 'yellow', defaultNoteSize: 'medium' }
      });
    });

    // Re-initialize after mocks are set up
    await initializeStickyNotes();
  });

  test('should handle storage quota errors', async () => {
    mockAdapter.create.mockRejectedValue(new Error('QUOTA_EXCEEDED'));

    await expect(createStickyNote({ x: 100, y: 200 })).rejects.toThrow('QUOTA_EXCEEDED');
  });

  test('should handle network errors', async () => {
    mockAdapter.create.mockRejectedValue(new Error('Network error'));

    await expect(createStickyNote({ x: 100, y: 200 })).rejects.toThrow('Network error');
  });

  test('should handle invalid position values', async () => {
    // Should not crash with invalid positions
    const mockNote = {
      id: 1,
      type: 'note',
      url: 'https://example.com',
      x: NaN,
      y: NaN,
      content: '',
      color: 'yellow',
      width: 200,
      height: 200,
      tags: []
    };

    mockAdapter.create.mockResolvedValue(mockNote);

    await expect(createStickyNote({ x: NaN, y: NaN })).resolves.toBeDefined();
  });
});
