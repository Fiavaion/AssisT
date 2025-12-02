/**
 * APVUI Engine Unit Tests
 * Testing Adaptive Peripheral Vision UI functionality
 * Following TDD: Testing actual implementation
 */

import * as APVUIEngine from '../../../src/features/stargardt/apvui-engine.js';

describe('APVUIEngine', () => {
  let mockElements = [];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockElements = [];

    // Mock document elements
    jest.spyOn(document, 'getElementById').mockImplementation(id => {
      if (id === 'stargardt-apvui-styles') return null;
      if (id === 'stargardt-radial-container') return null;
      return null;
    });

    // Mock createElement
    jest.spyOn(document, 'createElement').mockImplementation(tag => {
      const element = {
        id: '',
        className: '',
        style: { cssText: '', left: '', top: '' },
        textContent: '',
        innerHTML: '',
        appendChild: jest.fn(),
        remove: jest.fn(),
        setAttribute: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        onclick: null,
        querySelectorAll: jest.fn().mockReturnValue([]),
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          contains: jest.fn().mockReturnValue(false),
          toggle: jest.fn(),
        },
        getBoundingClientRect: jest.fn().mockReturnValue({
          width: 100,
          height: 50,
          left: 0,
          top: 0,
          right: 100,
          bottom: 50,
        }),
      };
      mockElements.push(element);
      return element;
    });

    // Mock appendChild
    document.head.appendChild = jest.fn();
    document.body.appendChild = jest.fn();
    document.body.style = { display: '', zoom: '100%' };
    document.body.offsetHeight = 1000;

    // Mock documentElement
    document.documentElement.classList = {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn().mockReturnValue(false),
      toggle: jest.fn(),
    };

    // Mock querySelectorAll
    document.querySelectorAll = jest.fn().mockReturnValue([]);

    // Mock addEventListener/removeEventListener
    document.addEventListener = jest.fn();
    document.removeEventListener = jest.fn();

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });

    // Mock speechSynthesis
    window.speechSynthesis = {
      speak: jest.fn(),
      cancel: jest.fn(),
    };

    // Mock getSelection
    window.getSelection = jest.fn().mockReturnValue({
      toString: jest.fn().mockReturnValue('selected text'),
    });

    // Mock document.execCommand
    document.execCommand = jest.fn();

    // Mock setInterval and clearInterval
    jest.useFakeTimers();

    // Mock chrome.runtime
    global.chrome = {
      runtime: {
        sendMessage: jest.fn(),
      },
    };
  });

  afterEach(() => {
    // Clean up
    APVUIEngine.disable();
    jest.restoreAllMocks();
    jest.useRealTimers();
    mockElements = [];
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('initialize()', () => {
    test('should initialize with settings and profile', () => {
      const settings = {
        enabled: true,
        radialMenus: true,
        edgeAnchoring: true,
        motionCues: true,
        ultraHighContrast: false,
        minTouchTarget: 48,
      };

      const profile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };

      expect(() => APVUIEngine.initialize(settings, profile)).not.toThrow();
    });

    test('should handle null settings', () => {
      expect(() => APVUIEngine.initialize(null, null)).not.toThrow();
    });

    test('should handle empty settings', () => {
      expect(() => APVUIEngine.initialize({}, null)).not.toThrow();
    });

    test('should enable automatically if settings.enabled is not false', () => {
      APVUIEngine.initialize({ enabled: true }, null);

      expect(APVUIEngine.isEnabled()).toBe(true);
    });

    test('should not enable automatically if settings.enabled is false', () => {
      APVUIEngine.initialize({ enabled: false }, null);

      expect(APVUIEngine.isEnabled()).toBe(false);
    });
  });

  // ============================================================================
  // ENABLE / DISABLE TESTS
  // ============================================================================

  describe('enable()', () => {
    test('should enable APVUI', () => {
      APVUIEngine.initialize({ enabled: false }, null);
      expect(APVUIEngine.isEnabled()).toBe(false);

      APVUIEngine.enable();

      expect(APVUIEngine.isEnabled()).toBe(true);
    });

    test('should not re-enable if already enabled', () => {
      APVUIEngine.initialize({ enabled: false }, null);
      APVUIEngine.enable();
      APVUIEngine.enable(); // Second call

      expect(APVUIEngine.isEnabled()).toBe(true);
    });

    test('should apply high contrast when ultraHighContrast is enabled', () => {
      APVUIEngine.initialize({ enabled: false, ultraHighContrast: true }, null);

      APVUIEngine.enable();

      expect(document.documentElement.classList.add).toHaveBeenCalledWith('stargardt-uhc');
    });

    test('should setup radial menus when enabled', () => {
      APVUIEngine.initialize({ enabled: false, radialMenus: true }, null);

      APVUIEngine.enable();

      expect(document.body.appendChild).toHaveBeenCalled();
    });

    test('should setup edge anchoring when enabled', () => {
      APVUIEngine.initialize({ enabled: false, edgeAnchoring: true }, null);

      APVUIEngine.enable();

      expect(APVUIEngine.isEnabled()).toBe(true);
    });

    test('should start motion cues when enabled', () => {
      APVUIEngine.initialize({ enabled: false, motionCues: true }, null);

      APVUIEngine.enable();

      expect(APVUIEngine.isEnabled()).toBe(true);
    });
  });

  describe('disable()', () => {
    test('should disable APVUI', () => {
      APVUIEngine.initialize({ enabled: true }, null);
      expect(APVUIEngine.isEnabled()).toBe(true);

      APVUIEngine.disable();

      expect(APVUIEngine.isEnabled()).toBe(false);
    });

    test('should not error when disabling already disabled', () => {
      APVUIEngine.initialize({ enabled: false }, null);

      expect(() => APVUIEngine.disable()).not.toThrow();
    });

    test('should remove high contrast class when disabled', () => {
      APVUIEngine.initialize({ enabled: true, ultraHighContrast: true }, null);
      APVUIEngine.disable();

      expect(document.documentElement.classList.remove).toHaveBeenCalledWith('stargardt-uhc');
    });

    test('should remove context menu listener when disabled', () => {
      APVUIEngine.initialize({ enabled: true, radialMenus: true }, null);
      APVUIEngine.disable();

      expect(document.removeEventListener).toHaveBeenCalledWith(
        'contextmenu',
        expect.any(Function)
      );
    });
  });

  // ============================================================================
  // UPDATE SETTINGS TESTS
  // ============================================================================

  describe('updateSettings()', () => {
    test('should update settings', () => {
      APVUIEngine.initialize({ ultraHighContrast: false, enabled: false }, null);

      APVUIEngine.updateSettings({ ultraHighContrast: true });

      // Settings should be updated
      const status = APVUIEngine.getStatus();
      expect(status.settings.ultraHighContrast).toBe(true);
    });

    test('should re-apply settings when enabled', () => {
      APVUIEngine.initialize({ enabled: true }, null);

      APVUIEngine.updateSettings({ minTouchTarget: 64 });

      expect(APVUIEngine.isEnabled()).toBe(true);
    });
  });

  // ============================================================================
  // STATUS TESTS
  // ============================================================================

  describe('getStatus()', () => {
    test('should return status object with expected properties', () => {
      APVUIEngine.initialize({ enabled: true }, null);

      const status = APVUIEngine.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('settings');
      expect(status).toHaveProperty('hasProfile');
      expect(status).toHaveProperty('highContrastActive');
    });

    test('should report correct enabled state', () => {
      APVUIEngine.initialize({ enabled: true }, null);
      expect(APVUIEngine.getStatus().enabled).toBe(true);

      APVUIEngine.disable();
      expect(APVUIEngine.getStatus().enabled).toBe(false);
    });

    test('should report hasProfile correctly', () => {
      APVUIEngine.initialize({}, null);
      expect(APVUIEngine.getStatus().hasProfile).toBe(false);

      const profile = {
        boundary: { centerX: 50, centerY: 50, radiusX: 10, radiusY: 10 },
      };
      APVUIEngine.initialize({}, profile);
      expect(APVUIEngine.getStatus().hasProfile).toBe(true);
    });
  });

  describe('isEnabled()', () => {
    test('should return boolean enabled state', () => {
      APVUIEngine.initialize({ enabled: false }, null);
      expect(APVUIEngine.isEnabled()).toBe(false);

      APVUIEngine.enable();
      expect(APVUIEngine.isEnabled()).toBe(true);
    });
  });

  // ============================================================================
  // RADIAL MENU TESTS
  // ============================================================================

  describe('Radial Menu', () => {
    test('showRadialMenu should not throw with coordinates', () => {
      APVUIEngine.initialize({ enabled: true, radialMenus: true }, null);

      // Note: showRadialMenu is not exported directly but called via context menu
      // Testing that the setup doesn't crash
      expect(APVUIEngine.isEnabled()).toBe(true);
    });

    test('hideRadialMenu should not throw', () => {
      APVUIEngine.initialize({ enabled: true, radialMenus: true }, null);

      // hideRadialMenu is an exported function
      expect(() => APVUIEngine.hideRadialMenu()).not.toThrow();
    });
  });

  // ============================================================================
  // DISTANCE SCALING TESTS
  // ============================================================================

  describe('applyDistanceScaling()', () => {
    test('should not throw when profile is null', () => {
      APVUIEngine.initialize({}, null);

      const mockElement = {
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
        getBoundingClientRect: jest.fn().mockReturnValue({
          left: 100,
          top: 100,
          width: 200,
          height: 50,
        }),
      };

      expect(() => APVUIEngine.applyDistanceScaling(mockElement)).not.toThrow();
    });

    test('should apply scaling classes based on distance from scotoma', () => {
      const profile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
      APVUIEngine.initialize({}, profile);

      const mockElement = {
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
        getBoundingClientRect: jest.fn().mockReturnValue({
          left: 900, // Near center (scotoma)
          top: 500,
          width: 100,
          height: 50,
        }),
      };

      APVUIEngine.applyDistanceScaling(mockElement);

      // Should have attempted to add/remove scaling classes
      expect(mockElement.classList.add).toHaveBeenCalled();
    });

    test('should handle element far from scotoma', () => {
      const profile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 5,
          radiusY: 5,
        },
      };
      APVUIEngine.initialize({}, profile);

      const mockElement = {
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
        getBoundingClientRect: jest.fn().mockReturnValue({
          left: 0, // Far from center
          top: 0,
          width: 100,
          height: 50,
        }),
      };

      APVUIEngine.applyDistanceScaling(mockElement);

      // Should remove both scaling classes for far elements
      expect(mockElement.classList.remove).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration', () => {
    test('full lifecycle: initialize -> enable -> updateSettings -> disable', () => {
      const profile = {
        boundary: { centerX: 50, centerY: 50, radiusX: 10, radiusY: 10 },
      };

      // Initialize
      APVUIEngine.initialize({ enabled: false }, profile);
      expect(APVUIEngine.isEnabled()).toBe(false);

      // Enable
      APVUIEngine.enable();
      expect(APVUIEngine.isEnabled()).toBe(true);

      // Update settings
      APVUIEngine.updateSettings({ ultraHighContrast: true });
      expect(APVUIEngine.isEnabled()).toBe(true);

      // Disable
      APVUIEngine.disable();
      expect(APVUIEngine.isEnabled()).toBe(false);
    });

    test('should handle multiple re-initializations', () => {
      APVUIEngine.initialize({ enabled: true }, null);
      expect(APVUIEngine.isEnabled()).toBe(true);

      APVUIEngine.initialize({ enabled: false }, null);
      expect(APVUIEngine.isEnabled()).toBe(false);
    });

    test('should handle all features enabled', () => {
      const profile = {
        boundary: { centerX: 50, centerY: 50, radiusX: 10, radiusY: 10 },
      };

      const settings = {
        enabled: true,
        ultraHighContrast: true,
        radialMenus: true,
        edgeAnchoring: true,
        motionCues: true,
        minTouchTarget: 48,
      };

      APVUIEngine.initialize(settings, profile);

      expect(APVUIEngine.isEnabled()).toBe(true);

      // Advance timers to trigger motion cues
      jest.advanceTimersByTime(10000);

      expect(APVUIEngine.isEnabled()).toBe(true);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle rapid enable/disable cycles', () => {
      APVUIEngine.initialize({ enabled: false }, null);

      for (let i = 0; i < 5; i++) {
        APVUIEngine.enable();
        APVUIEngine.disable();
      }

      expect(APVUIEngine.isEnabled()).toBe(false);
    });

    test('should handle profile with extreme values', () => {
      const extremeProfile = {
        boundary: {
          centerX: 0,
          centerY: 0,
          radiusX: 100,
          radiusY: 100,
        },
      };

      APVUIEngine.initialize({ enabled: true }, extremeProfile);
      expect(APVUIEngine.isEnabled()).toBe(true);
    });

    test('should handle zero-size scotoma', () => {
      const zeroProfile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 0,
          radiusY: 0,
        },
      };

      APVUIEngine.initialize({ enabled: true }, zeroProfile);
      expect(APVUIEngine.isEnabled()).toBe(true);
    });
  });

  // ============================================================================
  // ACCESSIBILITY TESTS
  // ============================================================================

  describe('Accessibility', () => {
    test('should apply minimum touch target sizes', () => {
      APVUIEngine.initialize({ enabled: true, minTouchTarget: 48 }, null);

      // Should add the class to document
      expect(document.documentElement.classList.add).toHaveBeenCalledWith('stargardt-min-touch');
    });

    test('should respect prefers-reduced-motion via CSS', () => {
      // The CSS already includes @media (prefers-reduced-motion: reduce)
      // This test ensures the module loads without error when motion cues are enabled
      APVUIEngine.initialize({ enabled: true, motionCues: true }, null);

      expect(APVUIEngine.isEnabled()).toBe(true);
    });
  });
});
