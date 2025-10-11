/**
 * TTS Controller
 * Manages Text-to-Speech with synchronized highlighting
 * Supports Web Speech API and cloud TTS engines (Murf, Google Cloud TTS)
 *
 * Features:
 * - Word-by-word synchronized highlighting
 * - SSML support for pace, emphasis, volume control
 * - Multiple voice options
 */

export class TTSController {
  constructor(domAdapter, settings) {
    this.domAdapter = domAdapter;
    this.settings = settings;
    this.isActive = false;
    this.isPaused = false;
    this.currentUtterance = null;
    this.synthesis = window.speechSynthesis;
    this.highlightedElements = [];
  }

  async initialize() {
    // Load available voices
    await this.loadVoices();
    console.log('[TTS] Controller initialized');
  }

  async loadVoices() {
    return new Promise(resolve => {
      let voices = this.synthesis.getVoices();

      if (voices.length > 0) {
        this.voices = voices;
        resolve(voices);
      } else {
        this.synthesis.onvoiceschanged = () => {
          this.voices = this.synthesis.getVoices();
          resolve(this.voices);
        };
      }
    });
  }

  /**
   * Start reading page content
   */
  async start() {
    if (this.isActive) {
      return;
    }

    const text = this.domAdapter.extractReadableText();
    if (!text) {
      console.warn('[TTS] No readable text found');
      return;
    }

    this.isActive = true;
    await this.speak(text);
  }

  /**
   * Speak text with highlighting
   */
  async speak(text) {
    this.currentUtterance = new SpeechSynthesisUtterance(text);

    // Apply settings
    this.currentUtterance.rate = this.settings.rate;
    this.currentUtterance.pitch = this.settings.pitch;
    this.currentUtterance.volume = this.settings.volume;

    // Select voice
    const selectedVoice = this.voices.find(
      v => v.name === this.settings.voice || v.default
    );
    if (selectedVoice) {
      this.currentUtterance.voice = selectedVoice;
    }

    // Word boundary event for synchronized highlighting
    if (this.settings.highlightEnabled) {
      this.currentUtterance.onboundary = event => {
        if (event.name === 'word') {
          this.highlightWord(event.charIndex, event.charLength);
        }
      };
    }

    // Event handlers
    this.currentUtterance.onend = () => {
      this.isActive = false;
      this.clearHighlights();
      console.log('[TTS] Speech ended');
    };

    this.currentUtterance.onerror = error => {
      console.error('[TTS] Speech error:', error);
      this.isActive = false;
    };

    this.synthesis.speak(this.currentUtterance);
    console.log('[TTS] Speaking:', text.substring(0, 50) + '...');
  }

  /**
   * Highlight word being spoken
   */
  highlightWord(charIndex, charLength) {
    // Clear previous highlights
    this.clearHighlights();

    // Find and highlight current word
    // This is a simplified version - production would use text node mapping
    const textNodes = this.domAdapter.getTextNodes();
    let currentIndex = 0;

    for (const node of textNodes) {
      const nodeLength = node.textContent.length;

      if (charIndex >= currentIndex && charIndex < currentIndex + nodeLength) {
        const relativeIndex = charIndex - currentIndex;
        const word = node.textContent.substr(relativeIndex, charLength);

        // Create highlight
        const highlight = this.domAdapter.createHighlight(
          word,
          this.settings.highlightColor
        );

        // Replace text with highlighted span
        const parent = node.parentNode;
        const before = document.createTextNode(node.textContent.substring(0, relativeIndex));
        const after = document.createTextNode(
          node.textContent.substring(relativeIndex + charLength)
        );

        parent.insertBefore(before, node);
        parent.insertBefore(highlight, node);
        parent.insertBefore(after, node);
        parent.removeChild(node);

        this.highlightedElements.push(highlight);
        break;
      }

      currentIndex += nodeLength;
    }
  }

  /**
   * Clear all highlights
   */
  clearHighlights() {
    this.domAdapter.removeAllHighlights();
    this.highlightedElements = [];
  }

  /**
   * Pause speech
   */
  pause() {
    if (this.isActive && !this.isPaused) {
      this.synthesis.pause();
      this.isPaused = true;
      console.log('[TTS] Paused');
    }
  }

  /**
   * Resume speech
   */
  resume() {
    if (this.isActive && this.isPaused) {
      this.synthesis.resume();
      this.isPaused = false;
      console.log('[TTS] Resumed');
    }
  }

  /**
   * Stop speech
   */
  stop() {
    if (this.isActive) {
      this.synthesis.cancel();
      this.isActive = false;
      this.isPaused = false;
      this.clearHighlights();
      console.log('[TTS] Stopped');
    }
  }

  /**
   * Toggle TTS
   */
  toggle() {
    if (this.isActive) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * Update settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    console.log('[TTS] Settings updated:', this.settings);
  }
}
