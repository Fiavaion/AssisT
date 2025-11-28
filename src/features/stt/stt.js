/**
 * AssisT - Speech-to-Text (STT) Feature Module
 *
 * Provides speech-to-text functionality with:
 * - Dynamic module loading for STT controller and microphone button
 * - Text field detection and listener attachment
 * - Chrome storage integration for settings persistence
 * - Self-initializing module with automatic cleanup
 *
 * @module features/stt/stt
 * @version 1.1.0
 */

import { isTextInput } from './validation.js';
import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// ============================================================
// STT STATE MANAGEMENT
// ============================================================

/**
 * Master enable/disable flag for STT feature
 * @type {boolean}
 */
let stt_enabled = false;

/**
 * Reference to the STT controller instance
 * @type {STTController|null}
 */
let stt_controller = null;

/**
 * Reference to the microphone button UI component
 * @type {MicrophoneButton|null}
 */
let stt_micButton = null;

/**
 * Currently active text input field
 * @type {HTMLElement|null}
 */
let stt_activeField = null;

/**
 * STT configuration settings
 * @type {Object}
 * @property {boolean} continuous - Enable continuous recognition mode
 * @property {boolean} interimResults - Show interim results while speaking
 * @property {string} language - Recognition language (e.g., 'en-US')
 * @property {boolean} autoCapitalize - Automatically capitalize sentences
 * @property {boolean} punctuationCommands - Enable voice punctuation commands
 * @property {boolean} floatingButton - Show floating microphone button
 */
const stt_settings = {
  continuous: true,
  interimResults: true,
  language: 'en-US',
  autoCapitalize: true,
  punctuationCommands: true,
  floatingButton: true,
};

// ============================================================
// DYNAMIC MODULE LOADING
// ============================================================

/**
 * Dynamically loads STT controller and microphone button modules
 *
 * Uses dynamic imports to load modules only when STT is enabled.
 * This reduces initial bundle size and improves performance.
 *
 * @async
 * @returns {Promise<Object|null>} Module exports or null on error
 * @returns {Function} return.STTController - STT controller class
 * @returns {Function} return.MicrophoneButton - Microphone button class
 *
 * @example
 * const modules = await stt_loadModules();
 * if (modules) {
 *   const controller = new modules.STTController(options);
 * }
 */
async function stt_loadModules() {
  try {
    const [STTModule, MicButtonModule] = await Promise.all([
      import(chrome.runtime.getURL('src/engines/stt/stt-controller.js')),
      import(chrome.runtime.getURL('src/ui/components/microphone-button.js')),
    ]);
    return {
      STTController: STTModule.STTController,
      MicrophoneButton: MicButtonModule.MicrophoneButton,
    };
  } catch (error) {
    console.error('[STT] Failed to load modules:', error);
    return null;
  }
}

// ============================================================
// INITIALIZATION AND CLEANUP
// ============================================================

/**
 * Initializes the STT feature
 *
 * Loads required modules, creates controller and UI components,
 * and sets up event listeners. Only runs if STT is enabled.
 *
 * @async
 * @returns {Promise<void>}
 *
 * @fires STTController#start - When recording starts
 * @fires STTController#end - When recording ends
 * @fires STTController#result - When final result is available
 * @fires STTController#interimResult - When interim result is available
 * @fires STTController#error - When an error occurs
 *
 * @example
 * // Called automatically when STT is enabled via settings
 * await stt_initialize();
 */
async function stt_initialize() {
  if (!stt_enabled) {
    return;
  }

  const modules = await stt_loadModules();
  if (!modules) {
    showToast('⚠️ STT failed to load');
    return;
  }

  // Create STT controller with callbacks
  stt_controller = new modules.STTController({
    continuous: stt_settings.continuous,
    interimResults: stt_settings.interimResults,
    language: stt_settings.language,
    autoCapitalize: stt_settings.autoCapitalize,
    punctuationCommands: stt_settings.punctuationCommands,
    onStart: () => {
      console.log('[STT] Recording started');
      if (stt_micButton) {
        stt_micButton.updateState({ isRecording: true });
      }
    },
    onEnd: () => {
      console.log('[STT] Recording ended');
      if (stt_micButton) {
        stt_micButton.updateState({ isRecording: false });
      }
    },
    onResult: (text, _fullTranscript) => {
      console.log('[STT] Result:', text);
      // Text already inserted by controller
    },
    onInterimResult: text => {
      // Show interim results in mic button
      if (stt_micButton && stt_settings.interimResults) {
        stt_micButton.showInterimResult(text);
      }
    },
    onError: (error, _errorType) => {
      console.error('[STT] Error:', error.message);
      showToast('⚠️ ' + error.message);
      if (stt_micButton) {
        stt_micButton.showError(error.message);
      }
    },
  });

  // Create microphone button if enabled
  if (stt_settings.floatingButton) {
    stt_micButton = new modules.MicrophoneButton({
      onStart: targetField => {
        if (stt_controller) {
          stt_activeField = targetField;
          stt_controller.startListening(targetField);
        }
      },
      onStop: () => {
        if (stt_controller) {
          stt_controller.stopListening();
        }
      },
      onError: message => {
        showToast('⚠️ ' + message);
      },
    });
  }

  // Listen for focus on text input fields
  stt_setupFieldListeners();

  console.log('[STT] Initialized successfully');
}

/**
 * Cleans up STT resources and removes UI elements
 *
 * Destroys controller, removes microphone button, and clears references.
 * Called when STT is disabled or page is unloaded.
 *
 * @returns {void}
 *
 * @example
 * // Called automatically when STT is disabled via settings
 * stt_cleanup();
 */
function stt_cleanup() {
  if (stt_controller) {
    stt_controller.destroy();
    stt_controller = null;
  }

  if (stt_micButton) {
    stt_micButton.destroy();
    stt_micButton = null;
  }

  stt_activeField = null;
  console.log('[STT] Cleanup complete');
}

// ============================================================
// EVENT LISTENERS
// ============================================================

/**
 * Sets up event listeners for text field interactions
 *
 * Attaches listeners for:
 * - Focus events: Show microphone button when text field is focused
 * - Blur events: Keep button visible (don't auto-hide)
 * - Click events: Hide button when clicking outside field and button
 *
 * @returns {void}
 *
 * @example
 * // Called automatically during initialization
 * stt_setupFieldListeners();
 */
function stt_setupFieldListeners() {
  if (!stt_enabled || !stt_settings.floatingButton) {
    return;
  }

  // Listen for focus on text fields
  document.addEventListener(
    'focusin',
    e => {
      if (stt_enabled && isTextInput(e.target)) {
        stt_activeField = e.target;
        if (stt_micButton) {
          stt_micButton.show(e.target);
        }
        console.log('[STT] Field focused:', e.target.tagName);
      }
    },
    true
  );

  // Listen for focusout - Don't hide button immediately
  document.addEventListener(
    'focusout',
    e => {
      if (stt_activeField === e.target && stt_micButton) {
        // Keep button visible - only hide when:
        // 1. Recording stops naturally
        // 2. User explicitly clicks away from both field and button
        // Do NOT auto-hide on blur
        console.log('[STT] Field lost focus, but keeping button visible');
      }
    },
    true
  );

  // Hide button when clicking outside both field and button
  document.addEventListener(
    'click',
    e => {
      if (!stt_enabled || !stt_micButton) {
        return;
      }

      const clickedOnField =
        stt_activeField && (e.target === stt_activeField || stt_activeField.contains(e.target));
      const clickedOnButton =
        stt_micButton.button &&
        (e.target === stt_micButton.button || stt_micButton.button.contains(e.target));

      if (!clickedOnField && !clickedOnButton && stt_activeField && !stt_controller.isRecording) {
        stt_micButton.hide();
        stt_activeField = null;
        console.log('[STT] Clicked outside - hiding button');
      }
    },
    true
  );
}

// ============================================================
// CHROME STORAGE INTEGRATION (Self-Initializing)
// ============================================================

/** @type {Object} Default settings for STT */
const DEFAULT_SETTINGS = {
  enabled: false,
  continuousMode: true,
  interimResults: true,
  language: 'en-US',
  autoCapitalize: true,
  punctuationCommands: true,
  floatingButton: true,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = stt_enabled;
  const newEnabled = settings.enabled || false;

  // Update settings (handle both old and new key names)
  stt_settings.continuous =
    settings.continuousMode !== undefined
      ? settings.continuousMode
      : DEFAULT_SETTINGS.continuousMode;
  stt_settings.interimResults =
    settings.interimResults !== undefined
      ? settings.interimResults
      : DEFAULT_SETTINGS.interimResults;
  stt_settings.language = settings.language || DEFAULT_SETTINGS.language;
  stt_settings.autoCapitalize =
    settings.autoCapitalize !== undefined
      ? settings.autoCapitalize
      : DEFAULT_SETTINGS.autoCapitalize;
  stt_settings.punctuationCommands =
    settings.punctuationCommands !== undefined
      ? settings.punctuationCommands
      : DEFAULT_SETTINGS.punctuationCommands;
  stt_settings.floatingButton =
    settings.floatingButton !== undefined
      ? settings.floatingButton
      : DEFAULT_SETTINGS.floatingButton;

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    stt_enabled = true;
    stt_initialize();
    if (!isInit) {
      showToast('🎤 Speech-to-Text enabled');
    }
  } else if (!newEnabled && wasEnabled) {
    stt_enabled = false;
    stt_cleanup();
    if (!isInit) {
      showToast('Speech-to-Text disabled');
    }
  } else if (newEnabled && stt_controller && !isInit) {
    // Update controller settings if already initialized
    stt_controller.updateSettings({
      continuous: stt_settings.continuous,
      interimResults: stt_settings.interimResults,
      language: stt_settings.language,
      autoCapitalize: stt_settings.autoCapitalize,
      punctuationCommands: stt_settings.punctuationCommands,
    });
  }

  console.log(`[STT] Settings ${isInit ? 'loaded' : 'changed'}:`, newEnabled, stt_settings);
}

/**
 * Initialize STT using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'stt',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

// ============================================================
// EXPOSE STT FOR CONTENT SCRIPT INTEGRATION (S.7)
// ============================================================

/**
 * Expose STT controller through window.assistFeatures for content script access
 * This enables profile switching and other commands from popup
 */
if (typeof window !== 'undefined') {
  window.assistFeatures = window.assistFeatures || {};
  window.assistFeatures.stt = {
    get enabled() {
      return stt_enabled;
    },
    get controller() {
      return stt_controller;
    },
    get micButton() {
      return stt_micButton;
    },
    get settings() {
      return stt_settings;
    },
    // Methods for external control
    initialize: stt_initialize,
    cleanup: stt_cleanup,
    loadModules: stt_loadModules,
  };
  console.log('[STT] Exposed to window.assistFeatures');
}

// ============================================================
// EXPORTS
// ============================================================

/**
 * Export all STT functions for external use
 *
 * Note: In the current implementation, the module is self-initializing
 * and doesn't require external calls. These exports are provided for
 * potential future use cases or testing.
 */
export { stt_loadModules, stt_initialize, stt_setupFieldListeners, stt_cleanup };
