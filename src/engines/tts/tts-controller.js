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
      console.log('[TTS] Speech started');
    };

    this.currentUtterance.onend = () => {
      if (this.domAdapter && this.domAdapter.removeHighlight) {
        this.domAdapter.removeHighlight();
      }
      console.log('[TTS] Speech ended');
    };

    this.currentUtterance.onerror = error => {
      console.error('[TTS] Speech error:', error);
      this.emit('error', error);
    };

    this.currentUtterance.onpause = () => {
      console.log('[TTS] Speech paused');
    };

    this.currentUtterance.onresume = () => {
      console.log('[TTS] Speech resumed');
    };

    this.synthesis.speak(this.currentUtterance);
    console.log('[TTS] Speaking:', text.substring(0, 50) + '...');
  }

  highlightWord(charIndex, charLength) {
    if (this.domAdapter && this.domAdapter.highlightWord) {
      this.domAdapter.highlightWord(charIndex, charLength, this.settings.highlightColor);
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
  }

  isSpeaking() {
    return this.synthesis ? this.synthesis.speaking : false;
  }

  isPaused() {
    return this.synthesis ? this.synthesis.paused : false;
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
      await this.speak(textContent);
    }
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
