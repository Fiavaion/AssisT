/**
 * Unit Tests for STT Neurodivergent Profiles (Phase 2.7 - S.7)
 *
 * Tests cover:
 * 1. Profile type constants
 * 2. Profile configurations for each neurodivergent type
 * 3. Profile manager functionality
 * 4. Profile switching and keyboard shortcuts
 * 5. Neurodivergent profile mapping
 * 6. Button style generation
 */

import {
  STTProfileType,
  STT_PROFILES,
  STTProfileManager,
  getButtonStyles,
  getStateColor,
  mapNeurodivergentProfile,
} from '../../../src/engines/stt/stt-profiles.js';

// Mock chrome.storage for testing
const mockStorage = {
  local: {
    get: jest.fn().mockImplementation(keys => {
      return Promise.resolve({});
    }),
    set: jest.fn().mockResolvedValue(undefined),
  },
};

// Mock localStorage for non-extension context
const mockLocalStorage = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
};

global.chrome = { storage: mockStorage };
global.localStorage = mockLocalStorage;

// Mock document for DOM operations
global.document = {
  addEventListener: jest.fn(),
  getElementById: jest.fn().mockReturnValue(null),
  createElement: jest.fn().mockReturnValue({
    setAttribute: jest.fn(),
    style: {},
    remove: jest.fn(),
  }),
  body: {
    appendChild: jest.fn(),
  },
  querySelectorAll: jest.fn().mockReturnValue([]),
};

describe('STT Profiles - S.7 Neurodivergent STT Profiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // PROFILE TYPE CONSTANTS
  // ============================================================

  describe('STTProfileType Constants', () => {
    test('should have all required profile types', () => {
      expect(STTProfileType.DEFAULT).toBe('default');
      expect(STTProfileType.ADHD).toBe('adhd');
      expect(STTProfileType.DYSLEXIA).toBe('dyslexia');
      expect(STTProfileType.ANXIETY).toBe('anxiety');
      expect(STTProfileType.MOTOR_IMPAIRMENT).toBe('motor-impairment');
      expect(STTProfileType.LOW_VISION).toBe('low-vision');
      expect(STTProfileType.AUTISM).toBe('autism');
    });

    test('should have 7 profile types total', () => {
      const types = Object.values(STTProfileType);
      expect(types).toHaveLength(7);
    });
  });

  // ============================================================
  // PROFILE CONFIGURATIONS
  // ============================================================

  describe('STT_PROFILES Configurations', () => {
    test('should have all profile types defined', () => {
      expect(STT_PROFILES[STTProfileType.DEFAULT]).toBeDefined();
      expect(STT_PROFILES[STTProfileType.ADHD]).toBeDefined();
      expect(STT_PROFILES[STTProfileType.DYSLEXIA]).toBeDefined();
      expect(STT_PROFILES[STTProfileType.ANXIETY]).toBeDefined();
      expect(STT_PROFILES[STTProfileType.MOTOR_IMPAIRMENT]).toBeDefined();
      expect(STT_PROFILES[STTProfileType.LOW_VISION]).toBeDefined();
      expect(STT_PROFILES[STTProfileType.AUTISM]).toBeDefined();
    });

    test('each profile should have required properties', () => {
      Object.values(STT_PROFILES).forEach(profile => {
        expect(profile.name).toBeDefined();
        expect(profile.type).toBeDefined();
        expect(profile.description).toBeDefined();
        expect(profile.recognition).toBeDefined();
        expect(profile.ui).toBeDefined();
        expect(profile.feedback).toBeDefined();
        expect(profile.commands).toBeDefined();
        expect(profile.processing).toBeDefined();
        expect(profile.accessibility).toBeDefined();
      });
    });
  });

  // ============================================================
  // S.7.1: ADHD PROFILE
  // ============================================================

  describe('S.7.1: ADHD Profile', () => {
    const adhd = STT_PROFILES[STTProfileType.ADHD];

    test('should have faster response settings', () => {
      expect(adhd.recognition.silenceTimeout).toBeLessThan(1500); // Faster than default
    });

    test('should have minimal distractions', () => {
      expect(adhd.ui.animations).toBe(false);
      expect(adhd.ui.pulseEffect).toBe(false);
      expect(adhd.feedback.audio.enabled).toBe(false);
    });

    test('should have large visual feedback', () => {
      expect(adhd.ui.buttonSize).toBe('large');
      expect(adhd.ui.buttonSizePx).toBeGreaterThanOrEqual(64);
    });

    test('should have high contrast', () => {
      expect(adhd.ui.contrast).toBe('high');
    });

    test('should use simple command mode', () => {
      expect(adhd.commands.mode).toBe('simple');
    });
  });

  // ============================================================
  // S.7.2: DYSLEXIA PROFILE
  // ============================================================

  describe('S.7.2: Dyslexia Profile', () => {
    const dyslexia = STT_PROFILES[STTProfileType.DYSLEXIA];

    test('should have extra pause time', () => {
      expect(dyslexia.recognition.silenceTimeout).toBeGreaterThanOrEqual(3000);
    });

    test('should have more phonetic alternatives', () => {
      expect(dyslexia.recognition.maxAlternatives).toBeGreaterThan(1);
    });

    test('should use simple commands', () => {
      expect(dyslexia.commands.mode).toBe('simple');
    });

    test('should have spelling correction enabled', () => {
      expect(dyslexia.processing.spellingCorrection).toBe(true);
    });

    test('should have warm, comfortable colors', () => {
      expect(dyslexia.ui.colors.background).toBeDefined();
    });

    test('should confirm destructive commands', () => {
      expect(dyslexia.commands.confirmDestructive).toBe(true);
    });
  });

  // ============================================================
  // S.7.3: ANXIETY PROFILE
  // ============================================================

  describe('S.7.3: Anxiety Profile', () => {
    const anxiety = STT_PROFILES[STTProfileType.ANXIETY];

    test('should have calm colors', () => {
      // Soft green tones
      expect(anxiety.ui.colors.idle).toContain('8');
    });

    test('should have forgiving timing', () => {
      expect(anxiety.recognition.silenceTimeout).toBeGreaterThanOrEqual(4000);
    });

    test('should have extended speech timeout', () => {
      expect(anxiety.recognition.speechTimeout).toBeGreaterThanOrEqual(30000);
    });

    test('should have gentle audio feedback', () => {
      expect(anxiety.feedback.audio.enabled).toBe(true);
      expect(anxiety.feedback.audio.volume).toBeLessThan(0.5);
      expect(anxiety.feedback.audio.errorSound).toBe(false);
    });

    test('should not flash on recognition', () => {
      expect(anxiety.feedback.visual.flashOnRecognition).toBe(false);
    });

    test('should have smooth animations', () => {
      expect(anxiety.ui.animations).toBe(true);
    });
  });

  // ============================================================
  // S.7.4: MOTOR IMPAIRMENT PROFILE
  // ============================================================

  describe('S.7.4: Motor Impairment Profile', () => {
    const motor = STT_PROFILES[STTProfileType.MOTOR_IMPAIRMENT];

    test('should have extra-large button', () => {
      expect(motor.ui.buttonSize).toBe('xlarge');
      expect(motor.ui.buttonSizePx).toBeGreaterThanOrEqual(80);
    });

    test('should have longer timing', () => {
      expect(motor.recognition.silenceTimeout).toBeGreaterThanOrEqual(5000);
    });

    test('should have continuous mode', () => {
      expect(motor.recognition.continuous).toBe(true);
    });

    test('should have voice activation settings', () => {
      expect(motor.motor).toBeDefined();
      expect(motor.motor.voiceActivation).toBe(true);
    });

    test('should have hold-to-activate', () => {
      expect(motor.motor.holdToActivate).toBe(true);
      expect(motor.motor.holdDuration).toBeGreaterThan(0);
    });

    test('should have haptic feedback enabled', () => {
      expect(motor.feedback.haptic.enabled).toBe(true);
    });

    test('should have command prefix to prevent accidents', () => {
      expect(motor.commands.commandPrefix).toBeDefined();
    });
  });

  // ============================================================
  // S.7.5: LOW VISION PROFILE
  // ============================================================

  describe('S.7.5: Low Vision Profile', () => {
    const lowVision = STT_PROFILES[STTProfileType.LOW_VISION];

    test('should have extra-large mic button', () => {
      expect(lowVision.ui.buttonSize).toBe('xlarge');
      expect(lowVision.ui.buttonSizePx).toBeGreaterThanOrEqual(96);
    });

    test('should have large icon', () => {
      expect(lowVision.ui.iconSize).toBeGreaterThanOrEqual(48);
    });

    test('should have very high contrast', () => {
      expect(lowVision.ui.contrast).toBe('very-high');
    });

    test('should have comprehensive audio feedback', () => {
      expect(lowVision.feedback.audio.enabled).toBe(true);
      expect(lowVision.feedback.audio.volume).toBeGreaterThanOrEqual(0.7);
      expect(lowVision.feedback.audio.speakTranscript).toBe(true);
    });

    test('should have screen reader announcements', () => {
      expect(lowVision.accessibility.announceState).toBe(true);
    });

    test('should have high contrast colors', () => {
      // Black and white for maximum contrast
      expect(lowVision.ui.colors.idle).toBe('#000000');
      expect(lowVision.ui.colors.background).toBe('#FFFFFF');
    });
  });

  // ============================================================
  // S.7.6: AUTISM PROFILE
  // ============================================================

  describe('S.7.6: Autism Profile', () => {
    const autism = STT_PROFILES[STTProfileType.AUTISM];

    test('should have predictable behavior - no interim results', () => {
      expect(autism.recognition.interimResults).toBe(false);
    });

    test('should have no animations', () => {
      expect(autism.ui.animations).toBe(false);
      expect(autism.ui.pulseEffect).toBe(false);
    });

    test('should have literal command mode', () => {
      expect(autism.commands.mode).toBe('literal');
    });

    test('should have command prefix for clarity', () => {
      expect(autism.commands.commandPrefix).toBeDefined();
    });

    test('should always confirm destructive actions', () => {
      expect(autism.commands.confirmDestructive).toBe(true);
    });

    test('should have no auto-processing changes', () => {
      expect(autism.processing.autoPunctuation).toBe(false);
      expect(autism.processing.spellingCorrection).toBe(false);
    });

    test('should have autism-specific settings', () => {
      expect(autism.autism).toBeDefined();
      expect(autism.autism.explicitModeIndicator).toBe(true);
      expect(autism.autism.noSuggestions).toBe(true);
    });
  });

  // ============================================================
  // PROFILE MANAGER
  // ============================================================

  describe('STTProfileManager', () => {
    let manager;

    beforeEach(() => {
      manager = new STTProfileManager({
        onProfileChange: jest.fn(),
      });
    });

    test('should initialize with default profile', async () => {
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(manager.getProfileType()).toBe(STTProfileType.DEFAULT);
    });

    test('should set profile correctly', () => {
      const result = manager.setProfile(STTProfileType.ADHD);
      expect(result).toBe(true);
      expect(manager.getProfileType()).toBe(STTProfileType.ADHD);
    });

    test('should return false for unknown profile', () => {
      const result = manager.setProfile('unknown-profile');
      expect(result).toBe(false);
    });

    test('should get current profile', () => {
      manager.setProfile(STTProfileType.DYSLEXIA);
      const profile = manager.getProfile();
      expect(profile.name).toBe('Dyslexia Support');
    });

    test('should get all available profiles', () => {
      const profiles = manager.getAllProfiles();
      expect(Object.keys(profiles)).toHaveLength(7);
    });

    test('should get profile list for UI', () => {
      manager.setProfile(STTProfileType.ANXIETY);
      const list = manager.getProfileList();

      expect(list).toHaveLength(7);
      expect(list.find(p => p.type === STTProfileType.ANXIETY).isActive).toBe(true);
    });

    test('should cycle through profiles', () => {
      const types = Object.keys(STT_PROFILES);
      const initialType = manager.getProfileType();
      const initialIndex = types.indexOf(initialType);

      manager.cycleProfile();

      const newIndex = types.indexOf(manager.getProfileType());
      const expectedIndex = (initialIndex + 1) % types.length;
      expect(newIndex).toBe(expectedIndex);
    });

    test('should apply customizations', () => {
      manager.setProfile(STTProfileType.DEFAULT, {
        ui: { buttonSizePx: 100 },
      });

      const profile = manager.getProfile();
      expect(profile.ui.buttonSizePx).toBe(100);
    });

    test('should reset profile to defaults', () => {
      manager.setProfile(STTProfileType.DEFAULT, {
        ui: { buttonSizePx: 100 },
      });
      manager.resetProfile();

      const profile = manager.getProfile();
      expect(profile.ui.buttonSizePx).toBe(48); // Default value
    });
  });

  // ============================================================
  // S.7.7: KEYBOARD SHORTCUT
  // ============================================================

  describe('S.7.7: Profile Quick-Switch Keyboard Shortcut', () => {
    test('should setup keyboard shortcut listener', () => {
      // Use a proper spy for this test
      const addEventListenerSpy = jest.fn();
      const originalAddEventListener = document.addEventListener;
      document.addEventListener = addEventListenerSpy;

      const manager = new STTProfileManager({
        onProfileChange: jest.fn(),
      });

      manager.setupKeyboardShortcut();

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      // Restore original
      document.addEventListener = originalAddEventListener;
    });

    test('should check shortcut correctly', () => {
      const manager = new STTProfileManager({
        shortcutKey: 'P',
        shortcutModifiers: ['ctrl', 'shift'],
      });

      const matchingEvent = {
        key: 'P',
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
      };

      const nonMatchingEvent = {
        key: 'P',
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      };

      expect(manager.checkShortcut(matchingEvent)).toBe(true);
      expect(manager.checkShortcut(nonMatchingEvent)).toBe(false);
    });
  });

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  describe('Utility Functions', () => {
    describe('getButtonStyles', () => {
      test('should return button styles for profile', () => {
        const profile = STT_PROFILES[STTProfileType.LOW_VISION];
        const styles = getButtonStyles(profile);

        expect(styles.width).toBe('96px');
        expect(styles.height).toBe('96px');
        expect(styles.borderRadius).toBe('50%');
      });

      test('should handle high contrast profiles', () => {
        const profile = STT_PROFILES[STTProfileType.LOW_VISION];
        const styles = getButtonStyles(profile);

        expect(styles.border).toContain('3px solid');
      });
    });

    describe('getStateColor', () => {
      test('should return correct state color', () => {
        const profile = STT_PROFILES[STTProfileType.ANXIETY];

        const idleColor = getStateColor(profile, 'idle');
        const listeningColor = getStateColor(profile, 'listening');

        expect(idleColor).toBe(profile.ui.colors.idle);
        expect(listeningColor).toBe(profile.ui.colors.listening);
      });
    });

    describe('mapNeurodivergentProfile', () => {
      test('should map ADHD Focus to ADHD profile', () => {
        expect(mapNeurodivergentProfile('ADHD Focus')).toBe(STTProfileType.ADHD);
      });

      test('should map Autism Comfort to AUTISM profile', () => {
        expect(mapNeurodivergentProfile('Autism Comfort')).toBe(STTProfileType.AUTISM);
      });

      test('should map Dyslexia Support to DYSLEXIA profile', () => {
        expect(mapNeurodivergentProfile('Dyslexia Support')).toBe(STTProfileType.DYSLEXIA);
      });

      test('should map Anxiety Calm to ANXIETY profile', () => {
        expect(mapNeurodivergentProfile('Anxiety Calm')).toBe(STTProfileType.ANXIETY);
      });

      test('should map Low Vision to LOW_VISION profile', () => {
        expect(mapNeurodivergentProfile('Low Vision')).toBe(STTProfileType.LOW_VISION);
      });

      test('should map unknown profiles to DEFAULT', () => {
        expect(mapNeurodivergentProfile('Unknown Profile')).toBe(STTProfileType.DEFAULT);
      });

      test('should map Default to DEFAULT profile', () => {
        expect(mapNeurodivergentProfile('Default')).toBe(STTProfileType.DEFAULT);
      });
    });
  });

  // ============================================================
  // IMPORT/EXPORT
  // ============================================================

  describe('Profile Import/Export', () => {
    let manager;

    beforeEach(() => {
      manager = new STTProfileManager({
        onProfileChange: jest.fn(),
      });
    });

    test('should export profile to JSON', () => {
      const json = manager.exportProfile(STTProfileType.ADHD);
      const data = JSON.parse(json);

      expect(data.version).toBe('1.0');
      expect(data.type).toBe(STTProfileType.ADHD);
      expect(data.profile).toBeDefined();
      expect(data.exportedAt).toBeDefined();
    });

    test('should return null for unknown profile export', () => {
      const json = manager.exportProfile('unknown');
      expect(json).toBeNull();
    });

    test('should import profile from JSON', () => {
      const profileData = {
        version: '1.0',
        type: 'custom-profile',
        profile: {
          name: 'Custom Test Profile',
          type: 'custom-profile',
          description: 'A custom test profile',
          recognition: {},
          ui: {},
          feedback: {},
          commands: {},
          processing: {},
          accessibility: {},
        },
      };

      const result = manager.importProfile(JSON.stringify(profileData));
      expect(result).toBe(true);
    });

    test('should reject invalid JSON on import', () => {
      const result = manager.importProfile('invalid json');
      expect(result).toBe(false);
    });
  });
});
