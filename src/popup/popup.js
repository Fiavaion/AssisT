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

  applyVisibilitySettings() {
    // Get visibility settings with defaults
    const visibility = this.settings.ui_visibility || {};

    // Text Highlighting section visibility
    const highlightingSection = document.querySelector('#highlight-enabled').closest('.control-section');
    const highlightOptionsContainer = document.getElementById('highlight-options-container');

    if (visibility.show_highlighting === false) {
      // Hide highlighting toggle and options
      if (highlightingSection) {
        highlightingSection.style.display = 'none';
      }
      if (highlightOptionsContainer) {
        highlightOptionsContainer.style.display = 'none';
      }
      console.log('[Popup] Highlighting feature hidden');
    } else {
      // Show highlighting (default)
      if (highlightingSection) {
        highlightingSection.style.display = '';
      }
      if (highlightOptionsContainer) {
        highlightOptionsContainer.style.display = '';
      }
    }

    // Speed Presets visibility
    const speedPresetsContainer = document.getElementById('speed-presets-container');
    if (visibility.show_speed_presets === false) {
      if (speedPresetsContainer) {
        speedPresetsContainer.style.display = 'none';
      }
      console.log('[Popup] Speed Presets feature hidden');
    } else {
      // Show speed presets (default)
      if (speedPresetsContainer) {
        speedPresetsContainer.style.display = '';
      }
    }

    console.log('[Popup] Visibility settings applied:', visibility);
  }

  setupEventListeners() {
    // Apply visibility settings
    this.applyVisibilitySettings();

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
      this.updatePresetButtonStates(rate);
    });

    // Setup speed presets
    this.setupSpeedPresets();

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

    // Word-by-Word Highlighting toggle
    const wordByWordEnabled = document.getElementById('word-by-word-enabled');
    wordByWordEnabled.checked = this.settings?.tts?.wordByWordEnabled || false;
    wordByWordEnabled.addEventListener('change', (e) => {
      this.settings.tts.wordByWordEnabled = e.target.checked;
      this.saveSettings();
      this.sendCommandToTab('setWordByWord', { enabled: e.target.checked });
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

  setupSpeedPresets() {
    const presetButtons = document.querySelectorAll('.preset-btn');
    const rateSlider = document.getElementById('rate-slider');
    const rateValue = document.getElementById('rate-value');

    // Add click handlers to preset buttons
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.getAttribute('data-speed'));

        // Update slider and value display
        rateSlider.value = speed;
        rateValue.textContent = `${speed}x`;

        // Save to settings
        this.settings.tts.rate = speed;
        this.saveSettings();
        this.sendCommandToTab('setRate', { rate: speed });

        // Update button states
        this.updatePresetButtonStates(speed);
      });
    });

    // Initialize button states based on current rate
    const currentRate = this.settings?.tts?.rate || 1.0;
    this.updatePresetButtonStates(currentRate);
  }

  updatePresetButtonStates(currentRate) {
    const presetButtons = document.querySelectorAll('.preset-btn');

    presetButtons.forEach(btn => {
      const btnSpeed = parseFloat(btn.getAttribute('data-speed'));

      // Check if this button's speed matches current rate (with tolerance for floating point)
      if (Math.abs(btnSpeed - currentRate) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  showAdvancedOptions() {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'advanced-options-modal';
    modal.className = 'modal-overlay';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Advanced Options</h2>
          <button id="modal-close" class="modal-close-btn" aria-label="Close">&times;</button>
        </div>

        <div class="modal-tabs">
          <button class="modal-tab active" data-tab="features">Features</button>
          <button class="modal-tab" data-tab="keyboard">Keyboard</button>
          <button class="modal-tab" data-tab="appearance">Appearance</button>
        </div>

        <div class="modal-body">
          <!-- Features Tab -->
          <div id="tab-features" class="tab-content active">
            <h3>Feature Visibility</h3>
            <p class="tab-description">Choose which features appear in the main popup</p>

            <div class="feature-list">
              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-voice-selection" checked disabled>
                  <span>Voice Selection</span>
                  <span class="feature-badge">Core</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-speed-control" checked disabled>
                  <span>Speed Control</span>
                  <span class="feature-badge">Core</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-pitch-control" checked disabled>
                  <span>Pitch Control</span>
                  <span class="feature-badge">Core</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-volume-control" checked disabled>
                  <span>Volume Control</span>
                  <span class="feature-badge">Core</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-highlighting" checked>
                  <span>Text Highlighting</span>
                </label>
              </div>

              <div class="feature-section-header">
                <span>Sprint 2 Features</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-speed-presets" checked>
                  <span>Speed Presets</span>
                  <span class="feature-badge">New</span>
                </label>
              </div>

              <div class="feature-item disabled">
                <label class="feature-label">
                  <input type="checkbox" id="show-reading-queue" disabled>
                  <span>Reading Queue</span>
                  <span class="feature-badge-soon">Soon</span>
                </label>
              </div>

              <div class="feature-item disabled">
                <label class="feature-label">
                  <input type="checkbox" id="show-reading-mode" disabled>
                  <span>Reading Mode</span>
                  <span class="feature-badge-soon">Soon</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Keyboard Tab -->
          <div id="tab-keyboard" class="tab-content">
            <h3>Keyboard Shortcuts</h3>
            <p class="tab-description">Quick reference for keyboard controls</p>

            <div class="shortcut-list">
              <div class="shortcut-item">
                <span class="shortcut-key">Space</span>
                <span class="shortcut-desc">Pause / Resume reading</span>
              </div>

              <div class="shortcut-item">
                <span class="shortcut-key">+ or =</span>
                <span class="shortcut-desc">Increase reading speed</span>
              </div>

              <div class="shortcut-item">
                <span class="shortcut-key">-</span>
                <span class="shortcut-desc">Decrease reading speed</span>
              </div>

              <div class="shortcut-section">Sprint 2 Shortcuts (Coming Soon)</div>

              <div class="shortcut-item disabled">
                <span class="shortcut-key">Ctrl+Shift+R</span>
                <span class="shortcut-desc">Read selected text</span>
              </div>

              <div class="shortcut-item disabled">
                <span class="shortcut-key">Ctrl+Shift+Q</span>
                <span class="shortcut-desc">Toggle reading queue</span>
              </div>
            </div>
          </div>

          <!-- Appearance Tab -->
          <div id="tab-appearance" class="tab-content">
            <h3>Appearance</h3>
            <p class="tab-description">Customize the extension's look and feel</p>

            <div class="appearance-options">
              <div class="option-group">
                <label>Compact Mode</label>
                <div class="option-control">
                  <label class="toggle-switch-small">
                    <input type="checkbox" id="compact-mode" checked>
                    <span class="toggle-slider-small"></span>
                  </label>
                  <span class="option-desc">Minimize spacing in popup</span>
                </div>
              </div>

              <div class="option-group">
                <label>Show Icons</label>
                <div class="option-control">
                  <label class="toggle-switch-small">
                    <input type="checkbox" id="show-icons" checked>
                    <span class="toggle-slider-small"></span>
                  </label>
                  <span class="option-desc">Display emoji icons in controls</span>
                </div>
              </div>

              <div class="option-group">
                <label>Debug Mode</label>
                <div class="option-control">
                  <label class="toggle-switch-small">
                    <input type="checkbox" id="debug-mode">
                    <span class="toggle-slider-small"></span>
                  </label>
                  <span class="option-desc">Show console logs for debugging</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button id="modal-save" class="modal-btn modal-btn-primary">Save Changes</button>
          <button id="modal-cancel" class="modal-btn modal-btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Setup tab switching
    this.setupModalTabs(modal);

    // Setup modal actions
    this.setupModalActions(modal);

    // Load current settings into modal
    this.loadModalSettings();
  }

  setupModalTabs(modal) {
    const tabs = modal.querySelectorAll('.modal-tab');
    const contents = modal.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active from all tabs
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        // Add active to clicked tab
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        modal.querySelector(`#tab-${tabId}`).classList.add('active');
      });
    });
  }

  setupModalActions(modal) {
    // Close button
    modal.querySelector('#modal-close').addEventListener('click', () => {
      modal.remove();
    });

    // Cancel button
    modal.querySelector('#modal-cancel').addEventListener('click', () => {
      modal.remove();
    });

    // Save button
    modal.querySelector('#modal-save').addEventListener('click', () => {
      this.saveModalSettings();
      modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  loadModalSettings() {
    // Load UI visibility settings
    const visibility = this.settings.ui_visibility || {};

    // Highlighting
    const showHighlighting = document.getElementById('show-highlighting');
    if (showHighlighting) {
      showHighlighting.checked = visibility.show_highlighting !== false;
    }

    // Speed Presets
    const showSpeedPresets = document.getElementById('show-speed-presets');
    if (showSpeedPresets) {
      showSpeedPresets.checked = visibility.show_speed_presets !== false;
    }

    // Appearance settings
    const compactMode = document.getElementById('compact-mode');
    if (compactMode) {
      compactMode.checked = this.settings.appearance?.compact_mode !== false;
    }

    const showIcons = document.getElementById('show-icons');
    if (showIcons) {
      showIcons.checked = this.settings.appearance?.show_icons !== false;
    }

    const debugMode = document.getElementById('debug-mode');
    if (debugMode) {
      debugMode.checked = this.settings.appearance?.debug_mode === true;
    }
  }

  saveModalSettings() {
    // Initialize settings objects if they don't exist
    if (!this.settings.ui_visibility) {
      this.settings.ui_visibility = {};
    }
    if (!this.settings.appearance) {
      this.settings.appearance = {};
    }

    // Track if visibility changed (need to reload popup)
    const oldVisibility = { ...this.settings.ui_visibility };

    // Save UI visibility settings
    const showHighlighting = document.getElementById('show-highlighting');
    if (showHighlighting) {
      this.settings.ui_visibility.show_highlighting = showHighlighting.checked;
    }

    const showSpeedPresets = document.getElementById('show-speed-presets');
    if (showSpeedPresets) {
      this.settings.ui_visibility.show_speed_presets = showSpeedPresets.checked;
    }

    // Save appearance settings
    const compactMode = document.getElementById('compact-mode');
    if (compactMode) {
      this.settings.appearance.compact_mode = compactMode.checked;
    }

    const showIcons = document.getElementById('show-icons');
    if (showIcons) {
      this.settings.appearance.show_icons = showIcons.checked;
    }

    const debugMode = document.getElementById('debug-mode');
    if (debugMode) {
      this.settings.appearance.debug_mode = debugMode.checked;
    }

    // Save to storage
    this.saveSettings();

    // Show confirmation
    this.updateStatus('Settings saved');

    console.log('[Popup] Modal settings saved:', {
      ui_visibility: this.settings.ui_visibility,
      appearance: this.settings.appearance
    });

    // Check if visibility changed
    const visibilityChanged =
      (showHighlighting && oldVisibility.show_highlighting !== this.settings.ui_visibility.show_highlighting) ||
      (showSpeedPresets && oldVisibility.show_speed_presets !== this.settings.ui_visibility.show_speed_presets);

    // Reload popup if visibility changed
    if (visibilityChanged) {
      console.log('[Popup] Visibility changed, reloading...');
      setTimeout(() => window.location.reload(), 300);
    }
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
