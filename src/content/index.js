/**
 * AssisT Content Script - Main Orchestrator
 * Initializes all features in a modular way
 *
 * REFACTORING NOTE: This is the new modular entry point.
 * Features are being gradually extracted from content-simple.js
 * into separate modules for better maintainability.
 */

// Import modular features (as they are extracted)
import { tts_initialize, tts_getState } from './features/tts.js';

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

    // TTS Feature (fully extracted)
    initPromises.push(
      tts_initialize().catch(err => {
        console.error('[AssisT] TTS initialization error:', err);
      })
    );

    // TODO: Add other features as they are extracted:
    // initPromises.push(textCustomization_initialize());
    // initPromises.push(readingGuide_initialize());
    // initPromises.push(focusMode_initialize());
    // initPromises.push(screenOverlay_initialize());
    // initPromises.push(dyslexia_initialize());
    // initPromises.push(stt_initialize());
    // initPromises.push(canvas_initialize());
    // initPromises.push(moodle_initialize());
    // initPromises.push(googleClassroom_initialize());

    // Wait for all features to initialize
    await Promise.all(initPromises);

    console.log('[AssisT] All features initialized successfully');

    // Debug: Log TTS state
    console.log('[AssisT] TTS State:', tts_getState());
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
