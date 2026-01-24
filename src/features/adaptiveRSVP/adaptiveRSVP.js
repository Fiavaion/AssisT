/**
 * Adaptive RSVP (Rapid Serial Visual Presentation) Feature
 *
 * Speed reading tool that displays text one word at a time with
 * adaptive pacing based on word complexity and user performance.
 *
 * Features:
 * - Word-by-word display with ORP (Optimal Recognition Point)
 * - Adaptive speed based on word length/complexity
 * - Pause on punctuation and paragraph breaks
 * - Comprehension checkpoints
 * - Integration with cognitive profile
 * - Keyboard controls (Space, Left/Right arrows)
 *
 * @module features/adaptiveRSVP
 */

import { showToast } from '../../core/ui/toast.js';
import { sanitizeHTML } from '../../utils/sanitize.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let rsvp_panel = null;
let rsvp_words = [];
let rsvp_currentIndex = 0;
let rsvp_isPlaying = false;
let rsvp_timeoutId = null;
let rsvp_startTime = null;
let rsvp_wordsRead = 0;

const rsvp_settings = {
  enabled: true,
  baseWPM: 300, // Words per minute
  adaptiveSpeed: true,
  pauseOnPunctuation: true,
  pauseMultiplier: 2.5,
  longWordThreshold: 8,
  longWordSlowdown: 1.3,
  showProgress: true,
  showORP: true, // Optimal Recognition Point highlighting
  fontSize: 48,
  comprehensionCheckpoints: true,
  checkpointInterval: 100, // Check comprehension every N words
};

// Word complexity factors
const COMPLEXITY_FACTORS = {
  // Punctuation pause multipliers
  '.': 2.5,
  '!': 2.5,
  '?': 2.5,
  ',': 1.5,
  ';': 1.8,
  ':': 1.8,
  '\n': 3.0,

  // Long word threshold adjustments per syllable
  syllableBase: 1.1,
};

// ============================================================================
// WORD PROCESSING
// ============================================================================

/**
 * Parse text into words with metadata
 * @param {string} text - Text to parse
 * @returns {Array} Array of word objects
 */
function rsvp_parseText(text) {
  const words = [];
  // Split on whitespace but keep punctuation attached
  const tokens = text.split(/(\s+)/).filter(t => t.trim());

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const cleanWord = token.replace(/[^\w'-]/g, '');

    if (!cleanWord) {
      continue;
    }

    // Calculate ORP (Optimal Recognition Point)
    // Research suggests the ORP is slightly left of center
    const orpIndex = Math.max(0, Math.floor(cleanWord.length * 0.35));

    // Estimate syllables (rough approximation)
    const syllables = rsvp_countSyllables(cleanWord);

    // Check for ending punctuation
    const endChar = token.charAt(token.length - 1);
    const punctuationPause = COMPLEXITY_FACTORS[endChar] || 1;

    // Check for paragraph break (multiple newlines in original)
    const isNewParagraph =
      i > 0 &&
      /\n\n/.test(
        text.substring(text.indexOf(tokens[i - 1]) + tokens[i - 1].length, text.indexOf(token))
      );

    words.push({
      text: token,
      cleanText: cleanWord,
      index: words.length,
      orpIndex,
      syllables,
      length: cleanWord.length,
      punctuationPause,
      isNewParagraph,
      isLongWord: cleanWord.length >= rsvp_settings.longWordThreshold,
    });
  }

  return words;
}

/**
 * Estimate syllable count
 * @param {string} word - Word to count
 * @returns {number} Estimated syllables
 */
function rsvp_countSyllables(word) {
  word = word.toLowerCase();
  if (word.length <= 3) {
    return 1;
  }

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');

  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

/**
 * Calculate display duration for a word
 * @param {Object} wordObj - Word object
 * @returns {number} Duration in milliseconds
 */
function rsvp_calculateDuration(wordObj) {
  const baseMs = 60000 / rsvp_settings.baseWPM;
  let duration = baseMs;

  if (!rsvp_settings.adaptiveSpeed) {
    return duration;
  }

  // Adjust for word length
  if (wordObj.isLongWord) {
    duration *= rsvp_settings.longWordSlowdown;
  }

  // Adjust for syllables
  if (wordObj.syllables > 2) {
    duration *= Math.pow(COMPLEXITY_FACTORS.syllableBase, wordObj.syllables - 2);
  }

  // Adjust for punctuation
  if (rsvp_settings.pauseOnPunctuation && wordObj.punctuationPause > 1) {
    duration *= wordObj.punctuationPause;
  }

  // Paragraph break
  if (wordObj.isNewParagraph) {
    duration *= COMPLEXITY_FACTORS['\n'];
  }

  return duration;
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the RSVP panel
 * @returns {HTMLElement}
 */
function rsvp_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-rsvp-reader';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Speed Reader');

  panel.innerHTML = sanitizeHTML(`
    <style>
      #assist-rsvp-reader {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 800px;
        background: #1a1a2e;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        z-index: 999998;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: white;
        overflow: hidden;
      }

      .rsvp-header {
        padding: 16px 20px;
        background: rgba(255,255,255,0.05);
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .rsvp-title {
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .rsvp-close {
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
      }

      .rsvp-close:hover {
        background: rgba(255,255,255,0.2);
      }

      .rsvp-display {
        padding: 60px 40px;
        min-height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      .rsvp-word-container {
        position: relative;
        text-align: center;
      }

      .rsvp-word {
        font-size: ${rsvp_settings.fontSize}px;
        font-weight: 500;
        font-family: "Georgia", serif;
        letter-spacing: 2px;
        white-space: nowrap;
      }

      .rsvp-word-orp {
        color: #ff6b6b;
      }

      .rsvp-word-before,
      .rsvp-word-after {
        color: #e0e0e0;
      }

      .rsvp-focus-line {
        position: absolute;
        left: 50%;
        top: -10px;
        width: 2px;
        height: calc(100% + 20px);
        background: rgba(255,107,107,0.3);
        transform: translateX(-50%);
      }

      .rsvp-progress-container {
        padding: 0 20px 20px;
      }

      .rsvp-progress-bar {
        height: 4px;
        background: rgba(255,255,255,0.1);
        border-radius: 2px;
        overflow: hidden;
      }

      .rsvp-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea, #764ba2);
        transition: width 0.1s ease-out;
      }

      .rsvp-stats {
        display: flex;
        justify-content: center;
        gap: 32px;
        padding: 8px 0;
        font-size: 13px;
        color: rgba(255,255,255,0.6);
      }

      .rsvp-stat {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .rsvp-stat-value {
        color: white;
        font-weight: 600;
      }

      .rsvp-controls {
        padding: 16px 20px;
        background: rgba(255,255,255,0.05);
        border-top: 1px solid rgba(255,255,255,0.1);
        display: flex;
        justify-content: center;
        gap: 12px;
      }

      .rsvp-btn {
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
      }

      .rsvp-btn:hover {
        background: rgba(255,255,255,0.2);
      }

      .rsvp-btn-primary {
        background: linear-gradient(135deg, #667eea, #764ba2);
      }

      .rsvp-btn-primary:hover {
        transform: scale(1.05);
      }

      .rsvp-speed-control {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 20px 16px;
      }

      .rsvp-speed-label {
        font-size: 13px;
        color: rgba(255,255,255,0.6);
        min-width: 100px;
      }

      .rsvp-speed-slider {
        flex: 1;
        height: 6px;
        appearance: none;
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
        outline: none;
      }

      .rsvp-speed-slider::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        border-radius: 50%;
        cursor: pointer;
      }

      .rsvp-speed-value {
        font-size: 14px;
        font-weight: 600;
        min-width: 80px;
        text-align: right;
      }

      .rsvp-shortcut-hint {
        text-align: center;
        padding: 8px;
        font-size: 11px;
        color: rgba(255,255,255,0.4);
      }

      .rsvp-checkpoint {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        text-align: center;
      }

      .rsvp-checkpoint-title {
        font-size: 24px;
        margin-bottom: 20px;
      }

      .rsvp-checkpoint-question {
        font-size: 18px;
        margin-bottom: 24px;
        max-width: 500px;
        line-height: 1.5;
      }

      .rsvp-checkpoint-options {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        max-width: 400px;
      }

      .rsvp-checkpoint-option {
        background: rgba(255,255,255,0.1);
        border: 2px solid transparent;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        cursor: pointer;
        text-align: left;
        font-size: 15px;
        transition: all 0.2s;
      }

      .rsvp-checkpoint-option:hover {
        background: rgba(255,255,255,0.2);
        border-color: rgba(255,255,255,0.3);
      }
    </style>

    <div class="rsvp-header">
      <div class="rsvp-title">
        <span>⚡</span>
        <span>Speed Reader (RSVP)</span>
      </div>
      <button class="rsvp-close" aria-label="Close">&times;</button>
    </div>

    <div class="rsvp-display" id="rsvp-display">
      <div class="rsvp-focus-line"></div>
      <div class="rsvp-word-container" id="rsvp-word-container">
        <span class="rsvp-word">
          <span class="rsvp-word-before"></span><span class="rsvp-word-orp"></span><span class="rsvp-word-after"></span>
        </span>
      </div>
    </div>

    <div class="rsvp-progress-container">
      <div class="rsvp-stats">
        <div class="rsvp-stat">
          <span>Progress:</span>
          <span class="rsvp-stat-value" id="rsvp-progress-text">0%</span>
        </div>
        <div class="rsvp-stat">
          <span>WPM:</span>
          <span class="rsvp-stat-value" id="rsvp-wpm">${rsvp_settings.baseWPM}</span>
        </div>
        <div class="rsvp-stat">
          <span>Time:</span>
          <span class="rsvp-stat-value" id="rsvp-time">0:00</span>
        </div>
      </div>
      <div class="rsvp-progress-bar">
        <div class="rsvp-progress-fill" id="rsvp-progress-fill" style="width: 0%"></div>
      </div>
    </div>

    <div class="rsvp-speed-control">
      <span class="rsvp-speed-label">Reading Speed:</span>
      <input type="range" class="rsvp-speed-slider" id="rsvp-speed"
             min="100" max="800" value="${rsvp_settings.baseWPM}" step="25">
      <span class="rsvp-speed-value" id="rsvp-speed-display">${rsvp_settings.baseWPM} WPM</span>
    </div>

    <div class="rsvp-controls">
      <button class="rsvp-btn" id="rsvp-prev" title="Previous word (Left arrow)">
        ⏮️ Back
      </button>
      <button class="rsvp-btn rsvp-btn-primary" id="rsvp-play" title="Play/Pause (Space)">
        ▶️ Play
      </button>
      <button class="rsvp-btn" id="rsvp-next" title="Next word (Right arrow)">
        Next ⏭️
      </button>
      <button class="rsvp-btn" id="rsvp-restart" title="Restart">
        🔄 Restart
      </button>
    </div>

    <div class="rsvp-shortcut-hint">
      Space: Play/Pause | Left/Right: Navigate | Esc: Close
    </div>
  `);

  return panel;
}

/**
 * Display a word with ORP highlighting
 * @param {Object} wordObj - Word object
 */
function rsvp_displayWord(wordObj) {
  if (!rsvp_panel) {
    return;
  }

  const container = rsvp_panel.querySelector('#rsvp-word-container');
  if (!container) {
    return;
  }

  const word = wordObj.text;
  const orpIndex = wordObj.orpIndex;

  if (rsvp_settings.showORP) {
    const before = word.substring(0, orpIndex);
    const orp = word.charAt(orpIndex);
    const after = word.substring(orpIndex + 1);

    container.innerHTML = sanitizeHTML(`
      <span class="rsvp-word">
        <span class="rsvp-word-before">${before}</span><span class="rsvp-word-orp">${orp}</span><span class="rsvp-word-after">${after}</span>
      </span>
    `);
  } else {
    container.innerHTML = sanitizeHTML(`<span class="rsvp-word">${word}</span>`);
  }

  // Update progress
  rsvp_updateStats();
}

/**
 * Update statistics display
 */
function rsvp_updateStats() {
  if (!rsvp_panel) {
    return;
  }

  const progress =
    rsvp_words.length > 0 ? Math.round((rsvp_currentIndex / rsvp_words.length) * 100) : 0;

  const progressText = rsvp_panel.querySelector('#rsvp-progress-text');
  const progressFill = rsvp_panel.querySelector('#rsvp-progress-fill');
  const wpmDisplay = rsvp_panel.querySelector('#rsvp-wpm');
  const timeDisplay = rsvp_panel.querySelector('#rsvp-time');

  if (progressText) {
    progressText.textContent = `${progress}%`;
  }
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }
  if (wpmDisplay) {
    wpmDisplay.textContent = rsvp_settings.baseWPM;
  }

  if (timeDisplay && rsvp_startTime) {
    const elapsed = Math.floor((Date.now() - rsvp_startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================

/**
 * Play/resume RSVP
 */
function rsvp_play() {
  if (rsvp_isPlaying || rsvp_currentIndex >= rsvp_words.length) {
    return;
  }

  rsvp_isPlaying = true;

  if (!rsvp_startTime) {
    rsvp_startTime = Date.now();
  }

  const playBtn = rsvp_panel?.querySelector('#rsvp-play');
  if (playBtn) {
    playBtn.innerHTML = sanitizeHTML('⏸️ Pause');
  }

  rsvp_showNextWord();
}

/**
 * Pause RSVP
 */
function rsvp_pause() {
  rsvp_isPlaying = false;

  if (rsvp_timeoutId) {
    clearTimeout(rsvp_timeoutId);
    rsvp_timeoutId = null;
  }

  const playBtn = rsvp_panel?.querySelector('#rsvp-play');
  if (playBtn) {
    playBtn.innerHTML = sanitizeHTML('▶️ Play');
  }
}

/**
 * Toggle play/pause
 */
function rsvp_toggle() {
  if (rsvp_isPlaying) {
    rsvp_pause();
  } else {
    rsvp_play();
  }
}

/**
 * Show the next word
 */
function rsvp_showNextWord() {
  if (!rsvp_isPlaying || rsvp_currentIndex >= rsvp_words.length) {
    if (rsvp_currentIndex >= rsvp_words.length) {
      rsvp_onComplete();
    }
    return;
  }

  const wordObj = rsvp_words[rsvp_currentIndex];
  rsvp_displayWord(wordObj);
  rsvp_wordsRead++;

  // Check for comprehension checkpoint
  if (
    rsvp_settings.comprehensionCheckpoints &&
    rsvp_wordsRead > 0 &&
    rsvp_wordsRead % rsvp_settings.checkpointInterval === 0
  ) {
    rsvp_pause();
    // Could show comprehension check here
    // For now, just pause briefly
  }

  const duration = rsvp_calculateDuration(wordObj);

  rsvp_currentIndex++;
  rsvp_timeoutId = setTimeout(rsvp_showNextWord, duration);
}

/**
 * Go to previous word
 */
function rsvp_prev() {
  const wasPaused = !rsvp_isPlaying;
  rsvp_pause();

  rsvp_currentIndex = Math.max(0, rsvp_currentIndex - 2);

  if (rsvp_currentIndex < rsvp_words.length) {
    rsvp_displayWord(rsvp_words[rsvp_currentIndex]);
    rsvp_currentIndex++;
  }

  if (!wasPaused) {
    rsvp_play();
  }
}

/**
 * Go to next word
 */
function rsvp_next() {
  const wasPaused = !rsvp_isPlaying;
  rsvp_pause();

  if (rsvp_currentIndex < rsvp_words.length) {
    rsvp_displayWord(rsvp_words[rsvp_currentIndex]);
    rsvp_currentIndex++;
  }

  if (!wasPaused && rsvp_currentIndex < rsvp_words.length) {
    rsvp_play();
  }
}

/**
 * Restart from beginning
 */
function rsvp_restart() {
  rsvp_pause();
  rsvp_currentIndex = 0;
  rsvp_wordsRead = 0;
  rsvp_startTime = null;

  if (rsvp_words.length > 0) {
    rsvp_displayWord(rsvp_words[0]);
    rsvp_currentIndex = 1;
  }

  rsvp_updateStats();
}

/**
 * Handle completion
 */
function rsvp_onComplete() {
  rsvp_pause();

  const elapsed = rsvp_startTime ? (Date.now() - rsvp_startTime) / 1000 / 60 : 1;
  const actualWPM = Math.round(rsvp_wordsRead / elapsed);

  showToast?.(`Reading complete! ${rsvp_wordsRead} words at ~${actualWPM} WPM`);

  // Track to cognitive profile
  window.assistFeatures?.cognitiveProfile?.track('rsvp', {
    wordsRead: rsvp_wordsRead,
    actualWPM,
    targetWPM: rsvp_settings.baseWPM,
    duration: elapsed,
  });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function rsvp_setupEvents() {
  if (!rsvp_panel) {
    return;
  }

  // Close button
  rsvp_panel.querySelector('.rsvp-close').onclick = rsvp_hide;

  // Control buttons
  rsvp_panel.querySelector('#rsvp-play').onclick = rsvp_toggle;
  rsvp_panel.querySelector('#rsvp-prev').onclick = rsvp_prev;
  rsvp_panel.querySelector('#rsvp-next').onclick = rsvp_next;
  rsvp_panel.querySelector('#rsvp-restart').onclick = rsvp_restart;

  // Speed slider
  const speedSlider = rsvp_panel.querySelector('#rsvp-speed');
  const speedDisplay = rsvp_panel.querySelector('#rsvp-speed-display');

  speedSlider.oninput = e => {
    rsvp_settings.baseWPM = parseInt(e.target.value, 10);
    speedDisplay.textContent = `${rsvp_settings.baseWPM} WPM`;
    rsvp_updateStats();
  };

  // Keyboard shortcuts
  document.addEventListener('keydown', rsvp_handleKeydown);
}

function rsvp_handleKeydown(e) {
  if (!rsvp_panel || rsvp_panel.style.display === 'none') {
    return;
  }

  // Don't capture if typing in input
  if (e.target.matches('input, textarea')) {
    return;
  }

  switch (e.key) {
    case ' ':
      e.preventDefault();
      rsvp_toggle();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      rsvp_prev();
      break;
    case 'ArrowRight':
      e.preventDefault();
      rsvp_next();
      break;
    case 'Escape':
      e.preventDefault();
      rsvp_hide();
      break;
    case 'ArrowUp':
      e.preventDefault();
      rsvp_settings.baseWPM = Math.min(800, rsvp_settings.baseWPM + 25);
      if (rsvp_panel) {
        rsvp_panel.querySelector('#rsvp-speed').value = rsvp_settings.baseWPM;
        rsvp_panel.querySelector('#rsvp-speed-display').textContent =
          `${rsvp_settings.baseWPM} WPM`;
      }
      break;
    case 'ArrowDown':
      e.preventDefault();
      rsvp_settings.baseWPM = Math.max(100, rsvp_settings.baseWPM - 25);
      if (rsvp_panel) {
        rsvp_panel.querySelector('#rsvp-speed').value = rsvp_settings.baseWPM;
        rsvp_panel.querySelector('#rsvp-speed-display').textContent =
          `${rsvp_settings.baseWPM} WPM`;
      }
      break;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the RSVP panel
 */
function rsvp_show() {
  if (!rsvp_panel) {
    rsvp_panel = rsvp_createPanel();
    document.body.appendChild(rsvp_panel);
    rsvp_setupEvents();
  }

  rsvp_panel.style.display = 'block';
}

/**
 * Hide the RSVP panel
 */
function rsvp_hide() {
  rsvp_pause();

  if (rsvp_panel) {
    rsvp_panel.style.display = 'none';
  }

  document.removeEventListener('keydown', rsvp_handleKeydown);
}

/**
 * Start RSVP with text
 * @param {string} text - Text to read
 */
function rsvp_start(text) {
  if (!text || text.trim().length < 10) {
    showToast?.('Please select more text for speed reading');
    return;
  }

  rsvp_show();

  // Parse text into words
  rsvp_words = rsvp_parseText(text);
  rsvp_currentIndex = 0;
  rsvp_wordsRead = 0;
  rsvp_startTime = null;

  if (rsvp_words.length > 0) {
    rsvp_displayWord(rsvp_words[0]);
    rsvp_currentIndex = 1;
  }

  rsvp_updateStats();

  // Auto-start after a brief delay
  setTimeout(() => {
    if (rsvp_panel && rsvp_panel.style.display !== 'none') {
      rsvp_play();
    }
  }, 500);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function rsvp_init() {
  console.log('[AdaptiveRSVP] Initializing...');

  // Register to window
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.adaptiveRSVP = {
    show: rsvp_show,
    hide: rsvp_hide,
    start: rsvp_start,
    play: rsvp_play,
    pause: rsvp_pause,
    settings: rsvp_settings,
  };

  // Load settings
  chrome.storage.local.get(['adaptiveRSVPSettings'], result => {
    if (result.adaptiveRSVPSettings) {
      Object.assign(rsvp_settings, result.adaptiveRSVPSettings);
    }
  });

  console.log('[AdaptiveRSVP] Initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  rsvp_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { rsvp_show, rsvp_hide, rsvp_start, rsvp_settings };
