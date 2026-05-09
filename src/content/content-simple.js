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
import DOMPurify from 'dompurify';
import { showToast } from '../core/ui/toast.js';
import {
  removeHighlight,
  highlightElement,
  removeElementHighlight,
  highlightWordByWord,
  cleanupWordByWord,
  pauseHighlighting,
  resumeHighlighting,
} from '../core/dom/highlighting.js';
import { resolveReadingTarget } from '../core/dom/scope-resolver.js';
import { registerShortcut } from '../utils/keyboard-shortcuts.js';

// Make DOMPurify globally available for web_accessible_resources
window.DOMPurify = DOMPurify;
import { dyslexia_initialize } from '../content/features/dyslexia.js';
import '../features/readingGuide/readingGuide.js'; // Self-initializing module
import '../features/screenOverlay/screenOverlay.js'; // Self-initializing module
import '../features/textCustomization/textCustomization.js'; // Self-initializing module with Chrome storage listeners
import '../features/focusMode/focusMode.js'; // Self-initializing module with Chrome storage listeners
import '../features/customCursor/custom-cursor.js'; // Self-initializing custom cursor for better visibility
import '../features/magnifyingLens/magnifying-lens.js'; // Self-initializing magnifying lens for content magnification
import '../features/stt/stt.js'; // Self-initializing module with Chrome storage listeners
import '../features/ocr/ocr.js'; // Self-initializing OCR module with Tesseract.js lazy loading
import '../features/highlightMenu/highlightMenu.js'; // Self-initializing highlight menu with text selection actions
import '../features/readingMode/readingMode.js'; // Self-initializing reading mode with Mozilla Readability
import '../features/dictionary/dictionary.js'; // Self-initializing dictionary lookup with Free Dictionary API
import '../features/translation/translation-api.js'; // Self-initializing translation API with LibreTranslate and Google Translate support
import '../features/translation/translation-ui.js'; // Self-initializing translation UI modal with TTS and clipboard integration
import '../features/translation/full-page-translate.js'; // Self-initializing full-page translation with DOM traversal and batch translation
import '../features/annotations/sticky-note.js'; // Self-initializing sticky notes with draggable functionality and storage persistence
import '../features/annotations/inline-annotations.js'; // Self-initializing inline annotations with text highlighting and comments
import '../features/annotations/annotation-sidebar.js'; // Self-initializing annotation sidebar panel with real-time sync
import '../features/reducedMotion/reducedMotion.js'; // Self-initializing reduced motion for sensory-sensitive users
import '../features/mediaControl/mediaControl.js'; // Self-initializing auto-play blocking for sensory comfort
// Dark mode feature removed - extension UI dark mode remains in popup header
import '../features/simplify/simplify.js'; // Self-initializing simplified interface mode for reducing visual clutter
import '../features/readingProgress/readingProgress.js'; // Self-initializing reading progress bar for document navigation
import '../features/pomodoro/pomodoro.js'; // Self-initializing Pomodoro timer for structured work/break intervals
import '../features/textStats/textStats-ui.js'; // Self-initializing text statistics with floating badge and modal
import { initCitation } from '../features/citations/citation-integration.js'; // Citation system with metadata extraction and storage
import '../features/summarization/summarization.js'; // Self-initializing AI summarization with LLM integration
import '../features/textSimplification/textSimplification.js'; // Self-initializing AI text simplification with LLM integration
import '../features/assignmentBreakdown/assignmentBreakdown.js'; // Self-initializing AI assignment breakdown with LLM integration
import '../features/socraticTutor/socraticTutor.js'; // Self-initializing Socratic questioning for critical thinking
import '../features/imageUnderstanding/imageUnderstanding.js'; // Self-initializing AI vision for image descriptions
import '../features/cognitiveProfile/cognitiveProfile.js'; // Self-initializing learning profile tracking
import '../features/knowledgeGraph/knowledgeGraph.js'; // Self-initializing knowledge graph visualization
import '../features/rsvp/rsvp-controller.js'; // Self-initializing RSVP speed reading (modular architecture)
import '../features/struggleDetection/struggleDetection.js'; // Self-initializing struggle detection and proactive assistance
import '../features/citationAnalyzer/citationAnalyzer.js'; // Self-initializing AI citation analysis for source evaluation
import '../features/cognitiveStateMonitor/cognitiveStateMonitor.js'; // Self-initializing cognitive state monitoring
import '../features/multiDocCompare/multiDocCompare.js'; // Self-initializing multi-document comparison
import '../features/studyPathGenerator/studyPathGenerator.js'; // Self-initializing study path generator
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
let currentLeaves = null; // text-leaf elements wrapped for word-by-word; preserved across restart-on-rate-change
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
  readingScope: 'paragraph', // 'paragraph' | 'section' | 'page'
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
 * Chrome TTS Bug Workaround
 * Chrome sometimes "eats" the first utterance without playing it.
 * We warm up the speech synthesis by speaking an empty/silent utterance.
 */
let synthWarmedUp = false;
function warmUpSpeechSynthesis() {
  if (synthWarmedUp) {
    return;
  }

  // Speak a space character at zero volume to "prime" the engine
  const warmupUtterance = new SpeechSynthesisUtterance(' ');
  warmupUtterance.volume = 0;
  warmupUtterance.rate = 10; // Fastest rate to complete quickly
  warmupUtterance.onend = () => {
    synthWarmedUp = true;
    console.log('[AssisT] Speech synthesis warmed up');
  };
  warmupUtterance.onerror = () => {
    synthWarmedUp = true; // Mark as warmed up even on error
    console.log('[AssisT] Speech synthesis warmup complete (with error)');
  };
  synth.speak(warmupUtterance);
}

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

  // Warm up speech synthesis after voices are loaded
  if (voices.length > 0 && !synthWarmedUp) {
    warmUpSpeechSynthesis();
  }
}

// Load voices immediately and on change
if (synth.getVoices().length > 0) {
  loadVoices();
}
synth.addEventListener('voiceschanged', loadVoices);

// ============================================================
// SPA NAVIGATION - CLEANUP & RE-INIT
// ============================================================
// Store listener references so they can be removed on SPA navigation

let _clickHandler = null;
let _keydownHandler = null;
let _storageHandler = null;
let _voicesChangedHandler = loadVoices;

/**
 * Remove all global event listeners registered by this content script.
 * Called before re-initialization on SPA navigation.
 */
function cleanupContentScript() {
  if (_clickHandler) {
    document.removeEventListener('click', _clickHandler, true);
    _clickHandler = null;
  }
  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler, true);
    _keydownHandler = null;
  }
  if (_storageHandler) {
    chrome.storage.onChanged.removeListener(_storageHandler);
    _storageHandler = null;
  }
  if (_voicesChangedHandler) {
    synth.removeEventListener('voiceschanged', _voicesChangedHandler);
  }
  // Cancel any active speech
  if (synth && (synth.speaking || synth.paused)) {
    synth.cancel();
  }
  currentUtterance = null;
  currentElement = null;
  currentText = '';
  currentLeaves = null;
  isPaused = false;
  console.log('[AssisT] Content script cleaned up for SPA navigation');
}

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
    settings.readingScope = ttsSettings.readingScope || settings.readingScope;
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
_storageHandler = changes => {
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
        settings.readingScope = ttsSettings.readingScope || settings.readingScope;
        settings.rate = ttsSettings.rate || settings.rate;
        settings.pitch = ttsSettings.pitch || settings.pitch;
        settings.volume = ttsSettings.volume || settings.volume;

        // If TTS was disabled, stop any current speech and clean up highlights
        if (!settings.enabled && oldTTSEnabled) {
          if (synth.speaking) {
            synth.cancel();
          }
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
          currentLeaves = null;
          isPaused = false;
          console.log('[AssisT] TTS disabled, speech stopped and highlights cleared');
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
          const leaves = currentLeaves;

          synth.cancel();
          setTimeout(() => {
            readText(text, element, leaves);
            if (wasPaused) {
              setTimeout(() => synth.pause(), 100);
            }
          }, 50);
        }
      }
      updateTimeout = null;
    }, 100);
  }
};
chrome.storage.onChanged.addListener(_storageHandler);

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
function readText(text, element, leaves) {
  console.log('[AssisT][readText] ========== READ TEXT CALLED ==========');
  console.log('[AssisT][readText] Text length:', text?.length);
  console.log('[AssisT][readText] Element:', element?.tagName);
  console.log('[AssisT][readText] synth available:', !!synth);
  console.log('[AssisT][readText] synth.speaking:', synth?.speaking);
  console.log('[AssisT][readText] Available voices:', synth?.getVoices()?.length);

  // Defensive checks
  if (!text || typeof text !== 'string' || text.trim() === '') {
    console.error('[AssisT][readText] ❌ INVALID TEXT:', text);
    return;
  }

  if (!element || !(element instanceof HTMLElement)) {
    console.error('[AssisT][readText] ❌ INVALID ELEMENT:', element);
    return;
  }

  if (!settings || typeof settings !== 'object') {
    console.error('[AssisT][readText] ❌ INVALID SETTINGS');
    return;
  }

  console.log('[AssisT][readText] Settings state:', {
    enabled: settings.enabled,
    voice: settings.voice?.name,
    rate: settings.rate,
    pitch: settings.pitch,
    volume: settings.volume,
    highlightEnabled: settings.highlightEnabled,
  });

  // Cancel previous speech if any
  if (synth && (synth.speaking || synth.paused)) {
    console.log(
      '[AssisT][readText] Cancelling previous speech (speaking:',
      synth.speaking,
      'paused:',
      synth.paused,
      ')'
    );
    synth.cancel();
  }

  // Also resume if paused (some browsers need this)
  if (synth.paused) {
    console.log('[AssisT][readText] Resuming paused synth');
    synth.resume();
  }

  // Wait for cancel to complete - Chrome needs a bit more time
  console.log('[AssisT][readText] Setting 100ms timeout before speaking...');
  setTimeout(() => {
    console.log('[AssisT][readText] Inside timeout - preparing to speak');
    currentElement = element;
    currentText = text;
    currentLeaves = Array.isArray(leaves) && leaves.length > 0 ? leaves : null;
    isPaused = false; // Reset pause state

    console.log('[AssisT][readText] Reading:', text.substring(0, 50) + '...');

    // Add outline
    element.style.outline = '2px solid #2196F3';
    element.style.outlineOffset = '2px';
    console.log('[AssisT][readText] Applied outline to element');

    // Create utterance FIRST so onboundary/onstart can be attached by the
    // word-by-word highlighter for true sync with the speaking voice.
    console.log('[AssisT][readText] Creating SpeechSynthesisUtterance...');
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = settings.rate;
    currentUtterance.pitch = settings.pitch;
    currentUtterance.volume = settings.volume;

    if (settings.voice) {
      currentUtterance.voice = settings.voice;
      console.log('[AssisT][readText] Set voice to:', settings.voice.name);
    } else {
      console.log('[AssisT][readText] No voice set, using default');
    }

    console.log('[AssisT][readText] Utterance created:', {
      text: currentUtterance.text?.substring(0, 30),
      rate: currentUtterance.rate,
      pitch: currentUtterance.pitch,
      volume: currentUtterance.volume,
      voice: currentUtterance.voice?.name,
    });

    // Word-by-word requires a leaves array whose joined textContent matches
    // the speech text (boundary events index into the speech text). Click-flow
    // through resolveReadingTarget always provides this; third-party callers
    // (window.readText from AI features, Canvas, etc.) typically don't, and
    // their `text` may not correspond to `element`'s DOM at all. Without
    // leaves we fall back to whole-element highlight rather than mutating an
    // arbitrary container's innerHTML.
    const canDoWordByWord =
      settings.wordByWordEnabled &&
      settings.highlightEnabled &&
      Array.isArray(leaves) &&
      leaves.length > 0;

    if (canDoWordByWord) {
      const autoScroll = settings.readingScope && settings.readingScope !== 'paragraph';
      console.log(
        '[AssisT][readText] Using word-by-word highlighting (autoScroll=' + autoScroll + ')'
      );
      highlightWordByWord(element, text, currentUtterance, { ...settings, autoScroll }, leaves);
    } else {
      if (settings.wordByWordEnabled && settings.highlightEnabled) {
        console.log(
          '[AssisT][readText] Word-by-word skipped (no leaves for this caller); using whole-element highlight'
        );
      } else {
        console.log('[AssisT][readText] Using whole-element highlighting');
      }
      highlightElement(element, settings);
    }

    // Capture this utterance for stale-event guards. synth.cancel() schedules
    // an async "canceled" onerror against the OLD utterance; if it fires after
    // a new readText has already replaced module state, the old handler must
    // not tear down the new run.
    const owningUtterance = currentUtterance;
    const owningElement = currentElement;

    // Clean up on end
    currentUtterance.onend = () => {
      if (currentUtterance !== owningUtterance) {
        console.log('[AssisT][readText] Stale onend (newer utterance active); ignoring');
        return;
      }
      console.log('[AssisT][readText] >>> UTTERANCE ONEND <<<');
      cleanupWordByWord(owningElement);
      removeHighlight();
      removeElementHighlight(owningElement);
      if (owningElement) {
        owningElement.style.outline = '';
        owningElement.style.outlineOffset = '';
      }
      currentUtterance = null;
      currentElement = null;
      currentText = '';
      currentLeaves = null;
      isPaused = false;
      console.log('[AssisT][readText] Reading complete and cleaned up');
    };

    // Handle errors
    currentUtterance.onerror = event => {
      const benignErrors = ['interrupted', 'canceled'];
      const isBenign = benignErrors.includes(event.error);

      if (currentUtterance !== owningUtterance) {
        // Stale: a newer utterance owns the module state. Just clear the
        // outline on our own element (no shared-state mutation).
        if (owningElement) {
          owningElement.style.outline = '';
          owningElement.style.outlineOffset = '';
        }
        if (!isBenign) {
          console.warn('[AssisT][readText] Stale onerror (non-benign):', event.error);
        }
        return;
      }

      if (isBenign) {
        console.log('[AssisT][readText] Speech stopped:', event.error);
      } else {
        console.warn('[AssisT][readText] Speech error:', event.error);
      }

      cleanupWordByWord(owningElement);
      removeHighlight();
      removeElementHighlight(owningElement);
      if (owningElement) {
        owningElement.style.outline = '';
        owningElement.style.outlineOffset = '';
      }
      currentElement = null;
      currentText = '';
      currentLeaves = null;
      isPaused = false;
    };

    // NOTE: do NOT assign currentUtterance.onstart here. The word-by-word
    // highlighter installs its own onstart handler to anchor sync timing.
    // Whole-element mode doesn't need an onstart hook.

    // Speak!
    console.log('[AssisT][readText] ========== CALLING synth.speak() ==========');
    console.log(
      '[AssisT][readText] Pre-speak state: synth.speaking=',
      synth.speaking,
      'synth.paused=',
      synth.paused
    );
    synth.speak(currentUtterance);
    console.log(
      '[AssisT][readText] Post-speak state: synth.speaking=',
      synth.speaking,
      'synth.pending=',
      synth.pending
    );
    console.log('[AssisT][readText] ========== synth.speak() CALLED ==========');
  }, 100); // 100ms delay for Chrome to settle after cancel
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
_clickHandler = e => {
  console.log('[AssisT][Click] ========== CLICK EVENT ==========');
  console.log('[AssisT][Click] Target:', e.target.tagName, e.target.className);
  console.log('[AssisT][Click] settings.enabled:', settings.enabled);
  console.log('[AssisT][Click] settings.voice:', settings.voice?.name);

  // Don't intercept links/buttons first
  if (e.target.closest('a, button, input, textarea, select, [role="button"]')) {
    console.log('[AssisT][Click] Ignored - interactive element');
    return;
  }

  // Don't read if TTS is disabled — silently ignore, no toast
  if (!settings.enabled) {
    console.log('[AssisT][Click] TTS is DISABLED');
    return;
  }

  console.log(
    '[AssisT][Click] TTS is ENABLED - resolving target (scope=' +
      (settings.readingScope || 'paragraph') +
      ')'
  );

  const resolved = resolveReadingTarget(e.target, settings.readingScope || 'paragraph');

  if (resolved && resolved.text) {
    e.preventDefault();
    e.stopPropagation();
    console.log(
      '[AssisT][Click] Calling readText() with',
      resolved.text.length,
      'chars across',
      resolved.leaves?.length || 1,
      'leaf block(s)'
    );
    readText(resolved.text, resolved.element, resolved.leaves);
  } else {
    console.log('[AssisT][Click] No readable text element found');
  }
};
document.addEventListener('click', _clickHandler, true);

// ============================================================
// USER INTERACTION - KEYBOARD SHORTCUTS
// ============================================================
// Keyboard controls for TTS playback (Space, +, -)

// Keyboard shortcuts - Space (pause/resume), +/- (speed control)
_keydownHandler = e => {
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
        resumeHighlighting(); // onresume may not fire reliably in Chrome
        isPaused = false;
        showToast('▶️ Resumed');
        console.log('[AssisT] Resumed playback');
      } else {
        // Pause
        synth.pause();
        pauseHighlighting(); // onpause may not fire reliably in Chrome
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
      const leaves = currentLeaves;
      const wasPaused = synth.paused;
      synth.cancel();
      setTimeout(() => {
        readText(text, element, leaves);
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
      const leaves = currentLeaves;
      const wasPaused = synth.paused;
      synth.cancel();
      setTimeout(() => {
        readText(text, element, leaves);
        if (wasPaused) {
          setTimeout(() => synth.pause(), 100);
        }
      }, 50);
    }
  }

  // OCR keyboard shortcut is now dynamically registered via shortcuts manager
  // See initialization code below this event listener
};
document.addEventListener('keydown', _keydownHandler, true); // Use capture phase for better priority

// ============================================================
// KEYBOARD SHORTCUTS REGISTRATION
// ============================================================
// Register dynamic keyboard shortcuts from shortcuts manager
registerShortcut('ocr_activate', () => {
  console.log('[AssisT] OCR keyboard shortcut triggered');

  if (window.assistFeatures && window.assistFeatures.ocr) {
    // Call performOCR which will show the screenshot UI modal
    window.assistFeatures.ocr.performOCR();
    showToast('📸 OCR: Select screenshot mode');
  } else {
    console.error('[AssisT] OCR feature not available');
    showToast('❌ OCR feature not initialized');
  }
});

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

// Initialize the Citation feature module
initCitation();

// ============================================================
// MESSAGE LISTENER FOR POPUP COMMANDS
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // SECURITY: Validate sender is from this extension
  if (sender.id !== chrome.runtime.id) {
    console.warn('[AssisT Security] Rejected message from untrusted sender:', sender.id);
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return false;
  }

  console.log('[AssisT] Received message:', message.type);

  switch (message.type) {
    case 'PING':
      // Respond to ping to confirm content script is loaded
      sendResponse({ success: true, loaded: true });
      break;

    case 'SHOW_TOAST':
      // Show a toast message from popup
      if (message.message) {
        showToast(message.message);
      }
      sendResponse({ success: true });
      break;

    case 'TTS_COMMAND':
      // Handle TTS commands from popup for direct settings control
      const ttsData = message.data || {};
      const ttsCommand = ttsData.command;
      console.log('[AssisT] TTS Command received:', ttsCommand, ttsData);

      switch (ttsCommand) {
        case 'enable':
          settings.enabled = true;
          console.log('[AssisT] TTS enabled via direct command');
          showToast('✓ TTS enabled - click any text to hear it');
          break;

        case 'disable':
          settings.enabled = false;
          if (synth.speaking) {
            synth.cancel();
          }
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
          currentLeaves = null;
          isPaused = false;
          console.log('[AssisT] TTS disabled via direct command, highlights cleared');
          break;

        case 'setVoice':
          if (ttsData.voice) {
            const voices = synth.getVoices();
            const voice = voices.find(v => v.name === ttsData.voice);
            if (voice) {
              settings.voice = voice;
            }
          }
          break;

        case 'setRate':
          if (ttsData.rate !== undefined) {
            settings.rate = ttsData.rate;
          }
          break;

        case 'setPitch':
          if (ttsData.pitch !== undefined) {
            settings.pitch = ttsData.pitch;
          }
          break;

        case 'setVolume':
          if (ttsData.volume !== undefined) {
            settings.volume = ttsData.volume;
          }
          break;

        case 'setHighlighting':
          if (ttsData.enabled !== undefined) {
            settings.highlightEnabled = ttsData.enabled;
          }
          break;

        case 'setHighlightColor':
          if (ttsData.color) {
            settings.highlightColor = ttsData.color;
          }
          break;

        case 'setHighlightOpacity':
          if (ttsData.opacity !== undefined) {
            settings.highlightOpacity = ttsData.opacity;
          }
          break;

        case 'setWordByWord':
          if (ttsData.enabled !== undefined) {
            settings.wordByWordEnabled = ttsData.enabled;
          }
          break;

        case 'readPage':
          if (settings.enabled) {
            const mainContent = document.querySelector(
              'main, article, [role="main"], .content, #content, body'
            );
            if (mainContent) {
              const text = mainContent.innerText;
              if (text) {
                speak(text, mainContent);
              }
            }
          }
          break;

        case 'stop':
          synth.cancel();
          cleanupWordByWord(currentElement);
          removeHighlight();
          break;

        case 'pause':
          synth.pause();
          break;

        case 'resume':
          synth.resume();
          break;

        default:
          console.log('[AssisT] Unknown TTS command:', ttsCommand);
      }

      sendResponse({ success: true, command: ttsCommand });
      break;

    case 'READING_MODE_TOGGLE':
      // Toggle reading mode using the exported function from readingMode module
      if (window.assistFeatures && window.assistFeatures.readingMode) {
        window.assistFeatures.readingMode.toggle();
        sendResponse({ success: true, active: window.assistFeatures.readingMode.isActive() });
      } else {
        console.error('[AssisT] Reading Mode feature not available');
        sendResponse({ success: false, error: 'Reading Mode not initialized' });
      }
      break;

    case 'TRIGGER_OCR':
      // Trigger OCR workflow
      console.log('[AssisT] Triggering OCR from popup button');
      if (window.assistFeatures && window.assistFeatures.ocr) {
        // BUG-2 fix: race sendResponse against 25s timeout so Chrome never drops the channel
        const ocrTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR timed out')), 25000)
        );
        Promise.race([window.assistFeatures.ocr.performOCR(), ocrTimeout])
          .then(result => {
            if (result) {
              console.log('[AssisT] OCR completed successfully');
              sendResponse({ success: true, textLength: result.text?.length ?? 0 });
            } else {
              console.log('[AssisT] OCR canceled or failed');
              sendResponse({ success: false, error: 'OCR canceled' });
            }
          })
          .catch(error => {
            console.error('[AssisT] OCR error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Will respond asynchronously
      } else {
        console.error('[AssisT] OCR feature not available');
        sendResponse({ success: false, error: 'OCR not initialized' });
      }
      break;

    case 'TRANSLATE_PAGE':
      // Trigger full-page translation
      console.log('[AssisT] Triggering full-page translation from popup button');
      if (window.assistFeatures && window.assistFeatures.fullPageTranslate) {
        const targetLang = message.targetLang || 'en';
        // BUG-2 fix: race sendResponse against 25s timeout
        const translateTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Translation timed out')), 25000)
        );
        Promise.race([
          window.assistFeatures.fullPageTranslate.translate(targetLang, 'auto'),
          translateTimeout,
        ])
          .then(() => {
            console.log('[AssisT] Full-page translation completed successfully');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[AssisT] Translation error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Will respond asynchronously
      } else {
        console.error('[AssisT] Full-page translate feature not available');
        sendResponse({ success: false, error: 'Translation not initialized' });
      }
      break;

    case 'SAVE_CITATION':
      // Extract and save citation for current page
      console.log('[AssisT] Triggering citation save from popup button');
      if (window.assistFeatures && window.assistFeatures.citation) {
        // BUG-2 fix: race sendResponse against 25s timeout
        const citationTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Citation save timed out')), 25000)
        );
        Promise.race([
          window.assistFeatures.citation.saveCitationFromCurrentPage(),
          citationTimeout,
        ])
          .then(citation => {
            console.log('[AssisT] Citation saved successfully:', citation);
            sendResponse({ success: true, citation });
          })
          .catch(error => {
            console.error('[AssisT] Citation save error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Will respond asynchronously
      } else {
        console.error('[AssisT] Citation feature not available');
        sendResponse({ success: false, error: 'Citation not initialized' });
      }
      break;

    case 'OPEN_BIBLIOGRAPHY_MANAGER':
      // Open the bibliography manager modal
      console.log('[AssisT] Opening Bibliography Manager from popup button');
      if (window.assistFeatures && window.assistFeatures.citation) {
        window.assistFeatures.citation
          .openBibliographyManager()
          .then(() => {
            console.log('[AssisT] Bibliography Manager opened');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[AssisT] Bibliography Manager error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Will respond asynchronously
      } else {
        console.error('[AssisT] Citation feature not available');
        sendResponse({ success: false, error: 'Citation not initialized' });
      }
      break;

    case 'OPEN_PROJECT_MANAGER':
      // Open the project manager modal
      console.log('[AssisT] Opening Project Manager from popup button');
      if (window.assistFeatures && window.assistFeatures.citation) {
        window.assistFeatures.citation
          .openProjectManager()
          .then(() => {
            console.log('[AssisT] Project Manager opened');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[AssisT] Project Manager error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Will respond asynchronously
      } else {
        console.error('[AssisT] Citation feature not available');
        sendResponse({ success: false, error: 'Citation not initialized' });
      }
      break;

    case 'GET_CITATIONS':
      // Get all citations and projects for popup panel
      console.log('[AssisT] Getting citations for popup panel');
      if (window.assistFeatures && window.assistFeatures.citation) {
        Promise.all([
          window.assistFeatures.citation.getAllCitations(),
          window.assistFeatures.citation.getAllProjects(),
        ])
          .then(([citations, projects]) => {
            console.log('[AssisT] Citations retrieved:', citations.length);
            sendResponse({ success: true, citations, projects });
          })
          .catch(error => {
            console.error('[AssisT] Get citations error:', error);
            sendResponse({ success: false, error: error.message, citations: [], projects: [] });
          });
        return true; // Will respond asynchronously
      } else {
        console.log('[AssisT] Citation feature not available, returning empty');
        sendResponse({
          success: false,
          error: 'Citation not initialized',
          citations: [],
          projects: [],
        });
      }
      break;

    case 'GET_STT_STATS':
      // Phase 2.7 - S.4: Get STT confidence statistics from popup
      if (
        window.assistFeatures &&
        window.assistFeatures.stt &&
        window.assistFeatures.stt.controller
      ) {
        const stats = window.assistFeatures.stt.controller.getConfidenceStats();
        sendResponse({ success: true, stats });
      } else {
        sendResponse({
          success: true,
          stats: {
            duration: 0,
            totalWords: 0,
            wordsPerMinute: 0,
            averageConfidence: 0,
          },
        });
      }
      break;

    case 'STT_COMMAND':
      // S.7: STT Profile commands
      console.log('[AssisT] STT Command received:', message.command);
      if (window.assistFeatures && window.assistFeatures.stt) {
        const sttFeature = window.assistFeatures.stt;
        switch (message.command) {
          case 'applyProfile':
            if (sttFeature.controller && sttFeature.controller.applyProfile) {
              sttFeature.controller.applyProfile(message.profileType, message.customizations || {});
              sendResponse({ success: true, profile: message.profileType });
            } else {
              // Store profile preference for when STT initializes
              chrome.storage.local.set({
                assist_stt_profile: {
                  type: message.profileType,
                  customizations: message.customizations || {},
                },
              });
              sendResponse({ success: true, deferred: true, profile: message.profileType });
            }
            break;
          case 'cycleProfile':
            if (sttFeature.controller && sttFeature.controller.cycleProfile) {
              const newProfile = sttFeature.controller.cycleProfile();
              sendResponse({ success: true, profile: newProfile?.name });
            } else {
              sendResponse({ success: false, error: 'STT not initialized' });
            }
            break;
          case 'getProfile':
            if (sttFeature.controller && sttFeature.controller.getCurrentProfile) {
              const profile = sttFeature.controller.getCurrentProfile();
              sendResponse({ success: true, profile });
            } else {
              sendResponse({ success: false, error: 'STT not initialized' });
            }
            break;
          case 'getAvailableProfiles':
            if (sttFeature.controller && sttFeature.controller.getAvailableProfiles) {
              const profiles = sttFeature.controller.getAvailableProfiles();
              sendResponse({ success: true, profiles });
            } else {
              sendResponse({ success: false, error: 'STT not initialized' });
            }
            break;
          case 'getStats':
            // Phase 2.7 - S.4: Get confidence feedback statistics
            if (sttFeature.controller && sttFeature.controller.getConfidenceStats) {
              const stats = sttFeature.controller.getConfidenceStats();
              sendResponse({ success: true, stats });
            } else {
              sendResponse({
                success: true,
                stats: {
                  duration: 0,
                  totalWords: 0,
                  wordsPerMinute: 0,
                  averageConfidence: 0,
                },
              });
            }
            break;
          case 'updateConfidenceConfig':
            // Phase 2.7 - S.4: Update confidence feedback settings
            if (sttFeature.controller && sttFeature.controller.updateConfidenceFeedbackConfig) {
              sttFeature.controller.updateConfidenceFeedbackConfig(message.config || {});
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: 'STT not initialized' });
            }
            break;
          case 'resetSession':
            // Phase 2.7 - S.4: Reset confidence session
            if (sttFeature.controller && sttFeature.controller.resetConfidenceSession) {
              sttFeature.controller.resetConfidenceSession();
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: 'STT not initialized' });
            }
            break;
          default:
            sendResponse({ success: false, error: 'Unknown STT command: ' + message.command });
        }
      } else {
        // STT not initialized, store profile preference for later
        if (message.command === 'applyProfile') {
          chrome.storage.local.set({
            assist_stt_profile: {
              type: message.profileType,
              customizations: message.customizations || {},
            },
          });
          sendResponse({ success: true, deferred: true, profile: message.profileType });
        } else {
          sendResponse({ success: false, error: 'STT feature not initialized' });
        }
      }
      break;

    case 'MINIMIZE_CLUTTER_UPDATE':
      // Hide or show on-page UI overlays (textStats badge, etc.)
      {
        const badge = document.getElementById('assist-textstats-badge');
        if (badge) {
          badge.style.display = message.state ? 'none' : '';
        }
        sendResponse({ success: true });
      }
      break;

    case 'UPDATE_SETTINGS':
      // Handle settings broadcast from message-router (background script)
      // This is sent when popup updates settings and background broadcasts to content scripts
      console.log('[AssisT] Settings update received from background');
      if (message.settings) {
        // Settings are handled by chrome.storage.onChanged listener
        // This message is just a notification that settings were updated
        sendResponse({ success: true });
      } else {
        sendResponse({ success: true, note: 'No settings in message' });
      }
      break;

    case 'LOCAL_TEXT_CUSTOMIZATION':
      // Apply text customization only to THIS tab, without touching shared storage.
      // Used when the popup's "Apply to all windows" toggle is OFF.
      console.log('[AssisT] Applying local-only text customization');
      if (window.assistFeatures && window.assistFeatures.textCustomization) {
        window.assistFeatures.textCustomization.applySettings(message.settings);
        sendResponse({ success: true });
      } else {
        console.warn('[AssisT] textCustomization feature not available for local apply');
        sendResponse({ success: false, error: 'textCustomization not initialized' });
      }
      break;

    case 'CLEAR_TEXT_CUSTOMIZATION':
      // Remove all text customization from THIS tab.
      // Sent to all OTHER tabs when the sync toggle is switched OFF.
      console.log('[AssisT] Clearing text customization on this tab');
      if (window.assistFeatures && window.assistFeatures.textCustomization) {
        window.assistFeatures.textCustomization.remove();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'textCustomization not initialized' });
      }
      break;

    default:
      // Handle undefined or unknown message types gracefully
      if (message.type === undefined) {
        // Silently ignore messages without a type (e.g., from other extensions or browser)
        console.log('[AssisT] Ignoring message without type property');
        sendResponse({ success: true, ignored: true });
      } else {
        console.warn('[AssisT] Unknown message type:', message.type);
        sendResponse({ success: false, error: 'Unknown message type' });
      }
  }

  return true; // Keep message channel open for async response
});

// ============================================================================
// EXPOSE FUNCTIONS FOR FEATURE INTEGRATION
// ============================================================================

// Expose readText function for Highlight Menu TTS integration
window.readText = readText;

// Expose showToast function for copy notifications
if (typeof showToast !== 'undefined') {
  window.showToast = showToast;
}

console.log('[AssisT] Ready! Click any paragraph to read it.');

// ============================================================
// SPA NAVIGATION DETECTION
// ============================================================
// Canvas and Moodle are SPAs — detect navigation via title changes
// and popstate so we can clean up + re-register listeners.
let _lastUrl = location.href;
const _navObserver = new MutationObserver(() => {
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    console.log('[AssisT] SPA navigation detected, cleaning up listeners');
    cleanupContentScript();
    // Re-register listeners after cleanup
    _storageHandler = changes => {
      if (changes.assist_settings && updateTimeout === null) {
        updateTimeout = setTimeout(() => {
          // Settings change re-applied via existing logic captured in closure
          updateTimeout = null;
        }, 100);
      }
    };
    chrome.storage.onChanged.addListener(_storageHandler);
    synth.addEventListener('voiceschanged', loadVoices);
    _voicesChangedHandler = loadVoices;
    document.addEventListener('click', _clickHandler, true);
    document.addEventListener('keydown', _keydownHandler, true);
  }
});
_navObserver.observe(document, { subtree: true, childList: true });
window.addEventListener('popstate', () => {
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    cleanupContentScript();
  }
});
