/**
 * Reduced Motion Feature Module
 *
 * Provides a reduced motion mode for users who are sensitive to animations
 * and transitions. This feature is critical for users with vestibular disorders,
 * ADHD, autism spectrum conditions, or photosensitive epilepsy.
 *
 * WCAG Compliance: WCAG 2.1 SC 2.3.3 (Animation from Interactions)
 * - Respects prefers-reduced-motion media query
 * - Disables all CSS animations and transitions
 * - Prevents autoplaying of animated content
 *
 * @module reducedMotion
 * @version 1.0.0
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

/** @type {boolean} Tracks whether reduced motion is currently enabled */
let reducedMotion_enabled = false;

/** @type {HTMLStyleElement|null} Reference to the injected style element */
let reducedMotion_styleElement = null;

/**
 * Generates CSS to disable all animations and transitions.
 *
 * The CSS uses high specificity and !important to override site styles.
 * It targets:
 * - All animation properties
 * - All transition properties
 * - Scroll behavior
 * - GIF playback (via animation-play-state)
 *
 * @function reducedMotion_generateCSS
 * @returns {string} CSS rules to disable motion
 */
function reducedMotion_generateCSS() {
  return `
    /* Reduced Motion - WCAG 2.1 SC 2.3.3 Compliant */
    /* Disables all animations and transitions for sensory comfort */

    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }

    /* Stop marquee elements */
    marquee {
      -moz-binding: none !important;
      animation: none !important;
    }

    /* Disable smooth scrolling */
    html {
      scroll-behavior: auto !important;
    }

    /* Pause animated images - forces single frame display */
    img[src$=".gif"],
    img[src*=".gif?"] {
      animation-play-state: paused !important;
    }

    /* Disable CSS scroll snap animations */
    * {
      scroll-snap-type: none !important;
    }

    /* Disable perspective transforms that can cause motion sickness */
    .assist-reduced-motion-aggressive * {
      transform: none !important;
      perspective: none !important;
    }
  `;
}

/**
 * Applies reduced motion CSS to the page.
 *
 * Creates a style element with high-priority CSS rules that disable
 * all animations and transitions site-wide.
 *
 * @function reducedMotion_apply
 * @returns {void}
 */
function reducedMotion_apply() {
  if (reducedMotion_styleElement) {
    return; // Already applied
  }

  reducedMotion_styleElement = document.createElement('style');
  reducedMotion_styleElement.id = 'assist-reduced-motion';
  reducedMotion_styleElement.textContent = reducedMotion_generateCSS();
  document.head.appendChild(reducedMotion_styleElement);

  console.log('[ReducedMotion] CSS applied');
}

/**
 * Removes reduced motion CSS from the page.
 *
 * Cleanly removes the style element, restoring original animations.
 *
 * @function reducedMotion_remove
 * @returns {void}
 */
function reducedMotion_remove() {
  if (reducedMotion_styleElement) {
    reducedMotion_styleElement.remove();
    reducedMotion_styleElement = null;
    console.log('[ReducedMotion] CSS removed');
  }
}

/**
 * Enables the reduced motion feature.
 *
 * Sets the enabled flag and applies the CSS rules.
 * Displays a toast notification to confirm the action.
 *
 * @function reducedMotion_enable
 * @returns {void}
 */
function reducedMotion_enable() {
  reducedMotion_enabled = true;
  reducedMotion_apply();
  showToast('🛑 Reduced Motion enabled - animations disabled');
  console.log('[ReducedMotion] Enabled');
}

/**
 * Disables the reduced motion feature.
 *
 * Clears the enabled flag and removes the CSS rules.
 * Displays a toast notification to confirm the action.
 *
 * @function reducedMotion_disable
 * @returns {void}
 */
function reducedMotion_disable() {
  reducedMotion_enabled = false;
  reducedMotion_remove();
  showToast('Reduced Motion disabled - animations restored');
  console.log('[ReducedMotion] Disabled');
}

/**
 * Checks if the user has system-level reduced motion preference.
 *
 * @function reducedMotion_systemPreference
 * @returns {boolean} True if user prefers reduced motion at OS level
 */
function reducedMotion_systemPreference() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** @type {Object} Default settings for reduced motion */
const DEFAULT_SETTINGS = {
  enabled: false,
  respectSystemPreference: true,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = reducedMotion_enabled;

  // If respectSystemPreference is enabled and system prefers reduced motion, auto-enable
  let shouldEnable = settings.enabled || false;
  if (settings.respectSystemPreference && reducedMotion_systemPreference()) {
    shouldEnable = true;
  }

  // Handle enable/disable
  if (shouldEnable && !wasEnabled) {
    reducedMotion_enable();
  } else if (!shouldEnable && wasEnabled) {
    reducedMotion_disable();
  }

  console.log(
    `[ReducedMotion] Settings ${isInit ? 'loaded' : 'updated'}:`,
    shouldEnable,
    'systemPreference:',
    reducedMotion_systemPreference()
  );
}

/**
 * Initialize reduced motion using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'reducedMotion',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

// Listen for changes to system reduced motion preference
const reducedMotionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
reducedMotionMediaQuery.addEventListener('change', () => {
  // Re-apply settings when system preference changes
  chrome.storage.local.get('assist_settings', result => {
    const settings = result.assist_settings?.reducedMotion || DEFAULT_SETTINGS;
    if (settings.respectSystemPreference) {
      applySettings(settings, false);
    }
  });
});

export { reducedMotion_enable };
export { reducedMotion_disable };
export { reducedMotion_apply };
export { reducedMotion_remove };
export { reducedMotion_systemPreference };
