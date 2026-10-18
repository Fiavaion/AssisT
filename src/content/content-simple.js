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
 */

// MUST stay the first import: it aborts the whole content script on a document that is itself a
// writing surface, before any feature module can put UI into the student's essay field.
// See src/content/editable-document-guard.js for why the check cannot live in this file's body.
import './editable-document-guard.js';
import { watchForEditableDocument, removeInjectedAssistUI } from './utils/editable-document.js';
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
import {
  resolveReadingTarget,
  resolveSelectionTarget,
  leafSlice,
  leafText,
} from '../core/dom/scope-resolver.js';
import { extractMainContent } from '../core/content/readPage.js';
import {
  registerShortcut,
  reloadShortcuts,
  isFocusedControl,
} from '../utils/keyboard-shortcuts.js';
import { applySettingWrites } from '../utils/setting-writes.js';
import { chooseVoice, pageLanguage, resolveSpeech } from '../utils/speech-voice.js';

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
import { ocr_cleanup } from '../features/ocr/ocr.js'; // Self-initializing OCR module with Tesseract.js lazy loading
import '../features/maths/maths-feature.js'; // Self-initializing maths tools (calculator FAB + number formatting), lazy chunks
import '../features/highlightMenu/highlightMenu.js'; // Self-initializing highlight menu with text selection actions
import '../features/readingMode/readingMode.js'; // Self-initializing reading mode with Mozilla Readability
import { dictionary_cleanup } from '../features/dictionary/dictionary.js'; // Self-initializing dictionary lookup with Free Dictionary API
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
import '../features/multiDocCompare/multiDocCompare.js'; // Self-initializing multi-document comparison
import '../features/studyPathGenerator/studyPathGenerator.js'; // Self-initializing study path generator
import { initializeLmsReadAloud } from '../features/lms/lms-read-aloud.js'; // The one read-aloud path all three LMS integrations use
import { canvas_reinit } from '../features/lms/canvas.js'; // Self-initializing module with Chrome storage listeners
import { moodle_reinit } from '../features/lms/moodle.js'; // Self-initializing module with Chrome storage listeners
import { googleClassroom_reinit } from '../features/lms/googleClassroom.js'; // Self-initializing module with Chrome storage listeners
import {
  companion_reinit,
  companion_cleanup,
  companion_openLectureNotes,
} from '../features/companion/companion-init.js'; // Self-initializing companion features (per-feature toggles)
import { assistOverlayIsOpen } from '../utils/assist-overlay-state.js';

/**
 * Re-detect the page and re-mount the LMS integrations after an SPA navigation.
 * Each reinit cleans up its own stale FAB/listeners first and no-ops off its LMS,
 * so calling all three on every route change is safe.
 */
function reinitLmsModules() {
  Promise.allSettled([
    canvas_reinit(),
    moodle_reinit(),
    googleClassroom_reinit(),
    companion_reinit(),
  ]).catch(() => {});
}

// This section manages the core TTS state and configuration.
// TTS is the foundation service provided by the orchestrator to all feature modules.

// TTS State
let currentUtterance = null;
let currentElement = null;
let currentText = '';
let currentLeaves = null; // text-leaf elements wrapped for word-by-word; preserved across restart-on-rate-change
let currentElementInlineStyle = null; // currentElement's style attribute before the read (null = it had none)
let currentShowsOnPage = true; // false: the voice reads and nothing is drawn on the page
let pendingReadStart = null; // the timer that starts a read once Chrome has settled after cancel
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
  wordHighlightMode: 'boundary', // 'boundary' | 'timer'
  wordHighlightSpeed: 2.0, // multiplier: >1 faster, <1 slower
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
 * The voice name the student saved (`assist_settings.tts.voice`), kept apart from the resolved
 * voice object: on a cold start the settings arrive before Chrome has published its voices, and
 * the name has to survive until they do.
 * @type {string|undefined}
 */
let savedVoiceName;

/** Point settings.voice at the saved voice, or at a device voice for the page when none is saved. */
function resolveVoice() {
  settings.voice = chooseVoice(synth.getVoices(), {
    savedName: savedVoiceName,
    lang: pageLanguage(),
  });
}

/** Runs when the engine publishes (or changes) its voices. */
function loadVoices() {
  const voices = synth.getVoices();
  resolveVoice();

  // Warm up speech synthesis after voices are loaded
  if (voices.length > 0 && !synthWarmedUp) {
    warmUpSpeechSynthesis();
  }
}

// Load voices immediately and on change
if (synth.getVoices().length > 0) {
  loadVoices();
}
/**
 * The document-level listeners this script owns, so an in-page navigation can take every one of
 * them down and put every one of them back. They are named function declarations further down and
 * are referenced here by name, deliberately. An earlier design kept them in variables that cleanup
 * set to null and re-init then handed straight back to addEventListener, which registers nothing
 * when given null: click-to-read and every keyboard shortcut died on the first navigation inside
 * Canvas, and the popstate path never re-registered anything at all.
 */
function installGlobalListeners() {
  chrome.storage.onChanged.addListener(onSettingsChanged);
  synth.addEventListener('voiceschanged', loadVoices);
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', onDocumentKeydown, true);
}

/**
 * Take down everything installGlobalListeners put up, release what features hold on to, and reset
 * the reading state. Runs before re-initialisation on SPA navigation.
 */
function cleanupContentScript() {
  chrome.storage.onChanged.removeListener(onSettingsChanged);
  synth.removeEventListener('voiceschanged', loadVoices);
  document.removeEventListener('click', onDocumentClick, true);
  document.removeEventListener('keydown', onDocumentKeydown, true);

  // Features holding more than DOM: a live Tesseract worker, an open lookup panel.
  ocr_cleanup();
  dictionary_cleanup();

  // Cancelling the voice is not enough: the word wrappers, the highlight and the outline are on
  // the page the student is leaving and nothing else will take them off.
  stopReading();
  console.log('[AssisT] Content script cleaned up for SPA navigation');
}

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
    settings.wordHighlightMode = ttsSettings.wordHighlightMode || settings.wordHighlightMode;
    settings.wordHighlightSpeed =
      ttsSettings.wordHighlightSpeed !== null && ttsSettings.wordHighlightSpeed !== undefined
        ? ttsSettings.wordHighlightSpeed
        : settings.wordHighlightSpeed;
    settings.readingScope = ttsSettings.readingScope || settings.readingScope;
    const speech = resolveSpeech(ttsSettings, []);
    settings.rate = speech.rate;
    settings.pitch = speech.pitch;
    settings.volume = speech.volume;
    savedVoiceName = ttsSettings.voice;
    resolveVoice();

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
function onSettingsChanged(changes) {
  if (changes.assist_settings && updateTimeout === null) {
    updateTimeout = setTimeout(() => {
      // Re-register all shortcuts if the user changed their key bindings
      const oldShortcuts = changes.assist_settings.oldValue?.keyboardShortcuts;
      const newShortcuts = changes.assist_settings.newValue?.keyboardShortcuts;
      if (JSON.stringify(oldShortcuts) !== JSON.stringify(newShortcuts)) {
        reloadShortcuts();
      }

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
        settings.wordHighlightSpeed =
          ttsSettings.wordHighlightSpeed !== null && ttsSettings.wordHighlightSpeed !== undefined
            ? ttsSettings.wordHighlightSpeed
            : settings.wordHighlightSpeed;
        settings.readingScope = ttsSettings.readingScope || settings.readingScope;
        const speech = resolveSpeech(ttsSettings, []);
        settings.rate = speech.rate;
        settings.pitch = speech.pitch;
        settings.volume = speech.volume;

        // If TTS was disabled, stop any current speech and clean up highlights
        if (!settings.enabled && oldTTSEnabled) {
          stopReading();
          console.log('[AssisT] TTS disabled, speech stopped and highlights cleared');
        }

        if (ttsSettings.voice !== savedVoiceName) {
          savedVoiceName = ttsSettings.voice;
          resolveVoice();
        }

        // If highlighting was disabled, remove current highlight
        if (
          !settings.highlightEnabled &&
          oldHighlightEnabled &&
          currentElement &&
          currentShowsOnPage
        ) {
          removeElementHighlight(currentElement);
          console.log('[AssisT] Highlighting disabled');
        }

        // If highlighting was enabled, add highlight to current element
        if (
          settings.highlightEnabled &&
          !oldHighlightEnabled &&
          currentElement &&
          currentShowsOnPage
        ) {
          highlightElement(currentElement, settings);
          console.log('[AssisT] Highlighting enabled');
        }

        // If highlight color or opacity changed and we're currently highlighting, update it
        if (
          settings.highlightEnabled &&
          (settings.highlightColor !== oldColor || settings.highlightOpacity !== oldOpacity) &&
          currentElement &&
          currentShowsOnPage
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
          const showOnPage = currentShowsOnPage;

          synth.cancel();
          setTimeout(() => {
            readText(text, element, leaves, { showOnPage });
            if (wasPaused) {
              setTimeout(() => synth.pause(), 100);
            }
          }, 50);
        }
      }
      updateTimeout = null;
    }, 100);
  }
}

// ✂️ EXTRACTED: removeHighlight() moved to src/core/dom/highlighting.js

// ✂️ EXTRACTED: hexToRgba() moved to src/core/utils/color.js

// ✂️ EXTRACTED: highlightElement() moved to src/core/dom/highlighting.js

// ✂️ EXTRACTED: highlightWordByWord() moved to src/core/dom/highlighting.js

// ✂️ EXTRACTED: cleanupWordByWord() moved to src/core/dom/highlighting.js

// ✂️ EXTRACTED: removeElementHighlight() moved to src/core/dom/highlighting.js

/**
 * The inline properties a read writes on the element being read: the blue reading outline here,
 * the highlight background and its transition in highlighting.js. Cleanup rewrites only these, so
 * an inline style another feature set during the read is left alone.
 */
const READING_STYLE_PROPERTIES = ['outline', 'outlineOffset', 'backgroundColor', 'transition'];

/**
 * Put `element`'s style attribute back exactly as the page had it — `originalStyle` is the
 * attribute's value before the read, null meaning there was no style attribute at all, in which
 * case the attribute is removed rather than left behind empty. A read that leaves style="" or a
 * stray `transition: background-color 0.2s` has changed the student's page and not changed it back.
 *
 * @param {HTMLElement|null} element
 * @param {string|null} originalStyle
 */
function restoreElementStyle(element, originalStyle) {
  if (!element) {
    return;
  }
  for (const property of READING_STYLE_PROPERTIES) {
    element.style[property] = '';
  }
  if (originalStyle) {
    const asAuthored = document.createElement('div');
    asAuthored.setAttribute('style', originalStyle);
    for (const property of READING_STYLE_PROPERTIES) {
      if (asAuthored.style[property]) {
        element.style[property] = asAuthored.style[property];
      }
    }
  }
  if (!element.getAttribute('style')) {
    element.removeAttribute('style');
  }
}

/**
 * Take the reading UI off the page: word wrappers unwrapped, highlight and outline gone, the
 * element's own inline style restored. The element and its style are passed in rather than read
 * from module state, because an utterance's end/error handler may run when a newer read already
 * owns that state.
 *
 * @param {HTMLElement|null} element
 * @param {string|null} originalStyle
 */
function clearReadingUI(element, originalStyle) {
  cleanupWordByWord(element);
  removeHighlight();
  removeElementHighlight(element);
  restoreElementStyle(element, originalStyle);
}

/**
 * Stop reading, and leave the page as it was found. This is the ONE path out of a read — the popup
 * switch, the stop shortcut, Escape, an SPA navigation and the start of the next read all come
 * through here, because Chrome's cancel arrives as an async "canceled" error far too late to be
 * what unwraps the word spans. Safe to call when nothing is being read.
 *
 * @param {Object} [options]
 * @param {string} [options.toast] - confirmation to show the student.
 * @returns {void}
 */
function stopReading({ toast } = {}) {
  // A read still waiting out its settle delay is stopped too. Started later, it would snapshot
  // the outline another read had drawn as the page's own style and restore that for good.
  clearTimeout(pendingReadStart);
  pendingReadStart = null;
  if (synth && (synth.speaking || synth.paused)) {
    synth.cancel();
  }
  clearReadingUI(currentElement, currentElementInlineStyle);
  currentUtterance = null;
  currentElement = null;
  currentText = '';
  currentLeaves = null;
  currentElementInlineStyle = null;
  isPaused = false;
  if (toast) {
    showToast(toast);
  }
}

/**
 * Is a read in progress — speaking, or paused part-way through? A paused read is ours to know
 * about: currentUtterance outlives the pause, while Chrome's synth.paused can stay true with
 * nothing queued, and read-aloud must not claim Escape on the strength of that.
 *
 * @returns {boolean}
 */
function isReading() {
  return Boolean(currentUtterance) || Boolean(synth && synth.speaking);
}

/**
 * AssisT overlays that own the Escape key while they are on screen. AssisT's dialogs are found
 * by assistOverlayIsOpen(); these are named because they are not all dialogs.
 */
const ESCAPE_OWNING_OVERLAYS =
  '#assist-rsvp-overlay, #assist-highlight-menu, #assist-knowledge-graph';

/**
 * Where focus means Escape is someone else's: an AssisT surface (the consent panel's dialog is in
 * a closed shadow root, so focus reads as its host), or any dialog the student is working in.
 */
const ESCAPE_OWNING_FOCUS =
  '[id^="assist-"], [data-assist-consent-panel], [role="dialog"], [role="alertdialog"], dialog';

/**
 * Is this element, and every ancestor of it, actually rendered? A closed AssisT panel is often
 * still in the DOM, so presence alone says nothing about who owns the keyboard.
 *
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isElementOnScreen(element) {
  for (let node = element; node instanceof HTMLElement; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

/**
 * Does something other than read-aloud own Escape right now — an open AssisT dialog or overlay,
 * an AssisT panel the student is focused inside (the annotation sidebar and the calculator handle
 * Escape on themselves), or a page dialog holding focus? A page dialog that is merely in the DOM,
 * such as a cookie banner left behind, does not: Escape is the one key that stops a read.
 *
 * @returns {boolean}
 */
function escapeBelongsToOtherUI() {
  const focused = document.activeElement;
  if (
    focused &&
    focused !== document.body &&
    typeof focused.closest === 'function' &&
    focused.closest(ESCAPE_OWNING_FOCUS)
  ) {
    return true;
  }
  return (
    assistOverlayIsOpen() ||
    Array.from(document.querySelectorAll(ESCAPE_OWNING_OVERLAYS)).some(isElementOnScreen)
  );
}

/**
 * Read text aloud using TTS with synchronized highlighting
 *
 * IMPORTANT: This is a CORE FUNCTION used by all modules (Canvas, Moodle, Quiz Helper, etc.)
 * DO NOT change the function signature without updating ALL dependent modules.
 *
 * @param {string} text - Text to read aloud
 * @param {HTMLElement} element - DOM element to highlight while reading
 * @param {Object[]|null} [leaves] - scope-resolver leaves, for word-by-word highlighting
 * @param {Object} [options]
 * @param {boolean} [options.showOnPage=true] - false reads without drawing anything on the page
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
function readText(text, element, leaves, { showOnPage = true } = {}) {
  console.log('[AssisT][readText] ========== READ TEXT CALLED ==========');
  console.log('[AssisT][readText] Text length:', text?.length);
  console.log('[AssisT][readText] Element:', element?.tagName);
  console.log('[AssisT][readText] synth available:', !!synth);
  console.log('[AssisT][readText] synth.speaking:', synth?.speaking);
  console.log('[AssisT][readText] Available voices:', synth?.getVoices()?.length);

  // Defensive checks
  if (!text || typeof text !== 'string' || text.trim() === '') {
    console.error(
      '[AssisT][readText] ❌ INVALID TEXT (type:',
      typeof text,
      'length:',
      text?.length,
      ')'
    );
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

  // End the previous read here and now, through the one cleanup path: its word wrappers and
  // highlight have to be off the page before this read wraps the same DOM, and waiting for
  // Chrome's async "canceled" error to do it is what left highlights stranded.
  stopReading();

  // Also resume if paused (some browsers need this)
  if (synth.paused) {
    console.log('[AssisT][readText] Resuming paused synth');
    synth.resume();
  }

  // Wait for cancel to complete - Chrome needs a bit more time
  console.log('[AssisT][readText] Setting 100ms timeout before speaking...');
  pendingReadStart = setTimeout(() => {
    pendingReadStart = null;
    console.log('[AssisT][readText] Inside timeout - preparing to speak');
    currentElement = element;
    currentShowsOnPage = showOnPage;
    // Snapshot before the outline goes on, so the stop can restore the attribute byte for byte.
    currentElementInlineStyle = element.getAttribute('style');
    currentText = text;
    currentLeaves = Array.isArray(leaves) && leaves.length > 0 ? leaves : null;
    isPaused = false; // Reset pause state

    console.log('[AssisT][readText] Reading', text.length, 'characters');

    if (showOnPage) {
      element.style.outline = '2px solid #2196F3';
      element.style.outlineOffset = '2px';
    }

    // Create utterance FIRST so onboundary/onstart can be attached by the
    // word-by-word highlighter for true sync with the speaking voice.
    console.log('[AssisT][readText] Creating SpeechSynthesisUtterance...');
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = settings.rate;
    currentUtterance.pitch = settings.pitch;
    currentUtterance.volume = settings.volume;

    // Resolved again at speak time: the page's language may have changed on an in-page navigation,
    // and an engine can publish its voices without firing voiceschanged.
    resolveVoice();
    if (settings.voice) {
      currentUtterance.voice = settings.voice;
      console.log('[AssisT][readText] Set voice to:', settings.voice.name);
    } else {
      console.log('[AssisT][readText] No voice set, using default');
    }

    console.log('[AssisT][readText] Utterance created:', {
      textLength: currentUtterance.text?.length,
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

    if (!showOnPage) {
      console.log('[AssisT][readText] Reading without drawing on the page');
    } else if (canDoWordByWord) {
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
    const owningElementInlineStyle = currentElementInlineStyle;

    // Clean up on end
    currentUtterance.onend = () => {
      if (currentUtterance !== owningUtterance) {
        console.log('[AssisT][readText] Stale onend (newer utterance active); ignoring');
        return;
      }
      console.log('[AssisT][readText] >>> UTTERANCE ONEND <<<');
      clearReadingUI(owningElement, owningElementInlineStyle);
      currentUtterance = null;
      currentElement = null;
      currentText = '';
      currentLeaves = null;
      currentElementInlineStyle = null;
      isPaused = false;
      console.log('[AssisT][readText] Reading complete and cleaned up');
      // Advance the speech queue if a chunked read is in progress.
      if (_pendingQueueNext) {
        const next = _pendingQueueNext;
        _pendingQueueNext = null;
        next();
      }
    };

    // Handle errors
    currentUtterance.onerror = event => {
      const benignErrors = ['interrupted', 'canceled'];
      const isBenign = benignErrors.includes(event.error);

      if (currentUtterance !== owningUtterance) {
        // Stale: a newer utterance owns the module state. Restore our own element (no shared-state
        // mutation) — unless the newer read is reading that same element, whose outline and
        // highlight are not ours to take off.
        if (owningElement && owningElement !== currentElement) {
          restoreElementStyle(owningElement, owningElementInlineStyle);
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

      clearReadingUI(owningElement, owningElementInlineStyle);
      currentUtterance = null;
      currentElement = null;
      currentText = '';
      currentLeaves = null;
      currentElementInlineStyle = null;
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

// Canvas, Moodle and Google Classroom all read aloud through one injected dependency. Moodle and
// Classroom used to look for window.assistSettings / window.assistReadText, which nothing set, so
// read-aloud was dead on both; a content script's window is shared with the host page, so the
// dependency is handed over here instead of published as a global.
// ⚠️ CRITICAL: If you change the readText signature or the settings structure, update
// initializeLmsReadAloud() in features/lms/lms-read-aloud.js accordingly.
initializeLmsReadAloud(readText, settings);

// CHUNKED READING — splits long texts for Chrome's SpeechSynthesis
// Chrome silently fails for utterances > ~4000 chars with network voices.

const MAX_UTTERANCE_CHARS = 3500;

let _speechQueue = [];
let _queueRunning = false;

function _drainQueue() {
  if (_queueRunning || _speechQueue.length === 0) {
    return;
  }
  _queueRunning = true;
  const { text, element, leaves, options } = _speechQueue.shift();
  // Patch onend so we can advance the queue when this chunk finishes.
  // We do this by temporarily overriding _queueOnEnd before calling readText.
  _pendingQueueNext = () => {
    _queueRunning = false;
    _drainQueue();
  };
  readText(text, element, leaves, options);
}

let _pendingQueueNext = null;

function _splitAndQueueLeaves(resolvedElement, leaves) {
  const chunks = [];
  let currentLeaves = [];
  let currentLen = 0;

  for (const leaf of leaves) {
    const text = leafText(leaf);
    const addLen = currentLen === 0 ? text.length : text.length + 2; // +2 for '\n\n'
    if (currentLen > 0 && currentLen + addLen > MAX_UTTERANCE_CHARS) {
      const chunkText = currentLeaves.map(leafText).join('\n\n');
      const element = leafSlice(currentLeaves[0]).element;
      chunks.push({ text: chunkText, element, leaves: [...currentLeaves] });
      currentLeaves = [];
      currentLen = 0;
    }
    currentLeaves.push(leaf);
    currentLen += addLen;
  }
  if (currentLeaves.length > 0) {
    const chunkText = currentLeaves.map(leafText).join('\n\n');
    const element = leafSlice(currentLeaves[0]).element;
    chunks.push({ text: chunkText, element, leaves: [...currentLeaves] });
  }
  return chunks;
}

function readChunked(resolved, options) {
  const { text, element, leaves } = resolved;
  if (!leaves || text.length <= MAX_UTTERANCE_CHARS) {
    // Short enough for a single utterance — no chunking needed.
    readText(text, element, leaves, options);
    return;
  }
  const chunks = _splitAndQueueLeaves(element, leaves);
  if (chunks.length <= 1) {
    readText(text, element, leaves, options);
    return;
  }
  showToast(`📖 Reading ${chunks.length} sections...`);
  _speechQueue = chunks.map(chunk => ({ ...chunk, options }));
  _queueRunning = false;
  _drainQueue();
}

/**
 * Read the words in a selection Range aloud in the student's voice and speed, chunked like
 * reading on click. With the Read Aloud feature on they are highlighted as the student's
 * settings ask; with it off the highlight menu still reads them, and draws nothing on the page.
 *
 * @param {Range} range
 * @returns {boolean} false when the selection holds nothing readable
 */
function readSelection(range) {
  const resolved = resolveSelectionTarget(range);
  if (!resolved) {
    return false;
  }
  readChunked(resolved, { showOnPage: settings.enabled });
  return true;
}

// Main click detection for reading text on click

// Click handler - Detects clicks on readable elements and triggers TTS
function onDocumentClick(e) {
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
      '[AssisT][Click] Calling readChunked() with',
      resolved.text.length,
      'chars across',
      resolved.leaves?.length || 1,
      'leaf block(s)'
    );
    readChunked(resolved);
  } else {
    console.log('[AssisT][Click] No readable text element found');
  }
}

// Keyboard controls for TTS playback (Space, +, -)

// Keyboard shortcuts - Space (pause/resume), +/- (speed control)
function onDocumentKeydown(e) {
  // Skip if typing in input fields
  const target = e.target;
  if (target.matches('input, textarea, [contenteditable="true"]')) {
    return;
  }

  // Escape - stop reading. A student who has started a read needs one key that ends it without
  // hunting for the popup; SC 2.1.1 wants it reachable from the keyboard alone. Escape is only
  // ours while a read is running and no AssisT dialog, overlay or panel has a prior claim on it —
  // outside that the key is passed straight through untouched.
  if (e.key === 'Escape') {
    if (!isReading() || escapeBelongsToOtherUI()) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    stopReading({ toast: '⏹️ Stopped' });
    return;
  }

  // Space - pause/resume, unless a focused control (button, link, menu...) owns Space
  if ((e.key === ' ' || e.code === 'Space') && !isFocusedControl(target)) {
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
      const showOnPage = currentShowsOnPage;
      const wasPaused = synth.paused;
      synth.cancel();
      setTimeout(() => {
        readText(text, element, leaves, { showOnPage });
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
      const showOnPage = currentShowsOnPage;
      const wasPaused = synth.paused;
      synth.cancel();
      setTimeout(() => {
        readText(text, element, leaves, { showOnPage });
        if (wasPaused) {
          setTimeout(() => synth.pause(), 100);
        }
      }, 50);
    }
  }

  // OCR keyboard shortcut is now dynamically registered via shortcuts manager
  // See initialization code below this event listener
}

installGlobalListeners();

// Register dynamic keyboard shortcuts from shortcuts manager
registerShortcut('ocr_activate', () => {
  console.log('[AssisT] OCR keyboard shortcut triggered');

  if (window.assistFeatures && window.assistFeatures.ocr) {
    window.assistFeatures.ocr.performOCR();
    showToast('📸 OCR: Select screenshot mode');
  } else {
    console.error('[AssisT] OCR feature not available');
    showToast('❌ OCR feature not initialized');
  }
});

// TTS play/pause — mirrors Space key logic but user-configurable key combo
registerShortcut('tts_play_pause', () => {
  if (currentUtterance) {
    if (isPaused) {
      synth.resume();
      resumeHighlighting();
      isPaused = false;
      showToast('▶️ Resumed');
    } else {
      synth.pause();
      pauseHighlighting();
      isPaused = true;
      showToast('⏸️ Paused');
    }
  }
});

// TTS stop
registerShortcut('tts_stop', () => {
  if (isReading()) {
    stopReading({ toast: '⏹️ Stopped' });
  }
});

// Toggle storage setting helper — flips a boolean in assist_settings. The read decides which way to
// flip; the write goes through the shared writer, so it merges rather than storing this page's whole
// snapshot back over whatever the popup saved in the meantime.
async function _toggleStorageSetting(featureKey, subKey = 'enabled', label = '') {
  // Nothing awaits this — it is a shortcut handler — so a failed read must not surface as an
  // unhandled rejection the student sees nothing about.
  try {
    const result = await chrome.storage.local.get('assist_settings');
    const enabled = !(result.assist_settings?.[featureKey]?.[subKey] || false);
    await applySettingWrites([{ path: `${featureKey}.${subKey}`, value: enabled }]);
    showToast(enabled ? `✅ ${label} on` : `${label} off`);
  } catch (error) {
    console.error(`[AssisT] Could not toggle ${featureKey}.${subKey}:`, error);
  }
}

registerShortcut('focus_mode_toggle', () =>
  _toggleStorageSetting('focusMode', 'enabled', 'Focus Mode')
);
registerShortcut('reading_guide_toggle', () =>
  _toggleStorageSetting('readingGuide', 'enabled', 'Reading Guide')
);
registerShortcut('screen_overlay_toggle', () =>
  _toggleStorageSetting('screenOverlay', 'enabled', 'Screen Overlay')
);
registerShortcut('dyslexia_mode_toggle', () =>
  _toggleStorageSetting('dyslexiaMode', 'enabled', 'Dyslexia Mode')
);

// Translation — opens modal with current text selection
registerShortcut('translation_toggle', () => {
  const translationUI = window.assistFeatures?.translationUI;
  if (translationUI) {
    const selectedText = window.getSelection()?.toString() || '';
    translationUI.openModal(selectedText);
  }
});

registerShortcut('highlight_menu_toggle', () =>
  _toggleStorageSetting('highlightMenu', 'enabled', 'Highlight Menu')
);

registerShortcut('citation_save', () => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  if (window.assistFeatures?.citation) {
    window.assistFeatures.citation.saveCitationFromCurrentPage(selectedText).catch(() => {});
  }
});

// The map library is an extension page, so this goes to the service worker rather than opening
// anything from the page itself. A sleeping worker rejects rather than answering, and an
// unhandled rejection in the student's page console helps nobody.
registerShortcut('open_mind_map', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_MIND_MAP' }).catch(() => {});
});

/** How much page text a map may be built from — the cap the mind-map contract puts on source.text. */
const MINDMAP_TEXT_LIMIT = 12000;

/**
 * The page's h1-h3 in document order, as {level, text}.
 *
 * This is the deterministic skeleton a map is built from before any AI is involved, so it must be
 * the page's own headings: an empty heading says nothing, and AssisT's injected panels carry
 * headings of their own that are not part of the document the student is reading.
 *
 * @returns {Array<{level: number, text: string}>}
 */
function collectPageHeadings() {
  return Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter(heading => !heading.closest('[id^="assist-"], [class*="assist-"]'))
    .map(heading => ({
      level: Number(heading.tagName.charAt(1)),
      text: heading.textContent.trim(),
    }))
    .filter(heading => heading.text.length > 0);
}

// Initialize the Dyslexia Mode feature module
dyslexia_initialize();

// Initialize the Citation feature module
initCitation();

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
          stopReading();
          console.log('[AssisT] TTS disabled via direct command, highlights cleared');
          break;

        case 'setVoice':
          if (ttsData.voice) {
            savedVoiceName = ttsData.voice;
            resolveVoice();
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

        case 'setReadingScope':
          if (ttsData.scope) {
            settings.readingScope = ttsData.scope;
          }
          break;

        case 'setWordHighlightMode':
          if (ttsData.mode) {
            settings.wordHighlightMode = ttsData.mode;
          }
          break;

        case 'setWordHighlightSpeed':
          if (ttsData.speed !== null && ttsData.speed !== undefined) {
            settings.wordHighlightSpeed = ttsData.speed;
          }
          break;

        case 'readPage':
          if (settings.enabled) {
            const mainContent = document.querySelector(
              'main, article, [role="main"], .content, #content, body'
            );
            if (mainContent) {
              const readPlain = () => {
                const text = mainContent.innerText;
                if (text) {
                  readText(text, mainContent, null);
                }
              };
              // Math-aware read: when the page has equations, speak them as structured maths
              // ("x squared plus 1") instead of the character-soup innerText gives, flowing through
              // the same synchronized-highlight path as plain reading. The maths engine is
              // lazy-loaded only when math is present; the mathReadAloud companion toggle can turn
              // the behaviour off; any failure falls back to the plain read.
              import('../features/companion/companion-settings.js')
                .then(cs => cs.isCompanionEnabled('mathReadAloud'))
                .then(mathEnabled => {
                  if (!mathEnabled) {
                    readPlain();
                    return undefined;
                  }
                  return import('../features/maths/math-speech.js')
                    .then(m => m.buildReadableText(mainContent))
                    .then(mathText => {
                      if (mathText) {
                        readText(mathText, mainContent, null);
                      } else {
                        readPlain();
                      }
                    });
                })
                .catch(readPlain);
            }
          }
          break;

        case 'stop':
          stopReading();
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
        // Answer once the toggle has settled: entering waits on extraction, so asking straight
        // away reported "closed" while it was opening.
        const readingMode = window.assistFeatures.readingMode;
        readingMode
          .toggle()
          .then(() => sendResponse({ success: true, active: readingMode.isActive() }));
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
        // Race save against 25s timeout; clear timer when race settles to avoid unhandled rejection
        let _citationTimerId;
        const citationTimeout = new Promise((_, reject) => {
          _citationTimerId = setTimeout(() => reject(new Error('Citation save timed out')), 25000);
        });
        Promise.race([
          window.assistFeatures.citation.saveCitationFromCurrentPage(message.selectedText || ''),
          citationTimeout,
        ])
          .then(citation => {
            clearTimeout(_citationTimerId);
            console.log('[AssisT] Citation saved successfully');
            sendResponse({ success: true, citation });
          })
          .catch(error => {
            clearTimeout(_citationTimerId);
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
      console.log('[AssisT] Opening citation library from popup button');
      if (window.assistFeatures && window.assistFeatures.citation) {
        window.assistFeatures.citation
          .openLibrary()
          .then(() => {
            console.log('[AssisT] Citation library opened');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[AssisT] Citation library error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Will respond asynchronously
      } else {
        console.error('[AssisT] Citation feature not available');
        sendResponse({ success: false, error: 'Citation not initialized' });
      }
      break;

    case 'OPEN_LECTURE_NOTES':
      // The popup's "Start lecture captions". Any page this script runs on, not only an LMS.
      companion_openLectureNotes()
        .then(opened =>
          sendResponse(
            opened ? { success: true } : { success: false, error: 'Lecture companion is off' }
          )
        )
        .catch(error => {
          console.error('[AssisT] Lecture notes did not open:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Will respond asynchronously

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

    case 'MINDMAP_MAP_PAGE': {
      // The map is built and stored by the service worker, which owns the database. All the
      // content script can contribute is what only the page knows: its text and its headings.
      const { text: pageText } = extractMainContent();
      chrome.runtime
        .sendMessage({
          type: 'MINDMAP_MAP_PAGE',
          url: location.href,
          title: document.title,
          text: pageText.slice(0, MINDMAP_TEXT_LIMIT),
          headings: collectPageHeadings(),
        })
        .then(response => sendResponse(response || { success: false, error: 'No response' }))
        .catch(error => {
          console.error('[AssisT] Mind map page capture failed:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Will respond asynchronously
    }

    case 'GET_STT_STATS':
      // Get STT confidence statistics from popup
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
            // Get confidence feedback statistics
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
            // Update confidence feedback settings
            if (sttFeature.controller && sttFeature.controller.updateConfidenceFeedbackConfig) {
              sttFeature.controller.updateConfidenceFeedbackConfig(message.config || {});
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: 'STT not initialized' });
            }
            break;
          case 'resetSession':
            // Reset confidence session
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

    default:
      // Not ours: feature modules register their own listeners (the learning record, the
      // annotation sidebar, image descriptions). Chrome keeps only the first reply, and this
      // router is registered first, so answering here would drop the feature's own answer.
      return false;
  }

  return true; // Keep message channel open for async response
});

// readText serves features that read their own text; the Highlight Menu reads a selection.
window.readText = readText;
window.readSelection = readSelection;

// Expose showToast function for copy notifications
if (typeof showToast !== 'undefined') {
  window.showToast = showToast;
}

console.log('[AssisT] Ready! Click any paragraph to read it.');

// Canvas and Moodle are SPAs — detect navigation via title changes
// and popstate so we can clean up + re-register listeners.
let _lastUrl = location.href;

/**
 * Is this URL change nothing but a jump within the same document — a table-of-contents anchor, a
 * "skip to content" link?
 *
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function isSameDocumentJump(from, to) {
  try {
    const before = new URL(from);
    const after = new URL(to);
    return (
      before.origin === after.origin &&
      before.pathname === after.pathname &&
      before.search === after.search
    );
  } catch {
    return false;
  }
}

/**
 * React to a URL change.
 *
 * A hash jump is not a navigation: the document is untouched, so tearing the content script down
 * would stop a read the student is in the middle of and drop every listener for the sake of a
 * scroll. The LMS integrations are still asked to re-detect, because Google Classroom does route by
 * hash and each reinit no-ops when nothing changed for it.
 */
function onLocationChange() {
  const previousUrl = _lastUrl;
  _lastUrl = location.href;

  if (isSameDocumentJump(previousUrl, _lastUrl)) {
    console.log('[AssisT] Same-document jump, keeping listeners and any read in progress');
    reinitLmsModules();
    return;
  }

  console.log('[AssisT] SPA navigation detected, cleaning up listeners');
  cleanupContentScript();
  installGlobalListeners();
  // Re-detect + re-mount LMS integrations for the new route.
  reinitLmsModules();
}

const _navObserver = new MutationObserver(() => {
  if (location.href !== _lastUrl) {
    onLocationChange();
  }
});
_navObserver.observe(document, { subtree: true, childList: true });
window.addEventListener('popstate', () => {
  if (location.href !== _lastUrl) {
    onLocationChange();
  }
});

/**
 * The document became a writing surface after AssisT had already loaded — an editor set
 * `contenteditable` on the body once its own scripts ran. Everything AssisT put on the page is
 * now inside the student's essay field, so take it all back off and stop running here.
 *
 * Paired with the load-time abort in src/content/editable-document-guard.js: one check, both
 * orders. The teardown order matters — the features release their own listeners, observers and
 * storage handles first, then the sweep removes any container they left behind.
 */
function teardownForEditableDocument() {
  console.log('[AssisT] This document became an editor surface — removing AssisT from it');
  _navObserver.disconnect();
  cleanupContentScript();
  companion_cleanup();
  removeInjectedAssistUI();
}

watchForEditableDocument(teardownForEditableDocument);
