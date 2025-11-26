/**
 * AssisT Content Script - Main Orchestrator
 * Initializes all features in a modular way
 */

// Import all features
import { tts_initialize, tts_getState } from './features/tts.js';
import { dyslexia_initialize, dyslexia_getState } from './features/dyslexia.js';
import {
  textCustomization_initialize,
  textCustomization_getState,
} from './features/text-customization.js';
import {
  readingGuide_initialize,
  readingGuide_getState,
  readingGuide_disable,
  readingGuide_setFocusModeRef,
} from './features/reading-guide.js';
import {
  focusMode_initialize,
  focusMode_getState,
  focusMode_disable,
  focusMode_setReadingGuideRef,
} from './features/focus-mode.js';
import { screenOverlay_initialize, screenOverlay_getState } from './features/screen-overlay.js';
import { stt_initialize, stt_getState } from './features/stt.js';
import { canvas_initialize, canvas_getState } from './lms/canvas.js';
import { moodle_initialize, moodle_getState } from './lms/moodle.js';
import { googleClassroom_initialize, googleClassroom_getState } from './lms/google-classroom.js';

// Import utilities
import { getSettings } from './utils/storage-utils.js';

console.log('[AssisT] Content script initializing (modular version)...');

/**
 * Main initialization function
 * Initializes all features in parallel for performance
 */
async function initializeAllFeatures() {
  console.log('[AssisT] Starting feature initialization...');

  try {
    // Get settings to check which features are enabled
    const settings = await getSettings();
    console.log('[AssisT] Settings loaded:', settings);

    // Initialize features in parallel
    const initPromises = [];

    // Core Features
    initPromises.push(
      tts_initialize().catch(err => {
        console.error('[AssisT] TTS initialization error:', err);
      })
    );

    initPromises.push(
      dyslexia_initialize().catch(err => {
        console.error('[AssisT] Dyslexia Mode initialization error:', err);
      })
    );

    initPromises.push(
      textCustomization_initialize().catch(err => {
        console.error('[AssisT] Text Customization initialization error:', err);
      })
    );

    initPromises.push(
      readingGuide_initialize().catch(err => {
        console.error('[AssisT] Reading Guide initialization error:', err);
      })
    );

    initPromises.push(
      focusMode_initialize().catch(err => {
        console.error('[AssisT] Focus Mode initialization error:', err);
      })
    );

    initPromises.push(
      screenOverlay_initialize().catch(err => {
        console.error('[AssisT] Screen Overlay initialization error:', err);
      })
    );

    initPromises.push(
      stt_initialize().catch(err => {
        console.error('[AssisT] STT initialization error:', err);
      })
    );

    // LMS Integrations
    initPromises.push(
      canvas_initialize().catch(err => {
        console.error('[AssisT] Canvas initialization error:', err);
      })
    );

    initPromises.push(
      moodle_initialize().catch(err => {
        console.error('[AssisT] Moodle initialization error:', err);
      })
    );

    initPromises.push(
      googleClassroom_initialize().catch(err => {
        console.error('[AssisT] Google Classroom initialization error:', err);
      })
    );

    // Wait for all features to initialize
    await Promise.all(initPromises);

    // Setup mutual exclusivity between Reading Guide and Focus Mode
    const readingGuideState = readingGuide_getState();
    const focusModeState = focusMode_getState();

    readingGuide_setFocusModeRef(focusModeState.enabled, focusMode_disable);
    focusMode_setReadingGuideRef(readingGuideState.enabled, readingGuide_disable);

    console.log('[AssisT] All features initialized successfully');

    // Debug: Log all states
    console.log('[AssisT] Feature States:', {
      tts: tts_getState(),
      dyslexia: dyslexia_getState(),
      textCustomization: textCustomization_getState(),
      readingGuide: readingGuide_getState(),
      focusMode: focusMode_getState(),
      screenOverlay: screenOverlay_getState(),
      stt: stt_getState(),
      canvas: canvas_getState(),
      moodle: moodle_getState(),
      googleClassroom: googleClassroom_getState(),
    });
  } catch (error) {
    console.error('[AssisT] Initialization error:', error);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAllFeatures);
} else {
  initializeAllFeatures();
}

// Export for testing
export { initializeAllFeatures };

// Log ready message
console.log('[AssisT] Ready! Click any paragraph to read it.');
