/**
 * AssisT Simple Content Script
 * Click any paragraph to read it with TTS and highlighting
 */

console.log('[AssisT] Content script loaded');

// Global state
let currentUtterance = null;
let currentHighlight = null;
let currentElement = null;
let currentText = '';
let isPaused = false; // Manual pause state tracker
let wordHighlightInterval = null; // For word-by-word highlighting
let settings = {
  enabled: false, // TTS master toggle
  highlightEnabled: true,
  highlightColor: '#FFEB3B',
  highlightOpacity: 0.7,
  wordByWordEnabled: false,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  voice: null
};

// Initialize speech synthesis
const synth = window.speechSynthesis;

// Load voices when available
function loadVoices() {
  const voices = synth.getVoices();

  // Try to find Google UK Female
  const preferredVoice = voices.find(v =>
    v.name.includes('Google') &&
    v.name.includes('UK') &&
    v.name.includes('Female')
  ) || voices.find(v =>
    v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female')
  ) || voices.find(v =>
    v.lang.startsWith('en-') && v.name.toLowerCase().includes('female')
  );

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
chrome.storage.local.get('assist_settings', (result) => {
  console.log('[AssisT] Raw storage result:', result);

  if (result.assist_settings && result.assist_settings.tts) {
    const ttsSettings = result.assist_settings.tts;
    settings.enabled = ttsSettings.enabled !== undefined ? ttsSettings.enabled : false;
    settings.highlightEnabled = ttsSettings.highlightEnabled !== undefined ? ttsSettings.highlightEnabled : settings.highlightEnabled;
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
    console.warn('[AssisT] No settings found in storage - using defaults. TTS enabled:', settings.enabled);
  }
});

// Listen for settings updates (debounced to prevent loops)
let updateTimeout = null;
chrome.storage.onChanged.addListener((changes) => {
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
        settings.highlightEnabled = ttsSettings.highlightEnabled !== undefined ? ttsSettings.highlightEnabled : settings.highlightEnabled;
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
        if (ttsSettings.voice && ttsSettings.voice !== 'default' && ttsSettings.voice !== settings.voice?.name) {
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
        if (settings.highlightEnabled && (settings.highlightColor !== oldColor || settings.highlightOpacity !== oldOpacity) && currentElement) {
          highlightElement(currentElement);
        }

        // If currently speaking, restart with new settings
        if (currentUtterance && synth.speaking && (settings.rate !== oldRate || settings.pitch !== oldPitch || settings.volume !== oldVolume)) {
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
  if (words.length === 0) return;

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
  const wrappedHTML = text.split(/(\s+)/).map((part, index) => {
    if (part.trim().length === 0) {
      // Keep whitespace as-is
      return part;
    } else {
      // Wrap words in spans
      return `<span class="assist-word" data-word-index="${Math.floor(index / 2)}">${part}</span>`;
    }
  }).join('');

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
    currentUtterance.onerror = (event) => {
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
document.addEventListener('click', (e) => {
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
      if (tag && ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div', 'article', 'section'].includes(tag)) {
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

    if (tag && ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div', 'article', 'section'].includes(tag)) {
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
}, true);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
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

      console.log('[AssisT] Spacebar pressed. isPaused:', isPaused, 'synth.speaking:', synth.speaking, 'synth.paused:', synth.paused);

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
}, true); // Use capture phase for better priority

// Show toast
function showToast(message) {
  const existing = document.getElementById('assist-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'assist-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(33, 150, 243, 0.95);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: -apple-system, system-ui, sans-serif;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ============================================================
// SPRINT 3 FEATURE: TEXT CUSTOMIZATION
// ============================================================

// Text Customization State (Feature Isolated)
let textCustomization_enabled = false;
let textCustomization_styleElement = null;
let textCustomization_fontLinkElement = null;
let textCustomization_settings = {
  fontFamily: 'system',
  lineSpacing: 1.5,
  letterSpacing: 0.12,
  wordSpacing: 0.16,
  paragraphSpacing: 2.0
};

// Font map for CSS generation
const textCustomization_fontMap = {
  'system': 'inherit',
  'lexend': '"Lexend", -apple-system, system-ui, sans-serif',
  'opendyslexic': '"OpenDyslexic", Arial, sans-serif',
  'comic-sans': '"Comic Sans MS", "Comic Sans", cursive',
  'arial': 'Arial, Helvetica, sans-serif'
};

// Load Lexend font from Google Fonts
function textCustomization_loadLexend() {
  if (!textCustomization_fontLinkElement) {
    textCustomization_fontLinkElement = document.createElement('link');
    textCustomization_fontLinkElement.rel = 'stylesheet';
    textCustomization_fontLinkElement.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600&display=swap';
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
chrome.storage.local.get('assist_settings', (result) => {
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

    console.log('[TextCustomization] Settings loaded:', textCustomization_enabled, textCustomization_settings);
  }
});

// Listen for Text Customization settings updates
chrome.storage.onChanged.addListener((changes) => {
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

    console.log('[TextCustomization] Settings updated:', textCustomization_enabled, textCustomization_settings);
  }
});

// ============================================================
// SPRINT 3 FEATURE: READING GUIDE
// ============================================================

// Reading Guide State (Feature Isolated)
let readingGuide_enabled = false;
let readingGuide_lineElement = null;
let readingGuide_settings = {
  lineColor: '#000000',
  lineThickness: 3,
  lineOpacity: 0.7
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
chrome.storage.local.get('assist_settings', (result) => {
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
chrome.storage.onChanged.addListener((changes) => {
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
let focusMode_settings = {
  boxWidth: 400,
  boxHeight: 100,
  overlayOpacity: 0.7
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
  const radius = Math.min(focusMode_settings.boxWidth, focusMode_settings.boxHeight) * radiusPercent;

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
  if (!focusMode_windowElement || !focusMode_enabled) return;

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
  if (!focusMode_windowElement) return;

  // Calculate border-radius as 20% of the smaller dimension
  const radiusPercent = 0.2;
  const radius = Math.min(focusMode_settings.boxWidth, focusMode_settings.boxHeight) * radiusPercent;

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
chrome.storage.local.get('assist_settings', (result) => {
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
chrome.storage.onChanged.addListener((changes) => {
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
  if (!canvas_enabled) return;

  const adapter = await canvas_loadAdapter();
  if (!adapter) return;

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
  if (!adapter) return;

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
    position: 'bottom-right'
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
chrome.storage.local.get('assist_settings', (result) => {
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
chrome.storage.onChanged.addListener((changes) => {
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
// SPRINT 5 FEATURE: SPEECH-TO-TEXT (STT)
// ============================================================

// STT State (Feature Isolated)
let stt_enabled = false;
let stt_controller = null;
let stt_micButton = null;
let stt_activeField = null;
let stt_settings = {
  continuous: true,
  interimResults: true,
  language: 'en-US',
  autoCapitalize: true,
  punctuationCommands: true,
  floatingButton: true
};

// Dynamic import STT controller and mic button
async function stt_loadModules() {
  try {
    const [STTModule, MicButtonModule] = await Promise.all([
      import(chrome.runtime.getURL('engines/stt/stt-controller.js')),
      import(chrome.runtime.getURL('ui/components/microphone-button.js'))
    ]);
    return {
      STTController: STTModule.STTController,
      MicrophoneButton: MicButtonModule.MicrophoneButton
    };
  } catch (error) {
    console.error('[STT] Failed to load modules:', error);
    return null;
  }
}

// Initialize STT controller
async function stt_initialize() {
  if (!stt_enabled) return;

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
    onResult: (text, fullTranscript) => {
      console.log('[STT] Result:', text);
      // Text already inserted by controller
    },
    onInterimResult: (text) => {
      // Show interim results in mic button
      if (stt_micButton && stt_settings.interimResults) {
        stt_micButton.showInterimResult(text);
      }
    },
    onError: (error, errorType) => {
      console.error('[STT] Error:', error.message);
      showToast('⚠️ ' + error.message);
      if (stt_micButton) {
        stt_micButton.showError(error.message);
      }
    }
  });

  // Create microphone button if enabled
  if (stt_settings.floatingButton) {
    stt_micButton = new modules.MicrophoneButton({
      onStart: (targetField) => {
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
      onError: (message) => {
        showToast('⚠️ ' + message);
      }
    });
  }

  // Listen for focus on text input fields
  stt_setupFieldListeners();

  console.log('[STT] Initialized successfully');
}

// Check if element is a text input field
function stt_isTextInput(element) {
  if (!element) return false;

  const tagName = element.tagName?.toLowerCase();
  const contentEditable = element.contentEditable === 'true' || element.isContentEditable;

  // Check for standard text inputs
  if (tagName === 'textarea') return true;
  if (tagName === 'input') {
    const type = element.type?.toLowerCase();
    return ['text', 'email', 'search', 'url', 'tel'].includes(type);
  }

  // Check for contenteditable elements
  if (contentEditable) return true;

  // Check for Canvas Rich Text Editor
  if (element.closest('.mce-content-body, [role="textbox"]')) return true;

  return false;
}

// Set up listeners for text field focus
function stt_setupFieldListeners() {
  if (!stt_enabled || !stt_settings.floatingButton) return;

  // Listen for focus on text fields
  document.addEventListener('focusin', (e) => {
    if (stt_enabled && stt_isTextInput(e.target)) {
      stt_activeField = e.target;
      if (stt_micButton) {
        stt_micButton.show(e.target);
      }
      console.log('[STT] Field focused:', e.target.tagName);
    }
  }, true);

  // Listen for focusout
  document.addEventListener('focusout', (e) => {
    if (stt_activeField === e.target && stt_micButton) {
      // Delay hiding button (user might click it)
      setTimeout(() => {
        if (stt_controller && !stt_controller.isRecording) {
          stt_micButton.hide();
          stt_activeField = null;
        }
      }, 300);
    }
  }, true);
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
chrome.storage.local.get('assist_settings', (result) => {
  if (result.assist_settings && result.assist_settings.stt) {
    const sttSettings = result.assist_settings.stt;
    stt_enabled = sttSettings.enabled || false;
    stt_settings.continuous = sttSettings.continuousMode !== undefined ? sttSettings.continuousMode : true;
    stt_settings.interimResults = sttSettings.interimResults !== undefined ? sttSettings.interimResults : true;
    stt_settings.language = sttSettings.language || 'en-US';
    stt_settings.autoCapitalize = sttSettings.autoCapitalize !== undefined ? sttSettings.autoCapitalize : true;
    stt_settings.punctuationCommands = sttSettings.punctuationCommands !== undefined ? sttSettings.punctuationCommands : true;
    stt_settings.floatingButton = sttSettings.floatingButton !== undefined ? sttSettings.floatingButton : true;

    if (stt_enabled) {
      stt_initialize();
    }

    console.log('[STT] Settings loaded:', stt_enabled, stt_settings);
  } else {
    console.log('[STT] Feature disabled by default');
  }
});

// Listen for STT settings updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.assist_settings && changes.assist_settings.newValue?.stt) {
    const sttSettings = changes.assist_settings.newValue.stt;
    const newEnabled = sttSettings.enabled || false;

    // Update settings
    stt_settings.continuous = sttSettings.continuousMode !== undefined ? sttSettings.continuousMode : true;
    stt_settings.interimResults = sttSettings.interimResults !== undefined ? sttSettings.interimResults : true;
    stt_settings.language = sttSettings.language || 'en-US';
    stt_settings.autoCapitalize = sttSettings.autoCapitalize !== undefined ? sttSettings.autoCapitalize : true;
    stt_settings.punctuationCommands = sttSettings.punctuationCommands !== undefined ? sttSettings.punctuationCommands : true;
    stt_settings.floatingButton = sttSettings.floatingButton !== undefined ? sttSettings.floatingButton : true;

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
        punctuationCommands: stt_settings.punctuationCommands
      });
      console.log('[STT] Settings updated');
    }

    console.log('[STT] Settings changed:', newEnabled, stt_settings);
  }
});

// Message handler for commands from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[AssisT] Message received:', message.type);

  // Future message handlers can be added here

  return true; // Keep message channel open
});

console.log('[AssisT] Ready! Click any paragraph to read it.');
