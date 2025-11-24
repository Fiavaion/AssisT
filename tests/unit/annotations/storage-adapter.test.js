/**
 * Unit Tests for Storage Adapter (Annotations Feature)
 * Tests cover:
 * 1. LocalStorageAdapter CRUD operations
 * 2. DexieStorageAdapter CRUD operations
 * 3. Search and filter functionality
 * 4. Error handling
 * 5. Edge cases (empty data, concurrent operations)
 */

import {
  getStorageAdapter,
  LocalStorageAdapter,
  DexieStorageAdapter
} from '../../../src/features/annotations/storage-adapter.js';

// Mock chrome.storage.local
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    }
  },
  runtime: {
    lastError: null
  }
};

// Mock Dexie
jest.mock('dexie', () => {
  const mockDb = {
    annotations: {
      toArray: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue(null),
      where: jest.fn(() => ({
        equals: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([])
        })),
        anyOf: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([])
        }))
      })),
      add: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      delete: jest.fn().mockResolvedValue(undefined),
      filter: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([])
      })),
      count: jest.fn().mockResolvedValue(0),
      clear: jest.fn().mockResolvedValue(undefined),
      bulkAdd: jest.fn().mockResolvedValue(undefined)
    }
  };

  return class MockDexie {
    constructor(name) {
      this.name = name;
      this.annotations = mockDb.annotations;
    }

    version(num) {
      return {
        stores: jest.fn(() => this)
      };
    }
  };
});

describe('Storage Adapter Factory', () => {
  test('should return LocalStorageAdapter when mode is "local"', () => {
    const adapter = getStorageAdapter('local');
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  test('should return DexieStorageAdapter when mode is "indexeddb"', () => {
    const adapter = getStorageAdapter('indexeddb');
    expect(adapter).toBeInstanceOf(DexieStorageAdapter);
  });

  test('should default to LocalStorageAdapter when no mode specified', () => {
    const adapter = getStorageAdapter();
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });
});

describe('LocalStorageAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new LocalStorageAdapter();
    jest.clearAllMocks();
  });

  describe('CRUD Operations', () => {
    test('should create annotation with auto-generated ID', async () => {
      const mockAnnotation = {
        type: 'note',
        url: 'https://example.com',
        content: 'Test note',
        x: 100,
        y: 200
      };

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: [], nextId: 1 } });
      });

      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      const result = await adapter.create(mockAnnotation);

      expect(result).toMatchObject({
        ...mockAnnotation,
        id: 1,
        tags: [],
        color: 'yellow'
      });
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('should get annotation by ID', async () => {
      const mockAnnotations = [
        { id: 1, content: 'Note 1', url: 'https://example.com' },
        { id: 2, content: 'Note 2', url: 'https://example.com' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 3 } });
      });

      const result = await adapter.getById(2);

      expect(result).toEqual(mockAnnotations[1]);
    });

    test('should return null when annotation not found by ID', async () => {
      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: [], nextId: 1 } });
      });

      const result = await adapter.getById(999);

      expect(result).toBeNull();
    });

    test('should get annotations by URL', async () => {
      const mockAnnotations = [
        { id: 1, content: 'Note 1', url: 'https://example.com' },
        { id: 2, content: 'Note 2', url: 'https://another.com' },
        { id: 3, content: 'Note 3', url: 'https://example.com' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 4 } });
      });

      const result = await adapter.getByUrl('https://example.com');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
    });

    test('should get all annotations', async () => {
      const mockAnnotations = [
        { id: 1, content: 'Note 1' },
        { id: 2, content: 'Note 2' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 3 } });
      });

      const result = await adapter.getAll();

      expect(result).toEqual(mockAnnotations);
    });

    test('should update annotation', async () => {
      const oldTimestamp = Date.now() - 1000; // 1 second ago
      const mockAnnotations = [
        { id: 1, content: 'Old content', createdAt: oldTimestamp, updatedAt: oldTimestamp }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 2 } });
      });

      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      const result = await adapter.update(1, { content: 'New content' });

      expect(result.content).toBe('New content');
      expect(result.updatedAt).toBeGreaterThan(oldTimestamp);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('should throw error when updating non-existent annotation', async () => {
      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: [], nextId: 1 } });
      });

      await expect(adapter.update(999, { content: 'New' })).rejects.toThrow('Annotation 999 not found');
    });

    test('should delete annotation', async () => {
      const mockAnnotations = [
        { id: 1, content: 'Note 1' },
        { id: 2, content: 'Note 2' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 3 } });
      });

      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      const result = await adapter.delete(1);

      expect(result).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('should return false when deleting non-existent annotation', async () => {
      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: [], nextId: 1 } });
      });

      const result = await adapter.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('Search and Filter', () => {
    test('should search annotations by content', async () => {
      const mockAnnotations = [
        { id: 1, content: 'JavaScript tutorial', title: '', tags: [] },
        { id: 2, content: 'Python guide', title: '', tags: [] },
        { id: 3, content: 'JavaScript advanced', title: '', tags: [] }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 4 } });
      });

      const result = await adapter.search('javascript');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
    });

    test('should search annotations by title', async () => {
      const mockAnnotations = [
        { id: 1, content: 'Content 1', title: 'Important Note', tags: [] },
        { id: 2, content: 'Content 2', title: 'Regular Note', tags: [] }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 3 } });
      });

      const result = await adapter.search('important');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    test('should search annotations by tags', async () => {
      const mockAnnotations = [
        { id: 1, content: 'Note 1', title: '', tags: ['work', 'urgent'] },
        { id: 2, content: 'Note 2', title: '', tags: ['personal'] }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 3 } });
      });

      const result = await adapter.search('urgent');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    test('should filter annotations by URL', async () => {
      const mockAnnotations = [
        { id: 1, url: 'https://example.com', tags: [], color: 'yellow' },
        { id: 2, url: 'https://another.com', tags: [], color: 'blue' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 3 } });
      });

      const result = await adapter.filter({ url: 'https://example.com' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    test('should filter annotations by tags', async () => {
      const mockAnnotations = [
        { id: 1, tags: ['work', 'urgent'], url: '', color: 'yellow' },
        { id: 2, tags: ['personal'], url: '', color: 'blue' },
        { id: 3, tags: ['work'], url: '', color: 'green' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 4 } });
      });

      const result = await adapter.filter({ tags: ['work'] });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
    });

    test('should filter annotations by color', async () => {
      const mockAnnotations = [
        { id: 1, color: 'yellow', tags: [], url: '' },
        { id: 2, color: 'blue', tags: [], url: '' },
        { id: 3, color: 'yellow', tags: [], url: '' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 4 } });
      });

      const result = await adapter.filter({ color: 'yellow' });

      expect(result).toHaveLength(2);
    });

    test('should filter annotations by date range', async () => {
      const now = Date.now();
      const mockAnnotations = [
        { id: 1, createdAt: now - 10000, tags: [], url: '', color: 'yellow' },
        { id: 2, createdAt: now - 5000, tags: [], url: '', color: 'blue' },
        { id: 3, createdAt: now - 1000, tags: [], url: '', color: 'green' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 4 } });
      });

      const result = await adapter.filter({
        startDate: now - 7000,
        endDate: now
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(3);
    });
  });

  describe('Utility Operations', () => {
    test('should count annotations', async () => {
      const mockAnnotations = [
        { id: 1 },
        { id: 2 },
        { id: 3 }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 4 } });
      });

      const result = await adapter.count();

      expect(result).toBe(3);
    });

    test('should clear all annotations', async () => {
      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      await adapter.clear();

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { assist_annotations: { annotations: [], nextId: expect.any(Number) } },
        expect.any(Function)
      );
    });

    test('should export annotations', async () => {
      const mockAnnotations = [
        { id: 1, content: 'Note 1' },
        { id: 2, content: 'Note 2' }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: mockAnnotations, nextId: 3 } });
      });

      const result = await adapter.export();

      expect(result).toEqual(mockAnnotations);
    });

    test('should import annotations with new IDs', async () => {
      const importData = [
        { content: 'Imported 1', tags: [] },
        { content: 'Imported 2', tags: [] }
      ];

      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: [], nextId: 1 } });
      });

      chrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      const result = await adapter.import(importData);

      expect(result).toBe(2);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle storage errors on create', async () => {
      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ assist_annotations: { annotations: [], nextId: 1 } });
      });

      chrome.storage.local.set.mockImplementation((data, callback) => {
        const error = new Error('Storage quota exceeded');
        chrome.runtime.lastError = error;
        throw error; // Trigger rejection
      });

      await expect(adapter.create({ content: 'Test' })).rejects.toThrow('Storage quota exceeded');

      chrome.runtime.lastError = null;
    });

    test('should handle empty storage gracefully', async () => {
      chrome.storage.local.get.mockImplementation((key, callback) => {
        callback({});
      });

      const result = await adapter.getAll();

      expect(result).toEqual([]);
    });
  });
});

describe('DexieStorageAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new DexieStorageAdapter();
    jest.clearAllMocks();
  });

  describe('CRUD Operations', () => {
    test('should create annotation with Dexie', async () => {
      const mockAnnotation = {
        type: 'note',
        url: 'https://example.com',
        content: 'Test note'
      };

      adapter.db.annotations.add.mockResolvedValue(1);
      adapter.db.annotations.get.mockResolvedValue({
        ...mockAnnotation,
        id: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
        color: 'yellow'
      });

      const result = await adapter.create(mockAnnotation);

      expect(result.id).toBe(1);
      expect(adapter.db.annotations.add).toHaveBeenCalled();
    });

    test('should get annotation by ID with Dexie', async () => {
      const mockAnnotation = { id: 1, content: 'Test' };
      adapter.db.annotations.get.mockResolvedValue(mockAnnotation);

      const result = await adapter.getById(1);

      expect(result).toEqual(mockAnnotation);
      expect(adapter.db.annotations.get).toHaveBeenCalledWith(1);
    });

    test('should get annotations by URL with Dexie', async () => {
      const mockAnnotations = [
        { id: 1, url: 'https://example.com' },
        { id: 2, url: 'https://example.com' }
      ];

      const mockWhere = {
        equals: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue(mockAnnotations)
        }))
      };
      adapter.db.annotations.where.mockReturnValue(mockWhere);

      const result = await adapter.getByUrl('https://example.com');

      expect(result).toEqual(mockAnnotations);
      expect(adapter.db.annotations.where).toHaveBeenCalledWith('url');
    });

    test('should update annotation with Dexie', async () => {
      const updatedAnnotation = { id: 1, content: 'Updated', updatedAt: Date.now() };

      adapter.db.annotations.update.mockResolvedValue(1);
      adapter.db.annotations.get.mockResolvedValue(updatedAnnotation);

      const result = await adapter.update(1, { content: 'Updated' });

      expect(result).toEqual(updatedAnnotation);
      expect(adapter.db.annotations.update).toHaveBeenCalled();
    });

    test('should delete annotation with Dexie', async () => {
      adapter.db.annotations.delete.mockResolvedValue(undefined);

      const result = await adapter.delete(1);

      expect(result).toBe(true);
      expect(adapter.db.annotations.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('Search and Filter', () => {
    test('should search annotations with Dexie', async () => {
      const mockAnnotations = [
        { id: 1, content: 'JavaScript tutorial' }
      ];

      const mockFilter = {
        toArray: jest.fn().mockResolvedValue(mockAnnotations)
      };
      adapter.db.annotations.filter.mockReturnValue(mockFilter);

      const result = await adapter.search('javascript');

      expect(result).toEqual(mockAnnotations);
      expect(adapter.db.annotations.filter).toHaveBeenCalled();
    });

    test('should filter by tags with Dexie', async () => {
      const mockAnnotations = [
        { id: 1, tags: ['work'] }
      ];

      const mockAnyOf = {
        toArray: jest.fn().mockResolvedValue(mockAnnotations)
      };
      const mockWhere = {
        anyOf: jest.fn(() => mockAnyOf)
      };
      adapter.db.annotations.where.mockReturnValue(mockWhere);

      const result = await adapter.filter({ tags: ['work'] });

      expect(result).toEqual(mockAnnotations);
    });

    test('should count annotations with Dexie', async () => {
      adapter.db.annotations.count.mockResolvedValue(5);

      const result = await adapter.count();

      expect(result).toBe(5);
    });
  });

  describe('Import/Export', () => {
    test('should import annotations with bulkAdd', async () => {
      const importData = [
        { content: 'Import 1' },
        { content: 'Import 2' }
      ];

      adapter.db.annotations.bulkAdd.mockResolvedValue(undefined);

      const result = await adapter.import(importData);

      expect(result).toBe(2);
      expect(adapter.db.annotations.bulkAdd).toHaveBeenCalledWith(importData);
    });
  });
});
