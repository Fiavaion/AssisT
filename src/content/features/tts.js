/**
 * TTS (Text-to-Speech) Feature
 * Handles click-to-read functionality with synchronized highlighting
 */

import { hexToRgba, showToast } from '../utils/dom-utils.js';
import { getSettings, onSettingsChange } from '../utils/storage-utils.js';

// TTS State (Feature Isolated)
let tts_currentUtterance = null;
let tts_currentHighlight = null;
let tts_currentElement = null;
let tts_currentText = '';
let tts_isPaused = false;
let tts_wordHighlightInterval = null;

const tts_settings = {
  enabled: false,
  highlightEnabled: true,
  highlightColor: '#FFEB3B',
  highlightOpacity: 0.7,
  wordByWordEnabled: false,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  voice: null,
};

const tts_synth = window.speechSynthesis;

/**
 * Load available voices
 */
function tts_loadVoices() {
  const voices = tts_synth.getVoices();

  // Try to find Google UK Female
  const preferredVoice =
    voices.find(
      v => v.name.includes('Google') && v.name.includes('UK') && v.name.includes('Female')
    ) ||
    voices.find(v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female')) ||
    voices.find(v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('female'));

  if (preferredVoice && !tts_settings.voice) {
    tts_settings.voice = preferredVoice;
    console.log('[TTS] Default voice:', preferredVoice.name);
  }
}

/**
 * Remove all highlights
 */
function tts_removeHighlight() {
  if (tts_currentHighlight) {
    const parent = tts_currentHighlight.parentNode;
    if (parent) {
      const text = document.createTextNode(tts_currentHighlight.textContent);
      parent.replaceChild(text, tts_currentHighlight);
      parent.normalize();
    }
    tts_currentHighlight = null;
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

/**
 * Highlight an entire element
 */
function tts_highlightElement(element) {
  tts_removeHighlight();

  // Only apply highlight if enabled
  if (tts_settings.highlightEnabled) {
    const bgColor = hexToRgba(tts_settings.highlightColor, tts_settings.highlightOpacity);
    element.style.backgroundColor = bgColor;
    element.style.transition = 'background-color 0.2s';
  }
}

/**
 * Word-by-word highlighting
 */
function tts_highlightWordByWord(element, text, rate) {
  // Clear any existing word highlighting
  if (tts_wordHighlightInterval) {
    clearInterval(tts_wordHighlightInterval);
    tts_wordHighlightInterval = null;
  }

  // Remove previous word highlights
  tts_removeHighlight();

  // Split text into words
  const words = text.split(/\s+/);
  if (words.length === 0) {
    return;
  }

  // Estimate time per word (avg reading speed ~ 150 words/min at 1.0x rate)
  const baseWordsPerMinute = 150;
  const adjustedWordsPerMinute = baseWordsPerMinute * rate;
  const msPerWord = (60 * 1000) / adjustedWordsPerMinute;

  let currentWordIndex = 0;

  // Wrap each word in the element with a span
  const bgColor = hexToRgba(tts_settings.highlightColor, tts_settings.highlightOpacity);
  const originalHTML = element.innerHTML;

  // Store original content for cleanup
  element.dataset.originalHTML = originalHTML;

  // Create wrapped HTML
  const wrappedHTML = text
    .split(/(\s+)/)
    .map((part, index) => {
      if (part.trim().length === 0) {
        return part;
      } else {
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

  tts_wordHighlightInterval = setInterval(() => {
    currentWordIndex++;
    if (currentWordIndex >= words.length) {
      clearInterval(tts_wordHighlightInterval);
      tts_wordHighlightInterval = null;
    } else {
      highlightWord(currentWordIndex);
    }
  }, msPerWord);
}

/**
 * Clean up word-by-word highlighting
 */
function tts_cleanupWordByWord(element) {
  if (tts_wordHighlightInterval) {
    clearInterval(tts_wordHighlightInterval);
    tts_wordHighlightInterval = null;
  }

  // Restore original HTML if it was modified
  if (element && element.dataset.originalHTML) {
    element.innerHTML = element.dataset.originalHTML;
    delete element.dataset.originalHTML;
  }
}

/**
 * Remove element highlighting
 */
function tts_removeElementHighlight(element) {
  if (element) {
    element.style.backgroundColor = '';
  }
}

/**
 * Read text with highlighting
 */
function tts_readText(text, element) {
  if (!text || text.trim() === '') {
    return;
  }

  // Cancel previous speech if any
  if (tts_synth.speaking) {
    tts_synth.cancel();
  }

  // Wait a tiny bit for cancel to complete
  setTimeout(() => {
    tts_currentElement = element;
    tts_currentText = text;
    tts_isPaused = false;

    console.log('[TTS] Reading:', text.substring(0, 50) + '...');

    // Add outline
    element.style.outline = '2px solid #2196F3';
    element.style.outlineOffset = '2px';

    // Highlight based on settings
    if (tts_settings.wordByWordEnabled && tts_settings.highlightEnabled) {
      tts_highlightWordByWord(element, text, tts_settings.rate);
    } else {
      tts_highlightElement(element);
    }

    // Create utterance
    tts_currentUtterance = new SpeechSynthesisUtterance(text);
    tts_currentUtterance.rate = tts_settings.rate;
    tts_currentUtterance.pitch = tts_settings.pitch;
    tts_currentUtterance.volume = tts_settings.volume;

    if (tts_settings.voice) {
      tts_currentUtterance.voice = tts_settings.voice;
    }

    // Clean up on end
    tts_currentUtterance.onend = () => {
      tts_cleanupWordByWord(tts_currentElement);
      tts_removeHighlight();
      tts_removeElementHighlight(tts_currentElement);
      if (tts_currentElement) {
        tts_currentElement.style.outline = '';
        tts_currentElement.style.outlineOffset = '';
      }
      tts_currentUtterance = null;
      tts_currentElement = null;
      tts_currentText = '';
      tts_isPaused = false;
      console.log('[TTS] Reading complete');
    };

    // Handle errors
    tts_currentUtterance.onerror = event => {
      console.error('[TTS] Speech error:', event.error);
      tts_cleanupWordByWord(tts_currentElement);
      tts_removeHighlight();
      tts_removeElementHighlight(tts_currentElement);
      if (tts_currentElement) {
        tts_currentElement.style.outline = '';
        tts_currentElement.style.outlineOffset = '';
      }
      tts_currentElement = null;
      tts_currentText = '';
      tts_isPaused = false;
    };

    // Speak!
    tts_synth.speak(tts_currentUtterance);
  }, 50);
}

/**
 * Handle settings changes
 */
function tts_handleSettingsChange(newSettings) {
  if (!newSettings.tts) return;

  const ttsSettings = newSettings.tts;
  const oldRate = tts_settings.rate;
  const oldPitch = tts_settings.pitch;
  const oldVolume = tts_settings.volume;
  const oldColor = tts_settings.highlightColor;
  const oldOpacity = tts_settings.highlightOpacity;
  const oldHighlightEnabled = tts_settings.highlightEnabled;
  const oldTTSEnabled = tts_settings.enabled;

  tts_settings.enabled = ttsSettings.enabled !== undefined ? ttsSettings.enabled : false;
  tts_settings.highlightEnabled =
    ttsSettings.highlightEnabled !== undefined
      ? ttsSettings.highlightEnabled
      : tts_settings.highlightEnabled;
  tts_settings.highlightColor = ttsSettings.highlightColor || tts_settings.highlightColor;
  tts_settings.highlightOpacity = ttsSettings.highlightOpacity || tts_settings.highlightOpacity;
  tts_settings.wordByWordEnabled = ttsSettings.wordByWordEnabled || false;
  tts_settings.rate = ttsSettings.rate || tts_settings.rate;
  tts_settings.pitch = ttsSettings.pitch || tts_settings.pitch;
  tts_settings.volume = ttsSettings.volume || tts_settings.volume;

  // If TTS was disabled, stop any current speech
  if (!tts_settings.enabled && oldTTSEnabled && tts_synth.speaking) {
    tts_synth.cancel();
    tts_cleanupWordByWord(tts_currentElement);
    tts_removeHighlight();
    tts_removeElementHighlight(tts_currentElement);
    if (tts_currentElement) {
      tts_currentElement.style.outline = '';
      tts_currentElement.style.outlineOffset = '';
    }
    tts_currentUtterance = null;
    tts_currentElement = null;
    tts_currentText = '';
    tts_isPaused = false;
    console.log('[TTS] TTS disabled, speech stopped');
  }

  // Update voice only if changed
  if (
    ttsSettings.voice &&
    ttsSettings.voice !== 'default' &&
    ttsSettings.voice !== tts_settings.voice?.name
  ) {
    const voices = tts_synth.getVoices();
    const voice = voices.find(v => v.name === ttsSettings.voice);
    if (voice) {
      tts_settings.voice = voice;
      console.log('[TTS] Voice updated:', voice.name);
    }
  }

  // If highlighting was disabled, remove current highlight
  if (!tts_settings.highlightEnabled && oldHighlightEnabled && tts_currentElement) {
    tts_removeElementHighlight(tts_currentElement);
    console.log('[TTS] Highlighting disabled');
  }

  // If highlighting was enabled, add highlight to current element
  if (tts_settings.highlightEnabled && !oldHighlightEnabled && tts_currentElement) {
    tts_highlightElement(tts_currentElement);
    console.log('[TTS] Highlighting enabled');
  }

  // If highlight color or opacity changed and we're currently highlighting, update it
  if (
    tts_settings.highlightEnabled &&
    (tts_settings.highlightColor !== oldColor || tts_settings.highlightOpacity !== oldOpacity) &&
    tts_currentElement
  ) {
    tts_highlightElement(tts_currentElement);
  }

  // If currently speaking, restart with new settings
  if (
    tts_currentUtterance &&
    tts_synth.speaking &&
    (tts_settings.rate !== oldRate ||
      tts_settings.pitch !== oldPitch ||
      tts_settings.volume !== oldVolume)
  ) {
    const wasPaused = tts_synth.paused;
    const element = tts_currentElement;
    const text = tts_currentText;

    tts_synth.cancel();
    setTimeout(() => {
      tts_readText(text, element);
      if (wasPaused) {
        setTimeout(() => tts_synth.pause(), 100);
      }
    }, 50);
  }
}

/**
 * Setup click handler
 */
function tts_setupClickHandler() {
  document.addEventListener(
    'click',
    e => {
      // Don't intercept links/buttons first
      if (e.target.closest('a, button, input, textarea, select, [role="button"]')) {
        return;
      }

      // Don't read if TTS is disabled
      if (!tts_settings.enabled) {
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
              console.log('[TTS] Click ignored - TTS is disabled');
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
        tts_readText(text, textElement);
      }
    },
    true
  );
}

/**
 * Setup keyboard shortcuts
 */
function tts_setupKeyboardShortcuts() {
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
        if (tts_currentUtterance) {
          e.preventDefault();
          e.stopPropagation();

          if (tts_isPaused) {
            tts_synth.resume();
            tts_isPaused = false;
            showToast('▶️ Resumed');
            console.log('[TTS] Resumed playback');
          } else {
            tts_synth.pause();
            tts_isPaused = true;
            showToast('⏸️ Paused');
            console.log('[TTS] Paused playback');
          }
        }
      }

      // + or = - speed up
      if ((e.key === '+' || e.key === '=') && (e.shiftKey || e.key === '+')) {
        e.preventDefault();
        e.stopPropagation();
        tts_settings.rate = Math.min(2.0, tts_settings.rate + 0.1);
        showToast('Speed: ' + tts_settings.rate.toFixed(1) + 'x');
        console.log('[TTS] Speed:', tts_settings.rate.toFixed(1) + 'x');

        // Apply immediately if speaking
        if (tts_currentUtterance && tts_synth.speaking) {
          const text = tts_currentText;
          const element = tts_currentElement;
          const wasPaused = tts_synth.paused;
          tts_synth.cancel();
          setTimeout(() => {
            tts_readText(text, element);
            if (wasPaused) {
              setTimeout(() => tts_synth.pause(), 100);
            }
          }, 50);
        }
      }

      // - or _ - slow down
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        e.stopPropagation();
        tts_settings.rate = Math.max(0.5, tts_settings.rate - 0.1);
        showToast('Speed: ' + tts_settings.rate.toFixed(1) + 'x');
        console.log('[TTS] Speed:', tts_settings.rate.toFixed(1) + 'x');

        // Apply immediately if speaking
        if (tts_currentUtterance && tts_synth.speaking) {
          const text = tts_currentText;
          const element = tts_currentElement;
          const wasPaused = tts_synth.paused;
          tts_synth.cancel();
          setTimeout(() => {
            tts_readText(text, element);
            if (wasPaused) {
              setTimeout(() => tts_synth.pause(), 100);
            }
          }, 50);
        }
      }
    },
    true
  );
}

/**
 * Initialize TTS feature
 */
export async function tts_initialize() {
  console.log('[TTS] Initializing...');

  // Load voices
  if (tts_synth.getVoices().length > 0) {
    tts_loadVoices();
  }
  tts_synth.addEventListener('voiceschanged', tts_loadVoices);

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.tts) {
    const ttsSettings = allSettings.tts;
    tts_settings.enabled = ttsSettings.enabled !== undefined ? ttsSettings.enabled : false;
    tts_settings.highlightEnabled =
      ttsSettings.highlightEnabled !== undefined ? ttsSettings.highlightEnabled : true;
    tts_settings.highlightColor = ttsSettings.highlightColor || tts_settings.highlightColor;
    tts_settings.highlightOpacity = ttsSettings.highlightOpacity || tts_settings.highlightOpacity;
    tts_settings.wordByWordEnabled = ttsSettings.wordByWordEnabled || false;
    tts_settings.rate = ttsSettings.rate || tts_settings.rate;
    tts_settings.pitch = ttsSettings.pitch || tts_settings.pitch;
    tts_settings.volume = ttsSettings.volume || tts_settings.volume;

    // Load voice by name
    if (ttsSettings.voice && ttsSettings.voice !== 'default') {
      const voices = tts_synth.getVoices();
      const voice = voices.find(v => v.name === ttsSettings.voice);
      if (voice) {
        tts_settings.voice = voice;
        console.log('[TTS] Voice loaded from settings:', voice.name);
      }
    }

    console.log('[TTS] Settings loaded, TTS enabled:', tts_settings.enabled);
  }

  // Setup event listeners
  tts_setupClickHandler();
  tts_setupKeyboardShortcuts();

  // Listen for settings changes (debounced)
  let updateTimeout = null;
  onSettingsChange(newSettings => {
    if (updateTimeout === null) {
      updateTimeout = setTimeout(() => {
        tts_handleSettingsChange(newSettings);
        updateTimeout = null;
      }, 100);
    }
  });

  console.log('[TTS] Initialized');
}

/**
 * Get TTS state for debugging
 */
export function tts_getState() {
  return {
    enabled: tts_settings.enabled,
    speaking: tts_synth.speaking,
    paused: tts_isPaused,
    currentElement: tts_currentElement,
  };
}
