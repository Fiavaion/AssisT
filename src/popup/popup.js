/**
 * Popup UI Controller
 * Manages user interactions with the TTS controls popup
 */

import { MESSAGE_TYPES } from '../config/constants.js';

class PopupController {
  constructor() {
    this.settings = null;
    this.currentTab = null;
    this.isInitialized = false;
  }

  async initialize() {
    console.log('[Popup] Initializing...');

    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tabs[0];

    // Load settings
    await this.loadSettings();

    // Setup UI
    this.setupEventListeners();
    this.updateUI();
    this.loadVoices();

    this.isInitialized = true;
    this.updateStatus('Ready');
    console.log('[Popup] Initialized');
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_SETTINGS
      });

      if (response.success) {
        this.settings = response.data;
        console.log('[Popup] Settings loaded:', this.settings);
      }
    } catch (error) {
      console.error('[Popup] Error loading settings:', error);
      this.updateStatus('Error loading settings', 'error');
    }
  }

  async saveSettings() {
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_SETTINGS,
        data: this.settings
      });
      console.log('[Popup] Settings saved');
    } catch (error) {
      console.error('[Popup] Error saving settings:', error);
    }
  }

  setupEventListeners() {
    // TTS Enable/Disable
    const ttsEnabled = document.getElementById('tts-enabled');
    ttsEnabled.checked = this.settings?.tts?.enabled || false;
    ttsEnabled.addEventListener('change', (e) => {
      this.settings.tts.enabled = e.target.checked;
      this.saveSettings();
      this.updatePlaybackControls();
      this.sendCommandToTab(e.target.checked ? 'enable' : 'disable');
    });

    // Playback buttons
    document.getElementById('btn-play').addEventListener('click', () => {
      this.sendCommandToTab('readPage');
      this.updateStatus('Reading...', 'speaking');
      this.updatePlaybackButtons(true);
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
      this.sendCommandToTab('pause');
      this.updateStatus('Paused', 'paused');
      this.updatePlaybackButtons(false, true);
    });

    document.getElementById('btn-stop').addEventListener('click', () => {
      this.sendCommandToTab('stop');
      this.updateStatus('Ready');
      this.updatePlaybackButtons(false);
    });

    // Voice selection
    const voiceSelect = document.getElementById('voice-select');
    voiceSelect.addEventListener('change', (e) => {
      this.settings.tts.voice = e.target.value;
      this.saveSettings();
      this.sendCommandToTab('setVoice', { voice: e.target.value });
    });

    // Rate slider
    const rateSlider = document.getElementById('rate-slider');
    const rateValue = document.getElementById('rate-value');
    rateSlider.value = this.settings?.tts?.rate || 1.0;
    rateValue.textContent = `${rateSlider.value}x`;
    rateSlider.addEventListener('input', (e) => {
      const rate = parseFloat(e.target.value);
      rateValue.textContent = `${rate}x`;
      this.settings.tts.rate = rate;
      this.saveSettings();
      this.sendCommandToTab('setRate', { rate });
    });

    // Pitch slider
    const pitchSlider = document.getElementById('pitch-slider');
    const pitchValue = document.getElementById('pitch-value');
    pitchSlider.value = this.settings?.tts?.pitch || 1.0;
    pitchValue.textContent = pitchSlider.value;
    pitchSlider.addEventListener('input', (e) => {
      const pitch = parseFloat(e.target.value);
      pitchValue.textContent = pitch;
      this.settings.tts.pitch = pitch;
      this.saveSettings();
      this.sendCommandToTab('setPitch', { pitch });
    });

    // Volume slider
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    volumeSlider.value = this.settings?.tts?.volume || 1.0;
    volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;
    volumeSlider.addEventListener('input', (e) => {
      const volume = parseFloat(e.target.value);
      volumeValue.textContent = `${Math.round(volume * 100)}%`;
      this.settings.tts.volume = volume;
      this.saveSettings();
      this.sendCommandToTab('setVolume', { volume });
    });

    // Highlighting toggle
    const highlightEnabled = document.getElementById('highlight-enabled');
    highlightEnabled.checked = this.settings?.tts?.highlightEnabled ?? true;
    highlightEnabled.addEventListener('change', (e) => {
      this.settings.tts.highlightEnabled = e.target.checked;
      this.saveSettings();
      this.sendCommandToTab('setHighlighting', { enabled: e.target.checked });
    });

    // Settings link
    document.getElementById('link-settings').addEventListener('click', (e) => {
      e.preventDefault();
      // Open settings page (to be implemented)
      console.log('[Popup] Settings clicked');
    });
  }

  async loadVoices() {
    try {
      const voices = speechSynthesis.getVoices();
      const voiceSelect = document.getElementById('voice-select');

      if (voices.length === 0) {
        // Wait for voices to load
        speechSynthesis.addEventListener('voiceschanged', () => {
          this.populateVoices(speechSynthesis.getVoices());
        });
      } else {
        this.populateVoices(voices);
      }
    } catch (error) {
      console.error('[Popup] Error loading voices:', error);
    }
  }

  populateVoices(voices) {
    const voiceSelect = document.getElementById('voice-select');
    voiceSelect.innerHTML = '';

    // Group voices by language
    const grouped = voices.reduce((acc, voice) => {
      const lang = voice.lang.split('-')[0];
      if (!acc[lang]) acc[lang] = [];
      acc[lang].push(voice);
      return acc;
    }, {});

    // Add voices to select
    Object.keys(grouped).sort().forEach(lang => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = lang.toUpperCase();

      grouped[lang].forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = voice.name + (voice.default ? ' (Default)' : '');
        option.selected = voice.name === this.settings?.tts?.voice;
        optgroup.appendChild(option);
      });

      voiceSelect.appendChild(optgroup);
    });

    console.log('[Popup] Loaded', voices.length, 'voices');
  }

  async sendCommandToTab(command, data = {}) {
    if (!this.currentTab) return;

    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: MESSAGE_TYPES.TTS_COMMAND,
        data: { command, ...data }
      });
    } catch (error) {
      console.error('[Popup] Error sending command:', error);
      this.updateStatus('Error: Tab not accessible', 'error');
    }
  }

  updateUI() {
    this.updatePlaybackControls();
  }

  updatePlaybackControls() {
    const enabled = this.settings?.tts?.enabled || false;
    const playbackSection = document.getElementById('playback-controls');

    if (enabled) {
      playbackSection.style.opacity = '1';
      playbackSection.style.pointerEvents = 'auto';
    } else {
      playbackSection.style.opacity = '0.5';
      playbackSection.style.pointerEvents = 'none';
    }
  }

  updatePlaybackButtons(playing = false, paused = false) {
    const playBtn = document.getElementById('btn-play');
    const pauseBtn = document.getElementById('btn-pause');
    const stopBtn = document.getElementById('btn-stop');

    playBtn.disabled = playing;
    pauseBtn.disabled = !playing || paused;
    stopBtn.disabled = !playing;

    if (paused) {
      pauseBtn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">Resume</span>';
      pauseBtn.onclick = () => {
        this.sendCommandToTab('resume');
        this.updateStatus('Reading...', 'speaking');
        this.updatePlaybackButtons(true, false);
      };
    } else {
      pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span><span class="btn-text">Pause</span>';
    }
  }

  updateStatus(message, type = '') {
    const statusIndicator = document.getElementById('status-indicator');
    statusIndicator.textContent = message;
    statusIndicator.className = 'status-indicator ' + type;
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const popup = new PopupController();
  await popup.initialize();
});
