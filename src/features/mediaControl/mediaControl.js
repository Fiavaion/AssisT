/**
 * Media Control Feature Module
 *
 * Provides auto-play blocking for video and audio elements. This feature is
 * critical for users with sensory sensitivities, ADHD, or autism spectrum
 * conditions who may find unexpected media playback startling or distracting.
 *
 * Features:
 * - Blocks auto-play on video and audio elements
 * - MutationObserver watches for dynamically added media
 * - Whitelist for user-initiated playback
 * - Visual indicator on blocked media
 *
 * WCAG Compliance: WCAG 2.1 SC 1.4.2 (Audio Control)
 *
 * @module mediaControl
 * @version 1.0.0
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

/** @type {boolean} Tracks whether media control is currently enabled */
let mediaControl_enabled = false;

/** @type {MutationObserver|null} Observer for dynamically added media */
let mediaControl_observer = null;

/** @type {WeakSet} Tracks elements that user has explicitly played */
let mediaControl_userInitiated = new WeakSet();

/** @type {WeakSet} Tracks elements we've already processed */
let mediaControl_processed = new WeakSet();

/** @type {HTMLStyleElement|null} Style element for visual indicators */
let mediaControl_styleElement = null;

/**
 * Injects CSS for visual indicators on blocked media.
 *
 * @function mediaControl_injectStyles
 * @returns {void}
 */
function mediaControl_injectStyles() {
  if (mediaControl_styleElement) {
    return;
  }

  mediaControl_styleElement = document.createElement('style');
  mediaControl_styleElement.id = 'assist-media-control-styles';
  mediaControl_styleElement.textContent = `
    /* Media Control - WCAG 2.1 SC 1.4.2 Compliant */
    video[data-assist-blocked],
    audio[data-assist-blocked] {
      position: relative;
    }

    video[data-assist-blocked]::after,
    audio[data-assist-blocked]::after {
      content: '⏸ Auto-play blocked';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      pointer-events: none;
      z-index: 10;
    }
  `;
  document.head.appendChild(mediaControl_styleElement);
  console.log('[MediaControl] Styles injected');
}

/**
 * Removes injected styles.
 *
 * @function mediaControl_removeStyles
 * @returns {void}
 */
function mediaControl_removeStyles() {
  if (mediaControl_styleElement) {
    mediaControl_styleElement.remove();
    mediaControl_styleElement = null;
    console.log('[MediaControl] Styles removed');
  }
}

/**
 * Pauses a media element and marks it as blocked.
 *
 * @function mediaControl_blockElement
 * @param {HTMLMediaElement} element - The video or audio element to block
 * @returns {void}
 */
function mediaControl_blockElement(element) {
  // Skip if user has explicitly interacted with this element
  if (mediaControl_userInitiated.has(element)) {
    return;
  }

  // Skip if already processed
  if (mediaControl_processed.has(element)) {
    return;
  }

  // Mark as processed
  mediaControl_processed.add(element);

  // Remove autoplay attribute
  if (element.hasAttribute('autoplay')) {
    element.removeAttribute('autoplay');
  }

  // Pause if playing
  if (!element.paused) {
    element.pause();
    element.currentTime = 0;
    element.setAttribute('data-assist-blocked', 'true');
    console.log('[MediaControl] Blocked auto-play:', element.src || element.currentSrc);
  }

  // Add play listener to track user-initiated playback
  element.addEventListener(
    'play',
    () => {
      // If this play event wasn't preceded by our block, user initiated it
      mediaControl_userInitiated.add(element);
      element.removeAttribute('data-assist-blocked');
    },
    { once: true }
  );
}

/**
 * Processes all media elements on the page.
 *
 * @function mediaControl_processMediaElements
 * @returns {void}
 */
function mediaControl_processMediaElements() {
  const videos = document.querySelectorAll('video');
  const audios = document.querySelectorAll('audio');

  videos.forEach(video => mediaControl_blockElement(video));
  audios.forEach(audio => mediaControl_blockElement(audio));

  console.log(
    '[MediaControl] Processed',
    videos.length,
    'videos and',
    audios.length,
    'audio elements'
  );
}

/**
 * Handles mutations to detect newly added media elements.
 *
 * @function mediaControl_handleMutations
 * @param {MutationRecord[]} mutations - Array of mutation records
 * @returns {void}
 */
function mediaControl_handleMutations(mutations) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      // Check if the added node is a media element
      if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
        mediaControl_blockElement(node);
      }

      // Check for media elements within added subtrees
      if (node.querySelectorAll) {
        const videos = node.querySelectorAll('video');
        const audios = node.querySelectorAll('audio');

        videos.forEach(video => mediaControl_blockElement(video));
        audios.forEach(audio => mediaControl_blockElement(audio));
      }
    }
  }
}

/**
 * Starts the MutationObserver to watch for dynamically added media.
 *
 * @function mediaControl_startObserver
 * @returns {void}
 */
function mediaControl_startObserver() {
  if (mediaControl_observer) {
    return;
  }

  mediaControl_observer = new MutationObserver(mediaControl_handleMutations);

  mediaControl_observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[MediaControl] Observer started');
}

/**
 * Stops the MutationObserver.
 *
 * @function mediaControl_stopObserver
 * @returns {void}
 */
function mediaControl_stopObserver() {
  if (mediaControl_observer) {
    mediaControl_observer.disconnect();
    mediaControl_observer = null;
    console.log('[MediaControl] Observer stopped');
  }
}

/**
 * Clears the blocked state from all media elements.
 *
 * @function mediaControl_clearBlockedState
 * @returns {void}
 */
function mediaControl_clearBlockedState() {
  const blockedElements = document.querySelectorAll('[data-assist-blocked]');
  blockedElements.forEach(el => el.removeAttribute('data-assist-blocked'));

  // Reset WeakSets by creating new ones
  mediaControl_userInitiated = new WeakSet();
  mediaControl_processed = new WeakSet();

  console.log('[MediaControl] Cleared blocked state from', blockedElements.length, 'elements');
}

/**
 * Enables the media control feature.
 *
 * @function mediaControl_enable
 * @returns {void}
 */
function mediaControl_enable() {
  mediaControl_enabled = true;
  mediaControl_injectStyles();
  mediaControl_processMediaElements();
  mediaControl_startObserver();
  showToast('🔇 Auto-play Blocking enabled');
  console.log('[MediaControl] Enabled');
}

/**
 * Disables the media control feature.
 *
 * @function mediaControl_disable
 * @returns {void}
 */
function mediaControl_disable() {
  mediaControl_enabled = false;
  mediaControl_stopObserver();
  mediaControl_clearBlockedState();
  mediaControl_removeStyles();
  showToast('Auto-play Blocking disabled');
  console.log('[MediaControl] Disabled');
}

/** @type {Object} Default settings for media control */
const DEFAULT_SETTINGS = {
  enabled: false,
  blockVideos: true,
  blockAudios: true,
  showIndicator: true,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = mediaControl_enabled;
  const shouldEnable = settings.enabled || false;

  // Handle enable/disable
  if (shouldEnable && !wasEnabled) {
    mediaControl_enable();
  } else if (!shouldEnable && wasEnabled) {
    mediaControl_disable();
  }

  console.log(`[MediaControl] Settings ${isInit ? 'loaded' : 'updated'}:`, shouldEnable);
}

/**
 * Initialize media control using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'mediaControl',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

export { mediaControl_enable };
export { mediaControl_disable };
export { mediaControl_processMediaElements };
export { mediaControl_blockElement };
