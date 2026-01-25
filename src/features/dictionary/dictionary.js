/**
 * Dictionary Lookup Feature
 *
 * Provides word definitions, pronunciations, and usage examples using the Free Dictionary API
 *
 * Features:
 * - Free Dictionary API integration (https://dictionaryapi.dev/)
 * - Modal popup UI with clean design
 * - Definitions grouped by part of speech
 * - IPA pronunciation display
 * - Audio playback (if available)
 * - Examples in context
 * - Synonyms as clickable links
 * - Error handling for words not found
 * - Cache for last 100 lookups
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern (DEC-202510-010)
 * - All functions prefixed with 'dictionary_' to avoid naming conflicts
 * - Integrates with Highlight Menu (Feature 2)
 *
 * @module features/dictionary
 */

import { registerShortcut } from '../../utils/keyboard-shortcuts.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let dictionary_modal = null;
const dictionary_cache = new Map(); // LRU cache for lookups
const dictionary_cacheMaxSize = 100;
let dictionary_currentAudio = null;

const dictionary_settings = {
  enabled: true,
  cacheSize: 100,
  autoLookupOnDoubleClick: false,
};

// ============================================================================
// API INTEGRATION
// ============================================================================

/**
 * Fetches word definition from Free Dictionary API
 *
 * API Docs: https://dictionaryapi.dev/
 *
 * @param {string} word - Word to look up
 * @returns {Promise<Object>} Dictionary data
 */
async function dictionary_fetchDefinition(word) {
  const normalizedWord = word.trim().toLowerCase();

  // Check cache first
  if (dictionary_cache.has(normalizedWord)) {
    console.log(`[Dictionary] Cache hit for: ${normalizedWord}`);
    return dictionary_cache.get(normalizedWord);
  }

  console.log(`[Dictionary] Fetching definition for: ${normalizedWord}`);

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`No definition found for "${word}"`);
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Cache the result
    dictionary_addToCache(normalizedWord, data);

    return data;
  } catch (error) {
    console.error('[Dictionary] API error:', error);
    throw error;
  }
}

/**
 * Adds entry to cache with LRU eviction
 *
 * @param {string} word - Word key
 * @param {Object} data - Dictionary data
 */
function dictionary_addToCache(word, data) {
  // Remove oldest entry if cache is full
  if (dictionary_cache.size >= dictionary_cacheMaxSize) {
    const firstKey = dictionary_cache.keys().next().value;
    dictionary_cache.delete(firstKey);
  }

  dictionary_cache.set(word, data);
  console.log(`[Dictionary] Cached: ${word} (${dictionary_cache.size}/${dictionary_cacheMaxSize})`);
}

// ============================================================================
// MODAL UI
// ============================================================================

/**
 * Creates the dictionary modal element
 *
 * @param {string} word - Word being looked up
 * @param {Object} data - Dictionary API response
 * @returns {HTMLElement} Modal element
 */
function dictionary_createModal(word, data) {
  const modal = document.createElement('div');
  modal.id = 'assist-dictionary-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'assist-dictionary-title');
  modal.setAttribute('aria-modal', 'true');

  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const content = document.createElement('div');
  content.className = 'assist-dictionary-content';
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    max-width: 600px;
    max-height: 80vh;
    width: 90%;
    overflow-y: auto;
    padding: 24px;
  `;

  // Build content HTML
  content.innerHTML = sanitizeHTML(dictionary_buildContentHTML(word, data));

  modal.appendChild(content);

  // Add event listeners
  dictionary_addModalEventListeners(modal, data);

  return modal;
}

/**
 * Builds the HTML content for the modal
 *
 * @param {string} word - Word being looked up
 * @param {Object} data - Dictionary API response
 * @returns {string} HTML string
 */
function dictionary_buildContentHTML(word, data) {
  const entry = data[0]; // First entry
  const phonetics = entry.phonetics || [];
  const meanings = entry.meanings || [];

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
      <div>
        <h2 id="assist-dictionary-title" style="margin: 0; font-size: 28px; font-weight: 600; color: #1a1a1a;">
          ${entry.word}
        </h2>
        ${dictionary_buildPhoneticsHTML(phonetics)}
      </div>
      <button
        class="assist-dictionary-close"
        aria-label="Close dictionary"
        style="
          background: transparent;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 4px 8px;
          color: #666;
        "
      >×</button>
    </div>
  `;

  // Meanings (grouped by part of speech)
  meanings.forEach((meaning, idx) => {
    html += dictionary_buildMeaningHTML(meaning, idx);
  });

  return html;
}

/**
 * Builds phonetics HTML (pronunciation)
 *
 * @param {Array} phonetics - Phonetics array from API
 * @returns {string} HTML string
 */
function dictionary_buildPhoneticsHTML(phonetics) {
  if (!phonetics || phonetics.length === 0) {
    return '';
  }

  const phoneticWithAudio = phonetics.find(p => p.audio);
  const phoneticText = phonetics.find(p => p.text)?.text || phoneticWithAudio?.text;

  let html = '<div style="margin-top: 8px; display: flex; align-items: center; gap: 12px;">';

  if (phoneticText) {
    html += `<span style="color: #666; font-size: 16px;">${phoneticText}</span>`;
  }

  if (phoneticWithAudio?.audio) {
    html += `
      <button
        class="assist-dictionary-play-audio"
        data-audio-url="${phoneticWithAudio.audio}"
        aria-label="Play pronunciation"
        style="
          background: #4285f4;
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          cursor: pointer;
          color: white;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        "
      >▶</button>
    `;
  }

  html += '</div>';

  return html;
}

/**
 * Builds meaning section HTML (part of speech + definitions)
 *
 * @param {Object} meaning - Meaning object from API
 * @param {number} index - Meaning index
 * @returns {string} HTML string
 */
function dictionary_buildMeaningHTML(meaning, index) {
  const partOfSpeech = meaning.partOfSpeech || 'unknown';
  const definitions = meaning.definitions || [];
  const synonyms = meaning.synonyms || [];
  const antonyms = meaning.antonyms || [];

  let html = `
    <div style="margin-top: ${index > 0 ? '24px' : '16px'};">
      <h3 style="
        margin: 0 0 12px 0;
        font-size: 16px;
        font-weight: 600;
        color: #4285f4;
        text-transform: capitalize;
      ">${partOfSpeech}</h3>
  `;

  // Definitions
  html += '<ol style="margin: 0; padding-left: 20px;">';
  definitions.forEach(def => {
    html += `
      <li style="margin-bottom: 12px; color: #333; line-height: 1.6;">
        ${def.definition}
        ${def.example ? `<div style="margin-top: 4px; font-style: italic; color: #666;">"${def.example}"</div>` : ''}
      </li>
    `;
  });
  html += '</ol>';

  // Synonyms
  if (synonyms.length > 0) {
    html += `
      <div style="margin-top: 12px;">
        <strong style="color: #666; font-size: 14px;">Synonyms:</strong>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px;">
          ${synonyms
            .slice(0, 8)
            .map(
              syn => `
            <button
              class="assist-dictionary-synonym"
              data-word="${syn}"
              style="
                background: #f0f0f0;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 4px 12px;
                font-size: 14px;
                cursor: pointer;
                color: #4285f4;
              "
            >${syn}</button>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  // Antonyms
  if (antonyms.length > 0) {
    html += `
      <div style="margin-top: 12px;">
        <strong style="color: #666; font-size: 14px;">Antonyms:</strong>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px;">
          ${antonyms
            .slice(0, 8)
            .map(
              ant => `
            <span style="
              background: #fff3e0;
              border: 1px solid #ffe0b2;
              border-radius: 4px;
              padding: 4px 12px;
              font-size: 14px;
              color: #666;
            ">${ant}</span>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  html += '</div>';

  return html;
}

/**
 * Adds event listeners to modal elements
 *
 * @param {HTMLElement} modal - Modal element
 * @param {Object} _data - Dictionary data (for audio)
 */
function dictionary_addModalEventListeners(modal, _data) {
  // Close button
  const closeBtn = modal.querySelector('.assist-dictionary-close');
  if (closeBtn) {
    attachInteractiveHandler(closeBtn, 'Dictionary Close Button', () => dictionary_hide());
  }

  // Click outside to close
  attachInteractiveHandler(modal, 'Dictionary Modal Backdrop', e => {
    if (e.target === modal) {
      dictionary_hide();
    }
  });

  // Escape key to close
  const escapeHandler = e => {
    if (e.key === 'Escape') {
      dictionary_hide();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);

  // Audio playback
  const audioBtn = modal.querySelector('.assist-dictionary-play-audio');
  if (audioBtn) {
    attachInteractiveHandler(audioBtn, 'Dictionary Audio Playback Button', () => {
      const audioUrl = audioBtn.getAttribute('data-audio-url');
      dictionary_playAudio(audioUrl);
    });
  }

  // Synonym buttons (clickable to look up synonym)
  const synonymBtns = modal.querySelectorAll('.assist-dictionary-synonym');
  synonymBtns.forEach(btn => {
    attachInteractiveHandler(btn, 'Dictionary Synonym Button', () => {
      const word = btn.getAttribute('data-word');
      dictionary_lookup(word);
    });
  });
}

// ============================================================================
// MODAL ACTIONS
// ============================================================================

/**
 * Shows the dictionary modal with word definition
 *
 * @param {string} word - Word to look up
 */
async function dictionary_lookup(word) {
  console.log(`[Dictionary] Looking up: ${word}`);

  // Show loading state
  dictionary_showLoading(word);

  try {
    const data = await dictionary_fetchDefinition(word);
    dictionary_showDefinition(word, data);
  } catch (error) {
    dictionary_showError(word, error.message);
  }
}

/**
 * Shows loading state
 *
 * @param {string} word - Word being looked up
 */
function dictionary_showLoading(word) {
  dictionary_hide(); // Remove existing modal

  const modal = document.createElement('div');
  modal.id = 'assist-dictionary-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  modal.innerHTML = sanitizeHTML(`
    <div style="
      background: white;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
    ">
      <div style="font-size: 18px; color: #666;">
        Looking up "<strong>${word}</strong>"...
      </div>
    </div>
  `);

  document.body.appendChild(modal);
  dictionary_modal = modal;
}

/**
 * Shows the definition in modal
 *
 * @param {string} word - Word
 * @param {Object} data - Dictionary data
 */
function dictionary_showDefinition(word, data) {
  dictionary_hide(); // Remove loading modal

  const modal = dictionary_createModal(word, data);
  document.body.appendChild(modal);
  dictionary_modal = modal;

  console.log('[Dictionary] Definition displayed');
}

/**
 * Shows error message
 *
 * @param {string} word - Word
 * @param {string} errorMessage - Error message
 */
function dictionary_showError(word, errorMessage) {
  dictionary_hide(); // Remove loading modal

  const modal = document.createElement('div');
  modal.id = 'assist-dictionary-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  modal.innerHTML = sanitizeHTML(`
    <div style="
      background: white;
      border-radius: 12px;
      padding: 32px;
      max-width: 400px;
      text-align: center;
    ">
      <div style="font-size: 48px; margin-bottom: 16px;">📖</div>
      <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #1a1a1a;">Word Not Found</h2>
      <p style="margin: 0 0 20px 0; color: #666; line-height: 1.6;">
        ${errorMessage}
      </p>
      <button
        class="assist-dictionary-close"
        style="
          background: #4285f4;
          border: none;
          border-radius: 6px;
          padding: 10px 24px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        "
      >Close</button>
    </div>
  `);

  attachInteractiveHandler(modal, 'Dictionary Error Modal Backdrop', e => {
    if (e.target === modal || e.target.classList.contains('assist-dictionary-close')) {
      dictionary_hide();
    }
  });

  document.body.appendChild(modal);
  dictionary_modal = modal;

  console.warn(`[Dictionary] Error: ${errorMessage}`);
}

/**
 * Hides the dictionary modal
 */
function dictionary_hide() {
  if (dictionary_modal) {
    dictionary_modal.remove();
    dictionary_modal = null;
  }

  // Stop any playing audio
  if (dictionary_currentAudio) {
    dictionary_currentAudio.pause();
    dictionary_currentAudio = null;
  }
}

/**
 * Plays pronunciation audio
 *
 * @param {string} audioUrl - URL to audio file
 */
function dictionary_playAudio(audioUrl) {
  // Stop current audio if playing
  if (dictionary_currentAudio) {
    dictionary_currentAudio.pause();
  }

  dictionary_currentAudio = new Audio(audioUrl);
  dictionary_currentAudio.play().catch(error => {
    console.error('[Dictionary] Audio playback failed:', error);
  });

  console.log('[Dictionary] Playing audio');
}

// ============================================================================
// KEYBOARD SHORTCUT
// ============================================================================
// Keyboard shortcut is now dynamically registered via shortcuts manager
// See initialization code in dictionary_init()

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

/**
 * Initializes the dictionary feature
 */
function dictionary_init() {
  console.log('[Dictionary] Initializing...');

  // Register dynamic keyboard shortcut for dictionary lookup
  registerShortcut('dictionary_lookup', () => {
    console.log('[Dictionary] Lookup shortcut triggered');

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text) {
      dictionary_lookup(text);
    } else {
      console.log('[Dictionary] No text selected for lookup');
    }
  });

  // Load settings
  chrome.storage.local.get(['dictionarySettings'], result => {
    if (result.dictionarySettings) {
      Object.assign(dictionary_settings, result.dictionarySettings);
      console.log('[Dictionary] Settings loaded:', dictionary_settings);
    }
  });

  // Register feature globally for integration with Highlight Menu
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.dictionary = {
    lookup: dictionary_lookup,
    hide: dictionary_hide,
    settings: dictionary_settings,
  };

  console.log('[Dictionary] Feature initialized');
}

/**
 * Cleanup function
 */
function dictionary_cleanup() {
  console.log('[Dictionary] Cleaning up...');
  dictionary_hide();
  // Shortcut unregistration is handled automatically by shortcuts manager
}

// ============================================================================
// EXPORTS
// ============================================================================

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  dictionary_init();
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dictionary_init,
    dictionary_cleanup,
    dictionary_lookup,
    dictionary_hide,
  };
}
