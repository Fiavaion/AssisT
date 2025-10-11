/**
 * AssisT Simple Content Script
 * Click any paragraph to read it with TTS and highlighting
 */

console.log('[AssisT] Content script loaded');

// Global state
let currentUtterance = null;
let currentHighlight = null;
let settings = {
  highlightColor: '#FFEB3B',
  highlightOpacity: 0.7,
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

  if (preferredVoice) {
    settings.voice = preferredVoice;
    console.log('[AssisT] Voice set to:', preferredVoice.name);
  }
}

// Load voices immediately and on change
if (synth.getVoices().length > 0) {
  loadVoices();
}
synth.addEventListener('voiceschanged', loadVoices);

// Load settings from storage
chrome.storage.local.get('assist_settings', (result) => {
  if (result.assist_settings && result.assist_settings.tts) {
    const ttsSettings = result.assist_settings.tts;
    settings.highlightColor = ttsSettings.highlightColor || settings.highlightColor;
    settings.highlightOpacity = ttsSettings.highlightOpacity || settings.highlightOpacity;
    settings.rate = ttsSettings.rate || settings.rate;
    settings.pitch = ttsSettings.pitch || settings.pitch;
    settings.volume = ttsSettings.volume || settings.volume;

    // Load voice by name
    if (ttsSettings.voice && ttsSettings.voice !== 'default') {
      const voices = synth.getVoices();
      const voice = voices.find(v => v.name === ttsSettings.voice);
      if (voice) {
        settings.voice = voice;
        console.log('[AssisT] Voice loaded from settings:', voice.name);
      }
    }

    console.log('[AssisT] Settings loaded:', settings);
  }
});

// Listen for settings updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.assist_settings) {
    const ttsSettings = changes.assist_settings.newValue?.tts;
    if (ttsSettings) {
      settings.highlightColor = ttsSettings.highlightColor || settings.highlightColor;
      settings.highlightOpacity = ttsSettings.highlightOpacity || settings.highlightOpacity;
      settings.rate = ttsSettings.rate || settings.rate;
      settings.pitch = ttsSettings.pitch || settings.pitch;
      settings.volume = ttsSettings.volume || settings.volume;

      // Update voice
      if (ttsSettings.voice && ttsSettings.voice !== 'default') {
        const voices = synth.getVoices();
        const voice = voices.find(v => v.name === ttsSettings.voice);
        if (voice) {
          settings.voice = voice;
          console.log('[AssisT] Voice updated:', voice.name);
        }
      }
    }
  }
});

// Remove highlighting
function removeHighlight() {
  if (currentHighlight) {
    const parent = currentHighlight.parentNode;
    if (parent) {
      // Replace highlighted span with text
      const text = document.createTextNode(currentHighlight.textContent);
      parent.replaceChild(text, currentHighlight);
      parent.normalize();
    }
    currentHighlight = null;
  }

  // Remove any leftover highlights
  document.querySelectorAll('.assist-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      const text = document.createTextNode(el.textContent);
      parent.replaceChild(text, el);
      parent.normalize();
    }
  });
}

// Highlight word at position
function highlightWord(text, charIndex, charLength, element) {
  removeHighlight();

  // Find the text node containing this character
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );

  let currentIndex = 0;
  let targetNode = null;
  let offsetInNode = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeLength = node.textContent.length;

    if (charIndex >= currentIndex && charIndex < currentIndex + nodeLength) {
      targetNode = node;
      offsetInNode = charIndex - currentIndex;
      break;
    }

    currentIndex += nodeLength;
  }

  if (targetNode && targetNode.parentNode) {
    try {
      const range = document.createRange();
      const startOffset = offsetInNode;
      const endOffset = Math.min(offsetInNode + charLength, targetNode.textContent.length);

      range.setStart(targetNode, startOffset);
      range.setEnd(targetNode, endOffset);

      // Create highlight span
      const span = document.createElement('span');
      span.className = 'assist-highlight';
      span.style.cssText = `
        background-color: ${settings.highlightColor} !important;
        opacity: ${settings.highlightOpacity} !important;
        padding: 2px 0 !important;
        border-radius: 2px !important;
        display: inline !important;
      `;

      range.surroundContents(span);
      currentHighlight = span;
    } catch (e) {
      console.warn('[AssisT] Could not highlight word:', e);
    }
  }
}

// Stop current speech
function stopSpeech() {
  if (synth.speaking) {
    synth.cancel();
  }
  removeHighlight();
  currentUtterance = null;
}

// Read text with highlighting
function readText(text, element) {
  // Stop any current speech
  stopSpeech();

  if (!text || text.trim() === '') {
    return;
  }

  console.log('[AssisT] Reading:', text.substring(0, 50) + '...');

  // Add outline to element being read
  element.style.outline = '2px solid #2196F3';
  element.style.outlineOffset = '2px';

  // Create utterance
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.rate = settings.rate;
  currentUtterance.pitch = settings.pitch;
  currentUtterance.volume = settings.volume;

  if (settings.voice) {
    currentUtterance.voice = settings.voice;
  }

  // Highlight words as they're spoken
  currentUtterance.onboundary = (event) => {
    if (event.name === 'word' && event.charIndex !== undefined) {
      // Calculate word length by finding next space
      let wordLength = 1;
      for (let i = event.charIndex + 1; i < text.length; i++) {
        if (text[i] === ' ' || text[i] === '\n' || text[i] === '.' || text[i] === ',') {
          break;
        }
        wordLength++;
      }
      console.log('[AssisT] Highlighting word at', event.charIndex, 'length', wordLength);
      highlightWord(text, event.charIndex, wordLength, element);
    }
  };

  // Clean up when done
  currentUtterance.onend = () => {
    removeHighlight();
    element.style.outline = '';
    element.style.outlineOffset = '';
    currentUtterance = null;
    console.log('[AssisT] Reading complete');
  };

  currentUtterance.onerror = (event) => {
    console.error('[AssisT] Speech error:', event);
    removeHighlight();
    element.style.outline = '';
    element.style.outlineOffset = '';
  };

  // Speak
  synth.speak(currentUtterance);
}

// Click handler - NO Ctrl key required, just click
document.addEventListener('click', (e) => {
  // Find the closest text container
  let target = e.target;
  let textElement = null;

  // Walk up the DOM to find a good text container
  while (target && target !== document.body) {
    const tag = target.tagName?.toLowerCase();

    // Check if this is a good text container
    if (tag && ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div', 'article', 'section', 'span'].includes(tag)) {
      const text = target.textContent?.trim();

      // Make sure it has substantial text (more than 10 characters)
      if (text && text.length > 10) {
        textElement = target;
        break;
      }
    }

    target = target.parentElement;
  }

  if (textElement) {
    // Check if clicking interactive elements (links, buttons, etc.)
    if (e.target.matches('a, button, input, textarea, select, [role="button"]')) {
      // Don't intercept clicks on interactive elements
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const text = textElement.textContent.trim();
    readText(text, textElement);
  }
}, true); // Use capture phase

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ignore if typing in input
  if (e.target.matches('input, textarea, [contenteditable="true"]')) {
    return;
  }

  // Spacebar - pause/resume (only when speaking)
  if ((e.key === ' ' || e.code === 'Space') && (synth.speaking || synth.paused)) {
    e.preventDefault();

    if (synth.paused) {
      synth.resume();
      console.log('[AssisT] Resumed');
    } else {
      synth.pause();
      console.log('[AssisT] Paused');
    }
  }

  // Speed up: + or =
  if (e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd') {
    if (e.shiftKey || e.code === 'NumpadAdd' || e.key === '+') {
      e.preventDefault();
      settings.rate = Math.min(2.0, settings.rate + 0.1);
      console.log('[AssisT] Speed:', settings.rate.toFixed(1) + 'x');
      showToast('Speed: ' + settings.rate.toFixed(1) + 'x');
    }
  }

  // Slow down: -
  if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
    e.preventDefault();
    settings.rate = Math.max(0.5, settings.rate - 0.1);
    console.log('[AssisT] Speed:', settings.rate.toFixed(1) + 'x');
    showToast('Speed: ' + settings.rate.toFixed(1) + 'x');
  }
});

// Show toast notification
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

console.log('[AssisT] Ready! Click any paragraph to read it.');
