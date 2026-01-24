/**
 * STT (Speech-to-Text) Feature
 * Voice input for text fields with floating microphone button
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';
import { isTextInput } from '../../features/stt/validation.js';

// STT State (Feature Isolated)
let stt_enabled = false;
let stt_controller = null;
let stt_micButton = null;
let stt_activeField = null;
const stt_settings = {
  continuous: true,
  interimResults: true,
  language: 'en-US',
  autoCapitalize: true,
  punctuationCommands: true,
  floatingButton: true,
};

/**
 * Dynamic import STT controller and mic button
 * TEMPORARILY DISABLED: Dynamic imports don't work in bundled code
 */
async function stt_loadModules() {
  console.warn('[STT] Feature temporarily disabled - needs module bundling refactor');
  return null;

  // try {
  //   const [STTModule, MicButtonModule] = await Promise.all([
  //     import(chrome.runtime.getURL('src/engines/stt/stt-controller.js')),
  //     import(chrome.runtime.getURL('src/ui/components/microphone-button.js')),
  //   ]);
  //   return {
  //     STTController: STTModule.STTController,
  //     MicrophoneButton: MicButtonModule.MicrophoneButton,
  //   };
  // } catch (error) {
  //   console.error('[STT] Failed to load modules:', error);
  //   return null;
  // }
}

// Check if element is a text input field
// EXTRACTED: See src/features/stt/validation.js - isTextInput()

/**
 * Set up listeners for text field focus
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

  // Listen for focusout
  document.addEventListener(
    'focusout',
    e => {
      if (stt_activeField === e.target && stt_micButton) {
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

/**
 * Initialize STT controller
 */
async function stt_setup() {
  if (!stt_enabled) {
    return;
  }

  const modules = await stt_loadModules();
  if (!modules) {
    showToast('⚠️ STT failed to load');
    return;
  }

  // Create STT controller
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
    },
    onInterimResult: text => {
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
 * Cleanup STT
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

/**
 * Handle settings changes
 */
function stt_handleSettingsChange(newSettings) {
  if (!newSettings.stt) {
    return;
  }

  const sttSettings = newSettings.stt;
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
    stt_setup();
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

/**
 * Initialize STT feature
 */
export async function stt_initialize() {
  console.log('[STT] Initializing...');

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.stt) {
    const sttSettings = allSettings.stt;
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
      await stt_setup();
    }

    console.log('[STT] Settings loaded:', stt_enabled, stt_settings);
  } else {
    console.log('[STT] Feature disabled by default');
  }

  // Listen for settings changes
  onSettingsChange(stt_handleSettingsChange);

  console.log('[STT] Initialized');
}

/**
 * Get STT state for debugging
 */
export function stt_getState() {
  return {
    enabled: stt_enabled,
    recording: stt_controller?.isRecording || false,
    activeField: stt_activeField,
    settings: stt_settings,
  };
}
