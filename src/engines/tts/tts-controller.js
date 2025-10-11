/**
 * TTS Controller
 * Manages Text-to-Speech with synchronized highlighting
 * Supports Web Speech API with word-by-word highlighting
 */

export class TTSController {
  constructor(domAdapter, settings) {
    this.domAdapter = domAdapter;
    this.settings = { ...settings };
    this.synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.currentUtterance = null;
    this.availableVoices = [];
    this.selectedVoice = null;
    this.eventHandlers = {};
    this.currentElement = null; // Track current element being read
    this.currentText = '';
    this.isPlaying = false;
    this.isPaused = false;
  }

  async initialize() {
    if (!this.synthesis) {
      console.warn('[TTS] Speech Synthesis API not available');
      return;
    }

    // Load available voices
    await this.loadVoices();

    // Set default voice
    if (this.availableVoices.length > 0) {
      const defaultVoice = this.availableVoices.find(v => v.default) || this.availableVoices[0];
      this.selectedVoice = defaultVoice;
    }

    console.log('[TTS] Controller initialized');
  }

  async loadVoices() {
    return new Promise(resolve => {
      if (!this.synthesis) {
        resolve([]);
        return;
      }

      let voices = this.synthesis.getVoices();

      if (voices.length > 0) {
        this.availableVoices = voices;
        resolve(voices);
      } else {
        this.synthesis.onvoiceschanged = () => {
          this.availableVoices = this.synthesis.getVoices();
          resolve(this.availableVoices);
        };
      }
    });
  }

  getAvailableVoices() {
    return this.availableVoices;
  }

  getVoicesByLanguage(langCode) {
    return this.availableVoices.filter(voice => voice.lang.startsWith(langCode));
  }

  setVoice(voiceName) {
    const voice = this.availableVoices.find(v => v.name === voiceName);
    if (voice) {
      this.selectedVoice = voice;
    } else {
      // Fallback to default voice
      const defaultVoice = this.availableVoices.find(v => v.default) || this.availableVoices[0];
      this.selectedVoice = defaultVoice;
    }
  }

  setRate(rate) {
    this.settings.rate = Math.max(0.1, Math.min(10, rate));
  }

  setPitch(pitch) {
    this.settings.pitch = Math.max(0, Math.min(2, pitch));
  }

  setVolume(volume) {
    this.settings.volume = Math.max(0, Math.min(1, volume));
  }

  async speak(text) {
    if (!this.settings.enabled) {
      return;
    }

    if (!text || text.trim() === '') {
      return;
    }

    if (!this.synthesis) {
      console.warn('[TTS] Speech Synthesis API not available');
      return;
    }

    // Cancel ongoing speech
    if (this.synthesis.speaking) {
      this.synthesis.cancel();
    }

    this.currentUtterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance.rate = this.settings.rate;
    this.currentUtterance.pitch = this.settings.pitch;
    this.currentUtterance.volume = this.settings.volume;

    if (this.selectedVoice) {
      this.currentUtterance.voice = this.selectedVoice;
    }

    // Set up highlighting
    if (this.settings.highlightEnabled) {
      this.currentUtterance.onboundary = event => {
        if (event.name === 'word') {
          this.highlightWord(event.charIndex, event.charLength);
        }
      };
    } else {
      this.currentUtterance.onboundary = null;
    }

    // Event handlers
    this.currentUtterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      console.log('[TTS] Speech started');
    };

    this.currentUtterance.onend = () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.removeHighlighting();
      console.log('[TTS] Speech ended');
    };

    this.currentUtterance.onerror = error => {
      console.error('[TTS] Speech error:', error);
      this.emit('error', error);
    };

    this.currentUtterance.onpause = () => {
      this.isPaused = true;
      this.isPlaying = false;
      console.log('[TTS] Speech paused');
    };

    this.currentUtterance.onresume = () => {
      this.isPaused = false;
      this.isPlaying = true;
      console.log('[TTS] Speech resumed');
    };

    this.synthesis.speak(this.currentUtterance);
    console.log('[TTS] Speaking:', text.substring(0, 50) + '...');
  }

  highlightWord(charIndex, charLength) {
    if (!this.currentElement || !this.settings.highlightEnabled) {
      return;
    }

    // Remove previous highlight
    this.removeHighlighting();

    // Get the text content
    const text = this.currentText;
    if (charIndex >= text.length) return;

    // Calculate the word
    const word = text.substring(charIndex, charIndex + charLength);

    // Find and highlight the word in the element
    this.highlightTextInElement(this.currentElement, charIndex, charLength);
  }

  highlightTextInElement(element, charIndex, charLength) {
    // Create a wrapper span for highlighting
    const range = document.createRange();
    const textNodes = this.getTextNodesIn(element);

    let currentIndex = 0;
    let found = false;

    for (const node of textNodes) {
      const nodeLength = node.textContent.length;
      const nodeStart = currentIndex;
      const nodeEnd = currentIndex + nodeLength;

      if (charIndex >= nodeStart && charIndex < nodeEnd) {
        // Found the node containing our text
        const offsetStart = charIndex - nodeStart;
        const offsetEnd = Math.min(offsetStart + charLength, nodeLength);

        try {
          range.setStart(node, offsetStart);
          range.setEnd(node, offsetEnd);

          // Create highlight span
          const span = document.createElement('span');
          span.className = 'assist-tts-highlight-active';
          const color = this.settings.highlightColor || '#FFEB3B';
          const opacity = this.settings.highlightOpacity || 0.7;
          span.style.cssText = `
            background-color: ${color} !important;
            opacity: ${opacity} !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            transition: background-color 0.2s ease !important;
          `;

          range.surroundContents(span);
          this.currentHighlight = span;
          found = true;
        } catch (e) {
          // Range might span multiple nodes, fallback to element highlighting
          console.warn('[TTS] Could not highlight specific word, highlighting element');
        }
        break;
      }

      currentIndex += nodeLength;
    }

    if (!found) {
      // Fallback: highlight the entire element
      element.style.backgroundColor = this.settings.highlightColor || '#FFEB3B';
      element.style.opacity = this.settings.highlightOpacity || 0.7;
    }
  }

  getTextNodesIn(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim()) {
        textNodes.push(node);
      }
    }

    return textNodes;
  }

  removeHighlighting() {
    // Remove active highlight
    if (this.currentHighlight) {
      const parent = this.currentHighlight.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(this.currentHighlight.textContent), this.currentHighlight);
        parent.normalize(); // Merge adjacent text nodes
      }
      this.currentHighlight = null;
    }

    // Remove any remaining highlights
    const highlights = document.querySelectorAll('.assist-tts-highlight-active');
    highlights.forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      }
    });

    // Remove element background if applied
    if (this.currentElement) {
      this.currentElement.style.backgroundColor = '';
      this.currentElement.style.opacity = '';
    }
  }

  pause() {
    if (this.synthesis) {
      this.synthesis.pause();
    }
  }

  resume() {
    if (this.synthesis) {
      this.synthesis.resume();
    }
  }

  stop() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
    this.isPlaying = false;
    this.isPaused = false;
    this.removeHighlighting();
  }

  isSpeaking() {
    return this.synthesis ? this.synthesis.speaking : false;
  }

  enable() {
    this.settings.enabled = true;
    console.log('[TTS] Enabled');
  }

  disable() {
    this.settings.enabled = false;
    this.stop();
    console.log('[TTS] Disabled');
  }

  async readPageContent() {
    if (!this.domAdapter) {
      console.warn('[TTS] DOM Adapter not available');
      return;
    }

    const textNodes = this.domAdapter.getTextNodes();
    const textContent = textNodes
      .map(node => node.textContent)
      .filter(text => text && text.trim() !== '')
      .join(' ');

    if (textContent) {
      this.currentElement = document.body;
      this.currentText = textContent;
      await this.speak(textContent);
    }
  }

  async readText(text, element = null) {
    if (!text || text.trim() === '') {
      return;
    }

    this.currentElement = element;
    this.currentText = text;

    // Add visual feedback to the element being read
    if (element) {
      element.style.outline = '2px solid #2196F3';
      element.style.outlineOffset = '2px';

      // Remove outline when done
      if (this.currentUtterance) {
        const removeOutline = () => {
          element.style.outline = '';
          element.style.outlineOffset = '';
        };
        this.currentUtterance.onend = () => {
          this.isPlaying = false;
          this.isPaused = false;
          this.removeHighlighting();
          removeOutline();
        };
      }
    }

    await this.speak(text);
  }

  // Event emitter pattern
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(data));
    }
  }
}
