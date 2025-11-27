/**
 * Popup UI Controller
 * Manages user interactions with the TTS controls popup
 */

import { MESSAGE_TYPES } from '../config/constants.js';
import {
  SHORTCUT_LABELS,
  loadShortcuts,
  saveShortcuts,
  resetShortcuts,
  validateShortcut,
  eventToShortcut,
} from '../utils/keyboard-shortcuts.js';
import { migrateAnnotations } from '../features/annotations/migration-manager.js';
import { CitationManagerPanel } from './citation-manager-panel.js';

class PopupController {
  constructor() {
    this.settings = null;
    this.currentTab = null;
    this.isInitialized = false;
    this.citationPanel = null;
    this.citationPanelExpanded = false;
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
    this.setupAccordions();
    this.updateUI();
    this.loadVoices();

    this.isInitialized = true;
    this.updateStatus('Ready');
    console.log('[Popup] Initialized');
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_SETTINGS,
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
        data: this.settings,
      });
      console.log('[Popup] Settings saved');
    } catch (error) {
      console.error('[Popup] Error saving settings:', error);
    }
  }

  /**
   * Save highlight menu settings to the separate key that the feature reads
   * The highlightMenu.js feature reads from 'highlightMenuSettings' in chrome.storage.local
   */
  async saveHighlightMenuSettings() {
    if (!this.settings.highlightMenu) {
      return;
    }

    try {
      await chrome.storage.local.set({
        highlightMenuSettings: this.settings.highlightMenu,
      });
      console.log('[Popup] Highlight Menu settings saved to storage:', this.settings.highlightMenu);
    } catch (error) {
      console.error('[Popup] Error saving highlight menu settings:', error);
    }
  }

  applyVisibilitySettings() {
    // Get visibility settings with defaults
    const visibility = this.settings.ui_visibility || {};

    // Helper function to hide/show section
    const toggleSection = (sectionId, visibilityKey, defaultValue = true) => {
      const section = document.getElementById(sectionId);
      if (section) {
        // Use explicit value if set, otherwise use defaultValue
        const isVisible =
          visibility[visibilityKey] !== undefined ? visibility[visibilityKey] : defaultValue;
        section.style.display = isVisible ? '' : 'none';
      }
    };

    // Apply visibility for all features (most default to true)
    toggleSection('ocr-section', 'show_ocr'); // OCR section
    toggleSection('highlight-menu-section', 'show_highlight_menu'); // Highlight Menu section
    toggleSection('dictionary-section', 'show_dictionary'); // Dictionary section
    toggleSection('highlight-options-container', 'show_highlighting');
    toggleSection('speed-presets-container', 'show_speed_presets');
    toggleSection('text-customization-section', 'show_text_customization');
    toggleSection('reading-guide-section', 'show_reading_guide');
    toggleSection('focus-mode-section', 'show_focus_mode');
    toggleSection('stt-section', 'show_stt', false); // EXPERIMENTAL - hidden by default
    toggleSection('screen-overlay-section', 'show_screen_overlay');
    toggleSection('canvas-integration-section', 'show_canvas_integration', false); // EXPERIMENTAL - hidden by default
    toggleSection('moodle-integration-section', 'show_moodle_integration', false); // EXPERIMENTAL - hidden by default
    toggleSection(
      'google-classroom-integration-section',
      'show_google_classroom_integration',
      false
    ); // EXPERIMENTAL - hidden by default
    toggleSection('dyslexia-mode-section', 'show_dyslexia_mode');

    console.log('[Popup] Visibility settings applied:', visibility);
  }

  /**
   * Initialize accordion sections for cleaner UI organization
   */
  setupAccordions() {
    const accordionSections = document.querySelectorAll('.accordion-section');
    const savedState = this.loadAccordionState();

    accordionSections.forEach(section => {
      const header = section.querySelector('.accordion-header');
      const content = section.querySelector('.accordion-content');
      const sectionId = section.dataset.section;

      if (!header || !content) {
        return;
      }

      // Set initial state based on saved preferences or defaults
      // Default: "reading" section is expanded
      const isExpanded =
        savedState[sectionId] !== undefined ? savedState[sectionId] : sectionId === 'reading';

      this.setAccordionState(header, content, isExpanded);

      // Click handler
      header.addEventListener('click', () => {
        const currentlyExpanded = header.getAttribute('aria-expanded') === 'true';
        this.setAccordionState(header, content, !currentlyExpanded);
        this.saveAccordionState();
      });

      // Keyboard handler
      header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const currentlyExpanded = header.getAttribute('aria-expanded') === 'true';
          this.setAccordionState(header, content, !currentlyExpanded);
          this.saveAccordionState();
        }
      });
    });
  }

  setAccordionState(header, content, expanded) {
    header.setAttribute('aria-expanded', expanded.toString());
    content.setAttribute('data-expanded', expanded.toString());
  }

  loadAccordionState() {
    try {
      const saved = localStorage.getItem('assist_accordion_state');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  saveAccordionState() {
    const state = {};
    document.querySelectorAll('.accordion-section').forEach(section => {
      const header = section.querySelector('.accordion-header');
      const sectionId = section.dataset.section;
      if (header && sectionId) {
        state[sectionId] = header.getAttribute('aria-expanded') === 'true';
      }
    });
    try {
      localStorage.setItem('assist_accordion_state', JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }

  setupEventListeners() {
    // Apply visibility settings
    this.applyVisibilitySettings();

    const optionsContainer = document.getElementById('options-container');
    const ocrOptionsContainer = document.getElementById('ocr-options-container');

    // ============================================================
    // OCR ENABLE/DISABLE
    // ============================================================
    const ocrEnabled = document.getElementById('ocr-enabled');
    if (ocrEnabled) {
      // Initialize OCR settings if they don't exist
      if (!this.settings.ocr) {
        this.settings.ocr = {
          enabled: true,
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
        };
      }

      ocrEnabled.checked = this.settings.ocr.enabled !== false;

      // Show/hide OCR options based on enabled state
      if (ocrEnabled.checked) {
        ocrOptionsContainer.classList.remove('hidden');
      } else {
        ocrOptionsContainer.classList.add('hidden');
      }

      ocrEnabled.addEventListener('change', e => {
        this.settings.ocr.enabled = e.target.checked;
        this.saveSettings();

        // Toggle OCR options visibility
        if (e.target.checked) {
          ocrOptionsContainer.classList.remove('hidden');
        } else {
          ocrOptionsContainer.classList.add('hidden');
        }
      });
    }

    // TTS Enable/Disable
    const ttsEnabled = document.getElementById('tts-enabled');
    ttsEnabled.checked = this.settings?.tts?.enabled || false;

    // Show/hide options based on TTS enabled state
    if (ttsEnabled.checked) {
      optionsContainer.classList.remove('hidden');
    } else {
      optionsContainer.classList.add('hidden');
    }

    ttsEnabled.addEventListener('change', e => {
      this.settings.tts.enabled = e.target.checked;
      this.saveSettings();

      // Toggle options visibility
      if (e.target.checked) {
        optionsContainer.classList.remove('hidden');
      } else {
        optionsContainer.classList.add('hidden');
      }

      this.sendCommandToTab(e.target.checked ? 'enable' : 'disable');
    });

    // ============================================================
    // SPRINT 6 FEATURE: READ ENTIRE PAGE
    // ============================================================
    const btnReadPage = document.getElementById('btn-read-page');
    btnReadPage.addEventListener('click', () => {
      console.log('[Popup] Read Page button clicked');
      this.sendCommandToTab('readPage');
      this.updateStatus('Reading page...', 'speaking');
    });

    // ============================================================
    // OCR FEATURE: TRIGGER OCR CAPTURE
    // ============================================================
    const btnTriggerOCR = document.getElementById('btn-trigger-ocr');
    if (btnTriggerOCR) {
      btnTriggerOCR.addEventListener('click', async () => {
        console.log('[Popup] OCR button clicked');
        this.updateStatus('Starting OCR...', 'processing');

        try {
          // Send message to content script to trigger OCR
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'TRIGGER_OCR',
          });

          if (response && response.success) {
            this.updateStatus('OCR complete!', 'success');
          } else {
            this.updateStatus('OCR failed', 'error');
          }
        } catch (error) {
          console.error('[Popup] OCR trigger failed:', error);
          this.updateStatus('OCR error: ' + error.message, 'error');
        }
      });
    }

    // ============================================================
    // OCR SETTINGS: AUTO-ACTIVATE READING MODE
    // ============================================================
    const ocrAutoReadingMode = document.getElementById('ocr-auto-reading-mode');
    if (ocrAutoReadingMode) {
      // Initialize OCR settings if they don't exist
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
        };
      }

      // Set initial state from settings
      ocrAutoReadingMode.checked = this.settings.ocr.autoActivateReadingMode !== false;

      // Handle toggle changes
      ocrAutoReadingMode.addEventListener('change', e => {
        this.settings.ocr.autoActivateReadingMode = e.target.checked;
        this.saveSettings();
        console.log('[Popup] OCR auto-activate reading mode:', e.target.checked);
      });
    }

    // ============================================================
    // OCR SETTINGS: UPSCALE FACTOR SLIDER
    // ============================================================
    const ocrUpscaleSlider = document.getElementById('ocr-upscale-factor');
    const ocrUpscaleLabel = document.getElementById('ocr-upscale-label');
    if (ocrUpscaleSlider && ocrUpscaleLabel) {
      // Initialize default if not set
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
        };
      }

      // Get quality label for upscale factor
      const getQualityLabel = factor => {
        if (factor <= 1.0) {
          return 'Low (1.0x)';
        }
        if (factor <= 1.4) {
          return 'Medium-Low (1.3x)';
        }
        if (factor <= 1.6) {
          return 'Medium (1.5x)';
        }
        if (factor <= 1.8) {
          return 'Medium-High (1.8x)';
        }
        return 'High (2.0x)';
      };

      // Set initial state from settings
      const initialFactor = this.settings.ocr.upscaleFactor ?? 1.5;
      ocrUpscaleSlider.value = initialFactor;
      ocrUpscaleLabel.textContent = getQualityLabel(initialFactor);

      // Handle slider changes
      ocrUpscaleSlider.addEventListener('input', e => {
        const factor = parseFloat(e.target.value);
        ocrUpscaleLabel.textContent = getQualityLabel(factor);
        this.settings.ocr.upscaleFactor = factor;
        this.saveSettings();
        console.log('[Popup] OCR upscale factor:', factor);
      });
    }

    // ============================================================
    // OCR SETTINGS: LANGUAGE SELECTION
    // ============================================================
    const ocrLanguageSelect = document.getElementById('ocr-language');
    if (ocrLanguageSelect) {
      // Initialize default if not set
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
          language: 'eng',
          confidenceThreshold: 60,
          autoTTS: true,
        };
      }

      // Set initial state from settings
      ocrLanguageSelect.value = this.settings.ocr.language || 'eng';

      // Handle language changes
      ocrLanguageSelect.addEventListener('change', e => {
        this.settings.ocr.language = e.target.value;
        this.saveSettings();
        console.log('[Popup] OCR language changed to:', e.target.value);
      });
    }

    // ============================================================
    // OCR SETTINGS: CONFIDENCE THRESHOLD SLIDER
    // ============================================================
    const ocrConfidenceSlider = document.getElementById('ocr-confidence-threshold');
    const ocrConfidenceLabel = document.getElementById('ocr-confidence-label');
    if (ocrConfidenceSlider && ocrConfidenceLabel) {
      // Initialize default if not set
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
          language: 'eng',
          confidenceThreshold: 60,
          autoTTS: true,
        };
      }

      // Set initial state from settings
      const initialConfidence = this.settings.ocr.confidenceThreshold ?? 60;
      ocrConfidenceSlider.value = initialConfidence;
      ocrConfidenceLabel.textContent = `${initialConfidence}%`;

      // Handle slider changes
      ocrConfidenceSlider.addEventListener('input', e => {
        const confidence = parseInt(e.target.value, 10);
        ocrConfidenceLabel.textContent = `${confidence}%`;
        this.settings.ocr.confidenceThreshold = confidence;
        this.saveSettings();
        console.log('[Popup] OCR confidence threshold:', confidence);
      });
    }

    // ============================================================
    // OCR SETTINGS: AUTO-TTS TOGGLE
    // ============================================================
    const ocrAutoTTS = document.getElementById('ocr-auto-tts');
    if (ocrAutoTTS) {
      // Initialize OCR settings if they don't exist
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
          language: 'eng',
          confidenceThreshold: 60,
          autoTTS: true,
        };
      }

      // Set initial state from settings
      ocrAutoTTS.checked = this.settings.ocr.autoTTS !== false;

      // Handle toggle changes
      ocrAutoTTS.addEventListener('change', e => {
        this.settings.ocr.autoTTS = e.target.checked;
        this.saveSettings();
        console.log('[Popup] OCR auto-TTS:', e.target.checked);
      });
    }

    // ============================================================
    // HIGHLIGHT MENU ENABLE/DISABLE
    // ============================================================
    const highlightMenuEnabled = document.getElementById('highlight-menu-enabled');
    const highlightMenuOptionsContainer = document.getElementById(
      'highlight-menu-options-container'
    );

    if (highlightMenuEnabled && highlightMenuOptionsContainer) {
      // Initialize Highlight Menu settings if they don't exist
      if (!this.settings.highlightMenu) {
        this.settings.highlightMenu = {
          enabled: true,
          showTTS: true,
          showDictionary: true,
          showTranslate: true,
          showSearch: true,
          showAnnotate: true,
          showCopy: true,
          autoHideDelay: 5000,
        };
      }

      highlightMenuEnabled.checked = this.settings.highlightMenu.enabled !== false;

      // Show/hide options based on enabled state
      if (highlightMenuEnabled.checked) {
        highlightMenuOptionsContainer.classList.remove('hidden');
      } else {
        highlightMenuOptionsContainer.classList.add('hidden');
      }

      highlightMenuEnabled.addEventListener('change', e => {
        this.settings.highlightMenu.enabled = e.target.checked;
        this.saveSettings();
        // Also save to highlightMenuSettings for the feature to read
        this.saveHighlightMenuSettings();

        // Toggle options visibility
        if (e.target.checked) {
          highlightMenuOptionsContainer.classList.remove('hidden');
        } else {
          highlightMenuOptionsContainer.classList.add('hidden');
        }

        console.log('[Popup] Highlight Menu enabled:', e.target.checked);
      });
    }

    // ============================================================
    // HIGHLIGHT MENU SETTINGS: BUTTON TOGGLES
    // ============================================================
    const buttonToggles = [
      { id: 'highlight-menu-show-tts', key: 'showTTS' },
      { id: 'highlight-menu-show-dictionary', key: 'showDictionary' },
      { id: 'highlight-menu-show-translate', key: 'showTranslate' },
      { id: 'highlight-menu-show-search', key: 'showSearch' },
      { id: 'highlight-menu-show-annotate', key: 'showAnnotate' },
      { id: 'highlight-menu-show-copy', key: 'showCopy' },
    ];

    buttonToggles.forEach(({ id, key }) => {
      const toggle = document.getElementById(id);
      console.log(`[Popup] Looking for toggle ${id}:`, toggle ? 'FOUND' : 'NOT FOUND');
      if (toggle) {
        // Initialize settings
        if (!this.settings.highlightMenu) {
          this.settings.highlightMenu = {};
        }

        // Set initial checked state
        toggle.checked = this.settings.highlightMenu[key] !== false;
        console.log(`[Popup] Toggle ${id} initial state:`, toggle.checked);

        // Add change listener
        toggle.addEventListener('change', e => {
          console.log(`[Popup] Toggle ${id} CHANGED to:`, e.target.checked);
          this.settings.highlightMenu[key] = e.target.checked;
          this.saveSettings();
          // Also save to highlightMenuSettings for the feature to read
          this.saveHighlightMenuSettings();
          console.log(`[Popup] Highlight Menu ${key}:`, e.target.checked);
        });
      }
    });

    // ============================================================
    // HIGHLIGHT MENU SETTINGS: AUTO-HIDE DELAY SLIDER
    // ============================================================
    const highlightMenuDelaySlider = document.getElementById('highlight-menu-auto-hide-delay');
    const highlightMenuDelayLabel = document.getElementById('highlight-menu-delay-label');

    if (highlightMenuDelaySlider && highlightMenuDelayLabel) {
      // Initialize default if not set
      if (!this.settings.highlightMenu) {
        this.settings.highlightMenu = { autoHideDelay: 5000 };
      }

      // Set initial value
      const delayValue = this.settings.highlightMenu.autoHideDelay || 5000;
      highlightMenuDelaySlider.value = delayValue;
      highlightMenuDelayLabel.textContent = `${delayValue / 1000} second${delayValue === 1000 ? '' : 's'}`;

      // Add input listener
      highlightMenuDelaySlider.addEventListener('input', e => {
        const delay = parseInt(e.target.value);
        highlightMenuDelayLabel.textContent = `${delay / 1000} second${delay === 1000 ? '' : 's'}`;
        this.settings.highlightMenu.autoHideDelay = delay;
        this.saveSettings();
        // Also save to highlightMenuSettings for the feature to read
        this.saveHighlightMenuSettings();
        console.log('[Popup] Highlight Menu auto-hide delay:', delay);
      });
    }

    // ============================================================
    // DICTIONARY SETTINGS
    // ============================================================
    const dictionaryEnabled = document.getElementById('dictionary-enabled');
    const dictionaryOptionsContainer = document.getElementById('dictionary-options-container');

    if (dictionaryEnabled && dictionaryOptionsContainer) {
      // Initialize default settings
      if (!this.settings.dictionary) {
        this.settings.dictionary = {
          enabled: true,
          autoLookup: true,
          cacheSize: 50,
        };
      }

      // Set initial checked state
      dictionaryEnabled.checked = this.settings.dictionary.enabled !== false;

      // Show/hide options based on enabled state
      if (dictionaryEnabled.checked) {
        dictionaryOptionsContainer.classList.remove('hidden');
      } else {
        dictionaryOptionsContainer.classList.add('hidden');
      }

      dictionaryEnabled.addEventListener('change', e => {
        this.settings.dictionary.enabled = e.target.checked;
        this.saveSettings();

        // Toggle options visibility
        if (e.target.checked) {
          dictionaryOptionsContainer.classList.remove('hidden');
        } else {
          dictionaryOptionsContainer.classList.add('hidden');
        }

        console.log('[Popup] Dictionary enabled:', e.target.checked);
      });
    }

    // ============================================================
    // DICTIONARY SETTINGS: AUTO-LOOKUP TOGGLE
    // ============================================================
    const dictionaryAutoLookup = document.getElementById('dictionary-auto-lookup');

    if (dictionaryAutoLookup) {
      // Set initial checked state
      dictionaryAutoLookup.checked = this.settings.dictionary?.autoLookup !== false;

      // Add change listener
      dictionaryAutoLookup.addEventListener('change', e => {
        if (!this.settings.dictionary) {
          this.settings.dictionary = {};
        }
        this.settings.dictionary.autoLookup = e.target.checked;
        this.saveSettings();
        console.log('[Popup] Dictionary auto-lookup:', e.target.checked);
      });
    }

    // ============================================================
    // DICTIONARY SETTINGS: CACHE SIZE SLIDER
    // ============================================================
    const dictionaryCacheSizeSlider = document.getElementById('dictionary-cache-size');
    const dictionaryCacheLabel = document.getElementById('dictionary-cache-label');

    if (dictionaryCacheSizeSlider && dictionaryCacheLabel) {
      // Set initial value
      const cacheSize = this.settings.dictionary?.cacheSize || 50;
      dictionaryCacheSizeSlider.value = cacheSize;
      dictionaryCacheLabel.textContent = `${cacheSize} entr${cacheSize === 1 ? 'y' : 'ies'}`;

      // Add input listener
      dictionaryCacheSizeSlider.addEventListener('input', e => {
        const size = parseInt(e.target.value);
        dictionaryCacheLabel.textContent = `${size} entr${size === 1 ? 'y' : 'ies'}`;
        if (!this.settings.dictionary) {
          this.settings.dictionary = {};
        }
        this.settings.dictionary.cacheSize = size;
        this.saveSettings();
        console.log('[Popup] Dictionary cache size:', size);
      });
    }

    // ============================================================
    // TRANSLATION SETTINGS
    // ============================================================
    const translationEnabled = document.getElementById('translation-enabled');
    const translationOptionsContainer = document.getElementById('translation-options-container');

    if (translationEnabled && translationOptionsContainer) {
      // Initialize default settings
      if (!this.settings.translation) {
        this.settings.translation = {
          enabled: true,
          targetLanguage: 'en',
        };
      }

      // Set initial checked state
      translationEnabled.checked = this.settings.translation.enabled !== false;

      // Show/hide options based on enabled state
      if (translationEnabled.checked) {
        translationOptionsContainer.classList.remove('hidden');
      } else {
        translationOptionsContainer.classList.add('hidden');
      }

      translationEnabled.addEventListener('change', e => {
        this.settings.translation.enabled = e.target.checked;
        this.saveSettings();

        // Toggle options visibility
        if (e.target.checked) {
          translationOptionsContainer.classList.remove('hidden');
        } else {
          translationOptionsContainer.classList.add('hidden');
        }

        console.log('[Popup] Translation enabled:', e.target.checked);
      });
    }

    // ============================================================
    // TRANSLATION: TRANSLATE PAGE BUTTON
    // ============================================================
    const btnTranslatePage = document.getElementById('btn-translate-page');
    const targetLanguageSelect = document.getElementById('translation-target-language');

    if (btnTranslatePage && targetLanguageSelect) {
      // Set initial target language from settings
      targetLanguageSelect.value = this.settings.translation?.targetLanguage || 'en';

      // Handle target language change
      targetLanguageSelect.addEventListener('change', e => {
        if (!this.settings.translation) {
          this.settings.translation = { enabled: true };
        }
        this.settings.translation.targetLanguage = e.target.value;
        this.saveSettings();
        console.log('[Popup] Translation target language:', e.target.value);
      });

      // Handle translate page button click
      btnTranslatePage.addEventListener('click', async () => {
        console.log('[Popup] Translate Page button clicked');
        this.updateStatus('Translating page...', 'processing');

        const targetLang = targetLanguageSelect.value;

        try {
          // Send message to content script to trigger full-page translation
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'TRANSLATE_PAGE',
            targetLang: targetLang,
          });

          if (response && response.success) {
            this.updateStatus('Page translated!', 'success');
          } else {
            this.updateStatus('Translation failed', 'error');
          }
        } catch (error) {
          console.error('[Popup] Translation trigger failed:', error);
          this.updateStatus('Translation error: ' + error.message, 'error');
        }
      });
    }

    // ============================================================
    // CITATION: ENABLE/DISABLE TOGGLE
    // ============================================================
    const citationEnabled = document.getElementById('citation-enabled');
    const citationOptionsContainer = document.getElementById('citation-options-container');

    if (citationEnabled && citationOptionsContainer) {
      // Set initial state from settings
      citationEnabled.checked = this.settings.citation?.enabled !== false; // Default to true

      // Initial visibility
      if (citationEnabled.checked) {
        citationOptionsContainer.classList.remove('hidden');
      } else {
        citationOptionsContainer.classList.add('hidden');
      }

      // Handle toggle
      citationEnabled.addEventListener('change', e => {
        if (!this.settings.citation) {
          this.settings.citation = { enabled: true };
        }
        this.settings.citation.enabled = e.target.checked;
        this.saveSettings();

        // Toggle options visibility
        if (e.target.checked) {
          citationOptionsContainer.classList.remove('hidden');
        } else {
          citationOptionsContainer.classList.add('hidden');
        }

        console.log('[Popup] Citation enabled:', e.target.checked);
      });
    }

    // ============================================================
    // CITATION: SAVE CITATION BUTTON
    // ============================================================
    const btnSaveCitation = document.getElementById('btn-save-citation');

    if (btnSaveCitation) {
      btnSaveCitation.addEventListener('click', async () => {
        console.log('[Popup] Save Citation button clicked');
        this.updateStatus('Extracting citation...', 'processing');

        try {
          // Send message to content script to extract and save citation
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'SAVE_CITATION',
          });

          if (response && response.success) {
            this.updateStatus('Citation saved!', 'success');
            // Refresh citation count
            await this.updateCitationCount();
            // Refresh panel if expanded
            if (this.citationPanelExpanded && this.citationPanel) {
              await this.citationPanel.loadCitations();
            }
          } else {
            this.updateStatus('Failed to save citation', 'error');
          }
        } catch (error) {
          console.error('[Popup] Citation save failed:', error);
          this.updateStatus('Citation error: ' + error.message, 'error');
        }
      });
    }

    // ============================================================
    // CITATION: CITATION MANAGER BUTTON
    // ============================================================
    const btnCitationManager = document.getElementById('btn-citation-manager');

    if (btnCitationManager) {
      btnCitationManager.addEventListener('click', async () => {
        console.log('[Popup] Citation Manager button clicked');
        try {
          // Send direct message to open bibliography manager
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'OPEN_BIBLIOGRAPHY_MANAGER',
          });
          if (response?.success) {
            this.updateStatus('Opening Citation Library...', 'info');
            // Close popup after a brief delay
            setTimeout(() => window.close(), 300);
          } else {
            throw new Error(response?.error || 'Failed to open');
          }
        } catch (error) {
          console.error('[Popup] Error opening citation manager:', error);
          this.updateStatus('Failed to open Citation Library', 'error');
        }
      });
    }

    // ============================================================
    // CITATION: PROJECTS BUTTON
    // ============================================================
    const btnCitationProjects = document.getElementById('btn-citation-projects');

    if (btnCitationProjects) {
      btnCitationProjects.addEventListener('click', async () => {
        console.log('[Popup] Citation Projects button clicked');
        try {
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'OPEN_PROJECT_MANAGER',
          });
          if (response?.success) {
            this.updateStatus('Opening Projects...', 'info');
            setTimeout(() => window.close(), 300);
          } else {
            throw new Error(response?.error || 'Failed to open');
          }
        } catch (error) {
          console.error('[Popup] Error opening project manager:', error);
          this.updateStatus('Failed to open Projects', 'error');
        }
      });
    }

    // ============================================================
    // CITATION: EXPAND/COLLAPSE PANEL
    // ============================================================
    this.setupCitationPanel();

    // Voice selection
    const voiceSelect = document.getElementById('voice-select');
    voiceSelect.addEventListener('change', e => {
      this.settings.tts.voice = e.target.value;
      this.saveSettings();
      this.sendCommandToTab('setVoice', { voice: e.target.value });
    });

    // Rate slider
    const rateSlider = document.getElementById('rate-slider');
    const rateValue = document.getElementById('rate-value');
    rateSlider.value = this.settings?.tts?.rate || 1.0;
    rateValue.textContent = `${rateSlider.value}x`;
    rateSlider.addEventListener('input', e => {
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
    pitchSlider.addEventListener('input', e => {
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
    volumeSlider.addEventListener('input', e => {
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

    highlightEnabled.addEventListener('change', e => {
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
    highlightColor.addEventListener('change', e => {
      this.settings.tts.highlightColor = e.target.value;
      this.saveSettings();
      this.sendCommandToTab('setHighlightColor', { color: e.target.value });
    });

    // Highlight Opacity
    const highlightOpacity = document.getElementById('highlight-opacity');
    const opacityValue = document.getElementById('opacity-value');
    highlightOpacity.value = this.settings?.tts?.highlightOpacity || 0.7;
    opacityValue.textContent = `${Math.round(highlightOpacity.value * 100)}%`;
    highlightOpacity.addEventListener('input', e => {
      const opacity = parseFloat(e.target.value);
      opacityValue.textContent = `${Math.round(opacity * 100)}%`;
      this.settings.tts.highlightOpacity = opacity;
      this.saveSettings();
      this.sendCommandToTab('setHighlightOpacity', { opacity });
    });

    // Word-by-Word Highlighting toggle
    const wordByWordEnabled = document.getElementById('word-by-word-enabled');
    wordByWordEnabled.checked = this.settings?.tts?.wordByWordEnabled || false;
    wordByWordEnabled.addEventListener('change', e => {
      this.settings.tts.wordByWordEnabled = e.target.checked;
      this.saveSettings();
      this.sendCommandToTab('setWordByWord', { enabled: e.target.checked });
    });

    // ============================================================
    // SPRINT 3 FEATURE: TEXT CUSTOMIZATION
    // ============================================================
    this.setupTextCustomization();

    // ============================================================
    // SPRINT 3 FEATURE: READING GUIDE
    // ============================================================
    this.setupReadingGuide();

    // ============================================================
    // SPRINT 3 FEATURE: FOCUS MODE
    // ============================================================
    this.setupFocusMode();

    // ============================================================
    // SPRINT 6 FEATURE: SCREEN COLOR OVERLAY
    // ============================================================
    this.setupScreenOverlay();

    // ============================================================
    // NEURODIVERGENT PROFILE FEATURE: REDUCED MOTION
    // ============================================================
    this.setupReducedMotion();

    // ============================================================
    // NEURODIVERGENT PROFILE FEATURE: AUTO-PLAY BLOCKING
    // ============================================================
    this.setupMediaControl();

    // ============================================================
    // SPRINT 4 FEATURE: CANVAS INTEGRATION
    // ============================================================
    this.setupCanvasIntegration();

    // ============================================================
    // SPRINT 5 FEATURE: SPEECH-TO-TEXT (STT)
    // ============================================================
    this.setupSTT();

    // ============================================================
    // PHASE 2 FEATURE 3: READING MODE
    // ============================================================
    this.setupReadingMode();

    // ============================================================
    // SPRINT 9 FEATURE: DYSLEXIA-OPTIMIZED READING MODE
    // ============================================================
    this.setupDyslexiaMode();

    // ============================================================
    // PHASE 2.2 FEATURE: ANNOTATIONS & STICKY NOTES
    // ============================================================
    this.setupAnnotations();

    // Settings link
    document.getElementById('link-settings').addEventListener('click', e => {
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

    // Help button (WCAG 2.2 SC 3.2.6 - Consistent Help)
    document.getElementById('btn-help').addEventListener('click', () => {
      // Open user guide in new tab
      chrome.tabs.create({
        url: 'https://github.com/MarJone/AssisT#readme',
      });
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
      highlightOpacity: 0.7,
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
              <div class="feature-section-header">
                <span>📖 Reading Features</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-ocr" checked>
                  <span>OCR</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-highlight-menu" checked>
                  <span>Highlight Menu</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-dictionary" checked>
                  <span>Dictionary</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-highlighting" checked>
                  <span>Text Highlighting</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-speed-presets" checked>
                  <span>Speed Presets</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-text-customization" checked>
                  <span>Text Customization</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-reading-guide" checked>
                  <span>Reading Guide</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-dyslexia-mode" checked>
                  <span>Dyslexia Reading Mode</span>
                </label>
              </div>

              <div class="feature-section-header">
                <span>🎯 Focus & Visual</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-focus-mode" checked>
                  <span>Focus Mode</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-screen-overlay" checked>
                  <span>Screen Color Overlay</span>
                </label>
              </div>

              <div class="feature-section-header">
                <span>✍️ Writing Features</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-stt">
                  <span>Speech-to-Text</span>
                  <span class="feature-badge experimental">Experimental</span>
                </label>
              </div>

              <div class="feature-section-header">
                <span>📝 Annotations & Notes</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-annotations" checked>
                  <span>Annotations & Sticky Notes</span>
                </label>
              </div>

              <div class="feature-item" style="margin-left: 24px; margin-top: 8px;">
                <label class="feature-label" style="font-size: 13px; color: #666;">
                  <span>📦 Storage Mode:</span>
                </label>
                <select id="annotations-storage-mode" class="storage-mode-select" style="margin-top: 6px; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; max-width: 300px;">
                  <option value="local">Chrome Local Storage (Default)</option>
                  <option value="indexeddb">IndexedDB (For large collections)</option>
                </select>
                <p style="margin: 6px 0 0 0; font-size: 12px; color: #888; line-height: 1.4;">
                  Local storage is faster but limited. IndexedDB supports unlimited annotations.
                </p>
              </div>

              <!-- Annotation Settings Section -->
              <div class="feature-item" style="margin-left: 24px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
                <label class="feature-label" style="font-size: 13px; color: #666; font-weight: 500;">
                  <span>⚙️ Annotation Settings:</span>
                </label>

                <!-- Default Color -->
                <div style="margin-top: 10px;">
                  <label for="annotations-default-color" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Default Color for New Notes
                  </label>
                  <select id="annotations-default-color" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; max-width: 300px;">
                    <option value="yellow">💛 Yellow (Recommended)</option>
                    <option value="blue">💙 Blue</option>
                    <option value="green">💚 Green</option>
                    <option value="pink">💗 Pink</option>
                    <option value="purple">💜 Purple</option>
                  </select>
                </div>

                <!-- Default Note Size -->
                <div style="margin-top: 10px;">
                  <label for="annotations-default-size" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Default Note Size
                  </label>
                  <select id="annotations-default-size" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; max-width: 300px;">
                    <option value="small">📦 Small (150x100px)</option>
                    <option value="medium">📦 Medium (200x200px)</option>
                    <option value="large">📦 Large (300x250px)</option>
                  </select>
                </div>

                <!-- Auto-save Toggle -->
                <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="annotations-auto-save" checked style="cursor: pointer;">
                  <label for="annotations-auto-save" style="font-size: 12px; color: #555; cursor: pointer;">
                    Auto-save annotations (saves immediately on changes)
                  </label>
                </div>

                <!-- Show Badge Toggle -->
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="annotations-show-badge" checked style="cursor: pointer;">
                  <label for="annotations-show-badge" style="font-size: 12px; color: #555; cursor: pointer;">
                    Show annotation count badge
                  </label>
                </div>

                <!-- Sidebar Auto-open Toggle -->
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="annotations-sidebar-auto-open" checked style="cursor: pointer;">
                  <label for="annotations-sidebar-auto-open" style="font-size: 12px; color: #555; cursor: pointer;">
                    Auto-open sidebar on annotation click
                  </label>
                </div>
              </div>

              <div class="feature-section-header">
                <span>🌐 Translation</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-translation" checked>
                  <span>Translation Features</span>
                </label>
              </div>

              <!-- Translation Settings Section -->
              <div class="feature-item" style="margin-left: 24px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
                <label class="feature-label" style="font-size: 13px; color: #666; font-weight: 500;">
                  <span>⚙️ Translation Settings:</span>
                </label>

                <!-- Engine Selector -->
                <div style="margin-top: 10px;">
                  <label style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Translation Engine
                  </label>
                  <div style="display: flex; gap: 16px; margin-top: 8px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                      <input type="radio" name="translation-engine" id="translation-engine-libre" value="libre" checked style="margin-right: 6px;">
                      <span style="font-size: 13px;">LibreTranslate (Free)</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                      <input type="radio" name="translation-engine" id="translation-engine-google" value="google" style="margin-right: 6px;">
                      <span style="font-size: 13px;">Google Translate</span>
                    </label>
                  </div>
                  <p style="margin: 4px 0 0 0; font-size: 11px; color: #888;">
                    LibreTranslate is free but may have rate limits. Google requires an API key.
                  </p>
                </div>

                <!-- Google API Key Input -->
                <div id="google-api-key-container" style="margin-top: 12px; display: none;">
                  <label for="translation-google-api-key" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Google Translate API Key
                  </label>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="password" id="translation-google-api-key" placeholder="Enter API key (AIza...)" style="flex: 1; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; font-family: monospace;">
                    <button id="translation-toggle-api-key" type="button" style="padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 12px;">
                      Show
                    </button>
                    <span id="translation-api-key-status" style="font-size: 16px; min-width: 20px; text-align: center;"></span>
                  </div>
                  <p style="margin: 4px 0 0 0; font-size: 11px; color: #888;">
                    Get your API key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color: #2196F3;">Google Cloud Console</a>
                  </p>
                </div>

                <!-- Default Target Language -->
                <div style="margin-top: 12px;">
                  <label for="translation-default-language" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Default Target Language
                  </label>
                  <select id="translation-default-language" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; max-width: 300px;">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="nl">Dutch</option>
                    <option value="pl">Polish</option>
                    <option value="ru">Russian</option>
                    <option value="zh">Chinese</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="ar">Arabic</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>

                <!-- Cache Toggle -->
                <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="translation-cache-enabled" checked style="cursor: pointer;">
                  <label for="translation-cache-enabled" style="font-size: 12px; color: #555; cursor: pointer;">
                    Enable translation cache (faster, reduces API calls)
                  </label>
                </div>

                <!-- Cache Duration Slider -->
                <div id="translation-cache-settings" style="margin-top: 12px;">
                  <label for="translation-cache-duration" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Cache Duration: <span id="translation-cache-duration-label">7 days</span>
                  </label>
                  <input type="range" id="translation-cache-duration" min="1" max="30" value="7" step="1" style="width: 100%; max-width: 300px;">
                </div>

                <!-- Clear Cache Button -->
                <div style="margin-top: 12px;">
                  <button id="translation-clear-cache" type="button" style="padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 12px; color: #666;">
                    Clear Cache (<span id="translation-cache-count">0</span> items)
                  </button>
                </div>
              </div>

              <div class="feature-section-header">
                <span>🎓 LMS Integration</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-canvas-integration">
                  <span>Canvas LMS</span>
                  <span class="feature-badge experimental">Experimental</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-moodle-integration">
                  <span>Moodle LMS</span>
                  <span class="feature-badge experimental">Experimental</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-google-classroom-integration">
                  <span>Google Classroom</span>
                  <span class="feature-badge experimental">Experimental</span>
                </label>
              </div>

              <div class="feature-note">
                <p><strong>Note:</strong> Core TTS controls (voice, speed, pitch, volume) are always visible and cannot be hidden.</p>
              </div>
            </div>
          </div>

          <!-- Keyboard Tab -->
          <div id="tab-keyboard" class="tab-content">
            <h3>Keyboard Shortcuts</h3>
            <p class="tab-description">Customize keyboard shortcuts for extension features</p>

            <div class="shortcuts-warning" style="margin-bottom: 16px; padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
              <strong style="color: #856404;">⚠️ Important:</strong>
              <span style="color: #856404; font-size: 13px;">Shortcuts must include a modifier key (Ctrl, Alt, or Shift). Chrome reserved shortcuts cannot be used.</span>
            </div>

            <div class="shortcuts-table-container">
              <table class="shortcuts-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="border-bottom: 2px solid #e0e0e0;">
                    <th style="text-align: left; padding: 12px 8px; font-size: 14px; color: #666;">Feature</th>
                    <th style="text-align: left; padding: 12px 8px; font-size: 14px; color: #666;">Shortcut</th>
                    <th style="text-align: center; padding: 12px 8px; font-size: 14px; color: #666;">Actions</th>
                  </tr>
                </thead>
                <tbody id="shortcuts-table-body">
                  <!-- Shortcuts will be populated dynamically -->
                </tbody>
              </table>
            </div>

            <div class="shortcuts-actions" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px;">
              <button id="btn-reset-shortcuts" class="modal-btn modal-btn-secondary" style="padding: 8px 16px; font-size: 14px;">
                Reset to Defaults
              </button>
            </div>

            <!-- Recording Mode Overlay (hidden by default) -->
            <div id="shortcut-recording-overlay" class="recording-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 10000; align-items: center; justify-content: center;">
              <div class="recording-box" style="background: white; padding: 32px; border-radius: 12px; text-align: center; max-width: 400px;">
                <h3 style="margin: 0 0 16px 0; color: #333;">Recording Shortcut</h3>
                <p style="margin: 0 0 20px 0; color: #666;">Press your desired key combination...</p>
                <div id="recording-display" style="padding: 16px; background: #f5f5f5; border-radius: 8px; font-size: 20px; font-weight: bold; color: #333; margin-bottom: 16px; min-height: 60px; display: flex; align-items: center; justify-content: center;">
                  Waiting...
                </div>
                <div id="recording-error" style="color: #dc3545; font-size: 13px; margin-bottom: 16px; min-height: 20px;">
                  <!-- Error messages appear here -->
                </div>
                <div style="display: flex; gap: 12px; justify-content: center;">
                  <button id="btn-recording-cancel" class="modal-btn modal-btn-secondary">Cancel</button>
                  <button id="btn-recording-save" class="modal-btn modal-btn-primary" disabled>Save</button>
                </div>
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
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  loadModalSettings() {
    // Load UI visibility settings
    const visibility = this.settings.ui_visibility || {};

    // Helper function to load checkbox state
    const loadCheckbox = (id, visibilityKey, defaultValue = true) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        // Use explicit value if set, otherwise use defaultValue
        checkbox.checked =
          visibility[visibilityKey] !== undefined ? visibility[visibilityKey] : defaultValue;
      }
    };

    // Load all feature visibility checkboxes (most default to true)
    loadCheckbox('show-ocr', 'show_ocr'); // OCR
    loadCheckbox('show-highlight-menu', 'show_highlight_menu'); // Highlight Menu
    loadCheckbox('show-dictionary', 'show_dictionary'); // Dictionary
    loadCheckbox('show-highlighting', 'show_highlighting');
    loadCheckbox('show-speed-presets', 'show_speed_presets');
    loadCheckbox('show-text-customization', 'show_text_customization');
    loadCheckbox('show-reading-guide', 'show_reading_guide');
    loadCheckbox('show-focus-mode', 'show_focus_mode');
    loadCheckbox('show-stt', 'show_stt', false); // EXPERIMENTAL - hidden by default
    loadCheckbox('show-screen-overlay', 'show_screen_overlay');
    loadCheckbox('show-canvas-integration', 'show_canvas_integration', false); // EXPERIMENTAL - hidden by default
    loadCheckbox('show-moodle-integration', 'show_moodle_integration', false); // EXPERIMENTAL - hidden by default
    loadCheckbox('show-google-classroom-integration', 'show_google_classroom_integration', false); // EXPERIMENTAL - hidden by default
    loadCheckbox('show-dyslexia-mode', 'show_dyslexia_mode');
    loadCheckbox('show-annotations', 'show_annotations'); // Annotations

    // Load annotations storage mode
    const storageMode = document.getElementById('annotations-storage-mode');
    if (storageMode) {
      const currentMode = this.settings.annotations?.storageMode || 'local';
      storageMode.value = currentMode;

      // Attach migration event listener (must happen after modal is created)
      console.warn('[Popup] Attaching storage mode change listener. Current mode:', currentMode);

      // Track the last committed mode
      let committedMode = currentMode;

      storageMode.addEventListener('change', async e => {
        console.warn('[Popup] ⚡ CHANGE EVENT FIRED');
        const newMode = e.target.value;

        console.warn('[Popup] Storage mode change detected:', {
          committedMode,
          newMode,
          willMigrate: newMode !== committedMode,
        });

        // If mode actually changed, trigger migration
        if (newMode !== committedMode) {
          // Revert dropdown to old value while migration runs
          e.target.value = committedMode;

          // Run migration
          await this.handleStorageMigration(committedMode, newMode);

          // Migration updates settings, so update our committed tracking
          committedMode = newMode;

          // Update dropdown to new value after successful migration
          e.target.value = newMode;
        }
      });
    }

    // ============================================================
    // LOAD ANNOTATION SETTINGS
    // ============================================================

    // Initialize annotation settings if they don't exist
    if (!this.settings.annotations) {
      this.settings.annotations = {
        storageMode: 'local',
        defaultColor: 'yellow',
        defaultNoteSize: 'medium',
        autoSave: true,
        showBadge: true,
        sidebarAutoOpen: true,
      };
    }

    // Load Default Color setting
    const defaultColorSelect = document.getElementById('annotations-default-color');
    if (defaultColorSelect) {
      defaultColorSelect.value = this.settings.annotations.defaultColor || 'yellow';
      defaultColorSelect.addEventListener('change', e => {
        this.settings.annotations.defaultColor = e.target.value;
        this.saveSettings();
        console.log('[Popup] Annotation default color changed to:', e.target.value);
      });
    }

    // Load Default Note Size setting
    const defaultSizeSelect = document.getElementById('annotations-default-size');
    if (defaultSizeSelect) {
      defaultSizeSelect.value = this.settings.annotations.defaultNoteSize || 'medium';
      defaultSizeSelect.addEventListener('change', e => {
        this.settings.annotations.defaultNoteSize = e.target.value;
        this.saveSettings();
        console.log('[Popup] Annotation default size changed to:', e.target.value);
      });
    }

    // Load Auto-save Toggle
    const autoSaveToggle = document.getElementById('annotations-auto-save');
    if (autoSaveToggle) {
      autoSaveToggle.checked = this.settings.annotations.autoSave !== false;
      autoSaveToggle.addEventListener('change', e => {
        this.settings.annotations.autoSave = e.target.checked;
        this.saveSettings();
        console.log('[Popup] Annotation auto-save:', e.target.checked);
      });
    }

    // Load Show Badge Toggle
    const showBadgeToggle = document.getElementById('annotations-show-badge');
    if (showBadgeToggle) {
      showBadgeToggle.checked = this.settings.annotations.showBadge !== false;
      showBadgeToggle.addEventListener('change', e => {
        this.settings.annotations.showBadge = e.target.checked;
        this.saveSettings();
        console.log('[Popup] Annotation show badge:', e.target.checked);
      });
    }

    // Load Sidebar Auto-open Toggle
    const sidebarAutoOpenToggle = document.getElementById('annotations-sidebar-auto-open');
    if (sidebarAutoOpenToggle) {
      sidebarAutoOpenToggle.checked = this.settings.annotations.sidebarAutoOpen !== false;
      sidebarAutoOpenToggle.addEventListener('change', e => {
        this.settings.annotations.sidebarAutoOpen = e.target.checked;
        this.saveSettings();
        console.log('[Popup] Annotation sidebar auto-open:', e.target.checked);
      });
    }

    // ============================================================
    // LOAD TRANSLATION SETTINGS
    // ============================================================

    // Load translation visibility toggle
    loadCheckbox('show-translation', 'show_translation');

    // Initialize translation settings if they don't exist
    if (!this.settings.translationSettings) {
      this.settings.translationSettings = {
        preferredEngine: 'libre',
        googleApiKey: '',
        cacheEnabled: true,
        cacheDuration: 7,
        defaultTargetLanguage: 'en',
      };
    }

    // Load engine selection
    const engineLibre = document.getElementById('translation-engine-libre');
    const engineGoogle = document.getElementById('translation-engine-google');
    const googleApiKeyContainer = document.getElementById('google-api-key-container');

    if (engineLibre && engineGoogle) {
      const preferredEngine = this.settings.translationSettings.preferredEngine || 'libre';
      if (preferredEngine === 'libre') {
        engineLibre.checked = true;
      } else {
        engineGoogle.checked = true;
      }

      // Show/hide Google API key input based on selection
      if (googleApiKeyContainer) {
        googleApiKeyContainer.style.display = preferredEngine === 'google' ? 'block' : 'none';
      }

      // Add event listeners for engine selection
      engineLibre.addEventListener('change', () => {
        if (googleApiKeyContainer) {
          googleApiKeyContainer.style.display = 'none';
        }
        this.settings.translationSettings.preferredEngine = 'libre';
        this.saveSettings();
        console.log('[Popup] Translation engine changed to: LibreTranslate');
      });

      engineGoogle.addEventListener('change', () => {
        if (googleApiKeyContainer) {
          googleApiKeyContainer.style.display = 'block';
        }
        this.settings.translationSettings.preferredEngine = 'google';
        this.saveSettings();
        console.log('[Popup] Translation engine changed to: Google Translate');
      });
    }

    // Load Google API key
    const googleApiKeyInput = document.getElementById('translation-google-api-key');
    const googleApiKeyToggle = document.getElementById('translation-toggle-api-key');
    const googleApiKeyStatus = document.getElementById('translation-api-key-status');

    if (googleApiKeyInput) {
      googleApiKeyInput.value = this.settings.translationSettings.googleApiKey || '';

      // Validate API key format
      const validateApiKey = key => {
        const apiKeyPattern = /^AIza[A-Za-z0-9_-]{35}$/;
        return apiKeyPattern.test(key);
      };

      // Update status indicator
      const updateApiKeyStatus = key => {
        if (!key) {
          googleApiKeyStatus.textContent = '';
        } else if (validateApiKey(key)) {
          googleApiKeyStatus.textContent = '✓';
          googleApiKeyStatus.style.color = '#4caf50';
        } else {
          googleApiKeyStatus.textContent = '✗';
          googleApiKeyStatus.style.color = '#f44336';
        }
      };

      // Initial status
      updateApiKeyStatus(googleApiKeyInput.value);

      // Add event listener for API key input
      googleApiKeyInput.addEventListener('input', e => {
        this.settings.translationSettings.googleApiKey = e.target.value;
        updateApiKeyStatus(e.target.value);
        this.saveSettings();
        console.log('[Popup] Translation Google API key updated');
      });

      // Toggle password visibility
      if (googleApiKeyToggle) {
        googleApiKeyToggle.addEventListener('click', () => {
          if (googleApiKeyInput.type === 'password') {
            googleApiKeyInput.type = 'text';
            googleApiKeyToggle.textContent = 'Hide';
          } else {
            googleApiKeyInput.type = 'password';
            googleApiKeyToggle.textContent = 'Show';
          }
        });
      }
    }

    // Load default target language
    const defaultLanguageSelect = document.getElementById('translation-default-language');
    if (defaultLanguageSelect) {
      defaultLanguageSelect.value = this.settings.translationSettings.defaultTargetLanguage || 'en';

      defaultLanguageSelect.addEventListener('change', e => {
        this.settings.translationSettings.defaultTargetLanguage = e.target.value;
        this.saveSettings();
        console.log('[Popup] Translation default target language:', e.target.value);
      });
    }

    // Load cache enabled toggle
    const cacheEnabledToggle = document.getElementById('translation-cache-enabled');
    const cacheSettingsDiv = document.getElementById('translation-cache-settings');

    if (cacheEnabledToggle) {
      cacheEnabledToggle.checked = this.settings.translationSettings.cacheEnabled !== false;

      // Show/hide cache settings based on toggle
      if (cacheSettingsDiv) {
        cacheSettingsDiv.style.display = cacheEnabledToggle.checked ? 'block' : 'none';
      }

      cacheEnabledToggle.addEventListener('change', e => {
        this.settings.translationSettings.cacheEnabled = e.target.checked;
        if (cacheSettingsDiv) {
          cacheSettingsDiv.style.display = e.target.checked ? 'block' : 'none';
        }
        this.saveSettings();
        console.log('[Popup] Translation cache enabled:', e.target.checked);
      });
    }

    // Load cache duration slider
    const cacheDurationSlider = document.getElementById('translation-cache-duration');
    const cacheDurationLabel = document.getElementById('translation-cache-duration-label');

    if (cacheDurationSlider && cacheDurationLabel) {
      const duration = this.settings.translationSettings.cacheDuration || 7;
      cacheDurationSlider.value = duration;
      cacheDurationLabel.textContent = `${duration} day${duration === 1 ? '' : 's'}`;

      cacheDurationSlider.addEventListener('input', e => {
        const days = parseInt(e.target.value);
        cacheDurationLabel.textContent = `${days} day${days === 1 ? '' : 's'}`;
        this.settings.translationSettings.cacheDuration = days;
        this.saveSettings();
        console.log('[Popup] Translation cache duration:', days);
      });
    }

    // Load cache count and clear cache button
    const clearCacheButton = document.getElementById('translation-clear-cache');
    const cacheCountSpan = document.getElementById('translation-cache-count');

    if (clearCacheButton && cacheCountSpan) {
      // Get cache count from storage
      chrome.storage.local.get('translationCache', result => {
        const cacheCount = result.translationCache
          ? Object.keys(result.translationCache).length
          : 0;
        cacheCountSpan.textContent = cacheCount;
      });

      clearCacheButton.addEventListener('click', async () => {
        await chrome.storage.local.set({ translationCache: {} });
        cacheCountSpan.textContent = '0';
        console.log('[Popup] Translation cache cleared');
        alert('Translation cache cleared successfully!');
      });
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

    // Load keyboard shortcuts
    this.loadKeyboardShortcuts();
  }

  async loadKeyboardShortcuts() {
    const shortcuts = await loadShortcuts();
    const tbody = document.getElementById('shortcuts-table-body');

    if (!tbody) {
      return;
    }

    // Clear existing rows
    tbody.innerHTML = '';

    // Create a row for each shortcut
    for (const [key, shortcut] of Object.entries(shortcuts)) {
      const row = document.createElement('tr');
      row.style.cssText = 'border-bottom: 1px solid #e0e0e0;';

      row.innerHTML = `
        <td style="padding: 12px 8px; font-size: 14px;">${SHORTCUT_LABELS[key] || key}</td>
        <td style="padding: 12px 8px;">
          <span class="shortcut-display" data-key="${key}" style="
            display: inline-block;
            padding: 6px 12px;
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
            font-size: 13px;
            font-weight: 600;
            color: #333;
          ">${shortcut}</span>
        </td>
        <td style="padding: 12px 8px; text-align: center;">
          <button class="btn-edit-shortcut" data-key="${key}" style="
            padding: 6px 12px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
          ">Edit</button>
        </td>
      `;

      tbody.appendChild(row);
    }

    // Add event listeners to edit buttons
    document.querySelectorAll('.btn-edit-shortcut').forEach(btn => {
      btn.addEventListener('click', e => {
        const key = e.target.getAttribute('data-key');
        this.startShortcutRecording(key, shortcuts);
      });
    });

    // Reset shortcuts button
    const resetBtn = document.getElementById('btn-reset-shortcuts');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        if (confirm('Reset all keyboard shortcuts to defaults?')) {
          await resetShortcuts();
          this.loadKeyboardShortcuts();
          this.updateStatus('Shortcuts reset to defaults');
        }
      };
    }
  }

  startShortcutRecording(featureKey, currentShortcuts) {
    const overlay = document.getElementById('shortcut-recording-overlay');
    const display = document.getElementById('recording-display');
    const errorDiv = document.getElementById('recording-error');
    const saveBtn = document.getElementById('btn-recording-save');
    const cancelBtn = document.getElementById('btn-recording-cancel');

    if (!overlay) {
      return;
    }

    // Show overlay
    overlay.style.display = 'flex';

    // Reset state
    display.textContent = 'Waiting...';
    errorDiv.textContent = '';
    saveBtn.disabled = true;

    let recordedShortcut = null;
    let isValid = false;

    // Keyboard event handler
    const handleKeyPress = e => {
      e.preventDefault();
      e.stopPropagation();

      // Convert event to shortcut string
      recordedShortcut = eventToShortcut(e);
      display.textContent = recordedShortcut;

      // Validate shortcut
      const validation = validateShortcut(recordedShortcut, currentShortcuts, featureKey);

      if (validation.valid) {
        errorDiv.textContent = '';
        errorDiv.style.color = '#28a745';
        errorDiv.textContent = '✓ Valid shortcut';
        saveBtn.disabled = false;
        isValid = true;
      } else {
        errorDiv.style.color = '#dc3545';
        errorDiv.textContent = validation.error;
        saveBtn.disabled = true;
        isValid = false;
      }
    };

    // Add keyboard listener
    document.addEventListener('keydown', handleKeyPress);

    // Cancel button
    const cancelHandler = () => {
      document.removeEventListener('keydown', handleKeyPress);
      overlay.style.display = 'none';
    };
    cancelBtn.onclick = cancelHandler;

    // Save button
    saveBtn.onclick = async () => {
      if (isValid && recordedShortcut) {
        // Update shortcuts
        currentShortcuts[featureKey] = recordedShortcut;
        await saveShortcuts(currentShortcuts);

        // Update display
        const display = document.querySelector(`.shortcut-display[data-key="${featureKey}"]`);
        if (display) {
          display.textContent = recordedShortcut;
        }

        // Close overlay
        document.removeEventListener('keydown', handleKeyPress);
        overlay.style.display = 'none';

        this.updateStatus(`Shortcut updated: ${SHORTCUT_LABELS[featureKey]}`);
      }
    };

    // Close on escape (but not record it)
    const escapeHandler = e => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        cancelHandler();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
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

    // Helper function to save checkbox state
    const saveCheckbox = (id, visibilityKey) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        this.settings.ui_visibility[visibilityKey] = checkbox.checked;
      }
    };

    // Save all feature visibility settings
    saveCheckbox('show-ocr', 'show_ocr'); // OCR
    saveCheckbox('show-highlight-menu', 'show_highlight_menu'); // Highlight Menu
    saveCheckbox('show-dictionary', 'show_dictionary'); // Dictionary
    saveCheckbox('show-highlighting', 'show_highlighting');
    saveCheckbox('show-speed-presets', 'show_speed_presets');
    saveCheckbox('show-text-customization', 'show_text_customization');
    saveCheckbox('show-reading-guide', 'show_reading_guide');
    saveCheckbox('show-focus-mode', 'show_focus_mode');
    saveCheckbox('show-stt', 'show_stt');
    saveCheckbox('show-screen-overlay', 'show_screen_overlay');
    saveCheckbox('show-canvas-integration', 'show_canvas_integration');
    saveCheckbox('show-moodle-integration', 'show_moodle_integration');
    saveCheckbox('show-google-classroom-integration', 'show_google_classroom_integration');
    saveCheckbox('show-dyslexia-mode', 'show_dyslexia_mode');
    saveCheckbox('show-annotations', 'show_annotations'); // Annotations
    saveCheckbox('show-translation', 'show_translation'); // Translation

    // Save annotations storage mode
    const storageMode = document.getElementById('annotations-storage-mode');
    if (storageMode) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.storageMode = storageMode.value;
    }

    // Save annotation settings
    const defaultColorSelect = document.getElementById('annotations-default-color');
    if (defaultColorSelect) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.defaultColor = defaultColorSelect.value;
    }

    const defaultSizeSelect = document.getElementById('annotations-default-size');
    if (defaultSizeSelect) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.defaultNoteSize = defaultSizeSelect.value;
    }

    const autoSaveToggle = document.getElementById('annotations-auto-save');
    if (autoSaveToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.autoSave = autoSaveToggle.checked;
    }

    const showBadgeToggle = document.getElementById('annotations-show-badge');
    if (showBadgeToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.showBadge = showBadgeToggle.checked;
    }

    const sidebarAutoOpenToggle = document.getElementById('annotations-sidebar-auto-open');
    if (sidebarAutoOpenToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.sidebarAutoOpen = sidebarAutoOpenToggle.checked;
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
      appearance: this.settings.appearance,
    });

    // Check if any visibility changed
    const visibilityChanged =
      Object.keys(oldVisibility).some(
        key => oldVisibility[key] !== this.settings.ui_visibility[key]
      ) ||
      Object.keys(this.settings.ui_visibility).some(
        key => oldVisibility[key] !== this.settings.ui_visibility[key]
      );

    // Reload popup if visibility changed
    if (visibilityChanged) {
      console.log('[Popup] Visibility changed, reloading...');
      setTimeout(() => window.location.reload(), 300);
    }
  }

  async loadVoices() {
    try {
      const voices = speechSynthesis.getVoices();

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
    const preferredVoice =
      voices.find(
        v => v.name.includes('Google') && v.name.includes('UK') && v.name.includes('Female')
      ) ||
      voices.find(v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female')) ||
      voices.find(v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('female'));

    // Set default voice if not already set OR if set to 'default'
    if (preferredVoice && (!this.settings?.tts?.voice || this.settings.tts.voice === 'default')) {
      this.settings.tts.voice = preferredVoice.name;
      this.saveSettings();
    }

    // Group voices by language
    const grouped = voices.reduce((acc, voice) => {
      const lang = voice.lang.split('-')[0];
      if (!acc[lang]) {
        acc[lang] = [];
      }
      acc[lang].push(voice);
      return acc;
    }, {});

    // Add voices to select
    Object.keys(grouped)
      .sort()
      .forEach(lang => {
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
    if (
      !this.currentTab.url ||
      this.currentTab.url.startsWith('chrome://') ||
      this.currentTab.url.startsWith('chrome-extension://') ||
      this.currentTab.url.startsWith('edge://') ||
      this.currentTab.url.startsWith('about:')
    ) {
      console.warn('[Popup] Cannot access this page type');
      this.updateStatus('Cannot access browser system pages', 'error');
      return;
    }

    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: MESSAGE_TYPES.TTS_COMMAND,
        data: { command, ...data },
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
    // UI updates can be added here as needed
  }

  updateStatus(message, type = '') {
    const statusIndicator = document.getElementById('status-indicator');
    statusIndicator.textContent = message;
    statusIndicator.className = 'status-indicator ' + type;
  }

  // ============================================================
  // SPRINT 3 FEATURE: TEXT CUSTOMIZATION
  // ============================================================
  setupTextCustomization() {
    // Initialize textCustomization settings if they don't exist
    if (!this.settings.textCustomization) {
      this.settings.textCustomization = {
        enabled: false,
        fontFamily: 'lexend',
        lineSpacing: 1.5,
        letterSpacing: 0.12,
        wordSpacing: 0.16,
        paragraphSpacing: 2.0,
      };
    }

    const textCustomizationEnabled = document.getElementById('text-customization-enabled');
    const textCustomizationDescription = document.getElementById('text-customization-description');
    const textCustomizationOptions = document.getElementById('text-customization-options');

    // Set initial state
    textCustomizationEnabled.checked = this.settings.textCustomization.enabled || false;

    // Show/hide description and options based on enabled state
    if (textCustomizationEnabled.checked) {
      textCustomizationDescription.classList.remove('hidden');
      textCustomizationOptions.classList.remove('hidden');
    } else {
      textCustomizationDescription.classList.add('hidden');
      textCustomizationOptions.classList.add('hidden');
    }

    // Toggle event
    textCustomizationEnabled.addEventListener('change', e => {
      this.settings.textCustomization.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        textCustomizationDescription.classList.remove('hidden');
        textCustomizationOptions.classList.remove('hidden');
      } else {
        textCustomizationDescription.classList.add('hidden');
        textCustomizationOptions.classList.add('hidden');
      }
    });

    // Font Family selector
    const fontFamilySelect = document.getElementById('text-font-family');
    fontFamilySelect.value = this.settings.textCustomization.fontFamily || 'lexend';
    fontFamilySelect.addEventListener('change', e => {
      this.settings.textCustomization.fontFamily = e.target.value;
      this.saveSettings();
    });

    // Line Spacing slider
    const lineSpacingSlider = document.getElementById('text-line-spacing');
    const lineSpacingValue = document.getElementById('text-line-spacing-value');
    lineSpacingSlider.value = this.settings.textCustomization.lineSpacing || 1.5;
    lineSpacingValue.textContent = lineSpacingSlider.value;
    lineSpacingSlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      lineSpacingValue.textContent = value;
      this.settings.textCustomization.lineSpacing = value;
      this.saveSettings();
    });

    // Letter Spacing slider (percentage to em conversion)
    const letterSpacingSlider = document.getElementById('text-letter-spacing');
    const letterSpacingValue = document.getElementById('text-letter-spacing-value');
    // Convert stored em value to percentage (0.12em = 12%)
    const letterSpacingPercent = Math.round(
      (this.settings.textCustomization.letterSpacing || 0.12) * 100
    );
    letterSpacingSlider.value = letterSpacingPercent;
    letterSpacingValue.textContent = letterSpacingPercent + '%';
    letterSpacingSlider.addEventListener('input', e => {
      const percent = parseInt(e.target.value);
      letterSpacingValue.textContent = percent + '%';
      // Convert percentage to em (12% = 0.12em)
      this.settings.textCustomization.letterSpacing = percent / 100;
      this.saveSettings();
    });

    // Word Spacing slider (percentage to em conversion)
    const wordSpacingSlider = document.getElementById('text-word-spacing');
    const wordSpacingValue = document.getElementById('text-word-spacing-value');
    // Convert stored em value to percentage (0.16em = 16%)
    const wordSpacingPercent = Math.round(
      (this.settings.textCustomization.wordSpacing || 0.16) * 100
    );
    wordSpacingSlider.value = wordSpacingPercent;
    wordSpacingValue.textContent = wordSpacingPercent + '%';
    wordSpacingSlider.addEventListener('input', e => {
      const percent = parseInt(e.target.value);
      wordSpacingValue.textContent = percent + '%';
      // Convert percentage to em (16% = 0.16em)
      this.settings.textCustomization.wordSpacing = percent / 100;
      this.saveSettings();
    });

    // Paragraph Spacing slider
    const paragraphSpacingSlider = document.getElementById('text-paragraph-spacing');
    const paragraphSpacingValue = document.getElementById('text-paragraph-spacing-value');
    paragraphSpacingSlider.value = this.settings.textCustomization.paragraphSpacing || 2.0;
    paragraphSpacingValue.textContent = paragraphSpacingSlider.value + 'em';
    paragraphSpacingSlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      paragraphSpacingValue.textContent = value + 'em';
      this.settings.textCustomization.paragraphSpacing = value;
      this.saveSettings();
    });

    console.log('[Popup] Text Customization initialized');
  }

  // ============================================================
  // SPRINT 3 FEATURE: READING GUIDE
  // ============================================================
  setupReadingGuide() {
    // Initialize readingGuide settings if they don't exist
    if (!this.settings.readingGuide) {
      this.settings.readingGuide = {
        enabled: false,
        lineColor: '#000000',
        lineThickness: 3,
        lineOpacity: 0.7,
      };
    }

    const readingGuideEnabled = document.getElementById('reading-guide-enabled');
    const readingGuideDescription = document.getElementById('reading-guide-description');
    const readingGuideOptions = document.getElementById('reading-guide-options');

    // Set initial state
    readingGuideEnabled.checked = this.settings.readingGuide.enabled || false;

    // Show/hide description and options based on enabled state
    if (readingGuideEnabled.checked) {
      readingGuideDescription.classList.remove('hidden');
      readingGuideOptions.classList.remove('hidden');
    } else {
      readingGuideDescription.classList.add('hidden');
      readingGuideOptions.classList.add('hidden');
    }

    // Toggle event
    readingGuideEnabled.addEventListener('change', e => {
      this.settings.readingGuide.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        readingGuideDescription.classList.remove('hidden');
        readingGuideOptions.classList.remove('hidden');
      } else {
        readingGuideDescription.classList.add('hidden');
        readingGuideOptions.classList.add('hidden');
      }
    });

    // Line Color selector
    const lineColorSelect = document.getElementById('reading-guide-color');
    lineColorSelect.value = this.settings.readingGuide.lineColor || '#000000';
    lineColorSelect.addEventListener('change', e => {
      this.settings.readingGuide.lineColor = e.target.value;
      this.saveSettings();
    });

    // Line Thickness slider
    const lineThicknessSlider = document.getElementById('reading-guide-thickness');
    const lineThicknessValue = document.getElementById('reading-guide-thickness-value');
    lineThicknessSlider.value = this.settings.readingGuide.lineThickness || 3;
    lineThicknessValue.textContent = lineThicknessSlider.value + 'px';
    lineThicknessSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      lineThicknessValue.textContent = value + 'px';
      this.settings.readingGuide.lineThickness = value;
      this.saveSettings();
    });

    // Line Opacity slider (displayed as percentage)
    const lineOpacitySlider = document.getElementById('reading-guide-opacity');
    const lineOpacityValue = document.getElementById('reading-guide-opacity-value');
    lineOpacitySlider.value = this.settings.readingGuide.lineOpacity || 0.7;
    lineOpacityValue.textContent = Math.round(lineOpacitySlider.value * 100) + '%';
    lineOpacitySlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      lineOpacityValue.textContent = Math.round(value * 100) + '%';
      this.settings.readingGuide.lineOpacity = value;
      this.saveSettings();
    });

    console.log('[Popup] Reading Guide initialized');
  }

  // ============================================================
  // SPRINT 3 FEATURE: FOCUS MODE
  // ============================================================
  setupFocusMode() {
    if (!this.settings.focusMode) {
      this.settings.focusMode = {
        enabled: false,
        boxWidth: 400,
        boxHeight: 100,
        overlayOpacity: 0.7,
      };
    }

    const focusModeEnabled = document.getElementById('focus-mode-enabled');
    const focusModeDescription = document.getElementById('focus-mode-description');
    const focusModeOptions = document.getElementById('focus-mode-options');

    focusModeEnabled.checked = this.settings.focusMode.enabled || false;

    if (focusModeEnabled.checked) {
      focusModeDescription.classList.remove('hidden');
      focusModeOptions.classList.remove('hidden');
    } else {
      focusModeDescription.classList.add('hidden');
      focusModeOptions.classList.add('hidden');
    }

    focusModeEnabled.addEventListener('change', e => {
      this.settings.focusMode.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        focusModeDescription.classList.remove('hidden');
        focusModeOptions.classList.remove('hidden');
      } else {
        focusModeDescription.classList.add('hidden');
        focusModeOptions.classList.add('hidden');
      }
    });

    const boxWidthSlider = document.getElementById('focus-mode-width');
    const boxWidthValue = document.getElementById('focus-mode-width-value');
    boxWidthSlider.value = this.settings.focusMode.boxWidth || 400;
    boxWidthValue.textContent = boxWidthSlider.value + 'px';
    boxWidthSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      boxWidthValue.textContent = value + 'px';
      this.settings.focusMode.boxWidth = value;
      this.saveSettings();
    });

    const boxHeightSlider = document.getElementById('focus-mode-height');
    const boxHeightValue = document.getElementById('focus-mode-height-value');
    boxHeightSlider.value = this.settings.focusMode.boxHeight || 100;
    boxHeightValue.textContent = boxHeightSlider.value + 'px';
    boxHeightSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      boxHeightValue.textContent = value + 'px';
      this.settings.focusMode.boxHeight = value;
      this.saveSettings();
    });

    const overlayOpacitySlider = document.getElementById('focus-mode-opacity');
    const overlayOpacityValue = document.getElementById('focus-mode-opacity-value');
    overlayOpacitySlider.value = this.settings.focusMode.overlayOpacity || 0.7;
    overlayOpacityValue.textContent = Math.round(overlayOpacitySlider.value * 100) + '%';
    overlayOpacitySlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      overlayOpacityValue.textContent = Math.round(value * 100) + '%';
      this.settings.focusMode.overlayOpacity = value;
      this.saveSettings();
    });

    console.log('[Popup] Focus Mode initialized');
  }

  // ============================================================
  // SPRINT 6 FEATURE: SCREEN COLOR OVERLAY
  // ============================================================
  setupScreenOverlay() {
    if (!this.settings.screenOverlay) {
      this.settings.screenOverlay = {
        enabled: false,
        color: '#FFE4C4',
        opacity: 0.3,
      };
    }

    const screenOverlayEnabled = document.getElementById('screen-overlay-enabled');
    const screenOverlayDescription = document.getElementById('screen-overlay-description');
    const screenOverlayOptions = document.getElementById('screen-overlay-options');

    screenOverlayEnabled.checked = this.settings.screenOverlay.enabled || false;

    if (screenOverlayEnabled.checked) {
      screenOverlayDescription.classList.remove('hidden');
      screenOverlayOptions.classList.remove('hidden');
    } else {
      screenOverlayDescription.classList.add('hidden');
      screenOverlayOptions.classList.add('hidden');
    }

    screenOverlayEnabled.addEventListener('change', e => {
      this.settings.screenOverlay.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        screenOverlayDescription.classList.remove('hidden');
        screenOverlayOptions.classList.remove('hidden');
      } else {
        screenOverlayDescription.classList.add('hidden');
        screenOverlayOptions.classList.add('hidden');
      }
    });

    const colorSelect = document.getElementById('screen-overlay-color');
    colorSelect.value = this.settings.screenOverlay.color || '#FFE4C4';
    colorSelect.addEventListener('change', e => {
      this.settings.screenOverlay.color = e.target.value;
      this.saveSettings();
    });

    const opacitySlider = document.getElementById('screen-overlay-opacity');
    const opacityValue = document.getElementById('screen-overlay-opacity-value');
    opacitySlider.value = this.settings.screenOverlay.opacity || 0.3;
    opacityValue.textContent = Math.round(opacitySlider.value * 100) + '%';
    opacitySlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      opacityValue.textContent = Math.round(value * 100) + '%';
      this.settings.screenOverlay.opacity = value;
      this.saveSettings();
    });

    console.log('[Popup] Screen Overlay initialized');
  }

  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: REDUCED MOTION
  // ============================================================
  setupReducedMotion() {
    if (!this.settings.reducedMotion) {
      this.settings.reducedMotion = {
        enabled: false,
        respectSystemPreference: true,
      };
    }

    const reducedMotionEnabled = document.getElementById('reduced-motion-enabled');
    const reducedMotionDescription = document.getElementById('reduced-motion-description');
    const reducedMotionOptions = document.getElementById('reduced-motion-options');

    reducedMotionEnabled.checked = this.settings.reducedMotion.enabled || false;

    if (reducedMotionEnabled.checked) {
      reducedMotionDescription.classList.remove('hidden');
      reducedMotionOptions.classList.remove('hidden');
    } else {
      reducedMotionDescription.classList.add('hidden');
      reducedMotionOptions.classList.add('hidden');
    }

    reducedMotionEnabled.addEventListener('change', e => {
      this.settings.reducedMotion.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        reducedMotionDescription.classList.remove('hidden');
        reducedMotionOptions.classList.remove('hidden');
      } else {
        reducedMotionDescription.classList.add('hidden');
        reducedMotionOptions.classList.add('hidden');
      }
    });

    const systemToggle = document.getElementById('reduced-motion-system');
    systemToggle.checked = this.settings.reducedMotion.respectSystemPreference !== false;
    systemToggle.addEventListener('change', e => {
      this.settings.reducedMotion.respectSystemPreference = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Reduced Motion initialized');
  }

  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: AUTO-PLAY BLOCKING
  // ============================================================
  setupMediaControl() {
    if (!this.settings.mediaControl) {
      this.settings.mediaControl = {
        enabled: false,
        blockVideos: true,
        blockAudios: true,
        showIndicator: true,
      };
    }

    const mediaControlEnabled = document.getElementById('media-control-enabled');
    const mediaControlDescription = document.getElementById('media-control-description');

    mediaControlEnabled.checked = this.settings.mediaControl.enabled || false;

    if (mediaControlEnabled.checked) {
      mediaControlDescription.classList.remove('hidden');
    } else {
      mediaControlDescription.classList.add('hidden');
    }

    mediaControlEnabled.addEventListener('change', e => {
      this.settings.mediaControl.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        mediaControlDescription.classList.remove('hidden');
      } else {
        mediaControlDescription.classList.add('hidden');
      }
    });

    console.log('[Popup] Media Control initialized');
  }

  // ============================================================
  // SPRINT 4 FEATURE: CANVAS INTEGRATION
  // ============================================================
  setupCanvasIntegration() {
    // Initialize canvasIntegration settings if they don't exist
    if (!this.settings.canvasIntegration) {
      this.settings.canvasIntegration = {
        enabled: false,
        assignmentReader: true,
        quizHelper: false,
        keyboardNav: false,
      };
    }

    const canvasIntegrationEnabled = document.getElementById('canvas-integration-enabled');
    const canvasIntegrationDescription = document.getElementById('canvas-integration-description');
    const canvasIntegrationOptions = document.getElementById('canvas-integration-options');

    // Set initial state
    canvasIntegrationEnabled.checked = this.settings.canvasIntegration.enabled || false;

    // Show/hide description and options based on enabled state
    if (canvasIntegrationEnabled.checked) {
      canvasIntegrationDescription.classList.remove('hidden');
      canvasIntegrationOptions.classList.remove('hidden');
    } else {
      canvasIntegrationDescription.classList.add('hidden');
      canvasIntegrationOptions.classList.add('hidden');
    }

    // Toggle event
    canvasIntegrationEnabled.addEventListener('change', e => {
      this.settings.canvasIntegration.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        canvasIntegrationDescription.classList.remove('hidden');
        canvasIntegrationOptions.classList.remove('hidden');
      } else {
        canvasIntegrationDescription.classList.add('hidden');
        canvasIntegrationOptions.classList.add('hidden');
      }
    });

    // Assignment Reader toggle
    const assignmentReaderCheckbox = document.getElementById('canvas-assignment-reader');
    assignmentReaderCheckbox.checked = this.settings.canvasIntegration.assignmentReader !== false;
    assignmentReaderCheckbox.addEventListener('change', e => {
      this.settings.canvasIntegration.assignmentReader = e.target.checked;
      this.saveSettings();
    });

    // ============================================================
    // SPRINT 7 FEATURE: CANVAS QUIZ HELPER
    // ============================================================

    // Initialize quizHelper settings if they don't exist
    if (!this.settings.canvasIntegration.quizHelper) {
      this.settings.canvasIntegration.quizHelper = {
        enabled: false,
        readAnswers: true,
        autoRead: false,
        highlightQuestion: true,
        highlightColor: '#4A90E2',
        keyboardNavigation: true,
      };
    }

    const quizHelperCheckbox = document.getElementById('canvas-quiz-helper');
    const quizHelperOptions = document.getElementById('quiz-helper-options');

    // Set initial state
    const quizHelperEnabled =
      typeof this.settings.canvasIntegration.quizHelper === 'object'
        ? this.settings.canvasIntegration.quizHelper.enabled
        : this.settings.canvasIntegration.quizHelper || false;

    quizHelperCheckbox.checked = quizHelperEnabled;

    // Show/hide options based on enabled state
    if (quizHelperEnabled) {
      quizHelperOptions.classList.remove('hidden');
    } else {
      quizHelperOptions.classList.add('hidden');
    }

    // Quiz Helper main toggle
    quizHelperCheckbox.addEventListener('change', e => {
      if (typeof this.settings.canvasIntegration.quizHelper !== 'object') {
        this.settings.canvasIntegration.quizHelper = {
          enabled: e.target.checked,
          readAnswers: true,
          autoRead: false,
          highlightQuestion: true,
          highlightColor: '#4A90E2',
          keyboardNavigation: true,
        };
      } else {
        this.settings.canvasIntegration.quizHelper.enabled = e.target.checked;
      }
      this.saveSettings();

      // Toggle options visibility
      if (e.target.checked) {
        quizHelperOptions.classList.remove('hidden');
      } else {
        quizHelperOptions.classList.add('hidden');
      }
    });

    // Quiz Helper sub-options
    const quizReadAnswers = document.getElementById('quiz-read-answers');
    quizReadAnswers.checked = this.settings.canvasIntegration.quizHelper.readAnswers !== false;
    quizReadAnswers.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.readAnswers = e.target.checked;
      this.saveSettings();
    });

    const quizAutoRead = document.getElementById('quiz-auto-read');
    quizAutoRead.checked = this.settings.canvasIntegration.quizHelper.autoRead || false;
    quizAutoRead.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.autoRead = e.target.checked;
      this.saveSettings();
    });

    const quizHighlightQuestion = document.getElementById('quiz-highlight-question');
    quizHighlightQuestion.checked =
      this.settings.canvasIntegration.quizHelper.highlightQuestion !== false;
    quizHighlightQuestion.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.highlightQuestion = e.target.checked;
      this.saveSettings();
    });

    const quizHighlightColor = document.getElementById('quiz-highlight-color');
    quizHighlightColor.value =
      this.settings.canvasIntegration.quizHelper.highlightColor || '#4A90E2';
    quizHighlightColor.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.highlightColor = e.target.value;
      this.saveSettings();
    });

    const quizKeyboardNav = document.getElementById('quiz-keyboard-nav');
    quizKeyboardNav.checked =
      this.settings.canvasIntegration.quizHelper.keyboardNavigation !== false;
    quizKeyboardNav.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.keyboardNavigation = e.target.checked;
      this.saveSettings();
    });

    // Keyboard Nav toggle (disabled for now - future feature)
    const keyboardNavCheckbox = document.getElementById('canvas-keyboard-nav');
    if (keyboardNavCheckbox) {
      keyboardNavCheckbox.checked = this.settings.canvasIntegration.keyboardNav || false;
    }

    console.log('[Popup] Canvas Integration initialized', this.settings.canvasIntegration);
  }

  // ============================================================
  // SPRINT 5 FEATURE: SPEECH-TO-TEXT (STT)
  // ============================================================
  setupSTT() {
    if (!this.settings.stt) {
      this.settings.stt = {
        enabled: false,
        continuousMode: true,
        interimResults: true,
        language: 'en-US',
        autoCapitalize: true,
        punctuationCommands: true,
        floatingButton: true,
      };
    }

    const sttEnabled = document.getElementById('stt-enabled');
    const sttDescription = document.getElementById('stt-description');
    const sttOptions = document.getElementById('stt-options');

    sttEnabled.checked = this.settings.stt.enabled || false;

    if (sttEnabled.checked) {
      sttDescription.classList.remove('hidden');
      sttOptions.classList.remove('hidden');
    } else {
      sttDescription.classList.add('hidden');
      sttOptions.classList.add('hidden');
    }

    sttEnabled.addEventListener('change', e => {
      this.settings.stt.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        sttDescription.classList.remove('hidden');
        sttOptions.classList.remove('hidden');
      } else {
        sttDescription.classList.add('hidden');
        sttOptions.classList.add('hidden');
      }
    });

    // Continuous Mode
    const continuousModeCheckbox = document.getElementById('stt-continuous-mode');
    continuousModeCheckbox.checked = this.settings.stt.continuousMode !== false;
    continuousModeCheckbox.addEventListener('change', e => {
      this.settings.stt.continuousMode = e.target.checked;
      this.saveSettings();
    });

    // Language
    const languageSelect = document.getElementById('stt-language');
    languageSelect.value = this.settings.stt.language || 'en-US';
    languageSelect.addEventListener('change', e => {
      this.settings.stt.language = e.target.value;
      this.saveSettings();
    });

    // Punctuation Commands
    const punctuationCheckbox = document.getElementById('stt-punctuation-commands');
    punctuationCheckbox.checked = this.settings.stt.punctuationCommands !== false;
    punctuationCheckbox.addEventListener('change', e => {
      this.settings.stt.punctuationCommands = e.target.checked;
      this.saveSettings();
    });

    // Auto Capitalize
    const autoCapitalizeCheckbox = document.getElementById('stt-auto-capitalize');
    autoCapitalizeCheckbox.checked = this.settings.stt.autoCapitalize !== false;
    autoCapitalizeCheckbox.addEventListener('change', e => {
      this.settings.stt.autoCapitalize = e.target.checked;
      this.saveSettings();
    });

    // Interim Results
    const interimResultsCheckbox = document.getElementById('stt-interim-results');
    interimResultsCheckbox.checked = this.settings.stt.interimResults !== false;
    interimResultsCheckbox.addEventListener('change', e => {
      this.settings.stt.interimResults = e.target.checked;
      this.saveSettings();
    });

    // Floating Button
    const floatingButtonCheckbox = document.getElementById('stt-floating-button');
    floatingButtonCheckbox.checked = this.settings.stt.floatingButton !== false;
    floatingButtonCheckbox.addEventListener('change', e => {
      this.settings.stt.floatingButton = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] STT initialized');
  }

  // ============================================================
  // PHASE 2 FEATURE 3: READING MODE
  // ============================================================
  setupReadingMode() {
    // Initialize readingMode settings if they don't exist
    if (!this.settings.readingMode) {
      this.settings.readingMode = {
        enabled: false,
        backgroundColor: '#FBF8F3',
        fontFamily: 'OpenDyslexic, Georgia, serif',
        fontSize: '18px',
        lineHeight: '1.6',
        maxWidth: '800px',
      };
    }

    const readingModeEnabled = document.getElementById('reading-mode-enabled');
    const readingModeDescription = document.getElementById('reading-mode-description');
    const readingModeOptions = document.getElementById('reading-mode-options');
    const toggleButton = document.getElementById('btn-toggle-reading-mode');

    // Set initial state
    readingModeEnabled.checked = this.settings.readingMode.enabled || false;

    // Show/hide description and options based on enabled state
    if (readingModeEnabled.checked) {
      readingModeDescription.classList.remove('hidden');
      readingModeOptions.classList.remove('hidden');
    } else {
      readingModeDescription.classList.add('hidden');
      readingModeOptions.classList.add('hidden');
    }

    // Toggle event
    readingModeEnabled.addEventListener('change', e => {
      this.settings.readingMode.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        readingModeDescription.classList.remove('hidden');
        readingModeOptions.classList.remove('hidden');
      } else {
        readingModeDescription.classList.add('hidden');
        readingModeOptions.classList.add('hidden');
      }
    });

    // Toggle Reading Mode button
    toggleButton.addEventListener('click', async () => {
      if (!this.currentTab) {
        this.updateStatus('No active tab', 'error');
        return;
      }

      try {
        // Send message to content script to toggle reading mode
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'READING_MODE_TOGGLE',
        });

        // Update button text (the content script will handle the actual toggle)
        const btnText = toggleButton.querySelector('.btn-text');
        if (btnText.textContent === 'Enter Reading Mode') {
          btnText.textContent = 'Exit Reading Mode';
        } else {
          btnText.textContent = 'Enter Reading Mode';
        }
      } catch (error) {
        console.error('[Popup] Error toggling reading mode:', error);
        this.updateStatus('Error: Please reload the page', 'error');
      }
    });

    console.log('[Popup] Reading Mode initialized');
  }

  // ============================================================
  // SPRINT 9 FEATURE: DYSLEXIA-OPTIMIZED READING MODE
  // ============================================================
  setupDyslexiaMode() {
    if (!this.settings.dyslexiaMode) {
      this.settings.dyslexiaMode = {
        enabled: false,
        bionicReading: true,
        syllableHighlighting: false,
        grammarColors: false,
        colorIntensity: 0.7,
      };
    }

    const dyslexiaEnabled = document.getElementById('dyslexia-mode-enabled');
    const dyslexiaDescription = document.getElementById('dyslexia-mode-description');
    const dyslexiaOptions = document.getElementById('dyslexia-mode-options');

    dyslexiaEnabled.checked = this.settings.dyslexiaMode.enabled || false;

    if (dyslexiaEnabled.checked) {
      dyslexiaDescription.classList.remove('hidden');
      dyslexiaOptions.classList.remove('hidden');
    } else {
      dyslexiaDescription.classList.add('hidden');
      dyslexiaOptions.classList.add('hidden');
    }

    dyslexiaEnabled.addEventListener('change', e => {
      this.settings.dyslexiaMode.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        dyslexiaDescription.classList.remove('hidden');
        dyslexiaOptions.classList.remove('hidden');
      } else {
        dyslexiaDescription.classList.add('hidden');
        dyslexiaOptions.classList.add('hidden');
      }
    });

    // Feature selection (radio buttons)
    const bionicRadio = document.getElementById('dyslexia-bionic');
    const syllableRadio = document.getElementById('dyslexia-syllable');
    const grammarRadio = document.getElementById('dyslexia-grammar');

    // Set initial state
    if (this.settings.dyslexiaMode.bionicReading) {
      bionicRadio.checked = true;
    } else if (this.settings.dyslexiaMode.syllableHighlighting) {
      syllableRadio.checked = true;
    } else if (this.settings.dyslexiaMode.grammarColors) {
      grammarRadio.checked = true;
    }

    // Radio button handlers
    bionicRadio.addEventListener('change', e => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = true;
        this.settings.dyslexiaMode.syllableHighlighting = false;
        this.settings.dyslexiaMode.grammarColors = false;
        this.saveSettings();
      }
    });

    syllableRadio.addEventListener('change', e => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = false;
        this.settings.dyslexiaMode.syllableHighlighting = true;
        this.settings.dyslexiaMode.grammarColors = false;
        this.saveSettings();
      }
    });

    grammarRadio.addEventListener('change', e => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = false;
        this.settings.dyslexiaMode.syllableHighlighting = false;
        this.settings.dyslexiaMode.grammarColors = true;
        this.saveSettings();
      }
    });

    // Color Intensity slider
    const intensitySlider = document.getElementById('dyslexia-intensity');
    const intensityValue = document.getElementById('dyslexia-intensity-value');
    intensitySlider.value = this.settings.dyslexiaMode.colorIntensity || 0.7;
    intensityValue.textContent = Math.round(intensitySlider.value * 100) + '%';
    intensitySlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      intensityValue.textContent = Math.round(value * 100) + '%';
      this.settings.dyslexiaMode.colorIntensity = value;
      this.saveSettings();
    });

    console.log('[Popup] Dyslexia Mode initialized');

    // ============================================================
    // ANNOTATIONS: MIGRATION MODAL CLOSE BUTTON
    // ============================================================
    // Note: Storage mode migration event listener is attached in loadModalSettings()
    // after the Advanced Options modal is created (the dropdown doesn't exist here)

    // Migration modal close button
    const btnMigrationClose = document.getElementById('btn-migration-close');
    if (btnMigrationClose) {
      btnMigrationClose.addEventListener('click', () => {
        this.closeMigrationModal();
      });
    }
  }

  // ============================================================
  // SPRINT 7 FEATURE: USER PROFILES
  // ============================================================

  async setupUserProfiles() {
    console.log('[Popup] Setting up User Profiles...');

    // Initialize profiles from storage
    await this.profiles_initialize();

    // Setup UI event listeners
    this.profiles_setupEventListeners();
  }

  async profiles_initialize() {
    // Load profiles from storage
    const result = await chrome.storage.local.get(['assist_profiles', 'assist_active_profile']);

    let profiles = result.assist_profiles || {};
    const activeProfile = result.assist_active_profile || 'Default';

    // Create default profiles if they don't exist
    if (Object.keys(profiles).length === 0) {
      profiles = this.profiles_createDefaults();
      await chrome.storage.local.set({
        assist_profiles: profiles,
        assist_active_profile: 'Default',
      });
      console.log('[Profiles] Created default profiles');
    }

    this.profiles = profiles;
    this.activeProfile = activeProfile;

    // Populate profile selector
    this.profiles_populateSelector();

    console.log('[Profiles] Initialized with', Object.keys(profiles).length, 'profiles');
  }

  profiles_createDefaults() {
    const timestamp = new Date().toISOString();

    return {
      Default: {
        name: 'Default',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: {
            enabled: false,
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            highlightEnabled: true,
            highlightColor: '#FFEB3B',
            highlightOpacity: 0.7,
          },
          textCustomization: { enabled: false },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          canvasIntegration: { enabled: false },
        },
      },
      'Reading Mode': {
        name: 'Reading Mode',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.2, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.8,
            fontFamily: 'OpenDyslexic',
          },
          readingGuide: { enabled: true, lineColor: '#4A90E2', opacity: 0.5 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: '#FFF4E6', opacity: 0.2 },
          canvasIntegration: { enabled: false },
        },
      },
      'Quiz Mode': {
        name: 'Quiz Mode',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.0, highlightEnabled: true, wordByWordEnabled: false },
          textCustomization: { enabled: true, fontSize: 16, lineHeight: 1.6 },
          readingGuide: { enabled: false },
          focusMode: { enabled: true, dimAmount: 0.7 },
          screenOverlay: { enabled: false },
          canvasIntegration: {
            enabled: true,
            quizHelper: {
              enabled: true,
              readAnswers: true,
              highlightQuestion: true,
              keyboardNavigation: true,
            },
          },
        },
      },
      'Low Vision': {
        name: 'Low Vision',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: {
            enabled: true,
            rate: 0.9,
            highlightEnabled: true,
            highlightColor: '#FFEB3B',
            highlightOpacity: 0.9,
          },
          textCustomization: {
            enabled: true,
            fontSize: 22,
            lineHeight: 2.0,
            letterSpacing: 0.15,
            wordSpacing: 0.2,
          },
          readingGuide: { enabled: true, lineColor: '#FF0000', opacity: 0.8 },
          focusMode: { enabled: true, dimAmount: 0.9 },
          screenOverlay: { enabled: false },
          canvasIntegration: { enabled: false },
        },
      },
    };
  }

  profiles_populateSelector() {
    const selector = document.getElementById('profile-select');
    selector.innerHTML = '';

    // Add profiles to selector
    Object.keys(this.profiles).forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      option.selected = name === this.activeProfile;
      selector.appendChild(option);
    });
  }

  profiles_setupEventListeners() {
    // Profile selector change
    const selector = document.getElementById('profile-select');
    selector.addEventListener('change', e => {
      this.profiles_loadProfile(e.target.value);
    });

    // Save current button
    document.getElementById('btn-save-profile').addEventListener('click', () => {
      this.profiles_showSaveModal();
    });

    // Export button
    document.getElementById('btn-export-profiles').addEventListener('click', () => {
      this.profiles_export();
    });

    // Import button
    document.getElementById('btn-import-profiles').addEventListener('click', () => {
      document.getElementById('profile-import-input').click();
    });

    // Import file input
    document.getElementById('profile-import-input').addEventListener('change', e => {
      this.profiles_import(e.target.files[0]);
    });

    // Save profile modal
    document.getElementById('btn-cancel-save-profile').addEventListener('click', () => {
      document.getElementById('save-profile-modal').classList.add('hidden');
    });

    document.getElementById('btn-confirm-save-profile').addEventListener('click', () => {
      this.profiles_saveNew();
    });

    // Delete profile modal
    document.getElementById('btn-cancel-delete-profile').addEventListener('click', () => {
      document.getElementById('delete-profile-modal').classList.add('hidden');
    });

    document.getElementById('btn-confirm-delete-profile').addEventListener('click', () => {
      this.profiles_confirmDelete();
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', () => {
        overlay.closest('.modal').classList.add('hidden');
      });
    });
  }

  async profiles_loadProfile(name) {
    if (!this.profiles[name]) {
      console.error('[Profiles] Profile not found:', name);
      return;
    }

    const profile = this.profiles[name];
    this.activeProfile = name;

    // Deep merge profile settings with current settings
    this.settings = { ...this.settings, ...profile.settings };

    // Save active profile
    await chrome.storage.local.set({ assist_active_profile: name });

    // Save settings
    await this.saveSettings();

    // Reload popup to reflect changes
    window.location.reload();
  }

  profiles_showSaveModal() {
    const modal = document.getElementById('save-profile-modal');
    const input = document.getElementById('profile-name-input');
    input.value = '';
    modal.classList.remove('hidden');
    input.focus();
  }

  async profiles_saveNew() {
    const input = document.getElementById('profile-name-input');
    const name = input.value.trim();

    if (!name) {
      alert('Please enter a profile name');
      return;
    }

    if (this.profiles[name]) {
      if (!confirm(`Profile "${name}" already exists. Overwrite?`)) {
        return;
      }
    }

    // Create new profile from current settings
    const newProfile = {
      name: name,
      isDefault: false,
      createdAt: new Date().toISOString(),
      settings: JSON.parse(JSON.stringify(this.settings)), // Deep clone
    };

    this.profiles[name] = newProfile;

    // Save to storage
    await chrome.storage.local.set({ assist_profiles: this.profiles });

    // Update UI
    this.profiles_populateSelector();

    // Close modal
    document.getElementById('save-profile-modal').classList.add('hidden');

    // Show success message
    this.updateStatus(`Profile "${name}" saved!`, 'success');

    console.log('[Profiles] Saved new profile:', name);
  }

  profiles_showDeleteModal(name) {
    const modal = document.getElementById('delete-profile-modal');
    const nameSpan = document.getElementById('delete-profile-name');
    nameSpan.textContent = name;
    modal.classList.add('hidden');

    this.profileToDelete = name;
    modal.classList.remove('hidden');
  }

  async profiles_confirmDelete() {
    const name = this.profileToDelete;

    if (!name || !this.profiles[name]) {
      return;
    }

    // Cannot delete default profiles
    if (this.profiles[name].isDefault) {
      alert('Cannot delete default profiles');
      return;
    }

    // Delete profile
    delete this.profiles[name];

    // If deleted profile was active, switch to Default
    if (this.activeProfile === name) {
      await this.profiles_loadProfile('Default');
    }

    // Save to storage
    await chrome.storage.local.set({ assist_profiles: this.profiles });

    // Update UI
    this.profiles_populateSelector();

    // Close modal
    document.getElementById('delete-profile-modal').classList.add('hidden');

    // Show success message
    this.updateStatus(`Profile "${name}" deleted`, 'success');

    console.log('[Profiles] Deleted profile:', name);
  }

  profiles_export() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      profiles: this.profiles,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `assist-profiles-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);

    this.updateStatus('Profiles exported!', 'success');
    console.log('[Profiles] Exported', Object.keys(this.profiles).length, 'profiles');
  }

  async profiles_import(file) {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.profiles || typeof data.profiles !== 'object') {
        alert('Invalid profile file format');
        return;
      }

      // Merge imported profiles (keep existing if name conflicts)
      let importedCount = 0;
      for (const [name, profile] of Object.entries(data.profiles)) {
        if (!this.profiles[name] || !this.profiles[name].isDefault) {
          this.profiles[name] = profile;
          importedCount++;
        }
      }

      // Save to storage
      await chrome.storage.local.set({ assist_profiles: this.profiles });

      // Update UI
      this.profiles_populateSelector();

      // Show success message
      this.updateStatus(`Imported ${importedCount} profiles!`, 'success');

      console.log('[Profiles] Imported', importedCount, 'profiles');
    } catch (error) {
      console.error('[Profiles] Import error:', error);
      alert('Error importing profiles: ' + error.message);
    }
  }

  // ============================================================
  // ANNOTATIONS STORAGE MIGRATION
  // ============================================================

  /**
   * Handle storage mode migration for annotations
   * @param {string} fromMode - Source storage mode
   * @param {string} toMode - Target storage mode
   */
  async handleStorageMigration(fromMode, toMode) {
    console.log(`[Popup] Migrating annotations from ${fromMode} to ${toMode}`);

    // Show migration modal
    this.showMigrationModal();

    try {
      // Perform migration with progress callback
      const result = await migrateAnnotations(fromMode, toMode, {
        clearSource: true,
        onProgress: progress => {
          this.updateMigrationProgress(progress);
        },
      });

      if (result.success) {
        console.log(`[Popup] Migration successful: ${result.count} annotations migrated`);
        this.updateMigrationComplete(result.count, toMode);
      } else {
        console.error('[Popup] Migration failed:', result.error);
        this.updateMigrationError(result.error);
      }
    } catch (error) {
      console.error('[Popup] Migration exception:', error);
      this.updateMigrationError(error.message);
    }
  }

  /**
   * Show migration modal
   */
  showMigrationModal() {
    const modal = document.getElementById('migration-modal');
    if (modal) {
      modal.classList.remove('hidden');

      // Reset modal state
      const closeBtn = document.getElementById('btn-migration-close');
      if (closeBtn) {
        closeBtn.style.display = 'none';
      }

      // Reset progress
      const progressFill = document.getElementById('migration-progress-fill');
      const progressText = document.getElementById('migration-progress-text');
      if (progressFill) {
        progressFill.style.width = '0%';
      }
      if (progressText) {
        progressText.textContent = '0%';
      }
    }
  }

  /**
   * Close migration modal
   */
  closeMigrationModal() {
    const modal = document.getElementById('migration-modal');
    if (modal) {
      modal.classList.add('hidden');

      // Reload settings to reflect migration
      this.loadSettings();
    }
  }

  /**
   * Update migration progress in modal
   * @param {Object} progress - Progress information
   */
  updateMigrationProgress(progress) {
    const { status, current, total, message } = progress;

    // Update message
    const messageEl = document.getElementById('migration-message');
    if (messageEl) {
      messageEl.textContent = message;
    }

    // Calculate percentage
    let percentage = 0;
    if (total > 0) {
      percentage = Math.round((current / total) * 100);
    } else if (status === 'complete') {
      percentage = 100;
    }

    // Update progress bar
    const progressFill = document.getElementById('migration-progress-fill');
    const progressText = document.getElementById('migration-progress-text');
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    if (progressText) {
      progressText.textContent = `${percentage}%`;
    }

    // Update details
    const detailsEl = document.getElementById('migration-details');
    if (detailsEl) {
      if (total > 0) {
        detailsEl.textContent = `${current} of ${total} annotations processed`;
      } else {
        detailsEl.textContent = '';
      }
    }
  }

  /**
   * Update migration modal on completion
   * @param {number} count - Number of annotations migrated
   * @param {string} toMode - Target storage mode
   */
  updateMigrationComplete(count, toMode) {
    const messageEl = document.getElementById('migration-message');
    if (messageEl) {
      if (count === 0) {
        messageEl.textContent = 'No annotations to migrate';
      } else {
        const storageLabel = toMode === 'indexeddb' ? 'IndexedDB' : 'Chrome Local Storage';
        messageEl.textContent = `Successfully migrated ${count} annotation${count === 1 ? '' : 's'} to ${storageLabel}`;
      }
    }

    // Show completion (100%)
    const progressFill = document.getElementById('migration-progress-fill');
    const progressText = document.getElementById('migration-progress-text');
    if (progressFill) {
      progressFill.style.width = '100%';
    }
    if (progressText) {
      progressText.textContent = '100%';
    }

    // Clear details
    const detailsEl = document.getElementById('migration-details');
    if (detailsEl) {
      detailsEl.textContent = '';
    }

    // Show close button
    const closeBtn = document.getElementById('btn-migration-close');
    if (closeBtn) {
      closeBtn.style.display = '';
    }
  }

  /**
   * Update migration modal on error
   * @param {string} error - Error message
   */
  updateMigrationError(error) {
    const messageEl = document.getElementById('migration-message');
    if (messageEl) {
      messageEl.textContent = `Migration failed: ${error}`;
    }

    // Show error state (red progress bar)
    const progressFill = document.getElementById('migration-progress-fill');
    if (progressFill) {
      progressFill.style.background = 'linear-gradient(90deg, #f44336 0%, #d32f2f 100%)';
    }

    // Clear details
    const detailsEl = document.getElementById('migration-details');
    if (detailsEl) {
      detailsEl.textContent = 'Please try again or contact support if the issue persists.';
    }

    // Show close button
    const closeBtn = document.getElementById('btn-migration-close');
    if (closeBtn) {
      closeBtn.style.display = '';
    }
  }

  // ============================================================
  // ANNOTATIONS: STICKY NOTES
  // ============================================================
  setupAnnotations() {
    // Initialize settings if not present
    if (!this.settings.annotations) {
      this.settings.annotations = {
        enabled: false,
      };
    }

    const annotationsEnabled = document.getElementById('annotations-enabled');
    const annotationsDescription = document.getElementById('annotations-description');
    const annotationsOptions = document.getElementById('annotations-options');
    const createNoteButton = document.getElementById('btn-create-sticky-note');
    const viewAnnotationsButton = document.getElementById('btn-view-annotations');

    // Set initial state
    annotationsEnabled.checked = this.settings.annotations.enabled || false;

    // Show/hide description and options based on enabled state
    if (annotationsEnabled.checked) {
      annotationsDescription.classList.remove('hidden');
      annotationsOptions.classList.remove('hidden');
    } else {
      annotationsDescription.classList.add('hidden');
      annotationsOptions.classList.add('hidden');
    }

    // Toggle event
    annotationsEnabled.addEventListener('change', e => {
      this.settings.annotations.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        annotationsDescription.classList.remove('hidden');
        annotationsOptions.classList.remove('hidden');
      } else {
        annotationsDescription.classList.add('hidden');
        annotationsOptions.classList.add('hidden');
      }
    });

    // Create sticky note button
    createNoteButton.addEventListener('click', async () => {
      if (!this.currentTab) {
        this.updateStatus('No active tab', 'error');
        return;
      }

      try {
        // Send message to content script to create a sticky note
        await chrome.tabs.sendMessage(this.currentTab.id, {
          action: 'createStickyNote',
          x: null, // Will be centered by content script
          y: null,
          content: '',
          color: 'yellow',
        });

        this.updateStatus('Sticky note created!', 'success');
      } catch (error) {
        console.error('[Popup] Error creating sticky note:', error);
        this.updateStatus('Error: Please reload the page', 'error');
      }
    });

    // View annotations button
    viewAnnotationsButton.addEventListener('click', async () => {
      if (!this.currentTab) {
        this.updateStatus('No active tab', 'error');
        return;
      }

      try {
        // Send message to content script to toggle annotation sidebar
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'toggleAnnotationSidebar',
        });

        this.updateStatus('Sidebar toggled', 'success');
      } catch (error) {
        console.error('[Popup] Error toggling sidebar:', error);
        this.updateStatus('Error: Please reload the page', 'error');
      }
    });

    console.log('[Popup] Annotations initialized');
  }

  // ============================================================
  // CITATION: QUICK VIEW PANEL
  // ============================================================
  setupCitationPanel() {
    const expandBtn = document.getElementById('btn-expand-citations');
    const panelContainer = document.getElementById('citation-manager-panel');
    const expandIcon = document.getElementById('expand-citations-icon');
    const expandText = document.getElementById('expand-citations-text');

    if (!expandBtn || !panelContainer) {
      console.log('[Popup] Citation panel elements not found');
      return;
    }

    // Initialize the citation manager panel
    this.citationPanel = new CitationManagerPanel(panelContainer, {
      onStatusUpdate: (msg, type) => this.updateStatus(msg, type),
      currentTab: this.currentTab,
    });

    // Load citation count initially
    this.updateCitationCount();

    // Expand/collapse button handler
    expandBtn.addEventListener('click', async () => {
      this.citationPanelExpanded = !this.citationPanelExpanded;

      if (this.citationPanelExpanded) {
        // Expand
        panelContainer.style.display = 'block';
        expandIcon.style.transform = 'rotate(180deg)';
        expandText.textContent = 'Hide Quick View';
        expandBtn.setAttribute('aria-expanded', 'true');

        // Initialize and show panel
        await this.citationPanel.initialize();
      } else {
        // Collapse
        panelContainer.style.display = 'none';
        expandIcon.style.transform = 'rotate(0deg)';
        expandText.textContent = 'Show Quick View';
        expandBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Keyboard support
    expandBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        expandBtn.click();
      }
    });

    console.log('[Popup] Citation panel initialized');
  }

  async updateCitationCount() {
    const countBadge = document.getElementById('citation-count-badge');
    if (!countBadge || !this.currentTab) {
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'GET_CITATIONS',
      });

      if (response && response.success) {
        const count = response.citations?.length || 0;
        countBadge.textContent = count;
        countBadge.title = `${count} citation${count === 1 ? '' : 's'} saved`;
      } else {
        countBadge.textContent = '0';
      }
    } catch (error) {
      console.log('[Popup] Could not get citation count:', error.message);
      countBadge.textContent = '0';
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const popup = new PopupController();
  await popup.initialize();
  await popup.setupUserProfiles();
});
