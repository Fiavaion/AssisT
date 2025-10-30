/**
 * Google Classroom Integration Module
 *
 * Provides TTS (Text-to-Speech) functionality for Google Classroom pages,
 * including assignments, stream posts, and classwork items.
 *
 * Features:
 * - Dynamic adapter loading for Google Classroom DOM interaction
 * - Page type detection (Assignment, Stream, Classwork)
 * - Floating Action Button (FAB) creation for TTS activation
 * - Content extraction and reading via TTS
 * - Settings persistence via Chrome Storage API
 * - Real-time settings updates via storage change listener
 *
 * @module features/lms/googleClassroom
 * @requires core/ui/toast
 * @requires chrome.storage
 * @requires chrome.runtime
 */

import { showToast } from '../../core/ui/toast.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/**
 * Flag indicating whether Google Classroom integration is enabled
 * @type {boolean}
 */
let googleClassroom_enabled = false;

/**
 * Reference to the currently displayed Floating Action Button element
 * @type {HTMLElement|null}
 */
let googleClassroom_fabElement = null;

/**
 * Dynamically loaded Google Classroom Adapter module
 * @type {Object|null}
 */
let GoogleClassroomAdapter = null;

// ============================================================
// ADAPTER LOADING
// ============================================================

/**
 * Dynamically loads the Google Classroom Adapter module
 *
 * The adapter is loaded on-demand to avoid unnecessary module loading
 * when Google Classroom integration is disabled or not on a GC page.
 *
 * @async
 * @returns {Promise<Object|null>} The adapter module or null on failure
 * @throws {Error} If adapter file cannot be loaded
 */
async function googleClassroom_loadAdapter() {
  if (!GoogleClassroomAdapter) {
    try {
      GoogleClassroomAdapter = await import(
        chrome.runtime.getURL('adapters/google-classroom-adapter.js')
      );
      console.log('[GoogleClassroom] Adapter loaded');
    } catch (error) {
      console.error('[GoogleClassroom] Failed to load adapter:', error);
    }
  }
  return GoogleClassroomAdapter;
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initializes Google Classroom integration based on current page type
 *
 * Workflow:
 * 1. Check if integration is enabled
 * 2. Load the Google Classroom adapter
 * 3. Detect if current page is a Google Classroom page
 * 4. Identify page type (Assignment, Stream, Classwork)
 * 5. Initialize appropriate reader features
 *
 * @async
 * @returns {Promise<void>}
 */
async function googleClassroom_initialize() {
  if (!googleClassroom_enabled) {
    return;
  }

  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
    return;
  }

  // Check if on Google Classroom page
  if (!adapter.isGoogleClassroomPage()) {
    console.log('[GoogleClassroom] Not a Google Classroom page, skipping');
    return;
  }

  const pageType = adapter.detectGoogleClassroomPageType();
  console.log('[GoogleClassroom] Page type detected:', pageType);

  // Wait for content to load
  await adapter.waitForGoogleClassroomContent();

  // Initialize features based on page type
  if (pageType === adapter.GoogleClassroomPageType.ASSIGNMENT) {
    googleClassroom_initializeAssignmentReader();
  } else if (pageType === adapter.GoogleClassroomPageType.STREAM) {
    googleClassroom_initializeStreamReader();
  } else if (pageType === adapter.GoogleClassroomPageType.CLASSWORK) {
    googleClassroom_initializeClassworkReader();
  }
}

// ============================================================
// FEATURE INITIALIZATION
// ============================================================

/**
 * Initializes the Assignment Reader feature
 *
 * Extracts assignment content (title, description, due date) and creates
 * a FAB button to trigger TTS reading of the assignment.
 *
 * @async
 * @returns {Promise<void>}
 */
async function googleClassroom_initializeAssignmentReader() {
  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
    return;
  }

  const assignment = adapter.extractAssignmentContent();
  if (!assignment) {
    console.log('[GoogleClassroom] No assignment content found');
    return;
  }

  console.log('[GoogleClassroom] Assignment detected:', assignment.title);

  // Create FAB button
  googleClassroom_fabElement = adapter.createGoogleClassroomFAB({
    text: 'Read Assignment',
    icon: '📖',
    onClick: () => googleClassroom_readContent(assignment),
    position: 'bottom-right',
  });

  document.body.appendChild(googleClassroom_fabElement);
  console.log('[GoogleClassroom] Assignment Reader initialized');
}

/**
 * Initializes the Stream Reader feature
 *
 * Extracts stream posts (announcements, materials) and creates a FAB
 * button to trigger TTS reading of all posts in sequence.
 *
 * @async
 * @returns {Promise<void>}
 */
async function googleClassroom_initializeStreamReader() {
  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
    return;
  }

  const posts = adapter.extractStreamPosts();
  if (!posts || posts.length === 0) {
    console.log('[GoogleClassroom] No stream posts found');
    return;
  }

  console.log('[GoogleClassroom] Stream detected with', posts.length, 'posts');

  // Create FAB button
  googleClassroom_fabElement = adapter.createGoogleClassroomFAB({
    text: 'Read Stream',
    icon: '📢',
    onClick: () => googleClassroom_readPosts(posts),
    position: 'bottom-right',
  });

  document.body.appendChild(googleClassroom_fabElement);
  console.log('[GoogleClassroom] Stream Reader initialized');
}

/**
 * Initializes the Classwork Reader feature
 *
 * Extracts classwork items (assignments, quizzes, materials) and creates
 * a FAB button to trigger TTS reading of all items in sequence.
 *
 * @async
 * @returns {Promise<void>}
 */
async function googleClassroom_initializeClassworkReader() {
  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
    return;
  }

  const items = adapter.extractClassworkItems();
  if (!items || items.length === 0) {
    console.log('[GoogleClassroom] No classwork items found');
    return;
  }

  console.log('[GoogleClassroom] Classwork detected with', items.length, 'items');

  // Create FAB button
  googleClassroom_fabElement = adapter.createGoogleClassroomFAB({
    text: 'Read Classwork',
    icon: '📚',
    onClick: () => googleClassroom_readClasswork(items),
    position: 'bottom-right',
  });

  document.body.appendChild(googleClassroom_fabElement);
  console.log('[GoogleClassroom] Classwork Reader initialized');
}

// ============================================================
// TTS READING FUNCTIONS
// ============================================================

/**
 * Reads Google Classroom content using TTS
 *
 * Combines title and content text, then passes to the global readText
 * function for TTS processing and synchronized highlighting.
 *
 * @param {Object} content - Content object from adapter
 * @param {string} content.title - Content title
 * @param {string} content.text - Content body text
 * @param {HTMLElement} content.element - DOM element for highlighting
 * @returns {void}
 */
function googleClassroom_readContent(content) {
  // Check if TTS is enabled globally (via window.assistSettings from content-simple.js)
  if (window.assistSettings && !window.assistSettings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[GoogleClassroom] Reading content:', content.title);
  showToast('📖 Reading: ' + content.title);

  const fullText = content.title + '. ' + content.text;

  // Call global readText function from content-simple.js (via window.assistReadText)
  if (window.assistReadText) {
    window.assistReadText(fullText, content.element);
  } else {
    console.error('[GoogleClassroom] readText function not available');
  }
}

/**
 * Reads multiple stream posts using TTS
 *
 * Combines all posts into a single text string with separators,
 * then triggers TTS reading.
 *
 * @param {Array<Object>} posts - Array of post objects from adapter
 * @param {string} posts[].title - Post title (optional)
 * @param {string} posts[].content - Post content
 * @param {HTMLElement} posts[].element - DOM element for highlighting
 * @returns {void}
 */
function googleClassroom_readPosts(posts) {
  // Check if TTS is enabled globally (via window.assistSettings from content-simple.js)
  if (window.assistSettings && !window.assistSettings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[GoogleClassroom] Reading', posts.length, 'stream posts');
  showToast(`📢 Reading ${posts.length} posts`);

  // Combine all posts with separators
  const fullText = posts
    .map(post => `${post.title || 'Post'}. ${post.content}`)
    .join('. Next post. ');

  // Call global readText function from content-simple.js (via window.assistReadText)
  if (window.assistReadText) {
    window.assistReadText(fullText, posts[0].element);
  } else {
    console.error('[GoogleClassroom] readText function not available');
  }
}

/**
 * Reads multiple classwork items using TTS
 *
 * Combines all classwork items (type, title, due date) into a single
 * text string, then triggers TTS reading.
 *
 * @param {Array<Object>} items - Array of classwork objects from adapter
 * @param {string} items[].type - Item type (Assignment, Quiz, Material)
 * @param {string} items[].title - Item title
 * @param {string} items[].dueDate - Due date string (optional)
 * @param {HTMLElement} items[].element - DOM element for highlighting
 * @returns {void}
 */
function googleClassroom_readClasswork(items) {
  // Check if TTS is enabled globally (via window.assistSettings from content-simple.js)
  if (window.assistSettings && !window.assistSettings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[GoogleClassroom] Reading', items.length, 'classwork items');
  showToast(`📚 Reading ${items.length} classwork items`);

  // Combine all items with type and due date info
  const fullText = items
    .map(item => `${item.type}: ${item.title}. Due: ${item.dueDate || 'No due date'}.`)
    .join(' ');

  // Call global readText function from content-simple.js (via window.assistReadText)
  if (window.assistReadText) {
    window.assistReadText(fullText, items[0].element);
  } else {
    console.error('[GoogleClassroom] readText function not available');
  }
}

// ============================================================
// UI CLEANUP
// ============================================================

/**
 * Removes the Google Classroom FAB from the DOM
 *
 * Called when integration is disabled via settings or when page
 * navigation occurs.
 *
 * @returns {void}
 */
function googleClassroom_removeFAB() {
  if (googleClassroom_fabElement) {
    googleClassroom_fabElement.remove();
    googleClassroom_fabElement = null;
  }
}

// ============================================================
// SETTINGS MANAGEMENT
// ============================================================

/**
 * Loads Google Classroom integration settings from Chrome Storage
 *
 * Reads the assist_settings.googleClassroomIntegration object and
 * initializes the integration if enabled.
 *
 * Storage Structure:
 * {
 *   assist_settings: {
 *     googleClassroomIntegration: {
 *       enabled: boolean
 *     }
 *   }
 * }
 */
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.googleClassroomIntegration) {
    const gciSettings = result.assist_settings.googleClassroomIntegration;
    googleClassroom_enabled = gciSettings.enabled || false;

    if (googleClassroom_enabled) {
      googleClassroom_initialize();
    }

    console.log('[GoogleClassroom] Settings loaded:', googleClassroom_enabled);
  } else {
    console.log('[GoogleClassroom] Integration disabled by default');
  }
});

/**
 * Listens for Google Classroom integration settings updates
 *
 * Responds to real-time changes in Chrome Storage, enabling or disabling
 * the integration and providing user feedback via toast notifications.
 *
 * @listens chrome.storage.onChanged
 */
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.googleClassroomIntegration) {
    const gciSettings = changes.assist_settings.newValue.googleClassroomIntegration;
    const newEnabled = gciSettings.enabled || false;

    if (newEnabled && !googleClassroom_enabled) {
      // Enable integration
      googleClassroom_enabled = true;
      googleClassroom_initialize();
      showToast('🎒 Google Classroom Integration enabled');
    } else if (!newEnabled && googleClassroom_enabled) {
      // Disable integration
      googleClassroom_enabled = false;
      googleClassroom_removeFAB();
      showToast('Google Classroom Integration disabled');
    }

    console.log('[GoogleClassroom] Settings updated:', newEnabled);
  }
});

// ============================================================
// EXPORTS
// ============================================================

/**
 * Export all functions for testing and potential external use
 *
 * Note: This module is self-initializing via Chrome Storage listeners,
 * but exports are provided for modularity and testability.
 */
export {
  googleClassroom_loadAdapter,
  googleClassroom_initialize,
  googleClassroom_initializeAssignmentReader,
  googleClassroom_initializeStreamReader,
  googleClassroom_initializeClassworkReader,
  googleClassroom_readContent,
  googleClassroom_readPosts,
  googleClassroom_readClasswork,
  googleClassroom_removeFAB
};
