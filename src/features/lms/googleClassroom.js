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
 * @version 1.1.0
 * @requires core/ui/toast
 * @requires chrome.storage
 * @requires chrome.runtime
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';
import { isGoogleClassroomPage } from '../../adapters/lms-detect.js';
import { joinForSpeech, readAloud } from './lms-read-aloud.js';

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

/**
 * Loads the Google Classroom Adapter, but only on a Google Classroom page
 *
 * The page check comes first and is the reason this is the only gate: every entry point goes
 * through here, so a page that is not Classroom never fetches the adapter chunk and never logs.
 * The import is a plain specifier so Vite bundles the adapter into assets/ — the previous
 * `chrome.runtime.getURL('src/adapters/google-classroom-adapter.js')` loaded a raw copy of the
 * source, whose own imports had to exist as raw files beside it, and one of them did not.
 *
 * @async
 * @returns {Promise<Object|null>} The adapter module, or null off Classroom / on failure
 */
async function googleClassroom_loadAdapter() {
  if (!isGoogleClassroomPage()) {
    return null;
  }

  if (!GoogleClassroomAdapter) {
    try {
      GoogleClassroomAdapter = await import('../../adapters/google-classroom-adapter.js');
      console.log('[GoogleClassroom] Adapter loaded');
    } catch (error) {
      console.error('[GoogleClassroom] Failed to load adapter:', error);
    }
  }
  return GoogleClassroomAdapter;
}

/**
 * Initializes Google Classroom integration based on current page type
 *
 * Workflow:
 * 1. Check if integration is enabled
 * 2. Load the Google Classroom adapter, which no-ops off Classroom
 * 3. Identify page type (Assignment, Stream, Classwork)
 * 4. Initialize appropriate reader features
 *
 * @async
 * @returns {Promise<void>}
 */
async function googleClassroom_initialize() {
  if (!googleClassroom_enabled) {
    return;
  }

  // Off Classroom, loadAdapter returns null without importing anything.
  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
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

  console.log('[GoogleClassroom] Assignment detected');

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

/**
 * Reads Google Classroom content aloud.
 *
 * Builds the spoken text from whatever the page supplied and hands it to the shared read-aloud path,
 * which refuses with a plain reason when read-aloud is off or the page holds nothing to speak.
 *
 * @param {Object} content - Content object from adapter
 * @param {string} content.title - Content title
 * @param {string} content.text - Content body text
 * @param {HTMLElement} content.element - DOM element for highlighting
 * @returns {boolean} true if reading started
 */
function googleClassroom_readContent(content) {
  return readAloud({
    text: joinForSpeech([content.title, content.text]),
    element: content.element,
    announcement: `Reading: ${content.title || 'this page'}`,
  });
}

/**
 * Reads multiple stream posts aloud.
 *
 * Posts with no text of their own are dropped rather than spoken as an empty turn, so a stream of
 * bare attachments reports "nothing to read" instead of reciting separators into silence.
 *
 * @param {Array<Object>} posts - Array of post objects from adapter
 * @param {string} posts[].title - Post title (optional)
 * @param {string} posts[].content - Post content
 * @param {HTMLElement} posts[].element - DOM element for highlighting
 * @returns {boolean} true if reading started
 */
function googleClassroom_readPosts(posts) {
  const spoken = (posts || []).filter(post => post && post.content && post.content.trim());

  return readAloud({
    text: spoken
      .map(post => joinForSpeech([post.title || 'Post', post.content]))
      .join('. Next post. '),
    element: spoken.length > 0 ? spoken[0].element : null,
    announcement: `Reading ${spoken.length} ${spoken.length === 1 ? 'post' : 'posts'}`,
  });
}

/**
 * Reads multiple classwork items aloud.
 *
 * @param {Array<Object>} items - Array of classwork objects from adapter
 * @param {string} items[].type - Item type (Assignment, Quiz, Material)
 * @param {string} items[].title - Item title
 * @param {string} items[].dueDate - Due date string (optional)
 * @param {HTMLElement} items[].element - DOM element for highlighting
 * @returns {boolean} true if reading started
 */
function googleClassroom_readClasswork(items) {
  const spoken = (items || []).filter(item => item && item.title && item.title.trim());

  return readAloud({
    text: spoken
      .map(item => `${item.type}: ${item.title.trim()}. Due: ${item.dueDate || 'No due date'}.`)
      .join(' '),
    element: spoken.length > 0 ? spoken[0].element : null,
    announcement: `Reading ${spoken.length} classwork ${spoken.length === 1 ? 'item' : 'items'}`,
  });
}

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

/**
 * Tear down what this module injected (the FAB). Safe to call on any page.
 */
function googleClassroom_cleanup() {
  googleClassroom_removeFAB();
}

/**
 * Re-detect the current page and re-mount Classroom features after an SPA navigation.
 * Cleans up first so nothing is duplicated; no-ops off Classroom / when disabled.
 */
async function googleClassroom_reinit() {
  googleClassroom_cleanup();
  await googleClassroom_initialize();
}

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
/** @type {Object} Default settings for Google Classroom integration */
const DEFAULT_SETTINGS = {
  enabled: false,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = googleClassroom_enabled;
  const newEnabled = settings.enabled || false;

  if (newEnabled && !wasEnabled) {
    googleClassroom_enabled = true;
    googleClassroom_initialize();
    // Announced only on this platform: the setting is shared, so a change made anywhere reaches
    // every tab, and a message about another LMS is noise to a student who is not on it.
    if (!isInit && isGoogleClassroomPage()) {
      showToast('🎒 Google Classroom Integration enabled');
    }
  } else if (!newEnabled && wasEnabled) {
    googleClassroom_enabled = false;
    googleClassroom_removeFAB();
    if (!isInit && isGoogleClassroomPage()) {
      showToast('Google Classroom Integration disabled');
    }
  }

  console.log(`[GoogleClassroom] Settings ${isInit ? 'loaded' : 'updated'}:`, newEnabled);
}

/**
 * Initialize Google Classroom integration using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'googleClassroomIntegration',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

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
  googleClassroom_removeFAB,
  googleClassroom_cleanup,
  googleClassroom_reinit,
};
