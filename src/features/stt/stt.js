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
import { editorBodyOf, frameHolding, watchEditorFrames } from './editor-frames.js';
import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';
import {
  boundShortcut,
  matchesShortcut,
  registerShortcut,
  unregisterShortcut,
} from '../../utils/keyboard-shortcuts.js';
import { STTController } from '../../engines/stt/stt-controller-facade.js';
import { MicrophoneButton } from '../../ui/components/microphone-button.js';
import { AmbientDetector } from '../../engines/stt/ambient-detector.js';
import { debugLog } from '../../utils/debug-log.js';

import { allowDictation } from '../../utils/dictation-consent.js';
/**
 * How long a failure stays on screen. Long enough to read a two-line instruction, where the
 * default 2s toast was gone before a student had finished the first line.
 * @type {number}
 */
const ERROR_TOAST_MS = 9000;

/**
 * The registry key for the keyboard route to dictation.
 *
 * The binding itself lives in src/utils/keyboard-shortcuts.js with every other shortcut, so the
 * popup can show it, the student can change it, and there is one place that knows what it is.
 * It is handled in the page rather than as a manifest command because it has to act on the
 * field the student is typing in.
 * @type {string}
 */
const DICTATION_SHORTCUT_KEY = 'stt_dictate';

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
 * The editor iframe holding the active field, when the field is the body of one (Canvas's Rich
 * Content Editor), else null.
 * @type {HTMLIFrameElement|null}
 */
let stt_activeFrame = null;

/** Stops watching the page's editor iframes; set while voice typing is on. */
let stt_stopEditorFrames = null;

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
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return; // Best-effort feature; no audio input API here
  }
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

/**
 * Create the floating microphone button and wire it to the controller.
 * One path, used both at startup and when the student turns the button back on mid-page.
 */
function stt_createMicButton() {
  if (stt_micButton) {
    return;
  }

  console.log('[STT] Creating microphone button...');
  stt_micButton = new MicrophoneButton({
    // Dictation sends the voice to Google: the question comes before the button starts anything,
    // and a no is answered in words, never with silence.
    confirmStart: async field => {
      // An editor iframe's body is refocused through its iframe, the only part of it in this page.
      const allowed = await allowDictation({ returnFocus: frameHolding(field) || field });
      if (!allowed) {
        showToast('Nothing was recorded or sent. Press the microphone to be asked again.', 6000, {
          force: true,
        });
      }
      return allowed;
    },
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
      showToast(message, ERROR_TOAST_MS, { force: true });
    },
  });
}

/**
 * Remove the floating button from the page. Dictation stays reachable with the shortcut, which
 * is why turning the button off is no longer a dead end.
 */
function stt_removeMicButton() {
  if (!stt_micButton) {
    return;
  }

  if (stt_controller && (stt_controller.isRecording || stt_controller.isStarting)) {
    stt_controller.stopListening();
  }

  stt_micButton.destroy();
  stt_micButton = null;
  console.log('[STT] Microphone button removed (Show Microphone Button is off)');
}

/**
 * Start or stop dictation from the keyboard for the field the student is in.
 * @returns {boolean} True if dictation was started or stopped
 */
function stt_toggleDictation() {
  if (!stt_enabled || !stt_controller) {
    return false;
  }

  // With the caret in an editor's iframe, this page's active element is the iframe itself.
  const focused = document.activeElement;
  const editorBody = editorBodyOf(focused);
  const field = isTextInput(focused) ? focused : editorBody || stt_activeField;
  if (field !== stt_activeField) {
    stt_activeFrame = editorBody ? focused : null;
  }

  if (!field) {
    showToast(
      `Put the cursor in a text box first, then press ${boundShortcut(DICTATION_SHORTCUT_KEY)} to dictate.`,
      5000,
      { force: true }
    );
    return false;
  }

  stt_activeField = field;

  // With the button on screen, drive the button so its state, tooltip and status bar stay true.
  if (stt_micButton) {
    if (stt_micButton.state !== 'idle') {
      stt_micButton.stopRecording();
    } else {
      stt_micButton.show(field);
      stt_micButton.startRecording();
    }
    return true;
  }

  // Button turned off: the controller is driven directly, and the toast carries the state.
  if (stt_controller.isRecording || stt_controller.isStarting) {
    stt_controller.stopListening();
    showToast('Voice typing stopped.', 4000, { force: true });
  } else {
    // Asked first, so the toast does not say the microphone is coming while a question is open.
    allowDictation({ returnFocus: frameHolding(field) || field }).then(allowed => {
      if (!allowed) {
        showToast(
          'Nothing was recorded or sent. Press the voice typing shortcut to be asked again.',
          6000,
          { force: true }
        );
        return;
      }
      showToast('Starting voice typing - waiting for the microphone...', 5000, { force: true });
      stt_controller.startListening(field);
    });
  }
  return true;
}

/**
 * Bind the dictation shortcut for as long as voice typing is on.
 *
 * The binding comes from the shortcut registry, so a student who remapped it in the popup gets
 * the key they chose (the registry re-binds on that settings change, and the editor-iframe path
 * asks it for the current key), and clearing it there turns the shortcut off rather than leaving
 * a key this feature quietly swallows. Capture phase, because a rich editor (Google Docs) stops
 * keydown before it reaches the document and dictation has to work in that field above all.
 *
 * @returns {Promise<void>}
 */
async function stt_registerDictationShortcut() {
  await registerShortcut(DICTATION_SHORTCUT_KEY, () => stt_toggleDictation(), { capture: true });
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
          // Only here does anything say "Recording" — the button said "starting" until now.
          stt_micButton.updateState({ isRecording: true });
        } else {
          showToast('Voice typing is on. Speak now.', 4000, { force: true });
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
        console.log('[STT] Result:', text?.length ?? 0, 'characters');
        debugLog('[STT] Result text:', text);
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
        // The controller already turns every engine code into a plain sentence, so this is safe
        // to show as it stands. It is shown ONCE: showError only resets the button.
        console.error('[STT] Error:', error.message);
        showToast(error.message, ERROR_TOAST_MS, { force: true });
        if (stt_micButton) {
          stt_micButton.showError(error.message);
        }
      },
    });

    // Create microphone button if enabled
    console.log('[STT] floatingButton setting:', stt_settings.floatingButton);
    if (stt_settings.floatingButton) {
      stt_createMicButton();
    }

    await stt_registerDictationShortcut();
    // Voice typing may have been turned off while the shortcut was being read, after cleanup
    // had already run, so the key registered just now must go again.
    if (stt_enabled) {
      stt_watchEditorFrames();
    } else {
      unregisterShortcut(DICTATION_SHORTCUT_KEY);
    }

    console.log('[STT] Initialized successfully! stt_micButton:', !!stt_micButton);
  } catch (error) {
    console.error('[STT] INITIALIZATION FAILED:', error);
    showToast(
      'Voice typing could not start. Please reload the page and try again.',
      ERROR_TOAST_MS,
      {
        force: true,
      }
    );
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
  unregisterShortcut(DICTATION_SHORTCUT_KEY);
  stt_stopEditorFrames?.();
  stt_stopEditorFrames = null;

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
  stt_activeFrame = null;
  console.log('[STT] Cleanup complete');
}

/**
 * Make a field the one dictation serves, and show the microphone beside it.
 * @param {HTMLElement} field - The text input element (or an editor iframe's body)
 * @param {HTMLIFrameElement|null} [frame] - The editor iframe holding the field, if any
 */
function stt_showMicForField(field, frame = null) {
  stt_activeField = field;
  stt_activeFrame = frame;
  if (stt_micButton) {
    stt_micButton.show(field);
    return;
  }
  // Not an error: "Show Microphone Button" can be off, and dictation is then reached with the
  // keyboard shortcut instead.
  console.log(`[STT] Floating button off; dictate with ${boundShortcut(DICTATION_SHORTCUT_KEY)}`);
}

/**
 * Serve the rich-text editors that live in their own iframe (Canvas's Rich Content Editor).
 *
 * The content script injects nothing into such an editor's document, and focus and keys inside it
 * never reach this page's listeners, so the page listens to the editor's document instead: focus
 * there brings the microphone to the iframe, and the dictation shortcut works with the caret in
 * the essay. Only listeners are added to the editor's document, never nodes.
 */
function stt_watchEditorFrames() {
  stt_stopEditorFrames?.();
  stt_stopEditorFrames = watchEditorFrames({
    onFocus: (body, frame) => {
      if (stt_enabled) {
        stt_showMicForField(body, frame);
      }
    },
    onKeydown: (event, body, frame) => {
      const shortcut = boundShortcut(DICTATION_SHORTCUT_KEY);
      if (!stt_enabled || !shortcut || !matchesShortcut(event, shortcut)) {
        return;
      }
      // As the page's own shortcut handler does, so the editor does not also act on the key.
      event.preventDefault();
      event.stopPropagation();
      stt_activeField = body;
      stt_activeFrame = frame;
      stt_toggleDictation();
    },
    onGone: frame => {
      if (frame !== stt_activeFrame) {
        return;
      }
      // The editor was taken off the page (a route change, a remount): nothing may go on being
      // typed into a document the student can no longer see.
      if (stt_micButton) {
        if (stt_micButton.state !== 'idle') {
          stt_micButton.stopRecording();
        }
        stt_micButton.hide();
      } else if (stt_controller && (stt_controller.isRecording || stt_controller.isStarting)) {
        stt_controller.stopListening();
      }
      stt_activeField = null;
      stt_activeFrame = null;
    },
  });
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

  // Listen for focus on text fields
  document.addEventListener(
    'focusin',
    e => {
      if (stt_enabled && isTextInput(e.target)) {
        stt_showMicForField(e.target);
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
        stt_showMicForField(editorArea);
        return;
      }

      // Check if click is on the active field or inside it
      const clickedOnField =
        stt_activeField && (e.target === stt_activeField || stt_activeField.contains(e.target));

      // Hide button when clicking outside both field and button
      const dictating = stt_controller?.isRecording || stt_controller?.isStarting;
      if (!clickedOnField && stt_activeField && !dictating) {
        stt_micButton.hide();
        stt_activeField = null;
        stt_activeFrame = null;
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
  console.log('[STT] applySettings() called, isInit:', isInit);

  const wasEnabled = stt_enabled;
  const newEnabled = settings.enabled || false;
  const hadFloatingButton = stt_settings.floatingButton;

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

    // "Show Microphone Button" takes effect on the page that is already open.
    if (hadFloatingButton !== stt_settings.floatingButton) {
      if (stt_settings.floatingButton) {
        stt_createMicButton();
        if (stt_activeField) {
          stt_micButton.show(stt_activeField);
        }
      } else {
        stt_removeMicButton();
      }
    }
  }

  console.log(`[STT] Settings ${isInit ? 'loaded' : 'changed'}:`, newEnabled);
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
