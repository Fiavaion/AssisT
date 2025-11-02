/**
 * @fileoverview AssisT Content Script - Application Orchestrator
 *
 * ARCHITECTURAL PATTERN: Orchestrator (Central Coordinator)
 *
 * This file serves as the MAIN ORCHESTRATOR for the AssisT extension, coordinating
 * all features and managing core TTS (Text-to-Speech) functionality. It follows the
 * Orchestrator pattern where a central controller manages application flow and
 * provides core services to feature modules.
 *
 * CORE RESPONSIBILITIES:
 * 1. TTS Engine Management (readText, settings, synth, voice loading)
 * 2. User Interaction Handlers (click detection, keyboard shortcuts)
 * 3. Feature Module Coordination (initializes and provides dependencies)
 * 4. Chrome Storage Integration (TTS settings persistence)
 * 5. Speech Synthesis Lifecycle (utterance management, pause/resume, cleanup)
 *
 * WHY TTS STAYS HERE (Not Extracted):
 * - TTS is INFRASTRUCTURE, not a feature - like a database connection
 * - Every module depends on it (Canvas, Moodle, Quiz Helper, click handlers)
 * - Extracting would create circular dependencies and complexity
 * - Orchestrator pattern keeps core services centralized
 * - This is architecturally sound: React has App.js, Express has server.js
 *
 * MODULARIZATION COMPLETE:
 * - ✅ Isolated Features: textCustomization, screenOverlay, dyslexia, focusMode, readingGuide
 * - ✅ LMS Integrations: Canvas, Moodle, Google Classroom (with Quiz Helper)
 * - ✅ Utilities: toast, color, highlighting, readPage
 * - ✅ STT: Speech-to-Text (separate concern)
 * - ✅ 19 modules created, 46% modularization (strategically complete)
 * - ⚠️ TTS remains here as CORE ORCHESTRATION (intentional architectural decision)
 *
 * FILE STRUCTURE:
 * - Lines 1-20: Module imports
 * - Lines 24-209: TTS Core (state, settings, voice management, Chrome storage)
 * - Lines 223-299: readText() - Main TTS function
 * - Lines 302-302: Module initialization (Canvas dependency injection)
 * - Lines 305-392: Click handler (main user interaction)
 * - Lines 395-484: Keyboard shortcuts (Space, +/-, pause/resume, speed control)
 * - Lines 486-624: Extraction documentation comments
 *
 * @module content-simple
 * @requires core/ui/toast
 * @requires core/utils/color
 * @requires core/dom/highlighting
 * @requires features/lms/canvas
 * @requires features/lms/moodle
 * @requires features/lms/googleClassroom
 * @see {@link https://github.com/anthropics/claude-code} - Built with Claude Code
 */

// ============================================================
// MODULE IMPORTS
// ============================================================
import { showToast } from '../core/ui/toast.js';
import { removeHighlight, highlightElement, removeElementHighlight, highlightWordByWord, cleanupWordByWord } from '../core/dom/highlighting.js';
import { dyslexia_initialize } from '../content/features/dyslexia.js';
import { readingGuide_updateStyle, readingGuide_handleMouseMove } from '../features/readingGuide/readingGuide.js';
import { screenOverlay_create, screenOverlay_remove, screenOverlay_update, screenOverlay_enable, screenOverlay_disable, screenOverlay_settings } from '../features/screenOverlay/screenOverlay.js';
import '../features/textCustomization/textCustomization.js'; // Self-initializing module with Chrome storage listeners
import '../features/focusMode/focusMode.js'; // Self-initializing module with Chrome storage listeners
import '../features/stt/stt.js'; // Self-initializing module with Chrome storage listeners
import { initializeCanvasModule } from '../features/lms/canvas.js'; // Self-initializing module with Chrome storage listeners
import '../features/lms/moodle.js'; // Self-initializing module with Chrome storage listeners
import '../features/lms/googleClassroom.js'; // Self-initializing module with Chrome storage listeners

// ============================================================
// TTS CORE - STATE & CONFIGURATION
// ============================================================
// This section manages the core TTS state and configuration.
// TTS is the foundation service provided by the orchestrator to all feature modules.

// TTS State
let currentUtterance = null;
let currentElement = null;
let currentText = '';
let isPaused = false; // Manual pause state tracker
// Note: currentHighlight and wordHighlightInterval moved to src/core/dom/highlighting.js

/**
 * TTS Settings Object
 *
 * ⚠️ CRITICAL: This object is injected into feature modules (Canvas, Moodle, etc.)
 * Changes to property names will BREAK all dependent modules.
 *
 * Safe changes:
 * - ✅ Add new optional properties (modules ignore unknown properties)
 * - ✅ Change default values (test all features)
 *
 * Unsafe changes:
 * - ❌ Rename existing properties (breaks dependency injection)
 * - ❌ Remove properties (breaks modules that read them)
 * - ❌ Change property types (causes type errors)
 *
 * @type {Object}
 */
const settings = {
  enabled: false, // TTS master toggle
  highlightEnabled: true,
  highlightColor: '#FFEB3B',
  highlightOpacity: 0.7,
  wordByWordEnabled: false,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  voice: null,
};

/**
 * Validate settings object to prevent breaking changes
 * @param {Object} settingsObj - Settings object to validate
 * @returns {boolean} True if valid
 */
function validateSettings(settingsObj) {
  if (!settingsObj || typeof settingsObj !== 'object') {
    console.error('[AssisT] Invalid settings object');
    return false;
  }

  // Required properties
  const required = ['enabled', 'highlightEnabled', 'highlightColor', 'rate', 'pitch', 'volume'];
  for (const prop of required) {
    if (!(prop in settingsObj)) {
      console.error(`[AssisT] Missing required setting: ${prop}`);
      return false;
    }
  }

  // Type validation
  if (typeof settingsObj.enabled !== 'boolean') {
    console.error('[AssisT] settings.enabled must be boolean');
    return false;
  }

  if (typeof settingsObj.rate !== 'number' || settingsObj.rate < 0.1 || settingsObj.rate > 10) {
    console.error('[AssisT] settings.rate must be number between 0.1 and 10');
    return false;
  }

  return true;
}

// ============================================================
// TTS CORE - VOICE MANAGEMENT
// ============================================================

// Initialize speech synthesis
const synth = window.speechSynthesis;

/**
 * Load available voices and set default preferred voice
 * Preference order: Google UK Female > UK Female > Any English Female
 */
function loadVoices() {
  const voices = synth.getVoices();

  // Try to find Google UK Female
  const preferredVoice =
    voices.find(
      v => v.name.includes('Google') && v.name.includes('UK') && v.name.includes('Female')
    ) ||
    voices.find(v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female')) ||
    voices.find(v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('female'));

  if (preferredVoice && !settings.voice) {
    settings.voice = preferredVoice;
    console.log('[AssisT] Default voice:', preferredVoice.name);
  }
}

// Load voices immediately and on change
if (synth.getVoices().length > 0) {
  loadVoices();
}
synth.addEventListener('voiceschanged', loadVoices);

// ============================================================
// TTS CORE - CHROME STORAGE INTEGRATION
// ============================================================
// Load and persist TTS settings from Chrome storage

// Initial settings load
chrome.storage.local.get('assist_settings', result => {
  console.log('[AssisT] Raw storage result:', result);

  if (result.assist_settings && result.assist_settings.tts) {
    const ttsSettings = result.assist_settings.tts;
    settings.enabled = ttsSettings.enabled !== undefined ? ttsSettings.enabled : false;
    settings.highlightEnabled =
      ttsSettings.highlightEnabled !== undefined
        ? ttsSettings.highlightEnabled
        : settings.highlightEnabled;
    settings.highlightColor = ttsSettings.highlightColor || settings.highlightColor;
    settings.highlightOpacity = ttsSettings.highlightOpacity || settings.highlightOpacity;
    settings.wordByWordEnabled = ttsSettings.wordByWordEnabled || false;
    settings.rate = ttsSettings.rate || settings.rate;
    settings.pitch = ttsSettings.pitch || settings.pitch;
    settings.volume = ttsSettings.volume || settings.volume;

    // Load voice by name
    if (ttsSettings.voice && ttsSettings.voice !== 'default') {
      const voices = synth.getVoices();
      const voice = voices.find(v => v.name === ttsSettings.voice);
      if (voice && voice.name !== settings.voice?.name) {
        settings.voice = voice;
        console.log('[AssisT] Voice loaded from settings:', voice.name);
      }
    }

    console.log('[AssisT] Settings loaded, TTS enabled:', settings.enabled);
  } else {
    console.warn(
      '[AssisT] No settings found in storage - using defaults. TTS enabled:',
      settings.enabled
    );
  }
});

// Listen for settings updates (debounced to prevent loops)
let updateTimeout = null;
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && updateTimeout === null) {
    updateTimeout = setTimeout(() => {
      const ttsSettings = changes.assist_settings.newValue?.tts;
      if (ttsSettings) {
        const oldRate = settings.rate;
        const oldPitch = settings.pitch;
        const oldVolume = settings.volume;
        const oldColor = settings.highlightColor;
        const oldOpacity = settings.highlightOpacity;
        const oldHighlightEnabled = settings.highlightEnabled;
        const oldTTSEnabled = settings.enabled;

        settings.enabled = ttsSettings.enabled !== undefined ? ttsSettings.enabled : false;
        settings.highlightEnabled =
          ttsSettings.highlightEnabled !== undefined
            ? ttsSettings.highlightEnabled
            : settings.highlightEnabled;
        settings.highlightColor = ttsSettings.highlightColor || settings.highlightColor;
        settings.highlightOpacity = ttsSettings.highlightOpacity || settings.highlightOpacity;
        settings.wordByWordEnabled = ttsSettings.wordByWordEnabled || false;
        settings.rate = ttsSettings.rate || settings.rate;
        settings.pitch = ttsSettings.pitch || settings.pitch;
        settings.volume = ttsSettings.volume || settings.volume;

        // If TTS was disabled, stop any current speech
        if (!settings.enabled && oldTTSEnabled && synth.speaking) {
          synth.cancel();
          cleanupWordByWord(currentElement);
          removeHighlight();
          removeElementHighlight(currentElement);
          if (currentElement) {
            currentElement.style.outline = '';
            currentElement.style.outlineOffset = '';
          }
          currentUtterance = null;
          currentElement = null;
          currentText = '';
          isPaused = false;
          console.log('[AssisT] TTS disabled, speech stopped');
        }

        // Update voice only if changed
        if (
          ttsSettings.voice &&
          ttsSettings.voice !== 'default' &&
          ttsSettings.voice !== settings.voice?.name
        ) {
          const voices = synth.getVoices();
          const voice = voices.find(v => v.name === ttsSettings.voice);
          if (voice) {
            settings.voice = voice;
            console.log('[AssisT] Voice updated:', voice.name);
          }
        }

        // If highlighting was disabled, remove current highlight
        if (!settings.highlightEnabled && oldHighlightEnabled && currentElement) {
          removeElementHighlight(currentElement);
          console.log('[AssisT] Highlighting disabled');
        }

        // If highlighting was enabled, add highlight to current element
        if (settings.highlightEnabled && !oldHighlightEnabled && currentElement) {
          highlightElement(currentElement, settings);
          console.log('[AssisT] Highlighting enabled');
        }

        // If highlight color or opacity changed and we're currently highlighting, update it
        if (
          settings.highlightEnabled &&
          (settings.highlightColor !== oldColor || settings.highlightOpacity !== oldOpacity) &&
          currentElement
        ) {
          highlightElement(currentElement, settings);
        }

        // If currently speaking, restart with new settings
        if (
          currentUtterance &&
          synth.speaking &&
          (settings.rate !== oldRate ||
            settings.pitch !== oldPitch ||
            settings.volume !== oldVolume)
        ) {
          const wasPaused = synth.paused;
          const element = currentElement;
          const text = currentText;

          synth.cancel();
          setTimeout(() => {
            readText(text, element);
            if (wasPaused) {
              setTimeout(() => synth.pause(), 100);
            }
          }, 50);
        }
      }
      updateTimeout = null;
    }, 100);
  }
});

// ✂️ EXTRACTED: removeHighlight() moved to src/core/dom/highlighting.js (Phase 1, Step 3)

// ✂️ EXTRACTED: hexToRgba() moved to src/core/utils/color.js (Phase 1, Step 2)

// ✂️ EXTRACTED: highlightElement() moved to src/core/dom/highlighting.js (Phase 1, Step 3)

// ✂️ EXTRACTED: highlightWordByWord() moved to src/core/dom/highlighting.js (Phase 1, Step 3)

// ✂️ EXTRACTED: cleanupWordByWord() moved to src/core/dom/highlighting.js (Phase 1, Step 3)

// ✂️ EXTRACTED: removeElementHighlight() moved to src/core/dom/highlighting.js (Phase 1, Step 3)

// ============================================================
// TTS CORE - MAIN ENGINE
// ============================================================

/**
 * Read text aloud using TTS with synchronized highlighting
 *
 * IMPORTANT: This is a CORE FUNCTION used by all modules (Canvas, Moodle, Quiz Helper, etc.)
 * DO NOT change the function signature without updating ALL dependent modules.
 *
 * @param {string} text - Text to read aloud
 * @param {HTMLElement} element - DOM element to highlight while reading
 * @returns {void}
 *
 * @example
 * // Basic usage
 * readText("Hello world", paragraphElement);
 *
 * @example
 * // From Canvas module
 * readTextFunction(assignmentText, assignmentElement);
 */
function readText(text, element) {
  // Defensive checks
  if (!text || typeof text !== 'string' || text.trim() === '') {
    console.warn('[AssisT] readText called with invalid text:', text);
    return;
  }

  if (!element || !(element instanceof HTMLElement)) {
    console.warn('[AssisT] readText called with invalid element:', element);
    return;
  }

  if (!settings || typeof settings !== 'object') {
    console.error('[AssisT] Settings object is invalid');
    return;
  }

  // Cancel previous speech if any
  if (synth.speaking) {
    synth.cancel();
  }

  // Wait a tiny bit for cancel to complete
  setTimeout(() => {
    currentElement = element;
    currentText = text;
    isPaused = false; // Reset pause state

    console.log('[AssisT] Reading:', text.substring(0, 50) + '...');

    // Add outline
    element.style.outline = '2px solid #2196F3';
    element.style.outlineOffset = '2px';

    // Highlight based on settings
    if (settings.wordByWordEnabled && settings.highlightEnabled) {
      // Use word-by-word highlighting
      highlightWordByWord(element, text, settings.rate, settings);
    } else {
      // Use whole-element highlighting
      highlightElement(element, settings);
    }

    // Create utterance
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = settings.rate;
    currentUtterance.pitch = settings.pitch;
    currentUtterance.volume = settings.volume;

    if (settings.voice) {
      currentUtterance.voice = settings.voice;
    }

    // Clean up on end
    currentUtterance.onend = () => {
      cleanupWordByWord(currentElement);
      removeHighlight();
      removeElementHighlight(currentElement);
      if (currentElement) {
        currentElement.style.outline = '';
        currentElement.style.outlineOffset = '';
      }
      currentUtterance = null;
      currentElement = null;
      currentText = '';
      isPaused = false;
      console.log('[AssisT] Reading complete');
    };

    // Handle errors
    currentUtterance.onerror = event => {
      console.error('[AssisT] Speech error:', event.error);
      cleanupWordByWord(currentElement);
      removeHighlight();
      removeElementHighlight(currentElement);
      if (currentElement) {
        currentElement.style.outline = '';
        currentElement.style.outlineOffset = '';
      }
      currentElement = null;
      currentText = '';
      isPaused = false;
    };

    // Speak!
    synth.speak(currentUtterance);
  }, 50); // Small delay to avoid race condition
}

// ============================================================
// FEATURE MODULE INITIALIZATION
// ============================================================
// Initialize feature modules with TTS dependencies (Dependency Injection)

/**
 * Validate dependencies before passing to modules
 * This prevents breaking changes from propagating to feature modules
 */
if (!validateSettings(settings)) {
  console.error('[AssisT] Settings validation failed - modules may not work correctly');
}

if (typeof readText !== 'function') {
  console.error('[AssisT] readText is not a function - dependency injection will fail');
}

// Canvas module needs readText function and settings object
// ⚠️ CRITICAL: If you change readText signature or settings structure,
// update initializeCanvasModule() in canvas.js accordingly
initializeCanvasModule(readText, settings);

// ============================================================
// USER INTERACTION - CLICK HANDLER
// ============================================================
// Main click detection for reading text on click

// Click handler - Detects clicks on readable elements and triggers TTS
document.addEventListener(
  'click',
  e => {
    // Don't intercept links/buttons first
    if (e.target.closest('a, button, input, textarea, select, [role="button"]')) {
      return;
    }

    // Don't read if TTS is disabled
    if (!settings.enabled) {
      // Check if they clicked on readable content to show helpful message
      let target = e.target;
      while (target && target !== document.body) {
        const tag = target.tagName?.toLowerCase();
        if (
          tag &&
          [
            'p',
            'li',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'blockquote',
            'div',
            'article',
            'section',
          ].includes(tag)
        ) {
          const text = target.textContent?.trim();
          if (text && text.length > 10) {
            showToast('⚠️ TTS is disabled. Enable it in the popup to read text.');
            console.log('[AssisT] Click ignored - TTS is disabled');
            break;
          }
        }
        target = target.parentElement;
      }
      return;
    }

    // Find text container
    let target = e.target;
    let textElement = null;

    while (target && target !== document.body) {
      const tag = target.tagName?.toLowerCase();

      if (
        tag &&
        [
          'p',
          'li',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'blockquote',
          'div',
          'article',
          'section',
        ].includes(tag)
      ) {
        const text = target.textContent?.trim();

        if (text && text.length > 10) {
          textElement = target;
          break;
        }
      }

      target = target.parentElement;
    }

    if (textElement) {
      e.preventDefault();
      e.stopPropagation();

      const text = textElement.textContent.trim();
      readText(text, textElement);
    }
  },
  true
);

// ============================================================
// USER INTERACTION - KEYBOARD SHORTCUTS
// ============================================================
// Keyboard controls for TTS playback (Space, +, -)

// Keyboard shortcuts - Space (pause/resume), +/- (speed control)
document.addEventListener(
  'keydown',
  e => {
    // Skip if typing in input fields
    const target = e.target;
    if (target.matches('input, textarea, [contenteditable="true"]')) {
      return;
    }

    // Space - pause/resume
    if (e.key === ' ' || e.code === 'Space') {
      // Only handle if we have an active utterance
      if (currentUtterance) {
        e.preventDefault();
        e.stopPropagation();

        console.log(
          '[AssisT] Spacebar pressed. isPaused:',
          isPaused,
          'synth.speaking:',
          synth.speaking,
          'synth.paused:',
          synth.paused
        );

        // Use our manual state tracker
        if (isPaused) {
          // Resume
          synth.resume();
          isPaused = false;
          showToast('▶️ Resumed');
          console.log('[AssisT] Resumed playback');
        } else {
          // Pause
          synth.pause();
          isPaused = true;
          showToast('⏸️ Paused');
          console.log('[AssisT] Paused playback');
        }
      }
    }

    // + or = - speed up
    if ((e.key === '+' || e.key === '=') && (e.shiftKey || e.key === '+')) {
      e.preventDefault();
      e.stopPropagation();
      settings.rate = Math.min(2.0, settings.rate + 0.1);
      showToast('Speed: ' + settings.rate.toFixed(1) + 'x');
      console.log('[AssisT] Speed:', settings.rate.toFixed(1) + 'x');

      // Apply immediately if speaking
      if (currentUtterance && synth.speaking) {
        const text = currentText;
        const element = currentElement;
        const wasPaused = synth.paused;
        synth.cancel();
        setTimeout(() => {
          readText(text, element);
          if (wasPaused) {
            setTimeout(() => synth.pause(), 100);
          }
        }, 50);
      }
    }

    // - or _ - slow down
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      e.stopPropagation();
      settings.rate = Math.max(0.5, settings.rate - 0.1);
      showToast('Speed: ' + settings.rate.toFixed(1) + 'x');
      console.log('[AssisT] Speed:', settings.rate.toFixed(1) + 'x');

      // Apply immediately if speaking
      if (currentUtterance && synth.speaking) {
        const text = currentText;
        const element = currentElement;
        const wasPaused = synth.paused;
        synth.cancel();
        setTimeout(() => {
          readText(text, element);
          if (wasPaused) {
            setTimeout(() => synth.pause(), 100);
          }
        }, 50);
      }
    }
  },
  true
); // Use capture phase for better priority

// ============================================================
// EXTRACTION DOCUMENTATION
// ============================================================
// This section documents all features and utilities that have been
// extracted to separate modules during the modularization process.
// ============================================================

// ============================================================
// TOAST NOTIFICATION - EXTRACTED TO MODULE
// ============================================================
// showToast() has been extracted to: src/core/ui/toast.js
// Imported at top of file with: import { showToast } from '../../core/ui/toast.js';
// All 41+ call sites in this file continue to work unchanged.
// Vite bundles the module into the final content script.
// Phase 1, Step 1 of modularization (2025-10-30 - SUCCESS WITH VITE)

// ============================================================
// SPRINT 3 FEATURE: TEXT CUSTOMIZATION
// ============================================================

// ✂️ EXTRACTED: Text Customization module moved to src/features/textCustomization/textCustomization.js (Phase 1, Modularization)
// Imported at top of file with: import '../features/textCustomization/textCustomization.js';
//
// This is a self-initializing module that:
// - Manages all text customization state internally
// - Handles Chrome storage listeners for settings persistence
// - Automatically applies settings on module load
// - Provides toast notifications for enable/disable actions
//
// Extracted functions:
// - textCustomization_apply() - Applies text customization to the page
// - textCustomization_remove() - Removes text customization
// - textCustomization_generateCSS() - Generates WCAG 2.2 SC 1.4.12 compliant CSS
// - textCustomization_loadLexend() - Loads Lexend font from Google Fonts
// - textCustomization_loadOpenDyslexic() - Loads OpenDyslexic font from CDN
//
// Extracted state:
// - textCustomization_enabled - Enable/disable flag
// - textCustomization_styleElement - Reference to injected style element
// - textCustomization_fontLinkElement - Reference to font link element
// - textCustomization_settings - Typography settings object
// - textCustomization_fontMap - Font family mapping
//
// Extracted Chrome storage integration:
// - chrome.storage.local.get() - Loads settings on module initialization
// - chrome.storage.onChanged.addListener() - Listens for real-time settings updates
//
// Module operates independently via Vite bundling.
// Phase 1, Modularization (2025-10-30)

// ============================================================
// ============================================================
// SPRINT 3 FEATURE: READING GUIDE
// ============================================================
// EXTRACTION COMMENT: All readingGuide functions and state have been
// extracted to src/features/readingGuide/readingGuide.js
//
// Functions extracted (and imported at top of file):
// - readingGuide_createLine()
// - readingGuide_updatePosition()
// - readingGuide_updateStyle()
// - readingGuide_enable()
// - readingGuide_disable()
// - readingGuide_handleMouseMove()
//
// State variables (now managed in module):
// - readingGuide_enabled
// - readingGuide_lineElement
// - readingGuide_settings
//
// Storage initialization and listeners are now handled in the module.
// See: src/features/readingGuide/readingGuide.js for implementation.
// ============================================================

// ============================================================
// SPRINT 3 FEATURE: FOCUS MODE
// ============================================================
// ✂️ EXTRACTED: Focus Mode moved to src/features/focusMode/focusMode.js (Phase 2)
// All Focus Mode state, functions, and Chrome storage listeners now in module:
// - focusMode_createWindow(), focusMode_updatePosition(), focusMode_updateStyle()
// - focusMode_enable(), focusMode_disable(), focusMode_handleMouseMove()
// - Self-initializing module imported above

// ============================================================
// ✂️ EXTRACTED: Canvas Integration moved to src/features/lms/canvas.js (Phase 2)
// All Canvas LMS integration state, functions, and Chrome storage listeners now in module:
// - canvas_loadAdapter() - Dynamic adapter loading
// - canvas_initialize() - Main initialization
// - canvas_initializeAssignmentReader() - Assignment FAB setup
// - canvas_readAssignment() - Read assignment content
// - canvas_removeFAB() - Cleanup function
// - Self-initializing module imported above
// ============================================================

// ============================================================
// ✂️ EXTRACTED: Moodle LMS Integration moved to src/features/lms/moodle.js (Phase 2)
// All Moodle integration state, functions, and Chrome storage listeners now in module:
// - moodle_loadAdapter() - Dynamic adapter loading
// - moodle_initialize() - Main initialization
// - moodle_initializeAssignmentReader() - Assignment FAB setup
// - moodle_initializeForumReader() - Forum FAB setup
// - moodle_initializePageReader() - Page FAB setup
// - moodle_readContent() - Read content function
// - moodle_readPosts() - Read forum posts function
// - moodle_removeFAB() - Cleanup function
// - Self-initializing module imported above
// - Dependencies: showToast, readText (window.assistReadText), settings (window.assistSettings)
// ============================================================

// ============================================================
// ✂️ EXTRACTED: Quiz Helper moved to src/features/lms/canvas.js (Phase 5)
// All Quiz Helper state, functions, and Chrome storage listeners now in canvas module:
// - canvas_initializeQuizHelper() - Main initialization on quiz pages
// - quizHelper_injectUI() - Inject click handlers and visual indicators
// - quizHelper_readQuestion() - TTS reading with answer options
// - quizHelper_highlightQuestion() - Visual highlighting
// - quizHelper_setupKeyboardNav() - Keyboard shortcuts (Ctrl+Up/Down/Enter)
// - quizHelper_navigateToQuestion() - Question navigation
// - quizHelper_handleKeyPress() - Keyboard event handler
// - quizHelper_cleanup() - Cleanup function
// - Chrome storage integration for Quiz Helper settings
// - canvas_initialize() now handles QUIZ page type detection
//
// Quiz Helper is Canvas-specific and integrated into the Canvas module.
// It uses extractQuizQuestions() from canvas-adapter.js to detect quiz questions.
// Keyboard shortcuts: Ctrl+Down (next), Ctrl+Up (previous), Ctrl+Enter (read current)
// ============================================================

// ============================================================
// SPRINT 9 FEATURE: DYSLEXIA-OPTIMIZED READING MODE
// ============================================================
// EXTRACTED TO: src/content/features/dyslexia.js
// All dyslexia mode functionality has been moved to the modular
// feature module to follow the Phase 1 refactoring architecture.
// Functions extracted:
//   - dyslexiaMode_applyBionicReading()
//   - dyslexiaMode_applySyllableHighlighting()
//   - dyslexiaMode_applyGrammarColors()
//   - dyslexiaMode_apply()
//   - dyslexiaMode_remove()
// The dyslexia_initialize() function is called below to set up
// the feature with settings management and DOM monitoring.

// Initialize the Dyslexia Mode feature module
dyslexia_initialize();
console.log('[AssisT] Ready! Click any paragraph to read it.');
