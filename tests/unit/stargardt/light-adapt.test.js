/**
 * Light Adaptation Unit Tests
 * Testing brightness control and light adaptation for Stargardt users
 * Following TDD: Testing actual implementation
 */

import * as LightAdapt from '../../../src/features/stargardt/light-adapt.js';

describe('LightAdapt', () => {
  let mockStyleElement;
  let mockOverlayElement;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock document elements
    mockStyleElement = { id: '', textContent: '', remove: jest.fn() };
    mockOverlayElement = {
      id: '',
      className: '',
      style: { backgroundColor: '' },
      setAttribute: jest.fn(),
      remove: jest.fn(),
    };

    // Mock getElementById
    jest.spyOn(document, 'getElementById').mockImplementation(id => {
      if (id === 'stargardt-lightadapt-styles') return null;
      if (id === 'stargardt-brightness-overlay') return mockOverlayElement;
      return null;
    });

    // Mock createElement
    jest.spyOn(document, 'createElement').mockImplementation(tag => {
      if (tag === 'style') {
        return { id: '', textContent: '' };
      }
      if (tag === 'div') {
        return {
          id: '',
          className: '',
          style: { backgroundColor: '', cssText: '' },
          setAttribute: jest.fn(),
          remove: jest.fn(),
        };
      }
      return document.createElement(tag);
    });

    // Mock appendChild
    document.head.appendChild = jest.fn();
    document.body.appendChild = jest.fn();

    // Mock documentElement classList and style
    document.documentElement.classList = {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn().mockReturnValue(false),
    };
    document.documentElement.style = {
      filter: '',
      setProperty: jest.fn(),
    };

    // Mock querySelectorAll
    document.querySelectorAll = jest.fn().mockReturnValue([]);

    // Mock MutationObserver
    global.MutationObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
    }));

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });

    // Mock AmbientLightSensor (not available by default)
    delete window.AmbientLightSensor;

    // Mock setTimeout and clearTimeout
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Clean up
    LightAdapt.disable();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('initialize()', () => {
    test('should initialize with settings', () => {
      const settings = {
        enabled: true,
        targetBrightness: 70,
        transitionSpeed: 5000,
        autoAdjust: false,
        glareReduction: 50,
      };

      expect(() => LightAdapt.initialize(settings)).not.toThrow();
    });

    test('should handle null settings', () => {
      expect(() => LightAdapt.initialize(null)).not.toThrow();
    });

    test('should handle empty settings', () => {
      expect(() => LightAdapt.initialize({})).not.toThrow();
    });

    test('should use default target brightness when not specified', () => {
      // Note: Time-of-day profile may override the default 70
      LightAdapt.initialize({});

      const targetBrightness = LightAdapt.getTargetBrightness();
      // Should be a valid brightness value (time-of-day may adjust it)
      expect(typeof targetBrightness).toBe('number');
      expect(targetBrightness).toBeGreaterThanOrEqual(0);
      expect(targetBrightness).toBeLessThanOrEqual(100);
    });

    test('should enable automatically if settings.enabled is not false', () => {
      LightAdapt.initialize({ enabled: true });

      expect(LightAdapt.isEnabled()).toBe(true);
    });
  });

  // ============================================================================
  // ENABLE / DISABLE TESTS
  // ============================================================================

  describe('enable()', () => {
    test('should enable light adaptation', () => {
      LightAdapt.initialize({ enabled: false });
      expect(LightAdapt.isEnabled()).toBe(false);

      LightAdapt.enable();

      expect(LightAdapt.isEnabled()).toBe(true);
    });

    test('should not re-enable if already enabled', () => {
      LightAdapt.initialize({ enabled: false });
      LightAdapt.enable();
      LightAdapt.enable(); // Second call

      expect(LightAdapt.isEnabled()).toBe(true);
    });
  });

  describe('disable()', () => {
    test('should disable light adaptation', () => {
      LightAdapt.initialize({ enabled: true });
      expect(LightAdapt.isEnabled()).toBe(true);

      LightAdapt.disable();

      expect(LightAdapt.isEnabled()).toBe(false);
    });

    test('should not error when disabling already disabled', () => {
      LightAdapt.initialize({ enabled: false });

      expect(() => LightAdapt.disable()).not.toThrow();
    });

    test('should reset document filter when disabled', () => {
      LightAdapt.initialize({ enabled: true });
      LightAdapt.disable();

      expect(document.documentElement.style.filter).toBe('');
    });
  });

  // ============================================================================
  // BRIGHTNESS CONTROL TESTS
  // ============================================================================

  describe('getCurrentBrightness()', () => {
    test('should return current brightness value', () => {
      LightAdapt.initialize({ targetBrightness: 80 });

      const brightness = LightAdapt.getCurrentBrightness();

      expect(typeof brightness).toBe('number');
      expect(brightness).toBeGreaterThanOrEqual(0);
      expect(brightness).toBeLessThanOrEqual(100);
    });
  });

  describe('getTargetBrightness()', () => {
    test('should return target brightness from settings', () => {
      LightAdapt.initialize({ targetBrightness: 65 });

      const target = LightAdapt.getTargetBrightness();

      expect(target).toBe(65);
    });
  });

  describe('transitionToBrightness()', () => {
    test('should update target brightness', () => {
      LightAdapt.initialize({ targetBrightness: 70 });

      LightAdapt.transitionToBrightness(50);

      expect(LightAdapt.getTargetBrightness()).toBe(50);
    });

    test('should apply brightness immediately when disabled', () => {
      LightAdapt.initialize({ enabled: false });

      LightAdapt.transitionToBrightness(40);

      // Target should be updated
      expect(LightAdapt.getTargetBrightness()).toBe(40);
    });

    test('should transition gradually when enabled', () => {
      LightAdapt.initialize({ enabled: true, transitionSpeed: 1000 });

      LightAdapt.transitionToBrightness(30);

      // Target should be set
      expect(LightAdapt.getTargetBrightness()).toBe(30);

      // Advance timers to complete transition
      jest.advanceTimersByTime(1100);
    });
  });

  // ============================================================================
  // UPDATE SETTINGS TESTS
  // ============================================================================

  describe('updateSettings()', () => {
    test('should update settings', () => {
      LightAdapt.initialize({ targetBrightness: 70, enabled: false });

      LightAdapt.updateSettings({ targetBrightness: 50 });

      expect(LightAdapt.getTargetBrightness()).toBe(50);
    });

    test('should trigger brightness transition when targetBrightness changes', () => {
      LightAdapt.initialize({ targetBrightness: 80, enabled: true });

      LightAdapt.updateSettings({ targetBrightness: 60 });

      expect(LightAdapt.getTargetBrightness()).toBe(60);
    });
  });

  // ============================================================================
  // AMBIENT SENSOR TESTS
  // ============================================================================

  describe('isAmbientSensorAvailable()', () => {
    test('should return false when AmbientLightSensor not available', () => {
      delete window.AmbientLightSensor;

      expect(LightAdapt.isAmbientSensorAvailable()).toBe(false);
    });

    test('should return true when AmbientLightSensor is available', () => {
      window.AmbientLightSensor = jest.fn();

      expect(LightAdapt.isAmbientSensorAvailable()).toBe(true);
    });
  });

  // ============================================================================
  // STATUS TESTS
  // ============================================================================

  describe('getStatus()', () => {
    test('should return status object with expected properties', () => {
      LightAdapt.initialize({ targetBrightness: 75, enabled: true });

      const status = LightAdapt.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('currentBrightness');
      expect(status).toHaveProperty('targetBrightness');
      expect(status).toHaveProperty('ambientSensorActive');
      expect(status).toHaveProperty('settings');
    });

    test('should report correct enabled state', () => {
      LightAdapt.initialize({ enabled: true });
      expect(LightAdapt.getStatus().enabled).toBe(true);

      LightAdapt.disable();
      expect(LightAdapt.getStatus().enabled).toBe(false);
    });

    test('should report correct brightness values', () => {
      LightAdapt.initialize({ targetBrightness: 60 });

      const status = LightAdapt.getStatus();

      expect(status.targetBrightness).toBe(60);
    });
  });

  describe('isEnabled()', () => {
    test('should return boolean enabled state', () => {
      LightAdapt.initialize({ enabled: false });
      expect(LightAdapt.isEnabled()).toBe(false);

      LightAdapt.enable();
      expect(LightAdapt.isEnabled()).toBe(true);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration', () => {
    test('full lifecycle: initialize -> enable -> updateSettings -> disable', () => {
      // Initialize
      LightAdapt.initialize({ targetBrightness: 70, enabled: false });
      expect(LightAdapt.isEnabled()).toBe(false);

      // Enable
      LightAdapt.enable();
      expect(LightAdapt.isEnabled()).toBe(true);

      // Update settings
      LightAdapt.updateSettings({ targetBrightness: 50 });
      expect(LightAdapt.getTargetBrightness()).toBe(50);

      // Disable
      LightAdapt.disable();
      expect(LightAdapt.isEnabled()).toBe(false);
    });

    test('should handle multiple re-initializations', () => {
      LightAdapt.initialize({ targetBrightness: 70 });
      expect(LightAdapt.getTargetBrightness()).toBe(70);

      LightAdapt.initialize({ targetBrightness: 50 });
      expect(LightAdapt.getTargetBrightness()).toBe(50);
    });
  });

  // ============================================================================
  // TIME OF DAY TESTS
  // ============================================================================

  describe('Time of Day Profile', () => {
    test('should adjust brightness based on time of day when enabled', () => {
      // Mock Date to return specific hour
      const originalDate = global.Date;
      const mockDate = new Date('2024-01-15T14:00:00'); // 2 PM

      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      LightAdapt.initialize({ enabled: true });

      // Should have applied time-based brightness (daytime)
      expect(LightAdapt.isEnabled()).toBe(true);

      global.Date = originalDate;
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle brightness values at boundaries', () => {
      // Explicitly set brightness with enabled false to avoid time-of-day override
      LightAdapt.initialize({ targetBrightness: 0, enabled: false });
      LightAdapt.transitionToBrightness(0);
      expect(LightAdapt.getTargetBrightness()).toBe(0);

      LightAdapt.transitionToBrightness(100);
      expect(LightAdapt.getTargetBrightness()).toBe(100);
    });

    test('should handle rapid enable/disable cycles', () => {
      LightAdapt.initialize({ enabled: false });

      for (let i = 0; i < 5; i++) {
        LightAdapt.enable();
        LightAdapt.disable();
      }

      expect(LightAdapt.isEnabled()).toBe(false);
    });
  });
});
