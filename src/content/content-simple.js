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

// Message handler for commands from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[AssisT] Message received:', message.type);

  // Future message handlers can be added here

  return true; // Keep message channel open
});

console.log('[AssisT] Ready! Click any paragraph to read it.');
