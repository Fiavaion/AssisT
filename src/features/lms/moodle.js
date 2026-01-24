/**
 * @fileoverview Moodle LMS Integration Feature Module
 * @module features/lms/moodle
 * @version 1.1.0
 * @description Provides integration with Moodle LMS including assignment, forum, and page readers
 * with floating action button (FAB) UI for content accessibility.
 *
 * @features
 * - Dynamic adapter loading for Moodle-specific DOM selectors
 * - Assignment content reader with TTS support
 * - Forum post reader with multi-post handling
 * - Page resource reader for text content
 * - FAB (Floating Action Button) UI for triggering read actions
 * - Chrome storage integration for settings persistence
 * - Auto-initialization based on page detection
 *
 * @architecture
 * - Self-initializing module with Chrome storage listeners
 * - Lazy-loads MoodleAdapter only when on Moodle pages
 * - Integrates with core TTS (readText) and UI (showToast) modules
 *
 * @accessibility
 * - Supports WCAG 2.2 AA compliance through TTS integration
 * - Provides alternative access to educational content for neurodivergent students
 *
 * @security
 * - FERPA compliant (no data storage, client-side only)
 * - Uses Chrome Extension isolated world for DOM injection
 *
 * @since Sprint 9
 */

// === IMPORTS ===
import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// === MODULE STATE ===

/**
 * Moodle integration enabled state
 * @type {boolean}
 * @private
 */
let moodle_enabled = false;

/**
 * Reference to the current Moodle FAB element
 * @type {HTMLElement|null}
 * @private
 */
let moodle_fabElement = null;

/**
 * Dynamically imported Moodle Adapter module
 * @type {Object|null}
 * @private
 */
let MoodleAdapter = null;

/**
 * Reference to the global settings object from content-simple.js
 * This is accessed via window scope to avoid circular dependencies
 * @type {Object}
 * @private
 */
let settings = null;

/**
 * Reference to the readText function from content-simple.js
 * This is accessed via window scope to avoid circular dependencies
 * @type {Function}
 * @private
 */
let readText = null;

// === ADAPTER LOADING ===

/**
 * Dynamically loads the Moodle Adapter module
 * @async
 * @function moodle_loadAdapter
 * @returns {Promise<Object|null>} The loaded MoodleAdapter module or null on failure
 * @description Lazy-loads the Moodle adapter only when needed to reduce initial bundle size
 */
export async function moodle_loadAdapter() {
  if (!MoodleAdapter) {
    try {
      MoodleAdapter = await import(chrome.runtime.getURL('src/adapters/moodle-adapter.js'));
      console.log('[Moodle] Adapter loaded');
    } catch (error) {
      console.error('[Moodle] Failed to load adapter:', error);
    }
  }
  return MoodleAdapter;
}

// === INITIALIZATION ===

/**
 * Initialize Moodle features based on detected page type
 * @async
 * @function moodle_initialize
 * @description
 * - Checks if Moodle integration is enabled
 * - Loads the Moodle adapter
 * - Detects the current Moodle page type (assignment, forum, page)
 * - Initializes appropriate reader features with FAB buttons
 * @fires moodle_initializeAssignmentReader
 * @fires moodle_initializeForumReader
 * @fires moodle_initializePageReader
 */
export async function moodle_initialize() {
  if (!moodle_enabled) {
    return;
  }

  const adapter = await moodle_loadAdapter();
  if (!adapter) {
    return;
  }

  // Check if on Moodle page
  if (!adapter.isMoodlePage()) {
    console.log('[Moodle] Not a Moodle page, skipping');
    return;
  }

  const pageType = adapter.detectMoodlePageType();
  console.log('[Moodle] Page type detected:', pageType);

  // Wait for content to load
  await adapter.waitForMoodleContent();

  // Initialize features based on page type
  if (pageType === adapter.MoodlePageType.ASSIGNMENT) {
    moodle_initializeAssignmentReader();
  } else if (pageType === adapter.MoodlePageType.FORUM) {
    moodle_initializeForumReader();
  } else if (pageType === adapter.MoodlePageType.PAGE) {
    moodle_initializePageReader();
  }
}

// === FEATURE INITIALIZERS ===

/**
 * Initialize Assignment Reader feature
 * @async
 * @function moodle_initializeAssignmentReader
 * @description
 * - Extracts assignment content (title, description, instructions)
 * - Creates a FAB button with "Read Assignment" text
 * - Appends FAB to DOM for user interaction
 * @listens click - Triggers moodle_readContent with assignment data
 */
export async function moodle_initializeAssignmentReader() {
  const adapter = await moodle_loadAdapter();
  if (!adapter) {
    return;
  }

  const assignment = adapter.extractAssignmentContent();
  if (!assignment) {
    console.log('[Moodle] No assignment content found');
    return;
  }

  console.log('[Moodle] Assignment detected:', assignment.title);

  // Create FAB button
  moodle_fabElement = adapter.createMoodleFAB({
    text: 'Read Assignment',
    icon: '📖',
    onClick: () => moodle_readContent(assignment),
    position: 'bottom-right',
  });

  document.body.appendChild(moodle_fabElement);
  console.log('[Moodle] Assignment Reader initialized');
}

/**
 * Initialize Forum Reader feature
 * @async
 * @function moodle_initializeForumReader
 * @description
 * - Extracts all forum posts (author, content, metadata)
 * - Creates a FAB button with "Read Forum" text and post count
 * - Appends FAB to DOM for user interaction
 * @listens click - Triggers moodle_readPosts with all forum posts
 */
export async function moodle_initializeForumReader() {
  const adapter = await moodle_loadAdapter();
  if (!adapter) {
    return;
  }

  const posts = adapter.extractForumPosts();
  if (!posts || posts.length === 0) {
    console.log('[Moodle] No forum posts found');
    return;
  }

  console.log('[Moodle] Forum detected with', posts.length, 'posts');

  // Create FAB button to read all posts
  moodle_fabElement = adapter.createMoodleFAB({
    text: 'Read Forum',
    icon: '💬',
    onClick: () => moodle_readPosts(posts),
    position: 'bottom-right',
  });

  document.body.appendChild(moodle_fabElement);
  console.log('[Moodle] Forum Reader initialized');
}

/**
 * Initialize Page Reader feature
 * @async
 * @function moodle_initializePageReader
 * @description
 * - Extracts page resource content (title, body text)
 * - Creates a FAB button with "Read Page" text
 * - Appends FAB to DOM for user interaction
 * @listens click - Triggers moodle_readContent with page data
 */
export async function moodle_initializePageReader() {
  const adapter = await moodle_loadAdapter();
  if (!adapter) {
    return;
  }

  const page = adapter.extractPageContent();
  if (!page) {
    console.log('[Moodle] No page content found');
    return;
  }

  console.log('[Moodle] Page resource detected:', page.title);

  // Create FAB button
  moodle_fabElement = adapter.createMoodleFAB({
    text: 'Read Page',
    icon: '📄',
    onClick: () => moodle_readContent(page),
    position: 'bottom-right',
  });

  document.body.appendChild(moodle_fabElement);
  console.log('[Moodle] Page Reader initialized');
}

// === READING ACTIONS ===

/**
 * Read Moodle content using TTS
 * @function moodle_readContent
 * @param {Object} content - Content object to read
 * @param {string} content.title - Content title
 * @param {string} content.text - Content body text
 * @param {HTMLElement} content.element - Associated DOM element for highlighting
 * @description
 * - Validates TTS is enabled in extension settings
 * - Combines title and text for natural speech output
 * - Delegates to global readText function for TTS processing
 * @requires settings.enabled - TTS master toggle must be true
 */
export function moodle_readContent(content) {
  // Access global settings from content-simple.js
  if (!settings) {
    settings = window.assistSettings || { enabled: false };
  }

  // Access global readText from content-simple.js
  if (!readText) {
    readText = window.assistReadText;
  }

  if (!settings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[Moodle] Reading content:', content.title);
  showToast('📖 Reading: ' + content.title);

  const fullText = content.title + '. ' + content.text;
  readText(fullText, content.element);
}

/**
 * Read forum posts using TTS
 * @function moodle_readPosts
 * @param {Array<Object>} posts - Array of forum post objects
 * @param {string} posts[].author - Post author name
 * @param {string} posts[].content - Post content text
 * @param {HTMLElement} posts[].element - Associated DOM element for highlighting
 * @description
 * - Validates TTS is enabled in extension settings
 * - Combines multiple posts with author attribution
 * - Adds "Next post" separators for natural speech flow
 * - Delegates to global readText function for TTS processing
 * @requires settings.enabled - TTS master toggle must be true
 */
export function moodle_readPosts(posts) {
  // Access global settings from content-simple.js
  if (!settings) {
    settings = window.assistSettings || { enabled: false };
  }

  // Access global readText from content-simple.js
  if (!readText) {
    readText = window.assistReadText;
  }

  if (!settings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[Moodle] Reading', posts.length, 'forum posts');
  showToast(`💬 Reading ${posts.length} forum posts`);

  // Combine all posts
  const fullText = posts.map(post => `${post.author} says: ${post.content}`).join('. Next post. ');

  readText(fullText, posts[0].element);
}

// === CLEANUP ===

/**
 * Remove Moodle FAB from DOM
 * @function moodle_removeFAB
 * @description Safely removes the FAB element and clears the reference
 */
export function moodle_removeFAB() {
  if (moodle_fabElement) {
    moodle_fabElement.remove();
    moodle_fabElement = null;
  }
}

// === SETTINGS MANAGEMENT ===

/** @type {Object} Default settings for Moodle integration */
const DEFAULT_SETTINGS = {
  enabled: false,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = moodle_enabled;
  const newEnabled = settings.enabled || false;

  if (newEnabled && !wasEnabled) {
    moodle_enabled = true;
    moodle_initialize();
    if (!isInit) {
      showToast('📚 Moodle Integration enabled');
    }
  } else if (!newEnabled && wasEnabled) {
    moodle_enabled = false;
    moodle_removeFAB();
    if (!isInit) {
      showToast('Moodle Integration disabled');
    }
  }

  console.log(`[Moodle] Settings ${isInit ? 'loaded' : 'updated'}:`, newEnabled);
}

/**
 * Initialize Moodle integration using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'moodleIntegration',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

// === GLOBAL EXPORTS FOR WINDOW SCOPE ===
// Export key functions to window for access by other modules if needed
if (typeof window !== 'undefined') {
  window.moodleInitialize = moodle_initialize;
  window.moodleRemoveFAB = moodle_removeFAB;
}

console.log('[Moodle] Module loaded');
