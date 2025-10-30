/**
 * AssisT Simple Content Script
 * Click any paragraph to read it with TTS and highlighting
 */

// === MODULAR IMPORTS (Phase 1 Refactoring) ===
import { showToast } from '../core/ui/toast.js';

console.log('[AssisT] Content script loaded');

// Global state
let currentUtterance = null;
let currentHighlight = null;
let currentElement = null;
let currentText = '';
let isPaused = false; // Manual pause state tracker
let wordHighlightInterval = null; // For word-by-word highlighting
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
          highlightElement(currentElement);
          console.log('[AssisT] Highlighting enabled');
        }

        // If highlight color or opacity changed and we're currently highlighting, update it
        if (
          settings.highlightEnabled &&
          (settings.highlightColor !== oldColor || settings.highlightOpacity !== oldOpacity) &&
          currentElement
        ) {
          highlightElement(currentElement);
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

// Remove highlighting
function removeHighlight() {
  if (currentHighlight) {
    const parent = currentHighlight.parentNode;
    if (parent) {
      const text = document.createTextNode(currentHighlight.textContent);
      parent.replaceChild(text, currentHighlight);
      parent.normalize();
    }
    currentHighlight = null;
  }

  document.querySelectorAll('.assist-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      const text = document.createTextNode(el.textContent);
      parent.replaceChild(text, el);
      parent.normalize();
    }
  });
}

// Convert hex color to rgba with opacity
function hexToRgba(hex, opacity) {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Simple highlight - just add background to whole element
function highlightElement(element) {
  removeHighlight();

  // Only apply highlight if enabled
  if (settings.highlightEnabled) {
    const bgColor = hexToRgba(settings.highlightColor, settings.highlightOpacity);
    element.style.backgroundColor = bgColor;
    element.style.transition = 'background-color 0.2s';
  }
}

// Word-by-word highlighting helper
function highlightWordByWord(element, text, rate) {
  // Clear any existing word highlighting
  if (wordHighlightInterval) {
    clearInterval(wordHighlightInterval);
    wordHighlightInterval = null;
  }

  // Remove previous word highlights
  removeHighlight();

  // Split text into words
  const words = text.split(/\s+/);
  if (words.length === 0) {
    return;
  }

  // Estimate time per word (avg reading speed ~ 150 words/min at 1.0x rate)
  // Adjusted for rate setting
  const baseWordsPerMinute = 150;
  const adjustedWordsPerMinute = baseWordsPerMinute * rate;
  const msPerWord = (60 * 1000) / adjustedWordsPerMinute;

  let currentWordIndex = 0;

  // Wrap each word in the element with a span
  const bgColor = hexToRgba(settings.highlightColor, settings.highlightOpacity);
  const originalHTML = element.innerHTML;

  // Store original content for cleanup
  element.dataset.originalHTML = originalHTML;

  // Create wrapped HTML
  const wrappedHTML = text
    .split(/(\s+)/)
    .map((part, index) => {
      if (part.trim().length === 0) {
        // Keep whitespace as-is
        return part;
      } else {
        // Wrap words in spans
        return `<span class="assist-word" data-word-index="${Math.floor(index / 2)}">${part}</span>`;
      }
    })
    .join('');

  element.innerHTML = wrappedHTML;

  // Highlight words progressively
  const wordSpans = element.querySelectorAll('.assist-word');

  function highlightWord(index) {
    // Remove previous highlight
    wordSpans.forEach(span => {
      span.style.backgroundColor = '';
    });

    // Highlight current word
    if (index < wordSpans.length) {
      wordSpans[index].style.backgroundColor = bgColor;
      wordSpans[index].style.transition = 'background-color 0.1s';
    }
  }

  // Start highlighting
  highlightWord(0);

  wordHighlightInterval = setInterval(() => {
    currentWordIndex++;
    if (currentWordIndex >= words.length) {
      clearInterval(wordHighlightInterval);
      wordHighlightInterval = null;
    } else {
      highlightWord(currentWordIndex);
    }
  }, msPerWord);
}

// Clean up word-by-word highlighting
function cleanupWordByWord(element) {
  if (wordHighlightInterval) {
    clearInterval(wordHighlightInterval);
    wordHighlightInterval = null;
  }

  // Restore original HTML if it was modified
  if (element && element.dataset.originalHTML) {
    element.innerHTML = element.dataset.originalHTML;
    delete element.dataset.originalHTML;
  }
}

// Remove element highlighting
function removeElementHighlight(element) {
  if (element) {
    element.style.backgroundColor = '';
  }
}

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
      highlightWordByWord(element, text, settings.rate);
    } else {
      // Use whole-element highlighting
      highlightElement(element);
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

// Show toast
// ============================================================
// TOAST NOTIFICATION - EXTRACTED TO MODULE
// ============================================================
// showToast() function has been extracted to: src/core/ui/toast.js
// Imported at top of file. All 41+ call sites continue to work unchanged.
// Phase 1, Step 1 of modularization (2025-10-30)

// ============================================================
// SPRINT 3 FEATURE: TEXT CUSTOMIZATION
// ============================================================

// Text Customization State (Feature Isolated)
let textCustomization_enabled = false;
let textCustomization_styleElement = null;
let textCustomization_fontLinkElement = null;
const textCustomization_settings = {
  fontFamily: 'system',
  lineSpacing: 1.5,
  letterSpacing: 0.12,
  wordSpacing: 0.16,
  paragraphSpacing: 2.0,
};

// Font map for CSS generation
const textCustomization_fontMap = {
  system: 'inherit',
  lexend: '"Lexend", -apple-system, system-ui, sans-serif',
  opendyslexic: '"OpenDyslexic", Arial, sans-serif',
  'comic-sans': '"Comic Sans MS", "Comic Sans", cursive',
  arial: 'Arial, Helvetica, sans-serif',
};

// Load Lexend font from Google Fonts
function textCustomization_loadLexend() {
  if (!textCustomization_fontLinkElement) {
    textCustomization_fontLinkElement = document.createElement('link');
    textCustomization_fontLinkElement.rel = 'stylesheet';
    textCustomization_fontLinkElement.href =
      'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600&display=swap';
    document.head.appendChild(textCustomization_fontLinkElement);
    console.log('[TextCustomization] Lexend font loaded from Google Fonts');
  }
}

// Load OpenDyslexic font from CDN
function textCustomization_loadOpenDyslexic() {
  if (!document.getElementById('assist-opendyslexic-font')) {
    const style = document.createElement('style');
    style.id = 'assist-opendyslexic-font';
    style.textContent = `
      @font-face {
        font-family: 'OpenDyslexic';
        src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/ttf/OpenDyslexic-Regular.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'OpenDyslexic';
        src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/ttf/OpenDyslexic-Bold.ttf') format('truetype');
        font-weight: bold;
        font-style: normal;
      }
    `;
    document.head.appendChild(style);
    console.log('[TextCustomization] OpenDyslexic font loaded from CDN');
  }
}

// Generate CSS for text customization
function textCustomization_generateCSS() {
  const font = textCustomization_fontMap[textCustomization_settings.fontFamily] || 'inherit';

  // Load fonts if needed
  if (textCustomization_settings.fontFamily === 'lexend') {
    textCustomization_loadLexend();
  } else if (textCustomization_settings.fontFamily === 'opendyslexic') {
    textCustomization_loadOpenDyslexic();
  }

  // Generate CSS with high specificity and !important to override Canvas styles
  // Exclude Canvas UI elements (buttons, inputs, navigation, headers)
  return `
    /* Text Customization - WCAG 2.2 SC 1.4.12 Compliant */
    body *:not(button):not(input):not(select):not(textarea):not([role="button"]):not([role="navigation"]):not(code):not(pre):not(.ic-app-header):not(.ic-app-header *):not(#header):not(#header *) {
      font-family: ${font} !important;
      line-height: ${textCustomization_settings.lineSpacing} !important;
      letter-spacing: ${textCustomization_settings.letterSpacing}em !important;
      word-spacing: ${textCustomization_settings.wordSpacing}em !important;
    }

    /* Paragraph spacing */
    p:not(.ic-app-header p):not(#header p),
    div.user_content p,
    article p,
    section p {
      margin-bottom: ${textCustomization_settings.paragraphSpacing}em !important;
    }
  `;
}

// Apply text customization
function textCustomization_apply() {
  if (!textCustomization_enabled) {
    textCustomization_remove();
    return;
  }

  // Remove existing style element
  if (textCustomization_styleElement) {
    textCustomization_styleElement.remove();
  }

  // Create new style element
  textCustomization_styleElement = document.createElement('style');
  textCustomization_styleElement.id = 'assist-text-customization';
  textCustomization_styleElement.textContent = textCustomization_generateCSS();
  document.head.appendChild(textCustomization_styleElement);

  console.log('[TextCustomization] Applied:', textCustomization_settings);
}

// Remove text customization
function textCustomization_remove() {
  if (textCustomization_styleElement) {
    textCustomization_styleElement.remove();
    textCustomization_styleElement = null;
  }
  console.log('[TextCustomization] Removed');
}

// Load Text Customization settings from storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.textCustomization) {
    const tcSettings = result.assist_settings.textCustomization;
    textCustomization_enabled = tcSettings.enabled || false;
    textCustomization_settings.fontFamily = tcSettings.fontFamily || 'system';
    textCustomization_settings.lineSpacing = tcSettings.lineSpacing || 1.5;
    textCustomization_settings.letterSpacing = tcSettings.letterSpacing || 0.12;
    textCustomization_settings.wordSpacing = tcSettings.wordSpacing || 0.16;
    textCustomization_settings.paragraphSpacing = tcSettings.paragraphSpacing || 2.0;

    if (textCustomization_enabled) {
      textCustomization_apply();
    }

    console.log(
      '[TextCustomization] Settings loaded:',
      textCustomization_enabled,
      textCustomization_settings
    );
  }
});

// Listen for Text Customization settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.textCustomization) {
    const tcSettings = changes.assist_settings.newValue.textCustomization;

    const wasEnabled = textCustomization_enabled;
    textCustomization_enabled = tcSettings.enabled || false;
    textCustomization_settings.fontFamily = tcSettings.fontFamily || 'system';
    textCustomization_settings.lineSpacing = tcSettings.lineSpacing || 1.5;
    textCustomization_settings.letterSpacing = tcSettings.letterSpacing || 0.12;
    textCustomization_settings.wordSpacing = tcSettings.wordSpacing || 0.16;
    textCustomization_settings.paragraphSpacing = tcSettings.paragraphSpacing || 2.0;

    // Apply or remove based on enabled state
    if (textCustomization_enabled) {
      textCustomization_apply();
      if (!wasEnabled) {
        showToast('✨ Text Customization enabled');
      }
    } else {
      textCustomization_remove();
      if (wasEnabled) {
        showToast('Text Customization disabled');
      }
    }

    console.log(
      '[TextCustomization] Settings updated:',
      textCustomization_enabled,
      textCustomization_settings
    );
  }
});

// ============================================================
// SPRINT 3 FEATURE: READING GUIDE
// ============================================================

// Reading Guide State (Feature Isolated)
let readingGuide_enabled = false;
let readingGuide_lineElement = null;
const readingGuide_settings = {
  lineColor: '#000000',
  lineThickness: 3,
  lineOpacity: 0.7,
};

// Create Reading Guide line element
function readingGuide_createLine() {
  if (readingGuide_lineElement) {
    return; // Already exists
  }

  readingGuide_lineElement = document.createElement('div');
  readingGuide_lineElement.id = 'assist-reading-guide-line';
  readingGuide_lineElement.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 100vw;
    height: ${readingGuide_settings.lineThickness}px;
    background-color: ${readingGuide_settings.lineColor};
    opacity: ${readingGuide_settings.lineOpacity};
    pointer-events: none;
    z-index: 9999;
    transition: top 0.05s ease-out;
    display: none;
  `;
  document.body.appendChild(readingGuide_lineElement);
  console.log('[ReadingGuide] Line element created');
}

// Update line position based on mouse Y coordinate
function readingGuide_updatePosition(mouseY) {
  if (readingGuide_lineElement && readingGuide_enabled) {
    readingGuide_lineElement.style.top = mouseY + 'px';
  }
}

// Update line styling
function readingGuide_updateStyle() {
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.height = readingGuide_settings.lineThickness + 'px';
    readingGuide_lineElement.style.backgroundColor = readingGuide_settings.lineColor;
    readingGuide_lineElement.style.opacity = readingGuide_settings.lineOpacity;
  }
}

// Enable Reading Guide
function readingGuide_enable() {
  // Check mutual exclusivity with Focus Mode
  if (focusMode_enabled) {
    focusMode_disable();
    showToast('🎯 Focus Mode disabled (Reading Guide active)');
  }

  readingGuide_enabled = true;
  readingGuide_createLine();
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.display = 'block';
  }

  // Add mousemove listener
  document.addEventListener('mousemove', readingGuide_handleMouseMove);

  console.log('[ReadingGuide] Enabled');
  showToast('📏 Reading Guide enabled');
}

// Disable Reading Guide
function readingGuide_disable() {
  readingGuide_enabled = false;
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.display = 'none';
  }

  // Remove mousemove listener
  document.removeEventListener('mousemove', readingGuide_handleMouseMove);

  console.log('[ReadingGuide] Disabled');
  showToast('Reading Guide disabled');
}

// Mouse move handler
function readingGuide_handleMouseMove(event) {
  if (readingGuide_enabled) {
    readingGuide_updatePosition(event.clientY);
  }
}

// Load Reading Guide settings from storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.readingGuide) {
    const rgSettings = result.assist_settings.readingGuide;
    readingGuide_enabled = rgSettings.enabled || false;
    readingGuide_settings.lineColor = rgSettings.lineColor || '#000000';
    readingGuide_settings.lineThickness = rgSettings.lineThickness || 3;
    readingGuide_settings.lineOpacity = rgSettings.lineOpacity || 0.7;

    if (readingGuide_enabled) {
      readingGuide_enable();
    }

    console.log('[ReadingGuide] Settings loaded:', readingGuide_enabled, readingGuide_settings);
  }
});

// Listen for Reading Guide settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.readingGuide) {
    const rgSettings = changes.assist_settings.newValue.readingGuide;

    const wasEnabled = readingGuide_enabled;
    const newEnabled = rgSettings.enabled || false;

    // Update settings
    readingGuide_settings.lineColor = rgSettings.lineColor || '#000000';
    readingGuide_settings.lineThickness = rgSettings.lineThickness || 3;
    readingGuide_settings.lineOpacity = rgSettings.lineOpacity || 0.7;

    // Handle enable/disable
    if (newEnabled && !wasEnabled) {
      readingGuide_enable();
    } else if (!newEnabled && wasEnabled) {
      readingGuide_disable();
    } else if (newEnabled) {
      // Update style if already enabled
      readingGuide_updateStyle();
    }

    console.log('[ReadingGuide] Settings updated:', newEnabled, readingGuide_settings);
  }
});

// ============================================================
// SPRINT 3 FEATURE: FOCUS MODE
// ============================================================

// Focus Mode State (Feature Isolated)
let focusMode_enabled = false;
let focusMode_windowElement = null;
const focusMode_settings = {
  boxWidth: 400,
  boxHeight: 100,
  overlayOpacity: 0.7,
};

// Create Focus Mode window element with box-shadow overlay
function focusMode_createWindow() {
  if (focusMode_windowElement) {
    return; // Already exists
  }

  // Create a single div that will cast a huge box-shadow to darken everything else
  focusMode_windowElement = document.createElement('div');
  focusMode_windowElement.id = 'assist-focus-mode-window';

  // Calculate border-radius as 20% of the smaller dimension
  const radiusPercent = 0.2;
  const radius =
    Math.min(focusMode_settings.boxWidth, focusMode_settings.boxHeight) * radiusPercent;

  focusMode_windowElement.style.cssText = `
    position: fixed;
    width: ${focusMode_settings.boxWidth}px;
    height: ${focusMode_settings.boxHeight}px;
    border-radius: ${radius}px;
    pointer-events: none;
    z-index: 9998;
    display: none;
    background-color: transparent;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, ${focusMode_settings.overlayOpacity});
    transition: all 0.05s ease-out;
  `;

  document.body.appendChild(focusMode_windowElement);
  console.log('[FocusMode] Window element created with box-shadow overlay');
}

// Update window position based on mouse coordinates
function focusMode_updatePosition(mouseX, mouseY) {
  if (!focusMode_windowElement || !focusMode_enabled) {
    return;
  }

  const halfWidth = focusMode_settings.boxWidth / 2;
  const halfHeight = focusMode_settings.boxHeight / 2;

  // Center window on mouse position
  const left = mouseX - halfWidth;
  const top = mouseY - halfHeight;

  focusMode_windowElement.style.left = left + 'px';
  focusMode_windowElement.style.top = top + 'px';
}

// Update window styling (size, opacity, border-radius)
function focusMode_updateStyle() {
  if (!focusMode_windowElement) {
    return;
  }

  // Calculate border-radius as 20% of the smaller dimension
  const radiusPercent = 0.2;
  const radius =
    Math.min(focusMode_settings.boxWidth, focusMode_settings.boxHeight) * radiusPercent;

  focusMode_windowElement.style.width = focusMode_settings.boxWidth + 'px';
  focusMode_windowElement.style.height = focusMode_settings.boxHeight + 'px';
  focusMode_windowElement.style.borderRadius = radius + 'px';
  focusMode_windowElement.style.boxShadow = `0 0 0 9999px rgba(0, 0, 0, ${focusMode_settings.overlayOpacity})`;
}

// Enable Focus Mode
function focusMode_enable() {
  // Check mutual exclusivity with Reading Guide
  if (readingGuide_enabled) {
    readingGuide_disable();
    showToast('📏 Reading Guide disabled (Focus Mode active)');
  }

  focusMode_enabled = true;
  focusMode_createWindow();

  if (focusMode_windowElement) {
    focusMode_windowElement.style.display = 'block';
  }

  // Add mousemove listener
  document.addEventListener('mousemove', focusMode_handleMouseMove);

  console.log('[FocusMode] Enabled');
  showToast('🎯 Focus Mode enabled');
}

// Disable Focus Mode
function focusMode_disable() {
  focusMode_enabled = false;

  if (focusMode_windowElement) {
    focusMode_windowElement.style.display = 'none';
  }

  // Remove mousemove listener
  document.removeEventListener('mousemove', focusMode_handleMouseMove);

  console.log('[FocusMode] Disabled');
  showToast('Focus Mode disabled');
}

// Mouse move handler
function focusMode_handleMouseMove(event) {
  if (focusMode_enabled) {
    focusMode_updatePosition(event.clientX, event.clientY);
  }
}

// Load Focus Mode settings from storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.focusMode) {
    const fmSettings = result.assist_settings.focusMode;
    focusMode_enabled = fmSettings.enabled || false;
    focusMode_settings.boxWidth = fmSettings.boxWidth || 400;
    focusMode_settings.boxHeight = fmSettings.boxHeight || 100;
    focusMode_settings.overlayOpacity = fmSettings.overlayOpacity || 0.7;

    if (focusMode_enabled) {
      focusMode_enable();
    }

    console.log('[FocusMode] Settings loaded:', focusMode_enabled, focusMode_settings);
  }
});

// Listen for Focus Mode settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.focusMode) {
    const fmSettings = changes.assist_settings.newValue.focusMode;

    const wasEnabled = focusMode_enabled;
    const newEnabled = fmSettings.enabled || false;

    // Update settings
    focusMode_settings.boxWidth = fmSettings.boxWidth || 400;
    focusMode_settings.boxHeight = fmSettings.boxHeight || 100;
    focusMode_settings.overlayOpacity = fmSettings.overlayOpacity || 0.7;

    // Handle enable/disable
    if (newEnabled && !wasEnabled) {
      focusMode_enable();
    } else if (!newEnabled && wasEnabled) {
      focusMode_disable();
    } else if (newEnabled) {
      // Update style if already enabled
      focusMode_updateStyle();
    }

    console.log('[FocusMode] Settings updated:', newEnabled, focusMode_settings);
  }
});

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
function stt_isTextInput(element) {
  if (!element) {
    return false;
  }

  const tagName = element.tagName?.toLowerCase();
  const contentEditable = element.contentEditable === 'true' || element.isContentEditable;

  // Check for standard text inputs
  if (tagName === 'textarea') {
    return true;
  }
  if (tagName === 'input') {
    const type = element.type?.toLowerCase();
    return ['text', 'email', 'search', 'url', 'tel'].includes(type);
  }

  // Check for contenteditable elements
  if (contentEditable) {
    return true;
  }

  // Check for Canvas Rich Text Editor
  if (element.closest('.mce-content-body, [role="textbox"]')) {
    return true;
  }

  return false;
}

// Set up listeners for text field focus
function stt_setupFieldListeners() {
  if (!stt_enabled || !stt_settings.floatingButton) {
    return;
  }

  // Listen for focus on text fields
  document.addEventListener(
    'focusin',
    e => {
      if (stt_enabled && stt_isTextInput(e.target)) {
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

// Screen Overlay State (Feature Isolated)
let screenOverlay_enabled = false;
let screenOverlay_element = null;
const screenOverlay_settings = {
  color: '#FFF4E6', // Warm sepia
  opacity: 0.3,
};

// Create screen overlay element
function screenOverlay_create() {
  if (screenOverlay_element) {
    return; // Already exists
  }

  screenOverlay_element = document.createElement('div');
  screenOverlay_element.id = 'assist-screen-overlay';
  screenOverlay_element.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: ${screenOverlay_settings.color};
    opacity: ${screenOverlay_settings.opacity};
    pointer-events: none;
    z-index: 999999;
    transition: background-color 0.3s ease, opacity 0.3s ease;
  `;

  document.body.appendChild(screenOverlay_element);
  console.log('[ScreenOverlay] Overlay element created');
}

// Update overlay styling
function screenOverlay_update() {
  if (screenOverlay_element) {
    screenOverlay_element.style.backgroundColor = screenOverlay_settings.color;
    screenOverlay_element.style.opacity = screenOverlay_settings.opacity;
    console.log('[ScreenOverlay] Updated:', screenOverlay_settings);
  }
}

// Remove screen overlay
function screenOverlay_remove() {
  if (screenOverlay_element) {
    screenOverlay_element.remove();
    screenOverlay_element = null;
    console.log('[ScreenOverlay] Removed');
  }
}

// Enable screen overlay
function screenOverlay_enable() {
  screenOverlay_enabled = true;
  screenOverlay_create();
  showToast('🎨 Screen Overlay enabled');
  console.log('[ScreenOverlay] Enabled');
}

// Disable screen overlay
function screenOverlay_disable() {
  screenOverlay_enabled = false;
  screenOverlay_remove();
  showToast('Screen Overlay disabled');
  console.log('[ScreenOverlay] Disabled');
}

// Load Screen Overlay settings from storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.screenOverlay) {
    const soSettings = result.assist_settings.screenOverlay;
    screenOverlay_enabled = soSettings.enabled || false;
    screenOverlay_settings.color = soSettings.color || '#FFF4E6';
    screenOverlay_settings.opacity = soSettings.opacity || 0.3;

    if (screenOverlay_enabled) {
      screenOverlay_enable();
    }

    console.log('[ScreenOverlay] Settings loaded:', screenOverlay_enabled, screenOverlay_settings);
  }
});

// Listen for Screen Overlay settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.screenOverlay) {
    const soSettings = changes.assist_settings.newValue.screenOverlay;

    const wasEnabled = screenOverlay_enabled;
    const newEnabled = soSettings.enabled || false;

    // Update settings
    screenOverlay_settings.color = soSettings.color || '#FFF4E6';
    screenOverlay_settings.opacity = soSettings.opacity || 0.3;

    // Handle enable/disable
    if (newEnabled && !wasEnabled) {
      screenOverlay_enable();
    } else if (!newEnabled && wasEnabled) {
      screenOverlay_disable();
    } else if (newEnabled) {
      // Update style if already enabled
      screenOverlay_update();
    }

    console.log('[ScreenOverlay] Settings updated:', newEnabled, screenOverlay_settings);
  }
});

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
// SPRINT 9 FEATURE: DYSLEXIA-OPTIMIZED READING MODE
// ============================================================

// Dyslexia Mode State (Feature Isolated)
let dyslexiaMode_enabled = false;
const dyslexiaMode_settings = {
  bionicReading: true,
  syllableHighlighting: false,
  grammarColors: false,
  colorIntensity: 0.7, // 0.5-1.0, affects saturation
};
const dyslexiaMode_originalContent = new Map(); // Store original HTML
const dyslexiaMode_processedElements = new Set(); // Track processed elements

// Bionic Reading: Bold first letters of words
function dyslexiaMode_applyBionicReading(element) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      // Skip if parent is a script, style, or already processed
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName?.toLowerCase();
      if (['script', 'style', 'code', 'pre'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.classList.contains('assist-bionic')) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parent = textNode.parentElement;
    if (!text.trim() || !parent) {
      return;
    }

    // Split into words and process
    const words = text.split(/(\s+|[,.!?;:])/);
    const fragment = document.createDocumentFragment();

    words.forEach(word => {
      if (!word.trim()) {
        // Keep whitespace/punctuation as-is
        fragment.appendChild(document.createTextNode(word));
      } else {
        // Determine how many letters to bold based on word length
        const len = word.length;
        let boldCount;
        if (len <= 3) {
          boldCount = 1;
        } else if (len <= 7) {
          boldCount = 2;
        } else {
          boldCount = 3;
        }

        // Create span with bolded first part
        const span = document.createElement('span');
        span.classList.add('assist-bionic');

        const strongPart = document.createElement('strong');
        strongPart.textContent = word.substring(0, boldCount);
        strongPart.style.fontWeight = '700';

        const normalPart = document.createTextNode(word.substring(boldCount));

        span.appendChild(strongPart);
        span.appendChild(normalPart);
        fragment.appendChild(span);
      }
    });

    parent.replaceChild(fragment, textNode);
  });

  element.dataset.assistDyslexiaProcessed = 'bionic';
}

// Syllable Highlighting: Alternate colors between syllables
function dyslexiaMode_applySyllableHighlighting(element) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  // Simple syllable split algorithm (basic English rules)
  function splitIntoSyllables(word) {
    // Very basic syllabification - split on vowel clusters
    // This is simplified; production would use Hypher.js library
    if (word.length <= 3) {
      return [word];
    }

    const vowels = 'aeiouAEIOU';
    const syllables = [];
    let current = '';

    for (let i = 0; i < word.length; i++) {
      current += word[i];

      // Split when we hit a consonant after a vowel
      if (i < word.length - 1) {
        const isVowel = vowels.includes(word[i]);
        const nextIsConsonant = !vowels.includes(word[i + 1]);

        if (isVowel && nextIsConsonant && current.length >= 2) {
          syllables.push(current);
          current = '';
        }
      }
    }

    if (current) {
      syllables.push(current);
    }
    return syllables.length > 0 ? syllables : [word];
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName?.toLowerCase();
      if (['script', 'style', 'code', 'pre'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  const color1 = `rgba(179, 229, 252, ${dyslexiaMode_settings.colorIntensity * 0.5})`; // Light blue
  const color2 = `rgba(255, 249, 196, ${dyslexiaMode_settings.colorIntensity * 0.5})`; // Light yellow

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parent = textNode.parentElement;
    if (!text.trim() || !parent) {
      return;
    }

    const words = text.split(/(\s+)/);
    const fragment = document.createDocumentFragment();

    words.forEach(word => {
      if (!word.trim()) {
        fragment.appendChild(document.createTextNode(word));
      } else {
        const syllables = splitIntoSyllables(word);
        syllables.forEach((syllable, idx) => {
          const span = document.createElement('span');
          span.classList.add('assist-syllable');
          span.textContent = syllable;
          span.style.backgroundColor = idx % 2 === 0 ? color1 : color2;
          span.style.padding = '0 1px';
          fragment.appendChild(span);
        });
      }
    });

    parent.replaceChild(fragment, textNode);
  });

  element.dataset.assistDyslexiaProcessed = 'syllable';
}

// Grammar Color-Coding: Color words by part of speech
async function dyslexiaMode_applyGrammarColors(element) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  // Dynamic import compromise.js
  let nlp;
  try {
    nlp = (await import(chrome.runtime.getURL('node_modules/compromise/builds/compromise.mjs')))
      .default;
  } catch (error) {
    console.error('[DyslexiaMode] Failed to load compromise.js:', error);
    return;
  }

  // Get text content
  const text = element.textContent;
  if (!text.trim()) {
    return;
  }

  // Parse with compromise
  const doc = nlp(text);

  // Color mapping (with intensity adjustment)
  const intensity = dyslexiaMode_settings.colorIntensity;
  const colors = {
    noun: `rgba(33, 150, 243, ${intensity * 0.3})`, // Blue
    verb: `rgba(76, 175, 80, ${intensity * 0.3})`, // Green
    adjective: `rgba(156, 39, 176, ${intensity * 0.3})`, // Purple
    adverb: `rgba(255, 152, 0, ${intensity * 0.3})`, // Orange
    other: `rgba(158, 158, 158, ${intensity * 0.15})`, // Gray
  };

  // Extract parts of speech
  const nouns = new Set(doc.nouns().out('array'));
  const verbs = new Set(doc.verbs().out('array'));
  const adjectives = new Set(doc.adjectives().out('array'));
  const adverbs = new Set(doc.adverbs().out('array'));

  // Process text nodes
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName?.toLowerCase();
      if (['script', 'style', 'code', 'pre'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parent = textNode.parentElement;
    if (!text.trim() || !parent) {
      return;
    }

    const words = text.split(/(\s+|[,.!?;:])/);
    const fragment = document.createDocumentFragment();

    words.forEach(word => {
      if (!word.trim()) {
        fragment.appendChild(document.createTextNode(word));
      } else {
        const lowerWord = word.toLowerCase();
        let color = colors.other;

        if (nouns.has(lowerWord)) {
          color = colors.noun;
        } else if (verbs.has(lowerWord)) {
          color = colors.verb;
        } else if (adjectives.has(lowerWord)) {
          color = colors.adjective;
        } else if (adverbs.has(lowerWord)) {
          color = colors.adverb;
        }

        const span = document.createElement('span');
        span.classList.add('assist-grammar');
        span.textContent = word;
        span.style.backgroundColor = color;
        span.style.padding = '0 2px';
        span.style.borderRadius = '2px';
        fragment.appendChild(span);
      }
    });

    parent.replaceChild(fragment, textNode);
  });

  element.dataset.assistDyslexiaProcessed = 'grammar';
}

// Apply dyslexia mode to main content
async function dyslexiaMode_apply() {
  if (!dyslexiaMode_enabled) {
    dyslexiaMode_remove();
    return;
  }

  const startTime = performance.now();

  // Find main content areas
  const contentSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.main-content',
    '.content',
    '#content',
    '.user_content',
    '.ic-Layout-contentMain', // Canvas-specific
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'blockquote',
  ];

  const elements = new Set();
  contentSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      // Skip already processed elements
      if (!dyslexiaMode_processedElements.has(el)) {
        elements.add(el);
      }
    });
  });

  if (elements.size === 0) {
    console.log('[DyslexiaMode] No content elements found');
    return;
  }

  console.log('[DyslexiaMode] Processing', elements.size, 'elements');

  // Store original content for reset
  elements.forEach(el => {
    if (!dyslexiaMode_originalContent.has(el)) {
      dyslexiaMode_originalContent.set(el, el.innerHTML);
    }
  });

  // Apply selected features
  for (const element of elements) {
    if (dyslexiaMode_settings.bionicReading) {
      dyslexiaMode_applyBionicReading(element);
    } else if (dyslexiaMode_settings.syllableHighlighting) {
      dyslexiaMode_applySyllableHighlighting(element);
    } else if (dyslexiaMode_settings.grammarColors) {
      await dyslexiaMode_applyGrammarColors(element);
    }

    dyslexiaMode_processedElements.add(element);
  }

  const duration = performance.now() - startTime;
  console.log(`[DyslexiaMode] Applied in ${duration.toFixed(1)}ms`);
  showToast(`✨ Dyslexia Mode enabled`);
}

// Remove dyslexia mode (restore original content)
function dyslexiaMode_remove() {
  // Restore original HTML
  dyslexiaMode_originalContent.forEach((originalHTML, element) => {
    if (element && element.isConnected) {
      element.innerHTML = originalHTML;
      delete element.dataset.assistDyslexiaProcessed;
    }
  });

  dyslexiaMode_originalContent.clear();
  dyslexiaMode_processedElements.clear();

  console.log('[DyslexiaMode] Removed');
  showToast('Dyslexia Mode disabled');
}

// Load Dyslexia Mode settings from storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.dyslexiaMode) {
    const dmSettings = result.assist_settings.dyslexiaMode;
    dyslexiaMode_enabled = dmSettings.enabled || false;
    dyslexiaMode_settings.bionicReading = dmSettings.bionicReading !== false;
    dyslexiaMode_settings.syllableHighlighting = dmSettings.syllableHighlighting || false;
    dyslexiaMode_settings.grammarColors = dmSettings.grammarColors || false;
    dyslexiaMode_settings.colorIntensity = dmSettings.colorIntensity || 0.7;

    if (dyslexiaMode_enabled) {
      // Apply after page loads
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => dyslexiaMode_apply(), 500);
        });
      } else {
        setTimeout(() => dyslexiaMode_apply(), 500);
      }
    }

    console.log('[DyslexiaMode] Settings loaded:', dyslexiaMode_enabled, dyslexiaMode_settings);
  }
});

// Listen for Dyslexia Mode settings updates
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.dyslexiaMode) {
    const dmSettings = changes.assist_settings.newValue.dyslexiaMode;

    const wasEnabled = dyslexiaMode_enabled;
    const newEnabled = dmSettings.enabled || false;

    // Update settings
    dyslexiaMode_settings.bionicReading = dmSettings.bionicReading !== false;
    dyslexiaMode_settings.syllableHighlighting = dmSettings.syllableHighlighting || false;
    dyslexiaMode_settings.grammarColors = dmSettings.grammarColors || false;
    dyslexiaMode_settings.colorIntensity = dmSettings.colorIntensity || 0.7;

    // Handle enable/disable
    if (newEnabled && !wasEnabled) {
      dyslexiaMode_enabled = true;
      dyslexiaMode_apply();
    } else if (!newEnabled && wasEnabled) {
      dyslexiaMode_enabled = false;
      dyslexiaMode_remove();
    } else if (newEnabled) {
      // Settings changed, reapply
      dyslexiaMode_remove();
      setTimeout(() => dyslexiaMode_apply(), 100);
    }

    console.log('[DyslexiaMode] Settings updated:', newEnabled, dyslexiaMode_settings);
  }
});

console.log('[AssisT] Ready! Click any paragraph to read it.');
