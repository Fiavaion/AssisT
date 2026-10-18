/**
 * Dictionary Lookup Feature
 *
 * Provides word definitions, pronunciations, and usage examples using the Free Dictionary API
 *
 * Features:
 * - Free Dictionary API, reached through the service worker once the student has allowed it
 *   (ADR 0006); this content script never fetches it directly
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
import { Z } from '../../utils/z-index.js';
import { sanitizeHTML, sanitizeText } from '../../utils/sanitize.js';
import { attachAccessibleHandler, attachInteractiveHandler } from '../../utils/event-handlers.js';
import { trapFocus } from '../../utils/focus-trap.js';
import { returnFocusAfterDialog } from '../../utils/dialog-return-focus.js';
import { debugLog } from '../../utils/debug-log.js';
import { requestThirdParty } from '../../utils/third-party-client.js';
import { createDeclinedNotice } from '../../utils/consent-panel.js';

let dictionary_modal = null;
const dictionary_cache = new Map(); // LRU cache for lookups
const dictionary_cacheMaxSize = 100;
let dictionary_currentAudio = null;
let dictionary_releaseFocus = null;
let dictionary_returnFocus = null;
/**
 * Bumped by every lookup and by closing the dialog, so a slow answer that arrives after the
 * student has walked away cannot put the dialog back up.
 */
let dictionary_lookupId = 0;

/**
 * A dictionary looks up words. Beyond a short phrase there is nothing for it to find, and the
 * whole sentence a student had selected was sent to the API and timed out.
 */
const DICTIONARY_MAX_WORDS = 3;

const dictionary_settings = {
  enabled: true,
  cacheSize: 100,
  autoLookupOnDoubleClick: false,
};

/**
 * Fetches a word's definition from the Free Dictionary API, through the service worker.
 *
 * The first lookup asks the student whether the word may be sent; a "not now" comes back as a
 * 'declined' failure, and nothing is sent.
 *
 * @param {string} word - Word to look up
 * @returns {Promise<Object>} Dictionary data
 */
async function dictionary_fetchDefinition(word) {
  const normalizedWord = word.trim().toLowerCase();

  // Check cache first
  if (dictionary_cache.has(normalizedWord)) {
    debugLog(`[Dictionary] Cache hit for: ${normalizedWord}`);
    return dictionary_cache.get(normalizedWord);
  }

  debugLog(`[Dictionary] Fetching definition for: ${normalizedWord}`);

  const reply = await requestThirdParty(
    'dictionary',
    { word: normalizedWord },
    { detail: normalizedWord, returnFocus: dictionary_returnFocus }
  );

  if (reply.success) {
    dictionary_addToCache(normalizedWord, reply.data);
    return reply.data;
  }

  if (reply.code === 'consent-declined' || reply.code === 'consent-unasked') {
    throw dictionary_failure('declined', 'The student has not allowed the dictionary service');
  }
  if (reply.code === 'not-found') {
    throw dictionary_failure('not-found', `No definition found for "${word}"`);
  }
  // A timeout or a dropped connection is NOT a missing word. Anything that is not an explicit
  // "not found" is a reachability problem and has to be reported as one.
  console.error('[Dictionary] Lookup failed:', reply.code, reply.error);
  throw dictionary_failure('unreachable', reply.error || reply.code);
}

/**
 * Build a classified dictionary failure.
 *
 * The distinction matters more than it looks. Telling a student their word does not exist, when
 * really the service was unreachable, invites them to doubt spelling that was correct — precisely
 * the wrong failure mode for the people this extension is for.
 *
 * @param {'not-found'|'unreachable'|'declined'} kind
 * @param {string} message - developer-facing detail, for the console
 * @returns {Error}
 */
function dictionary_failure(kind, message) {
  const error = new Error(message);
  error.kind = kind;
  return error;
}

/**
 * Decide what a student is told about a failed lookup.
 *
 * Exported so the wording itself is test-locked: the difference between "your word doesn't exist"
 * and "we couldn't reach the dictionary" is the whole point of this code path, and it must not
 * quietly regress back to one generic message.
 *
 * @param {string} word - the word that was looked up
 * @param {Error|string} error - the classified failure, or a bare message
 * @returns {{kind:string, detail:string, unreachable:boolean, icon:string, heading:string, body:string}}
 */
export function describeDictionaryFailure(word, error) {
  // Anything that did not explicitly come back as a 404 is treated as a reachability problem —
  // failing towards "our fault", never towards blaming the student's spelling.
  const kind = (error && error.kind) === 'not-found' ? 'not-found' : 'unreachable';
  const detail = (typeof error === 'string' ? error : error && error.message) || 'unknown error';
  const unreachable = kind !== 'not-found';
  const safeWord = sanitizeText(String(word === null || word === undefined ? '' : word));

  return {
    kind,
    detail,
    unreachable,
    icon: unreachable ? '📡' : '📖',
    heading: unreachable ? 'Dictionary Unavailable' : 'Word Not Found',
    body: unreachable
      ? `We could not reach the dictionary service just now. This is a problem at their end — nothing to do with how you spelled &ldquo;${safeWord}&rdquo;. Try again in a moment.`
      : `We could not find a definition for &ldquo;${safeWord}&rdquo;. It may be a name, an abbreviation, or a very unusual word — check the spelling and try again.`,
  };
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
  console.log(`[Dictionary] Cached a lookup (${dictionary_cache.size}/${dictionary_cacheMaxSize})`);
}

/**
 * Creates the dictionary modal element
 *
 * @param {string} word - Word being looked up
 * @param {Object} data - Dictionary API response
 * @returns {HTMLElement} Modal element
 */
function dictionary_createModal(word, data) {
  const modal = dictionary_createShell();

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
    attachAccessibleHandler(closeBtn, 'Dictionary Close Button', () => dictionary_hide());
  }

  // Click outside to close. Escape is the focus trap's job, so there is no document-level
  // key listener here any more — the old one outlived the dialog it belonged to.
  attachInteractiveHandler(modal, 'Dictionary Modal Backdrop', e => {
    if (e.target === modal) {
      dictionary_hide();
    }
  });

  // Audio playback
  const audioBtn = modal.querySelector('.assist-dictionary-play-audio');
  if (audioBtn) {
    attachAccessibleHandler(audioBtn, 'Dictionary Audio Playback Button', () => {
      const audioUrl = audioBtn.getAttribute('data-audio-url');
      dictionary_playAudio(audioUrl);
    });
  }

  // Synonym buttons (clickable to look up synonym)
  const synonymBtns = modal.querySelectorAll('.assist-dictionary-synonym');
  synonymBtns.forEach(btn => {
    attachAccessibleHandler(btn, 'Dictionary Synonym Button', () => {
      const word = btn.getAttribute('data-word');
      dictionary_lookup(word);
    });
  });
}

/**
 * Shows the dictionary modal with word definition
 *
 * @param {string} word - Word to look up
 * @param {{returnFocus?: HTMLElement}} [options] - Where focus goes when the dialog closes.
 *   Omitted by a lookup started from inside the dialog (a synonym), which keeps the target the
 *   first lookup was given.
 */
async function dictionary_lookup(word, options = {}) {
  if (options.returnFocus) {
    dictionary_returnFocus = options.returnFocus;
  }

  const words = dictionary_countWords(word);

  if (words === 0) {
    console.log('[Dictionary] Nothing to look up');
    return;
  }

  if (words > DICTIONARY_MAX_WORDS) {
    dictionary_showTooLong();
    return;
  }

  debugLog(`[Dictionary] Looking up: ${word}`);

  const lookupId = ++dictionary_lookupId;
  dictionary_showLoading(word);

  try {
    const data = await dictionary_fetchDefinition(word);
    if (lookupId !== dictionary_lookupId) {
      return; // The student closed the dialog while this was in the air.
    }
    dictionary_showDefinition(word, data);
  } catch (error) {
    if (lookupId !== dictionary_lookupId) {
      return;
    }
    if (error.kind === 'declined') {
      dictionary_showDeclined(word);
      return;
    }
    dictionary_showError(word, error);
  }
}

/**
 * Says that nothing was looked up because the student chose not to use the dictionary service,
 * and offers to allow it right here. Allowing runs the same lookup again.
 *
 * @param {string} word - The word the student asked about.
 */
function dictionary_showDeclined(word) {
  const modal = dictionary_createShell();

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 32px;
    max-width: 420px;
    color: #1a1a1a;
  `;

  const heading = document.createElement('h2');
  heading.id = 'assist-dictionary-title';
  heading.style.cssText = 'margin: 0 0 12px 0; font-size: 20px; color: #1a1a1a;';
  heading.textContent = 'Not looked up';

  const notice = createDeclinedNotice('dictionary', {
    onAllowed: () => dictionary_lookup(word),
    // The question asked again shows the word that would be sent, as the first one did.
    panelOptions: { detail: word.trim().toLowerCase() },
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'assist-dictionary-close';
  close.textContent = 'Close';
  close.style.cssText = `
    margin-top: 12px;
    background: transparent;
    border: 1px solid #767676;
    border-radius: 6px;
    padding: 10px 24px;
    min-height: 44px;
    color: #1a1a1a;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;
  attachAccessibleHandler(close, 'Dictionary Declined Close', () => dictionary_hide());

  content.append(heading, notice, close);
  modal.appendChild(content);

  dictionary_present(modal, '[data-assist-consent-notice] button');
}

/**
 * How many words a selection holds.
 *
 * @param {string} text - The selected text.
 * @returns {number} Word count.
 */
function dictionary_countWords(text) {
  return String(text === null || text === undefined ? '' : text)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Says that the selection is too long to look up, and asks for less. No request is made: the
 * API has nothing to say about a sentence, and asking it cost the student a timeout.
 */
function dictionary_showTooLong() {
  const modal = dictionary_createShell();

  modal.innerHTML = sanitizeHTML(`
    <div style="
      background: white;
      border-radius: 12px;
      padding: 32px;
      max-width: 400px;
      text-align: center;
    ">
      <div style="font-size: 48px; margin-bottom: 16px;" aria-hidden="true">📖</div>
      <h2 id="assist-dictionary-title" style="margin: 0 0 12px 0; font-size: 20px; color: #1a1a1a;">
        That is more than a word
      </h2>
      <p style="margin: 0 0 20px 0; color: #4a4a4a; line-height: 1.6;">
        Select one word or a short phrase and look it up again. The dictionary can define a word
        or two, but not a whole sentence.
      </p>
      <button
        class="assist-dictionary-close"
        style="
          background: #1a73e8;
          border: none;
          border-radius: 6px;
          padding: 10px 24px;
          min-height: 44px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        "
      >Close</button>
    </div>
  `);

  attachAccessibleHandler(
    modal.querySelector('.assist-dictionary-close'),
    'Dictionary Too Long Close',
    () => dictionary_hide()
  );

  dictionary_present(modal, '.assist-dictionary-close');
}

/**
 * The overlay every dictionary dialog shares: a labelled modal, so a screen reader is told
 * what it has landed in and the page behind is out of play.
 *
 * @returns {HTMLElement} The overlay element.
 */
function dictionary_createShell() {
  const modal = document.createElement('div');
  modal.id = 'assist-dictionary-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'assist-dictionary-title');
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
    z-index: ${Z.MODAL};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;
  return modal;
}

/**
 * Shows loading state
 *
 * @param {string} word - Word being looked up
 */
function dictionary_showLoading(word) {
  const modal = dictionary_createShell();

  modal.innerHTML = sanitizeHTML(`
    <div style="
      background: white;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
    ">
      <h2
        id="assist-dictionary-title"
        style="margin: 0 0 20px 0; font-size: 18px; font-weight: 400; color: #4a4a4a;"
      >Looking up &ldquo;${word}&rdquo;&hellip;</h2>
      <button
        class="assist-dictionary-close"
        style="
          background: transparent;
          border: 1px solid #767676;
          border-radius: 6px;
          padding: 10px 24px;
          min-height: 44px;
          color: #1a1a1a;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        "
      >Cancel</button>
    </div>
  `);

  // A wait with no way out is a trap. Cancel abandons the lookup, and Escape does the same.
  attachAccessibleHandler(
    modal.querySelector('.assist-dictionary-close'),
    'Dictionary Loading Cancel',
    () => dictionary_hide()
  );

  dictionary_present(modal, '.assist-dictionary-close');
}

/**
 * Shows the definition in modal
 *
 * @param {string} word - Word
 * @param {Object} data - Dictionary data
 */
function dictionary_showDefinition(word, data) {
  dictionary_present(dictionary_createModal(word, data), '.assist-dictionary-close');

  console.log('[Dictionary] Definition displayed');
}

/**
 * Shows error message
 *
 * @param {string} word - Word
 * @param {Error|string} error - the classified failure (see dictionary_failure)
 */
function dictionary_showError(word, error) {
  const { kind, detail, unreachable, icon, heading, body } = describeDictionaryFailure(word, error);

  const modal = dictionary_createShell();

  modal.innerHTML = sanitizeHTML(`
    <div style="
      background: white;
      border-radius: 12px;
      padding: 32px;
      max-width: 400px;
      text-align: center;
    ">
      <div style="font-size: 48px; margin-bottom: 16px;" aria-hidden="true">${icon}</div>
      <h2 id="assist-dictionary-title" style="margin: 0 0 12px 0; font-size: 20px; color: #1a1a1a;">${heading}</h2>
      <p style="margin: 0 0 20px 0; color: #4a4a4a; line-height: 1.6;">
        ${body}
      </p>
      <div style="display: flex; gap: 8px; justify-content: center;">
        ${
          unreachable
            ? `<button
        class="assist-dictionary-retry"
        style="
          background: #1a73e8;
          border: none;
          border-radius: 6px;
          padding: 10px 24px;
          min-height: 44px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        "
      >Try again</button>`
            : ''
        }
        <button
          class="assist-dictionary-close"
          style="
            background: ${unreachable ? 'transparent' : '#1a73e8'};
            border: ${unreachable ? '1px solid #767676' : 'none'};
            border-radius: 6px;
            padding: 10px 24px;
            min-height: 44px;
            color: ${unreachable ? '#1a1a1a' : 'white'};
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          "
        >Close</button>
      </div>
    </div>
  `);

  attachInteractiveHandler(modal, 'Dictionary Error Modal Backdrop', e => {
    if (e.target.classList && e.target.classList.contains('assist-dictionary-retry')) {
      dictionary_hide();
      dictionary_lookup(word);
      return;
    }
    if (e.target === modal || e.target.classList.contains('assist-dictionary-close')) {
      dictionary_hide();
    }
  });

  // Focus the primary action so the modal is operable from the keyboard the moment it opens.
  dictionary_present(modal, '.assist-dictionary-retry, .assist-dictionary-close');

  console.warn(`[Dictionary] ${kind}: ${detail}`);
}

/**
 * Puts a dialog on the page in place of whatever the dictionary was showing, and keeps the
 * keyboard inside it.
 *
 * Every one of these dialogs claims aria-modal="true", so Tab has to stay in and Escape has to
 * close (SC 2.1.2). Focus is moved explicitly rather than left where it was: the highlight menu
 * that opened the lookup activates on mousedown and is removed straight away, so there is
 * nothing for the trap to restore to and focus was dropping to the top of the page.
 *
 * @param {HTMLElement} modal - The dialog to show.
 * @param {string} initialFocusSelector - The control focus lands on inside it.
 */
function dictionary_present(modal, initialFocusSelector) {
  dictionary_teardown();

  document.body.appendChild(modal);
  dictionary_modal = modal;

  const initialFocus = modal.querySelector(initialFocusSelector);
  dictionary_releaseFocus = trapFocus(modal, {
    onEscape: () => dictionary_hide(),
    initialFocus,
  });
  // Now, not on the trap's next tick. One dictionary dialog replaces another (waiting, then the
  // definition), and in between focus sat on the page behind: a consent panel opened over the
  // waiting dialog remembered the page as the place to go back to, and the definition could be on
  // screen with focus still outside it.
  if (initialFocus) {
    initialFocus.focus();
  }
}

/**
 * Take down whatever is showing, without deciding where focus goes: used when one dictionary
 * dialog replaces another (loading to definition) and the keyboard never leaves the feature.
 */
function dictionary_teardown() {
  if (dictionary_releaseFocus) {
    dictionary_releaseFocus();
    dictionary_releaseFocus = null;
  }

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
 * Closes the dictionary for good: the dialog goes, a lookup still in flight is abandoned, and
 * focus goes back to the words the student had selected.
 */
function dictionary_hide() {
  dictionary_lookupId += 1;
  dictionary_teardown();
  returnFocusAfterDialog(dictionary_returnFocus);
  dictionary_returnFocus = null;
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

// Keyboard shortcut is now dynamically registered via shortcuts manager
// See initialization code in dictionary_init()

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
      console.log('[Dictionary] Settings loaded:', Object.keys(dictionary_settings).join(', '));
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
export function dictionary_cleanup() {
  console.log('[Dictionary] Cleaning up...');
  dictionary_hide();
  // Shortcut unregistration is handled automatically by shortcuts manager
}

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  dictionary_init();
}
