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
import { STTController } from '../../engines/stt/stt-controller-facade.js';
import { MicrophoneButton } from '../../ui/components/microphone-button.js';
import { AmbientDetector } from '../../engines/stt/ambient-detector.js';

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

/** Ambient detector instance — classifies background sound during recording */
let stt_ambientDetector = null;
/** Parallel audio stream used only for ambient frequency analysis */
let stt_ambientStream = null;
/** AudioContext for the ambient analysis stream */
let stt_ambientContext = null;
/** True when ambient detector reports keyboard typing — suppresses interim results */
let stt_typingDetected = false;

/**
 * STT configuration settings
 * @type {Object}
 * @property {boolean} continuous - Enable continuous recognition mode
 * @property {boolean} interimResults - Show interim results while speaking
 * @property {string} language - Recognition language (e.g., 'en-US')
 * @property {boolean} autoCapitalize - Automatically capitalize sentences
 * @property {boolean} punctuationCommands - Enable voice punctuation commands
 * @property {boolean} voiceCommands - Enable voice editing/navigation commands
 * @property {boolean} autoPunctuation - Enable automatic punctuation detection
 * @property {boolean} floatingButton - Show floating microphone button
 */
const stt_settings = {
  continuous: true,
  interimResults: true,
  language: 'en-US',
  autoCapitalize: true,
  punctuationCommands: true,
  voiceCommands: true,
  autoPunctuation: true,
  floatingButton: true,
};

// STTController and MicrophoneButton are now statically imported
// at the top of this file, so they're automatically bundled by Vite

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
function stt_startAmbientDetection() {
  if (stt_ambientDetector) {
    return;
  } // already running
  stt_ambientDetector = new AmbientDetector();
  stt_ambientDetector.onStateChange = state => {
    stt_typingDetected = state === 'typing';
  };

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(stream => {
      stt_ambientStream = stream;
      stt_ambientContext = new AudioContext();
      const source = stt_ambientContext.createMediaStreamSource(stream);
      const analyser = stt_ambientContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      stt_ambientDetector.setAnalyser(analyser);
      stt_ambientDetector.start();
    })
    .catch(() => {
      // Best-effort — ambient detection unavailable, no effect on STT
      stt_ambientDetector = null;
    });
}

function stt_stopAmbientDetection() {
  if (stt_ambientDetector) {
    stt_ambientDetector.stop();
    stt_ambientDetector = null;
  }
  if (stt_ambientStream) {
    stt_ambientStream.getTracks().forEach(t => t.stop());
    stt_ambientStream = null;
  }
  if (stt_ambientContext) {
    stt_ambientContext.close();
    stt_ambientContext = null;
  }
  stt_typingDetected = false;
}

async function stt_initialize() {
  console.log('[STT] stt_initialize() called, stt_enabled:', stt_enabled);

  if (!stt_enabled) {
    console.log('[STT] STT is disabled, skipping initialization');
    return;
  }

  console.log('[STT] STT is enabled, creating controller and button...');

  try {
    // Create STT controller with callbacks
    stt_controller = new STTController({
      continuous: stt_settings.continuous,
      interimResults: stt_settings.interimResults,
      language: stt_settings.language,
      autoCapitalize: stt_settings.autoCapitalize,
      punctuationCommands: stt_settings.punctuationCommands,
      voiceCommands: stt_settings.voiceCommands,
      autoPunctuation: stt_settings.autoPunctuation,
      onStart: () => {
        console.log('[STT] Recording started');
        if (stt_micButton) {
          stt_micButton.updateState({ isRecording: true });
        }
        stt_startAmbientDetection();
      },
      onEnd: () => {
        console.log('[STT] Recording ended');
        if (stt_micButton) {
          stt_micButton.updateState({ isRecording: false });
        }
        stt_stopAmbientDetection();
      },
      onResult: (text, _fullTranscript) => {
        console.log('[STT] Result:', text);
        // Text already inserted by controller
      },
      onInterimResult: text => {
        // Suppress interim display while user is typing (keyboard ambient detected)
        if (stt_typingDetected) {
          return;
        }
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
    console.log('[STT] floatingButton setting:', stt_settings.floatingButton);
    if (stt_settings.floatingButton) {
      console.log('[STT] Creating microphone button...');
      stt_micButton = new MicrophoneButton({
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
        onPause: () => {
          if (stt_controller) {
            stt_controller.pauseListening();
          }
        },
        onResume: () => {
          if (stt_controller) {
            stt_controller.resumeListening();
          }
        },
        onError: message => {
          showToast('⚠️ ' + message);
        },
      });
    }

    console.log('[STT] Initialized successfully! stt_micButton:', !!stt_micButton);
  } catch (error) {
    console.error('[STT] INITIALIZATION FAILED:', error);
    showToast('⚠️ STT initialization failed: ' + error.message);
  }
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

  stt_stopAmbientDetection();
  stt_activeField = null;
  console.log('[STT] Cleanup complete');
}

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
  console.log('[STT] setupFieldListeners() - registering always-on listeners');
  console.log(
    '[STT] Current state: stt_enabled:',
    stt_enabled,
    'floatingButton:',
    stt_settings.floatingButton
  );

  /**
   * Show mic button for a detected text field
   * @param {HTMLElement} field - The text input element
   */
  function showMicForField(field) {
    stt_activeField = field;
    console.log('[STT] Text field detected, stt_micButton exists:', !!stt_micButton);
    if (stt_micButton) {
      console.log('[STT] Showing microphone button...');
      stt_micButton.show(field);
    } else {
      console.error('[STT] stt_micButton is null! Cannot show button.');
    }
  }

  // Listen for focus on text fields
  document.addEventListener(
    'focusin',
    e => {
      console.log('[STT] focusin event:', e.target.tagName, 'isTextInput:', isTextInput(e.target));
      if (stt_enabled && isTextInput(e.target)) {
        showMicForField(e.target);
      }
    },
    true
  );

  // Listen for focusout - Don't hide button immediately
  document.addEventListener(
    'focusout',
    e => {
      if (stt_activeField === e.target && stt_micButton) {
        console.log('[STT] Field lost focus, but keeping button visible');
      }
    },
    true
  );

  // Unified click handler: show mic for rich editors, hide when clicking outside
  document.addEventListener(
    'click',
    e => {
      if (!stt_enabled || !stt_micButton) {
        return;
      }

      // Check if click is on the mic button itself
      const clickedOnButton =
        stt_micButton.button &&
        (e.target === stt_micButton.button || stt_micButton.button.contains(e.target));
      if (clickedOnButton) {
        return;
      }

      // Detect rich editor clicks (Google Docs, etc.) that don't fire focusin
      const richEditor =
        e.target.closest('.kix-appview-editor') ||
        e.target.closest('.kix-page') ||
        e.target.closest('.kix-paginateddocumentplugin') ||
        e.target.closest('[role="document"][contenteditable]') ||
        e.target.closest('.docs-texteventtarget-iframe');
      if (richEditor) {
        const editorArea =
          document.querySelector('.kix-appview-editor') ||
          document.querySelector('[role="document"][contenteditable]') ||
          richEditor;
        console.log('[STT] Rich editor click detected');
        showMicForField(editorArea);
        return;
      }

      // Check if click is on the active field or inside it
      const clickedOnField =
        stt_activeField && (e.target === stt_activeField || stt_activeField.contains(e.target));

      // Hide button when clicking outside both field and button
      if (!clickedOnField && stt_activeField && !stt_controller?.isRecording) {
        stt_micButton.hide();
        stt_activeField = null;
        console.log('[STT] Clicked outside - hiding button');
      }
    },
    true
  );
}

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
  console.log('[STT] applySettings() called, isInit:', isInit, 'settings:', settings);

  const wasEnabled = stt_enabled;
  const newEnabled = settings.enabled || false;

  console.log('[STT] wasEnabled:', wasEnabled, 'newEnabled:', newEnabled);

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

// Register field listeners unconditionally at module load.
// Listeners check stt_enabled/stt_micButton at runtime, so they're
// no-ops when STT is off but immediately active once toggled on.
stt_setupFieldListeners();

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
  };
  console.log('[STT] Exposed to window.assistFeatures');
}

/**
 * Export all STT functions for external use
 *
 * Note: In the current implementation, the module is self-initializing
 * and doesn't require external calls. These exports are provided for
 * potential future use cases or testing.
 */
export { stt_initialize, stt_setupFieldListeners, stt_cleanup };
