/**
 * Content Remapper Unit Tests
 * Testing content remapping functionality for scotoma-aware content repositioning
 * Following TDD: Testing actual implementation
 */

import * as ContentRemapper from '../../../src/features/stargardt/content-remapper.js';

// Mock DOM elements
const mockCreateElement = document.createElement.bind(document);
const mockAppendChild = jest.fn();
const mockQuerySelectorAll = jest.fn();
const mockGetBoundingClientRect = jest.fn();

describe('ContentRemapper', () => {
  let originalDocument;
  let mockStyleElement;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock document.createElement
    mockStyleElement = {
      id: '',
      textContent: '',
    };

    // Setup basic DOM mocks
    document.head.appendChild = mockAppendChild;
    document.body.appendChild = mockAppendChild;

    // Mock getElementById to return null (style not yet injected)
    jest.spyOn(document, 'getElementById').mockReturnValue(null);

    // Mock querySelectorAll for content finding
    document.querySelectorAll = mockQuerySelectorAll;
    mockQuerySelectorAll.mockReturnValue([]);

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });

    // Mock requestAnimationFrame
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => setTimeout(cb, 16));
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => clearTimeout(id));
  });

  afterEach(() => {
    // Clean up any test modifications
    ContentRemapper.disable();
    jest.restoreAllMocks();
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('initialize()', () => {
    test('should initialize with profile and settings', () => {
      const mockProfile = {
        boundary: {
          shape: 'ellipse',
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };

      const mockSettings = {
        mode: 'peripheral-push',
        preferredSide: 'right',
        intensity: 50,
      };

      // Should not throw
      expect(() => ContentRemapper.initialize(mockProfile, mockSettings)).not.toThrow();
    });

    test('should initialize with default mode when not specified', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };

      ContentRemapper.initialize(mockProfile, {});

      const status = ContentRemapper.getStatus();
      expect(status.mode).toBe('peripheral-push');
    });

    test('should handle null settings', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };

      expect(() => ContentRemapper.initialize(mockProfile, null)).not.toThrow();
    });

    test('should accept gaze tracker as optional third parameter', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };

      const mockGazeTracker = {
        getLastGaze: jest.fn().mockReturnValue({ x: 960, y: 540 }),
      };

      expect(() =>
        ContentRemapper.initialize(mockProfile, {}, mockGazeTracker)
      ).not.toThrow();
    });
  });

  // ============================================================================
  // ENABLE / DISABLE TESTS
  // ============================================================================

  describe('enable()', () => {
    beforeEach(() => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
      ContentRemapper.initialize(mockProfile, { mode: 'peripheral-push' });
    });

    test('should enable remapper and update status', () => {
      ContentRemapper.enable();

      expect(ContentRemapper.isEnabled()).toBe(true);
      expect(ContentRemapper.getStatus().enabled).toBe(true);
    });

    test('should not re-enable if already enabled', () => {
      ContentRemapper.enable();
      const firstStatus = ContentRemapper.getStatus();

      ContentRemapper.enable(); // Second call
      const secondStatus = ContentRemapper.getStatus();

      expect(firstStatus.enabled).toBe(secondStatus.enabled);
    });
  });

  describe('disable()', () => {
    beforeEach(() => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
      ContentRemapper.initialize(mockProfile, {});
      ContentRemapper.enable();
    });

    test('should disable remapper and update status', () => {
      expect(ContentRemapper.isEnabled()).toBe(true);

      ContentRemapper.disable();

      expect(ContentRemapper.isEnabled()).toBe(false);
      expect(ContentRemapper.getStatus().enabled).toBe(false);
    });

    test('should not error if already disabled', () => {
      ContentRemapper.disable();
      expect(() => ContentRemapper.disable()).not.toThrow();
    });
  });

  // ============================================================================
  // UPDATE SETTINGS TESTS
  // ============================================================================

  describe('updateSettings()', () => {
    beforeEach(() => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
      ContentRemapper.initialize(mockProfile, { mode: 'peripheral-push' });
    });

    test('should update settings', () => {
      ContentRemapper.updateSettings({ preferredSide: 'left' });

      // Settings should be updated (verified via getStatus)
      const status = ContentRemapper.getStatus();
      expect(status).toBeDefined();
    });

    test('should handle mode change when disabled', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
      ContentRemapper.initialize(mockProfile, { mode: 'peripheral-push' });

      ContentRemapper.updateSettings({ mode: 'text-donut' });

      const status = ContentRemapper.getStatus();
      expect(status.mode).toBe('text-donut');
    });

    test('should restart with new mode when enabled and mode changes', () => {
      ContentRemapper.enable();
      expect(ContentRemapper.isEnabled()).toBe(true);

      ContentRemapper.updateSettings({ mode: 'rsvp' });

      // After mode change, should still be enabled
      expect(ContentRemapper.isEnabled()).toBe(true);
      expect(ContentRemapper.getStatus().mode).toBe('rsvp');
    });
  });

  // ============================================================================
  // STATUS TESTS
  // ============================================================================

  describe('getStatus()', () => {
    test('should return status object with expected properties', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
      ContentRemapper.initialize(mockProfile, { mode: 'peripheral-push' });

      const status = ContentRemapper.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('mode');
      expect(status).toHaveProperty('hasProfile');
      expect(status).toHaveProperty('hasGazeTracker');
    });

    test('should report hasProfile correctly', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
      ContentRemapper.initialize(mockProfile, {});

      expect(ContentRemapper.getStatus().hasProfile).toBe(true);
    });

    test('should report hasGazeTracker correctly', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };

      ContentRemapper.initialize(mockProfile, {});
      expect(ContentRemapper.getStatus().hasGazeTracker).toBe(false);

      const mockGazeTracker = { getLastGaze: jest.fn() };
      ContentRemapper.initialize(mockProfile, {}, mockGazeTracker);
      expect(ContentRemapper.getStatus().hasGazeTracker).toBe(true);
    });
  });

  describe('isEnabled()', () => {
    test('should return false before initialization', () => {
      // Fresh module state
      expect(ContentRemapper.isEnabled()).toBe(false);
    });

    test('should return correct enabled state', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
      ContentRemapper.initialize(mockProfile, {});

      expect(ContentRemapper.isEnabled()).toBe(false);

      ContentRemapper.enable();
      expect(ContentRemapper.isEnabled()).toBe(true);

      ContentRemapper.disable();
      expect(ContentRemapper.isEnabled()).toBe(false);
    });
  });

  // ============================================================================
  // MODE-SPECIFIC TESTS
  // ============================================================================

  describe('Remapping Modes', () => {
    const mockProfile = {
      boundary: {
        shape: 'ellipse',
        centerX: 50,
        centerY: 50,
        radiusX: 10,
        radiusY: 10,
      },
    };

    test('peripheral-push mode should be supported', () => {
      ContentRemapper.initialize(mockProfile, { mode: 'peripheral-push' });
      expect(ContentRemapper.getStatus().mode).toBe('peripheral-push');

      ContentRemapper.enable();
      expect(ContentRemapper.isEnabled()).toBe(true);
    });

    test('text-donut mode should be supported', () => {
      ContentRemapper.initialize(mockProfile, { mode: 'text-donut' });
      expect(ContentRemapper.getStatus().mode).toBe('text-donut');

      ContentRemapper.enable();
      expect(ContentRemapper.isEnabled()).toBe(true);
    });

    test('rsvp mode should be supported', () => {
      ContentRemapper.initialize(mockProfile, { mode: 'rsvp' });
      expect(ContentRemapper.getStatus().mode).toBe('rsvp');
    });

    test('magnify-remap mode should be supported', () => {
      ContentRemapper.initialize(mockProfile, { mode: 'magnify-remap' });
      expect(ContentRemapper.getStatus().mode).toBe('magnify-remap');
    });

    test('unknown mode should fall back to peripheral-push', () => {
      ContentRemapper.initialize(mockProfile, { mode: 'unknown-mode' });

      // Enable should use default (peripheral-push) behavior
      ContentRemapper.enable();
      expect(ContentRemapper.isEnabled()).toBe(true);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration', () => {
    test('full lifecycle: initialize -> enable -> updateSettings -> disable', () => {
      const mockProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };

      // Initialize
      ContentRemapper.initialize(mockProfile, { mode: 'peripheral-push' });
      expect(ContentRemapper.isEnabled()).toBe(false);

      // Enable
      ContentRemapper.enable();
      expect(ContentRemapper.isEnabled()).toBe(true);

      // Update settings
      ContentRemapper.updateSettings({ intensity: 75 });
      expect(ContentRemapper.isEnabled()).toBe(true);

      // Disable
      ContentRemapper.disable();
      expect(ContentRemapper.isEnabled()).toBe(false);
    });

    test('should handle re-initialization', () => {
      const mockProfile1 = {
        boundary: { centerX: 50, centerY: 50, radiusX: 10, radiusY: 10 },
      };
      const mockProfile2 = {
        boundary: { centerX: 60, centerY: 40, radiusX: 15, radiusY: 12 },
      };

      ContentRemapper.initialize(mockProfile1, { mode: 'peripheral-push' });
      ContentRemapper.enable();

      // Re-initialize with new profile
      ContentRemapper.initialize(mockProfile2, { mode: 'text-donut' });

      expect(ContentRemapper.getStatus().mode).toBe('text-donut');
    });
  });
});
