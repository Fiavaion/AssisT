/**
 * AssisT Simple Content Script
 * Click any paragraph to read it with TTS and highlighting
 */

// === MODULAR IMPORTS (Phase 1 Refactoring with Vite) ===
import { showToast } from '../core/ui/toast.js';
import { hexToRgba } from '../core/utils/color.js';
import { isTextInput } from '../features/stt/validation.js';
import { removeHighlight, highlightElement, removeElementHighlight, highlightWordByWord, cleanupWordByWord } from '../core/dom/highlighting.js';
import { extractMainContent } from '../core/content/readPage.js';
import { dyslexia_initialize } from '../content/features/dyslexia.js';
import { readingGuide_enable, readingGuide_disable, readingGuide_createLine, readingGuide_updatePosition, readingGuide_updateStyle, readingGuide_handleMouseMove } from '../features/readingGuide/readingGuide.js';
import { screenOverlay_create, screenOverlay_remove, screenOverlay_update, screenOverlay_enable, screenOverlay_disable, screenOverlay_settings } from '../features/screenOverlay/screenOverlay.js';
import '../features/textCustomization/textCustomization.js'; // Self-initializing module with Chrome storage listeners
import '../features/focusMode/focusMode.js'; // Self-initializing module with Chrome storage listeners
import '../features/stt/stt.js'; // Self-initializing module with Chrome storage listeners
import { initializeCanvasModule } from '../features/lms/canvas.js'; // Self-initializing module with Chrome storage listeners
import '../features/lms/moodle.js'; // Self-initializing module with Chrome storage listeners
import '../features/lms/googleClassroom.js'; // Self-initializing module with Chrome storage listeners

console.log('[AssisT] Content script loaded');

// Global state
let currentUtterance = null;
let currentElement = null;
let currentText = '';
let isPaused = false; // Manual pause state tracker
// Note: currentHighlight and wordHighlightInterval moved to src/core/dom/highlighting.js
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

// Initialize speech synthesis
const synth = window.speechSynthesis;

// Load voices when available
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

// Load settings from storage
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

// Read text with highlighting
function readText(text, element) {
  if (!text || text.trim() === '') {
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

// Initialize Canvas module with dependencies
initializeCanvasModule(readText, settings);

// Click handler
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

// Keyboard shortcuts
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

// Inject UI elements (click handlers, visual indicators)
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

// Read question aloud
function quizHelper_readQuestion(index) {
  if (index < 0 || index >= quizHelper_questions.length) {
    return;
  }

  if (!settings.enabled) {
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

  // Read using existing TTS
  readText(textToRead, question.element);
}

// Highlight current question
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

// Setup keyboard navigation
function quizHelper_setupKeyboardNav() {
  document.addEventListener('keydown', quizHelper_handleKeyPress);
  console.log('[QuizHelper] Keyboard navigation enabled');
}

// Handle keyboard events
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

// Navigate to question (highlight and scroll)
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

// Cleanup Quiz Helper
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

// Load Quiz Helper settings from storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.canvasIntegration) {
    const ciSettings = result.assist_settings.canvasIntegration;

    // Check if quizHelper is an object or boolean
    const qhSettings = ciSettings.quizHelper;
    if (typeof qhSettings === 'object') {
      quizHelper_enabled = qhSettings.enabled || false;
      quizHelper_settings.readAnswers = qhSettings.readAnswers !== false;
      quizHelper_settings.autoRead = qhSettings.autoRead || false;
      quizHelper_settings.highlightQuestion = qhSettings.highlightQuestion !== false;
      quizHelper_settings.highlightColor = qhSettings.highlightColor || '#4A90E2';
      quizHelper_settings.keyboardNavigation = qhSettings.keyboardNavigation !== false;
    } else {
      quizHelper_enabled = qhSettings || false;
    }

    if (quizHelper_enabled && canvas_enabled) {
      quizHelper_initialize();
    }

    console.log('[QuizHelper] Settings loaded:', quizHelper_enabled, quizHelper_settings);
  }
});

// Listen for Quiz Helper settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.canvasIntegration) {
    const ciSettings = changes.assist_settings.newValue.canvasIntegration;

    // Check if quizHelper settings exist and are an object
    const qhSettings = ciSettings.quizHelper;
    if (!qhSettings) {
      return;
    }

    const wasEnabled = quizHelper_enabled;

    if (typeof qhSettings === 'object') {
      const newEnabled = qhSettings.enabled || false;

      // Update settings
      quizHelper_settings.readAnswers = qhSettings.readAnswers !== false;
      quizHelper_settings.autoRead = qhSettings.autoRead || false;
      quizHelper_settings.highlightQuestion = qhSettings.highlightQuestion !== false;
      quizHelper_settings.highlightColor = qhSettings.highlightColor || '#4A90E2';
      quizHelper_settings.keyboardNavigation = qhSettings.keyboardNavigation !== false;

      // Handle enable/disable
      if (newEnabled && !wasEnabled) {
        quizHelper_enabled = true;
        if (canvas_enabled) {
          quizHelper_initialize();
        }
      } else if (!newEnabled && wasEnabled) {
        quizHelper_enabled = false;
        quizHelper_cleanup();
        showToast('Quiz Helper disabled');
      } else if (newEnabled && wasEnabled) {
        // Settings changed, reinitialize
        quizHelper_cleanup();
        quizHelper_initialize();
      }

      console.log('[QuizHelper] Settings updated:', newEnabled, quizHelper_settings);
    } else {
      quizHelper_enabled = qhSettings || false;
    }
  }
});

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
