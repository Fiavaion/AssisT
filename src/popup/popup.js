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
import Sortable from 'sortablejs';

/**
 * OrganizeMode - Manages drag-and-drop reordering and visibility of sections/features
 */
class OrganizeMode {
  constructor(popupController) {
    this.popup = popupController;
    this.isActive = false;
    this.sectionSortable = null;
    this.featureSortables = [];
    this.originalState = null;
  }

  /**
   * Toggle organize mode on/off
   */
  toggle() {
    if (this.isActive) {
      this.exit();
    } else {
      this.enter();
    }
  }

  /**
   * Enter organize mode
   */
  enter() {
    this.isActive = true;
    this.originalState = this.captureState();

    // Add visual indicators
    document.querySelector('.popup-container').classList.add('organize-mode');
    document.getElementById('btn-organize').classList.add('active');
    document.getElementById('organize-banner').classList.remove('hidden');

    // Inject drag handles and visibility toggles into accordion headers
    this.injectOrganizeControls();

    // Initialize sortable
    this.initSortables();

    // Setup keyboard navigation
    this.setupKeyboardNav();

    console.log('[OrganizeMode] Entered organize mode');
  }

  /**
   * Exit organize mode
   */
  exit() {
    this.isActive = false;

    // Remove visual indicators
    document.querySelector('.popup-container').classList.remove('organize-mode');
    document.getElementById('btn-organize').classList.remove('active');
    document.getElementById('organize-banner').classList.add('hidden');

    // Destroy sortables
    this.destroySortables();

    // Save layout
    this.saveLayout();

    // Show toast notification
    this.showToast('Layout saved');

    console.log('[OrganizeMode] Exited organize mode');
  }

  /**
   * Inject drag handles and visibility toggles into accordion headers
   */
  injectOrganizeControls() {
    const sections = document.querySelectorAll('.accordion-section');

    sections.forEach(section => {
      const header = section.querySelector('.accordion-header');
      const titleSpan = header.querySelector('.accordion-title');
      const sectionId = section.dataset.section;

      // Skip if controls already exist
      if (header.querySelector('.drag-handle')) {
        return;
      }

      // Get current visibility from settings
      const isVisible = this.popup.settings?.ui_layout?.sectionVisibility?.[sectionId] !== false;

      // Create drag handle
      const dragHandle = document.createElement('span');
      dragHandle.className = 'drag-handle';
      dragHandle.innerHTML = '⠿';
      dragHandle.setAttribute('aria-hidden', 'true');

      // Create visibility toggle
      const visibilityToggle = document.createElement('button');
      visibilityToggle.className = 'visibility-toggle';
      visibilityToggle.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
      visibilityToggle.setAttribute('aria-label', isVisible ? 'Hide section' : 'Show section');
      visibilityToggle.innerHTML = `<span class="visibility-icon">${isVisible ? '👁️' : '👁️‍🗨️'}</span>`;
      visibilityToggle.addEventListener('click', e => {
        e.stopPropagation();
        this.toggleSectionVisibility(sectionId, visibilityToggle);
      });

      // Create edit title button
      const editTitleBtn = document.createElement('button');
      editTitleBtn.className = 'edit-title-btn';
      editTitleBtn.setAttribute('aria-label', 'Edit section title');
      editTitleBtn.innerHTML = '✏️';
      editTitleBtn.addEventListener('click', e => {
        e.stopPropagation();
        this.editSectionTitle(sectionId);
      });

      // Wrap title text for editing
      const titleText = titleSpan.childNodes[1]; // Text node after icon
      if (titleText && titleText.nodeType === Node.TEXT_NODE) {
        const titleTextSpan = document.createElement('span');
        titleTextSpan.className = 'accordion-title-text';
        titleTextSpan.textContent = titleText.textContent.trim();
        titleSpan.replaceChild(titleTextSpan, titleText);
      }

      // Create move buttons for keyboard accessibility
      const moveButtons = document.createElement('div');
      moveButtons.className = 'move-buttons';
      moveButtons.innerHTML = `
        <button class="move-btn move-up" aria-label="Move section up" title="Move up">▲</button>
        <button class="move-btn move-down" aria-label="Move section down" title="Move down">▼</button>
      `;
      moveButtons.querySelector('.move-up').addEventListener('click', e => {
        e.stopPropagation();
        this.moveSection(section, 'up');
      });
      moveButtons.querySelector('.move-down').addEventListener('click', e => {
        e.stopPropagation();
        this.moveSection(section, 'down');
      });

      // Insert controls
      header.insertBefore(dragHandle, header.firstChild);
      titleSpan.appendChild(editTitleBtn);
      header.insertBefore(visibilityToggle, header.querySelector('.accordion-icon'));
      header.insertBefore(moveButtons, header.querySelector('.accordion-icon'));

      // Apply hidden state if section was hidden
      if (!isVisible) {
        section.classList.add('hidden-by-user');
      }
    });
  }

  /**
   * Initialize SortableJS for sections and features
   */
  initSortables() {
    const main = document.querySelector('.popup-main');

    // Section-level sortable
    this.sectionSortable = new Sortable(main, {
      handle: '.drag-handle',
      animation: 200,
      ghostClass: 'section-ghost',
      chosenClass: 'section-chosen',
      dragClass: 'section-dragging',
      filter: '.visibility-toggle, .edit-title-btn, .move-buttons',
      onEnd: () => {
        this.saveLayout();
        this.announceForScreenReader('Section order updated');
      },
    });

    // Feature-level sortables (one per accordion content)
    document.querySelectorAll('.accordion-content').forEach(content => {
      // Inject feature drag handles
      this.injectFeatureControls(content);

      const sortable = new Sortable(content, {
        handle: '.feature-drag-handle',
        animation: 150,
        ghostClass: 'feature-ghost',
        chosenClass: 'feature-chosen',
        filter: '.feature-visibility-toggle',
        draggable: '.control-section',
        onEnd: () => {
          this.saveLayout();
          this.announceForScreenReader('Feature order updated');
        },
      });
      this.featureSortables.push(sortable);
    });
  }

  /**
   * Inject drag handles into feature control sections
   */
  injectFeatureControls(content) {
    const features = content.querySelectorAll('.control-section');

    features.forEach(feature => {
      // Skip if already has controls or is a sub-option container
      if (feature.querySelector('.feature-drag-handle')) {
        return;
      }
      if (feature.classList.contains('hidden')) {
        return;
      }

      const toggleControl = feature.querySelector('.toggle-control');
      if (!toggleControl) {
        return;
      }

      const label = toggleControl.querySelector('.toggle-label');
      if (!label) {
        return;
      }

      // Create feature drag handle
      const dragHandle = document.createElement('span');
      dragHandle.className = 'feature-drag-handle';
      dragHandle.innerHTML = '⠿';
      dragHandle.setAttribute('aria-hidden', 'true');

      // Insert at start of label
      label.insertBefore(dragHandle, label.firstChild);
    });
  }

  /**
   * Destroy all sortable instances
   */
  destroySortables() {
    if (this.sectionSortable) {
      this.sectionSortable.destroy();
      this.sectionSortable = null;
    }

    this.featureSortables.forEach(sortable => sortable.destroy());
    this.featureSortables = [];
  }

  /**
   * Toggle section visibility
   */
  toggleSectionVisibility(sectionId, toggleBtn) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const isCurrentlyVisible = toggleBtn.getAttribute('aria-pressed') === 'true';
    const newVisibility = !isCurrentlyVisible;

    // Update button state
    toggleBtn.setAttribute('aria-pressed', newVisibility ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', newVisibility ? 'Hide section' : 'Show section');
    toggleBtn.querySelector('.visibility-icon').textContent = newVisibility ? '👁️' : '👁️‍🗨️';

    // Update section class
    if (newVisibility) {
      section.classList.remove('hidden-by-user');
    } else {
      section.classList.add('hidden-by-user');
    }

    // Save to settings
    this.saveLayout();
    this.announceForScreenReader(`Section ${newVisibility ? 'shown' : 'hidden'}`);
  }

  /**
   * Edit section title inline
   */
  editSectionTitle(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    let titleTextSpan = section.querySelector('.accordion-title-text');

    // Create span if missing
    if (!titleTextSpan) {
      const titleSpan = section.querySelector('.accordion-title');
      const iconSpan = titleSpan.querySelector('.accordion-icon-left');

      // Get the full text content and remove the icon emoji
      const fullText = titleSpan.textContent;
      const iconText = iconSpan ? iconSpan.textContent : '';
      const titleText = fullText.replace(iconText, '').trim();

      // Create wrapper span for the title text
      titleTextSpan = document.createElement('span');
      titleTextSpan.className = 'accordion-title-text';
      titleTextSpan.textContent = titleText;

      // Clear all text nodes and re-add structured content
      // Remove all child nodes except the icon
      while (titleSpan.childNodes.length > 1) {
        titleSpan.removeChild(titleSpan.lastChild);
      }

      // Add space and the new title span after icon
      titleSpan.appendChild(document.createTextNode(' '));
      titleSpan.appendChild(titleTextSpan);
    }

    const currentTitle = titleTextSpan.textContent;

    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'title-edit-input';
    input.setAttribute('aria-label', 'Edit section title');

    // Replace span with input
    titleTextSpan.replaceWith(input);
    input.focus();
    input.select();

    // Handle save on blur or enter
    const saveEdit = () => {
      const newTitle = input.value.trim() || currentTitle;

      // Create new span
      const newSpan = document.createElement('span');
      newSpan.className = 'accordion-title-text';
      newSpan.textContent = newTitle;

      input.replaceWith(newSpan);

      // Save to settings
      if (!this.popup.settings.ui_layout) {
        this.popup.settings.ui_layout = {};
      }
      if (!this.popup.settings.ui_layout.sectionTitles) {
        this.popup.settings.ui_layout.sectionTitles = {};
      }
      this.popup.settings.ui_layout.sectionTitles[sectionId] = newTitle;
      this.saveLayout();

      this.announceForScreenReader(`Section renamed to ${newTitle}`);
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentTitle;
        input.blur();
      }
    });
  }

  /**
   * Move section up or down (keyboard accessibility)
   */
  moveSection(section, direction) {
    const main = document.querySelector('.popup-main');
    const sections = Array.from(main.querySelectorAll('.accordion-section'));
    const currentIndex = sections.indexOf(section);

    if (direction === 'up' && currentIndex > 0) {
      main.insertBefore(section, sections[currentIndex - 1]);
    } else if (direction === 'down' && currentIndex < sections.length - 1) {
      main.insertBefore(sections[currentIndex + 1], section);
    }

    this.saveLayout();
    this.updateMoveButtons();
    this.announceForScreenReader(`Section moved ${direction}`);
  }

  /**
   * Update move button disabled states
   */
  updateMoveButtons() {
    const sections = document.querySelectorAll('.accordion-section');
    sections.forEach((section, index) => {
      const moveUp = section.querySelector('.move-up');
      const moveDown = section.querySelector('.move-down');
      if (moveUp) {
        moveUp.disabled = index === 0;
      }
      if (moveDown) {
        moveDown.disabled = index === sections.length - 1;
      }
    });
  }

  /**
   * Setup keyboard navigation for organize mode
   */
  setupKeyboardNav() {
    this.keyHandler = e => {
      if (!this.isActive) {
        return;
      }

      // Escape to exit
      if (e.key === 'Escape') {
        e.preventDefault();
        this.exit();
        return;
      }

      // Alt+Up/Down to move focused section
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const focused = document.activeElement.closest('.accordion-section');
        if (focused) {
          e.preventDefault();
          this.moveSection(focused, e.key === 'ArrowUp' ? 'up' : 'down');
        }
      }
    };

    document.addEventListener('keydown', this.keyHandler);
  }

  /**
   * Capture current state for potential undo
   */
  captureState() {
    return {
      sectionOrder: this.getSectionOrder(),
      sectionVisibility: { ...this.popup.settings?.ui_layout?.sectionVisibility },
      sectionTitles: { ...this.popup.settings?.ui_layout?.sectionTitles },
    };
  }

  /**
   * Get current section order from DOM
   */
  getSectionOrder() {
    const sections = document.querySelectorAll('.accordion-section');
    return Array.from(sections).map(s => s.dataset.section);
  }

  /**
   * Get current feature order from DOM
   */
  getFeatureOrder() {
    const featureOrder = {};
    document.querySelectorAll('.accordion-section').forEach(section => {
      const sectionId = section.dataset.section;
      const content = section.querySelector('.accordion-content');
      if (content) {
        const features = content.querySelectorAll('.control-section[id]');
        featureOrder[sectionId] = Array.from(features).map(f => {
          // Extract feature ID from section ID (e.g., 'tts-section' -> 'tts')
          return f.id.replace('-section', '');
        });
      }
    });
    return featureOrder;
  }

  /**
   * Save current layout to settings
   */
  async saveLayout() {
    // Initialize ui_layout if needed
    if (!this.popup.settings.ui_layout) {
      this.popup.settings.ui_layout = {};
    }

    // Update section order
    this.popup.settings.ui_layout.sectionOrder = this.getSectionOrder();

    // Update section visibility
    if (!this.popup.settings.ui_layout.sectionVisibility) {
      this.popup.settings.ui_layout.sectionVisibility = {};
    }
    document.querySelectorAll('.accordion-section').forEach(section => {
      const sectionId = section.dataset.section;
      this.popup.settings.ui_layout.sectionVisibility[sectionId] =
        !section.classList.contains('hidden-by-user');
    });

    // Update feature order
    this.popup.settings.ui_layout.featureOrder = this.getFeatureOrder();

    // Save settings
    await this.popup.saveSettings();
    console.log('[OrganizeMode] Layout saved:', this.popup.settings.ui_layout);
  }

  /**
   * Apply saved layout on popup load
   */
  applyLayout() {
    const layout = this.popup.settings?.ui_layout;
    if (!layout) {
      return;
    }

    const main = document.querySelector('.popup-main');

    // Apply section order
    if (layout.sectionOrder) {
      layout.sectionOrder.forEach(sectionId => {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (section) {
          main.appendChild(section);
        }
      });
    }

    // Apply section visibility
    if (layout.sectionVisibility) {
      Object.entries(layout.sectionVisibility).forEach(([sectionId, visible]) => {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (section) {
          section.classList.toggle('hidden-by-user', !visible);
        }
      });
    }

    // Apply custom titles
    if (layout.sectionTitles) {
      Object.entries(layout.sectionTitles).forEach(([sectionId, title]) => {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (section) {
          const titleSpan = section.querySelector('.accordion-title');
          if (titleSpan) {
            // Check if title-text span exists
            const titleTextSpan = titleSpan.querySelector('.accordion-title-text');
            if (titleTextSpan) {
              titleTextSpan.textContent = title;
            } else {
              // Replace text node
              const textNode = Array.from(titleSpan.childNodes).find(
                n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
              );
              if (textNode) {
                textNode.textContent = ' ' + title;
              }
            }
          }
        }
      });
    }

    console.log('[OrganizeMode] Layout applied');
  }

  /**
   * Show toast notification
   */
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'layout-toast';
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);

    // Remove after animation
    setTimeout(() => toast.remove(), 1500);
  }

  /**
   * Announce message for screen readers
   */
  announceForScreenReader(message) {
    let region = document.querySelector('.sr-live-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'sr-live-region';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      document.body.appendChild(region);
    }
    region.textContent = message;
  }
}

class PopupController {
  constructor() {
    this.settings = null;
    this.currentTab = null;
    this.isInitialized = false;
    this.citationPanel = null;
    this.citationPanelExpanded = false;
    this.organizeMode = new OrganizeMode(this);
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

    // Apply saved layout (section order, visibility, custom titles)
    this.organizeMode.applyLayout();

    // Setup organize mode event listeners
    this.setupOrganizeModeListeners();

    this.isInitialized = true;
    this.updateStatus('Ready');
    console.log('[Popup] Initialized');
  }

  /**
   * Setup event listeners for organize mode
   */
  setupOrganizeModeListeners() {
    // Organize button in header
    const organizeBtn = document.getElementById('btn-organize');
    if (organizeBtn) {
      organizeBtn.addEventListener('click', () => {
        this.organizeMode.toggle();
      });
    }

    // Done button in organize banner
    const doneBtn = document.getElementById('btn-organize-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        this.organizeMode.exit();
      });
    }
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
    toggleSection('dark-mode-section', 'show_dark_mode'); // Dark Mode
    toggleSection('simplify-section', 'show_simplify'); // Simplified Interface
    toggleSection('reading-progress-section', 'show_reading_progress'); // Reading Progress Tracker
    toggleSection('pomodoro-section', 'show_pomodoro'); // Pomodoro Timer
    toggleSection('stargardt-section', 'show_stargardt'); // Stargardt Support
    toggleSection('reduced-motion-section', 'show_reduced_motion'); // Reduced Motion
    toggleSection('media-control-section', 'show_media_control'); // Media Control

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
    // NEURODIVERGENT PROFILE FEATURE: DARK MODE
    // ============================================================
    this.setupDarkMode();

    // ============================================================
    // NEURODIVERGENT PROFILE FEATURE: SIMPLIFIED INTERFACE
    // ============================================================
    this.setupSimplify();

    // ============================================================
    // NEURODIVERGENT PROFILE FEATURE: READING PROGRESS
    // ============================================================
    this.setupReadingProgress();

    // ============================================================
    // NEURODIVERGENT PROFILE FEATURE: POMODORO TIMER
    // ============================================================
    this.setupPomodoro();

    // ============================================================
    // STARGARDT MODULE: CENTRAL VISION SUPPORT
    // ============================================================
    this.setupStargardt();

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

    // ============================================================
    // LOCAL LLM INTEGRATION (AssisT LLM Edition)
    // ============================================================
    this.setupLocalLLM();

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

    // Discovery Quiz button - opens adaptive quiz to discover best tools
    const btnDiscovery = document.getElementById('btn-discovery');
    if (btnDiscovery) {
      btnDiscovery.addEventListener('click', () => {
        // Open discovery quiz in new tab via service worker
        chrome.runtime.sendMessage({ action: 'OPEN_DISCOVERY_QUIZ' });
        // Close the popup
        window.close();
      });
    }

    // Options button
    document.getElementById('btn-options').addEventListener('click', () => {
      this.showAdvancedOptions();
    });
  }

  async resetToDefaults() {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;

    try {
      // Use the RESET_SETTINGS message type to reset via MessageRouter
      const defaults = await chrome.runtime.sendMessage({
        type: 'RESET_SETTINGS'
      });

      console.log('[Popup] Settings reset to defaults:', defaults);

      // Reload the popup to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('[Popup] Error resetting settings:', error);
      alert('Failed to reset settings. Please try again.');
    }
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
          <button class="modal-tab" data-tab="preferences">Preferences</button>
          <button class="modal-tab" data-tab="ai">AI</button>
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
                <span>🎯 Display & Visual Features</span>
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

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-reduced-motion" checked>
                  <span>Reduced Motion</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-media-control" checked>
                  <span>Media Control</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-dark-mode" checked>
                  <span>Dark Mode</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-simplify" checked>
                  <span>Simplified Interface</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-reading-progress" checked>
                  <span>Reading Progress Tracker</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-pomodoro" checked>
                  <span>Pomodoro Timer</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-stargardt" checked>
                  <span>Stargardt Support</span>
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
                <span>🎓 School Tools & LMS Integration</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-citations" checked>
                  <span>Citations Generator</span>
                </label>
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

              <div class="feature-section-header">
                <span>🤖 Local AI Features</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-llm-core" checked>
                  <span>LLM Core Integration</span>
                  <span class="feature-badge experimental">Experimental</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-llm-features" checked>
                  <span>LLM-Powered Features</span>
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
            <p class="tab-description">Click on a shortcut field to assign a key combination. All shortcuts are empty by default.</p>

            <div class="shortcuts-info" style="background: #f0f9ff; border: 1px solid #0ea5e9; padding: 12px; border-radius: 6px; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 13px; color: #0c4a6e;">
                <strong>💡 Tip:</strong> Shortcuts must include a modifier key (Ctrl, Alt, or Shift). Chrome reserved shortcuts (like Ctrl+T) cannot be used.
              </p>
            </div>

            <div class="shortcuts-actions" style="margin-bottom: 20px; display: flex; gap: 12px;">
              <button id="btn-clear-all-shortcuts" class="btn-secondary" style="padding: 8px 16px;">
                🗑️ Clear All
              </button>
            </div>

            <div class="shortcuts-grid" id="keyboard-shortcuts-grid">
              <!-- Shortcuts will be dynamically populated here -->
            </div>

          </div>

          <!-- Appearance Tab -->
          <!-- Preferences Tab (merged Appearance + Profiles) -->
          <div id="tab-preferences" class="tab-content">
            <h3>Preferences</h3>
            <p class="tab-description">Customize appearance and manage profiles</p>

            <!-- UI Preferences Section -->
            <div class="preferences-section">
              <h4>UI Preferences</h4>
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

            <!-- Profile Management Section -->
            <div class="preferences-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0;">
              <h4>Profile Management</h4>
              <div class="profiles-section-modal">
              <!-- Active Profile Selection -->
              <div class="profile-select-group">
                <label for="modal-profile-select" class="profile-label">Active Profile:</label>
                <select id="modal-profile-select" class="profile-select-modal">
                  <!-- Populated dynamically -->
                </select>
              </div>

              <!-- Profile Description -->
              <div id="profile-description-modal" class="profile-description-modal">
                <p>Select a profile to see its description</p>
              </div>

              <!-- Profile Actions -->
              <div class="profile-actions-modal">
                <button id="btn-profile-save-modal" class="profile-btn profile-btn-primary" title="Save current settings to a new profile">
                  <span class="profile-btn-icon">💾</span>
                  Save Current
                </button>
                <button id="btn-profile-delete-modal" class="profile-btn profile-btn-danger" title="Delete selected profile">
                  <span class="profile-btn-icon">🗑️</span>
                  Delete
                </button>
              </div>

              <!-- Import/Export -->
              <div class="profile-io-modal">
                <h4>Import & Export</h4>
                <div class="profile-io-buttons">
                  <button id="btn-profile-export-modal" class="profile-btn profile-btn-secondary">
                    <span class="profile-btn-icon">📤</span>
                    Export All Profiles
                  </button>
                  <button id="btn-profile-import-modal" class="profile-btn profile-btn-secondary">
                    <span class="profile-btn-icon">📥</span>
                    Import Profiles
                  </button>
                  <input type="file" id="profile-import-input-modal" accept=".json" style="display: none;">
                </div>
              </div>

              <!-- Default Profiles List -->
              <div class="profile-presets-modal">
                <h4>Available Presets</h4>
                <div class="preset-list">
                  <div class="preset-item" data-preset="ADHD Focus" style="cursor: pointer;">
                    <span class="preset-icon">🎯</span>
                    <div class="preset-info">
                      <strong>ADHD Focus</strong>
                      <span>Pomodoro timer, progress tracking, simplified interface</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Autism Comfort" style="cursor: pointer;">
                    <span class="preset-icon">🧘</span>
                    <div class="preset-info">
                      <strong>Autism Comfort</strong>
                      <span>Reduced motion, calm colors, predictable behavior</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Dyslexia Support" style="cursor: pointer;">
                    <span class="preset-icon">📖</span>
                    <div class="preset-info">
                      <strong>Dyslexia Support</strong>
                      <span>OpenDyslexic font, wide spacing, reading progress</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Night Study" style="cursor: pointer;">
                    <span class="preset-icon">🌙</span>
                    <div class="preset-info">
                      <strong>Night Study</strong>
                      <span>Dark mode, reduced eye strain, Pomodoro timer</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Sensory Sensitive" style="cursor: pointer;">
                    <span class="preset-icon">🌿</span>
                    <div class="preset-info">
                      <strong>Sensory Sensitive</strong>
                      <span>No animations, muted colors, media blocking</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Anxiety Calm" style="cursor: pointer;">
                    <span class="preset-icon">💫</span>
                    <div class="preset-info">
                      <strong>Anxiety Calm</strong>
                      <span>Gentle pacing, focus mode, calming colors</span>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>

          <!-- AI Tab -->
          <div id="tab-ai" class="tab-content">
            <h3>🤖 AI Configuration</h3>
            <p class="tab-description">Configure AI features and API settings</p>

            <!-- AI Mode Selection -->
            <section class="ai-mode-section">
              <h4>AI Mode</h4>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" name="ai-mode" value="local" checked>
                  <span>Local AI (Ollama)</span>
                  <span class="mode-description">100% private, runs on your computer</span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="ai-mode" value="cloud">
                  <span>Cloud AI</span>
                  <span class="mode-description">Enhanced quality, requires API key</span>
                </label>
              </div>
            </section>

            <!-- Cloud AI Provider (shown when cloud mode selected) -->
            <section id="cloud-provider-section" class="ai-subsection hidden">
              <h4>Cloud Provider</h4>
              <select id="cloud-provider" class="ai-select" disabled style="opacity: 0.6; cursor: not-allowed;">
                <option value="anthropic">Anthropic (Claude) - Embedded API Key</option>
              </select>
              <p class="subsection-description" style="margin-top: 4px; color: #666; font-size: 12px;">Using built-in API key for seamless experience</p>

              <h4 style="margin-top: 16px;">Claude Model</h4>
              <select id="cloud-model-select" class="ai-select">
                <option value="haiku-4.5">Haiku 4.5 (Fast & Economical)</option>
                <option value="sonnet-4.5" selected>Sonnet 4.5 (Balanced - Recommended)</option>
                <option value="opus-4.5">Opus 4.5 (Most Capable)</option>
              </select>
              <p class="subsection-description" style="margin-top: 4px;">Select the Claude model for all AI features</p>
            </section>

            <!-- Local AI Configuration (shown when local mode selected) -->
            <section id="local-ai-section" class="ai-subsection">
              <h4>Ollama Status</h4>
              <div id="ollama-status" class="status-indicator">
                <span class="status-dot"></span>
                <span class="status-text">Checking...</span>
              </div>

              <h4 style="margin-top: 16px;">Available Models</h4>
              <select id="local-model-select" class="ai-select" multiple size="5">
                <!-- Populated dynamically -->
              </select>
              <button id="install-model" class="ai-btn ai-btn-secondary" style="margin-top: 8px;">Install New Model</button>
            </section>

            <!-- Model Selection Per Feature -->
            <section class="feature-models-section" style="margin-top: 24px;">
              <h4>Model Preferences</h4>
              <p class="subsection-description">Choose which model to use for each AI feature</p>

              <div class="model-preference-grid">
                <label class="model-pref-label">
                  Summarization:
                  <select class="model-select" data-feature="summarize">
                    <option value="auto">Auto (Recommended)</option>
                  </select>
                </label>
                <label class="model-pref-label">
                  Text Simplification:
                  <select class="model-select" data-feature="simplify">
                    <option value="auto">Auto (Recommended)</option>
                  </select>
                </label>
                <label class="model-pref-label">
                  Socratic Tutor:
                  <select class="model-select" data-feature="tutor">
                    <option value="auto">Auto (Recommended)</option>
                  </select>
                </label>
                <label class="model-pref-label">
                  Assignment Breakdown:
                  <select class="model-select" data-feature="breakdown">
                    <option value="auto">Auto (Recommended)</option>
                  </select>
                </label>
              </div>
            </section>

            <!-- Usage Statistics (for cloud mode) -->
            <section id="usage-stats-section" class="ai-subsection hidden" style="margin-top: 24px;">
              <h4>Usage Statistics</h4>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-label">Requests:</span>
                  <span class="stat-value" id="stat-requests">0</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Total Tokens:</span>
                  <span class="stat-value" id="stat-tokens">0</span>
                </div>
              </div>
              <div class="stats-actions" style="margin-top: 12px;">
                <button id="export-stats-json" class="ai-btn ai-btn-secondary">📤 Export JSON</button>
                <button id="export-stats-csv" class="ai-btn ai-btn-secondary">📊 Export CSV</button>
                <button id="clear-stats" class="ai-btn ai-btn-danger">🗑️ Clear Stats</button>
              </div>
            </section>
          </div>
        </div>

        <!-- Shortcut Recording Overlay -->
        <div id="shortcut-recording-overlay" class="recording-overlay">
          <div class="recording-box">
            <h3 class="recording-title">Record Keyboard Shortcut</h3>
            <p class="recording-subtitle">Press a key combination with at least one modifier key</p>

            <div class="recording-current">
              <span class="recording-label">Current:</span>
              <kbd id="recording-current-key" class="shortcut-display">None</kbd>
            </div>

            <div class="modifier-keys">
              <span class="modifier-key" data-key="ctrl">Ctrl</span>
              <span class="modifier-key" data-key="alt">Alt</span>
              <span class="modifier-key" data-key="shift">Shift</span>
            </div>

            <div class="recording-new">
              <span class="recording-label">New Shortcut:</span>
              <div id="recording-display" class="shortcut-display">Press keys...</div>
            </div>

            <div id="recording-error" class="recording-error"></div>

            <div class="recording-actions">
              <button id="btn-recording-clear" class="btn-secondary">Clear</button>
              <button id="btn-recording-cancel" class="btn-secondary">Cancel</button>
              <button id="btn-recording-save" class="btn-primary" disabled>Save</button>
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

    // Setup profiles tab
    this.setupProfilesTab(modal);

    // Setup AI tab
    this.setupAITab(modal);
  }

  /**
   * Setup the Profiles tab in the advanced settings modal
   * @param {HTMLElement} modal - The modal element
   */
  setupProfilesTab(modal) {
    // Populate the profile selector
    this.populateModalProfileSelector(modal);

    // Profile selector change handler
    const profileSelect = modal.querySelector('#modal-profile-select');
    if (profileSelect) {
      profileSelect.addEventListener('change', e => {
        this.profiles_loadProfile(e.target.value);
        this.updateProfileDescription(modal, e.target.value);
      });
    }

    // Save profile button
    const saveBtn = modal.querySelector('#btn-profile-save-modal');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.profiles_showSaveModal();
        // Refresh selector after save
        setTimeout(() => this.populateModalProfileSelector(modal), 500);
      });
    }

    // Delete profile button
    const deleteBtn = modal.querySelector('#btn-profile-delete-modal');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.profiles_confirmDelete();
        // Refresh selector after delete
        setTimeout(() => this.populateModalProfileSelector(modal), 500);
      });
    }

    // Export profiles button
    const exportBtn = modal.querySelector('#btn-profile-export-modal');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.profiles_export();
      });
    }

    // Import profiles button
    const importBtn = modal.querySelector('#btn-profile-import-modal');
    const importInput = modal.querySelector('#profile-import-input-modal');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => {
        importInput.click();
      });

      importInput.addEventListener('change', async e => {
        if (e.target.files[0]) {
          await this.profiles_import(e.target.files[0]);
          this.populateModalProfileSelector(modal);
          e.target.value = ''; // Reset file input
        }
      });
    }

    // Preset profile click handlers
    const presetItems = modal.querySelectorAll('.preset-item[data-preset]');
    presetItems.forEach(item => {
      item.addEventListener('click', () => {
        const presetName = item.getAttribute('data-preset');
        if (confirm(`Load the "${presetName}" preset profile?\n\nThis will apply all settings from this preset.`)) {
          this.profiles_loadProfile(presetName);
          // Update the profile selector to show the loaded preset
          const profileSelect = modal.querySelector('#modal-profile-select');
          if (profileSelect) {
            profileSelect.value = presetName;
            this.updateProfileDescription(modal, presetName);
          }
        }
      });

      // Add hover effect
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f0f0f0';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = '';
      });
    });

    // Initialize profile description
    const currentProfile = this.currentProfileName || 'Default';
    this.updateProfileDescription(modal, currentProfile);
  }

  /**
   * Populate the profile selector in the modal
   * @param {HTMLElement} modal - The modal element
   */
  populateModalProfileSelector(modal) {
    const selector = modal.querySelector('#modal-profile-select');
    if (!selector) {
      return;
    }

    // Get profiles from storage
    chrome.storage.local.get('assist_profiles', result => {
      const profiles = result.assist_profiles || this.profiles_createDefaults();
      const currentProfile = this.currentProfileName || 'Default';

      selector.innerHTML = '';

      Object.entries(profiles).forEach(([name, profile]) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = profile.displayName || name;
        if (name === currentProfile) {
          option.selected = true;
        }
        selector.appendChild(option);
      });
    });
  }

  /**
   * Update the profile description in the modal
   * @param {HTMLElement} modal - The modal element
   * @param {string} profileName - The selected profile name
   */
  updateProfileDescription(modal, profileName) {
    const descriptionEl = modal.querySelector('#profile-description-modal p');
    if (!descriptionEl) {
      return;
    }

    chrome.storage.local.get('assist_profiles', result => {
      const profiles = result.assist_profiles || {};
      const profile = profiles[profileName];

      if (profile && profile.description) {
        descriptionEl.textContent = profile.description;
      } else {
        // Default descriptions for built-in profiles
        const defaultDescriptions = {
          Default: 'Standard settings with all features available.',
          'ADHD Focus':
            'Optimized for focus and productivity with Pomodoro timer, progress tracking, and simplified interface.',
          'Autism Comfort':
            'Calm, predictable environment with reduced motion, gentle colors, and consistent behavior.',
          'Dyslexia Support':
            'Enhanced readability with OpenDyslexic font, increased spacing, and reading progress indicator.',
          'Sensory Sensitive':
            'Minimal sensory input with no animations, muted colors, and auto-playing media blocked.',
          'Night Study':
            'Reduced eye strain with dark mode, warm colors, and Pomodoro timer for study sessions.',
          'Anxiety Calm':
            'Gentle, non-overwhelming interface with calm colors and predictable interactions.',
        };
        descriptionEl.textContent =
          defaultDescriptions[profileName] || 'Custom profile with user-defined settings.';
      }
    });
  }

  /**
   * Setup the AI tab in the advanced settings modal
   * @param {HTMLElement} modal - The modal element
   */
  setupAITab(modal) {
    // AI mode radio buttons
    const localRadio = modal.querySelector('[name="ai-mode"][value="local"]');
    const cloudRadio = modal.querySelector('[name="ai-mode"][value="cloud"]');
    const cloudSection = modal.querySelector('#cloud-provider-section');
    const localSection = modal.querySelector('#local-ai-section');
    const usageSection = modal.querySelector('#usage-stats-section');

    // Load current AI mode from storage
    chrome.storage.local.get(['cloudModeEnabled'], (result) => {
      const isCloud = result.cloudModeEnabled || false;
      if (isCloud) {
        cloudRadio.checked = true;
        this.switchToCloudMode(modal);
      } else {
        localRadio.checked = true;
        this.switchToLocalMode(modal);
      }
    });

    // AI mode change handlers
    localRadio.addEventListener('change', () => this.switchToLocalMode(modal));
    cloudRadio.addEventListener('change', () => this.switchToCloudMode(modal));

    // Cloud provider dropdown
    const providerSelect = modal.querySelector('#cloud-provider');
    if (providerSelect) {
      providerSelect.addEventListener('change', (e) => {
        this.updateCloudProvider(e.target.value);
      });
    }

    // Cloud model selection dropdown
    const cloudModelSelect = modal.querySelector('#cloud-model-select');
    if (cloudModelSelect) {
      // Load saved cloud model preference
      chrome.storage.local.get(['cloudModel'], (result) => {
        if (result.cloudModel) {
          cloudModelSelect.value = result.cloudModel;
        }
      });

      // Save cloud model selection
      cloudModelSelect.addEventListener('change', (e) => {
        chrome.storage.local.set({ cloudModel: e.target.value });
      });
    }

    // API key test button
    const testBtn = modal.querySelector('#test-api-key');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        const apiKeyInput = modal.querySelector('#api-key-input');
        const provider = modal.querySelector('#cloud-provider').value;
        await this.testAPIKey(provider, apiKeyInput.value, modal);
      });
    }

    // Install model button
    const installModelBtn = modal.querySelector('#install-model');
    if (installModelBtn) {
      installModelBtn.addEventListener('click', () => {
        this.showInstallModelDialog();
      });
    }

    // Usage stats export buttons
    const exportJsonBtn = modal.querySelector('#export-stats-json');
    const exportCsvBtn = modal.querySelector('#export-stats-csv');
    const clearStatsBtn = modal.querySelector('#clear-stats');

    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', () => this.exportUsageStats('json'));
    }
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => this.exportUsageStats('csv'));
    }
    if (clearStatsBtn) {
      clearStatsBtn.addEventListener('click', () => this.clearUsageStats());
    }

    // Initialize Ollama status check
    this.checkOllamaStatus(modal);
  }

  /**
   * Switch to Local AI mode
   * @param {HTMLElement} modal - The modal element
   */
  switchToLocalMode(modal) {
    const cloudSection = modal.querySelector('#cloud-provider-section');
    const localSection = modal.querySelector('#local-ai-section');
    const usageSection = modal.querySelector('#usage-stats-section');
    const modelPrefsSection = modal.querySelector('.feature-models-section');

    cloudSection.classList.add('hidden');
    usageSection.classList.add('hidden');
    localSection.classList.remove('hidden');
    if (modelPrefsSection) modelPrefsSection.classList.remove('hidden');

    chrome.storage.local.set({ cloudModeEnabled: false });
  }

  /**
   * Switch to Cloud AI mode
   * @param {HTMLElement} modal - The modal element
   */
  switchToCloudMode(modal) {
    const cloudSection = modal.querySelector('#cloud-provider-section');
    const localSection = modal.querySelector('#local-ai-section');
    const usageSection = modal.querySelector('#usage-stats-section');
    const modelPrefsSection = modal.querySelector('.feature-models-section');

    cloudSection.classList.remove('hidden');
    usageSection.classList.remove('hidden');
    localSection.classList.add('hidden');
    if (modelPrefsSection) modelPrefsSection.classList.add('hidden');

    chrome.storage.local.set({ cloudModeEnabled: true });
  }

  /**
   * Update cloud provider selection
   * @param {string} provider - The selected provider (anthropic/openai/google)
   */
  updateCloudProvider(provider) {
    chrome.storage.local.set({ cloudProvider: provider });
  }

  /**
   * Test API key connection
   * @param {string} provider - The cloud provider
   * @param {string} apiKey - The API key to test
   * @param {HTMLElement} modal - The modal element
   */
  async testAPIKey(provider, apiKey, modal) {
    if (!apiKey) {
      alert('Please enter an API key');
      return;
    }

    const testBtn = modal.querySelector('#test-api-key');
    const originalText = testBtn.textContent;
    testBtn.textContent = 'Testing...';
    testBtn.disabled = true;

    try {
      // Import API key manager
      const { saveAPIKey, testConnection } = await import('../core/storage/api-key-manager.js');

      // Test connection
      const isValid = await testConnection(provider, apiKey);

      if (isValid) {
        // Save encrypted API key
        await saveAPIKey(provider, apiKey);
        alert('✅ Connection successful! API key saved.');
      } else {
        alert('❌ Connection failed. Please check your API key.');
      }
    } catch (error) {
      console.error('API key test failed:', error);
      alert('❌ Connection failed: ' + error.message);
    } finally {
      testBtn.textContent = originalText;
      testBtn.disabled = false;
    }
  }

  /**
   * Show install model dialog
   */
  showInstallModelDialog() {
    const modelName = prompt('Enter model name to install (e.g., llama3.2):');
    if (modelName) {
      alert(`Installing model: ${modelName}\n\nRun this in your terminal:\n\nollama pull ${modelName}`);
    }
  }

  /**
   * Check Ollama status
   * @param {HTMLElement} modal - The modal element
   */
  async checkOllamaStatus(modal) {
    const statusDot = modal.querySelector('#ollama-status .status-dot');
    const statusText = modal.querySelector('#ollama-status .status-text');

    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (response.ok) {
        const data = await response.json();
        statusDot.style.backgroundColor = '#10b981';
        statusText.textContent = `Connected (${data.models?.length || 0} models)`;

        // Populate model list
        this.populateModelList(modal, data.models || []);
      } else {
        throw new Error('Ollama not responding');
      }
    } catch (error) {
      statusDot.style.backgroundColor = '#ef4444';
      statusText.textContent = 'Not connected';
    }
  }

  /**
   * Populate model list
   * @param {HTMLElement} modal - The modal element
   * @param {Array} models - List of Ollama models
   */
  populateModelList(modal, models) {
    const modelSelect = modal.querySelector('#local-model-select');
    if (!modelSelect) return;

    modelSelect.innerHTML = '';

    if (models.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No models installed';
      option.disabled = true;
      modelSelect.appendChild(option);
    } else {
      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.name;
        modelSelect.appendChild(option);
      });
    }

    // Also populate feature-specific model preference dropdowns
    const featureModelSelects = modal.querySelectorAll('.model-select[data-feature]');
    featureModelSelects.forEach(select => {
      // Clear existing options
      select.innerHTML = '';

      // Add "Auto (Recommended)" option as default
      const autoOption = document.createElement('option');
      autoOption.value = 'auto';
      autoOption.textContent = 'Auto (Recommended)';
      select.appendChild(autoOption);

      // Add available Ollama models
      if (models.length > 0) {
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model.name;
          option.textContent = model.name;
          select.appendChild(option);
        });
      }
    });
  }

  /**
   * Export usage statistics
   * @param {string} format - 'json' or 'csv'
   */
  exportUsageStats(format) {
    chrome.storage.local.get(['usageStats'], (result) => {
      const stats = result.usageStats || { requests: 0, tokens: 0, history: [] };

      let content, filename, mimeType;

      if (format === 'json') {
        content = JSON.stringify(stats, null, 2);
        filename = `assist-usage-stats-${Date.now()}.json`;
        mimeType = 'application/json';
      } else {
        // CSV format
        content = 'Date,Feature,Requests,Tokens\n';
        stats.history?.forEach(entry => {
          content += `${entry.date},${entry.feature},${entry.requests},${entry.tokens}\n`;
        });
        filename = `assist-usage-stats-${Date.now()}.csv`;
        mimeType = 'text/csv';
      }

      // Download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  /**
   * Clear usage statistics
   */
  clearUsageStats() {
    if (confirm('Clear all usage statistics? This cannot be undone.')) {
      chrome.storage.local.set({
        usageStats: { requests: 0, tokens: 0, history: [] }
      }, () => {
        alert('Usage statistics cleared.');
        document.querySelector('#stat-requests').textContent = '0';
        document.querySelector('#stat-tokens').textContent = '0';
      });
    }
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
    loadCheckbox('show-dark-mode', 'show_dark_mode'); // Dark Mode
    loadCheckbox('show-simplify', 'show_simplify'); // Simplified Interface
    loadCheckbox('show-reading-progress', 'show_reading_progress'); // Reading Progress Tracker
    loadCheckbox('show-pomodoro', 'show_pomodoro'); // Pomodoro Timer
    loadCheckbox('show-stargardt', 'show_stargardt'); // Stargardt Support
    loadCheckbox('show-reduced-motion', 'show_reduced_motion'); // Reduced Motion
    loadCheckbox('show-media-control', 'show_media_control'); // Media Control

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
    const grid = document.getElementById('keyboard-shortcuts-grid');

    if (!grid) {
      console.warn('[Popup] Keyboard shortcuts grid not found');
      return;
    }

    // Shortcut categories for grouping
    const categories = {
      tts_play_pause: 'TTS Controls',
      tts_stop: 'TTS Controls',
      ocr_activate: 'Reading',
      reading_mode_toggle: 'Reading',
      reading_mode_exit: 'Reading',
      dictionary_lookup: 'Lookup Tools',
      text_stats_toggle: 'Reading',
      highlight_menu_toggle: 'Lookup Tools',
      sticky_note_create: 'Writing',
      translation_toggle: 'Lookup Tools',
      focus_mode_toggle: 'Display',
      reading_guide_toggle: 'Display',
      screen_overlay_toggle: 'Display',
      dyslexia_mode_toggle: 'Display',
    };

    // Clear existing cards
    grid.innerHTML = '';

    // Create a card for each shortcut
    for (const [key, shortcut] of Object.entries(shortcuts)) {
      const card = document.createElement('div');
      card.className = 'shortcut-card';
      card.setAttribute('data-shortcut', key);

      const displayShortcut = shortcut || 'Not set';
      const isEmpty = !shortcut;

      card.innerHTML = `
        <div class="shortcut-header">
          <span class="shortcut-category">${categories[key] || 'General'}</span>
        </div>
        <div class="shortcut-body">
          <span class="shortcut-name">${SHORTCUT_LABELS[key] || key}</span>
          <kbd class="shortcut-key${isEmpty ? ' empty' : ''}">${displayShortcut}</kbd>
        </div>
        <div class="shortcut-footer">
          <button class="shortcut-edit-btn" data-key="${key}" title="Click to assign shortcut">
            <span class="btn-icon">✏️</span>
            <span class="btn-text">Assign</span>
          </button>
          ${!isEmpty ? `<button class="shortcut-clear-btn" data-key="${key}" title="Clear shortcut">🗑️</button>` : ''}
        </div>
      `;

      grid.appendChild(card);
    }

    // Add event listeners to edit buttons
    grid.querySelectorAll('.shortcut-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const key = e.currentTarget.getAttribute('data-key');
        this.startShortcutRecording(key, shortcuts);
      });
    });

    // Add event listeners to clear buttons
    grid.querySelectorAll('.shortcut-clear-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        const key = e.currentTarget.getAttribute('data-key');
        shortcuts[key] = '';
        await saveShortcuts(shortcuts);
        this.loadKeyboardShortcuts();
        this.updateStatus(`Cleared shortcut: ${SHORTCUT_LABELS[key]}`);
      });
    });

    // Clear all shortcuts button
    const clearAllBtn = document.getElementById('btn-clear-all-shortcuts');
    if (clearAllBtn) {
      clearAllBtn.onclick = async () => {
        if (confirm('Clear all keyboard shortcuts? This cannot be undone.')) {
          const emptyShortcuts = {};
          for (const key of Object.keys(shortcuts)) {
            emptyShortcuts[key] = '';
          }
          await saveShortcuts(emptyShortcuts);
          this.loadKeyboardShortcuts();
          this.updateStatus('All shortcuts cleared');
        }
      };
    }

    // Setup preset buttons
    this.setupShortcutPresets();
  }

  /**
   * Setup shortcut preset buttons
   */
  setupShortcutPresets() {
    const presetBtns = document.querySelectorAll('.preset-btn');

    presetBtns.forEach(btn => {
      btn.addEventListener('click', async e => {
        const preset = e.target.getAttribute('data-preset');

        // Update active state
        presetBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // Apply preset
        await this.applyShortcutPreset(preset);
      });
    });
  }

  /**
   * Apply a shortcut preset
   * @param {string} preset - Preset name (default, minimal, oneHanded)
   */
  async applyShortcutPreset(preset) {
    const presets = {
      default: {
        tts_play_pause: 'Ctrl+Shift+Space',
        tts_stop: 'Ctrl+Shift+S',
        ocr_activate: 'Alt+O',
        reading_mode_toggle: 'Ctrl+Shift+R',
        reading_mode_exit: 'Escape',
        dictionary_lookup: 'Ctrl+Shift+D',
      },
      minimal: {
        tts_play_pause: 'Ctrl+Space',
        tts_stop: '',
        ocr_activate: '',
        reading_mode_toggle: 'Ctrl+R',
        reading_mode_exit: 'Escape',
        dictionary_lookup: '',
      },
      oneHanded: {
        tts_play_pause: 'Alt+Q',
        tts_stop: 'Alt+W',
        ocr_activate: 'Alt+E',
        reading_mode_toggle: 'Alt+A',
        reading_mode_exit: 'Escape',
        dictionary_lookup: 'Alt+S',
      },
    };

    const selectedPreset = presets[preset];
    if (!selectedPreset) {
      return;
    }

    // Save preset shortcuts
    for (const [key, value] of Object.entries(selectedPreset)) {
      await updateShortcut(key, value);
    }

    // Reload the shortcuts display
    this.loadKeyboardShortcuts();
    this.updateStatus(`Applied "${preset}" shortcut preset`);
  }

  startShortcutRecording(featureKey, currentShortcuts) {
    const overlay = document.getElementById('shortcut-recording-overlay');
    const display = document.getElementById('recording-display');
    const currentKeyDisplay = document.getElementById('recording-current-key');
    const errorDiv = document.getElementById('recording-error');
    const saveBtn = document.getElementById('btn-recording-save');
    const cancelBtn = document.getElementById('btn-recording-cancel');
    const clearBtn = document.getElementById('btn-recording-clear');
    const modifierKeys = document.querySelectorAll('.modifier-key');

    if (!overlay) {
      return;
    }

    // Show overlay with active class
    overlay.classList.add('active');

    // Show current shortcut
    const currentShortcut = currentShortcuts[featureKey] || 'None';
    if (currentKeyDisplay) {
      currentKeyDisplay.textContent = currentShortcut;
    }

    // Reset state
    display.textContent = 'Press keys...';
    errorDiv.textContent = '';
    saveBtn.disabled = true;

    // Reset modifier key highlights
    modifierKeys.forEach(key => key.classList.remove('active'));

    let recordedShortcut = null;
    let isValid = false;

    // Update modifier key visuals
    const updateModifierVisuals = e => {
      modifierKeys.forEach(key => {
        const keyName = key.getAttribute('data-key');
        if (keyName === 'ctrl' && e.ctrlKey) {
          key.classList.add('active');
        } else if (keyName === 'alt' && e.altKey) {
          key.classList.add('active');
        } else if (keyName === 'shift' && e.shiftKey) {
          key.classList.add('active');
        } else if (!e.ctrlKey && keyName === 'ctrl') {
          key.classList.remove('active');
        } else if (!e.altKey && keyName === 'alt') {
          key.classList.remove('active');
        } else if (!e.shiftKey && keyName === 'shift') {
          key.classList.remove('active');
        }
      });
    };

    // Keyboard event handler
    const handleKeyPress = e => {
      e.preventDefault();
      e.stopPropagation();

      // Update modifier visuals
      updateModifierVisuals(e);

      // Convert event to shortcut string
      recordedShortcut = eventToShortcut(e);
      display.textContent = recordedShortcut;

      // Validate shortcut
      const validation = validateShortcut(recordedShortcut, currentShortcuts, featureKey);

      if (validation.valid) {
        errorDiv.textContent = '';
        errorDiv.style.color = '#059669';
        errorDiv.textContent = '✓ Valid shortcut';
        saveBtn.disabled = false;
        isValid = true;
      } else {
        errorDiv.style.color = '#dc2626';
        errorDiv.textContent = validation.error;
        saveBtn.disabled = true;
        isValid = false;
      }
    };

    // Key up handler to update modifier visuals
    const handleKeyUp = e => {
      updateModifierVisuals(e);
    };

    // Add keyboard listeners
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keyup', handleKeyUp);

    // Close overlay function
    const closeOverlay = () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('keyup', handleKeyUp);
      overlay.classList.remove('active');
      modifierKeys.forEach(key => key.classList.remove('active'));
    };

    // Cancel button
    cancelBtn.onclick = closeOverlay;

    // Clear button
    if (clearBtn) {
      clearBtn.onclick = () => {
        recordedShortcut = null;
        display.textContent = 'Press keys...';
        errorDiv.textContent = '';
        saveBtn.disabled = true;
        modifierKeys.forEach(key => key.classList.remove('active'));
      };
    }

    // Save button
    saveBtn.onclick = async () => {
      if (isValid && recordedShortcut) {
        // Update shortcuts
        currentShortcuts[featureKey] = recordedShortcut;
        await saveShortcuts(currentShortcuts);

        // Reload the shortcuts grid
        this.loadKeyboardShortcuts();

        // Close overlay
        closeOverlay();

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
    saveCheckbox('show-dark-mode', 'show_dark_mode'); // Dark Mode
    saveCheckbox('show-simplify', 'show_simplify'); // Simplified Interface
    saveCheckbox('show-reading-progress', 'show_reading_progress'); // Reading Progress Tracker
    saveCheckbox('show-pomodoro', 'show_pomodoro'); // Pomodoro Timer
    saveCheckbox('show-stargardt', 'show_stargardt'); // Stargardt Support
    saveCheckbox('show-reduced-motion', 'show_reduced_motion'); // Reduced Motion
    saveCheckbox('show-media-control', 'show_media_control'); // Media Control

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
  // NEURODIVERGENT PROFILE FEATURE: DARK MODE
  // ============================================================
  setupDarkMode() {
    if (!this.settings.darkMode) {
      this.settings.darkMode = {
        enabled: false,
        preset: 'dark-gray',
        respectSystemPreference: true,
      };
    }

    const darkModeEnabled = document.getElementById('dark-mode-enabled');
    const darkModeDescription = document.getElementById('dark-mode-description');
    const darkModeOptions = document.getElementById('dark-mode-options');

    darkModeEnabled.checked = this.settings.darkMode.enabled || false;

    if (darkModeEnabled.checked) {
      darkModeDescription.classList.remove('hidden');
      darkModeOptions.classList.remove('hidden');
    } else {
      darkModeDescription.classList.add('hidden');
      darkModeOptions.classList.add('hidden');
    }

    darkModeEnabled.addEventListener('change', e => {
      this.settings.darkMode.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        darkModeDescription.classList.remove('hidden');
        darkModeOptions.classList.remove('hidden');
      } else {
        darkModeDescription.classList.add('hidden');
        darkModeOptions.classList.add('hidden');
      }
    });

    const presetSelect = document.getElementById('dark-mode-preset');
    presetSelect.value = this.settings.darkMode.preset || 'dark-gray';
    presetSelect.addEventListener('change', e => {
      this.settings.darkMode.preset = e.target.value;
      this.saveSettings();
    });

    const systemToggle = document.getElementById('dark-mode-system');
    systemToggle.checked = this.settings.darkMode.respectSystemPreference !== false;
    systemToggle.addEventListener('change', e => {
      this.settings.darkMode.respectSystemPreference = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Dark Mode initialized');
  }

  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: SIMPLIFIED INTERFACE
  // ============================================================
  setupSimplify() {
    if (!this.settings.simplify) {
      this.settings.simplify = {
        enabled: false,
        intensity: 'moderate',
        focusMainContent: true,
        hideAds: true,
        hideSidebars: true,
        hideComments: true,
        hideRelated: true,
        hideFooters: true,
        hideSocialButtons: true,
        hidePopups: true,
        hideAnimations: true,
      };
    }

    const simplifyEnabled = document.getElementById('simplify-enabled');
    const simplifyDescription = document.getElementById('simplify-description');
    const simplifyOptions = document.getElementById('simplify-options');

    simplifyEnabled.checked = this.settings.simplify.enabled || false;

    if (simplifyEnabled.checked) {
      simplifyDescription.classList.remove('hidden');
      simplifyOptions.classList.remove('hidden');
    } else {
      simplifyDescription.classList.add('hidden');
      simplifyOptions.classList.add('hidden');
    }

    simplifyEnabled.addEventListener('change', e => {
      this.settings.simplify.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        simplifyDescription.classList.remove('hidden');
        simplifyOptions.classList.remove('hidden');
      } else {
        simplifyDescription.classList.add('hidden');
        simplifyOptions.classList.add('hidden');
      }
    });

    const intensitySelect = document.getElementById('simplify-intensity');
    intensitySelect.value = this.settings.simplify.intensity || 'moderate';
    intensitySelect.addEventListener('change', e => {
      this.settings.simplify.intensity = e.target.value;
      this.saveSettings();
    });

    const focusContentToggle = document.getElementById('simplify-focus-content');
    focusContentToggle.checked = this.settings.simplify.focusMainContent !== false;
    focusContentToggle.addEventListener('change', e => {
      this.settings.simplify.focusMainContent = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Simplified Interface initialized');
  }

  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: READING PROGRESS
  // ============================================================
  setupReadingProgress() {
    if (!this.settings.readingProgress) {
      this.settings.readingProgress = {
        enabled: false,
        position: 'top',
        height: 4,
        color: '#4CAF50',
        backgroundColor: 'rgba(0,0,0,0.1)',
        showPercentage: false,
        smoothScroll: true,
        hideOnComplete: false,
      };
    }

    const progressEnabled = document.getElementById('reading-progress-enabled');
    const progressDescription = document.getElementById('reading-progress-description');
    const progressOptions = document.getElementById('reading-progress-options');

    progressEnabled.checked = this.settings.readingProgress.enabled || false;

    if (progressEnabled.checked) {
      progressDescription.classList.remove('hidden');
      progressOptions.classList.remove('hidden');
    } else {
      progressDescription.classList.add('hidden');
      progressOptions.classList.add('hidden');
    }

    progressEnabled.addEventListener('change', e => {
      this.settings.readingProgress.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        progressDescription.classList.remove('hidden');
        progressOptions.classList.remove('hidden');
      } else {
        progressDescription.classList.add('hidden');
        progressOptions.classList.add('hidden');
      }
    });

    const positionSelect = document.getElementById('reading-progress-position');
    positionSelect.value = this.settings.readingProgress.position || 'top';
    positionSelect.addEventListener('change', e => {
      this.settings.readingProgress.position = e.target.value;
      this.saveSettings();
    });

    const colorSelect = document.getElementById('reading-progress-color');
    colorSelect.value = this.settings.readingProgress.color || '#4CAF50';
    colorSelect.addEventListener('change', e => {
      this.settings.readingProgress.color = e.target.value;
      this.saveSettings();
    });

    const percentageToggle = document.getElementById('reading-progress-percentage');
    percentageToggle.checked = this.settings.readingProgress.showPercentage || false;
    percentageToggle.addEventListener('change', e => {
      this.settings.readingProgress.showPercentage = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Reading Progress initialized');
  }

  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: POMODORO TIMER
  // ============================================================
  setupPomodoro() {
    if (!this.settings.pomodoro) {
      this.settings.pomodoro = {
        enabled: false,
        workDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        sessionsUntilLongBreak: 4,
        autoStartBreaks: false,
        autoStartWork: false,
        showNotifications: true,
        playSound: true,
        position: 'bottom-right',
      };
    }

    const pomodoroEnabled = document.getElementById('pomodoro-enabled');
    const pomodoroDescription = document.getElementById('pomodoro-description');
    const pomodoroOptions = document.getElementById('pomodoro-options');

    pomodoroEnabled.checked = this.settings.pomodoro.enabled || false;

    if (pomodoroEnabled.checked) {
      pomodoroDescription.classList.remove('hidden');
      pomodoroOptions.classList.remove('hidden');
    } else {
      pomodoroDescription.classList.add('hidden');
      pomodoroOptions.classList.add('hidden');
    }

    pomodoroEnabled.addEventListener('change', e => {
      this.settings.pomodoro.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        pomodoroDescription.classList.remove('hidden');
        pomodoroOptions.classList.remove('hidden');
      } else {
        pomodoroDescription.classList.add('hidden');
        pomodoroOptions.classList.add('hidden');
      }
    });

    // Work Duration slider
    const workSlider = document.getElementById('pomodoro-work-duration');
    const workValue = document.getElementById('pomodoro-work-value');
    workSlider.value = this.settings.pomodoro.workDuration || 25;
    workValue.textContent = `${workSlider.value} min`;
    workSlider.addEventListener('input', e => {
      workValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.workDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Break Duration slider
    const breakSlider = document.getElementById('pomodoro-break-duration');
    const breakValue = document.getElementById('pomodoro-break-value');
    breakSlider.value = this.settings.pomodoro.shortBreakDuration || 5;
    breakValue.textContent = `${breakSlider.value} min`;
    breakSlider.addEventListener('input', e => {
      breakValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.shortBreakDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Long Break slider
    const longBreakSlider = document.getElementById('pomodoro-long-break');
    const longBreakValue = document.getElementById('pomodoro-long-break-value');
    longBreakSlider.value = this.settings.pomodoro.longBreakDuration || 15;
    longBreakValue.textContent = `${longBreakSlider.value} min`;
    longBreakSlider.addEventListener('input', e => {
      longBreakValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.longBreakDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Position select
    const positionSelect = document.getElementById('pomodoro-position');
    positionSelect.value = this.settings.pomodoro.position || 'bottom-right';
    positionSelect.addEventListener('change', e => {
      this.settings.pomodoro.position = e.target.value;
      this.saveSettings();
    });

    // Auto-start breaks toggle
    const autoBreaksToggle = document.getElementById('pomodoro-auto-start-breaks');
    autoBreaksToggle.checked = this.settings.pomodoro.autoStartBreaks || false;
    autoBreaksToggle.addEventListener('change', e => {
      this.settings.pomodoro.autoStartBreaks = e.target.checked;
      this.saveSettings();
    });

    // Sound toggle
    const soundToggle = document.getElementById('pomodoro-sound');
    soundToggle.checked = this.settings.pomodoro.playSound !== false;
    soundToggle.addEventListener('change', e => {
      this.settings.pomodoro.playSound = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Pomodoro Timer initialized');
  }

  // ============================================================
  // STARGARDT MODULE: CENTRAL VISION SUPPORT
  // ============================================================
  setupStargardt() {
    if (!this.settings.stargardt) {
      this.settings.stargardt = {
        enabled: false,
        mode: 'lite',
        setupComplete: false,
        remapping: {
          enabled: true,
          mode: 'peripheral-push',
          preferredSide: 'right',
        },
        textOptimization: {
          enabled: true,
          letterSpacing: 150,
          lineHeight: 200,
        },
        lightAdaptation: {
          enabled: true,
          targetBrightness: 70,
        },
      };
    }

    const stargardtEnabled = document.getElementById('stargardt-enabled');
    const stargardtDescription = document.getElementById('stargardt-description');
    const stargardtOptions = document.getElementById('stargardt-options');

    if (!stargardtEnabled) {
      console.log('[Popup] Stargardt section not found in DOM, skipping setup');
      return;
    }

    stargardtEnabled.checked = this.settings.stargardt.enabled || false;

    if (stargardtEnabled.checked) {
      stargardtDescription.classList.remove('hidden');
      stargardtOptions.classList.remove('hidden');
    } else {
      stargardtDescription.classList.add('hidden');
      stargardtOptions.classList.add('hidden');
    }

    // Main toggle
    stargardtEnabled.addEventListener('change', e => {
      this.settings.stargardt.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        stargardtDescription.classList.remove('hidden');
        stargardtOptions.classList.remove('hidden');
      } else {
        stargardtDescription.classList.add('hidden');
        stargardtOptions.classList.add('hidden');
      }
    });

    // Mode select
    const modeSelect = document.getElementById('stargardt-mode');
    const calibrateSection = document.getElementById('stargardt-calibrate-section');
    modeSelect.value = this.settings.stargardt.mode || 'lite';

    // Show/hide calibrate button based on mode
    if (modeSelect.value === 'advanced') {
      calibrateSection.style.display = 'block';
    } else {
      calibrateSection.style.display = 'none';
    }

    modeSelect.addEventListener('change', e => {
      this.settings.stargardt.mode = e.target.value;
      this.saveSettings();

      if (e.target.value === 'advanced') {
        calibrateSection.style.display = 'block';
      } else {
        calibrateSection.style.display = 'none';
      }
    });

    // Custom Cursor Settings
    const cursorEnabled = document.getElementById('stargardt-cursor-enabled');
    const cursorOptions = document.getElementById('stargardt-cursor-options');
    const cursorSizeSlider = document.getElementById('stargardt-cursor-size');
    const cursorSizeValue = document.getElementById('stargardt-cursor-size-value');
    const cursorStyleSelect = document.getElementById('stargardt-cursor-style');
    const cursorColorSelect = document.getElementById('stargardt-cursor-color');

    // Initialize cursor settings if not present
    if (!this.settings.stargardt.cursor) {
      this.settings.stargardt.cursor = {
        enabled: false,
        size: 32,
        style: 'crosshair',
        color: '#ff0000',
      };
    }

    // Set initial values
    cursorEnabled.checked = this.settings.stargardt.cursor.enabled || false;
    cursorSizeSlider.value = this.settings.stargardt.cursor.size || 32;
    cursorSizeValue.textContent = `${cursorSizeSlider.value}px`;
    cursorStyleSelect.value = this.settings.stargardt.cursor.style || 'crosshair';
    cursorColorSelect.value = this.settings.stargardt.cursor.color || '#ff0000';

    // Show/hide cursor options based on toggle
    if (cursorEnabled.checked) {
      cursorOptions.classList.remove('hidden');
    } else {
      cursorOptions.classList.add('hidden');
    }

    cursorEnabled.addEventListener('change', e => {
      this.settings.stargardt.cursor.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        cursorOptions.classList.remove('hidden');
      } else {
        cursorOptions.classList.add('hidden');
      }
    });

    cursorSizeSlider.addEventListener('input', e => {
      cursorSizeValue.textContent = `${e.target.value}px`;
      this.settings.stargardt.cursor.size = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    cursorStyleSelect.addEventListener('change', e => {
      this.settings.stargardt.cursor.style = e.target.value;
      this.saveSettings();
    });

    cursorColorSelect.addEventListener('change', e => {
      this.settings.stargardt.cursor.color = e.target.value;
      this.saveSettings();
    });

    // Remapping toggle
    const remappingToggle = document.getElementById('stargardt-remapping');
    const remappingOptions = document.getElementById('stargardt-remapping-options');
    remappingToggle.checked = this.settings.stargardt.remapping?.enabled !== false;

    if (remappingToggle.checked) {
      remappingOptions.style.display = 'block';
    } else {
      remappingOptions.style.display = 'none';
    }

    remappingToggle.addEventListener('change', e => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        remappingOptions.style.display = 'block';
      } else {
        remappingOptions.style.display = 'none';
      }
    });

    // Remapping mode select
    const remapModeSelect = document.getElementById('stargardt-remap-mode');
    const magnifyOptions = document.getElementById('stargardt-magnify-options');
    remapModeSelect.value = this.settings.stargardt.remapping?.mode || 'peripheral-push';

    // Show/hide magnify options based on current mode
    const updateMagnifyOptionsVisibility = mode => {
      if (mode === 'magnify-remap') {
        magnifyOptions.classList.remove('hidden');
      } else {
        magnifyOptions.classList.add('hidden');
      }
    };
    updateMagnifyOptionsVisibility(remapModeSelect.value);

    remapModeSelect.addEventListener('change', e => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.mode = e.target.value;
      this.saveSettings();
      updateMagnifyOptionsVisibility(e.target.value);
    });

    // Magnify Lens Settings
    const magnifyScaleSlider = document.getElementById('stargardt-magnify-scale');
    const magnifyScaleValue = document.getElementById('stargardt-magnify-scale-value');
    magnifyScaleSlider.value = this.settings.stargardt.remapping?.magnifyScale || 2;
    magnifyScaleValue.textContent = `${magnifyScaleSlider.value}x`;
    magnifyScaleSlider.addEventListener('input', e => {
      magnifyScaleValue.textContent = `${e.target.value}x`;
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifyScale = parseFloat(e.target.value);
      this.saveSettings();
    });

    const magnifySizeSlider = document.getElementById('stargardt-magnify-size');
    const magnifySizeValue = document.getElementById('stargardt-magnify-size-value');
    magnifySizeSlider.value = this.settings.stargardt.remapping?.magnifySize || 275;
    magnifySizeValue.textContent = `${magnifySizeSlider.value}px`;
    magnifySizeSlider.addEventListener('input', e => {
      magnifySizeValue.textContent = `${e.target.value}px`;
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifySize = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    const magnifyOffsetSlider = document.getElementById('stargardt-magnify-offset');
    const magnifyOffsetValue = document.getElementById('stargardt-magnify-offset-value');
    magnifyOffsetSlider.value = this.settings.stargardt.remapping?.magnifyOffset || 150;
    magnifyOffsetValue.textContent = `${magnifyOffsetSlider.value}px`;
    magnifyOffsetSlider.addEventListener('input', e => {
      magnifyOffsetValue.textContent = `${e.target.value}px`;
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifyOffset = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    const magnifyOffsetDirSelect = document.getElementById('stargardt-magnify-offset-dir');
    magnifyOffsetDirSelect.value = this.settings.stargardt.remapping?.magnifyOffsetDir || 'right';
    magnifyOffsetDirSelect.addEventListener('change', e => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifyOffsetDir = e.target.value;
      this.saveSettings();
    });

    const magnifyLockToggle = document.getElementById('stargardt-magnify-lock');
    magnifyLockToggle.checked = this.settings.stargardt.remapping?.magnifyLock === true;
    magnifyLockToggle.addEventListener('change', e => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifyLock = e.target.checked;
      this.saveSettings();
    });

    // Preferred side select
    const sideSelect = document.getElementById('stargardt-preferred-side');
    sideSelect.value = this.settings.stargardt.remapping?.preferredSide || 'right';
    sideSelect.addEventListener('change', e => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.preferredSide = e.target.value;
      this.saveSettings();
    });

    // Reading mode toggle (clean content filtering for all remapping styles)
    const readingModeToggle = document.getElementById('stargardt-reading-mode');
    readingModeToggle.checked = this.settings.stargardt.remapping?.readingMode !== false;
    readingModeToggle.addEventListener('change', e => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.readingMode = e.target.checked;
      this.saveSettings();
    });

    // Font size / zoom slider for remapping content
    const fontSizeSlider = document.getElementById('stargardt-remap-font-size');
    const fontSizeValue = document.getElementById('stargardt-font-size-value');
    fontSizeSlider.value = this.settings.stargardt.remapping?.fontSize || 100;
    fontSizeValue.textContent = `${fontSizeSlider.value}%`;
    fontSizeSlider.addEventListener('input', e => {
      fontSizeValue.textContent = `${e.target.value}%`;
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.fontSize = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Font family selector for remapping content
    const fontFamilySelect = document.getElementById('stargardt-font-family');
    fontFamilySelect.value = this.settings.stargardt.remapping?.fontFamily || 'system';
    fontFamilySelect.addEventListener('change', e => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.fontFamily = e.target.value;
      this.saveSettings();
    });

    // Text optimization toggle
    const textOptToggle = document.getElementById('stargardt-text-opt');
    textOptToggle.checked = this.settings.stargardt.textOptimization?.enabled !== false;
    textOptToggle.addEventListener('change', e => {
      if (!this.settings.stargardt.textOptimization) {
        this.settings.stargardt.textOptimization = {};
      }
      this.settings.stargardt.textOptimization.enabled = e.target.checked;
      this.saveSettings();
    });

    // Letter spacing slider
    const letterSlider = document.getElementById('stargardt-letter-spacing');
    const letterValue = document.getElementById('stargardt-letter-value');
    letterSlider.value = this.settings.stargardt.textOptimization?.letterSpacing || 150;
    letterValue.textContent = `${letterSlider.value}%`;
    letterSlider.addEventListener('input', e => {
      letterValue.textContent = `${e.target.value}%`;
      if (!this.settings.stargardt.textOptimization) {
        this.settings.stargardt.textOptimization = {};
      }
      this.settings.stargardt.textOptimization.letterSpacing = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Line height slider
    const lineSlider = document.getElementById('stargardt-line-height');
    const lineValue = document.getElementById('stargardt-line-value');
    lineSlider.value = this.settings.stargardt.textOptimization?.lineHeight || 200;
    lineValue.textContent = `${lineSlider.value}%`;
    lineSlider.addEventListener('input', e => {
      lineValue.textContent = `${e.target.value}%`;
      if (!this.settings.stargardt.textOptimization) {
        this.settings.stargardt.textOptimization = {};
      }
      this.settings.stargardt.textOptimization.lineHeight = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Light adaptation toggle
    const lightToggle = document.getElementById('stargardt-light-adapt');
    const brightnessSection = document.getElementById('stargardt-brightness-section');
    lightToggle.checked = this.settings.stargardt.lightAdaptation?.enabled !== false;

    if (lightToggle.checked) {
      brightnessSection.style.display = 'block';
    } else {
      brightnessSection.style.display = 'none';
    }

    lightToggle.addEventListener('change', e => {
      if (!this.settings.stargardt.lightAdaptation) {
        this.settings.stargardt.lightAdaptation = {};
      }
      this.settings.stargardt.lightAdaptation.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        brightnessSection.style.display = 'block';
      } else {
        brightnessSection.style.display = 'none';
      }
    });

    // Brightness slider
    const brightnessSlider = document.getElementById('stargardt-brightness');
    const brightnessValue = document.getElementById('stargardt-brightness-value');
    brightnessSlider.value = this.settings.stargardt.lightAdaptation?.targetBrightness || 70;
    brightnessValue.textContent = `${brightnessSlider.value}%`;
    brightnessSlider.addEventListener('input', e => {
      brightnessValue.textContent = `${e.target.value}%`;
      if (!this.settings.stargardt.lightAdaptation) {
        this.settings.stargardt.lightAdaptation = {};
      }
      this.settings.stargardt.lightAdaptation.targetBrightness = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Setup wizard button
    const setupBtn = document.getElementById('stargardt-setup-btn');
    setupBtn.addEventListener('click', () => {
      // Send message to content script to show setup wizard
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'stargardt_showSetupWizard',
          });
        }
      });
    });

    // Calibrate button
    const calibrateBtn = document.getElementById('stargardt-calibrate-btn');
    calibrateBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'stargardt_runCalibration',
          });
        }
      });
    });

    // PRL Training button
    const prlBtn = document.getElementById('stargardt-prl-btn');
    prlBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'openTab',
        url: chrome.runtime.getURL('pages/prl-training/training.html'),
      });
    });

    console.log('[Popup] Stargardt Central Vision Support initialized');
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

    // Recognition Engine Selection (Phase 2.8 - S.8)
    const engineSelect = document.getElementById('stt-engine');
    const engineStatusIndicator = document.getElementById('stt-engine-indicator');
    const engineNameDisplay = document.getElementById('stt-engine-name');
    const engineOfflineBadge = document.getElementById('stt-engine-offline-badge');
    const preferOfflineCheckbox = document.getElementById('stt-prefer-offline');

    const whisperDownloadSection = document.getElementById('stt-whisper-download');

    if (engineSelect) {
      // Initialize engine settings if not present
      if (this.settings.stt.engine === undefined) {
        this.settings.stt.engine = 'auto';
      }
      if (this.settings.stt.preferOffline === undefined) {
        this.settings.stt.preferOffline = true;
      }

      engineSelect.value = this.settings.stt.engine || 'auto';

      // Update engine status display
      const updateEngineStatus = (engineType, isOffline = false) => {
        const engineNames = {
          auto: 'Auto (selecting...)',
          whisper: 'Whisper (Offline)',
          'web-speech': 'Web Speech API',
          azure: 'Azure Speech Services',
        };

        if (engineNameDisplay) {
          engineNameDisplay.textContent = engineNames[engineType] || engineType;
        }

        if (engineStatusIndicator) {
          // Green for ready, yellow for loading, red for error
          engineStatusIndicator.style.background = '#10b981'; // Green by default
        }

        if (engineOfflineBadge) {
          if (isOffline || engineType === 'whisper') {
            engineOfflineBadge.classList.remove('hidden');
          } else {
            engineOfflineBadge.classList.add('hidden');
          }
        }
      };

      // Initialize display
      updateEngineStatus(this.settings.stt.engine, this.settings.stt.engine === 'whisper');

      engineSelect.addEventListener('change', e => {
        this.settings.stt.engine = e.target.value;
        this.saveSettings();

        updateEngineStatus(e.target.value, e.target.value === 'whisper');

        // If selecting Whisper and model not loaded, show download progress
        if (e.target.value === 'whisper' && whisperDownloadSection) {
          // Check if Whisper is available - for now, just update UI
          // The actual model download is handled by the content script
        }

        // Notify content script
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            engine: e.target.value,
            preferOffline: this.settings.stt.preferOffline,
          },
        });
      });
    }

    // Prefer Offline Mode
    if (preferOfflineCheckbox) {
      preferOfflineCheckbox.checked = this.settings.stt.preferOffline !== false;

      preferOfflineCheckbox.addEventListener('change', e => {
        this.settings.stt.preferOffline = e.target.checked;
        this.saveSettings();

        // Notify content script
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            engine: this.settings.stt.engine,
            preferOffline: e.target.checked,
          },
        });
      });
    }

    // Punctuation Commands
    const punctuationCheckbox = document.getElementById('stt-punctuation-commands');
    punctuationCheckbox.checked = this.settings.stt.punctuationCommands !== false;
    punctuationCheckbox.addEventListener('change', e => {
      this.settings.stt.punctuationCommands = e.target.checked;
      this.saveSettings();
    });

    // Auto-Punctuation (Phase 2.7 - S.3)
    const autoPunctuationCheckbox = document.getElementById('stt-auto-punctuation');
    const autoPunctuationModeSection = document.getElementById('auto-punctuation-mode-section');
    const autoPunctuationModeSelect = document.getElementById('stt-auto-punctuation-mode');

    if (autoPunctuationCheckbox) {
      // Initialize autoPunctuation setting if not present
      if (this.settings.stt.autoPunctuation === undefined) {
        this.settings.stt.autoPunctuation = true;
      }
      if (this.settings.stt.autoPunctuationMode === undefined) {
        this.settings.stt.autoPunctuationMode = 'auto';
      }

      autoPunctuationCheckbox.checked = this.settings.stt.autoPunctuation !== false;
      autoPunctuationModeSelect.value = this.settings.stt.autoPunctuationMode || 'auto';

      // Show/hide mode section based on enabled state
      if (autoPunctuationModeSection) {
        autoPunctuationModeSection.style.display = autoPunctuationCheckbox.checked
          ? 'block'
          : 'none';
      }

      autoPunctuationCheckbox.addEventListener('change', e => {
        this.settings.stt.autoPunctuation = e.target.checked;
        this.saveSettings();

        // Show/hide mode section
        if (autoPunctuationModeSection) {
          autoPunctuationModeSection.style.display = e.target.checked ? 'block' : 'none';
        }

        // Notify content script
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            autoPunctuation: e.target.checked,
            autoPunctuationMode: this.settings.stt.autoPunctuationMode,
          },
        });
      });

      if (autoPunctuationModeSelect) {
        autoPunctuationModeSelect.addEventListener('change', e => {
          this.settings.stt.autoPunctuationMode = e.target.value;
          this.saveSettings();

          // Notify content script
          this.sendCommandToTab({
            command: 'UPDATE_STT_SETTINGS',
            settings: {
              autoPunctuation: this.settings.stt.autoPunctuation,
              autoPunctuationMode: e.target.value,
            },
          });
        });
      }
    }

    // Confidence Feedback (Phase 2.7 - S.4)
    const confidenceFeedbackCheckbox = document.getElementById('stt-confidence-feedback');
    const confidenceThresholdSlider = document.getElementById('stt-confidence-threshold');
    const confidenceThresholdValue = document.getElementById('stt-confidence-threshold-value');
    const confidenceThresholdSection = document.getElementById('confidence-threshold-section');
    const highlightLowConfidenceCheckbox = document.getElementById('stt-highlight-low-confidence');
    const showAlternativesCheckbox = document.getElementById('stt-show-alternatives');
    const showStatsBtn = document.getElementById('stt-show-stats');
    const statsSummary = document.getElementById('stt-stats-summary');

    if (confidenceFeedbackCheckbox) {
      // Initialize confidence settings if not present
      if (this.settings.stt.confidenceFeedback === undefined) {
        this.settings.stt.confidenceFeedback = true;
      }
      if (this.settings.stt.confidenceThreshold === undefined) {
        this.settings.stt.confidenceThreshold = 60;
      }
      if (this.settings.stt.highlightLowConfidence === undefined) {
        this.settings.stt.highlightLowConfidence = true;
      }
      if (this.settings.stt.showAlternatives === undefined) {
        this.settings.stt.showAlternatives = true;
      }

      // Set initial values
      confidenceFeedbackCheckbox.checked = this.settings.stt.confidenceFeedback !== false;
      if (confidenceThresholdSlider) {
        confidenceThresholdSlider.value = this.settings.stt.confidenceThreshold || 60;
        if (confidenceThresholdValue) {
          confidenceThresholdValue.textContent = `${this.settings.stt.confidenceThreshold || 60}%`;
        }
      }
      if (highlightLowConfidenceCheckbox) {
        highlightLowConfidenceCheckbox.checked = this.settings.stt.highlightLowConfidence !== false;
      }
      if (showAlternativesCheckbox) {
        showAlternativesCheckbox.checked = this.settings.stt.showAlternatives !== false;
      }

      // Show/hide threshold section based on enabled state
      if (confidenceThresholdSection) {
        confidenceThresholdSection.style.display = confidenceFeedbackCheckbox.checked
          ? 'block'
          : 'none';
      }

      // Confidence feedback toggle handler
      confidenceFeedbackCheckbox.addEventListener('change', e => {
        this.settings.stt.confidenceFeedback = e.target.checked;
        this.saveSettings();

        // Show/hide threshold section
        if (confidenceThresholdSection) {
          confidenceThresholdSection.style.display = e.target.checked ? 'block' : 'none';
        }

        // Notify content script
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            confidenceFeedback: e.target.checked,
            confidenceThreshold: this.settings.stt.confidenceThreshold / 100,
            highlightLowConfidence: this.settings.stt.highlightLowConfidence,
            showAlternatives: this.settings.stt.showAlternatives,
          },
        });
      });

      // Threshold slider handler
      if (confidenceThresholdSlider) {
        confidenceThresholdSlider.addEventListener('input', e => {
          const value = parseInt(e.target.value);
          if (confidenceThresholdValue) {
            confidenceThresholdValue.textContent = `${value}%`;
          }
          // Update color based on value
          const color = value >= 85 ? '#22c55e' : value >= 60 ? '#eab308' : '#ef4444';
          confidenceThresholdValue.style.color = color;
        });

        confidenceThresholdSlider.addEventListener('change', e => {
          this.settings.stt.confidenceThreshold = parseInt(e.target.value);
          this.saveSettings();

          // Notify content script
          this.sendCommandToTab({
            command: 'UPDATE_STT_SETTINGS',
            settings: {
              confidenceFeedback: this.settings.stt.confidenceFeedback,
              confidenceThreshold: parseInt(e.target.value) / 100,
              highlightLowConfidence: this.settings.stt.highlightLowConfidence,
              showAlternatives: this.settings.stt.showAlternatives,
            },
          });
        });
      }

      // Highlight low confidence toggle
      if (highlightLowConfidenceCheckbox) {
        highlightLowConfidenceCheckbox.addEventListener('change', e => {
          this.settings.stt.highlightLowConfidence = e.target.checked;
          this.saveSettings();

          this.sendCommandToTab({
            command: 'UPDATE_STT_SETTINGS',
            settings: {
              highlightLowConfidence: e.target.checked,
            },
          });
        });
      }

      // Show alternatives toggle
      if (showAlternativesCheckbox) {
        showAlternativesCheckbox.addEventListener('change', e => {
          this.settings.stt.showAlternatives = e.target.checked;
          this.saveSettings();

          this.sendCommandToTab({
            command: 'UPDATE_STT_SETTINGS',
            settings: {
              showAlternatives: e.target.checked,
            },
          });
        });
      }

      // Show stats button handler
      if (showStatsBtn) {
        showStatsBtn.addEventListener('click', async () => {
          // Toggle stats summary visibility
          if (statsSummary) {
            const isVisible = statsSummary.style.display !== 'none';
            statsSummary.style.display = isVisible ? 'none' : 'block';

            if (!isVisible) {
              // Request stats from content script
              try {
                const response = await this.sendCommandToTab({
                  command: 'GET_STT_STATS',
                });
                if (response && response.stats) {
                  this.updateSTTStatsDisplay(response.stats);
                }
              } catch {
                console.log('[STT Stats] No response from content script');
              }
            }
          }
        });
      }
    }

    // Voice Editing Commands (Phase 2.7)
    const voiceCommandsCheckbox = document.getElementById('stt-voice-commands');
    if (voiceCommandsCheckbox) {
      // Initialize voiceCommands setting if not present
      if (this.settings.stt.voiceCommands === undefined) {
        this.settings.stt.voiceCommands = true;
      }
      voiceCommandsCheckbox.checked = this.settings.stt.voiceCommands !== false;
      voiceCommandsCheckbox.addEventListener('change', e => {
        this.settings.stt.voiceCommands = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab({ command: 'UPDATE_STT_SETTINGS', settings: this.settings.stt });
      });

      // Show Commands button
      const showCommandsBtn = document.getElementById('stt-show-commands');
      if (showCommandsBtn) {
        showCommandsBtn.addEventListener('click', () => {
          this.showVoiceCommandsModal();
        });
      }
    }

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

    // Custom Vocabulary (Phase 2.7 - S.5)
    this.initializeVocabulary();

    console.log('[Popup] STT initialized');
  }

  /**
   * Initialize Custom Vocabulary UI (Phase 2.7 - S.5)
   * Handles vocabulary presets, word management, import/export
   */
  async initializeVocabulary() {
    // Initialize vocabulary settings if not present
    if (!this.settings.stt.vocabulary) {
      this.settings.stt.vocabulary = {
        autoLearn: true,
        enabledPresets: [],
        customWords: [],
      };
    }

    // Auto-learn toggle
    const autoLearnCheckbox = document.getElementById('stt-auto-learn');
    if (autoLearnCheckbox) {
      autoLearnCheckbox.checked = this.settings.stt.vocabulary.autoLearn !== false;
      autoLearnCheckbox.addEventListener('change', e => {
        this.settings.stt.vocabulary.autoLearn = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab({
          command: 'UPDATE_VOCABULARY_SETTINGS',
          settings: { autoLearnEnabled: e.target.checked },
        });
      });
    }

    // Vocabulary preset buttons
    const presetButtons = document.querySelectorAll('.preset-chip');
    presetButtons.forEach(btn => {
      const preset = btn.dataset.preset;
      const isEnabled = this.settings.stt.vocabulary.enabledPresets?.includes(preset);

      // Set initial state
      this.updatePresetButtonState(btn, isEnabled);

      btn.addEventListener('click', async () => {
        const currentlyEnabled = btn.getAttribute('aria-pressed') === 'true';
        const newState = !currentlyEnabled;

        // Update UI immediately for responsiveness
        this.updatePresetButtonState(btn, newState);

        // Update settings
        if (newState) {
          if (!this.settings.stt.vocabulary.enabledPresets) {
            this.settings.stt.vocabulary.enabledPresets = [];
          }
          if (!this.settings.stt.vocabulary.enabledPresets.includes(preset)) {
            this.settings.stt.vocabulary.enabledPresets.push(preset);
          }
        } else {
          this.settings.stt.vocabulary.enabledPresets =
            this.settings.stt.vocabulary.enabledPresets.filter(p => p !== preset);
        }

        this.saveSettings();

        // Send command to content script to load/unload preset
        this.sendCommandToTab({
          command: newState ? 'LOAD_VOCABULARY_PRESET' : 'UNLOAD_VOCABULARY_PRESET',
          preset,
        });

        // Update word counts
        this.updateVocabularyStats();
      });
    });

    // Add Word button
    const addWordBtn = document.getElementById('btn-add-vocab-word');
    if (addWordBtn) {
      addWordBtn.addEventListener('click', () => {
        this.showAddVocabularyWordModal();
      });
    }

    // Manage Vocabulary button
    const manageBtn = document.getElementById('btn-manage-vocabulary');
    if (manageBtn) {
      manageBtn.addEventListener('click', () => {
        this.showManageVocabularyModal();
      });
    }

    // Import button
    const importBtn = document.getElementById('btn-import-vocabulary');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        this.importVocabulary();
      });
    }

    // Export button
    const exportBtn = document.getElementById('btn-export-vocabulary');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportVocabulary();
      });
    }

    // Update initial stats
    this.updateVocabularyStats();

    console.log('[Popup] Vocabulary controls initialized');
  }

  /**
   * Update preset button visual state
   */
  updatePresetButtonState(btn, enabled) {
    btn.setAttribute('aria-pressed', enabled.toString());
    if (enabled) {
      btn.style.background = 'linear-gradient(135deg, #4a90d9, #357abd)';
      btn.style.color = 'white';
      btn.style.borderColor = '#357abd';
    } else {
      btn.style.background = '#f5f5f5';
      btn.style.color = '#333';
      btn.style.borderColor = '#ddd';
    }
  }

  /**
   * Update vocabulary statistics display
   */
  async updateVocabularyStats() {
    const customCountEl = document.getElementById('vocab-word-count');
    const presetCountEl = document.getElementById('vocab-preset-count');

    if (!customCountEl || !presetCountEl) {
      return;
    }

    try {
      // Get counts from content script
      const response = await this.sendCommandToTabWithResponse({
        command: 'GET_VOCABULARY_STATS',
      });

      if (response && response.stats) {
        customCountEl.textContent = response.stats.customCount || 0;
        presetCountEl.textContent = response.stats.presetCount || 0;
      } else {
        // Fallback to settings
        customCountEl.textContent = this.settings.stt.vocabulary.customWords?.length || 0;

        let presetCount = 0;
        const presetSizes = { medical: 48, legal: 38, academic: 31, stem: 43 };
        for (const preset of this.settings.stt.vocabulary.enabledPresets || []) {
          presetCount += presetSizes[preset] || 0;
        }
        presetCountEl.textContent = presetCount;
      }
    } catch (error) {
      console.warn('[Popup] Could not get vocabulary stats:', error);
      customCountEl.textContent = this.settings.stt.vocabulary.customWords?.length || 0;
      presetCountEl.textContent = '0';
    }
  }

  /**
   * Show Add Vocabulary Word Modal
   */
  showAddVocabularyWordModal() {
    const existingModal = document.getElementById('add-vocab-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'add-vocab-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; padding: 20px; width: 300px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 16px;">Add Custom Word</h3>
          <button id="close-add-vocab-modal" style="background: none; border: none; font-size: 20px; cursor: pointer;">&times;</button>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #666;">Word or Phrase:</label>
          <input type="text" id="vocab-word-input" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;" placeholder="e.g., adenocarcinoma">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #666;">Pronunciation Hint (optional):</label>
          <input type="text" id="vocab-phonetic-input" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;" placeholder="e.g., ad-uh-no-kar-suh-NO-muh">
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="cancel-add-vocab" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 6px; background: #f5f5f5; cursor: pointer;">Cancel</button>
          <button id="confirm-add-vocab" style="flex: 1; padding: 8px; border: none; border-radius: 6px; background: linear-gradient(135deg, #4a90d9, #357abd); color: white; cursor: pointer;">Add Word</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Focus input
    const wordInput = document.getElementById('vocab-word-input');
    setTimeout(() => wordInput.focus(), 100);

    // Event handlers
    const closeModal = () => modal.remove();

    document.getElementById('close-add-vocab-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-add-vocab').addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        closeModal();
      }
    });

    document.getElementById('confirm-add-vocab').addEventListener('click', async () => {
      const word = wordInput.value.trim();
      const phonetic = document.getElementById('vocab-phonetic-input').value.trim();

      if (!word) {
        wordInput.style.borderColor = '#e74c3c';
        wordInput.focus();
        return;
      }

      // Add to settings
      if (!this.settings.stt.vocabulary.customWords) {
        this.settings.stt.vocabulary.customWords = [];
      }

      const exists = this.settings.stt.vocabulary.customWords.some(
        w => w.word.toLowerCase() === word.toLowerCase()
      );

      if (exists) {
        alert('This word is already in your vocabulary.');
        return;
      }

      this.settings.stt.vocabulary.customWords.push({ word, phonetic });
      this.saveSettings();

      // Send to content script
      this.sendCommandToTab({
        command: 'ADD_VOCABULARY_WORD',
        word,
        phonetic,
      });

      this.updateVocabularyStats();
      closeModal();
    });

    // Enter key to submit
    wordInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        document.getElementById('confirm-add-vocab').click();
      }
    });
  }

  /**
   * Show Manage Vocabulary Modal
   */
  showManageVocabularyModal() {
    const existingModal = document.getElementById('manage-vocab-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const customWords = this.settings.stt.vocabulary.customWords || [];

    const modal = document.createElement('div');
    modal.id = 'manage-vocab-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const wordsList =
      customWords.length > 0
        ? customWords
            .map(
              (w, i) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
              <div>
                <span style="font-weight: 500;">${w.word}</span>
                ${w.phonetic ? `<span style="font-size: 11px; color: #888; margin-left: 8px;">(${w.phonetic})</span>` : ''}
              </div>
              <button class="delete-vocab-word" data-index="${i}" style="background: #ff4757; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px;">Delete</button>
            </div>
          `
            )
            .join('')
        : '<p style="text-align: center; color: #888; padding: 20px;">No custom words added yet.</p>';

    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; padding: 20px; width: 350px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 16px;">Manage Custom Words</h3>
          <button id="close-manage-vocab-modal" style="background: none; border: none; font-size: 20px; cursor: pointer;">&times;</button>
        </div>
        <div style="flex: 1; overflow-y: auto; max-height: 300px; border: 1px solid #eee; border-radius: 6px;">
          ${wordsList}
        </div>
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button id="clear-all-vocab" style="flex: 1; padding: 8px; border: 1px solid #e74c3c; border-radius: 6px; background: white; color: #e74c3c; cursor: pointer; font-size: 12px;">Clear All</button>
          <button id="done-manage-vocab" style="flex: 1; padding: 8px; border: none; border-radius: 6px; background: linear-gradient(135deg, #4a90d9, #357abd); color: white; cursor: pointer; font-size: 12px;">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();

    document.getElementById('close-manage-vocab-modal').addEventListener('click', closeModal);
    document.getElementById('done-manage-vocab').addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Delete word buttons
    modal.querySelectorAll('.delete-vocab-word').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const word = this.settings.stt.vocabulary.customWords[index];

        this.settings.stt.vocabulary.customWords.splice(index, 1);
        this.saveSettings();

        this.sendCommandToTab({
          command: 'DELETE_VOCABULARY_WORD',
          word: word.word,
        });

        this.updateVocabularyStats();
        closeModal();
        this.showManageVocabularyModal(); // Refresh modal
      });
    });

    // Clear all button
    document.getElementById('clear-all-vocab').addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all custom words?')) {
        this.settings.stt.vocabulary.customWords = [];
        this.saveSettings();

        this.sendCommandToTab({ command: 'CLEAR_VOCABULARY' });

        this.updateVocabularyStats();
        closeModal();
      }
    });
  }

  /**
   * Import vocabulary from file
   */
  importVocabulary() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json';

    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) {
        return;
      }

      try {
        const content = await file.text();
        let words = [];

        if (file.name.endsWith('.json')) {
          const data = JSON.parse(content);
          words = Array.isArray(data) ? data : data.vocabulary || [];
        } else {
          // Text format: one word per line, optional "word|phonetic" format
          words = content
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
              const parts = line.split('|');
              return {
                word: parts[0].trim(),
                phonetic: parts[1] ? parts[1].trim() : '',
              };
            });
        }

        // Add to settings
        if (!this.settings.stt.vocabulary.customWords) {
          this.settings.stt.vocabulary.customWords = [];
        }

        const existingWords = new Set(
          this.settings.stt.vocabulary.customWords.map(w => w.word.toLowerCase())
        );

        let addedCount = 0;
        for (const word of words) {
          if (!existingWords.has(word.word.toLowerCase())) {
            this.settings.stt.vocabulary.customWords.push(word);
            addedCount++;
          }
        }

        this.saveSettings();

        // Send to content script
        this.sendCommandToTab({
          command: 'IMPORT_VOCABULARY',
          words: words,
        });

        this.updateVocabularyStats();
        alert(`Imported ${addedCount} new words.`);
      } catch (error) {
        console.error('[Popup] Import vocabulary failed:', error);
        alert('Failed to import vocabulary. Please check the file format.');
      }
    });

    input.click();
  }

  /**
   * Export vocabulary to file
   */
  exportVocabulary() {
    const words = this.settings.stt.vocabulary.customWords || [];

    if (words.length === 0) {
      alert('No custom words to export.');
      return;
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      vocabulary: words,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `assist-vocabulary-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Send command to tab and wait for response
   */
  async sendCommandToTabWithResponse(message, timeout = 1000) {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0]?.id) {
          resolve(null);
          return;
        }

        const timeoutId = setTimeout(() => resolve(null), timeout);

        chrome.tabs.sendMessage(tabs[0].id, message, response => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });
    });
  }

  /**
   * Show Voice Commands Modal (Phase 2.7)
   * Displays all available voice editing commands in a modal dialog
   */
  showVoiceCommandsModal() {
    // Remove any existing modal
    const existingModal = document.getElementById('voice-commands-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal HTML
    const modal = document.createElement('div');
    modal.id = 'voice-commands-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;

    modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0; font-size: 20px; color: #333;">Voice Commands Reference</h2>
        <button id="close-voice-commands-modal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
      </div>
      <p style="color: #666; margin-bottom: 16px; font-size: 14px;">Speak any of these commands while dictating to edit your text by voice.</p>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Delete Commands</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete last word"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete last 3 words"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete last sentence"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete that"</code> or <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Scratch that"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete all"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Undo / Redo</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Undo"</code> or <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Undo that"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Undo 3 times"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Redo"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Replace Commands</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Replace hello with goodbye"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Change word to phrase"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Correct mispelling to misspelling"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Replace that with new text"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Select Commands</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Select all"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Select last word"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Select last 5 words"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Select last sentence"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Navigation Commands</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Go to beginning"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Go to end"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Move left 3 words"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Find hello"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Next"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Previous"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Formatting Commands <span style="font-size: 11px; color: #999;">(Rich text editors only)</span></h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Bold that"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Italic that"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Underline that"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"New paragraph"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"New line"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Bullet point"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Numbered list"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Heading 1"</code> through <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Heading 6"</code></li>
        </ul>
      </div>

      <div style="background: #f0f7ff; padding: 12px; border-radius: 8px; font-size: 12px; color: #555;">
        <strong>Tip:</strong> You can also use punctuation commands like <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"period"</code>, <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"comma"</code>, <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"question mark"</code>, and <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"new line"</code> while dictating.
      </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Close modal handlers
    const closeBtn = document.getElementById('close-voice-commands-modal');
    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    document.addEventListener('keydown', function closeOnEsc(e) {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', closeOnEsc);
      }
    });
  }

  /**
   * Update STT statistics display (Phase 2.7 - S.4)
   * @param {Object} stats - Statistics object from content script
   */
  updateSTTStatsDisplay(stats) {
    const wpmEl = document.getElementById('stt-stats-wpm');
    const accuracyEl = document.getElementById('stt-stats-accuracy');
    const wordsEl = document.getElementById('stt-stats-words');
    const durationEl = document.getElementById('stt-stats-duration');

    if (wpmEl) {
      wpmEl.textContent = stats.wordsPerMinute || 0;
    }
    if (accuracyEl) {
      const accuracy = stats.averageConfidence || 0;
      accuracyEl.textContent = `${accuracy}%`;
      // Color based on accuracy
      const color = accuracy >= 85 ? '#22c55e' : accuracy >= 60 ? '#eab308' : '#ef4444';
      accuracyEl.style.color = color;
    }
    if (wordsEl) {
      wordsEl.textContent = stats.totalWords || 0;
    }
    if (durationEl) {
      durationEl.textContent = `${stats.duration || 0}m`;
    }
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
      // ============================================================
      // NEURODIVERGENT-FOCUSED PROFILES (Phase 2.6 + S.7 STT)
      // ============================================================
      'ADHD Focus': {
        name: 'ADHD Focus',
        description: 'Structured intervals, reduced distractions, and clear visual progress',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.2, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: { enabled: true, fontSize: 16, lineHeight: 1.6, fontFamily: 'lexend' },
          readingGuide: { enabled: true, lineColor: '#4A90E2', opacity: 0.6 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          simplify: { enabled: true, intensity: 'moderate', focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: 'top',
            color: '#4CAF50',
            showPercentage: true,
          },
          pomodoro: {
            enabled: true,
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            autoStartBreaks: true,
            playSound: true,
          },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: true },
          darkMode: { enabled: false },
          // S.7.1: ADHD STT Profile - fast response, minimal distractions
          stt: {
            enabled: true,
            profile: 'adhd',
            silenceTimeout: 800,
            buttonSize: 'large',
            animations: false,
            audioFeedback: false,
          },
        },
      },
      'Autism Comfort': {
        name: 'Autism Comfort',
        description: 'Predictable environment with sensory-friendly settings',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.9, highlightEnabled: true, wordByWordEnabled: false },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.8,
            fontFamily: 'atkinson-hyperlegible',
          },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: '#FFF4E6', opacity: 0.15 },
          simplify: { enabled: true, intensity: 'aggressive', focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: 'top',
            color: '#9C27B0',
            showPercentage: false,
          },
          pomodoro: {
            enabled: true,
            workDuration: 30,
            shortBreakDuration: 10,
            longBreakDuration: 20,
            autoStartBreaks: false,
            playSound: false, // Avoid unexpected sounds
          },
          reducedMotion: { enabled: true, respectSystemPreference: true },
          mediaControl: { enabled: true },
          darkMode: { enabled: false, respectSystemPreference: true },
          // S.7.6: Autism STT Profile - predictable, literal commands
          stt: {
            enabled: true,
            profile: 'autism',
            interimResults: false, // Final results only - no changing text
            commandMode: 'literal',
            commandPrefix: 'do',
            animations: false,
            audioFeedback: true,
          },
        },
      },
      'Dyslexia Support': {
        name: 'Dyslexia Support',
        description: 'Optimized fonts, spacing, and reading aids for dyslexic users',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.0, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 2.0,
            letterSpacing: 0.12,
            wordSpacing: 0.16,
            fontFamily: 'opendyslexic',
          },
          readingGuide: { enabled: true, lineColor: '#000000', opacity: 0.5 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: '#FFF59D', opacity: 0.2 },
          simplify: { enabled: true, intensity: 'light', focusMainContent: false },
          readingProgress: {
            enabled: true,
            position: 'top',
            color: '#2196F3',
            showPercentage: true,
          },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: false },
          darkMode: { enabled: false },
          // S.7.2: Dyslexia STT Profile - extra pause time, simple commands
          stt: {
            enabled: true,
            profile: 'dyslexia',
            silenceTimeout: 3000, // Extra time to think
            maxAlternatives: 3, // More phonetic alternatives
            commandMode: 'simple',
            spellingCorrection: true,
            audioFeedback: true,
          },
        },
      },
      'Sensory Sensitive': {
        name: 'Sensory Sensitive',
        description: 'Minimal animations, muted colors, and calming interface',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.8, highlightEnabled: true, highlightOpacity: 0.5 },
          textCustomization: {
            enabled: true,
            fontSize: 16,
            lineHeight: 1.6,
            fontFamily: 'verdana',
          },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: '#E1BEE7', opacity: 0.15 },
          simplify: { enabled: true, intensity: 'aggressive', focusMainContent: true },
          readingProgress: { enabled: false },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: true, respectSystemPreference: false }, // Always reduce motion
          mediaControl: { enabled: true },
          darkMode: { enabled: false, respectSystemPreference: true },
          // S.7.3: Anxiety/Sensory STT Profile - calm colors, no alarming sounds
          stt: {
            enabled: true,
            profile: 'anxiety',
            silenceTimeout: 4000, // Forgiving timing
            animations: true, // Smooth, calming
            audioFeedback: true,
            audioVolume: 0.2, // Very quiet
            errorSounds: false, // No alarming sounds
          },
        },
      },
      'Night Study': {
        name: 'Night Study',
        description: 'Dark mode with reduced eye strain for late-night studying',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.0, highlightEnabled: true, highlightColor: '#FFD700' },
          textCustomization: { enabled: true, fontSize: 17, lineHeight: 1.7, fontFamily: 'lexend' },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          simplify: { enabled: true, intensity: 'moderate', focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: 'top',
            color: '#FF9800',
            showPercentage: true,
          },
          pomodoro: {
            enabled: true,
            workDuration: 45,
            shortBreakDuration: 10,
            longBreakDuration: 20,
            autoStartBreaks: true,
            playSound: true,
          },
          reducedMotion: { enabled: true },
          mediaControl: { enabled: true },
          darkMode: { enabled: true, preset: 'dark-gray', respectSystemPreference: false },
        },
      },
      'Anxiety Calm': {
        name: 'Anxiety Calm',
        description: 'Distraction-free reading with gentle pacing and progress indicators',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.85, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.9,
            fontFamily: 'atkinson-hyperlegible',
          },
          readingGuide: { enabled: true, lineColor: '#90EE90', opacity: 0.4 },
          focusMode: { enabled: true, dimAmount: 0.5 },
          screenOverlay: { enabled: true, color: '#C8E6C9', opacity: 0.1 },
          simplify: { enabled: true, intensity: 'aggressive', focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: 'bottom',
            color: '#4CAF50',
            showPercentage: false,
          },
          pomodoro: {
            enabled: true,
            workDuration: 20,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            autoStartBreaks: false,
            playSound: false,
          },
          reducedMotion: { enabled: true },
          mediaControl: { enabled: true },
          darkMode: { enabled: false, respectSystemPreference: true },
          // S.7.3: Anxiety STT Profile - calm, forgiving, no pressure
          stt: {
            enabled: true,
            profile: 'anxiety',
            silenceTimeout: 4000, // Very forgiving
            speechTimeout: 30000, // Extended - take your time
            animations: true, // Smooth, calming
            audioFeedback: true,
            audioVolume: 0.2,
            errorSounds: false, // No alarming sounds
            flashOnRecognition: false, // No sudden flashes
          },
        },
      },
      // S.7.4: Motor Impairment Profile - voice-only, large targets
      'Motor Impairment': {
        name: 'Motor Impairment',
        description: 'Voice-only activation, large touch targets, patient timing',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.0, highlightEnabled: true },
          textCustomization: { enabled: true, fontSize: 18, lineHeight: 1.8 },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          simplify: { enabled: false },
          readingProgress: { enabled: false },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: false },
          darkMode: { enabled: false },
          stt: {
            enabled: true,
            profile: 'motor-impairment',
            continuous: true, // Continuous to avoid re-clicking
            silenceTimeout: 5000, // Very long - no rush
            speechTimeout: 60000, // Extended dictation
            buttonSize: 'xlarge',
            holdToActivate: true,
            holdDuration: 500,
            voiceActivation: true,
            voiceActivationPhrase: 'start dictation',
            voiceDeactivationPhrase: 'stop dictation',
            audioFeedback: true,
            hapticFeedback: true,
          },
        },
      },
      // S.7.5: Low Vision Profile - large buttons, high contrast, audio feedback
      'Low Vision STT': {
        name: 'Low Vision STT',
        description: 'Extra-large mic button, high contrast, comprehensive audio feedback',
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
            fontSize: 24,
            lineHeight: 2.0,
            letterSpacing: 0.15,
            wordSpacing: 0.2,
          },
          readingGuide: { enabled: true, lineColor: '#FF0000', opacity: 0.8 },
          focusMode: { enabled: true, dimAmount: 0.9 },
          screenOverlay: { enabled: false },
          simplify: { enabled: false },
          readingProgress: { enabled: false },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: false },
          darkMode: { enabled: false },
          stt: {
            enabled: true,
            profile: 'low-vision',
            buttonSize: 'xlarge',
            buttonSizePx: 96, // Very large
            highContrast: true,
            audioFeedback: true,
            audioVolume: 0.7, // Louder
            speakTranscript: true, // Read back what was typed
            hapticFeedback: true,
            announceState: true,
            transcriptFontSize: 24,
          },
        },
      },
    };
  }

  profiles_populateSelector() {
    // Populate main popup selector (if exists)
    const selector = document.getElementById('profile-select');
    if (selector) {
      selector.innerHTML = '';
      Object.keys(this.profiles).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        option.selected = name === this.activeProfile;
        selector.appendChild(option);
      });
    }

    // Populate modal selector (if exists)
    const modalSelector = document.getElementById('modal-profile-select');
    if (modalSelector) {
      modalSelector.innerHTML = '';
      Object.keys(this.profiles).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        option.selected = name === this.activeProfile;
        modalSelector.appendChild(option);
      });
    }
  }

  profiles_setupEventListeners() {
    // Profile selector change (may be in main popup or modal)
    const selector = document.getElementById('profile-select');
    if (selector) {
      selector.addEventListener('change', e => {
        this.profiles_loadProfile(e.target.value);
      });
    }

    // Modal profile selector (in advanced settings)
    const modalSelector = document.getElementById('modal-profile-select');
    if (modalSelector) {
      modalSelector.addEventListener('change', e => {
        this.profiles_loadProfile(e.target.value);
      });
    }

    // Save current button (may be removed from main popup)
    const saveBtn = document.getElementById('btn-save-profile');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.profiles_showSaveModal();
      });
    }

    // Export button
    const exportBtn = document.getElementById('btn-export-profiles');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.profiles_export();
      });
    }

    // Import button
    const importBtn = document.getElementById('btn-import-profiles');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const importInput = document.getElementById('profile-import-input');
        if (importInput) {
          importInput.click();
        }
      });
    }

    // Import file input
    const importInput = document.getElementById('profile-import-input');
    if (importInput) {
      importInput.addEventListener('change', e => {
        this.profiles_import(e.target.files[0]);
      });
    }

    // Save profile modal
    const cancelSaveBtn = document.getElementById('btn-cancel-save-profile');
    if (cancelSaveBtn) {
      cancelSaveBtn.addEventListener('click', () => {
        document.getElementById('save-profile-modal')?.classList.add('hidden');
      });
    }

    const confirmSaveBtn = document.getElementById('btn-confirm-save-profile');
    if (confirmSaveBtn) {
      confirmSaveBtn.addEventListener('click', () => {
        this.profiles_saveNew();
      });
    }

    // Delete profile modal
    const cancelDeleteBtn = document.getElementById('btn-cancel-delete-profile');
    if (cancelDeleteBtn) {
      cancelDeleteBtn.addEventListener('click', () => {
        document.getElementById('delete-profile-modal')?.classList.add('hidden');
      });
    }

    const confirmDeleteBtn = document.getElementById('btn-confirm-delete-profile');
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener('click', () => {
        this.profiles_confirmDelete();
      });
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', () => {
        overlay.closest('.modal')?.classList.add('hidden');
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

    // Apply STT profile if present (S.7 Neurodivergent STT Profiles)
    if (profile.settings.stt && profile.settings.stt.profile) {
      await this.profiles_applySTTProfile(name, profile.settings.stt);
    }

    // Reload popup to reflect changes
    window.location.reload();
  }

  /**
   * Apply STT profile to content script (S.7)
   * @param {string} profileName - Name of the user profile
   * @param {Object} sttSettings - STT settings from the profile
   */
  async profiles_applySTTProfile(profileName, sttSettings) {
    try {
      // Save STT profile preference
      await chrome.storage.local.set({
        assist_stt_profile: {
          type: sttSettings.profile,
          profileName: profileName,
          customizations: sttSettings,
          savedAt: new Date().toISOString(),
        },
      });

      // Send message to content script to apply the profile
      if (this.currentTab?.id) {
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'STT_COMMAND',
          command: 'applyProfile',
          profileType: sttSettings.profile,
          customizations: sttSettings,
        });
      }

      console.log('[Profiles] STT profile applied:', sttSettings.profile);
    } catch (error) {
      console.error('[Profiles] Failed to apply STT profile:', error);
    }
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

  // ============================================================
  // LOCAL LLM INTEGRATION
  // ============================================================

  setupLocalLLM() {
    // Initialize localLLM settings if they don't exist
    if (!this.settings.localLLM) {
      this.settings.localLLM = {
        enabled: false,
        baseUrl: 'http://localhost:11434',
        preferredModel: 'mistral:7b-instruct',
        fastModel: 'phi3:mini',
        visionModel: 'llava',
        vramTier: '8gb', // Default to 8GB tier
        features: {
          smartSummarization: true,
          textSimplification: true,
          cognitiveProfile: true,
          stateDetection: true,
          struggleDetection: true,
          socraticTutor: true,
          assignmentAnalyzer: true,
          citationAnalyzer: true,
          emotionalProsody: true,
          visionAnalysis: true,
          knowledgeGraph: true,
          adaptiveRSVP: true,
          predictiveLoading: true,
        },
        cognitiveProfile: {
          persistence: '6months',
          lastCleared: null,
          exportEnabled: true,
        },
        privacy: {
          neverSendToCloud: true,
          clearContextAfterSession: false,
          noPersonalDataInPrompts: true,
          localProcessingOnly: true,
        },
        performance: {
          cacheResponses: true,
          cacheTTL: 300000,
          maxConcurrentRequests: 2,
          timeoutMs: 30000,
        },
        ui: {
          showAIIndicator: true,
          showFallbackMessages: true,
          compactMode: false,
        },
      };
    }

    // Cache DOM elements
    const llmEnabled = document.getElementById('llm-enabled');
    const llmOptionsContainer = document.getElementById('llm-options-container');
    const llmStatusBadge = document.getElementById('llm-status-badge');
    const btnCheckLLM = document.getElementById('btn-check-llm');
    const llmInstallProgress = document.getElementById('llm-install-progress');
    const llmProgressModel = document.getElementById('llm-progress-model');
    const llmProgressPercent = document.getElementById('llm-progress-percent');
    const llmProgressFill = document.getElementById('llm-progress-fill');

    // Track installed models
    this.installedModels = [];

    // Set initial state
    llmEnabled.checked = this.settings.localLLM.enabled || false;

    // Show/hide options based on enabled state
    if (llmEnabled.checked) {
      llmOptionsContainer.classList.remove('hidden');
      this.checkLLMStatus();
    } else {
      llmOptionsContainer.classList.add('hidden');
    }

    // Master toggle event
    llmEnabled.addEventListener('change', e => {
      this.settings.localLLM.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        llmOptionsContainer.classList.remove('hidden');
        this.checkLLMStatus();
      } else {
        llmOptionsContainer.classList.add('hidden');
        llmStatusBadge.textContent = 'Offline';
        llmStatusBadge.className = 'llm-badge offline';
      }
    });

    // Refresh status button
    btnCheckLLM.addEventListener('click', () => {
      this.checkLLMStatus();
    });

    // VRAM Tier selector
    const vramTierSelect = document.getElementById('vram-tier-select');
    const vramTierDescription = document.getElementById('vram-tier-description');

    // VRAM tier configurations
    const VRAM_TIERS = {
      auto: {
        quality: 'Auto-detect',
        models: 'Based on installed models',
        preferredModel: null, // Use auto-detection
      },
      '2gb': {
        quality: '15-30%',
        models: 'phi3:mini, llama3.2',
        preferredModel: 'phi3:mini',
      },
      '4gb': {
        quality: '30-45%',
        models: 'gemma3:4b, llama3.2, phi3:mini',
        preferredModel: 'gemma3:4b',
      },
      '8gb': {
        quality: '55-70%',
        models: 'mistral:7b, qwen2.5:7b',
        preferredModel: 'mistral:7b-instruct',
      },
      '12gb': {
        quality: '65-75%',
        models: 'llama3.1:8b, mixtral:8x7b',
        preferredModel: 'llama3.1:8b',
      },
      '16gb': {
        quality: '75-85%',
        models: 'llama3.1:70b-q4, qwen2.5:14b',
        preferredModel: 'qwen2.5:14b',
      },
      '24gb': {
        quality: '85-92%',
        models: 'llama3.1:70b, mixtral:8x22b',
        preferredModel: 'llama3.1:70b',
      },
    };

    // Update VRAM tier description
    const updateVramDescription = tier => {
      const config = VRAM_TIERS[tier];
      if (config && vramTierDescription) {
        vramTierDescription.innerHTML = `
          <span class="vram-quality">Quality: ${config.quality}</span>
          <span class="vram-models">Models: ${config.models}</span>
        `;
      }
    };

    // Initialize VRAM tier from settings
    if (vramTierSelect) {
      const savedTier = this.settings.localLLM.vramTier || '8gb';
      vramTierSelect.value = savedTier;
      updateVramDescription(savedTier);

      vramTierSelect.addEventListener('change', async e => {
        const selectedTier = e.target.value;
        this.settings.localLLM.vramTier = selectedTier;

        // Update preferred model based on tier
        const tierConfig = VRAM_TIERS[selectedTier];
        if (tierConfig && tierConfig.preferredModel) {
          this.settings.localLLM.preferredModel = tierConfig.preferredModel;
        }

        this.saveSettings();
        updateVramDescription(selectedTier);

        // Notify service worker of tier change
        try {
          await chrome.runtime.sendMessage({
            action: 'SET_VRAM_TIER',
            tier: selectedTier,
            preferredModel: tierConfig?.preferredModel,
          });
          console.log(`[Popup] VRAM tier set to ${selectedTier}`);
        } catch (error) {
          console.warn('[Popup] Failed to notify service worker of tier change:', error);
        }
      });
    }

    // Model install buttons
    document.querySelectorAll('.llm-install-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const modelName = btn.dataset.model;
        if (btn.classList.contains('installed') || btn.classList.contains('installing')) {
          return;
        }

        btn.classList.add('installing');
        btn.textContent = 'Installing...';

        // Show progress
        llmInstallProgress.classList.remove('hidden');
        llmProgressModel.textContent = `Installing ${modelName}...`;
        llmProgressPercent.textContent = '0%';
        llmProgressFill.style.width = '0%';

        try {
          const response = await chrome.runtime.sendMessage({
            action: 'LOCAL_LLM_INSTALL_MODEL',
            modelName: modelName,
          });

          if (response.success) {
            btn.classList.remove('installing');
            btn.classList.add('installed');
            btn.textContent = 'Installed';
            this.installedModels.push(modelName);
            this.updateModelList();
          } else {
            throw new Error(response.error || 'Installation failed');
          }
        } catch (error) {
          console.error('[Popup] Model install failed:', error);
          btn.classList.remove('installing');
          btn.textContent = 'Install';
          // Show the actual error message (e.g., "Cannot connect to Ollama...")
          const errorMsg = error.message || 'Installation failed';
          this.updateStatus(errorMsg, 'error');
        } finally {
          llmInstallProgress.classList.add('hidden');
        }
      });
    });

    // Listen for install progress updates
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === 'LLM_INSTALL_PROGRESS') {
        llmProgressModel.textContent = `Installing ${message.modelName}...`;
        llmProgressPercent.textContent = `${message.progress.percent}%`;
        llmProgressFill.style.width = `${message.progress.percent}%`;
      }
    });

    // Feature toggles
    const featureToggles = {
      'llm-feature-summarize': 'smartSummarization',
      'llm-feature-simplify': 'textSimplification',
      'llm-feature-tutor': 'socraticTutor',
      'llm-feature-assignment': 'assignmentAnalyzer',
      'llm-feature-prosody': 'emotionalProsody',
      'llm-feature-vision': 'visionAnalysis',
    };

    Object.entries(featureToggles).forEach(([elementId, settingKey]) => {
      const toggle = document.getElementById(elementId);
      if (toggle) {
        toggle.checked = this.settings.localLLM.features[settingKey] !== false;
        toggle.addEventListener('change', e => {
          this.settings.localLLM.features[settingKey] = e.target.checked;
          this.saveSettings();
        });
      }
    });

    // Cognitive profile toggle
    const cognitiveToggle = document.getElementById('llm-cognitive-enabled');
    if (cognitiveToggle) {
      cognitiveToggle.checked = this.settings.localLLM.features.cognitiveProfile !== false;
      cognitiveToggle.addEventListener('change', e => {
        this.settings.localLLM.features.cognitiveProfile = e.target.checked;
        this.saveSettings();
      });
    }

    // Profile persistence select
    const persistenceSelect = document.getElementById('llm-profile-persistence');
    if (persistenceSelect) {
      persistenceSelect.value = this.settings.localLLM.cognitiveProfile?.persistence || '6months';
      persistenceSelect.addEventListener('change', e => {
        if (!this.settings.localLLM.cognitiveProfile) {
          this.settings.localLLM.cognitiveProfile = {};
        }
        this.settings.localLLM.cognitiveProfile.persistence = e.target.value;
        this.saveSettings();
      });
    }

    // Export profile button
    const btnExportProfile = document.getElementById('btn-export-profile');
    if (btnExportProfile) {
      btnExportProfile.addEventListener('click', async () => {
        try {
          const exportData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            cognitiveProfile: this.settings.localLLM.cognitiveProfile,
            features: this.settings.localLLM.features,
          };
          const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `assist-cognitive-profile-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          this.updateStatus('Profile exported', 'success');
        } catch (error) {
          console.error('[Popup] Export failed:', error);
          this.updateStatus('Export failed', 'error');
        }
      });
    }

    // Clear profile button
    const btnClearProfile = document.getElementById('btn-clear-profile');
    if (btnClearProfile) {
      btnClearProfile.addEventListener('click', () => {
        if (confirm('Clear all cognitive profile data? This cannot be undone.')) {
          this.settings.localLLM.cognitiveProfile = {
            persistence: this.settings.localLLM.cognitiveProfile?.persistence || '6months',
            lastCleared: Date.now(),
            exportEnabled: true,
          };
          this.saveSettings();
          this.updateStatus('Profile cleared', 'success');
        }
      });
    }

    console.log('[Popup] Local LLM setup complete');

    // ========================================
    // CLOUD AI SETUP (Experimental)
    // ========================================
    this.setupCloudAI();
  }

  /**
   * Set up Cloud AI (Claude) controls
   */
  setupCloudAI() {
    const cloudModeEnabled = document.getElementById('cloud-mode-enabled');
    const cloudUsageStats = document.getElementById('cloud-usage-stats');
    const btnExportJson = document.getElementById('btn-export-usage-json');
    const btnExportCsv = document.getElementById('btn-export-usage-csv');
    const btnClearUsage = document.getElementById('btn-clear-usage');

    if (!cloudModeEnabled) {
      console.log('[Popup] Cloud AI elements not found');
      return;
    }

    // Initialize cloud mode from storage
    chrome.storage.local.get(['cloudModeEnabled'], result => {
      cloudModeEnabled.checked = result.cloudModeEnabled || false;

      if (cloudModeEnabled.checked) {
        cloudUsageStats.style.display = 'block';
        this.loadCloudUsageStats();
      }
    });

    // Cloud mode toggle event
    cloudModeEnabled.addEventListener('change', async e => {
      const enabled = e.target.checked;
      await chrome.storage.local.set({ cloudModeEnabled: enabled });

      if (enabled) {
        cloudUsageStats.style.display = 'block';
        this.loadCloudUsageStats();
      } else {
        cloudUsageStats.style.display = 'none';
      }

      // Notify content scripts about cloud mode change
      chrome.runtime
        .sendMessage({
          action: 'CLOUD_MODE_CHANGED',
          enabled: enabled,
        })
        .catch(() => {});

      this.updateStatus(enabled ? 'Cloud AI enabled' : 'Cloud AI disabled', 'success');
    });

    // Export JSON button
    if (btnExportJson) {
      btnExportJson.addEventListener('click', async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'EXPORT_USAGE_JSON',
          });

          if (response.success) {
            const blob = new Blob([response.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `assist-cloud-usage-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.updateStatus('Usage exported (JSON)', 'success');
          } else {
            throw new Error(response.error);
          }
        } catch (error) {
          console.error('[Popup] Export JSON failed:', error);
          this.updateStatus('Export failed', 'error');
        }
      });
    }

    // Export CSV button
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'EXPORT_USAGE_CSV',
          });

          if (response.success) {
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `assist-cloud-usage-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            this.updateStatus('Usage exported (CSV)', 'success');
          } else {
            throw new Error(response.error);
          }
        } catch (error) {
          console.error('[Popup] Export CSV failed:', error);
          this.updateStatus('Export failed', 'error');
        }
      });
    }

    // Clear usage button
    if (btnClearUsage) {
      btnClearUsage.addEventListener('click', async () => {
        if (confirm('Clear all cloud usage data? This cannot be undone.')) {
          try {
            const response = await chrome.runtime.sendMessage({
              action: 'CLEAR_USAGE_DATA',
            });

            if (response.success) {
              this.loadCloudUsageStats();
              this.updateStatus('Usage data cleared', 'success');
            } else {
              throw new Error(response.error);
            }
          } catch (error) {
            console.error('[Popup] Clear usage failed:', error);
            this.updateStatus('Clear failed', 'error');
          }
        }
      });
    }

    console.log('[Popup] Cloud AI setup complete');
  }

  /**
   * Load and display cloud usage statistics
   */
  async loadCloudUsageStats() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GET_USAGE_STATS',
      });

      if (response.success && response.data) {
        const stats = response.data;
        document.getElementById('cloud-stat-requests').textContent = stats.totalRequests || 0;
        document.getElementById('cloud-stat-tokens').textContent = stats.totalTokens || 0;
        document.getElementById('cloud-stat-avg-in').textContent = stats.averageInputTokens || 0;
        document.getElementById('cloud-stat-avg-out').textContent = stats.averageOutputTokens || 0;
      }
    } catch (error) {
      console.error('[Popup] Failed to load usage stats:', error);
    }
  }

  async checkLLMStatus() {
    const llmStatusBadge = document.getElementById('llm-status-badge');
    const llmConnectionStatus = document.getElementById('llm-connection-status');
    const llmModelsRow = document.getElementById('llm-models-row');
    const llmInstalledModels = document.getElementById('llm-installed-models');

    llmConnectionStatus.textContent = 'Checking...';
    llmConnectionStatus.className = 'llm-status-value';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'LOCAL_LLM_CHECK',
      });

      if (response.success && response.available) {
        llmStatusBadge.textContent = 'Online';
        llmStatusBadge.className = 'llm-badge online';
        llmConnectionStatus.textContent = 'Connected to Ollama';
        llmConnectionStatus.className = 'llm-status-value connected';

        // Show models
        this.installedModels = response.models || [];
        if (this.installedModels.length > 0) {
          llmModelsRow.style.display = 'flex';
          llmInstalledModels.textContent = this.installedModels.join(', ');
          this.updateModelList();
        } else {
          llmModelsRow.style.display = 'none';
        }
      } else {
        llmStatusBadge.textContent = 'Offline';
        llmStatusBadge.className = 'llm-badge offline';
        llmConnectionStatus.textContent = 'Not connected - Start Ollama';
        llmConnectionStatus.className = 'llm-status-value disconnected';
        llmModelsRow.style.display = 'none';
      }
    } catch (error) {
      console.error('[Popup] LLM check failed:', error);
      llmStatusBadge.textContent = 'Error';
      llmStatusBadge.className = 'llm-badge error';
      llmConnectionStatus.textContent = 'Connection error';
      llmConnectionStatus.className = 'llm-status-value disconnected';
      llmModelsRow.style.display = 'none';
    }
  }

  updateModelList() {
    // Update install buttons based on installed models
    document.querySelectorAll('.llm-install-btn').forEach(btn => {
      const modelName = btn.dataset.model;
      const isInstalled = this.installedModels.some(
        m => m === modelName || m.startsWith(modelName.split(':')[0])
      );
      if (isInstalled && !btn.classList.contains('installing')) {
        btn.classList.add('installed');
        btn.textContent = 'Installed';
      }
    });

    // Update installed models display
    const llmInstalledModels = document.getElementById('llm-installed-models');
    if (llmInstalledModels && this.installedModels.length > 0) {
      llmInstalledModels.textContent = this.installedModels.slice(0, 3).join(', ');
      if (this.installedModels.length > 3) {
        llmInstalledModels.textContent += ` +${this.installedModels.length - 3} more`;
      }
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const popup = new PopupController();
  await popup.initialize();
  await popup.setupUserProfiles();
});
