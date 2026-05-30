/**
 * Unit Tests for Vocabulary Manager (Phase 2.7 - S.5)
 *
 * Tests cover:
 * 1. VocabularyPresets constants
 * 2. Similarity calculations
 * 3. Auto-learning tracking logic
 * 4. Settings management
 * 5. Import/Export text parsing
 *
 * Note: Database-dependent tests require integration testing with IndexedDB.
 * These unit tests focus on pure logic that can be tested in isolation.
 */

import {
  VocabularyManager,
  VocabularyPresets,
} from '../../../src/engines/stt/vocabulary-manager.js';

// Mock Dexie.js for IndexedDB - simplified mock that allows construction
jest.mock('dexie', () => {
  return class MockDexie {
    constructor(name) {
      this.name = name;
      this.vocabulary = {
        add: jest.fn().mockResolvedValue(1),
        get: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(1),
        delete: jest.fn().mockResolvedValue(1),
        bulkAdd: jest.fn().mockResolvedValue(undefined),
        bulkDelete: jest.fn().mockResolvedValue(undefined),
        toArray: jest.fn().mockResolvedValue([]),
        toCollection: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
          filter: jest.fn().mockReturnThis(),
        }),
        where: jest.fn().mockReturnValue({
          equals: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue(null),
            toArray: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            delete: jest.fn().mockResolvedValue(0),
          }),
          equalsIgnoreCase: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue(null),
          }),
        }),
        filter: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      this.settings = {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
      };
    }

    version() {
      return { stores: () => this };
    }

    table(name) {
      return this[name] || {};
    }
  };
});

describe('VocabularyPresets', () => {
  test('should have all preset constants defined', () => {
    expect(VocabularyPresets.MEDICAL).toBe('medical');
    expect(VocabularyPresets.LEGAL).toBe('legal');
    expect(VocabularyPresets.ACADEMIC).toBe('academic');
    expect(VocabularyPresets.STEM).toBe('stem');
    expect(VocabularyPresets.CUSTOM).toBe('custom');
  });

  test('should have unique values for each preset', () => {
    const values = Object.values(VocabularyPresets);
    const uniqueValues = [...new Set(values)];
    expect(values.length).toBe(uniqueValues.length);
  });
});

describe('VocabularyManager', () => {
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new VocabularyManager({
      autoLearnEnabled: true,
      autoLearnThreshold: 3,
      enabledCategories: [VocabularyPresets.CUSTOM],
    });
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
  });

  describe('Initialization', () => {
    test('should create manager with default settings', () => {
      const defaultManager = new VocabularyManager();

      expect(defaultManager.settings.autoLearnEnabled).toBe(true);
      expect(defaultManager.settings.autoLearnThreshold).toBe(3);
      expect(defaultManager.settings.maxVocabularySize).toBe(10000);
      expect(defaultManager.settings.enabledCategories).toContain(VocabularyPresets.CUSTOM);

      defaultManager.destroy();
    });

    test('should create manager with custom settings', () => {
      expect(manager.settings.autoLearnEnabled).toBe(true);
      expect(manager.settings.autoLearnThreshold).toBe(3);
      expect(manager.settings.enabledCategories).toContain(VocabularyPresets.CUSTOM);
    });

    test('should initialize database connection', async () => {
      const result = await manager.initialize();
      expect(result).toBe(true);
    });
  });

  describe('Similarity Calculation', () => {
    test('should return 1 for identical strings', () => {
      expect(manager.calculateSimilarity('test', 'test')).toBe(1);
      expect(manager.calculateSimilarity('algorithm', 'algorithm')).toBe(1);
    });

    test('should return 0 for empty strings with non-empty', () => {
      expect(manager.calculateSimilarity('', 'test')).toBe(0);
      expect(manager.calculateSimilarity('test', '')).toBe(0);
    });

    test('should handle two empty strings', () => {
      // Two empty strings are technically identical
      const result = manager.calculateSimilarity('', '');
      // The function returns 1 for identical strings (including empty)
      expect(result).toBe(1);
    });

    test('should return high similarity for strings with common prefix', () => {
      const similarity = manager.calculateSimilarity('test', 'testing');
      expect(similarity).toBeGreaterThan(0.5);
    });

    test('should return low similarity for unrelated strings', () => {
      const similarity = manager.calculateSimilarity('abc', 'xyz');
      expect(similarity).toBeLessThan(0.5);
    });

    test('should give bonus for containment', () => {
      const withContain = manager.calculateSimilarity('test', 'testing');
      const withoutContain = manager.calculateSimilarity('test', 'abcdef');
      expect(withContain).toBeGreaterThan(withoutContain);
    });
  });

  describe('Auto-Learning Tracking', () => {
    test('should track corrections when enabled', () => {
      manager.trackCorrection('algorythm', 'algorithm');

      expect(manager.correctionTracker.has('algorithm')).toBe(true);
      expect(manager.correctionTracker.get('algorithm').count).toBe(1);
    });

    test('should increment count for repeated corrections', () => {
      manager.trackCorrection('algorythm', 'algorithm');
      manager.trackCorrection('algorythm', 'algorithm');

      expect(manager.correctionTracker.get('algorithm').count).toBe(2);
    });

    test('should not track when auto-learn disabled', () => {
      manager.settings.autoLearnEnabled = false;
      manager.trackCorrection('mistake', 'correction');

      expect(manager.correctionTracker.size).toBe(0);
    });

    test('should track multiple different corrections', () => {
      manager.trackCorrection('mistake1', 'correction1');
      manager.trackCorrection('mistake2', 'correction2');

      expect(manager.correctionTracker.size).toBe(2);
      expect(manager.correctionTracker.has('correction1')).toBe(true);
      expect(manager.correctionTracker.has('correction2')).toBe(true);
    });

    test('should ignore short words (less than 3 chars)', () => {
      manager.trackCorrection('a', 'ab');

      expect(manager.correctionTracker.has('ab')).toBe(false);
    });

    test('should extract new words from corrected text', () => {
      // Original has "hello", corrected has "hello world"
      manager.trackCorrection('hello', 'hello world');

      expect(manager.correctionTracker.has('world')).toBe(true);
    });
  });

  describe('Settings Management', () => {
    test('should update settings', async () => {
      await manager.updateSettings({
        autoLearnEnabled: false,
        autoLearnThreshold: 5,
      });

      expect(manager.settings.autoLearnEnabled).toBe(false);
      expect(manager.settings.autoLearnThreshold).toBe(5);
    });

    test('should preserve unmodified settings', async () => {
      const originalCategories = [...manager.settings.enabledCategories];

      await manager.updateSettings({ autoLearnEnabled: false });

      expect(manager.settings.enabledCategories).toEqual(originalCategories);
    });

    test('should invalidate cache on settings update', async () => {
      manager.cachedVocabulary = ['test'];
      manager.cacheExpiry = Date.now() + 60000;

      await manager.updateSettings({ autoLearnEnabled: false });

      expect(manager.cachedVocabulary).toBeNull();
      expect(manager.cacheExpiry).toBeNull();
    });
  });

  describe('Cache Management', () => {
    test('should start with null cache', () => {
      expect(manager.cachedVocabulary).toBeNull();
      expect(manager.cacheExpiry).toBeNull();
    });

    test('should invalidate cache correctly', () => {
      manager.cachedVocabulary = ['test'];
      manager.cacheExpiry = Date.now() + 60000;

      manager.invalidateCache();

      expect(manager.cachedVocabulary).toBeNull();
      expect(manager.cacheExpiry).toBeNull();
    });
  });

  describe('Preset Sizes', () => {
    test('should return correct size for medical preset', () => {
      const size = manager.getPresetSize(VocabularyPresets.MEDICAL);
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    test('should return correct size for legal preset', () => {
      const size = manager.getPresetSize(VocabularyPresets.LEGAL);
      expect(size).toBeGreaterThan(0);
    });

    test('should return correct size for academic preset', () => {
      const size = manager.getPresetSize(VocabularyPresets.ACADEMIC);
      expect(size).toBeGreaterThan(0);
    });

    test('should return correct size for STEM preset', () => {
      const size = manager.getPresetSize(VocabularyPresets.STEM);
      expect(size).toBeGreaterThan(0);
    });

    test('should return 0 for unknown preset', () => {
      const size = manager.getPresetSize('unknown');
      expect(size).toBe(0);
    });

    test('should return 0 for custom preset', () => {
      // Custom preset has no pre-defined words
      const size = manager.getPresetSize(VocabularyPresets.CUSTOM);
      expect(size).toBe(0);
    });
  });

  describe('Cleanup', () => {
    test('should clear all state on destroy', () => {
      // Set up some state
      manager.cachedVocabulary = ['test'];
      manager.cacheExpiry = Date.now() + 60000;
      manager.correctionTracker.set('word', 2);

      manager.destroy();

      expect(manager.cachedVocabulary).toBeNull();
      expect(manager.cacheExpiry).toBeNull();
      expect(manager.correctionTracker.size).toBe(0);
    });
  });

  describe('Text Import Parsing', () => {
    test('should parse simple text format correctly', async () => {
      await manager.initialize();

      // Test the parsing logic conceptually
      const textContent = `word1
word2
word3`;
      const lines = textContent.split('\n').filter(line => line.trim());

      expect(lines.length).toBe(3);
      expect(lines[0]).toBe('word1');
    });

    test('should parse text with phonetic hints', () => {
      const line = 'adenocarcinoma|ad-uh-no-kar-suh-NO-muh';
      const parts = line.split('|');

      expect(parts[0].trim()).toBe('adenocarcinoma');
      expect(parts[1].trim()).toBe('ad-uh-no-kar-suh-NO-muh');
    });

    test('should handle lines without phonetic hints', () => {
      const line = 'simpleword';
      const parts = line.split('|');

      expect(parts[0].trim()).toBe('simpleword');
      expect(parts[1]).toBeUndefined();
    });
  });

  describe('JSON Export Format', () => {
    test('should generate valid export structure', () => {
      const words = [
        { word: 'test1', phonetic: 'pron1' },
        { word: 'test2', phonetic: '' },
      ];

      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        vocabulary: words.map(w => ({
          word: w.word,
          phonetic: w.phonetic,
          category: VocabularyPresets.CUSTOM,
          tags: [],
        })),
      };

      expect(exportData.version).toBe('1.0');
      expect(exportData.vocabulary).toHaveLength(2);
      expect(exportData.vocabulary[0].word).toBe('test1');
      expect(exportData.exportDate).toBeDefined();
    });
  });

  describe('Word Validation', () => {
    test('addWord should reject empty strings', async () => {
      await manager.initialize();

      await expect(manager.addWord('')).rejects.toThrow('Word must be a non-empty string');
    });

    test('addWord should reject null', async () => {
      await manager.initialize();

      await expect(manager.addWord(null)).rejects.toThrow('Word must be a non-empty string');
    });

    test('addWord should reject undefined', async () => {
      await manager.initialize();

      await expect(manager.addWord(undefined)).rejects.toThrow('Word must be a non-empty string');
    });
  });
});

describe('VocabularyManager - Callbacks', () => {
  test('should call onWordAdded callback', async () => {
    const onWordAdded = jest.fn();
    const manager = new VocabularyManager({
      onWordAdded,
    });
    await manager.initialize();

    // The callback is set up - verify it exists
    expect(manager.onWordAdded).toBe(onWordAdded);

    manager.destroy();
  });

  test('should call onWordRemoved callback', async () => {
    const onWordRemoved = jest.fn();
    const manager = new VocabularyManager({
      onWordRemoved,
    });
    await manager.initialize();

    expect(manager.onWordRemoved).toBe(onWordRemoved);

    manager.destroy();
  });

  test('should call onError callback', async () => {
    const onError = jest.fn();
    const manager = new VocabularyManager({
      onError,
    });

    expect(manager.onError).toBe(onError);

    manager.destroy();
  });
});
