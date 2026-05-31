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
 * Reference to the TTS readText function from content-simple.js
 * @type {Function|null}
 */
let readTextFunction = null;

/**
 * Reference to the settings object from content-simple.js
 * @type {Object|null}
 */
let settingsObject = null;

/**
 * Dynamically loads the Canvas adapter module
 * @async
 * @function canvas_loadAdapter
 * @returns {Promise<Object|null>} The loaded Canvas adapter module or null on failure
 * @description Lazy-loads the Canvas adapter only when Canvas integration is enabled.
 * Caches the adapter after first load to avoid repeated imports.
 */
export async function canvas_loadAdapter() {
  if (!CanvasAdapter) {
    try {
      CanvasAdapter = await import(chrome.runtime.getURL('src/adapters/canvas-adapter.js'));
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
 * 2. Loads the Canvas adapter
 * 3. Detects the current Canvas page type
 * 4. Waits for Canvas content to load
 * 5. Initializes appropriate features (e.g., Assignment Reader, Quiz Helper)
 */
export async function canvas_initialize() {
  if (!canvas_enabled) {
    return;
  }

  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return;
  }

  // Check if on Canvas page
  if (!adapter.isCanvasPage()) {
    console.log('[Canvas] Not a Canvas page, skipping');
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

  console.log('[Canvas] Assignment detected:', assignment.title);

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
 * Reads assignment content using TTS functionality
 * @function canvas_readAssignment
 * @param {Object} assignment - Assignment data extracted from Canvas page
 * @param {string} assignment.title - Title of the assignment
 * @param {string} assignment.text - Main content text of the assignment
 * @param {HTMLElement} assignment.element - DOM element containing the assignment
 * @returns {void}
 * @description Combines assignment title and content into full text and triggers
 * TTS reading with synchronized highlighting. Validates that TTS is enabled before
 * attempting to read.
 */
export function canvas_readAssignment(assignment) {
  if (!settingsObject || !settingsObject.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[Canvas] Reading assignment:', assignment.title);
  showToast('📖 Reading: ' + assignment.title);

  // Read title first
  const titleText = assignment.title;
  const contentText = assignment.text;
  const fullText = titleText + '. ' + contentText;

  // Use existing TTS functionality
  if (readTextFunction) {
    readTextFunction(fullText, assignment.element);
  } else {
    console.error('[Canvas] readText function not initialized');
  }
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
 * Initializes the Canvas module with required dependencies
 * @function initializeCanvasModule
 * @param {Function} readText - The TTS readText function from content-simple.js
 * @param {Object} settings - The settings object from content-simple.js
 * @returns {void}
 * @description Must be called by content-simple.js to provide necessary dependencies
 * before Canvas features can be used.
 */
export function initializeCanvasModule(readText, settings) {
  readTextFunction = readText;
  settingsObject = settings;
  console.log('[Canvas] Module initialized with dependencies');
}

/**
 * Quiz Helper State Variables
 */
let quizHelper_enabled = false;
let quizHelper_questions = [];
let quizHelper_currentIndex = -1;
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

    // Add hover effect
    element.style.cursor = 'pointer';
    element.style.transition = 'all 0.3s ease';

    // Add border to indicate clickable
    element.style.border = `2px dashed ${quizHelper_settings.highlightColor}40`;
    element.style.borderRadius = '8px';
    element.style.padding = '12px';
    element.style.marginBottom = '16px';

    // Add click handler
    element.addEventListener('click', e => {
      // Don't interfere with actual quiz interaction (radio buttons, etc.)
      if (e.target.matches('input, label, button')) {
        return;
      }

      e.stopPropagation();
      quizHelper_readQuestion(index);
    });

    // Add hover effects
    element.addEventListener('mouseenter', () => {
      if (quizHelper_currentIndex !== index) {
        element.style.border = `2px solid ${quizHelper_settings.highlightColor}80`;
        element.style.backgroundColor = `${quizHelper_settings.highlightColor}10`;
      }
    });

    element.addEventListener('mouseleave', () => {
      if (quizHelper_currentIndex !== index) {
        element.style.border = `2px dashed ${quizHelper_settings.highlightColor}40`;
        element.style.backgroundColor = '';
      }
    });
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

  if (!settingsObject || !settingsObject.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  const question = quizHelper_questions[index];
  quizHelper_currentIndex = index;

  // Build text to read
  let textToRead = `Question ${question.number}: ${question.text}`;

  // Add answers if enabled
  if (quizHelper_settings.readAnswers && question.answers && question.answers.length > 0) {
    textToRead += '. Answer options: ';
    question.answers.forEach((answer, i) => {
      textToRead += `Option ${String.fromCharCode(65 + i)}: ${answer.text}. `;
    });
  }

  console.log('[QuizHelper] Reading question', question.number);

  // Highlight question
  if (quizHelper_settings.highlightQuestion) {
    quizHelper_highlightQuestion(question.element);
  }

  // Scroll to question smoothly
  question.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Read using TTS
  if (readTextFunction) {
    readTextFunction(textToRead, question.element);
  } else {
    console.error('[QuizHelper] readText function not initialized');
  }
}

/**
 * Highlight current question
 * @function quizHelper_highlightQuestion
 * @param {HTMLElement} element - Question element to highlight
 * @returns {void}
 */
function quizHelper_highlightQuestion(element) {
  // Remove previous highlights
  quizHelper_questions.forEach(q => {
    if (q.element && q.element !== element) {
      q.element.style.border = `2px dashed ${quizHelper_settings.highlightColor}40`;
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

  // Remove visual indicators
  quizHelper_questions.forEach(q => {
    if (q.element) {
      q.element.style.border = '';
      q.element.style.cursor = '';
      q.element.style.backgroundColor = '';
      q.element.style.boxShadow = '';
      q.element.style.padding = '';
      q.element.style.marginBottom = '';
      delete q.element.dataset.quizQuestionIndex;
    }
  });

  quizHelper_questions = [];
  quizHelper_currentIndex = -1;

  console.log('[QuizHelper] Cleanup complete');
}

/** @type {Object} Default settings for Canvas integration */
const DEFAULT_SETTINGS = {
  enabled: false,
  quizHelper: {
    enabled: false,
    readAnswers: true,
    autoRead: false,
    highlightQuestion: true,
    highlightColor: '#4A90E2',
    keyboardNavigation: true,
  },
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = canvas_enabled;
  const newEnabled = settings.enabled || false;

  // Load Quiz Helper settings
  const qhSettings = settings.quizHelper;
  const wasQHEnabled = quizHelper_enabled;

  if (typeof qhSettings === 'object') {
    quizHelper_settings.readAnswers = qhSettings.readAnswers !== false;
    quizHelper_settings.autoRead = qhSettings.autoRead || false;
    quizHelper_settings.highlightQuestion = qhSettings.highlightQuestion !== false;
    quizHelper_settings.highlightColor =
      qhSettings.highlightColor || DEFAULT_SETTINGS.quizHelper.highlightColor;
    quizHelper_settings.keyboardNavigation = qhSettings.keyboardNavigation !== false;
  }

  // Handle Canvas integration enable/disable
  if (newEnabled && !wasEnabled) {
    canvas_enabled = true;
    canvas_initialize();
    if (!isInit) {
      showToast('🎓 Canvas Integration enabled');
    }
  } else if (!newEnabled && wasEnabled) {
    canvas_enabled = false;
    canvas_removeFAB();
    quizHelper_cleanup();
    if (!isInit) {
      showToast('Canvas Integration disabled');
    }
  }

  // Handle Quiz Helper settings updates (only if Canvas is enabled)
  if (qhSettings && canvas_enabled) {
    const newQHEnabled =
      typeof qhSettings === 'object' ? qhSettings.enabled || false : qhSettings || false;

    if (newQHEnabled && !wasQHEnabled) {
      quizHelper_enabled = true;
      canvas_initializeQuizHelper();
    } else if (!newQHEnabled && wasQHEnabled) {
      quizHelper_enabled = false;
      quizHelper_cleanup();
      if (!isInit) {
        showToast('Quiz Helper disabled');
      }
    } else if (newQHEnabled && wasQHEnabled && !isInit) {
      // Settings changed, reinitialize
      quizHelper_cleanup();
      canvas_initializeQuizHelper();
    }

    if (typeof qhSettings !== 'object') {
      quizHelper_enabled = qhSettings || false;
    } else {
      quizHelper_enabled = newQHEnabled;
    }
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
