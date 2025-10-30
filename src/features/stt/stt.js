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
 */

import { isTextInput } from './validation.js';
import { showToast } from '../../core/ui/toast.js';

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

/**
 * Load STT settings from Chrome storage on module initialization
 *
 * This listener runs automatically when the module loads.
 * It retrieves saved settings and initializes STT if enabled.
 */
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.stt) {
    const sttSettings = result.assist_settings.stt;
    stt_enabled = sttSettings.enabled || false;
    stt_settings.continuous =
      sttSettings.continuousMode !== undefined ? sttSettings.continuousMode : true;
    stt_settings.interimResults =
      sttSettings.interimResults !== undefined ? sttSettings.interimResults : true;
    stt_settings.language = sttSettings.language || 'en-US';
    stt_settings.autoCapitalize =
      sttSettings.autoCapitalize !== undefined ? sttSettings.autoCapitalize : true;
    stt_settings.punctuationCommands =
      sttSettings.punctuationCommands !== undefined ? sttSettings.punctuationCommands : true;
    stt_settings.floatingButton =
      sttSettings.floatingButton !== undefined ? sttSettings.floatingButton : true;

    if (stt_enabled) {
      stt_initialize();
    }

    console.log('[STT] Settings loaded:', stt_enabled, stt_settings);
  } else {
    console.log('[STT] Feature disabled by default');
  }
});

/**
 * Listen for real-time STT settings changes from Chrome storage
 *
 * This listener runs automatically and handles:
 * - Enable/disable state changes
 * - Settings updates while STT is active
 * - Controller reinitialization when needed
 *
 * @param {Object} changes - Storage changes object
 * @param {string} areaName - Storage area name ('local', 'sync', etc.)
 */
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.stt) {
    const sttSettings = changes.assist_settings.newValue.stt;
    const newEnabled = sttSettings.enabled || false;

    // Update settings
    stt_settings.continuous =
      sttSettings.continuousMode !== undefined ? sttSettings.continuousMode : true;
    stt_settings.interimResults =
      sttSettings.interimResults !== undefined ? sttSettings.interimResults : true;
    stt_settings.language = sttSettings.language || 'en-US';
    stt_settings.autoCapitalize =
      sttSettings.autoCapitalize !== undefined ? sttSettings.autoCapitalize : true;
    stt_settings.punctuationCommands =
      sttSettings.punctuationCommands !== undefined ? sttSettings.punctuationCommands : true;
    stt_settings.floatingButton =
      sttSettings.floatingButton !== undefined ? sttSettings.floatingButton : true;

    // Handle enable/disable
    if (newEnabled && !stt_enabled) {
      stt_enabled = true;
      stt_initialize();
      showToast('🎤 Speech-to-Text enabled');
    } else if (!newEnabled && stt_enabled) {
      stt_enabled = false;
      stt_cleanup();
      showToast('Speech-to-Text disabled');
    } else if (newEnabled && stt_controller) {
      // Update controller settings if already initialized
      stt_controller.updateSettings({
        continuous: stt_settings.continuous,
        interimResults: stt_settings.interimResults,
        language: stt_settings.language,
        autoCapitalize: stt_settings.autoCapitalize,
        punctuationCommands: stt_settings.punctuationCommands,
      });
      console.log('[STT] Settings updated');
    }

    console.log('[STT] Settings changed:', newEnabled, stt_settings);
  }
});

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
