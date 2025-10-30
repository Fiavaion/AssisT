/**
 * @fileoverview [FEATURE NAME] - [Brief Description]
 *
 * INSTRUCTIONS:
 * 1. Copy this file to src/features/yourFeature/yourFeature.js
 * 2. Replace [FEATURE_NAME] with your feature name (e.g., "autoBookmarks")
 * 3. Replace [FeatureName] with display name (e.g., "Auto Bookmarks")
 * 4. Implement your feature logic
 * 5. Import in content-simple.js
 * 6. Build and test
 *
 * @module features/[featureName]
 * @requires core/ui/toast (if you need notifications)
 */

// Import utilities if needed
// import { showToast } from '../../core/ui/toast.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/**
 * Feature enabled flag
 * @type {boolean}
 */
let [featureName]_enabled = false;

/**
 * Feature-specific settings
 * @type {Object}
 */
let [featureName]_settings = {
  // Add your feature-specific settings here
  exampleSetting: true,
  exampleValue: 100,
};

/**
 * Feature-specific state (if needed)
 * @type {any}
 */
let [featureName]_state = null;

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Initialize [FeatureName] feature
 *
 * This function is called when:
 * 1. Extension loads and feature is enabled in settings
 * 2. User enables feature in popup (real-time)
 *
 * @returns {void}
 */
function [featureName]_initialize() {
  if (![featureName]_enabled) {
    console.log('[FeatureName] Not enabled, skipping initialization');
    return;
  }

  console.log('[FeatureName] Initializing...');

  // TODO: Add your initialization logic here
  // Examples:
  // - Set up event listeners
  // - Create UI elements
  // - Start timers/intervals
  // - Initialize feature state

  // Example: Add event listener
  // document.addEventListener('click', [featureName]_handleClick);

  // Example: Create UI
  // [featureName]_createUI();

  console.log('[FeatureName] Initialized successfully');

  // Optional: Show toast notification
  // showToast('✅ [FeatureName] enabled');
}

/**
 * Cleanup [FeatureName] feature
 *
 * This function is called when:
 * 1. User disables feature in popup
 * 2. Feature needs to be reinitialized (settings changed)
 *
 * IMPORTANT: Always clean up properly to prevent memory leaks!
 *
 * @returns {void}
 */
function [featureName]_cleanup() {
  console.log('[FeatureName] Cleaning up...');

  // TODO: Remove event listeners
  // document.removeEventListener('click', [featureName]_handleClick);

  // TODO: Remove UI elements
  // [featureName]_removeUI();

  // TODO: Clear timers/intervals
  // if ([featureName]_state?.interval) {
  //   clearInterval([featureName]_state.interval);
  // }

  // TODO: Reset state
  [featureName]_state = null;

  console.log('[FeatureName] Cleanup complete');
}

/**
 * Apply feature settings
 *
 * This function is called when settings change while feature is enabled
 *
 * @param {Object} newSettings - New settings from Chrome storage
 * @returns {void}
 */
function [featureName]_applySettings(newSettings) {
  console.log('[FeatureName] Applying new settings:', newSettings);

  // Update local settings
  [featureName]_settings = {
    ...[featureName]_settings,
    ...newSettings
  };

  // TODO: Apply settings changes
  // Example: Update UI based on new settings
  // [featureName]_updateUI();
}

// ============================================================
// FEATURE-SPECIFIC FUNCTIONS
// ============================================================

/**
 * Example: Handle click events
 * @param {MouseEvent} e - Click event
 * @private
 */
function [featureName]_handleClick(e) {
  if (![featureName]_enabled) return;

  // Your click handling logic
  console.log('[FeatureName] Click detected');
}

/**
 * Example: Create UI elements
 * @private
 */
function [featureName]_createUI() {
  // Create and append UI elements
  console.log('[FeatureName] Creating UI');
}

/**
 * Example: Remove UI elements
 * @private
 */
function [featureName]_removeUI() {
  // Remove UI elements
  console.log('[FeatureName] Removing UI');
}

// ============================================================
// CHROME STORAGE INTEGRATION
// ============================================================

/**
 * Load initial settings from Chrome storage
 * This runs once when the extension loads
 */
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.[featureName]) {
    const storedSettings = result.assist_settings.[featureName];

    // Load enabled state
    [featureName]_enabled = storedSettings.enabled || false;

    // Load feature settings
    [featureName]_settings = {
      ...[featureName]_settings,
      ...storedSettings
    };

    // Initialize if enabled
    if ([featureName]_enabled) {
      [featureName]_initialize();
    }

    console.log('[FeatureName] Settings loaded:', {
      enabled: [featureName]_enabled,
      settings: [featureName]_settings
    });
  } else {
    console.log('[FeatureName] No settings found, using defaults');
  }
});

/**
 * Listen for settings changes (real-time updates)
 * This handles enable/disable toggle and settings changes from popup
 */
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.[featureName]) {
    const newSettings = changes.assist_settings.newValue.[featureName];
    const wasEnabled = [featureName]_enabled;
    const newEnabled = newSettings.enabled || false;

    console.log('[FeatureName] Settings changed:', {
      wasEnabled,
      newEnabled,
      newSettings
    });

    // Handle enable/disable transitions
    if (newEnabled && !wasEnabled) {
      // Feature was just enabled
      [featureName]_enabled = true;
      [featureName]_applySettings(newSettings);
      [featureName]_initialize();
      console.log('[FeatureName] Enabled');

    } else if (!newEnabled && wasEnabled) {
      // Feature was just disabled
      [featureName]_enabled = false;
      [featureName]_cleanup();
      console.log('[FeatureName] Disabled');

    } else if (newEnabled && wasEnabled) {
      // Feature stayed enabled but settings changed
      [featureName]_applySettings(newSettings);
      console.log('[FeatureName] Settings updated');
    }
  }
});

// ============================================================
// EXPORTS
// ============================================================

/**
 * Export functions that other modules might need
 * (Usually not needed for self-contained features)
 */
export {
  [featureName]_initialize,
  [featureName]_cleanup,
  // Add other exports if needed
};

// ============================================================
// USAGE INSTRUCTIONS
// ============================================================

/*
To use this template:

1. COPY THIS FILE:
   cp src/features/_TEMPLATE_FEATURE.js src/features/myFeature/myFeature.js

2. FIND AND REPLACE:
   - [featureName] → myFeature (camelCase)
   - [FeatureName] → My Feature (display name)
   - [FEATURE_NAME] → MY_FEATURE (constants)

3. IMPLEMENT YOUR LOGIC:
   - Add feature-specific code in marked sections
   - Implement initialize(), cleanup(), and applySettings()

4. IMPORT IN content-simple.js:
   import '../features/myFeature/myFeature.js';

5. ADD SETTINGS TO popup.html:
   Add toggle and settings UI for your feature

6. BUILD AND TEST:
   npx vite build
   Test in Chrome at chrome://extensions/

7. COMMIT:
   git add -A
   git commit -m "feat(myFeature): add new feature"
   git push

SAFETY CHECKLIST:
✅ Feature is self-contained (doesn't modify global state)
✅ Cleanup function removes all event listeners
✅ Chrome storage listeners handle real-time updates
✅ Console logs help debugging
✅ Follows existing code patterns

COMMON PATTERNS TO FOLLOW:
- Use [featureName]_ prefix for all functions/variables
- Log to console with [FeatureName] prefix
- Clean up properly in cleanup() function
- Handle enable/disable in storage listener
- Don't modify the settings object from content-simple.js
- Don't modify the readText function

NEED HELP?
- See docs/FEATURE_DEVELOPMENT_GUIDE.md
- Look at existing features: focusMode.js, readingGuide.js
- Check canvas.js for LMS integration pattern
*/
