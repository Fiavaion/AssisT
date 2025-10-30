/**
 * AssisT Simple Content Script
 * Click any paragraph to read it with TTS and highlighting
 */

// === MODULAR IMPORTS (Phase 1 Refactoring with Vite) ===
import { showToast } from '../core/ui/toast.js';
import { hexToRgba } from '../core/utils/color.js';
import { isTextInput } from '../features/stt/validation.js';
import { removeHighlight, highlightElement, removeElementHighlight, highlightWordByWord, cleanupWordByWord } from '../core/dom/highlighting.js';
import { dyslexia_initialize } from '../content/features/dyslexia.js';
import { readingGuide_enable, readingGuide_disable, readingGuide_createLine, readingGuide_updatePosition, readingGuide_updateStyle, readingGuide_handleMouseMove } from '../features/readingGuide/readingGuide.js';
import { screenOverlay_create, screenOverlay_remove, screenOverlay_update, screenOverlay_enable, screenOverlay_disable, screenOverlay_settings } from '../features/screenOverlay/screenOverlay.js';
import '../features/textCustomization/textCustomization.js'; // Self-initializing module with Chrome storage listeners
import '../features/focusMode/focusMode.js'; // Self-initializing module with Chrome storage listeners

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
// SPRINT 4 FEATURE: CANVAS INTEGRATION
// ============================================================

// Canvas Integration State (Feature Isolated)
let canvas_enabled = false;
let canvas_fabElement = null;

// Import Canvas Adapter dynamically when needed
let CanvasAdapter = null;

async function canvas_loadAdapter() {
  if (!CanvasAdapter) {
    try {
      CanvasAdapter = await import(chrome.runtime.getURL('adapters/canvas-adapter.js'));
      console.log('[Canvas] Adapter loaded');
    } catch (error) {
      console.error('[Canvas] Failed to load adapter:', error);
    }
  }
  return CanvasAdapter;
}

// Initialize Canvas features
async function canvas_initialize() {
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
  }
}

// Initialize Assignment Reader
async function canvas_initializeAssignmentReader() {
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

// Read assignment content
function canvas_readAssignment(assignment) {
  if (!settings.enabled) {
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
  readText(fullText, assignment.element);
}

// Remove Canvas FAB
function canvas_removeFAB() {
  if (canvas_fabElement) {
    canvas_fabElement.remove();
    canvas_fabElement = null;
  }
}

// Load Canvas Integration settings
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.canvasIntegration) {
    const ciSettings = result.assist_settings.canvasIntegration;
    canvas_enabled = ciSettings.enabled || false;

    if (canvas_enabled) {
      canvas_initialize();
    }

    console.log('[Canvas] Settings loaded:', canvas_enabled);
  } else {
    console.log('[Canvas] Integration disabled by default');
  }
});

// Listen for Canvas Integration settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.canvasIntegration) {
    const ciSettings = changes.assist_settings.newValue.canvasIntegration;
    const newEnabled = ciSettings.enabled || false;

    if (newEnabled && !canvas_enabled) {
      canvas_enabled = true;
      canvas_initialize();
      showToast('🎓 Canvas Integration enabled');
    } else if (!newEnabled && canvas_enabled) {
      canvas_enabled = false;
      canvas_removeFAB();
      showToast('Canvas Integration disabled');
    }

    console.log('[Canvas] Settings updated:', newEnabled);
  }
});

// ============================================================
// SPRINT 9 FEATURE: MOODLE LMS INTEGRATION
// ============================================================

// Moodle Integration State (Feature Isolated)
let moodle_enabled = false;
let moodle_fabElement = null;

// Import Moodle Adapter dynamically when needed
let MoodleAdapter = null;

async function moodle_loadAdapter() {
  if (!MoodleAdapter) {
    try {
      MoodleAdapter = await import(chrome.runtime.getURL('adapters/moodle-adapter.js'));
      console.log('[Moodle] Adapter loaded');
    } catch (error) {
      console.error('[Moodle] Failed to load adapter:', error);
    }
  }
  return MoodleAdapter;
}

// Initialize Moodle features
async function moodle_initialize() {
  if (!moodle_enabled) {
    return;
  }

  const adapter = await moodle_loadAdapter();
  if (!adapter) {
    return;
  }

  // Check if on Moodle page
  if (!adapter.isMoodlePage()) {
    console.log('[Moodle] Not a Moodle page, skipping');
    return;
  }

  const pageType = adapter.detectMoodlePageType();
  console.log('[Moodle] Page type detected:', pageType);

  // Wait for content to load
  await adapter.waitForMoodleContent();

  // Initialize features based on page type
  if (pageType === adapter.MoodlePageType.ASSIGNMENT) {
    moodle_initializeAssignmentReader();
  } else if (pageType === adapter.MoodlePageType.FORUM) {
    moodle_initializeForumReader();
  } else if (pageType === adapter.MoodlePageType.PAGE) {
    moodle_initializePageReader();
  }
}

// Initialize Assignment Reader
async function moodle_initializeAssignmentReader() {
  const adapter = await moodle_loadAdapter();
  if (!adapter) {
    return;
  }

  const assignment = adapter.extractAssignmentContent();
  if (!assignment) {
    console.log('[Moodle] No assignment content found');
    return;
  }

  console.log('[Moodle] Assignment detected:', assignment.title);

  // Create FAB button
  moodle_fabElement = adapter.createMoodleFAB({
    text: 'Read Assignment',
    icon: '📖',
    onClick: () => moodle_readContent(assignment),
    position: 'bottom-right',
  });

  document.body.appendChild(moodle_fabElement);
  console.log('[Moodle] Assignment Reader initialized');
}

// Initialize Forum Reader
async function moodle_initializeForumReader() {
  const adapter = await moodle_loadAdapter();
  if (!adapter) {
    return;
  }

  const posts = adapter.extractForumPosts();
  if (!posts || posts.length === 0) {
    console.log('[Moodle] No forum posts found');
    return;
  }

  console.log('[Moodle] Forum detected with', posts.length, 'posts');

  // Create FAB button to read all posts
  moodle_fabElement = adapter.createMoodleFAB({
    text: 'Read Forum',
    icon: '💬',
    onClick: () => moodle_readPosts(posts),
    position: 'bottom-right',
  });

  document.body.appendChild(moodle_fabElement);
  console.log('[Moodle] Forum Reader initialized');
}

// Initialize Page Reader
async function moodle_initializePageReader() {
  const adapter = await moodle_loadAdapter();
  if (!adapter) {
    return;
  }

  const page = adapter.extractPageContent();
  if (!page) {
    console.log('[Moodle] No page content found');
    return;
  }

  console.log('[Moodle] Page resource detected:', page.title);

  // Create FAB button
  moodle_fabElement = adapter.createMoodleFAB({
    text: 'Read Page',
    icon: '📄',
    onClick: () => moodle_readContent(page),
    position: 'bottom-right',
  });

  document.body.appendChild(moodle_fabElement);
  console.log('[Moodle] Page Reader initialized');
}

// Read Moodle content
function moodle_readContent(content) {
  if (!settings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[Moodle] Reading content:', content.title);
  showToast('📖 Reading: ' + content.title);

  const fullText = content.title + '. ' + content.text;
  readText(fullText, content.element);
}

// Read forum posts
function moodle_readPosts(posts) {
  if (!settings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[Moodle] Reading', posts.length, 'forum posts');
  showToast(`💬 Reading ${posts.length} forum posts`);

  // Combine all posts
  const fullText = posts.map(post => `${post.author} says: ${post.content}`).join('. Next post. ');

  readText(fullText, posts[0].element);
}

// Remove Moodle FAB
function moodle_removeFAB() {
  if (moodle_fabElement) {
    moodle_fabElement.remove();
    moodle_fabElement = null;
  }
}

// Load Moodle Integration settings
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.moodleIntegration) {
    const miSettings = result.assist_settings.moodleIntegration;
    moodle_enabled = miSettings.enabled || false;

    if (moodle_enabled) {
      moodle_initialize();
    }

    console.log('[Moodle] Settings loaded:', moodle_enabled);
  } else {
    console.log('[Moodle] Integration disabled by default');
  }
});

// Listen for Moodle Integration settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.moodleIntegration) {
    const miSettings = changes.assist_settings.newValue.moodleIntegration;
    const newEnabled = miSettings.enabled || false;

    if (newEnabled && !moodle_enabled) {
      moodle_enabled = true;
      moodle_initialize();
      showToast('📚 Moodle Integration enabled');
    } else if (!newEnabled && moodle_enabled) {
      moodle_enabled = false;
      moodle_removeFAB();
      showToast('Moodle Integration disabled');
    }

    console.log('[Moodle] Settings updated:', newEnabled);
  }
});

// ============================================================
// SPRINT 9 FEATURE: GOOGLE CLASSROOM INTEGRATION
// ============================================================

// Google Classroom Integration State (Feature Isolated)
let googleClassroom_enabled = false;
let googleClassroom_fabElement = null;

// Import Google Classroom Adapter dynamically when needed
let GoogleClassroomAdapter = null;

async function googleClassroom_loadAdapter() {
  if (!GoogleClassroomAdapter) {
    try {
      GoogleClassroomAdapter = await import(
        chrome.runtime.getURL('adapters/google-classroom-adapter.js')
      );
      console.log('[GoogleClassroom] Adapter loaded');
    } catch (error) {
      console.error('[GoogleClassroom] Failed to load adapter:', error);
    }
  }
  return GoogleClassroomAdapter;
}

// Initialize Google Classroom features
async function googleClassroom_initialize() {
  if (!googleClassroom_enabled) {
    return;
  }

  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
    return;
  }

  // Check if on Google Classroom page
  if (!adapter.isGoogleClassroomPage()) {
    console.log('[GoogleClassroom] Not a Google Classroom page, skipping');
    return;
  }

  const pageType = adapter.detectGoogleClassroomPageType();
  console.log('[GoogleClassroom] Page type detected:', pageType);

  // Wait for content to load
  await adapter.waitForGoogleClassroomContent();

  // Initialize features based on page type
  if (pageType === adapter.GoogleClassroomPageType.ASSIGNMENT) {
    googleClassroom_initializeAssignmentReader();
  } else if (pageType === adapter.GoogleClassroomPageType.STREAM) {
    googleClassroom_initializeStreamReader();
  } else if (pageType === adapter.GoogleClassroomPageType.CLASSWORK) {
    googleClassroom_initializeClassworkReader();
  }
}

// Initialize Assignment Reader
async function googleClassroom_initializeAssignmentReader() {
  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
    return;
  }

  const assignment = adapter.extractAssignmentContent();
  if (!assignment) {
    console.log('[GoogleClassroom] No assignment content found');
    return;
  }

  console.log('[GoogleClassroom] Assignment detected:', assignment.title);

  // Create FAB button
  googleClassroom_fabElement = adapter.createGoogleClassroomFAB({
    text: 'Read Assignment',
    icon: '📖',
    onClick: () => googleClassroom_readContent(assignment),
    position: 'bottom-right',
  });

  document.body.appendChild(googleClassroom_fabElement);
  console.log('[GoogleClassroom] Assignment Reader initialized');
}

// Initialize Stream Reader
async function googleClassroom_initializeStreamReader() {
  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
    return;
  }

  const posts = adapter.extractStreamPosts();
  if (!posts || posts.length === 0) {
    console.log('[GoogleClassroom] No stream posts found');
    return;
  }

  console.log('[GoogleClassroom] Stream detected with', posts.length, 'posts');

  // Create FAB button
  googleClassroom_fabElement = adapter.createGoogleClassroomFAB({
    text: 'Read Stream',
    icon: '📢',
    onClick: () => googleClassroom_readPosts(posts),
    position: 'bottom-right',
  });

  document.body.appendChild(googleClassroom_fabElement);
  console.log('[GoogleClassroom] Stream Reader initialized');
}

// Initialize Classwork Reader
async function googleClassroom_initializeClassworkReader() {
  const adapter = await googleClassroom_loadAdapter();
  if (!adapter) {
    return;
  }

  const items = adapter.extractClassworkItems();
  if (!items || items.length === 0) {
    console.log('[GoogleClassroom] No classwork items found');
    return;
  }

  console.log('[GoogleClassroom] Classwork detected with', items.length, 'items');

  // Create FAB button
  googleClassroom_fabElement = adapter.createGoogleClassroomFAB({
    text: 'Read Classwork',
    icon: '📚',
    onClick: () => googleClassroom_readClasswork(items),
    position: 'bottom-right',
  });

  document.body.appendChild(googleClassroom_fabElement);
  console.log('[GoogleClassroom] Classwork Reader initialized');
}

// Read Google Classroom content
function googleClassroom_readContent(content) {
  if (!settings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[GoogleClassroom] Reading content:', content.title);
  showToast('📖 Reading: ' + content.title);

  const fullText = content.title + '. ' + content.text;
  readText(fullText, content.element);
}

// Read stream posts
function googleClassroom_readPosts(posts) {
  if (!settings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[GoogleClassroom] Reading', posts.length, 'stream posts');
  showToast(`📢 Reading ${posts.length} posts`);

  // Combine all posts
  const fullText = posts
    .map(post => `${post.title || 'Post'}. ${post.content}`)
    .join('. Next post. ');

  readText(fullText, posts[0].element);
}

// Read classwork items
function googleClassroom_readClasswork(items) {
  if (!settings.enabled) {
    showToast('⚠️ Enable TTS in the extension popup first');
    return;
  }

  console.log('[GoogleClassroom] Reading', items.length, 'classwork items');
  showToast(`📚 Reading ${items.length} classwork items`);

  // Combine all items
  const fullText = items
    .map(item => `${item.type}: ${item.title}. Due: ${item.dueDate || 'No due date'}.`)
    .join(' ');

  readText(fullText, items[0].element);
}

// Remove Google Classroom FAB
function googleClassroom_removeFAB() {
  if (googleClassroom_fabElement) {
    googleClassroom_fabElement.remove();
    googleClassroom_fabElement = null;
  }
}

// Load Google Classroom Integration settings
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.googleClassroomIntegration) {
    const gciSettings = result.assist_settings.googleClassroomIntegration;
    googleClassroom_enabled = gciSettings.enabled || false;

    if (googleClassroom_enabled) {
      googleClassroom_initialize();
    }

    console.log('[GoogleClassroom] Settings loaded:', googleClassroom_enabled);
  } else {
    console.log('[GoogleClassroom] Integration disabled by default');
  }
});

// Listen for Google Classroom Integration settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.googleClassroomIntegration) {
    const gciSettings = changes.assist_settings.newValue.googleClassroomIntegration;
    const newEnabled = gciSettings.enabled || false;

    if (newEnabled && !googleClassroom_enabled) {
      googleClassroom_enabled = true;
      googleClassroom_initialize();
      showToast('🎒 Google Classroom Integration enabled');
    } else if (!newEnabled && googleClassroom_enabled) {
      googleClassroom_enabled = false;
      googleClassroom_removeFAB();
      showToast('Google Classroom Integration disabled');
    }

    console.log('[GoogleClassroom] Settings updated:', newEnabled);
  }
});

// ============================================================
// SPRINT 5 FEATURE: SPEECH-TO-TEXT (STT)
// ============================================================

// STT State (Feature Isolated)
let stt_enabled = false;
let stt_controller = null;
let stt_micButton = null;
let stt_activeField = null;
const stt_settings = {
  continuous: true,
  interimResults: true,
  language: 'en-US',
  autoCapitalize: true,
  punctuationCommands: true,
  floatingButton: true,
};

// Dynamic import STT controller and mic button
async function stt_loadModules() {
  try {
    const [STTModule, MicButtonModule] = await Promise.all([
      import(chrome.runtime.getURL('src/engines/stt/stt-controller.js')),
      import(chrome.runtime.getURL('src/ui/components/microphone-button.js')),
    ]);
    return {
      STTController: STTModule.STTController,
      MicrophoneButton: MicButtonModule.MicrophoneButton,
    };
  } catch (error) {
    console.error('[STT] Failed to load modules:', error);
    return null;
  }
}

// Initialize STT controller
async function stt_initialize() {
  if (!stt_enabled) {
    return;
  }

  const modules = await stt_loadModules();
  if (!modules) {
    showToast('⚠️ STT failed to load');
    return;
  }

  // Create STT controller
  stt_controller = new modules.STTController({
    continuous: stt_settings.continuous,
    interimResults: stt_settings.interimResults,
    language: stt_settings.language,
    autoCapitalize: stt_settings.autoCapitalize,
    punctuationCommands: stt_settings.punctuationCommands,
    onStart: () => {
      console.log('[STT] Recording started');
      if (stt_micButton) {
        stt_micButton.updateState({ isRecording: true });
      }
    },
    onEnd: () => {
      console.log('[STT] Recording ended');
      if (stt_micButton) {
        stt_micButton.updateState({ isRecording: false });
      }
    },
    onResult: (text, _fullTranscript) => {
      console.log('[STT] Result:', text);
      // Text already inserted by controller
    },
    onInterimResult: text => {
      // Show interim results in mic button
      if (stt_micButton && stt_settings.interimResults) {
        stt_micButton.showInterimResult(text);
      }
    },
    onError: (error, _errorType) => {
      console.error('[STT] Error:', error.message);
      showToast('⚠️ ' + error.message);
      if (stt_micButton) {
        stt_micButton.showError(error.message);
      }
    },
  });

  // Create microphone button if enabled
  if (stt_settings.floatingButton) {
    stt_micButton = new modules.MicrophoneButton({
      onStart: targetField => {
        if (stt_controller) {
          stt_activeField = targetField;
          stt_controller.startListening(targetField);
        }
      },
      onStop: () => {
        if (stt_controller) {
          stt_controller.stopListening();
        }
      },
      onError: message => {
        showToast('⚠️ ' + message);
      },
    });
  }

  // Listen for focus on text input fields
  stt_setupFieldListeners();

  console.log('[STT] Initialized successfully');
}

// Check if element is a text input field
// EXTRACTED: See src/features/stt/validation.js - isTextInput()

// Set up listeners for text field focus
function stt_setupFieldListeners() {
  if (!stt_enabled || !stt_settings.floatingButton) {
    return;
  }

  // Listen for focus on text fields
  document.addEventListener(
    'focusin',
    e => {
      if (stt_enabled && isTextInput(e.target)) {
        stt_activeField = e.target;
        if (stt_micButton) {
          stt_micButton.show(e.target);
        }
        console.log('[STT] Field focused:', e.target.tagName);
      }
    },
    true
  );

  // Listen for focusout - Don't hide button immediately
  document.addEventListener(
    'focusout',
    e => {
      if (stt_activeField === e.target && stt_micButton) {
        // Keep button visible - only hide when:
        // 1. Recording stops naturally
        // 2. User explicitly clicks away from both field and button
        // Do NOT auto-hide on blur
        console.log('[STT] Field lost focus, but keeping button visible');
      }
    },
    true
  );

  // Hide button when clicking outside both field and button
  document.addEventListener(
    'click',
    e => {
      if (!stt_enabled || !stt_micButton) {
        return;
      }

      const clickedOnField =
        stt_activeField && (e.target === stt_activeField || stt_activeField.contains(e.target));
      const clickedOnButton =
        stt_micButton.button &&
        (e.target === stt_micButton.button || stt_micButton.button.contains(e.target));

      if (!clickedOnField && !clickedOnButton && stt_activeField && !stt_controller.isRecording) {
        stt_micButton.hide();
        stt_activeField = null;
        console.log('[STT] Clicked outside - hiding button');
      }
    },
    true
  );
}

// Cleanup STT
function stt_cleanup() {
  if (stt_controller) {
    stt_controller.destroy();
    stt_controller = null;
  }

  if (stt_micButton) {
    stt_micButton.destroy();
    stt_micButton = null;
  }

  stt_activeField = null;
  console.log('[STT] Cleanup complete');
}

// Load STT settings from storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.stt) {
    const sttSettings = result.assist_settings.stt;
    stt_enabled = sttSettings.enabled || false;
    stt_settings.continuous =
      sttSettings.continuousMode !== undefined ? sttSettings.continuousMode : true;
    stt_settings.interimResults =
      sttSettings.interimResults !== undefined ? sttSettings.interimResults : true;
    stt_settings.language = sttSettings.language || 'en-US';
    stt_settings.autoCapitalize =
      sttSettings.autoCapitalize !== undefined ? sttSettings.autoCapitalize : true;
    stt_settings.punctuationCommands =
      sttSettings.punctuationCommands !== undefined ? sttSettings.punctuationCommands : true;
    stt_settings.floatingButton =
      sttSettings.floatingButton !== undefined ? sttSettings.floatingButton : true;

    if (stt_enabled) {
      stt_initialize();
    }

    console.log('[STT] Settings loaded:', stt_enabled, stt_settings);
  } else {
    console.log('[STT] Feature disabled by default');
  }
});

// Listen for STT settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.stt) {
    const sttSettings = changes.assist_settings.newValue.stt;
    const newEnabled = sttSettings.enabled || false;

    // Update settings
    stt_settings.continuous =
      sttSettings.continuousMode !== undefined ? sttSettings.continuousMode : true;
    stt_settings.interimResults =
      sttSettings.interimResults !== undefined ? sttSettings.interimResults : true;
    stt_settings.language = sttSettings.language || 'en-US';
    stt_settings.autoCapitalize =
      sttSettings.autoCapitalize !== undefined ? sttSettings.autoCapitalize : true;
    stt_settings.punctuationCommands =
      sttSettings.punctuationCommands !== undefined ? sttSettings.punctuationCommands : true;
    stt_settings.floatingButton =
      sttSettings.floatingButton !== undefined ? sttSettings.floatingButton : true;

    // Handle enable/disable
    if (newEnabled && !stt_enabled) {
      stt_enabled = true;
      stt_initialize();
      showToast('🎤 Speech-to-Text enabled');
    } else if (!newEnabled && stt_enabled) {
      stt_enabled = false;
      stt_cleanup();
      showToast('Speech-to-Text disabled');
    } else if (newEnabled && stt_controller) {
      // Update controller settings if already initialized
      stt_controller.updateSettings({
        continuous: stt_settings.continuous,
        interimResults: stt_settings.interimResults,
        language: stt_settings.language,
        autoCapitalize: stt_settings.autoCapitalize,
        punctuationCommands: stt_settings.punctuationCommands,
      });
      console.log('[STT] Settings updated');
    }

    console.log('[STT] Settings changed:', newEnabled, stt_settings);
  }
});

// ============================================================
// SPRINT 6 FEATURE: READ ENTIRE PAGE
// ============================================================

// Extract main content from page (skip navigation, headers, sidebars)
function readPage_extractMainContent() {
  // Try to find main content area
  const mainContent =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('.main-content') ||
    document.querySelector('.content') ||
    document.querySelector('#content') ||
    // Canvas-specific selectors
    document.querySelector('.ic-Layout-contentMain') ||
    document.querySelector('.assignment_description') ||
    document.querySelector('.user_content') ||
    // Fallback to body
    document.body;

  // Build skip list (elements to exclude)
  const skipElements = new Set();
  const skipSelectors = [
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '.menu',
    '.sidebar',
    '.navigation',
    '.breadcrumb',
    '.ic-app-header',
    '.header-bar',
    '.right-side',
  ];

  skipSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => skipElements.add(el));
  });

  // Extract text from paragraphs, headings, etc.
  const textElements = mainContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

  const textParts = [];
  textElements.forEach(el => {
    // Skip if element is inside skip list
    let shouldSkip = false;
    let current = el;
    while (current && current !== document.body) {
      if (skipElements.has(current)) {
        shouldSkip = true;
        break;
      }
      current = current.parentElement;
    }

    if (!shouldSkip) {
      const text = el.textContent?.trim();
      if (text && text.length > 10) {
        textParts.push(text);
      }
    }
  });

  return {
    text: textParts.join(' '),
    element: mainContent,
    count: textParts.length,
  };
}

// Message handler for commands from background script
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  console.log('[AssisT] Message received:', message.type);

  // Handle TTS commands from popup
  if (message.type === 'TTS_COMMAND' && message.data) {
    const command = message.data.command;

    // Read entire page
    if (command === 'readPage') {
      if (!settings.enabled) {
        showToast('⚠️ Enable TTS in the extension popup first');
        return;
      }

      const { text, element, count } = readPage_extractMainContent();

      if (!text || text.length < 50) {
        showToast('⚠️ No readable content found');
        return;
      }

      console.log('[ReadPage] Reading page:', count, 'sections');
      showToast(`📖 Reading page (${count} sections)`);

      // Use existing readText function - NO MODIFICATIONS!
      readText(text, element);
    }
  }

  return true; // Keep message channel open
});

// ============================================================
// SPRINT 6 FEATURE: SCREEN COLOR OVERLAY
// ============================================================
//
// EXTRACTED: Screen Overlay feature module
// Location: src/features/screenOverlay/screenOverlay.js
//
// The screenOverlay module provides:
// - screenOverlay_create() - Creates overlay element
// - screenOverlay_update() - Updates overlay styling
// - screenOverlay_remove() - Removes overlay from DOM
// - screenOverlay_enable() - Enables the overlay feature
// - screenOverlay_disable() - Disables the overlay feature
// - screenOverlay_settings - Configuration object
//
// All initialization and storage listeners are handled within the module
// to maintain feature isolation and modularity.
//
// Imported at top of file via:
// import { screenOverlay_create, screenOverlay_remove, screenOverlay_update,
//          screenOverlay_enable, screenOverlay_disable, screenOverlay_settings }
//         from '../features/screenOverlay/screenOverlay.js';

// ============================================================
// SPRINT 7 FEATURE: CANVAS QUIZ HELPER
// ============================================================

// Quiz Helper State (Feature Isolated)
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

// Detect if on Canvas quiz page
async function quizHelper_isQuizPage() {
  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return false;
  }

  if (!adapter.isCanvasPage()) {
    return false;
  }

  const pageType = adapter.detectCanvasPageType();
  return pageType === adapter.CanvasPageType.QUIZ;
}

// Extract quiz questions
async function quizHelper_extractQuestions() {
  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return [];
  }

  const questions = adapter.extractQuizQuestions();
  return questions || [];
}

// Initialize Quiz Helper
async function quizHelper_initialize() {
  if (!quizHelper_enabled) {
    return;
  }

  const isQuiz = await quizHelper_isQuizPage();
  if (!isQuiz) {
    console.log('[QuizHelper] Not a quiz page, skipping');
    return;
  }

  // Wait for content to load
  const adapter = await canvas_loadAdapter();
  if (adapter) {
    await adapter.waitForCanvasContent(3000);
  }

  // Extract questions
  quizHelper_questions = await quizHelper_extractQuestions();

  if (quizHelper_questions.length === 0) {
    console.log('[QuizHelper] No quiz questions found');
    return;
  }

  console.log('[QuizHelper] Found', quizHelper_questions.length, 'questions');
  showToast(`📝 Quiz Helper active (${quizHelper_questions.length} questions)`);

  // Inject interactive elements
  quizHelper_injectUI();

  // Add keyboard navigation
  if (quizHelper_settings.keyboardNavigation) {
    quizHelper_setupKeyboardNav();
  }
}

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
