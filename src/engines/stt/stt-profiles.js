/**
 * STT Neurodivergent Profiles (Phase 2.7 - S.7)
 * Specialized STT configurations for different neurodivergent needs
 *
 * Each profile optimizes:
 * - Recognition settings (timing, sensitivity)
 * - UI appearance (button size, colors, contrast)
 * - Feedback mechanisms (visual, audio, haptic)
 * - Command behavior (literal vs. contextual)
 *
 * @module STTProfiles
 * @version 1.0.0
 */

/**
 * STT Profile types
 * @enum {string}
 */
export const STTProfileType = {
  DEFAULT: 'default',
  ADHD: 'adhd',
  DYSLEXIA: 'dyslexia',
  ANXIETY: 'anxiety',
  MOTOR_IMPAIRMENT: 'motor-impairment',
  LOW_VISION: 'low-vision',
  AUTISM: 'autism',
};

/**
 * Default STT profile configuration
 * Base settings that all profiles extend from
 */
const DEFAULT_PROFILE = {
  name: 'Default',
  type: STTProfileType.DEFAULT,
  description: 'Standard STT settings for general use',

  // Recognition settings
  recognition: {
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    language: 'en-US',
    // Timing (milliseconds)
    silenceTimeout: 1500, // Time of silence before stopping
    speechTimeout: 10000, // Max continuous speech time
    startDelay: 0, // Delay before starting recognition
  },

  // UI appearance settings
  ui: {
    buttonSize: 'medium', // 'small' | 'medium' | 'large' | 'xlarge'
    buttonSizePx: 48, // Actual pixel size
    iconSize: 24, // Icon size in pixels
    colors: {
      idle: '#2196F3', // Blue
      listening: '#4CAF50', // Green
      processing: '#FF9800', // Orange
      error: '#F44336', // Red
      background: '#ffffff',
      text: '#333333',
    },
    contrast: 'normal', // 'normal' | 'high' | 'very-high'
    animations: true, // Enable/disable animations
    pulseEffect: true, // Pulse animation when listening
    showTranscript: true, // Show interim transcript
    transcriptPosition: 'above', // 'above' | 'below' | 'floating'
  },

  // Feedback settings
  feedback: {
    visual: {
      enabled: true,
      showWaveform: false, // Audio waveform visualization
      showConfidence: false, // Show recognition confidence
      flashOnRecognition: true, // Flash when text recognized
    },
    audio: {
      enabled: false,
      startSound: false,
      stopSound: false,
      errorSound: true,
      volume: 0.5,
    },
    haptic: {
      enabled: false, // Vibration feedback (mobile)
      onStart: false,
      onStop: false,
      onError: false,
    },
  },

  // Command behavior
  commands: {
    enabled: true,
    mode: 'standard', // 'standard' | 'literal' | 'simple'
    punctuationCommands: true,
    voiceCommands: true,
    confirmDestructive: false, // Confirm before delete/undo
    commandPrefix: null, // Optional prefix like "command" or "hey"
  },

  // Auto-correction and processing
  processing: {
    autoCapitalize: true,
    autoPunctuation: false,
    spellingCorrection: false,
    numberFormatting: true,
  },

  // Accessibility overrides
  accessibility: {
    announceState: false, // Screen reader announcements
    keyboardShortcuts: true,
    focusManagement: true,
  },
};

/**
 * S.7.1: ADHD Profile
 * Optimized for users with ADHD who need:
 * - Faster response times to maintain focus
 * - Minimal visual distractions
 * - Clear, immediate feedback
 * - Large, obvious visual indicators
 */
const ADHD_PROFILE = {
  name: 'ADHD Focus',
  type: STTProfileType.ADHD,
  description: 'Fast response, minimal distractions, clear visual feedback',

  recognition: {
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    language: 'en-US',
    silenceTimeout: 800, // Shorter - faster response
    speechTimeout: 15000, // Longer - allow extended dictation
    startDelay: 0, // Instant start
  },

  ui: {
    buttonSize: 'large',
    buttonSizePx: 64,
    iconSize: 32,
    colors: {
      idle: '#2196F3', // Bright blue - attention grabbing
      listening: '#4CAF50', // Clear green - obvious state
      processing: '#FF9800',
      error: '#F44336',
      background: '#ffffff',
      text: '#000000', // High contrast text
    },
    contrast: 'high',
    animations: false, // Disable animations - reduce distraction
    pulseEffect: false, // No pulse - less distraction
    showTranscript: true, // Show what's being typed
    transcriptPosition: 'floating', // Floating near cursor
  },

  feedback: {
    visual: {
      enabled: true,
      showWaveform: false, // Distracting
      showConfidence: false, // Unnecessary detail
      flashOnRecognition: true, // Quick confirmation
    },
    audio: {
      enabled: false, // No audio distractions
      startSound: false,
      stopSound: false,
      errorSound: false,
      volume: 0,
    },
    haptic: {
      enabled: false,
      onStart: false,
      onStop: false,
      onError: false,
    },
  },

  commands: {
    enabled: true,
    mode: 'simple', // Simple commands only
    punctuationCommands: true,
    voiceCommands: true,
    confirmDestructive: false, // Fast - no confirmations
    commandPrefix: null,
  },

  processing: {
    autoCapitalize: true,
    autoPunctuation: true, // Auto-add punctuation
    spellingCorrection: false,
    numberFormatting: true,
  },

  accessibility: {
    announceState: false,
    keyboardShortcuts: true,
    focusManagement: true,
  },
};

/**
 * S.7.2: Dyslexia Profile
 * Optimized for users with dyslexia who need:
 * - Phonetic mode awareness
 * - Extra pause time for processing
 * - Simple, clear commands
 * - Patient timing that doesn't rush
 */
const DYSLEXIA_PROFILE = {
  name: 'Dyslexia Support',
  type: STTProfileType.DYSLEXIA,
  description: 'Extra processing time, simple commands, patient timing',

  recognition: {
    continuous: true,
    interimResults: true,
    maxAlternatives: 3, // More alternatives for phonetic variations
    language: 'en-US',
    silenceTimeout: 3000, // Much longer - time to think
    speechTimeout: 20000, // Extended speech time
    startDelay: 500, // Brief delay to prepare
  },

  ui: {
    buttonSize: 'large',
    buttonSizePx: 64,
    iconSize: 32,
    colors: {
      idle: '#5C6BC0', // Softer indigo
      listening: '#66BB6A', // Soft green
      processing: '#FFB74D', // Soft orange
      error: '#EF5350', // Soft red
      background: '#FFF8E1', // Warm cream background
      text: '#3E2723', // Dark brown text
    },
    contrast: 'normal',
    animations: true,
    pulseEffect: true, // Gentle pulse shows active
    showTranscript: true,
    transcriptPosition: 'above', // Stable position
  },

  feedback: {
    visual: {
      enabled: true,
      showWaveform: false,
      showConfidence: true, // Show confidence helps understanding
      flashOnRecognition: false, // No sudden flashes
    },
    audio: {
      enabled: true,
      startSound: true, // Audio cue helps
      stopSound: true,
      errorSound: true,
      volume: 0.3, // Gentle volume
    },
    haptic: {
      enabled: false,
      onStart: false,
      onStop: false,
      onError: false,
    },
  },

  commands: {
    enabled: true,
    mode: 'simple', // Only basic commands
    punctuationCommands: true,
    voiceCommands: true,
    confirmDestructive: true, // Confirm before delete
    commandPrefix: null,
  },

  processing: {
    autoCapitalize: true,
    autoPunctuation: true,
    spellingCorrection: true, // Help with spelling
    numberFormatting: true,
  },

  accessibility: {
    announceState: true, // Announce state changes
    keyboardShortcuts: true,
    focusManagement: true,
  },
};

/**
 * S.7.3: Anxiety Profile
 * Optimized for users with anxiety who need:
 * - Calm, soothing colors
 * - Gentle, non-startling sounds
 * - Forgiving timing that doesn't pressure
 * - No sudden changes or surprises
 */
const ANXIETY_PROFILE = {
  name: 'Anxiety Calm',
  type: STTProfileType.ANXIETY,
  description: 'Calm colors, gentle feedback, forgiving timing',

  recognition: {
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    language: 'en-US',
    silenceTimeout: 4000, // Very forgiving - no pressure
    speechTimeout: 30000, // Extended - take your time
    startDelay: 300, // Brief moment to breathe
  },

  ui: {
    buttonSize: 'medium',
    buttonSizePx: 52,
    iconSize: 26,
    colors: {
      idle: '#81C784', // Soft sage green
      listening: '#A5D6A7', // Lighter green
      processing: '#C5E1A5', // Very soft lime
      error: '#FFAB91', // Soft coral (not alarming red)
      background: '#E8F5E9', // Light green tint
      text: '#2E7D32', // Dark green
    },
    contrast: 'normal',
    animations: true, // Smooth, calming animations
    pulseEffect: true, // Gentle breathing pulse
    showTranscript: true,
    transcriptPosition: 'below', // Predictable position
  },

  feedback: {
    visual: {
      enabled: true,
      showWaveform: false,
      showConfidence: false, // No pressure from scores
      flashOnRecognition: false, // No sudden flashes
    },
    audio: {
      enabled: true,
      startSound: true, // Gentle chime
      stopSound: true, // Soft confirmation
      errorSound: false, // No alarming sounds
      volume: 0.2, // Very quiet
    },
    haptic: {
      enabled: false,
      onStart: false,
      onStop: false,
      onError: false,
    },
  },

  commands: {
    enabled: true,
    mode: 'standard',
    punctuationCommands: true,
    voiceCommands: true,
    confirmDestructive: true, // Confirm prevents accidents
    commandPrefix: null,
  },

  processing: {
    autoCapitalize: true,
    autoPunctuation: true,
    spellingCorrection: false, // No corrections that feel like criticism
    numberFormatting: true,
  },

  accessibility: {
    announceState: false, // No sudden announcements
    keyboardShortcuts: true,
    focusManagement: true,
  },
};

/**
 * S.7.4: Motor Impairment Profile
 * Optimized for users with motor impairments who need:
 * - Longer hold times for button activation
 * - Voice-only activation option
 * - Large touch targets
 * - No rapid interactions required
 */
const MOTOR_IMPAIRMENT_PROFILE = {
  name: 'Motor Impairment',
  type: STTProfileType.MOTOR_IMPAIRMENT,
  description: 'Voice-only activation, large targets, patient timing',

  recognition: {
    continuous: true, // Continuous to avoid re-clicking
    interimResults: true,
    maxAlternatives: 2,
    language: 'en-US',
    silenceTimeout: 5000, // Very long - no rush
    speechTimeout: 60000, // Extended dictation
    startDelay: 0,
  },

  ui: {
    buttonSize: 'xlarge',
    buttonSizePx: 80, // Extra large touch target
    iconSize: 40,
    colors: {
      idle: '#1976D2', // Clear blue
      listening: '#388E3C', // Clear green
      processing: '#F57C00',
      error: '#D32F2F',
      background: '#ffffff',
      text: '#212121',
    },
    contrast: 'high',
    animations: true,
    pulseEffect: true,
    showTranscript: true,
    transcriptPosition: 'floating',
  },

  feedback: {
    visual: {
      enabled: true,
      showWaveform: true, // Visual confirmation mic is working
      showConfidence: false,
      flashOnRecognition: true,
    },
    audio: {
      enabled: true,
      startSound: true, // Confirm activation
      stopSound: true,
      errorSound: true,
      volume: 0.5,
    },
    haptic: {
      enabled: true, // Haptic for confirmation
      onStart: true,
      onStop: true,
      onError: true,
    },
  },

  commands: {
    enabled: true,
    mode: 'standard',
    punctuationCommands: true,
    voiceCommands: true, // Voice commands essential
    confirmDestructive: true,
    commandPrefix: 'command', // Prefix prevents accidental commands
  },

  processing: {
    autoCapitalize: true,
    autoPunctuation: true, // Reduce need for manual punctuation
    spellingCorrection: false,
    numberFormatting: true,
  },

  accessibility: {
    announceState: true, // Screen reader support
    keyboardShortcuts: false, // May be difficult
    focusManagement: true,
  },

  // Motor-specific settings
  motor: {
    holdToActivate: true, // Hold button to start
    holdDuration: 500, // 500ms hold required
    voiceActivation: true, // Enable "start listening" voice command
    voiceActivationPhrase: 'start dictation',
    voiceDeactivationPhrase: 'stop dictation',
    dragToCancel: false, // Disable drag-to-cancel (accidental drags)
  },
};

/**
 * S.7.5: Low Vision Profile
 * Optimized for users with low vision who need:
 * - Large, high-contrast button
 * - Audio feedback for all actions
 * - Screen reader optimized
 * - Minimal reliance on visual cues
 */
const LOW_VISION_PROFILE = {
  name: 'Low Vision',
  type: STTProfileType.LOW_VISION,
  description: 'Large button, high contrast, comprehensive audio feedback',

  recognition: {
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    language: 'en-US',
    silenceTimeout: 2500,
    speechTimeout: 20000,
    startDelay: 200,
  },

  ui: {
    buttonSize: 'xlarge',
    buttonSizePx: 96, // Very large
    iconSize: 48, // Large icon
    colors: {
      idle: '#000000', // Black on white
      listening: '#FFFFFF', // White on black (inverted)
      processing: '#FFFF00', // Yellow - high visibility
      error: '#FF0000', // Pure red
      background: '#FFFFFF',
      text: '#000000',
    },
    contrast: 'very-high',
    animations: false, // May be distracting
    pulseEffect: false,
    showTranscript: true,
    transcriptPosition: 'above',
    transcriptFontSize: 24, // Large transcript text
  },

  feedback: {
    visual: {
      enabled: true,
      showWaveform: false,
      showConfidence: false,
      flashOnRecognition: false,
    },
    audio: {
      enabled: true,
      startSound: true,
      stopSound: true,
      errorSound: true,
      volume: 0.7, // Louder volume
      speakTranscript: true, // Read back what was typed
    },
    haptic: {
      enabled: true,
      onStart: true,
      onStop: true,
      onError: true,
    },
  },

  commands: {
    enabled: true,
    mode: 'standard',
    punctuationCommands: true,
    voiceCommands: true,
    confirmDestructive: true,
    commandPrefix: null,
  },

  processing: {
    autoCapitalize: true,
    autoPunctuation: true,
    spellingCorrection: false,
    numberFormatting: true,
  },

  accessibility: {
    announceState: true, // Always announce
    announceTranscript: true, // Read what's being typed
    keyboardShortcuts: true,
    focusManagement: true,
    highContrastMode: true,
  },
};

/**
 * S.7.6: Autism Profile
 * Optimized for users on the autism spectrum who need:
 * - Predictable, consistent behavior
 * - No surprises or sudden changes
 * - Literal command interpretation
 * - Clear, explicit feedback
 */
const AUTISM_PROFILE = {
  name: 'Autism Comfort',
  type: STTProfileType.AUTISM,
  description: 'Predictable behavior, no surprises, literal commands',

  recognition: {
    continuous: true,
    interimResults: false, // No changing text - final only
    maxAlternatives: 1,
    language: 'en-US',
    silenceTimeout: 2000, // Consistent timing
    speechTimeout: 15000,
    startDelay: 0,
  },

  ui: {
    buttonSize: 'large',
    buttonSizePx: 64,
    iconSize: 32,
    colors: {
      idle: '#607D8B', // Neutral blue-grey
      listening: '#78909C', // Slightly lighter
      processing: '#90A4AE', // Even lighter
      error: '#B71C1C', // Dark red - clear error
      background: '#ECEFF1', // Light neutral
      text: '#37474F',
    },
    contrast: 'normal',
    animations: false, // No animations - predictable
    pulseEffect: false, // No movement
    showTranscript: true, // Clear what's happening
    transcriptPosition: 'below', // Always same place
  },

  feedback: {
    visual: {
      enabled: true,
      showWaveform: false,
      showConfidence: true, // Show confidence for transparency
      flashOnRecognition: false, // No sudden changes
    },
    audio: {
      enabled: true,
      startSound: true, // Consistent audio cues
      stopSound: true,
      errorSound: true,
      volume: 0.4,
    },
    haptic: {
      enabled: false,
      onStart: false,
      onStop: false,
      onError: false,
    },
  },

  commands: {
    enabled: true,
    mode: 'literal', // Literal interpretation only
    punctuationCommands: true,
    voiceCommands: true,
    confirmDestructive: true, // Always confirm
    commandPrefix: 'do', // Clear prefix: "do delete", "do undo"
  },

  processing: {
    autoCapitalize: true,
    autoPunctuation: false, // No automatic changes
    spellingCorrection: false, // No unexpected corrections
    numberFormatting: false, // Type exactly as spoken
  },

  accessibility: {
    announceState: true, // Clear state communication
    keyboardShortcuts: true,
    focusManagement: true,
  },

  // Autism-specific settings
  autism: {
    explicitModeIndicator: true, // Always show current mode
    countdownBeforeAction: true, // 3-2-1 before destructive actions
    noSuggestions: true, // No auto-complete suggestions
    consistentLayout: true, // Never change UI positions
  },
};

/**
 * All available STT profiles
 */
export const STT_PROFILES = {
  [STTProfileType.DEFAULT]: DEFAULT_PROFILE,
  [STTProfileType.ADHD]: ADHD_PROFILE,
  [STTProfileType.DYSLEXIA]: DYSLEXIA_PROFILE,
  [STTProfileType.ANXIETY]: ANXIETY_PROFILE,
  [STTProfileType.MOTOR_IMPAIRMENT]: MOTOR_IMPAIRMENT_PROFILE,
  [STTProfileType.LOW_VISION]: LOW_VISION_PROFILE,
  [STTProfileType.AUTISM]: AUTISM_PROFILE,
};

/**
 * STT Profile Manager
 * Handles profile loading, switching, and customization
 */
export class STTProfileManager {
  constructor(options = {}) {
    this.currentProfile = null;
    this.currentProfileType = STTProfileType.DEFAULT;
    this.customProfiles = {};
    this.onProfileChange = options.onProfileChange || (() => {});

    // Keyboard shortcut settings
    this.shortcutKey = options.shortcutKey || 'P'; // Default: Ctrl+Shift+P
    this.shortcutModifiers = options.shortcutModifiers || ['ctrl', 'shift'];

    // Initialize with default or saved profile
    this.initialize(options.initialProfile);
  }

  /**
   * Initialize the profile manager
   * @param {string} initialProfile - Initial profile type to load
   */
  async initialize(initialProfile) {
    // Try to load saved profile preference
    try {
      const saved = await this.loadSavedProfile();
      if (saved) {
        this.setProfile(saved.type, saved.customizations);
        return;
      }
    } catch (error) {
      console.warn('[STTProfiles] Could not load saved profile:', error);
    }

    // Fall back to initial or default
    this.setProfile(initialProfile || STTProfileType.DEFAULT);
  }

  /**
   * Load saved profile preference from storage
   * @returns {Object|null} Saved profile data or null
   */
  async loadSavedProfile() {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['assist_stt_profile'], result => {
          resolve(result.assist_stt_profile || null);
        });
      } else {
        // Fallback for non-extension context
        const saved = localStorage.getItem('assist_stt_profile');
        resolve(saved ? JSON.parse(saved) : null);
      }
    });
  }

  /**
   * Save current profile preference to storage
   */
  async saveProfilePreference() {
    const data = {
      type: this.currentProfileType,
      customizations: this.getCustomizations(),
      savedAt: new Date().toISOString(),
    };

    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ assist_stt_profile: data }, resolve);
      } else {
        localStorage.setItem('assist_stt_profile', JSON.stringify(data));
        resolve();
      }
    });
  }

  /**
   * Set the active STT profile
   * @param {string} profileType - Profile type from STTProfileType enum
   * @param {Object} customizations - Optional customizations to apply
   */
  setProfile(profileType, customizations = {}) {
    const baseProfile = STT_PROFILES[profileType];
    if (!baseProfile) {
      console.error('[STTProfiles] Unknown profile type:', profileType);
      return false;
    }

    // Deep merge base profile with customizations
    this.currentProfile = this.deepMerge(baseProfile, customizations);
    this.currentProfileType = profileType;

    console.log('[STTProfiles] Activated profile:', this.currentProfile.name);

    // Notify listeners
    this.onProfileChange(this.currentProfile, profileType);

    // Save preference
    this.saveProfilePreference();

    return true;
  }

  /**
   * Get the current profile
   * @returns {Object} Current profile configuration
   */
  getProfile() {
    return this.currentProfile || STT_PROFILES[STTProfileType.DEFAULT];
  }

  /**
   * Get current profile type
   * @returns {string} Current profile type
   */
  getProfileType() {
    return this.currentProfileType;
  }

  /**
   * Get all available profiles
   * @returns {Object} Map of profile types to profiles
   */
  getAllProfiles() {
    return { ...STT_PROFILES, ...this.customProfiles };
  }

  /**
   * Get profile metadata for UI display
   * @returns {Array} Array of profile info objects
   */
  getProfileList() {
    const profiles = this.getAllProfiles();
    return Object.entries(profiles).map(([type, profile]) => ({
      type,
      name: profile.name,
      description: profile.description,
      isActive: type === this.currentProfileType,
      isCustom: !!this.customProfiles[type],
    }));
  }

  /**
   * Get customizations applied to current profile
   * @returns {Object} Customizations object
   */
  getCustomizations() {
    if (!this.currentProfile) {
      return {};
    }

    const baseProfile = STT_PROFILES[this.currentProfileType];
    if (!baseProfile) {
      return {};
    }

    // Find differences between current and base
    return this.findDifferences(baseProfile, this.currentProfile);
  }

  /**
   * Apply customization to current profile
   * @param {string} path - Dot-notation path to setting
   * @param {*} value - New value
   */
  customize(path, value) {
    if (!this.currentProfile) {
      return;
    }

    const parts = path.split('.');
    let target = this.currentProfile;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }

    target[parts[parts.length - 1]] = value;
    this.saveProfilePreference();
  }

  /**
   * Reset current profile to defaults
   */
  resetProfile() {
    this.setProfile(this.currentProfileType, {});
  }

  /**
   * Cycle to next profile (for quick-switch)
   * @returns {Object} New active profile
   */
  cycleProfile() {
    const types = Object.keys(STT_PROFILES);
    const currentIndex = types.indexOf(this.currentProfileType);
    const nextIndex = (currentIndex + 1) % types.length;
    this.setProfile(types[nextIndex]);
    return this.currentProfile;
  }

  /**
   * S.7.7: Setup keyboard shortcut for profile quick-switch
   * Default: Ctrl+Shift+P
   */
  setupKeyboardShortcut() {
    document.addEventListener('keydown', event => {
      const isShortcut = this.checkShortcut(event);
      if (isShortcut) {
        event.preventDefault();
        this.cycleProfile();
        this.announceProfileChange();
      }
    });

    console.log(
      '[STTProfiles] Keyboard shortcut registered:',
      `${this.shortcutModifiers.join('+')}+${this.shortcutKey}`
    );
  }

  /**
   * Check if keyboard event matches shortcut
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {boolean} True if shortcut matched
   */
  checkShortcut(event) {
    const key = event.key.toUpperCase();
    if (key !== this.shortcutKey) {
      return false;
    }

    const ctrlRequired = this.shortcutModifiers.includes('ctrl');
    const shiftRequired = this.shortcutModifiers.includes('shift');
    const altRequired = this.shortcutModifiers.includes('alt');

    return (
      event.ctrlKey === ctrlRequired &&
      event.shiftKey === shiftRequired &&
      event.altKey === altRequired
    );
  }

  /**
   * Announce profile change (for accessibility)
   */
  announceProfileChange() {
    const profile = this.currentProfile;

    // Visual notification
    this.showProfileNotification(profile.name);

    // Screen reader announcement
    if (profile.accessibility?.announceState) {
      const announcement = `STT profile changed to ${profile.name}. ${profile.description}`;
      this.announceToScreenReader(announcement);
    }
  }

  /**
   * Show visual notification of profile change
   * @param {string} profileName - Name of new profile
   */
  showProfileNotification(profileName) {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('assist-stt-profile-notification');

    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'assist-stt-profile-notification';
      notification.setAttribute('role', 'status');
      notification.setAttribute('aria-live', 'polite');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        background: #333;
        color: #fff;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 999999;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
      document.body.appendChild(notification);
    }

    // Show notification
    notification.textContent = `STT Profile: ${profileName}`;
    notification.style.opacity = '1';

    // Hide after delay
    setTimeout(() => {
      notification.style.opacity = '0';
    }, 2000);
  }

  /**
   * Announce message to screen readers
   * @param {string} message - Message to announce
   */
  announceToScreenReader(message) {
    const announcer = document.createElement('div');
    announcer.setAttribute('role', 'alert');
    announcer.setAttribute('aria-live', 'assertive');
    announcer.className = 'sr-only';
    announcer.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    announcer.textContent = message;
    document.body.appendChild(announcer);

    // Remove after announcement
    setTimeout(() => {
      announcer.remove();
    }, 1000);
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object to merge
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Find differences between two objects
   * @param {Object} base - Base object
   * @param {Object} current - Current object
   * @returns {Object} Object containing differences
   */
  findDifferences(base, current, path = '') {
    const diff = {};

    for (const key in current) {
      const currentPath = path ? `${path}.${key}` : key;

      if (!(key in base)) {
        diff[key] = current[key];
      } else if (
        current[key] instanceof Object &&
        base[key] instanceof Object &&
        !Array.isArray(current[key])
      ) {
        const nestedDiff = this.findDifferences(base[key], current[key], currentPath);
        if (Object.keys(nestedDiff).length > 0) {
          diff[key] = nestedDiff;
        }
      } else if (JSON.stringify(current[key]) !== JSON.stringify(base[key])) {
        diff[key] = current[key];
      }
    }

    return diff;
  }

  /**
   * Export profile to JSON
   * @param {string} profileType - Profile type to export
   * @returns {string} JSON string
   */
  exportProfile(profileType) {
    const profile = this.getAllProfiles()[profileType];
    if (!profile) {
      return null;
    }

    return JSON.stringify(
      {
        version: '1.0',
        type: profileType,
        profile: profile,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  /**
   * Import profile from JSON
   * @param {string} json - JSON string
   * @returns {boolean} Success status
   */
  importProfile(json) {
    try {
      const data = JSON.parse(json);
      if (!data.profile || !data.type) {
        throw new Error('Invalid profile format');
      }

      this.customProfiles[data.type] = data.profile;
      console.log('[STTProfiles] Imported profile:', data.profile.name);
      return true;
    } catch (error) {
      console.error('[STTProfiles] Import failed:', error);
      return false;
    }
  }
}

/**
 * Get button size CSS for a profile
 * @param {Object} profile - STT profile
 * @returns {Object} CSS properties
 */
export function getButtonStyles(profile) {
  const ui = profile.ui || {};

  return {
    width: `${ui.buttonSizePx || 48}px`,
    height: `${ui.buttonSizePx || 48}px`,
    backgroundColor: ui.colors?.idle || '#2196F3',
    color: ui.colors?.text || '#ffffff',
    borderRadius: '50%',
    border: ui.contrast === 'very-high' ? '3px solid #000' : 'none',
    cursor: 'pointer',
    transition: ui.animations ? 'all 0.2s ease' : 'none',
    boxShadow: ui.contrast === 'high' ? '0 4px 8px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
  };
}

/**
 * Get state-specific button color
 * @param {Object} profile - STT profile
 * @param {string} state - Button state ('idle', 'listening', 'processing', 'error')
 * @returns {string} Color value
 */
export function getStateColor(profile, state) {
  return profile.ui?.colors?.[state] || '#2196F3';
}

/**
 * Map neurodivergent profile type to STT profile type
 * @param {string} profileName - Neurodivergent profile name from popup
 * @returns {string} STT profile type
 */
export function mapNeurodivergentProfile(profileName) {
  const mapping = {
    'ADHD Focus': STTProfileType.ADHD,
    'Autism Comfort': STTProfileType.AUTISM,
    'Dyslexia Support': STTProfileType.DYSLEXIA,
    'Sensory Sensitive': STTProfileType.ANXIETY, // Close match
    'Anxiety Calm': STTProfileType.ANXIETY,
    'Low Vision': STTProfileType.LOW_VISION,
    'Night Study': STTProfileType.DEFAULT,
    'Reading Mode': STTProfileType.DEFAULT,
    'Quiz Mode': STTProfileType.DEFAULT,
    Default: STTProfileType.DEFAULT,
  };

  return mapping[profileName] || STTProfileType.DEFAULT;
}

export default STTProfileManager;
