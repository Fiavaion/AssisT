/**
 * @fileoverview Canvas LMS Integration Module
 * @description Provides seamless integration with Canvas LMS, enabling
 * TTS functionality for assignment content with floating action button (FAB)
 * interface. Dynamically loads Canvas adapter and initializes features based
 * on detected page type.
 *
 * @module features/lms/canvas
 * @requires core/ui/toast
 * @requires chrome.storage API
 * @requires chrome.runtime API
 */

import { showToast } from '../../core/ui/toast.js';

/**
 * Global state for Canvas integration
 */

/**
 * Indicates whether Canvas integration is enabled via settings
 * @type {boolean}
 */
export let canvas_enabled = false;

/**
 * Reference to the floating action button (FAB) element on Canvas pages
 * @type {HTMLElement|null}
 */
export let canvas_fabElement = null;

/**
 * Dynamically loaded Canvas adapter module
 * @type {Object|null}
 */
let CanvasAdapter = null;

/**
 * Reference to the TTS readText function from content-simple.js
 * @type {Function|null}
 */
let readTextFunction = null;

/**
 * Reference to the settings object from content-simple.js
 * @type {Object|null}
 */
let settingsObject = null;

/**
 * Dynamically loads the Canvas adapter module
 * @async
 * @function canvas_loadAdapter
 * @returns {Promise<Object|null>} The loaded Canvas adapter module or null on failure
 * @description Lazy-loads the Canvas adapter only when Canvas integration is enabled.
 * Caches the adapter after first load to avoid repeated imports.
 */
export async function canvas_loadAdapter() {
  if (!CanvasAdapter) {
    try {
      CanvasAdapter = await import(chrome.runtime.getURL('adapters/canvas-adapter.js'));
      console.log('[Canvas] Adapter loaded');
    } catch (error) {
      console.error('[Canvas] Failed to load adapter:', error);
    }
  }
  return CanvasAdapter;
}

/**
 * Initializes Canvas-specific features based on detected page type
 * @async
 * @function canvas_initialize
 * @returns {Promise<void>}
 * @description Main initialization function that:
 * 1. Verifies Canvas integration is enabled
 * 2. Loads the Canvas adapter
 * 3. Detects the current Canvas page type
 * 4. Waits for Canvas content to load
 * 5. Initializes appropriate features (e.g., Assignment Reader)
 */
export async function canvas_initialize() {
  if (!canvas_enabled) {
    return;
  }

  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return;
  }

  // Check if on Canvas page
  if (!adapter.isCanvasPage()) {
    console.log('[Canvas] Not a Canvas page, skipping');
    return;
  }

  const pageType = adapter.detectCanvasPageType();
  console.log('[Canvas] Page type detected:', pageType);

  // Wait for content to load
  await adapter.waitForCanvasContent();

  // Initialize features based on page type
  if (pageType === adapter.CanvasPageType.ASSIGNMENT) {
    canvas_initializeAssignmentReader();
  }
}

/**
 * Initializes the Assignment Reader feature with FAB interface
 * @async
 * @function canvas_initializeAssignmentReader
 * @returns {Promise<void>}
 * @description Creates a floating action button (FAB) on Canvas assignment pages
 * that allows students to trigger TTS reading of the assignment content.
 * The FAB is positioned in the bottom-right corner and displays "Read Assignment".
 */
export async function canvas_initializeAssignmentReader() {
  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return;
  }

  // Extract assignment content
  const assignment = adapter.extractAssignmentContent();
  if (!assignment) {
    console.log('[Canvas] No assignment content found');
    return;
  }

  console.log('[Canvas] Assignment detected:', assignment.title);

  // Create FAB button
  canvas_fabElement = adapter.createCanvasFAB({
    text: 'Read Assignment',
    icon: '📖',
    onClick: () => canvas_readAssignment(assignment),
    position: 'bottom-right',
  });

  document.body.appendChild(canvas_fabElement);
  console.log('[Canvas] Assignment Reader initialized');
}

/**
 * Reads assignment content using TTS functionality
 * @function canvas_readAssignment
 * @param {Object} assignment - Assignment data extracted from Canvas page
 * @param {string} assignment.title - Title of the assignment
 * @param {string} assignment.text - Main content text of the assignment
 * @param {HTMLElement} assignment.element - DOM element containing the assignment
 * @returns {void}
 * @description Combines assignment title and content into full text and triggers
 * TTS reading with synchronized highlighting. Validates that TTS is enabled before
 * attempting to read.
 */
export function canvas_readAssignment(assignment) {
  if (!settingsObject || !settingsObject.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[Canvas] Reading assignment:', assignment.title);
  showToast('📖 Reading: ' + assignment.title);

  // Read title first
  const titleText = assignment.title;
  const contentText = assignment.text;
  const fullText = titleText + '. ' + contentText;

  // Use existing TTS functionality
  if (readTextFunction) {
    readTextFunction(fullText, assignment.element);
  } else {
    console.error('[Canvas] readText function not initialized');
  }
}

/**
 * Removes the Canvas FAB from the page
 * @function canvas_removeFAB
 * @returns {void}
 * @description Cleanup function that removes the floating action button
 * from the DOM when Canvas integration is disabled.
 */
export function canvas_removeFAB() {
  if (canvas_fabElement) {
    canvas_fabElement.remove();
    canvas_fabElement = null;
  }
}

/**
 * Initializes the Canvas module with required dependencies
 * @function initializeCanvasModule
 * @param {Function} readText - The TTS readText function from content-simple.js
 * @param {Object} settings - The settings object from content-simple.js
 * @returns {void}
 * @description Must be called by content-simple.js to provide necessary dependencies
 * before Canvas features can be used.
 */
export function initializeCanvasModule(readText, settings) {
  readTextFunction = readText;
  settingsObject = settings;
  console.log('[Canvas] Module initialized with dependencies');
}

/**
 * Chrome Storage initialization
 * @description Loads Canvas integration settings from chrome.storage.local
 * and initializes features if enabled
 */
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.canvasIntegration) {
    const ciSettings = result.assist_settings.canvasIntegration;
    canvas_enabled = ciSettings.enabled || false;

    if (canvas_enabled) {
      canvas_initialize();
    }

    console.log('[Canvas] Settings loaded:', canvas_enabled);
  } else {
    console.log('[Canvas] Integration disabled by default');
  }
});

/**
 * Chrome Storage change listener
 * @description Listens for changes to Canvas integration settings and
 * dynamically enables/disables features without requiring page reload
 */
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.canvasIntegration) {
    const ciSettings = changes.assist_settings.newValue.canvasIntegration;
    const newEnabled = ciSettings.enabled || false;

    if (newEnabled && !canvas_enabled) {
      canvas_enabled = true;
      canvas_initialize();
      showToast('🎓 Canvas Integration enabled');
    } else if (!newEnabled && canvas_enabled) {
      canvas_enabled = false;
      canvas_removeFAB();
      showToast('Canvas Integration disabled');
    }

    console.log('[Canvas] Settings updated:', newEnabled);
  }
});
