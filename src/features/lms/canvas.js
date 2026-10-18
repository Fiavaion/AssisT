/**
 * @fileoverview Canvas LMS Integration Module
 * @description Provides seamless integration with Canvas LMS, enabling
 * TTS functionality for assignment content with floating action button (FAB)
 * interface. Dynamically loads Canvas adapter and initializes features based
 * on detected page type.
 *
 * @module features/lms/canvas
 * @version 1.1.0
 * @requires core/ui/toast
 * @requires chrome.storage API
 * @requires chrome.runtime API
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';
import { StorageManager } from '../../utils/storage-manager.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { isCanvasPage } from '../../adapters/lms-detect.js';
import { joinForSpeech, readAloud } from './lms-read-aloud.js';

/**
 * Global state for Canvas integration
 */

/**
 * Indicates whether Canvas integration is enabled via settings
 * @type {boolean}
 */
export let canvas_enabled = false;

/**
 * Reference to the floating action button (FAB) element on Canvas pages
 * @type {HTMLElement|null}
 */
export let canvas_fabElement = null;

/**
 * Dynamically loaded Canvas adapter module
 * @type {Object|null}
 */
let CanvasAdapter = null;

/**
 * Loads the Canvas adapter, but only on a Canvas page
 * @async
 * @function canvas_loadAdapter
 * @returns {Promise<Object|null>} The loaded Canvas adapter module, or null off Canvas / on failure
 * @description The page check comes first and is the reason this is the only gate: every entry point
 * goes through here, so a page that is not Canvas never fetches the adapter chunk and never logs.
 * The import is a plain specifier so Vite bundles the adapter into assets/ — the previous
 * `chrome.runtime.getURL('src/adapters/canvas-adapter.js')` loaded a raw copy of the source, whose
 * own imports had to exist as raw files beside it, and one of them did not.
 * Caches the adapter after first load to avoid repeated imports.
 */
export async function canvas_loadAdapter() {
  if (!isCanvasPage()) {
    return null;
  }

  if (!CanvasAdapter) {
    try {
      CanvasAdapter = await import('../../adapters/canvas-adapter.js');
      console.log('[Canvas] Adapter loaded');
    } catch (error) {
      console.error('[Canvas] Failed to load adapter:', error);
    }
  }
  return CanvasAdapter;
}

/**
 * Initializes Canvas-specific features based on detected page type
 * @async
 * @function canvas_initialize
 * @returns {Promise<void>}
 * @description Main initialization function that:
 * 1. Verifies Canvas integration is enabled
 * 2. Loads the Canvas adapter, which no-ops off Canvas
 * 3. Detects the current Canvas page type
 * 4. Waits for Canvas content to load
 * 5. Initializes appropriate features (e.g., Assignment Reader, Quiz Helper)
 */
export async function canvas_initialize() {
  if (!canvas_enabled) {
    return;
  }

  // Off Canvas, loadAdapter returns null without importing anything.
  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return;
  }

  const pageType = adapter.detectCanvasPageType();
  console.log('[Canvas] Page type detected:', pageType);

  // Wait for content to load
  await adapter.waitForCanvasContent();

  // Initialize features based on page type
  if (pageType === adapter.CanvasPageType.ASSIGNMENT) {
    canvas_initializeAssignmentReader();
  } else if (pageType === adapter.CanvasPageType.QUIZ) {
    canvas_initializeQuizHelper();
  }
}

/**
 * Initializes the Assignment Reader feature with FAB interface
 * @async
 * @function canvas_initializeAssignmentReader
 * @returns {Promise<void>}
 * @description Creates a floating action button (FAB) on Canvas assignment pages
 * that allows students to trigger TTS reading of the assignment content.
 * The FAB is positioned in the bottom-right corner and displays "Read Assignment".
 */
export async function canvas_initializeAssignmentReader() {
  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return;
  }

  // Extract assignment content
  const assignment = adapter.extractAssignmentContent();
  if (!assignment) {
    console.log('[Canvas] No assignment content found');
    return;
  }

  console.log('[Canvas] Assignment detected');

  // Create FAB button
  canvas_fabElement = adapter.createCanvasFAB({
    text: 'Read Assignment',
    icon: '📖',
    onClick: () => canvas_readAssignment(assignment),
    position: 'bottom-right',
  });

  document.body.appendChild(canvas_fabElement);
  console.log('[Canvas] Assignment Reader initialized');
}

/**
 * Reads assignment content aloud.
 * @function canvas_readAssignment
 * @param {Object} assignment - Assignment data extracted from Canvas page
 * @param {string} assignment.title - Title of the assignment
 * @param {string} assignment.text - Main content text of the assignment
 * @param {HTMLElement} assignment.element - DOM element containing the assignment
 * @returns {boolean} true if reading started
 * @description Hands the assignment to the shared read-aloud path, the same one Moodle and Google
 * Classroom use, so a refusal reads the same on every platform.
 */
export function canvas_readAssignment(assignment) {
  return readAloud({
    text: joinForSpeech([assignment.title, assignment.text]),
    element: assignment.element,
    announcement: `Reading: ${assignment.title || 'this assignment'}`,
  });
}

/**
 * Removes the Canvas FAB from the page
 * @function canvas_removeFAB
 * @returns {void}
 * @description Cleanup function that removes the floating action button
 * from the DOM when Canvas integration is disabled.
 */
export function canvas_removeFAB() {
  if (canvas_fabElement) {
    canvas_fabElement.remove();
    canvas_fabElement = null;
  }
}

/**
 * Tear down everything this module injected into the page (FAB + quiz-helper
 * listeners). Safe to call on any page. Used by the SPA-navigation handler so
 * stale controls from the previous route don't linger.
 */
export function canvas_cleanup() {
  canvas_removeFAB();
  quizHelper_cleanup();
}

/**
 * Re-detect the current page and re-mount Canvas features after an SPA navigation.
 * Cleans up first so nothing is duplicated; no-ops off Canvas / when disabled.
 */
export async function canvas_reinit() {
  canvas_cleanup();
  await canvas_initialize();
}

/**
 * Quiz Helper State Variables
 */
let quizHelper_enabled = false;
let quizHelper_questions = [];
let quizHelper_currentIndex = -1;
/** The read-aloud button injectUI added to each question, with its handler cleanup. */
let quizHelper_buttons = [];
const quizHelper_settings = {
  readAnswers: true,
  autoRead: false,
  highlightQuestion: true,
  highlightColor: '#4A90E2',
  keyboardNavigation: true,
};

/**
 * Initialize Quiz Helper on Canvas quiz pages
 * @async
 * @function canvas_initializeQuizHelper
 * @returns {Promise<void>}
 * @description Extracts quiz questions and sets up interactive quiz navigation
 * with TTS support, keyboard shortcuts, and visual highlighting.
 */
export async function canvas_initializeQuizHelper() {
  if (!quizHelper_enabled) {
    console.log('[QuizHelper] Not enabled');
    return;
  }

  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return;
  }

  // Extract quiz questions using Canvas adapter
  quizHelper_questions = adapter.extractQuizQuestions() || [];

  if (quizHelper_questions.length === 0) {
    console.warn('[QuizHelper] No questions found on quiz page');
    showToast('⚠️ No quiz questions detected');
    return;
  }

  console.log('[QuizHelper] Detected', quizHelper_questions.length, 'questions');
  showToast(`📝 Quiz Helper: ${quizHelper_questions.length} questions found`);

  // Inject UI elements
  quizHelper_injectUI();

  // Setup keyboard navigation if enabled
  if (quizHelper_settings.keyboardNavigation) {
    quizHelper_setupKeyboardNav();
  }

  console.log('[QuizHelper] Initialized successfully');
}

/**
 * Inject UI elements (click handlers, visual indicators)
 * @function quizHelper_injectUI
 * @returns {void}
 */
function quizHelper_injectUI() {
  quizHelper_questions.forEach((question, index) => {
    const element = question.element;
    if (!element) {
      return;
    }

    // Add data attribute for tracking
    element.dataset.quizQuestionIndex = index;

    // The affordance is this button and nothing else. It used to be the question container: a
    // dashed border in the highlight colour and a pointer cursor, which is a colour-only cue
    // (SC 1.4.1) that a keyboard could not reach at all (SC 2.1.1), painted over a quiz a student
    // is being marked on. The button says in words what it does, it is in the tab order, and it
    // answers Enter and Space. The container is deliberately NOT given role="button": it holds the
    // answer radios, and a button role wrapping them would both mislead assistive technology and
    // swallow the Space press that picks an answer.
    // A settings change re-runs this over the same question elements, so the button is added only
    // once — the same stacking bug the listener tracking below exists to stop.
    const readBtn =
      element.querySelector('.assist-quiz-read-btn') || document.createElement('button');
    const isNewButton = !readBtn.isConnected;
    readBtn.type = 'button';
    readBtn.className = 'assist-quiz-read-btn';
    readBtn.textContent = '🔊 Read this question aloud';
    readBtn.setAttribute('aria-label', `Read question ${question.number} aloud`);
    readBtn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'margin:0 0 10px',
      'padding:6px 12px',
      'font:inherit',
      'font-size:13px',
      'line-height:1.4',
      'color:inherit',
      'background:transparent',
      'border:2px solid currentColor',
      'border-radius:6px',
      'cursor:pointer',
    ].join(';');
    if (isNewButton) {
      element.insertBefore(readBtn, element.firstChild);
      quizHelper_buttons.push({
        button: readBtn,
        cleanup: attachAccessibleHandler(
          readBtn,
          `Quiz question ${question.number}`,
          () => quizHelper_readQuestion(index),
          { enableVisualFeedback: false }
        ),
      });
    }
  });

  console.log('[QuizHelper] UI injected for', quizHelper_questions.length, 'questions');
}

/**
 * Read question aloud with TTS
 * @function quizHelper_readQuestion
 * @param {number} index - Question index
 * @returns {void}
 */
function quizHelper_readQuestion(index) {
  if (index < 0 || index >= quizHelper_questions.length) {
    return;
  }

  const question = quizHelper_questions[index];

  // Build text to read
  let textToRead = `Question ${question.number}: ${question.text}`;

  // Add answers if enabled
  if (quizHelper_settings.readAnswers && question.answers && question.answers.length > 0) {
    textToRead += '. Answer options: ';
    question.answers.forEach((answer, i) => {
      textToRead += `Option ${String.fromCharCode(65 + i)}: ${answer.text}. `;
    });
  }

  // The highlight and the scroll are only worth doing if reading actually starts, so the shared
  // path is asked first: it announces the reading, or says plainly why there is none.
  if (
    !readAloud({
      text: textToRead,
      element: question.element,
      announcement: `Reading question ${question.number}`,
    })
  ) {
    return;
  }

  quizHelper_currentIndex = index;

  if (quizHelper_settings.highlightQuestion) {
    quizHelper_highlightQuestion(question.element);
  }

  question.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Highlight current question
 * @function quizHelper_highlightQuestion
 * @param {HTMLElement} element - Question element to highlight
 * @returns {void}
 */
function quizHelper_highlightQuestion(element) {
  // Only one question is being read, so every other one goes back to the page's own styling.
  quizHelper_questions.forEach(q => {
    if (q.element && q.element !== element) {
      q.element.style.border = '';
      q.element.style.backgroundColor = '';
      q.element.style.boxShadow = '';
    }
  });

  // Highlight current question
  element.style.border = `3px solid ${quizHelper_settings.highlightColor}`;
  element.style.backgroundColor = `${quizHelper_settings.highlightColor}15`;
  element.style.boxShadow = `0 0 12px ${quizHelper_settings.highlightColor}40`;
}

/**
 * Setup keyboard navigation
 * @function quizHelper_setupKeyboardNav
 * @returns {void}
 */
function quizHelper_setupKeyboardNav() {
  document.addEventListener('keydown', quizHelper_handleKeyPress);
  console.log('[QuizHelper] Keyboard navigation enabled');
}

/**
 * Handle keyboard events
 * @function quizHelper_handleKeyPress
 * @param {KeyboardEvent} e - Keyboard event
 * @returns {void}
 */
function quizHelper_handleKeyPress(e) {
  if (!quizHelper_enabled || quizHelper_questions.length === 0) {
    return;
  }

  // Skip if typing in input fields
  const target = e.target;
  if (target.matches('input, textarea, [contenteditable="true"]')) {
    return;
  }

  // Arrow Down - next question
  if (e.key === 'ArrowDown' && e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();

    const nextIndex = quizHelper_currentIndex + 1;
    if (nextIndex < quizHelper_questions.length) {
      quizHelper_navigateToQuestion(nextIndex);

      // Auto-read if enabled
      if (quizHelper_settings.autoRead) {
        quizHelper_readQuestion(nextIndex);
      }
    } else {
      showToast('📝 Already at last question');
    }
  }

  // Arrow Up - previous question
  if (e.key === 'ArrowUp' && e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();

    const prevIndex = quizHelper_currentIndex - 1;
    if (prevIndex >= 0) {
      quizHelper_navigateToQuestion(prevIndex);

      // Auto-read if enabled
      if (quizHelper_settings.autoRead) {
        quizHelper_readQuestion(prevIndex);
      }
    } else {
      showToast('📝 Already at first question');
    }
  }

  // Enter - read current question
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();

    if (quizHelper_currentIndex >= 0 && quizHelper_currentIndex < quizHelper_questions.length) {
      quizHelper_readQuestion(quizHelper_currentIndex);
    } else if (quizHelper_questions.length > 0) {
      // If no question selected, read first question
      quizHelper_readQuestion(0);
    }
  }
}

/**
 * Navigate to question (highlight and scroll)
 * @function quizHelper_navigateToQuestion
 * @param {number} index - Question index
 * @returns {void}
 */
function quizHelper_navigateToQuestion(index) {
  if (index < 0 || index >= quizHelper_questions.length) {
    return;
  }

  quizHelper_currentIndex = index;
  const question = quizHelper_questions[index];

  if (quizHelper_settings.highlightQuestion) {
    quizHelper_highlightQuestion(question.element);
  }

  question.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast(`📝 Question ${question.number} of ${quizHelper_questions.length}`);

  console.log('[QuizHelper] Navigated to question', question.number);
}

/**
 * Cleanup Quiz Helper
 * @function quizHelper_cleanup
 * @returns {void}
 */
function quizHelper_cleanup() {
  // Remove event listeners
  document.removeEventListener('keydown', quizHelper_handleKeyPress);
  quizHelper_buttons.forEach(({ button, cleanup }) => {
    cleanup();
    button.remove();
  });
  quizHelper_buttons = [];

  // Take the reading highlight back off, and leave the page as it was found.
  quizHelper_questions.forEach(q => {
    if (q.element) {
      q.element.style.border = '';
      q.element.style.backgroundColor = '';
      q.element.style.boxShadow = '';
      delete q.element.dataset.quizQuestionIndex;
    }
  });

  quizHelper_questions = [];
  quizHelper_currentIndex = -1;

  console.log('[QuizHelper] Cleanup complete');
}

/** @type {Object} Settings for Canvas integration when nothing is stored */
const DEFAULT_SETTINGS = {
  enabled: false,
  quizHelper: StorageManager.DEFAULT_SETTINGS.canvasIntegration.quizHelper,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = canvas_enabled;
  const newEnabled = settings.enabled || false;

  // The branch arrives as stored, which for an older install can be `quizHelper: false`. The
  // settings merge upgrades that and fills every option the stored object lacks.
  const qhSettings = StorageManager.withDefaults({ canvasIntegration: settings }).canvasIntegration
    .quizHelper;
  const wasQHEnabled = quizHelper_enabled;

  quizHelper_settings.readAnswers = qhSettings.readAnswers !== false;
  quizHelper_settings.autoRead = qhSettings.autoRead === true;
  quizHelper_settings.highlightQuestion = qhSettings.highlightQuestion !== false;
  quizHelper_settings.highlightColor =
    qhSettings.highlightColor || DEFAULT_SETTINGS.quizHelper.highlightColor;
  quizHelper_settings.keyboardNavigation = qhSettings.keyboardNavigation !== false;

  // Handle Canvas integration enable/disable
  if (newEnabled && !wasEnabled) {
    canvas_enabled = true;
    canvas_initialize();
    // Announced only on this platform: the setting is shared, so a change made anywhere reaches
    // every tab, and a message about another LMS is noise to a student who is not on it.
    if (!isInit && isCanvasPage()) {
      showToast('🎓 Canvas Integration enabled');
    }
  } else if (!newEnabled && wasEnabled) {
    canvas_enabled = false;
    canvas_removeFAB();
    quizHelper_cleanup();
    if (!isInit && isCanvasPage()) {
      showToast('Canvas Integration disabled');
    }
  }

  // Handle Quiz Helper settings updates (only if Canvas is enabled)
  if (canvas_enabled) {
    const newQHEnabled = qhSettings.enabled === true;

    if (newQHEnabled && !wasQHEnabled) {
      quizHelper_enabled = true;
      canvas_initializeQuizHelper();
    } else if (!newQHEnabled && wasQHEnabled) {
      quizHelper_enabled = false;
      quizHelper_cleanup();
      if (!isInit && isCanvasPage()) {
        showToast('Quiz Helper disabled');
      }
    } else if (newQHEnabled && wasQHEnabled && !isInit) {
      // Settings changed, reinitialize
      quizHelper_cleanup();
      canvas_initializeQuizHelper();
    }

    quizHelper_enabled = newQHEnabled;
  }

  console.log(
    `[Canvas] Settings ${isInit ? 'loaded' : 'updated'} - Canvas:`,
    newEnabled,
    'QuizHelper:',
    quizHelper_enabled
  );
}

/**
 * Initialize Canvas integration using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'canvasIntegration',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);
