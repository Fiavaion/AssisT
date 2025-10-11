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
    const optionsContainer = document.getElementById('options-container');

    // TTS Enable/Disable
    const ttsEnabled = document.getElementById('tts-enabled');
    ttsEnabled.checked = this.settings?.tts?.enabled || false;

    // Show/hide options based on TTS enabled state
    if (ttsEnabled.checked) {
      optionsContainer.classList.remove('hidden');
    } else {
      optionsContainer.classList.add('hidden');
    }

    ttsEnabled.addEventListener('change', (e) => {
      this.settings.tts.enabled = e.target.checked;
      this.saveSettings();

      // Toggle options visibility
      if (e.target.checked) {
        optionsContainer.classList.remove('hidden');
      } else {
        optionsContainer.classList.add('hidden');
      }

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
    const highlightOptionsContainer = document.getElementById('highlight-options-container');
    const highlightEnabled = document.getElementById('highlight-enabled');
    highlightEnabled.checked = this.settings?.tts?.highlightEnabled ?? true;

    // Show/hide highlight options based on highlighting enabled state
    if (highlightEnabled.checked) {
      highlightOptionsContainer.classList.remove('hidden');
    } else {
      highlightOptionsContainer.classList.add('hidden');
    }

    highlightEnabled.addEventListener('change', (e) => {
      this.settings.tts.highlightEnabled = e.target.checked;
      this.saveSettings();
      this.sendCommandToTab('setHighlighting', { enabled: e.target.checked });

      // Toggle highlight options visibility
      if (e.target.checked) {
        highlightOptionsContainer.classList.remove('hidden');
      } else {
        highlightOptionsContainer.classList.add('hidden');
      }
    });

    // Highlight Color
    const highlightColor = document.getElementById('highlight-color');
    highlightColor.value = this.settings?.tts?.highlightColor || '#FFEB3B';
    highlightColor.addEventListener('change', (e) => {
      this.settings.tts.highlightColor = e.target.value;
      this.saveSettings();
      this.sendCommandToTab('setHighlightColor', { color: e.target.value });
    });

    // Highlight Opacity
    const highlightOpacity = document.getElementById('highlight-opacity');
    const opacityValue = document.getElementById('opacity-value');
    highlightOpacity.value = this.settings?.tts?.highlightOpacity || 0.7;
    opacityValue.textContent = `${Math.round(highlightOpacity.value * 100)}%`;
    highlightOpacity.addEventListener('input', (e) => {
      const opacity = parseFloat(e.target.value);
      opacityValue.textContent = `${Math.round(opacity * 100)}%`;
      this.settings.tts.highlightOpacity = opacity;
      this.saveSettings();
      this.sendCommandToTab('setHighlightOpacity', { opacity });
    });

    // Settings link
    document.getElementById('link-settings').addEventListener('click', (e) => {
      e.preventDefault();
      // Open settings page (to be implemented)
      console.log('[Popup] Settings clicked');
    });

    // Reset button
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('Reset all settings to defaults? This cannot be undone.')) {
        this.resetToDefaults();
      }
    });

    // Options button
    document.getElementById('btn-options').addEventListener('click', () => {
      this.showAdvancedOptions();
    });
  }

  resetToDefaults() {
    // Reset to default settings
    this.settings.tts = {
      enabled: false,
      voice: 'default',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      highlightEnabled: true,
      highlightColor: '#FFEB3B',
      highlightOpacity: 0.7
    };

    this.saveSettings();

    // Reload the popup to reflect changes
    window.location.reload();
  }

  showAdvancedOptions() {
    // Create a simple modal for advanced options (to be expanded later)
    const modal = document.createElement('div');
    modal.id = 'advanced-options-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 300px;
        text-align: center;
      ">
        <h2 style="margin: 0 0 10px 0; font-size: 16px;">Advanced Options</h2>
        <p style="margin: 0 0 15px 0; font-size: 13px; color: #666;">
          Advanced options will be available in future updates.
        </p>
        <button id="close-modal" style="
          background: #2196F3;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
        ">Close</button>
      </div>
    `;

    document.body.appendChild(modal);

    // Close modal on click
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.id === 'close-modal') {
        modal.remove();
      }
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

    // Try to find Google UK Female voice
    const preferredVoice = voices.find(v =>
      v.name.includes('Google') &&
      v.name.includes('UK') &&
      v.name.includes('Female')
    ) || voices.find(v =>
      v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female')
    ) || voices.find(v =>
      v.lang.startsWith('en-') && v.name.toLowerCase().includes('female')
    );

    // Set default voice if not already set OR if set to 'default'
    if (preferredVoice && (!this.settings?.tts?.voice || this.settings.tts.voice === 'default')) {
      this.settings.tts.voice = preferredVoice.name;
      this.saveSettings();
    }

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
    if (preferredVoice) {
      console.log('[Popup] Default voice set to:', preferredVoice.name);
    }
  }

  async sendCommandToTab(command, data = {}) {
    if (!this.currentTab) {
      console.warn('[Popup] No current tab');
      return;
    }

    // Skip extension pages and special URLs
    if (!this.currentTab.url ||
        this.currentTab.url.startsWith('chrome://') ||
        this.currentTab.url.startsWith('chrome-extension://') ||
        this.currentTab.url.startsWith('edge://') ||
        this.currentTab.url.startsWith('about:')) {
      console.warn('[Popup] Cannot access this page type');
      this.updateStatus('Cannot access browser system pages', 'error');
      return;
    }

    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: MESSAGE_TYPES.TTS_COMMAND,
        data: { command, ...data }
      });
    } catch (error) {
      console.error('[Popup] Error sending command:', error);
      // Check if it's a connection error
      if (error.message.includes('Could not establish connection')) {
        this.updateStatus('Please reload the page', 'error');
      } else {
        this.updateStatus('Error: Tab not accessible', 'error');
      }
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
