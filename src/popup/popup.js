/**
 * Popup UI Controller
 * Manages user interactions with the TTS controls popup
 */

import DOMPurify from 'dompurify';
import { MESSAGE_TYPES } from '../config/constants.js';
import {
  SHORTCUT_LABELS,
  loadShortcuts,
  saveShortcuts,
  validateShortcut,
  eventToShortcut,
} from '../utils/keyboard-shortcuts.js';
import { migrateAnnotations } from '../features/annotations/migration-manager.js';
import { CitationManagerPanel } from './citation-manager-panel.js';
import { sanitizeHTML } from '../utils/sanitize.js';
import Sortable from 'sortablejs';
import {
  getAIMode,
  checkAIAvailable,
  generateWithAI,
} from '../features/shared/ai-feature-client.js';

// Make DOMPurify available for sanitize.js (popup runs in separate context from content script)
window.DOMPurify = DOMPurify;

/**
 * Layout Mode Configurations
 * Defines how sections are organized in each layout mode
 */
const LAYOUT_MODES = {
  'feature-category': {
    name: 'Feature Category',
    description: 'Groups by what features do (Reading, Writing, Visual, etc.)',
    sections: [
      { id: 'reading', name: 'Reading Help', icon: '🔊' },
      { id: 'writing', name: 'Writing Help', icon: '✍️' },
      { id: 'lookup', name: 'Look Up Words', icon: '📚' },
      { id: 'reading-aids', name: 'Reading Aids', icon: '👓' },
      { id: 'pointer-zoom', name: 'Pointer & Zoom', icon: '🔍' },
      { id: 'visual-comfort', name: 'Visual Comfort', icon: '👁️' },
      { id: 'productivity', name: 'Productivity', icon: '⏱️' },
      { id: 'school', name: 'School Tools', icon: '🎓' },
      { id: 'ai-assist', name: 'AI Assist', icon: '✨' },
    ],
  },
  'user-need': {
    name: 'User Need',
    description: 'Groups by what you need help with (Focus, Reading, Writing, etc.)',
    sections: [
      { id: 'focus-attention', name: 'Focus & Attention', icon: '🎯' },
      { id: 'reading-support', name: 'Reading Support', icon: '📖' },
      { id: 'writing-support', name: 'Writing Support', icon: '✍️' },
      { id: 'visual-access', name: 'Visual Accessibility', icon: '👁️' },
      { id: 'study-tools', name: 'Study Tools', icon: '🎓' },
    ],
  },
  'disability-profile': {
    name: 'Disability Profile',
    description: 'Groups optimized for specific needs (ADHD, Dyslexia, Low Vision)',
    sections: [
      { id: 'adhd-tools', name: 'ADHD Tools', icon: '🎯' },
      { id: 'dyslexia-tools', name: 'Dyslexia Tools', icon: '📖' },
      { id: 'low-vision-tools', name: 'Low Vision Tools', icon: '👁️' },
      { id: 'general-tools', name: 'General Tools', icon: '🔧' },
    ],
  },
};

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
    this.controlCleanupFns = []; // Track cleanup functions for control handlers

    // Delegate to popup controller's event handler method
    this.attachInteractiveHandler = this.popup.attachInteractiveHandler.bind(this.popup);
  }

  /**
   * Attach handler to organize control using capture phase to ensure it fires first
   * This prevents SortableJS and accordion handlers from intercepting the events
   */
  attachOrganizeControlHandler(element, label, handler) {
    if (!element) {
      console.warn(`[OrganizeMode] Element not found for: ${label}`);
      return () => {};
    }

    const wrappedHandler = e => {
      console.log(`[OrganizeMode] ${label} triggered (capture phase)`);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // Prevent other listeners on same element

      try {
        handler(e);
      } catch (error) {
        console.error(`[OrganizeMode] ${label} error:`, error);
      }
    };

    // Use capture phase to ensure we handle the event before it reaches other listeners
    element.addEventListener('mousedown', wrappedHandler, true);
    element.addEventListener('click', wrappedHandler, true);

    // Visual feedback
    element.addEventListener('mouseenter', () => {
      element.style.transform = 'scale(1.1)';
    });
    element.addEventListener('mouseleave', () => {
      element.style.transform = 'scale(1)';
    });

    // Return cleanup function
    const cleanup = () => {
      element.removeEventListener('mousedown', wrappedHandler, true);
      element.removeEventListener('click', wrappedHandler, true);
    };

    this.controlCleanupFns.push(cleanup);
    return cleanup;
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

    // Clean up control handlers
    this.controlCleanupFns.forEach(cleanup => cleanup());
    this.controlCleanupFns = [];

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
      dragHandle.innerHTML = sanitizeHTML('⠿');
      dragHandle.setAttribute('aria-hidden', 'true');

      // Create visibility toggle
      const visibilityToggle = document.createElement('button');
      visibilityToggle.className = 'visibility-toggle';
      visibilityToggle.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
      visibilityToggle.setAttribute('aria-label', isVisible ? 'Hide section' : 'Show section');
      visibilityToggle.innerHTML = sanitizeHTML(
        `<span class="visibility-icon">${isVisible ? '👁️' : '👁️‍🗨️'}</span>`
      );
      console.log(
        '[OrganizeMode] Visibility toggle created for section:',
        sectionId,
        visibilityToggle
      );
      this.attachOrganizeControlHandler(visibilityToggle, 'Visibility Toggle', () => {
        console.log('[OrganizeMode] Visibility toggle clicked for section:', sectionId);
        this.toggleSectionVisibility(sectionId, visibilityToggle);
      });

      // Create edit title button
      const editTitleBtn = document.createElement('button');
      editTitleBtn.className = 'edit-title-btn';
      editTitleBtn.setAttribute('aria-label', 'Edit section title');
      editTitleBtn.innerHTML = sanitizeHTML('✏️');
      console.log('[OrganizeMode] Edit title button created for section:', sectionId, editTitleBtn);
      this.attachOrganizeControlHandler(editTitleBtn, 'Edit Title', () => {
        console.log('[OrganizeMode] Edit title clicked for section:', sectionId);
        this.editSectionTitle(sectionId);
      });

      // Wrap title text for editing - find the text node (not whitespace-only)
      let titleText = null;
      for (let i = 0; i < titleSpan.childNodes.length; i++) {
        const node = titleSpan.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          titleText = node;
          break;
        }
      }
      if (titleText) {
        const titleTextSpan = document.createElement('span');
        titleTextSpan.className = 'accordion-title-text';
        titleTextSpan.textContent = titleText.textContent.trim();
        titleSpan.replaceChild(titleTextSpan, titleText);
      }

      // Create move buttons for keyboard accessibility
      const moveButtons = document.createElement('div');
      moveButtons.className = 'move-buttons';
      moveButtons.innerHTML = sanitizeHTML(`
        <button class="move-btn move-up" aria-label="Move section up" title="Move up">▲</button>
        <button class="move-btn move-down" aria-label="Move section down" title="Move down">▼</button>
      `);

      const moveUpBtn = moveButtons.querySelector('.move-up');
      const moveDownBtn = moveButtons.querySelector('.move-down');
      console.log('[OrganizeMode] Move buttons created:', { moveUpBtn, moveDownBtn, sectionId });

      this.attachOrganizeControlHandler(moveUpBtn, 'Move Up', () => {
        console.log('[OrganizeMode] Move up clicked for section:', sectionId);
        this.moveSection(section, 'up');
      });
      this.attachOrganizeControlHandler(moveDownBtn, 'Move Down', () => {
        console.log('[OrganizeMode] Move down clicked for section:', sectionId);
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
    const dragHandles = document.querySelectorAll('.drag-handle');
    console.log('[OrganizeMode] Initializing sortables. Main element:', main);
    console.log('[OrganizeMode] Found', dragHandles.length, 'drag handles:', dragHandles);

    // Section-level sortable
    this.sectionSortable = new Sortable(main, {
      handle: '.drag-handle',
      animation: 200,
      ghostClass: 'section-ghost',
      chosenClass: 'section-chosen',
      dragClass: 'section-dragging',
      filter: '.visibility-toggle, .edit-title-btn, .move-buttons',
      onStart: e => {
        console.log('[OrganizeMode] Section drag started:', e.item);
      },
      onEnd: () => {
        console.log('[OrganizeMode] Section drag ended');
        this.saveLayout();
        this.announceForScreenReader('Section order updated');
      },
    });
    console.log('[OrganizeMode] Section sortable initialized:', this.sectionSortable);

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
      dragHandle.innerHTML = sanitizeHTML('⠿');
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
    console.log('[OrganizeMode] toggleSectionVisibility called for:', sectionId);
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const isCurrentlyVisible = toggleBtn.getAttribute('aria-pressed') === 'true';
    const newVisibility = !isCurrentlyVisible;
    console.log('[OrganizeMode] Current visibility:', isCurrentlyVisible, '-> New:', newVisibility);

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
    console.log('[OrganizeMode][applyLayout] Starting layout application...');
    const layout = this.popup.settings?.ui_layout;
    if (!layout) {
      console.log('[OrganizeMode][applyLayout] No layout settings found, using defaults');
      return;
    }

    console.log('[OrganizeMode][applyLayout] Layout settings:', layout);

    const main = document.querySelector('.popup-main');
    if (!main) {
      console.error('[OrganizeMode][applyLayout] ❌ .popup-main element not found!');
      return;
    }

    // Apply section order
    if (layout.sectionOrder) {
      console.log('[OrganizeMode][applyLayout] Applying section order:', layout.sectionOrder);
      layout.sectionOrder.forEach(sectionId => {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (section) {
          main.appendChild(section);
        } else {
          console.warn('[OrganizeMode][applyLayout] Section not found:', sectionId);
        }
      });
    }

    // Apply section visibility
    if (layout.sectionVisibility) {
      console.log(
        '[OrganizeMode][applyLayout] Applying section visibility:',
        layout.sectionVisibility
      );
      Object.entries(layout.sectionVisibility).forEach(([sectionId, visible]) => {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (section) {
          section.classList.toggle('hidden-by-user', !visible);
        }
      });
    }

    // Apply custom titles
    if (layout.sectionTitles) {
      console.log('[OrganizeMode][applyLayout] Applying custom titles:', layout.sectionTitles);
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

    console.log('[OrganizeMode][applyLayout] ✓ Layout applied successfully');
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

  /**
   * Attaches mousedown event handler to prevent race conditions
   * Per LESSONS_UI_EVENT_HANDLING.md - mousedown fires before document listeners
   * @param {HTMLElement} element - The element to attach handler to
   * @param {string} label - Debug label for logging
   * @param {Function} handler - The handler function to execute
   */
  attachInteractiveHandler(element, label, handler) {
    if (!element) {
      console.warn(`[Popup] Element not found for: ${label}`);
      return;
    }

    element.onmousedown = e => {
      console.log(`[Popup] ${label} triggered`);
      e.preventDefault();
      e.stopPropagation();

      try {
        handler(e);
      } catch (error) {
        console.error(`[Popup] ${label} error:`, error);
        this.updateStatus(`Error: ${error.message}`, 'error');
      }
    };

    // Visual feedback
    element.onmouseenter = () => {
      element.style.transform = 'scale(1.05)';
    };
    element.onmouseleave = () => {
      element.style.transform = 'scale(1)';
    };
  }

  async initialize() {
    console.log('[Popup] Initializing...');

    try {
      // Get current tab
      console.log('[Popup] Step 1: Querying current tab...');
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tabs[0];
      console.log('[Popup] Step 1: ✓ Current tab retrieved:', this.currentTab?.id);

      // Load settings
      console.log('[Popup] Step 2: Loading settings...');
      await this.loadSettings();
      console.log('[Popup] Step 2: ✓ Settings loaded');

      // Setup UI
      console.log('[Popup] Step 3: Setting up event listeners...');
      this.setupEventListeners();
      console.log('[Popup] Step 3: ✓ Event listeners setup complete');

      console.log('[Popup] Step 4: Setting up accordions...');
      this.setupAccordions();
      console.log('[Popup] Step 4: ✓ Accordions setup complete');

      console.log('[Popup] Step 5: Updating UI...');
      this.updateUI();
      console.log('[Popup] Step 5: ✓ UI update complete');

      console.log('[Popup] Step 6: Loading voices...');
      this.loadVoices();
      console.log('[Popup] Step 6: ✓ Voices loaded');

      // Apply saved layout (section order, visibility, custom titles)
      console.log('[Popup] Step 7: Applying saved layout...');
      this.organizeMode.applyLayout();
      console.log('[Popup] Step 7: ✓ Layout applied');

      // Setup organize mode event listeners
      console.log('[Popup] Step 8: Setting up organize mode listeners...');
      this.setupOrganizeModeListeners();
      console.log('[Popup] Step 8: ✓ Organize mode listeners setup');

      this.isInitialized = true;
      this.updateStatus('Ready');
      console.log('[Popup] ✓✓✓ INITIALIZATION COMPLETE ✓✓✓');

      // Setup permission banner AFTER initialization (non-blocking)
      setTimeout(() => this.setupPermissionBanner(), 100);
    } catch (error) {
      console.error('[Popup] ❌ INITIALIZATION FAILED:', error);
      console.error('[Popup] Error stack:', error.stack);
      this.updateStatus(`Initialization failed: ${error.message}`, 'error');
    }
  }

  /**
   * Setup event listeners for organize mode
   */
  setupOrganizeModeListeners() {
    // Organize button in header
    this.attachInteractiveHandler(
      document.getElementById('btn-organize'),
      'Organize Mode Toggle',
      () => this.organizeMode.toggle()
    );

    // Done button in organize banner
    this.attachInteractiveHandler(
      document.getElementById('btn-organize-done'),
      'Organize Mode Done',
      () => this.organizeMode.exit()
    );
  }

  /**
   * Setup permission banner for optional all-sites permission
   * Completely fail-safe - errors here never affect main popup functionality
   */
  async setupPermissionBanner() {
    console.log('[Popup][PermBanner] ========== PERMISSION BANNER SETUP START ==========');
    try {
      const permissionBanner = document.getElementById('permission-banner');
      const enableBtn = document.getElementById('btn-enable-all-sites');

      console.log('[Popup][PermBanner] Elements found:', {
        permissionBanner: !!permissionBanner,
        enableBtn: !!enableBtn,
      });

      if (!permissionBanner || !enableBtn) {
        console.error('[Popup][PermBanner] ❌ CRITICAL: Elements not found!');
        return;
      }

      console.log('[Popup][PermBanner] Button element:', enableBtn);
      console.log('[Popup][PermBanner] Button outerHTML:', enableBtn.outerHTML);

      // Check if user already has all-sites permission
      console.log('[Popup][PermBanner] Checking current permissions...');
      let hasAllUrls = false;
      try {
        hasAllUrls = await chrome.permissions.contains({
          origins: ['<all_urls>'],
        });
        console.log('[Popup][PermBanner] Has <all_urls> permission:', hasAllUrls);
      } catch (err) {
        console.error('[Popup][PermBanner] ❌ Permission check failed:', err);
        return;
      }

      if (hasAllUrls) {
        // Check if permission was just granted (within last 60 seconds)
        const storage = await chrome.storage.local.get('permissionJustGranted');
        const justGranted = storage.permissionJustGranted;
        const isRecent = justGranted && Date.now() - justGranted < 60000;

        if (isRecent) {
          // Show success message
          permissionBanner.classList.remove('hidden');
          this.showPermissionSuccess(permissionBanner);
          // Clear the flag
          await chrome.storage.local.remove(['permissionJustGranted', 'permissionRequestedAt']);
          console.log('[Popup][PermBanner] ✓ Showing success message (just granted)');
        } else {
          permissionBanner.classList.add('hidden');
          console.log('[Popup][PermBanner] ✓ Already has permission, hiding banner');
        }
      } else {
        permissionBanner.classList.remove('hidden');
        console.log('[Popup][PermBanner] ✓ No permission yet, showing banner');
      }

      // Setup button click handler with maximum debugging
      console.log('[Popup][PermBanner] Setting up button click handlers...');

      // Clear any existing handlers
      const newBtn = enableBtn.cloneNode(true);
      enableBtn.parentNode.replaceChild(newBtn, enableBtn);
      console.log('[Popup][PermBanner] Replaced button to clear old handlers');

      // Get fresh reference
      const freshBtn = document.getElementById('btn-enable-all-sites');
      console.log('[Popup][PermBanner] Fresh button reference:', !!freshBtn);

      // BUG-7 fix: use attachInteractiveHandler (mousedown + preventDefault/stopPropagation)
      this.attachInteractiveHandler(freshBtn, 'Enable Everywhere Button', async () => {
        // Visual feedback
        freshBtn.textContent = 'Requesting...';
        freshBtn.disabled = true;

        // Store timestamp before requesting - popup might close during Chrome's dialog
        await chrome.storage.local.set({ permissionRequestedAt: Date.now() });

        try {
          console.log('[Popup][PermBanner] Calling chrome.permissions.request...');
          const granted = await chrome.permissions.request({
            origins: ['<all_urls>'],
          });
          console.log('[Popup][PermBanner] Permission granted:', granted);

          if (granted) {
            // Store that permission was just granted
            await chrome.storage.local.set({ permissionJustGranted: Date.now() });
            this.showPermissionSuccess(permissionBanner);
          } else {
            console.log('[Popup][PermBanner] Permission denied by user');
            freshBtn.textContent = 'Enable Everywhere';
            freshBtn.disabled = false;
            await chrome.storage.local.remove('permissionRequestedAt');
          }
        } catch (err) {
          console.error('[Popup][PermBanner] ❌ Permission error:', err);
          freshBtn.textContent = 'Error - Try Again';
          freshBtn.disabled = false;
          await chrome.storage.local.remove('permissionRequestedAt');
        }
      });

      console.log('[Popup][PermBanner] ========== SETUP COMPLETE ==========');

      // Try to inject content script if needed
      this.ensureContentScriptLoaded();
    } catch (error) {
      console.error('[Popup][PermBanner] ❌ FATAL ERROR:', error);
      console.error('[Popup][PermBanner] Stack:', error.stack);
    }
  }

  /**
   * Show the permission success message in the banner
   */
  showPermissionSuccess(permissionBanner) {
    permissionBanner.innerHTML = `
      <div class="permission-banner-content">
        <span class="permission-icon" aria-hidden="true">✅</span>
        <div class="permission-text">
          <strong>Permission granted!</strong>
          <span class="permission-desc" style="font-weight: 600; color: #065f46;">⟳ Reload this page to activate AssisT</span>
          <span class="permission-note" style="font-style: normal; color: #047857;">Press F5 or click the browser refresh button</span>
        </div>
      </div>
    `;
    permissionBanner.style.background = 'linear-gradient(135deg, #d1fae5, #a7f3d0)';
    permissionBanner.style.borderColor = '#10b981';
    console.log('[Popup][PermBanner] ✓ UI updated for success');
  }

  /**
   * Ensure content script is loaded in the current tab
   * For non-LMS sites, we inject on-demand if user has <all_urls> permission
   */
  async ensureContentScriptLoaded() {
    if (!this.currentTab?.id) {
      console.log('[Popup] No current tab, skipping content script check');
      return;
    }

    // Check if this is an LMS site (content script already loaded via manifest)
    const url = this.currentTab.url || '';
    const isLmsSite =
      url.includes('instructure.com') ||
      url.includes('canvas.com') ||
      url.includes('moodle.org') ||
      url.includes('moodlecloud.com') ||
      url.includes('classroom.google.com') ||
      url.includes('docs.google.com');

    if (isLmsSite) {
      console.log('[Popup] LMS site detected, content script should be loaded via manifest');
      return;
    }

    // Check if content script is already loaded by pinging it
    let contentScriptLoaded = false;
    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, { type: 'PING' });
      if (response?.loaded || response?.success) {
        console.log('[Popup] Content script already loaded');
        contentScriptLoaded = true;
      }
    } catch {
      // Content script not loaded, continue to check permissions
      console.log('[Popup] Content script not responding, will try to inject');
    }

    // Show file:// access guidance if on a local file without content script
    if (url.startsWith('file://') && !contentScriptLoaded) {
      const fileAccessBanner = document.getElementById('file-access-banner');
      if (fileAccessBanner) {
        fileAccessBanner.classList.remove('hidden');
        const openSettingsBtn = document.getElementById('btn-open-extension-settings');
        if (openSettingsBtn) {
          this.attachInteractiveHandler(openSettingsBtn, 'Open Extension Settings', () => {
            chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
          });
        }
      }
      console.log('[Popup] file:// URL detected without content script — showing access guidance');
      return;
    }

    if (contentScriptLoaded) {
      return;
    }

    // Check if user has <all_urls> permission
    let hasAllUrls = false;
    try {
      hasAllUrls = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    } catch (e) {
      console.log('[Popup] Could not check permissions:', e.message);
      return;
    }

    if (!hasAllUrls) {
      console.log('[Popup] No <all_urls> permission, cannot inject content script');
      return;
    }

    // Inject the content script via service worker
    console.log('[Popup] Injecting content script into tab:', this.currentTab.id);
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'INJECT_CONTENT_SCRIPT',
        tabId: this.currentTab.id,
      });
      if (result.success) {
        console.log('[Popup] ✓ Content script injected successfully');
        // Show a toast on the page
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(this.currentTab.id, {
              type: 'SHOW_TOAST',
              message: '✓ AssisT loaded on this page',
            });
          } catch {
            // Toast failed, not critical
          }
        }, 500);
      } else {
        console.log('[Popup] Content script injection failed:', result.error);
      }
    } catch (error) {
      console.error('[Popup] Error injecting content script:', error.message);
    }
  }

  async loadSettings() {
    try {
      console.log('[Popup][loadSettings] Sending GET_SETTINGS message to background...');
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_SETTINGS,
      });
      console.log('[Popup][loadSettings] Response received:', response);

      if (response.success) {
        this.settings = response.data;
        console.log('[Popup][loadSettings] ✓ Settings loaded successfully:', this.settings);
      } else {
        console.error('[Popup][loadSettings] ❌ Response indicated failure:', response);
      }
    } catch (error) {
      console.error('[Popup][loadSettings] ❌ Error loading settings:', error);
      console.error('[Popup][loadSettings] Error stack:', error.stack);
      this.updateStatus('Error loading settings', 'error');
      throw error; // Re-throw to be caught by initialize()
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
    toggleSection('stt-section', 'show_stt', true);
    toggleSection('screen-overlay-section', 'show_screen_overlay');
    toggleSection('canvas-integration-section', 'show_canvas_integration', false); // EXPERIMENTAL - hidden by default
    toggleSection('moodle-integration-section', 'show_moodle_integration', false); // EXPERIMENTAL - hidden by default
    toggleSection(
      'google-classroom-integration-section',
      'show_google_classroom_integration',
      false
    ); // EXPERIMENTAL - hidden by default
    toggleSection('dyslexia-mode-section', 'show_dyslexia_mode');
    toggleSection('citation-section', 'show_citations', false); // Citation Manager toggle - EXPERIMENTAL default off
    toggleSection('citation-options-container', 'show_citations', false); // Citation Manager buttons
    // Dark Mode feature removed - extension UI dark mode remains in popup header
    toggleSection('simplify-section', 'show_simplify'); // Simplified Interface
    toggleSection('reading-progress-section', 'show_reading_progress'); // Reading Progress Tracker
    toggleSection('pomodoro-section', 'show_pomodoro'); // Pomodoro Timer
    // toggleSection('stargardt-section', 'show_stargardt'); // Stargardt Support - HIDDEN FOR BETA
    toggleSection('reduced-motion-section', 'show_reduced_motion'); // Reduced Motion
    toggleSection('media-control-section', 'show_media_control'); // Media Control

    // =========================================================================
    // ACCORDION AUTO-HIDE: Hide accordion sections with no visible features
    // =========================================================================

    // Helper to check if a feature is visible (uses same logic as toggleSection)
    const isFeatureVisible = (visibilityKey, defaultValue = true) => {
      return visibility[visibilityKey] !== undefined ? visibility[visibilityKey] : defaultValue;
    };

    // Helper to hide/show an accordion section
    const toggleAccordion = (accordionDataSection, isVisible) => {
      const accordion = document.querySelector(
        `.accordion-section[data-section="${accordionDataSection}"]`
      );
      if (accordion) {
        accordion.style.display = isVisible ? '' : 'none';
      }
    };

    // Define accordion sections and their visibility-controlled features
    // Accordions with 'alwaysVisible: true' have features without visibility controls
    const accordionConfig = {
      reading: { alwaysVisible: true }, // TTS has no visibility toggle
      writing: {
        features: [{ key: 'show_stt', default: true }],
      },
      lookup: { alwaysVisible: true }, // Translation has no visibility toggle
      display: {
        features: [
          { key: 'show_text_customization', default: true },
          { key: 'show_reading_guide', default: true },
          { key: 'show_focus_mode', default: true },
          { key: 'show_dyslexia_mode', default: true },
          { key: 'show_screen_overlay', default: true },
          // show_dark_mode removed - feature removed, extension UI dark mode remains
          { key: 'show_simplify', default: true },
          { key: 'show_reading_progress', default: true },
          { key: 'show_pomodoro', default: true },
          { key: 'show_reduced_motion', default: true },
          { key: 'show_media_control', default: true },
        ],
      },
      school: {
        features: [
          { key: 'show_citations', default: false },
          { key: 'show_canvas_integration', default: false },
          { key: 'show_moodle_integration', default: false },
          { key: 'show_google_classroom_integration', default: false },
        ],
      },
      'ai-assist': { alwaysVisible: true }, // AI mode has no visibility toggle
    };

    // Apply accordion visibility
    for (const [accordionId, config] of Object.entries(accordionConfig)) {
      if (config.alwaysVisible) {
        toggleAccordion(accordionId, true);
      } else {
        // Check if ANY feature in this accordion is visible
        const hasVisibleFeature = config.features.some(f => isFeatureVisible(f.key, f.default));
        toggleAccordion(accordionId, hasVisibleFeature);
      }
    }

    console.log('[Popup] Visibility settings applied:', visibility);
  }

  /**
   * Initialize accordion sections for cleaner UI organization
   */
  setupAccordions() {
    console.log('[Popup][setupAccordions] Starting accordion setup...');
    const accordionSections = document.querySelectorAll('.accordion-section');
    console.log('[Popup][setupAccordions] Found', accordionSections.length, 'accordion sections');

    const savedState = this.loadAccordionState();
    console.log('[Popup][setupAccordions] Loaded saved state:', savedState);

    let processedCount = 0;
    accordionSections.forEach(section => {
      const header = section.querySelector('.accordion-header');
      const content = section.querySelector('.accordion-content');
      const sectionId = section.dataset.section;

      console.log(
        '[Popup][setupAccordions] Processing section:',
        sectionId,
        'header:',
        !!header,
        'content:',
        !!content
      );

      if (!header || !content) {
        console.warn(
          '[Popup][setupAccordions] ⚠️ Missing header or content for section:',
          sectionId
        );
        return;
      }

      // Set initial state based on saved preferences or defaults
      // Default: "reading" section is expanded
      const isExpanded =
        savedState[sectionId] !== undefined ? savedState[sectionId] : sectionId === 'reading';

      this.setAccordionState(header, content, isExpanded);

      // Click handler (mousedown to prevent race conditions)
      this.attachInteractiveHandler(header, `Accordion: ${sectionId}`, () => {
        const currentlyExpanded = header.getAttribute('aria-expanded') === 'true';
        this.setAccordionState(header, content, !currentlyExpanded);
        this.saveAccordionState();
      });

      // Keyboard handler (keep for accessibility)
      header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const currentlyExpanded = header.getAttribute('aria-expanded') === 'true';
          this.setAccordionState(header, content, !currentlyExpanded);
          this.saveAccordionState();
        }
      });

      processedCount++;
    });

    console.log('[Popup][setupAccordions] ✓ Processed', processedCount, 'accordions');
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
    console.log('[Popup][setupEventListeners] Starting event listener setup...');

    try {
      // Apply visibility settings
      console.log('[Popup][setupEventListeners] Applying visibility settings...');
      this.applyVisibilitySettings();
      console.log('[Popup][setupEventListeners] ✓ Visibility settings applied');

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
      this.attachInteractiveHandler(btnReadPage, 'Read Page Button', () => {
        console.log('[Popup] Read Page button clicked');
        this.sendCommandToTab('readPage');
        this.updateStatus('Reading page...', 'speaking');
      });

      // ============================================================
      // OCR FEATURE: TRIGGER OCR CAPTURE
      // ============================================================
      const btnTriggerOCR = document.getElementById('btn-trigger-ocr');
      if (btnTriggerOCR) {
        this.attachInteractiveHandler(btnTriggerOCR, 'OCR Trigger Button', async () => {
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
        { id: 'highlight-menu-show-annotate', key: 'showAnnotate' },
        { id: 'highlight-menu-show-speed-read', key: 'showSpeedRead' },
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
        this.attachInteractiveHandler(btnTranslatePage, 'Translate Page Button', async () => {
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
      // TRANSLATION: PROVIDER SELECTION & API KEYS
      // ============================================================
      const providerSelect = document.getElementById('translation-provider');
      const deeplKeySection = document.getElementById('deepl-key-section');
      const azureKeySection = document.getElementById('azure-key-section');
      const deeplKeyInput = document.getElementById('deepl-api-key');
      const azureKeyInput = document.getElementById('azure-api-key');
      const azureRegionInput = document.getElementById('azure-region');
      const btnTestDeepL = document.getElementById('btn-test-deepl');
      const btnTestAzure = document.getElementById('btn-test-azure');

      if (providerSelect && deeplKeySection && azureKeySection) {
        // Load provider settings and API keys
        chrome.storage.local.get(['translationSettings', 'translationApiKeys'], result => {
          if (result.translationSettings?.provider) {
            providerSelect.value = result.translationSettings.provider;
          }

          if (result.translationApiKeys) {
            if (result.translationApiKeys.deepl) {
              deeplKeyInput.value = result.translationApiKeys.deepl;
            }
            if (result.translationApiKeys.azure) {
              azureKeyInput.value = result.translationApiKeys.azure;
            }
            if (result.translationApiKeys.azureRegion) {
              azureRegionInput.value = result.translationApiKeys.azureRegion;
            }
          }

          // Show/hide API key sections based on provider
          this.updateProviderUI(providerSelect.value);
        });

        // Handle provider change
        providerSelect.addEventListener('change', async e => {
          const provider = e.target.value;

          // Save provider to settings
          const settings = await chrome.storage.local.get('translationSettings');
          const updatedSettings = {
            ...(settings.translationSettings || {}),
            provider: provider,
          };
          await chrome.storage.local.set({ translationSettings: updatedSettings });

          // Update UI
          this.updateProviderUI(provider);

          console.log('[Popup] Translation provider changed to:', provider);
        });

        // Handle DeepL API key input
        if (deeplKeyInput) {
          deeplKeyInput.addEventListener('change', async () => {
            const apiKeys = await chrome.storage.local.get('translationApiKeys');
            const updatedKeys = {
              ...(apiKeys.translationApiKeys || {}),
              deepl: deeplKeyInput.value,
            };
            await chrome.storage.local.set({ translationApiKeys: updatedKeys });
          });
        }

        // Handle Azure API key input
        if (azureKeyInput) {
          azureKeyInput.addEventListener('change', async () => {
            const apiKeys = await chrome.storage.local.get('translationApiKeys');
            const updatedKeys = {
              ...(apiKeys.translationApiKeys || {}),
              azure: azureKeyInput.value,
            };
            await chrome.storage.local.set({ translationApiKeys: updatedKeys });
          });
        }

        // Handle Azure region input
        if (azureRegionInput) {
          azureRegionInput.addEventListener('change', async () => {
            const apiKeys = await chrome.storage.local.get('translationApiKeys');
            const updatedKeys = {
              ...(apiKeys.translationApiKeys || {}),
              azureRegion: azureRegionInput.value,
            };
            await chrome.storage.local.set({ translationApiKeys: updatedKeys });
            console.log('[Popup] Azure region updated');
          });
        }

        // Test DeepL API key
        if (btnTestDeepL) {
          this.attachInteractiveHandler(btnTestDeepL, 'Test DeepL Key', async () => {
            const apiKey = deeplKeyInput.value;
            if (!apiKey) {
              this.updateStatus('Please enter a DeepL API key', 'error');
              return;
            }

            btnTestDeepL.disabled = true;
            btnTestDeepL.textContent = 'Testing...';

            try {
              // Test with a simple translation
              const response = await fetch('https://api-free.deepl.com/v2/translate', {
                method: 'POST',
                body: new URLSearchParams({
                  auth_key: apiKey,
                  text: 'Hello',
                  target_lang: 'ES',
                }),
              });

              if (response.ok) {
                this.updateStatus('DeepL API key is valid!', 'success');
              } else if (response.status === 403) {
                this.updateStatus('DeepL API key is invalid', 'error');
              } else {
                this.updateStatus(`DeepL API test failed: ${response.status}`, 'error');
              }
            } catch (error) {
              console.error('[Popup] DeepL API test error:', error);
              this.updateStatus('DeepL API test failed', 'error');
            } finally {
              btnTestDeepL.disabled = false;
              btnTestDeepL.textContent = 'Test';
            }
          });
        }

        // Test Azure API key
        if (btnTestAzure) {
          this.attachInteractiveHandler(btnTestAzure, 'Test Azure Key', async () => {
            const apiKey = azureKeyInput.value;
            const region = azureRegionInput.value || 'global';

            if (!apiKey) {
              this.updateStatus('Please enter an Azure API key', 'error');
              return;
            }

            btnTestAzure.disabled = true;
            btnTestAzure.textContent = 'Testing...';

            try {
              // Test with a simple translation
              const response = await fetch(
                'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=es',
                {
                  method: 'POST',
                  headers: {
                    'Ocp-Apim-Subscription-Key': apiKey,
                    'Ocp-Apim-Subscription-Region': region,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify([{ text: 'Hello' }]),
                }
              );

              if (response.ok) {
                this.updateStatus('Azure API key is valid!', 'success');
              } else if (response.status === 401 || response.status === 403) {
                this.updateStatus('Azure API key is invalid', 'error');
              } else {
                this.updateStatus(`Azure API test failed: ${response.status}`, 'error');
              }
            } catch (error) {
              console.error('[Popup] Azure API test error:', error);
              this.updateStatus('Azure API test failed', 'error');
            } finally {
              btnTestAzure.disabled = false;
              btnTestAzure.textContent = 'Test';
            }
          });
        }
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
        this.attachInteractiveHandler(btnSaveCitation, 'Save Citation Button', async () => {
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
        this.attachInteractiveHandler(btnCitationManager, 'Citation Manager Button', async () => {
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
        this.attachInteractiveHandler(btnCitationProjects, 'Citation Projects Button', async () => {
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

      // Reading scope selector (paragraph / section / page)
      const readingScope = document.getElementById('reading-scope');
      if (readingScope) {
        readingScope.value = this.settings?.tts?.readingScope || 'paragraph';
        readingScope.addEventListener('change', e => {
          if (!this.settings.tts) {
            this.settings.tts = {};
          }
          this.settings.tts.readingScope = e.target.value;
          this.saveSettings();
        });
      }

      // ============================================================
      // SPRINT 3 FEATURE: TEXT CUSTOMIZATION
      // ============================================================
      this.setupTextCustomization();

      // ============================================================
      // SPRINT 3 FEATURE: READING GUIDE
      // ============================================================
      this.setupReadingGuide();

      // ============================================================
      // CUSTOM CURSOR (Extracted from Stargardt)
      // ============================================================
      this.setupCustomCursor();

      // ============================================================
      // MAGNIFYING LENS (Extracted from Stargardt)
      // ============================================================
      this.setupMagnifyingLens();

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
      // DARK MODE FEATURE REMOVED
      // Extension UI dark mode button (in header) remains functional
      // ============================================================

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
      this.attachInteractiveHandler(
        document.getElementById('link-settings'),
        'Settings Link',
        e => {
          e.preventDefault();
          // Open settings page (to be implemented)
          console.log('[Popup] Settings clicked');
        }
      );

      // Reset button
      this.attachInteractiveHandler(document.getElementById('btn-reset'), 'Reset Button', () => {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
          this.resetToDefaults();
        }
      });

      // Help button (WCAG 2.2 SC 3.2.6 - Consistent Help)
      this.attachInteractiveHandler(document.getElementById('btn-help'), 'Help Button', () => {
        // Open help page in new tab
        chrome.tabs.create({
          url: chrome.runtime.getURL('src/pages/help/help.html'),
        });
      });

      // Discovery Quiz button - opens adaptive quiz to discover best tools
      const btnDiscovery = document.getElementById('btn-discovery');
      if (btnDiscovery) {
        this.attachInteractiveHandler(btnDiscovery, 'Discovery Quiz Button', () => {
          // Open discovery quiz in new tab via service worker
          chrome.runtime.sendMessage({ action: 'OPEN_DISCOVERY_QUIZ' });
          // Close the popup
          window.close();
        });
      }

      // Quick Start section handlers
      this.setupQuickStart();

      // Options button
      this.attachInteractiveHandler(
        document.getElementById('btn-options'),
        'Options Button',
        () => {
          this.showAdvancedOptions();
        }
      );

      // Minimize UI Clutter toggle button
      this.setupMinimizeClutterButton();

      // Popup Dark Mode toggle button
      this.setupPopupDarkModeButton();

      console.log('[Popup][setupEventListeners] ✓ Event listener setup complete');
    } catch (error) {
      console.error('[Popup][setupEventListeners] ❌ FATAL ERROR during setup:', error);
      console.error('[Popup][setupEventListeners] Error stack:', error.stack);
      throw error; // Re-throw to be caught by initialize()
    }
  }

  async resetToDefaults() {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) {
      return;
    }

    try {
      // Use the RESET_SETTINGS message type to reset via MessageRouter
      const defaults = await chrome.runtime.sendMessage({
        type: 'RESET_SETTINGS',
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
      this.attachInteractiveHandler(btn, 'Rate Preset Button', () => {
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

  /**
   * Setup Quick Start section handlers
   * Allows users to quickly apply preset profiles
   */
  setupQuickStart() {
    const quickStartSection = document.getElementById('quick-start-section');
    if (!quickStartSection) {
      console.log('[Popup] Quick Start section not found');
      return;
    }

    // Check if Quick Start should be hidden (user dismissed it)
    chrome.storage.local.get('quick_start_hidden', result => {
      if (result.quick_start_hidden) {
        quickStartSection.classList.add('hidden');
      }
    });

    // Dismiss button handler
    const dismissBtn = document.getElementById('btn-quick-start-dismiss');
    if (dismissBtn) {
      this.attachInteractiveHandler(dismissBtn, 'Quick Start Dismiss', () => {
        quickStartSection.classList.add('hidden');
        // Remember the dismissal
        chrome.storage.local.set({ quick_start_hidden: true });
      });
    }

    // Preset button handlers
    const presetBtns = quickStartSection.querySelectorAll('.quick-start-btn[data-preset]');
    presetBtns.forEach(btn => {
      this.attachInteractiveHandler(btn, 'Quick Start Preset', async () => {
        const presetName = btn.getAttribute('data-preset');

        // Visual feedback - show active state
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Load the preset profile
        if (
          confirm(
            `Apply the "${presetName}" preset?\n\nThis will configure settings optimized for your needs.`
          )
        ) {
          await this.profiles_loadProfile(presetName);
          console.log(`[Popup] Quick Start: Applied preset "${presetName}"`);
        } else {
          btn.classList.remove('active');
        }
      });
    });

    // "More presets" link handler
    const moreLink = document.getElementById('quick-start-more-link');
    if (moreLink) {
      this.attachInteractiveHandler(moreLink, 'Quick Start More Link', e => {
        e.preventDefault();
        this.showAdvancedOptions();
        // Switch to Preferences tab after a short delay
        setTimeout(() => {
          const preferencesTab = document.querySelector('.modal-tab[data-tab="preferences"]');
          if (preferencesTab) {
            preferencesTab.click();
          }
        }, 100);
      });
    }

    console.log('[Popup] Quick Start section initialized');
  }

  /**
   * Setup Minimize UI Clutter toggle button in header
   * Provides quick access to hide on-page overlays and notifications
   */
  setupMinimizeClutterButton() {
    const btn = document.getElementById('btn-minimize-clutter');
    if (!btn) {
      console.log('[Popup] Minimize clutter button not found');
      return;
    }

    // Initialize button state based on settings
    const isActive = this.settings?.ui_overlay?.minimize_clutter === true;
    this.updateMinimizeClutterButtonState(btn, isActive);

    // Toggle handler
    this.attachInteractiveHandler(btn, 'Minimize Clutter Toggle', () => {
      const currentState = btn.classList.contains('active');
      const newState = !currentState;

      // Update button state
      this.updateMinimizeClutterButtonState(btn, newState);

      // Update settings
      if (!this.settings.ui_overlay) {
        this.settings.ui_overlay = {};
      }
      this.settings.ui_overlay.minimize_clutter = newState;

      // Sync with modal checkbox if it exists
      const modalCheckbox = document.getElementById('minimize-ui-clutter');
      if (modalCheckbox) {
        modalCheckbox.checked = newState;
        // Also update the overlay controls in the modal
        const overlayControls = document.getElementById('ui-overlay-controls');
        if (overlayControls) {
          overlayControls.style.opacity = newState ? '0.5' : '1';
          overlayControls.style.pointerEvents = newState ? 'none' : 'auto';
        }
      }

      // Save to storage
      this.saveSettings();

      // Update chrome.storage.local for content scripts
      chrome.storage.local.set({
        textStatsBadgeVisible: newState
          ? false
          : this.settings.ui_overlay.show_text_stats_badge !== false,
        textStatsNotificationsEnabled: newState
          ? false
          : this.settings.ui_overlay.show_text_stats_notifications !== false,
        featureNotificationsEnabled: newState
          ? false
          : this.settings.ui_overlay.show_feature_notifications !== false,
        tokenCounterVisible: newState
          ? false
          : this.settings.ui_overlay.show_token_counter !== false,
        readingProgressBadgeVisible: newState
          ? false
          : this.settings.ui_overlay.show_reading_progress_badge !== false,
      });

      // Direct message to active tab - handles case where storage value is already
      // set to the same value (chrome.storage.onChanged won't fire in that case)
      if (this.currentTab?.id) {
        chrome.tabs
          .sendMessage(this.currentTab.id, {
            type: 'MINIMIZE_CLUTTER_UPDATE',
            state: newState,
          })
          .catch(() => {}); // Ignore if content script not loaded
      }

      // Show feedback
      this.updateStatus(newState ? 'UI clutter minimized' : 'UI overlays restored');
      console.log(`[Popup] Minimize UI Clutter: ${newState ? 'enabled' : 'disabled'}`);
    });

    console.log('[Popup] Minimize clutter button initialized');
  }

  /**
   * Update the visual state of the minimize clutter button
   * @param {HTMLElement} btn - The button element
   * @param {boolean} isActive - Whether the button should be active
   */
  updateMinimizeClutterButtonState(btn, isActive) {
    if (isActive) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      btn.title = 'Minimize UI Clutter (ON) - Click to show overlays';
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
      btn.title = 'Minimize UI Clutter (OFF) - Click to hide overlays';
    }
  }

  /**
   * Setup Popup Dark Mode toggle button in header
   * Toggles dark mode theme for the extension popup UI
   */
  setupPopupDarkModeButton() {
    const btn = document.getElementById('btn-popup-darkmode');
    if (!btn) {
      console.log('[Popup] Dark mode button not found');
      return;
    }

    // Load saved dark mode state from storage (defaults to light mode/OFF)
    chrome.storage.local.get(['popup_dark_mode'], result => {
      // Default to light mode (OFF) - only enable dark mode if explicitly set to true
      const isDarkMode = result.popup_dark_mode === true;
      this.updatePopupDarkModeState(btn, isDarkMode);
    });

    // Toggle handler
    this.attachInteractiveHandler(btn, 'Popup Dark Mode Toggle', () => {
      const container = document.querySelector('.popup-container');
      const currentState = container.classList.contains('dark-mode');
      const newState = !currentState;

      // Update UI state
      this.updatePopupDarkModeState(btn, newState);

      // Save to storage
      chrome.storage.local.set({ popup_dark_mode: newState });

      // Show feedback
      this.updateStatus(newState ? 'Popup dark theme enabled' : 'Popup light theme enabled');
      console.log(`[Popup] Popup Dark Mode: ${newState ? 'enabled' : 'disabled'}`);
    });

    console.log('[Popup] Dark mode button initialized');
  }

  /**
   * Update the visual state of the popup dark mode button and apply theme
   * @param {HTMLElement} btn - The button element
   * @param {boolean} isDarkMode - Whether dark mode should be active
   */
  updatePopupDarkModeState(btn, isDarkMode) {
    const container = document.querySelector('.popup-container');

    if (isDarkMode) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      btn.title = 'Dark mode (ON) - Click for light mode';
      btn.querySelector('.header-btn-icon').textContent = '☀️';
      container.classList.add('dark-mode');
      document.body.classList.add('dark-mode');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
      btn.title = 'Dark mode (OFF) - Click for dark mode';
      btn.querySelector('.header-btn-icon').textContent = '🌙';
      container.classList.remove('dark-mode');
      document.body.classList.remove('dark-mode');
    }
  }

  showAdvancedOptions() {
    console.log('[Popup] showAdvancedOptions called');
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'advanced-options-modal';
    modal.className = 'modal-overlay';
    console.log('[Popup] Modal element created:', modal);

    // Safe innerHTML: all content is extension-controlled (hardcoded, no user input)
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

              <!-- Dark Mode feature removed - extension UI dark mode remains in popup header -->

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
                  <span class="feature-badge alpha">Alpha</span>
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
                  <input type="checkbox" id="show-citations">
                  <span>Citation Manager</span>
                  <span class="feature-badge experimental">Experimental</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-canvas-integration">
                  <span>Canvas LMS</span>
                  <span class="feature-badge alpha">Alpha</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-moodle-integration">
                  <span>Moodle LMS</span>
                  <span class="feature-badge alpha">Alpha</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-google-classroom-integration">
                  <span>Google Classroom</span>
                  <span class="feature-badge alpha">Alpha</span>
                </label>
              </div>

              <div class="feature-note">
                <p><strong>Note:</strong> Core TTS controls (voice, speed, pitch, volume) are always visible and cannot be hidden.</p>
              </div>
            </div>
          </div>

          <!-- Keyboard Tab -->
          <div id="tab-keyboard" class="tab-content">
            <div class="tab-header-row">
              <div>
                <h3>Keyboard Shortcuts</h3>
                <p class="tab-description">Click on a shortcut to assign a key combination</p>
              </div>
              <button id="btn-clear-all-shortcuts" class="modal-btn modal-btn-secondary">
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

            <!-- Layout Organization Section -->
            <div class="preferences-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0;">
              <h4>📐 Section Organization</h4>
              <p style="font-size: 13px; color: #666; margin-bottom: 16px;">
                Choose how features are grouped in the popup. Different layouts work better for different needs.
              </p>

              <div class="option-group">
                <label for="layout-mode-select">Organize Sections By:</label>
                <div class="option-control" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                  <select id="layout-mode-select" class="voice-select" style="width: 100%;">
                    <option value="feature-category">Feature Category (Default)</option>
                    <option value="user-need">User Need</option>
                    <option value="disability-profile">Disability Profile</option>
                  </select>
                  <div id="layout-mode-description" style="font-size: 12px; color: #666; line-height: 1.4;">
                    <strong>Feature Category:</strong> Groups by what features do (Reading, Writing, Visual, etc.)
                  </div>
                </div>
              </div>

              <div class="layout-mode-preview" style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; font-size: 12px;">
                <strong style="display: block; margin-bottom: 8px;">Current Sections:</strong>
                <div id="layout-sections-preview" style="display: flex; flex-wrap: wrap; gap: 6px;">
                  <!-- Populated dynamically -->
                </div>
              </div>

              <button id="btn-apply-layout" class="profile-btn profile-btn-primary" style="margin-top: 12px; width: 100%;">
                <span class="profile-btn-icon">✨</span>
                Apply Layout
              </button>
            </div>

            <!-- UI Overlay Visibility Section -->
            <div class="preferences-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0;">
              <h4>🎨 UI Overlay Visibility</h4>
              <p style="font-size: 13px; color: #666; margin-bottom: 16px;">
                Control which on-page overlays and notifications are displayed. These settings help reduce visual clutter.
              </p>

              <!-- Individual Overlay Controls -->
              <div id="ui-overlay-controls" style="margin-left: 16px;">
                <div class="option-group">
                  <label>Text Stats Badge</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-text-stats-badge" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show floating word count badge</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Text Stats Notifications</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-text-stats-notifications" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show text statistics toasts and popups</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Feature Notifications</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-feature-notifications" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show toast notifications when features activate</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>AI Token Counter</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-token-counter" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show AI usage token display</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Reading Progress Badge</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-reading-progress-badge" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show reading progress indicator</span>
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
          <div id="tab-ai" class="tab-content ai-tab-full">
            <fieldset class="ai-mode-chips" id="modal-ai-mode-chips">
              <legend class="sr-only">Select AI mode</legend>
              <label class="ai-chip" data-mode="off">
                <input type="radio" name="modal-ai-quick-mode" value="off" />
                <span>Off</span>
              </label>
              <label class="ai-chip" data-mode="cloud">
                <input type="radio" name="modal-ai-quick-mode" value="cloud" />
                <span>&#x2601;&#xFE0E; Cloud</span>
              </label>
              <label class="ai-chip" data-mode="webllm">
                <input type="radio" name="modal-ai-quick-mode" value="webllm" />
                <span>&#x26A1;&#xFE0E; Browser</span>
              </label>
              <label class="ai-chip" data-mode="local">
                <input type="radio" name="modal-ai-quick-mode" value="local" />
                <span>&#x1F916; Local</span>
              </label>
            </fieldset>
            <div
              id="modal-ai-panel"
              class="ai-modal-panel"
              aria-live="polite"
              aria-atomic="false"
            ></div>
            <button id="btn-open-ai-setup-from-modal" class="modal-btn modal-btn-secondary" style="margin-top:12px; width:100%; justify-content:center;">
              Full setup wizard &#x2192;
            </button>
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
    console.log('[Popup] Modal appended to body');

    // Setup tab switching
    this.setupModalTabs(modal);
    console.log('[Popup] Modal tabs setup complete');

    // Setup modal actions
    this.setupModalActions(modal);

    // Load current settings into modal
    this.loadModalSettings();

    // Setup profiles tab
    this.setupProfilesTab(modal);

    // Setup layout mode selector
    this.setupLayoutModeSelector(modal);

    // Setup AI tab
    console.log('[Popup] About to call setupAITab');
    this.setupAITab(modal);
    console.log('[Popup] setupAITab complete');
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
      this.attachInteractiveHandler(saveBtn, 'Profile Save Button', () => {
        this.profiles_showSaveModal();
        // Refresh selector after save
        setTimeout(() => this.populateModalProfileSelector(modal), 500);
      });
    }

    // Delete profile button
    const deleteBtn = modal.querySelector('#btn-profile-delete-modal');
    if (deleteBtn) {
      this.attachInteractiveHandler(deleteBtn, 'Profile Delete Button', () => {
        this.profiles_confirmDelete();
        // Refresh selector after delete
        setTimeout(() => this.populateModalProfileSelector(modal), 500);
      });
    }

    // Export profiles button
    const exportBtn = modal.querySelector('#btn-profile-export-modal');
    if (exportBtn) {
      this.attachInteractiveHandler(exportBtn, 'Profile Export Button', () => {
        this.profiles_export();
      });
    }

    // Import profiles button
    const importBtn = modal.querySelector('#btn-profile-import-modal');
    const importInput = modal.querySelector('#profile-import-input-modal');
    if (importBtn && importInput) {
      this.attachInteractiveHandler(importBtn, 'Profile Import Button', () => {
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
      this.attachInteractiveHandler(item, 'Preset Profile Item', () => {
        const presetName = item.getAttribute('data-preset');
        if (
          confirm(
            `Load the "${presetName}" preset profile?\n\nThis will apply all settings from this preset.`
          )
        ) {
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
   * Setup the layout mode selector in the Preferences tab
   * @param {HTMLElement} modal - The modal element
   */
  setupLayoutModeSelector(modal) {
    const layoutSelect = modal.querySelector('#layout-mode-select');
    const descriptionEl = modal.querySelector('#layout-mode-description');
    const previewEl = modal.querySelector('#layout-sections-preview');
    const applyBtn = modal.querySelector('#btn-apply-layout');

    if (!layoutSelect) {
      console.log('[Popup] Layout mode selector not found');
      return;
    }

    // Load current layout mode from storage
    chrome.storage.local.get('layout_mode', result => {
      const currentMode = result.layout_mode || 'feature-category';
      layoutSelect.value = currentMode;
      this.updateLayoutModeUI(descriptionEl, previewEl, currentMode);
    });

    // Handle layout mode selection change
    layoutSelect.addEventListener('change', () => {
      const selectedMode = layoutSelect.value;
      this.updateLayoutModeUI(descriptionEl, previewEl, selectedMode);
    });

    // Handle apply button
    if (applyBtn) {
      this.attachInteractiveHandler(applyBtn, 'Apply Layout Button', async () => {
        const selectedMode = layoutSelect.value;
        await this.applyLayoutMode(selectedMode);
        // Show confirmation
        applyBtn.innerHTML = '<span class="profile-btn-icon">✓</span> Applied!';
        setTimeout(() => {
          applyBtn.innerHTML = '<span class="profile-btn-icon">✨</span> Apply Layout';
        }, 2000);
      });
    }

    console.log('[Popup] Layout mode selector initialized');
  }

  /**
   * Update layout mode description and preview
   */
  updateLayoutModeUI(descriptionEl, previewEl, mode) {
    const config = LAYOUT_MODES[mode];
    if (!config) {
      return;
    }

    // Update description
    // SECURITY: Sanitize even trusted content for defense-in-depth
    if (descriptionEl) {
      descriptionEl.innerHTML = sanitizeHTML(
        `<strong>${config.name}:</strong> ${config.description}`
      );
    }

    // Update sections preview
    // SECURITY: Sanitize even trusted content for defense-in-depth
    if (previewEl) {
      previewEl.innerHTML = sanitizeHTML(
        config.sections
          .map(
            section =>
              `<span style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 11px;">${section.icon} ${section.name}</span>`
          )
          .join('')
      );
    }
  }

  /**
   * Apply the selected layout mode
   * @param {string} mode - The layout mode to apply
   */
  async applyLayoutMode(mode) {
    console.log(`[Popup] Applying layout mode: ${mode}`);

    // Save the layout mode
    await chrome.storage.local.set({ layout_mode: mode });

    // For now, we'll just show/hide sections based on the current HTML structure
    // A full implementation would reorganize or rebuild sections dynamically
    const config = LAYOUT_MODES[mode];
    if (!config) {
      console.error(`[Popup] Unknown layout mode: ${mode}`);
      return;
    }

    // If switching to a different layout mode than feature-category,
    // we need to reorganize the sections
    if (mode === 'feature-category') {
      // Show all default sections, hide alternative layout sections
      this.showDefaultSections();
    } else {
      // For user-need and disability-profile modes,
      // we show a message that this feature is coming soon
      // In a full implementation, we would dynamically reorganize sections
      console.log(`[Popup] Layout mode "${mode}" selected - section reorganization coming soon`);
      alert(
        `Layout mode "${config.name}" has been saved.\n\n` +
          `Note: Dynamic section reorganization will be fully implemented in a future update. ` +
          `For now, you can use Organize Mode to manually reorder and hide sections.`
      );
    }

    // Notify that layout changed
    console.log(`[Popup] Layout mode "${mode}" applied`);
  }

  /**
   * Show the default feature-category sections
   */
  showDefaultSections() {
    const defaultSections = LAYOUT_MODES['feature-category'].sections.map(s => s.id);
    const allSections = document.querySelectorAll('.accordion-section[data-section]');

    allSections.forEach(section => {
      const sectionId = section.getAttribute('data-section');
      // Show if it's a default section, respect hidden-by-user class
      if (defaultSections.includes(sectionId) && !section.classList.contains('hidden-by-user')) {
        section.style.display = '';
      }
    });
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

      selector.innerHTML = sanitizeHTML('');

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
            'Reduced eye strain with screen overlay, warm colors, and Pomodoro timer for study sessions.',
          'Anxiety Calm':
            'Gentle, non-overwhelming interface with calm colors and predictable interactions.',
        };
        descriptionEl.textContent =
          defaultDescriptions[profileName] || 'Custom profile with user-defined settings.';
      }
    });
  }

  /**
   * Setup the AI tab in the advanced settings modal.
   * Renders the same inline mode-chip switcher as the popup AI Assist section,
   * plus a link to the full setup wizard.
   * @param {HTMLElement} modal - The modal element
   */
  setupAITab(modal) {
    const chipsEl = modal.querySelector('#modal-ai-mode-chips');
    const panelEl = modal.querySelector('#modal-ai-panel');
    const wizardBtn = modal.querySelector('#btn-open-ai-setup-from-modal');

    if (!chipsEl || !panelEl) {
      console.warn('[Popup] Modal AI tab elements not found');
      return;
    }

    const selectChip = mode => {
      chipsEl.querySelectorAll('input[type="radio"]').forEach(r => {
        r.checked = r.value === mode;
      });
    };

    const renderPanel = async mode => {
      panelEl.innerHTML = '';
      if (mode === 'off') {
        panelEl.innerHTML =
          '<p class="ai-panel-off-msg">AI features are disabled. Select a mode above to enable AI tools.</p>';
        return;
      }
      if (mode === 'cloud') {
        await this._renderCloudPanel(panelEl, true);
        return;
      }
      if (mode === 'webllm') {
        await this._renderWebLLMPanel(panelEl, true);
        return;
      }
      if (mode === 'local') {
        await this._renderLocalPanel(panelEl, true);
        return;
      }
    };

    // Wire chip change handlers
    chipsEl.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', async () => {
        if (!radio.checked) {
          return;
        }
        const newMode = radio.value;
        chrome.storage.local.set({
          aiMode: newMode,
          llmEnabled: newMode === 'local',
          cloudModeEnabled: newMode === 'cloud',
          webllmEnabled: newMode === 'webllm',
        });
        await renderPanel(newMode);
      });
    });

    // Wizard link — also resets the CTA dismiss flag so popup CTA reappears
    if (wizardBtn) {
      this.attachInteractiveHandler(wizardBtn, 'Open AI Setup Wizard', () => {
        chrome.storage.local.remove('aiSetupDismissed');
        chrome.runtime.sendMessage({ action: 'OPEN_AI_SETUP' });
        modal.remove();
      });
    }

    // Initial render
    chrome.storage.local.get(['aiMode', 'llmEnabled', 'cloudModeEnabled'], result => {
      let mode = result.aiMode || 'off';
      if (!result.aiMode) {
        if (result.cloudModeEnabled) {
          mode = 'cloud';
        } else if (result.llmEnabled) {
          mode = 'local';
        }
      }
      selectChip(mode);
      renderPanel(mode);
    });
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
    if (modelPrefsSection) {
      modelPrefsSection.classList.remove('hidden');
    }

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
    if (modelPrefsSection) {
      modelPrefsSection.classList.add('hidden');
    }

    chrome.storage.local.set({ cloudModeEnabled: true });
  }

  /**
   * Update cloud provider selection
   * @param {HTMLElement} modal - The modal element
   * @param {string} provider - The selected provider (anthropic/openai/google/perplexity)
   */
  updateCloudProvider(modal, provider) {
    chrome.storage.local.set({ cloudProvider: provider });
    this.updateCloudProviderUI(modal, provider);
    this.loadApiKey(modal, provider);
  }

  /**
   * Update UI elements based on selected cloud provider
   * @param {HTMLElement} modal - The modal element
   * @param {string} provider - The selected provider
   */
  updateCloudProviderUI(modal, provider) {
    const apiKeyLink = modal.querySelector('#api-key-link');
    const modelHeader = modal.querySelector('#model-selection-header');
    const modelDescription = modal.querySelector('#model-description');

    // Update API key link
    const providerLinks = {
      anthropic: 'https://console.anthropic.com/settings/keys',
      openai: 'https://platform.openai.com/api-keys',
      google: 'https://aistudio.google.com/app/apikey',
      perplexity: 'https://www.perplexity.ai/settings/api',
    };
    if (apiKeyLink) {
      apiKeyLink.href = providerLinks[provider] || '#';
    }

    // Load cached or fallback models into dropdown
    this.populateCloudModelDropdown(modal, provider);

    // Update model header and description
    const providerNames = {
      anthropic: 'Claude',
      openai: 'OpenAI',
      google: 'Gemini',
      perplexity: 'Perplexity',
    };
    if (modelHeader) {
      modelHeader.textContent = `${providerNames[provider] || 'Model'} Selection`;
    }
    if (modelDescription) {
      modelDescription.textContent = `Select the ${providerNames[provider] || 'model'} for all AI features`;
    }
  }

  /**
   * Populate cloud model dropdown from cached models or hardcoded fallback
   * @param {HTMLElement} modal - The modal element
   * @param {string} provider - The provider name
   * @param {Array} [models] - Optional models array (skips cache lookup)
   */
  async populateCloudModelDropdown(modal, provider, models = null) {
    const modelSelect = modal.querySelector('#cloud-model-select');
    if (!modelSelect) {
      return;
    }

    // Hardcoded fallbacks (used when no cached/fetched models available)
    const fallbackModels = {
      anthropic: [
        {
          id: 'claude-haiku-4-5-20251001',
          name: 'Haiku (Fast)',
          description: 'Fast and economical',
        },
        {
          id: 'claude-sonnet-4-6',
          name: 'Sonnet (Recommended)',
          description: 'Best for everyday tasks',
        },
        {
          id: 'claude-opus-4-6',
          name: 'Opus (Most Capable)',
          description: 'Most capable for complex work',
        },
      ],
      openai: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
        { id: 'gpt-4o', name: 'GPT-4o (Recommended)' },
        { id: 'o3-mini', name: 'o3 Mini (Reasoning)' },
      ],
      google: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Recommended)' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (Fast)' },
      ],
      perplexity: [
        { id: 'sonar', name: 'Sonar (Recommended)' },
        { id: 'sonar-pro', name: 'Sonar Pro (Most Capable)' },
        { id: 'sonar-reasoning', name: 'Sonar Reasoning' },
      ],
    };

    let modelList = models;

    // Try to load from cache if no models provided
    if (!modelList) {
      try {
        const cacheKey = `cloudModels_${provider}`;
        const cached = await chrome.storage.local.get(cacheKey);
        if (cached[cacheKey]?.models?.length > 0) {
          modelList = cached[cacheKey].models;
          console.log(`[Popup] Loaded ${modelList.length} cached models for ${provider}`);
        }
      } catch (e) {
        console.warn('[Popup] Failed to load cached models:', e);
      }
    }

    // Fallback to hardcoded
    if (!modelList || modelList.length === 0) {
      modelList = fallbackModels[provider] || fallbackModels.anthropic;
    }

    // Find recommended model (first one with "Recommended" in name, or first model)
    const recommendedModel = modelList.find(m => m.name?.includes('Recommended')) || modelList[0];
    const savedModel = await new Promise(resolve => {
      chrome.storage.local.get(['cloudModel'], result => resolve(result.cloudModel));
    });

    // If no model has ever been saved, persist the recommended one now so features
    // always have a valid default without falling back to their own hardcoded values.
    if (!savedModel && recommendedModel) {
      chrome.storage.local.set({ cloudModel: recommendedModel.id });
      console.log(`[Popup] Auto-saved default cloudModel: ${recommendedModel.id}`);
    }

    // Build options HTML
    modelSelect.innerHTML = modelList
      .map(m => {
        const selected =
          (savedModel && m.id === savedModel) ||
          (!savedModel && recommendedModel && m.id === recommendedModel.id)
            ? ' selected'
            : '';
        const desc = m.description ? ` — ${m.description}` : '';
        return `<option value="${m.id}"${selected}>${m.name}${desc}</option>`;
      })
      .join('\n');

    console.log(`[Popup] Model dropdown populated with ${modelList.length} models for ${provider}`);
  }

  /**
   * Fetch models from provider API and update dropdown
   * Called after successful API key verification
   * @param {HTMLElement} modal - The modal element
   * @param {string} provider - The provider name
   * @param {string} apiKey - The verified API key
   */
  async fetchAndPopulateModels(modal, provider, apiKey) {
    const modelSelect = modal.querySelector('#cloud-model-select');
    if (!modelSelect) {
      return;
    }

    try {
      console.log(`[Popup] Fetching models for ${provider}...`);

      const response = await chrome.runtime.sendMessage({
        action: 'CLOUD_FETCH_MODELS',
        provider,
        apiKey,
      });

      if (response?.success && response?.models?.length > 0) {
        console.log(`[Popup] Fetched ${response.models.length} models from ${provider}`);
        this.populateCloudModelDropdown(modal, provider, response.models);
      } else {
        console.warn(`[Popup] Model fetch returned no models for ${provider}`);
      }
    } catch (error) {
      console.warn(`[Popup] Failed to fetch models for ${provider}:`, error);
    }
  }

  /**
   * Load API key for provider from storage
   * @param {HTMLElement} modal - The modal element
   * @param {string} provider - The provider name
   */
  async loadApiKey(modal, provider) {
    const apiKeyInput = modal.querySelector('#cloud-api-key');
    if (!apiKeyInput) {
      return;
    }

    try {
      // Use secure encrypted storage
      const { getSecureAPIKey } = await import('../core/storage/secure-key-storage.js');
      const key = await getSecureAPIKey(provider);

      if (key) {
        apiKeyInput.value = key;
        this.updateApiKeyStatus(modal, '✓ API key configured (encrypted)', 'success');
        this.toggleModelSelection(modal, true);
        // Load cached models into dropdown (populated dynamically after key verification)
        this.populateCloudModelDropdown(modal, provider);
      } else {
        apiKeyInput.value = '';
        this.updateApiKeyStatus(modal, 'No API key configured', 'warning');
        this.toggleModelSelection(modal, false);
      }
    } catch (error) {
      console.error('[Popup] Failed to load API key:', error.message);
      this.updateApiKeyStatus(modal, 'Error loading API key', 'error');
      this.toggleModelSelection(modal, false);
    }
  }

  /**
   * Show/hide the model selection section based on API key presence
   * @param {HTMLElement} modal - The modal element
   * @param {boolean} show - Whether to show the section
   */
  toggleModelSelection(modal, show) {
    const modelSection = modal.querySelector('#cloud-model-section');
    const usageSection = modal.querySelector('#usage-stats-section');

    if (modelSection) {
      modelSection.style.display = show ? 'block' : 'none';
    }
    if (usageSection) {
      usageSection.style.display = show ? 'block' : 'none';
    }
  }

  /**
   * Update API key status message
   * @param {HTMLElement} modal - The modal element
   * @param {string} message - Status message
   * @param {string} type - Status type (success/warning/error)
   */
  updateApiKeyStatus(modal, message, type = 'info') {
    const statusEl = modal.querySelector('#api-key-status');
    if (!statusEl) {
      return;
    }

    const colors = {
      success: '#16a34a',
      warning: '#ea580c',
      error: '#dc2626',
      info: '#666',
    };

    statusEl.textContent = message;
    statusEl.style.color = colors[type] || colors.info;
    statusEl.style.marginRight = '8px';
    statusEl.style.fontWeight = '600';
  }

  /**
   * Test API key connection
   * @param {string} provider - The cloud provider
   * @param {string} apiKey - The API key to test
   * @param {HTMLElement} modal - The modal element
   */
  async testAPIKey(provider, apiKey, modal) {
    if (!apiKey) {
      this.updateApiKeyStatus(modal, 'Please enter an API key', 'warning');
      return;
    }

    const testBtn = modal.querySelector('#test-api-key');
    const originalText = testBtn.textContent;
    testBtn.textContent = 'Testing...';
    testBtn.disabled = true;
    this.updateApiKeyStatus(modal, 'Testing connection...', 'info');

    try {
      // Import secure API key manager
      const { saveSecureAPIKey, isValidKeyFormat, testSecureConnection } = await import(
        '../core/storage/secure-key-storage.js'
      );

      // Validate format first
      if (!isValidKeyFormat(provider, apiKey)) {
        this.updateApiKeyStatus(modal, '❌ Invalid API key format', 'error');
        this.toggleModelSelection(modal, false);
        testBtn.textContent = originalText;
        testBtn.disabled = false;
        return;
      }

      // Test the API connection (key passed securely in headers)
      const testResult = await testSecureConnection(provider, apiKey);

      if (!testResult.success) {
        this.updateApiKeyStatus(modal, `❌ ${testResult.message}`, 'error');
        this.toggleModelSelection(modal, false);
        testBtn.textContent = originalText;
        testBtn.disabled = false;
        return;
      }

      // Save with encryption
      const saved = await saveSecureAPIKey(provider, apiKey);

      if (saved) {
        this.updateApiKeyStatus(modal, '✅ Saved (encrypted)', 'success');
        this.toggleModelSelection(modal, true);

        // Fetch available models from provider API and populate dropdown
        this.updateApiKeyStatus(modal, '✅ Saved (encrypted) — Fetching models...', 'success');
        await this.fetchAndPopulateModels(modal, provider, apiKey);
        this.updateApiKeyStatus(modal, '✅ Saved (encrypted)', 'success');
      } else {
        this.updateApiKeyStatus(modal, '❌ Failed to save API key', 'error');
        this.toggleModelSelection(modal, false);
      }
    } catch (error) {
      console.error('[Popup] API key test failed:', error.message);
      this.updateApiKeyStatus(modal, `❌ Error: ${error.message}`, 'error');
      this.toggleModelSelection(modal, false);
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
      alert(
        `Installing model: ${modelName}\n\nRun this in your terminal:\n\nollama pull ${modelName}`
      );
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
    } catch {
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
    const listEl = modal.querySelector('#local-model-list');
    if (!listEl) {
      return;
    }

    listEl.innerHTML = '';

    if (models.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'local-model-list-empty';
      empty.textContent = 'No models installed — click "+ Install New Model" below';
      listEl.appendChild(empty);
    } else {
      models.forEach(model => {
        const item = document.createElement('div');
        item.className = 'local-model-item';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        item.dataset.model = model.name;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'local-model-item-name';
        nameSpan.textContent = model.name;

        const chip = document.createElement('span');
        chip.className = 'local-model-default-chip';
        chip.textContent = 'default';
        chip.setAttribute('aria-hidden', 'true');

        item.appendChild(nameSpan);
        item.appendChild(chip);
        listEl.appendChild(item);
      });

      // Single-click: visual focus highlight
      listEl.addEventListener('click', e => {
        const item = e.target.closest('.local-model-item');
        if (!item) {
          return;
        }
        listEl.querySelectorAll('.local-model-item').forEach(i => i.classList.remove('is-focused'));
        item.classList.add('is-focused');
      });

      // Double-click: set as default (cascades to all task types)
      listEl.addEventListener('dblclick', e => {
        const item = e.target.closest('.local-model-item');
        if (!item) {
          return;
        }
        this.setDefaultModelCascade(modal, models, item.dataset.model);
      });

      // Keyboard: arrows to navigate, Enter to set default
      listEl.addEventListener('keydown', e => {
        const items = [...listEl.querySelectorAll('.local-model-item')];
        if (!items.length) {
          return;
        }
        const focused = listEl.querySelector('.local-model-item.is-focused');
        let idx = focused ? items.indexOf(focused) : -1;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          idx = Math.min(idx + 1, items.length - 1);
          items.forEach(i => i.classList.remove('is-focused'));
          items[idx].classList.add('is-focused');
          items[idx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          idx = Math.max(idx - 1, 0);
          items.forEach(i => i.classList.remove('is-focused'));
          items[idx].classList.add('is-focused');
          items[idx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && focused) {
          this.setDefaultModelCascade(modal, models, focused.dataset.model);
        }
      });
    }

    // Populate the task-override dropdowns
    this.populateModelPreferences(modal, models);
  }

  /**
   * Populate model preference dropdowns for task types
   * @param {HTMLElement} modal - The modal element
   * @param {Array} models - List of Ollama models
   */
  async populateModelPreferences(modal, models) {
    // Only Academic and Code are user-configurable overrides.
    // General = the default model (set via double-click in the list).
    // Vision = always auto (uses first available vision model).
    const overrideTypes = ['academic', 'code'];

    const savedPrefs = await new Promise(resolve => {
      chrome.storage.local.get('modelPreferences', result => {
        resolve(result.modelPreferences || {});
      });
    });

    overrideTypes.forEach(taskType => {
      const select = modal.querySelector(`#model-${taskType}`);
      if (!select) {
        return;
      }

      select.innerHTML = '';

      // Auto option
      const autoOption = document.createElement('option');
      autoOption.value = 'auto';
      autoOption.textContent = 'Auto (use default)';
      select.appendChild(autoOption);

      if (taskType === 'code') {
        // Code models first, then all others
        const codeModels = models.filter(
          m => m.name.includes('code') || m.name.includes('coder') || m.name.includes('deepseek')
        );
        const otherModels = models.filter(
          m => !m.name.includes('code') && !m.name.includes('coder') && !m.name.includes('deepseek')
        );
        if (codeModels.length > 0) {
          const codeGroup = document.createElement('optgroup');
          codeGroup.label = 'Code Models';
          codeModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            codeGroup.appendChild(opt);
          });
          select.appendChild(codeGroup);
        }
        if (otherModels.length > 0) {
          const otherGroup = document.createElement('optgroup');
          otherGroup.label = 'General Models';
          otherModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            otherGroup.appendChild(opt);
          });
          select.appendChild(otherGroup);
        }
      } else {
        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.textContent = m.name;
          select.appendChild(opt);
        });
      }

      // Restore saved value
      if (savedPrefs[taskType] && select.querySelector(`option[value="${savedPrefs[taskType]}"]`)) {
        select.value = savedPrefs[taskType];
      }

      select.addEventListener('change', () => {
        this.saveModelPreference(taskType, select.value);
      });
    });

    // Show the active default model card
    this.updateActiveModelDisplay(modal, models, savedPrefs.general);
  }

  /**
   * Update the active/default model indicator in the local AI section
   * @param {HTMLElement} modal - The modal element
   * @param {Array} models - List of Ollama model objects
   * @param {string} generalPref - Saved general preference ('auto' or model name)
   */
  updateActiveModelDisplay(modal, models, generalPref = 'auto') {
    const cardEl = modal.querySelector('#active-model-info');
    const nameEl = modal.querySelector('#active-model-name');
    if (!cardEl || !nameEl) {
      return;
    }

    // Resolve effective model: explicit pref → balanced auto-detect → first available
    let effectiveModel;
    if (generalPref && generalPref !== 'auto') {
      effectiveModel = generalPref;
    } else {
      const balanced = ['llama3.2', 'llama3.2:latest', 'mistral', 'mistral:latest'];
      effectiveModel = null;
      for (const pref of balanced) {
        const match = models.find(m => m.name === pref || m.name.startsWith(pref.split(':')[0]));
        if (match) {
          effectiveModel = match.name;
          break;
        }
      }
      if (!effectiveModel) {
        effectiveModel = models[0]?.name || 'None available';
      }
    }

    nameEl.textContent = effectiveModel;
    cardEl.style.display = 'block';

    // Highlight the default item in the custom list
    const listEl = modal.querySelector('#local-model-list');
    if (listEl) {
      listEl.querySelectorAll('.local-model-item').forEach(item => {
        const isDefault = item.dataset.model === effectiveModel;
        item.classList.toggle('is-default', isDefault);
        item.setAttribute('aria-selected', String(isDefault));
        if (isDefault) {
          item.scrollIntoView({ block: 'nearest' });
        }
      });
    }
  }

  /**
   * Set a model as the default and cascade to all task types (general, academic, code).
   * Vision is intentionally excluded — it always auto-routes to llava.
   */
  async setDefaultModelCascade(modal, models, modelName) {
    // Single storage write for all cascade types
    const result = await new Promise(resolve => {
      chrome.storage.local.get('modelPreferences', r => resolve(r));
    });
    const prefs = result.modelPreferences || {};
    ['general', 'academic', 'code'].forEach(t => {
      prefs[t] = modelName;
    });
    await chrome.storage.local.set({ modelPreferences: prefs });

    // Notify service worker
    ['general', 'academic', 'code'].forEach(t => {
      chrome.runtime
        .sendMessage({ action: 'SET_MODEL_PREFERENCE', taskType: t, model: modelName })
        .catch(() => {});
    });

    // Sync the Academic and Code dropdowns
    ['academic', 'code'].forEach(taskType => {
      const select = modal.querySelector(`#model-${taskType}`);
      if (select && select.querySelector(`option[value="${modelName}"]`)) {
        select.value = modelName;
      }
    });

    // Update the default model card and list highlight
    this.updateActiveModelDisplay(modal, models, modelName);

    console.log(`[Settings] Default model cascaded → ${modelName} (general, academic, code)`);
  }

  /**
   * Save model preference for a task type
   * @param {string} taskType - The task type (general, academic, vision, code)
   * @param {string} modelName - The selected model name
   */
  async saveModelPreference(taskType, modelName) {
    const result = await new Promise(resolve => {
      chrome.storage.local.get('modelPreferences', r => resolve(r));
    });

    const prefs = result.modelPreferences || {};
    prefs[taskType] = modelName;

    await chrome.storage.local.set({ modelPreferences: prefs });

    // Notify service worker of preference change
    chrome.runtime
      .sendMessage({
        action: 'SET_MODEL_PREFERENCE',
        taskType,
        model: modelName,
      })
      .catch(() => {});

    console.log(`[Settings] Model preference saved: ${taskType} → ${modelName}`);
  }

  setupModalTabs(modal) {
    const tabs = modal.querySelectorAll('.modal-tab');
    const contents = modal.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      this.attachInteractiveHandler(tab, 'Modal Tab', () => {
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
    this.attachInteractiveHandler(modal.querySelector('#modal-close'), 'Modal Close Button', () => {
      modal.remove();
    });

    // Cancel button
    this.attachInteractiveHandler(
      modal.querySelector('#modal-cancel'),
      'Modal Cancel Button',
      () => {
        modal.remove();
      }
    );

    // Save button
    this.attachInteractiveHandler(modal.querySelector('#modal-save'), 'Modal Save Button', () => {
      this.saveModalSettings();
      modal.remove();
    });

    // Click outside to close
    // NOTE: Use regular addEventListener (not attachInteractiveHandler) to avoid
    // preventing default behavior on dropdowns/inputs inside the modal
    modal.addEventListener('click', e => {
      console.log('[Popup] Modal click event:', e.target);
      if (e.target === modal) {
        console.log('[Popup] Click on backdrop - closing modal');
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
    loadCheckbox('show-stt', 'show_stt', true);
    loadCheckbox('show-screen-overlay', 'show_screen_overlay');
    loadCheckbox('show-canvas-integration', 'show_canvas_integration', false); // EXPERIMENTAL - hidden by default
    loadCheckbox('show-moodle-integration', 'show_moodle_integration', false); // EXPERIMENTAL - hidden by default
    loadCheckbox('show-google-classroom-integration', 'show_google_classroom_integration', false); // EXPERIMENTAL - hidden by default
    loadCheckbox('show-dyslexia-mode', 'show_dyslexia_mode');
    loadCheckbox('show-annotations', 'show_annotations'); // Annotations
    loadCheckbox('show-citations', 'show_citations'); // Citations
    // Dark Mode feature removed - extension UI dark mode remains in popup header
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
      });

      // Toggle password visibility
      if (googleApiKeyToggle) {
        this.attachInteractiveHandler(googleApiKeyToggle, 'Google API Key Toggle', () => {
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

      this.attachInteractiveHandler(
        clearCacheButton,
        'Clear Translation Cache Button',
        async () => {
          await chrome.storage.local.set({ translationCache: {} });
          cacheCountSpan.textContent = '0';
          console.log('[Popup] Translation cache cleared');
          alert('Translation cache cleared successfully!');
        }
      );
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

    // Load UI overlay visibility settings
    const uiOverlay = this.settings.ui_overlay || {};

    const showTextStatsBadge = document.getElementById('show-text-stats-badge');
    if (showTextStatsBadge) {
      showTextStatsBadge.checked = uiOverlay.show_text_stats_badge !== false;
    }

    const showTextStatsNotifications = document.getElementById('show-text-stats-notifications');
    if (showTextStatsNotifications) {
      showTextStatsNotifications.checked = uiOverlay.show_text_stats_notifications !== false;
    }

    const showFeatureNotifications = document.getElementById('show-feature-notifications');
    if (showFeatureNotifications) {
      showFeatureNotifications.checked = uiOverlay.show_feature_notifications !== false;
    }

    const showTokenCounter = document.getElementById('show-token-counter');
    if (showTokenCounter) {
      showTokenCounter.checked = uiOverlay.show_token_counter !== false;
    }

    const showReadingProgressBadge = document.getElementById('show-reading-progress-badge');
    if (showReadingProgressBadge) {
      showReadingProgressBadge.checked = uiOverlay.show_reading_progress_badge !== false;
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
    grid.innerHTML = sanitizeHTML('');

    // Create a card for each shortcut
    for (const [key, shortcut] of Object.entries(shortcuts)) {
      const card = document.createElement('div');
      card.className = 'shortcut-card';
      card.setAttribute('data-shortcut', key);

      const displayShortcut = shortcut || 'Not set';
      const isEmpty = !shortcut;

      card.innerHTML = sanitizeHTML(`
        <div class="shortcut-info">
          <span class="shortcut-name">${SHORTCUT_LABELS[key] || key}</span>
          <span class="shortcut-category">${categories[key] || 'General'}</span>
        </div>
        <kbd class="shortcut-key${isEmpty ? ' empty' : ''}">${displayShortcut}</kbd>
        <div class="shortcut-actions">
          <button class="shortcut-edit-btn" data-key="${key}" title="Click to assign shortcut">✏️</button>
          ${!isEmpty ? `<button class="shortcut-clear-btn" data-key="${key}" title="Clear shortcut">✕</button>` : ''}
        </div>
      `);

      grid.appendChild(card);
    }

    // Add event listeners to edit buttons
    grid.querySelectorAll('.shortcut-edit-btn').forEach(btn => {
      this.attachInteractiveHandler(btn, 'Shortcut Edit Button', e => {
        const key = e.currentTarget.getAttribute('data-key');
        this.startShortcutRecording(key, shortcuts);
      });
    });

    // Add event listeners to clear buttons
    grid.querySelectorAll('.shortcut-clear-btn').forEach(btn => {
      this.attachInteractiveHandler(btn, 'Shortcut Clear Button', async e => {
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
      this.attachInteractiveHandler(clearAllBtn, 'Clear All Shortcuts Button', async () => {
        if (confirm('Clear all keyboard shortcuts? This cannot be undone.')) {
          const emptyShortcuts = {};
          for (const key of Object.keys(shortcuts)) {
            emptyShortcuts[key] = '';
          }
          await saveShortcuts(emptyShortcuts);
          this.loadKeyboardShortcuts();
          this.updateStatus('All shortcuts cleared');
        }
      });
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
      this.attachInteractiveHandler(btn, 'Shortcut Preset Button', async e => {
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
    this.attachInteractiveHandler(cancelBtn, 'Shortcut Capture Cancel Button', closeOverlay);

    // Clear button
    if (clearBtn) {
      this.attachInteractiveHandler(clearBtn, 'Shortcut Capture Clear Button', () => {
        recordedShortcut = null;
        display.textContent = 'Press keys...';
        errorDiv.textContent = '';
        saveBtn.disabled = true;
        modifierKeys.forEach(key => key.classList.remove('active'));
      });
    }

    // Save button
    this.attachInteractiveHandler(saveBtn, 'Shortcut Capture Save Button', async () => {
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
    });

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
    saveCheckbox('show-citations', 'show_citations'); // Citations
    saveCheckbox('show-translation', 'show_translation'); // Translation
    // Dark Mode feature removed - extension UI dark mode remains in popup header
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

    // Save UI overlay visibility settings
    if (!this.settings.ui_overlay) {
      this.settings.ui_overlay = {};
    }

    const showTextStatsBadge = document.getElementById('show-text-stats-badge');
    if (showTextStatsBadge) {
      this.settings.ui_overlay.show_text_stats_badge = showTextStatsBadge.checked;
    }

    const showTextStatsNotifications = document.getElementById('show-text-stats-notifications');
    if (showTextStatsNotifications) {
      this.settings.ui_overlay.show_text_stats_notifications = showTextStatsNotifications.checked;
    }

    const showFeatureNotifications = document.getElementById('show-feature-notifications');
    if (showFeatureNotifications) {
      this.settings.ui_overlay.show_feature_notifications = showFeatureNotifications.checked;
    }

    const showTokenCounter = document.getElementById('show-token-counter');
    if (showTokenCounter) {
      this.settings.ui_overlay.show_token_counter = showTokenCounter.checked;
    }

    const showReadingProgressBadge = document.getElementById('show-reading-progress-badge');
    if (showReadingProgressBadge) {
      this.settings.ui_overlay.show_reading_progress_badge = showReadingProgressBadge.checked;
    }

    // Save to storage (includes both chrome.storage.sync for settings and chrome.storage.local for ui_overlay)
    this.saveSettings();

    // Also save UI overlay settings to chrome.storage.local for content scripts
    chrome.storage.local.set({
      textStatsBadgeVisible: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_text_stats_badge !== false,
      textStatsNotificationsEnabled: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_text_stats_notifications !== false,
      featureNotificationsEnabled: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_feature_notifications !== false,
      tokenCounterVisible: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_token_counter !== false,
      readingProgressBadgeVisible: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_reading_progress_badge !== false,
    });

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
      console.log('[Popup][loadVoices] Loading voices from speechSynthesis...');
      const voices = speechSynthesis.getVoices();
      console.log('[Popup][loadVoices] Found', voices.length, 'voices immediately');

      if (voices.length === 0) {
        console.log('[Popup][loadVoices] No voices yet, waiting for voiceschanged event...');
        // Wait for voices to load
        speechSynthesis.addEventListener('voiceschanged', () => {
          console.log('[Popup][loadVoices] voiceschanged event fired');
          this.populateVoices(speechSynthesis.getVoices());
        });
      } else {
        this.populateVoices(voices);
      }
      console.log('[Popup][loadVoices] ✓ Voice loading initiated');
    } catch (error) {
      console.error('[Popup][loadVoices] ❌ Error loading voices:', error);
      console.error('[Popup][loadVoices] Error stack:', error.stack);
    }
  }

  populateVoices(voices) {
    const voiceSelect = document.getElementById('voice-select');
    voiceSelect.innerHTML = sanitizeHTML('');

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
    console.log('[Popup][updateUI] Starting UI update...');
    // UI updates can be added here as needed
    console.log('[Popup][updateUI] ✓ UI update complete');
  }

  updateStatus(message, type = '') {
    const statusIndicator = document.getElementById('status-indicator');
    statusIndicator.textContent = message;
    statusIndicator.className = 'status-indicator ' + type;
  }

  updateProviderUI(provider) {
    const deeplKeySection = document.getElementById('deepl-key-section');
    const azureKeySection = document.getElementById('azure-key-section');

    if (!deeplKeySection || !azureKeySection) {
      return;
    }

    // Hide all API key sections first
    deeplKeySection.style.display = 'none';
    azureKeySection.style.display = 'none';

    // Show the relevant section based on provider
    if (provider === 'deepl') {
      deeplKeySection.style.display = 'block';
    } else if (provider === 'azure') {
      azureKeySection.style.display = 'block';
    }
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
      this._saveTextCustomizationSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        textCustomizationDescription.classList.remove('hidden');
        textCustomizationOptions.classList.remove('hidden');
      } else {
        textCustomizationDescription.classList.add('hidden');
        textCustomizationOptions.classList.add('hidden');
      }
    });

    // Sync toggle: "Apply to all windows" (default OFF)
    const syncToggle = document.getElementById('text-customization-sync');
    chrome.storage.local.get('textCustomSync', result => {
      // Default to false (local only) if not yet stored
      syncToggle.checked = result.textCustomSync === true;
    });
    // Use change event (not attachInteractiveHandler) — mousedown+preventDefault
    // would block the checkbox from toggling its checked state.
    syncToggle.addEventListener('change', () => {
      const syncEnabled = syncToggle.checked;
      chrome.storage.local
        .set({ textCustomSync: syncEnabled })
        .catch(err => console.error('[Popup] Failed to save textCustomSync:', err));

      if (syncEnabled) {
        // Toggle switched ON: push current formatting to all other tabs immediately
        this._applyTextCustomizationAllTabs();
      } else {
        // Toggle switched OFF: clear formatting on all OTHER tabs, apply to current tab only
        this._clearTextCustomizationOtherTabs();
      }

      // Save settings to the appropriate destination
      this._saveTextCustomizationSettings();
    });

    // Font Family selector
    const fontFamilySelect = document.getElementById('text-font-family');
    fontFamilySelect.value = this.settings.textCustomization.fontFamily || 'lexend';
    fontFamilySelect.addEventListener('change', e => {
      this.settings.textCustomization.fontFamily = e.target.value;
      this._saveTextCustomizationSettings();
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
      this._saveTextCustomizationSettings();
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
      this._saveTextCustomizationSettings();
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
      this._saveTextCustomizationSettings();
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
      this._saveTextCustomizationSettings();
    });

    console.log('[Popup] Text Customization initialized');
  }

  /**
   * Save text customization settings respecting the "Apply to all windows" sync toggle.
   * Toggle ON (default): saves via the normal saveSettings() path — broadcasts to all tabs.
   * Toggle OFF: sends directly to the current tab only via chrome.tabs.sendMessage.
   *             Do NOT write to chrome.storage.local — it is shared across all tabs and
   *             storage.onChanged would broadcast the change to every open window.
   */
  async _saveTextCustomizationSettings() {
    const syncToggle = document.getElementById('text-customization-sync');
    const syncEnabled = syncToggle ? syncToggle.checked : true;

    if (syncEnabled) {
      // Normal path: saves to assist_settings and broadcasts to all open tabs via storage.onChanged
      await this.saveSettings();
    } else {
      // This-window-only path: send directly to the current tab only
      if (this.currentTab?.id) {
        try {
          await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'LOCAL_TEXT_CUSTOMIZATION',
            settings: this.settings.textCustomization,
          });
        } catch (err) {
          console.warn('[Popup] Could not send local text customization to tab:', err.message);
        }
      }
    }
  }

  /**
   * Send CLEAR_TEXT_CUSTOMIZATION to all tabs except the current one.
   * Called when the "Apply to all windows" toggle is switched OFF so that
   * other windows revert to unstyled and only the focused window keeps formatting.
   */
  async _clearTextCustomizationOtherTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      const currentId = this.currentTab?.id;
      const sends = tabs
        .filter(tab => tab.id !== currentId && tab.id)
        .map(tab =>
          chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_TEXT_CUSTOMIZATION' }).catch(() => {
            // Tab may not have content script — silently ignore
          })
        );
      await Promise.all(sends);
      console.log('[Popup] Cleared text customization on all other tabs');
    } catch (err) {
      console.warn('[Popup] Error clearing text customization on other tabs:', err.message);
    }
  }

  /**
   * Push the current text customization settings to ALL tabs (including current).
   * Called when "Apply to all windows" is toggled ON so other tabs immediately
   * receive the formatting that was set while the toggle was OFF.
   */
  async _applyTextCustomizationAllTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      const sends = tabs
        .filter(tab => tab.id)
        .map(tab =>
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'LOCAL_TEXT_CUSTOMIZATION',
              settings: this.settings.textCustomization,
            })
            .catch(() => {
              // Tab may not have content script — silently ignore
            })
        );
      await Promise.all(sends);
      console.log('[Popup] Applied text customization to all tabs');
    } catch (err) {
      console.warn('[Popup] Error applying text customization to all tabs:', err.message);
    }
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
  // CUSTOM CURSOR (Extracted from Stargardt)
  // ============================================================
  setupCustomCursor() {
    // Initialize customCursor settings if they don't exist
    if (!this.settings.customCursor) {
      this.settings.customCursor = {
        enabled: false,
        size: 32,
        style: 'crosshair',
        color: '#ff0000',
      };
    }

    const cursorEnabled = document.getElementById('custom-cursor-enabled');
    const cursorDescription = document.getElementById('custom-cursor-description');
    const cursorOptions = document.getElementById('custom-cursor-options');

    // Set initial state
    cursorEnabled.checked = this.settings.customCursor.enabled || false;

    // Show/hide description and options based on enabled state
    if (cursorEnabled.checked) {
      cursorDescription.classList.remove('hidden');
      cursorOptions.classList.remove('hidden');
    } else {
      cursorDescription.classList.add('hidden');
      cursorOptions.classList.add('hidden');
    }

    // Toggle event
    cursorEnabled.addEventListener('change', e => {
      this.settings.customCursor.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        cursorDescription.classList.remove('hidden');
        cursorOptions.classList.remove('hidden');
      } else {
        cursorDescription.classList.add('hidden');
        cursorOptions.classList.add('hidden');
      }
    });

    // Cursor Size slider
    const cursorSizeSlider = document.getElementById('custom-cursor-size');
    const cursorSizeValue = document.getElementById('custom-cursor-size-value');
    cursorSizeSlider.value = this.settings.customCursor.size || 32;
    cursorSizeValue.textContent = cursorSizeSlider.value + 'px';
    cursorSizeSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      cursorSizeValue.textContent = value + 'px';
      this.settings.customCursor.size = value;
      this.saveSettings();
    });

    // Cursor Style selector
    const cursorStyleSelect = document.getElementById('custom-cursor-style');
    cursorStyleSelect.value = this.settings.customCursor.style || 'crosshair';
    cursorStyleSelect.addEventListener('change', e => {
      this.settings.customCursor.style = e.target.value;
      this.saveSettings();
    });

    // Cursor Color selector
    const cursorColorSelect = document.getElementById('custom-cursor-color');
    cursorColorSelect.value = this.settings.customCursor.color || '#ff0000';
    cursorColorSelect.addEventListener('change', e => {
      this.settings.customCursor.color = e.target.value;
      this.saveSettings();
    });

    console.log('[Popup] Custom Cursor initialized');
  }

  // ============================================================
  // MAGNIFYING LENS (Extracted from Stargardt)
  // ============================================================
  setupMagnifyingLens() {
    // Initialize magnifyingLens settings if they don't exist
    if (!this.settings.magnifyingLens) {
      this.settings.magnifyingLens = {
        enabled: false,
        scale: 2.0,
        size: 275,
        offsetEnabled: false,
        offset: 150,
        offsetDir: 'right',
        lock: false,
      };
    }

    const lensEnabled = document.getElementById('magnifying-lens-enabled');
    const lensDescription = document.getElementById('magnifying-lens-description');
    const lensOptions = document.getElementById('magnifying-lens-options');

    // Set initial state
    lensEnabled.checked = this.settings.magnifyingLens.enabled || false;

    // Show/hide description and options based on enabled state
    if (lensEnabled.checked) {
      lensDescription.classList.remove('hidden');
      lensOptions.classList.remove('hidden');
    } else {
      lensDescription.classList.add('hidden');
      lensOptions.classList.add('hidden');
    }

    // Toggle event
    lensEnabled.addEventListener('change', e => {
      this.settings.magnifyingLens.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        lensDescription.classList.remove('hidden');
        lensOptions.classList.remove('hidden');
      } else {
        lensDescription.classList.add('hidden');
        lensOptions.classList.add('hidden');
      }
    });

    // Magnification Scale slider
    const scaleSlider = document.getElementById('magnifying-lens-scale');
    const scaleValue = document.getElementById('magnifying-lens-scale-value');
    scaleSlider.value = this.settings.magnifyingLens.scale || 2.0;
    scaleValue.textContent = scaleSlider.value + 'x';
    scaleSlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      scaleValue.textContent = value + 'x';
      this.settings.magnifyingLens.scale = value;
      this.saveSettings();
    });

    // Lens Size slider
    const sizeSlider = document.getElementById('magnifying-lens-size');
    const sizeValue = document.getElementById('magnifying-lens-size-value');
    sizeSlider.value = this.settings.magnifyingLens.size || 275;
    sizeValue.textContent = sizeSlider.value + 'px';
    sizeSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      sizeValue.textContent = value + 'px';
      this.settings.magnifyingLens.size = value;
      this.saveSettings();
    });

    // Offset Enabled toggle
    const offsetEnabledToggle = document.getElementById('magnifying-lens-offset-enabled');
    const offsetControls = document.getElementById('magnifying-lens-offset-controls');
    offsetEnabledToggle.checked = this.settings.magnifyingLens.offsetEnabled || false;

    // Show/hide offset controls based on initial state
    if (offsetEnabledToggle.checked) {
      offsetControls.classList.remove('hidden');
    } else {
      offsetControls.classList.add('hidden');
    }

    offsetEnabledToggle.addEventListener('change', e => {
      this.settings.magnifyingLens.offsetEnabled = e.target.checked;
      this.saveSettings();

      // Toggle offset controls visibility
      if (e.target.checked) {
        offsetControls.classList.remove('hidden');
      } else {
        offsetControls.classList.add('hidden');
      }
    });

    // Offset Distance slider
    const offsetSlider = document.getElementById('magnifying-lens-offset');
    const offsetValue = document.getElementById('magnifying-lens-offset-value');
    offsetSlider.value = this.settings.magnifyingLens.offset || 150;
    offsetValue.textContent = offsetSlider.value + 'px';
    offsetSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      offsetValue.textContent = value + 'px';
      this.settings.magnifyingLens.offset = value;
      this.saveSettings();
    });

    // Offset Direction selector
    const offsetDirSelect = document.getElementById('magnifying-lens-offset-dir');
    offsetDirSelect.value = this.settings.magnifyingLens.offsetDir || 'right';
    offsetDirSelect.addEventListener('change', e => {
      this.settings.magnifyingLens.offsetDir = e.target.value;
      this.saveSettings();
    });

    // Lock Position toggle
    const lockToggle = document.getElementById('magnifying-lens-lock');
    lockToggle.checked = this.settings.magnifyingLens.lock || false;
    lockToggle.addEventListener('change', e => {
      this.settings.magnifyingLens.lock = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Magnifying Lens initialized');
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
  // REMOVED - Web page dark mode feature removed
  // Extension UI dark mode button (in header) remains functional

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
    this.attachInteractiveHandler(setupBtn, 'Stargardt Setup Button', () => {
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
    this.attachInteractiveHandler(calibrateBtn, 'Stargardt Calibrate Button', () => {
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
    this.attachInteractiveHandler(prlBtn, 'PRL Training Button', () => {
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
        this.attachInteractiveHandler(showStatsBtn, 'STT Show Stats Button', async () => {
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
        this.attachInteractiveHandler(showCommandsBtn, 'STT Show Commands Button', () => {
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

      this.attachInteractiveHandler(btn, 'Vocabulary Preset Button', async () => {
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
      this.attachInteractiveHandler(addWordBtn, 'Add Vocabulary Word Button', () => {
        this.showAddVocabularyWordModal();
      });
    }

    // Manage Vocabulary button
    const manageBtn = document.getElementById('btn-manage-vocabulary');
    if (manageBtn) {
      this.attachInteractiveHandler(manageBtn, 'Manage Vocabulary Button', () => {
        this.showManageVocabularyModal();
      });
    }

    // Import button
    const importBtn = document.getElementById('btn-import-vocabulary');
    if (importBtn) {
      this.attachInteractiveHandler(importBtn, 'Import Vocabulary Button', () => {
        this.importVocabulary();
      });
    }

    // Export button
    const exportBtn = document.getElementById('btn-export-vocabulary');
    if (exportBtn) {
      this.attachInteractiveHandler(exportBtn, 'Export Vocabulary Button', () => {
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

    // Safe innerHTML: hardcoded modal content (no user input)
    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; padding: 20px; width: 300px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 16px;">Add Custom Word</h3>
          <button id="close-add-vocab-modal" style="background: none; border: none; font-size: 20px; cursor: pointer;">&times;</button>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #666;">Word or Phrase:</label>
          <input type="text" id="vocab-word-input" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;" placeholder="e.g., adenocarcinoma">
          <button id="suggest-pronunciation-btn" style="display: none; margin-top: 6px; padding: 5px 10px; border: 1px solid #4a90d9; border-radius: 6px; background: #f0f7ff; color: #357abd; font-size: 12px; cursor: pointer;">Suggest Pronunciation</button>
          <span id="pronunciation-result" role="status" aria-live="polite" style="display: block; margin-top: 5px; font-size: 12px; color: #555; min-height: 18px;"></span>
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

    this.attachInteractiveHandler(
      document.getElementById('close-add-vocab-modal'),
      'Close Add Vocab Modal Button',
      closeModal
    );
    this.attachInteractiveHandler(
      document.getElementById('cancel-add-vocab'),
      'Cancel Add Vocab Button',
      closeModal
    );
    this.attachInteractiveHandler(modal, 'Add Vocab Modal Backdrop', e => {
      if (e.target === modal) {
        closeModal();
      }
    });

    this.attachInteractiveHandler(
      document.getElementById('confirm-add-vocab'),
      'Confirm Add Vocab Button',
      async () => {
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
      }
    );

    // Enter key to submit
    wordInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        document.getElementById('confirm-add-vocab').click();
      }
    });

    // Show/hide "Suggest Pronunciation" button based on input content
    const suggestBtn = document.getElementById('suggest-pronunciation-btn');
    const pronunciationResult = document.getElementById('pronunciation-result');

    wordInput.addEventListener('input', () => {
      const hasText = wordInput.value.trim().length > 0;
      suggestBtn.style.display = hasText ? 'inline-block' : 'none';
      // Clear result when input changes
      pronunciationResult.textContent = '';
      pronunciationResult.style.color = '#555';
    });

    // Suggest Pronunciation button handler
    this.attachInteractiveHandler(suggestBtn, 'Suggest Pronunciation Button', async () => {
      const word = wordInput.value.trim();
      if (!word) {
        return;
      }

      pronunciationResult.textContent = 'Checking pronunciation\u2026';
      pronunciationResult.style.color = '#888';
      suggestBtn.disabled = true;

      try {
        const modeInfo = await getAIMode('stt');
        const availability = await checkAIAvailable(modeInfo);

        if (!availability.available) {
          pronunciationResult.textContent =
            'AI unavailable \u2014 pronunciation suggestion requires AI to be enabled';
          pronunciationResult.style.color = '#c0392b';
          return;
        }

        const prompt = `Provide a simple phonetic pronunciation guide for the word: "${word}". Reply with only the phonetic spelling, nothing else. Example format: 'SOK-ra-teez' for 'Socrates'.`;
        const result = await generateWithAI(prompt, modeInfo, { maxTokens: 60 });

        if (result && result.text) {
          pronunciationResult.textContent = `Pronunciation: ${result.text.trim()}`;
          pronunciationResult.style.color = '#27ae60';
        } else {
          pronunciationResult.textContent =
            'Could not generate pronunciation \u2014 check AI settings';
          pronunciationResult.style.color = '#c0392b';
        }
      } catch (err) {
        console.warn('[Popup] Pronunciation suggestion failed:', err);
        pronunciationResult.textContent =
          'Could not generate pronunciation \u2014 check AI settings';
        pronunciationResult.style.color = '#c0392b';
      } finally {
        suggestBtn.disabled = false;
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

    // Safe innerHTML: hardcoded modal content (no user input)
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

    this.attachInteractiveHandler(
      document.getElementById('close-manage-vocab-modal'),
      'Close Manage Vocab Modal Button',
      closeModal
    );
    this.attachInteractiveHandler(
      document.getElementById('done-manage-vocab'),
      'Done Manage Vocab Button',
      closeModal
    );
    this.attachInteractiveHandler(modal, 'Manage Vocab Modal Backdrop', e => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Delete word buttons
    modal.querySelectorAll('.delete-vocab-word').forEach(btn => {
      this.attachInteractiveHandler(btn, 'Delete Vocab Word Button', () => {
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
    this.attachInteractiveHandler(
      document.getElementById('clear-all-vocab'),
      'Clear All Vocab Button',
      () => {
        if (confirm('Are you sure you want to delete all custom words?')) {
          this.settings.stt.vocabulary.customWords = [];
          this.saveSettings();

          this.sendCommandToTab({ command: 'CLEAR_VOCABULARY' });

          this.updateVocabularyStats();
          closeModal();
        }
      }
    );
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

    modalContent.innerHTML = sanitizeHTML(`
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
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Next"</code> / <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"Previous"</code></li>
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
    `);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Close modal handlers
    const closeBtn = document.getElementById('close-voice-commands-modal');
    this.attachInteractiveHandler(closeBtn, 'Close Voice Commands Modal Button', () =>
      modal.remove()
    );
    this.attachInteractiveHandler(modal, 'Voice Commands Modal Backdrop', e => {
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
    this.attachInteractiveHandler(toggleButton, 'Toggle Reading Mode Button', async () => {
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

    console.log('[Popup] Dyslexia Mode initialized');

    // ============================================================
    // ANNOTATIONS: MIGRATION MODAL CLOSE BUTTON
    // ============================================================
    // Note: Storage mode migration event listener is attached in loadModalSettings()
    // after the Advanced Options modal is created (the dropdown doesn't exist here)

    // Migration modal close button
    const btnMigrationClose = document.getElementById('btn-migration-close');
    if (btnMigrationClose) {
      this.attachInteractiveHandler(btnMigrationClose, 'Migration Modal Close Button', () => {
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
          // darkMode feature removed - extension UI dark mode remains
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
          // darkMode feature removed - extension UI dark mode remains
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
          // darkMode feature removed - extension UI dark mode remains
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
          // darkMode feature removed - extension UI dark mode remains
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
        description: 'Reduced eye strain with screen overlay for late-night studying',
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
          // darkMode feature removed - extension UI dark mode remains
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
          // darkMode feature removed - extension UI dark mode remains
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
          // darkMode feature removed - extension UI dark mode remains
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
          // darkMode feature removed - extension UI dark mode remains
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
      selector.innerHTML = sanitizeHTML('');
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
      modalSelector.innerHTML = sanitizeHTML('');
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
      this.attachInteractiveHandler(saveBtn, 'Save Profile Button', () => {
        this.profiles_showSaveModal();
      });
    }

    // Export button
    const exportBtn = document.getElementById('btn-export-profiles');
    if (exportBtn) {
      this.attachInteractiveHandler(exportBtn, 'Export Profiles Button', () => {
        this.profiles_export();
      });
    }

    // Import button
    const importBtn = document.getElementById('btn-import-profiles');
    if (importBtn) {
      this.attachInteractiveHandler(importBtn, 'Import Profiles Button', () => {
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
      this.attachInteractiveHandler(cancelSaveBtn, 'Cancel Save Profile Button', () => {
        document.getElementById('save-profile-modal')?.classList.add('hidden');
      });
    }

    const confirmSaveBtn = document.getElementById('btn-confirm-save-profile');
    if (confirmSaveBtn) {
      this.attachInteractiveHandler(confirmSaveBtn, 'Confirm Save Profile Button', () => {
        this.profiles_saveNew();
      });
    }

    // Delete profile modal
    const cancelDeleteBtn = document.getElementById('btn-cancel-delete-profile');
    if (cancelDeleteBtn) {
      this.attachInteractiveHandler(cancelDeleteBtn, 'Cancel Delete Profile Button', () => {
        document.getElementById('delete-profile-modal')?.classList.add('hidden');
      });
    }

    const confirmDeleteBtn = document.getElementById('btn-confirm-delete-profile');
    if (confirmDeleteBtn) {
      this.attachInteractiveHandler(confirmDeleteBtn, 'Confirm Delete Profile Button', () => {
        this.profiles_confirmDelete();
      });
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      this.attachInteractiveHandler(overlay, 'Profile Modal Overlay', () => {
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
    this.attachInteractiveHandler(createNoteButton, 'Create Sticky Note Button', async () => {
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
    this.attachInteractiveHandler(viewAnnotationsButton, 'View Annotations Button', async () => {
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
    this.attachInteractiveHandler(expandBtn, 'Citation Panel Expand Button', async () => {
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

    // ========================================
    // UNIFIED AI ASSIST SETUP
    // ========================================
    this.setupAIAssist();

    // ========================================
    // DARK MODE FEATURE REMOVED
    // Extension UI dark mode button (in header) remains functional
    // ========================================
  }

  /**
   * Set up the AI Assist section — inline mode chips + contextual panel.
   * Users can switch mode without opening the wizard.
   */
  setupAIAssist() {
    this.installedModels = [];

    const chipsEl = document.getElementById('ai-mode-chips');
    const panelEl = document.getElementById('ai-quick-panel');
    const advancedBtn = document.getElementById('btn-ai-advanced');
    const badgeEl = document.getElementById('llm-status-badge');
    const ctaBtn = document.getElementById('btn-ai-setup-cta');

    if (!chipsEl || !panelEl) {
      console.warn('[Popup] AI Assist chip elements not found');
      return;
    }

    // ── Wizard CTA ────────────────────────────────────────────────
    // Show "Set up AI →" button until the user has run the wizard once.
    // Stored as aiSetupDismissed; clicking it opens wizard and hides CTA permanently.
    if (ctaBtn) {
      chrome.storage.local.get('aiSetupDismissed', result => {
        if (!result.aiSetupDismissed) {
          ctaBtn.style.display = '';
        }
      });
      this.attachInteractiveHandler(ctaBtn, 'Set up AI', () => {
        chrome.storage.local.set({ aiSetupDismissed: true });
        ctaBtn.style.display = 'none';
        chrome.runtime.sendMessage({ action: 'OPEN_AI_SETUP' });
      });
    }

    // ── Render lock — prevents concurrent async renders ───────────
    let renderPending = false;

    // ── Badge sync ────────────────────────────────────────────────
    const BADGE_META = {
      off: { text: 'Off', cls: 'llm-badge offline' },
      cloud: { text: 'Cloud', cls: 'llm-badge online' },
      local: { text: 'Local', cls: 'llm-badge online' },
      webllm: { text: 'Browser AI', cls: 'llm-badge online' },
    };

    const syncBadge = mode => {
      if (!badgeEl) {
        return;
      }
      const m = BADGE_META[mode] || BADGE_META.off;
      badgeEl.textContent = m.text;
      badgeEl.className = m.cls;
    };

    // ── Chip selection ────────────────────────────────────────────
    const selectChip = mode => {
      chipsEl.querySelectorAll('input[type="radio"]').forEach(r => {
        r.checked = r.value === mode;
      });
    };

    // ── Contextual panel rendering ────────────────────────────────
    const renderPanel = async mode => {
      if (renderPending) {
        return;
      }
      renderPending = true;
      panelEl.innerHTML = '';

      try {
        if (mode === 'off') {
          panelEl.innerHTML =
            '<p class="ai-panel-off-msg">AI features are disabled. Select a mode above to enable AI tools.</p>';
          return;
        }
        if (mode === 'cloud') {
          await this._renderCloudPanel(panelEl, false);
          return;
        }
        if (mode === 'webllm') {
          await this._renderWebLLMPanel(panelEl, false);
          return;
        }
        if (mode === 'local') {
          await this._renderLocalPanel(panelEl, false);
          return;
        }
      } finally {
        renderPending = false;
      }
    };

    // ── Wire chip change handlers (use change event; CLAUDE.md allows it for radios) ──
    chipsEl.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', async () => {
        if (!radio.checked) {
          return;
        }
        const newMode = radio.value;

        // Persist immediately — skip the legacy flags that triggered storage onChanged re-render
        chrome.storage.local.set({
          aiMode: newMode,
          llmEnabled: newMode === 'local',
          cloudModeEnabled: newMode === 'cloud',
          webllmEnabled: newMode === 'webllm',
        });

        syncBadge(newMode);
        await renderPanel(newMode);
      });
    });

    // ── Advanced settings link ────────────────────────────────────
    if (advancedBtn) {
      this.attachInteractiveHandler(advancedBtn, 'AI Advanced Settings', () => {
        this.showAdvancedOptions();
      });
    }

    // ── Initial render ────────────────────────────────────────────
    chrome.storage.local.get(['aiMode', 'llmEnabled', 'cloudModeEnabled'], result => {
      let mode = result.aiMode || 'off';
      if (!result.aiMode) {
        // Migrate legacy flags without triggering onChanged — write once only
        if (result.cloudModeEnabled) {
          mode = 'cloud';
        } else if (result.llmEnabled) {
          mode = 'local';
        }
        chrome.storage.local.set({ aiMode: mode });
      }
      selectChip(mode);
      syncBadge(mode);
      // Use renderPending guard: if set already triggered onChanged it will be skipped
      renderPanel(mode);
    });

    // ── Storage listener — keep chips in sync if another page changes mode ──
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.aiMode) {
        const newMode = changes.aiMode.newValue || 'off';
        selectChip(newMode);
        syncBadge(newMode);
        renderPanel(newMode);
      }
    });

    console.log('[Popup] AI Assist quick switcher ready');
  }

  // ── Shared panel renderers ────────────────────────────────────────────────

  /**
   * Render the Cloud AI panel into a container element.
   * @param {HTMLElement} container
   * @param {boolean} isModal - true = show extra details (model dropdown)
   */
  async _renderCloudPanel(container, _isModal) {
    const PROVIDERS = [
      { value: 'anthropic', label: 'Anthropic (Claude)' },
      { value: 'openai', label: 'OpenAI (GPT)' },
      { value: 'google', label: 'Google (Gemini)' },
      { value: 'perplexity', label: 'Perplexity' },
    ];

    const s = await chrome.storage.local.get(['cloudProvider', 'cloudModel']);
    const currentProvider = s.cloudProvider || 'anthropic';
    const currentModel = s.cloudModel || '';

    // Provider row
    const provRow = document.createElement('div');
    provRow.className = 'ai-panel-row';
    provRow.innerHTML = `<span class="ai-panel-label">Provider</span>`;
    const provSel = document.createElement('select');
    provSel.className = 'ai-panel-select';
    provSel.setAttribute('aria-label', 'Cloud AI provider');
    PROVIDERS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.value;
      opt.textContent = p.label;
      opt.selected = p.value === currentProvider;
      provSel.appendChild(opt);
    });
    provRow.appendChild(provSel);
    container.appendChild(provRow);

    // API key row
    const keyRow = document.createElement('div');
    keyRow.className = 'ai-panel-row';
    keyRow.innerHTML = `<span class="ai-panel-label">API Key</span>`;
    const keyWrap = document.createElement('div');
    keyWrap.className = 'ai-panel-key-wrap';
    const keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.className = 'ai-panel-key-input';
    keyInput.placeholder = 'Paste API key…';
    keyInput.setAttribute('aria-label', 'API key');
    keyInput.setAttribute('autocomplete', 'off');
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ai-panel-key-toggle';
    toggleBtn.setAttribute('aria-label', 'Show or hide API key');
    toggleBtn.textContent = '👁';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'ai-panel-save-btn';
    saveBtn.textContent = 'Save';
    keyWrap.appendChild(keyInput);
    keyWrap.appendChild(toggleBtn);
    keyWrap.appendChild(saveBtn);
    keyRow.appendChild(keyWrap);
    container.appendChild(keyRow);

    // Status line
    const statusLine = document.createElement('div');
    statusLine.className = 'ai-panel-status';
    const dot = document.createElement('span');
    dot.className = 'ai-status-dot';
    const statusText = document.createElement('span');
    statusText.id = 'ai-cloud-status-text';
    statusText.textContent = 'Checking…';
    statusLine.appendChild(dot);
    statusLine.appendChild(statusText);
    container.appendChild(statusLine);

    // Model row (always visible in popup too — users need quick model switching)
    const modelRow = document.createElement('div');
    modelRow.className = 'ai-panel-row';
    modelRow.style.marginTop = '6px';
    modelRow.innerHTML = `<span class="ai-panel-label">Model</span>`;
    const modelSel = document.createElement('select');
    modelSel.className = 'ai-panel-select';
    modelSel.setAttribute('aria-label', 'Cloud AI model');
    modelRow.appendChild(modelSel);
    container.appendChild(modelRow);

    // ── Populate model dropdown ───────────────────────────────────
    const FALLBACK_MODELS = {
      anthropic: [
        { id: 'claude-haiku-4-5-20251001', name: 'Haiku (Fast)' },
        { id: 'claude-sonnet-4-6', name: 'Sonnet (Recommended)' },
        { id: 'claude-opus-4-6', name: 'Opus (Most Capable)' },
      ],
      openai: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
        { id: 'gpt-4o', name: 'GPT-4o (Recommended)' },
        { id: 'o3-mini', name: 'o3 Mini (Reasoning)' },
      ],
      google: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Recommended)' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (Fast)' },
      ],
      perplexity: [
        { id: 'sonar', name: 'Sonar (Recommended)' },
        { id: 'sonar-pro', name: 'Sonar Pro (Most Capable)' },
        { id: 'sonar-reasoning', name: 'Sonar Reasoning' },
      ],
    };

    const populateModels = async provider => {
      modelSel.innerHTML = '';
      let models = null;
      try {
        const cacheKey = `cloudModels_${provider}`;
        const cached = await chrome.storage.local.get(cacheKey);
        if (cached[cacheKey]?.models?.length > 0) {
          models = cached[cacheKey].models;
        }
      } catch {
        /* use fallback */
      }
      if (!models) {
        models = FALLBACK_MODELS[provider] || [];
      }
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name || m.id;
        opt.selected = m.id === currentModel;
        modelSel.appendChild(opt);
      });
    };

    await populateModels(currentProvider);

    // ── Load current API key ──────────────────────────────────────
    const loadKey = async provider => {
      try {
        const { getSecureAPIKey } = await import('../core/storage/secure-key-storage.js');
        const key = await getSecureAPIKey(provider);
        if (key) {
          keyInput.value = key;
          dot.className = 'ai-status-dot online';
          statusText.textContent = 'API key configured';
        } else {
          keyInput.value = '';
          dot.className = 'ai-status-dot warning';
          statusText.textContent = 'API key required';
        }
      } catch {
        dot.className = 'ai-status-dot offline';
        statusText.textContent = 'Could not load key';
      }
    };

    await loadKey(currentProvider);

    // ── Event handlers ────────────────────────────────────────────
    // Show/hide toggle
    toggleBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      toggleBtn.setAttribute('aria-pressed', String(keyInput.type === 'text'));
    });

    // Provider change
    provSel.addEventListener('change', async () => {
      const p = provSel.value;
      chrome.storage.local.set({ cloudProvider: p });
      await loadKey(p);
      await populateModels(p);
    });

    // Model change
    modelSel.addEventListener('change', () => {
      chrome.storage.local.set({ cloudModel: modelSel.value });
    });

    // Save key on button click
    this.attachInteractiveHandler(saveBtn, 'Save API Key', async () => {
      const key = keyInput.value.trim();
      if (!key) {
        dot.className = 'ai-status-dot warning';
        statusText.textContent = 'Enter a key first';
        return;
      }
      try {
        const { saveSecureAPIKey } = await import('../core/storage/secure-key-storage.js');
        await saveSecureAPIKey(provSel.value, key);
        dot.className = 'ai-status-dot online';
        statusText.textContent = 'Key saved ✓';
        // Populate models after saving key
        await populateModels(provSel.value);
      } catch (err) {
        dot.className = 'ai-status-dot offline';
        statusText.textContent = 'Save failed — try wizard';
        console.error('[Popup] Key save error:', err);
      }
    });

    // Save model selection on blur too (immediate feedback)
    keyInput.addEventListener('blur', () => {
      // Just trim whitespace; save is explicit via button
    });

    // ── Feature Models section (Anthropic only) ───────────────────
    await this._renderFeatureModelsSection(container, currentProvider);

    // Keep feature models section in sync when provider changes
    provSel.addEventListener('change', async () => {
      const existingSection = container.querySelector('.ai-feature-models-section');
      if (existingSection) {
        existingSection.remove();
      }
      await this._renderFeatureModelsSection(container, provSel.value);
    });
  }

  /**
   * Render the per-feature model selection section (Anthropic only).
   * @param {HTMLElement} container
   * @param {string} provider
   */
  async _renderFeatureModelsSection(container, provider) {
    // Only show for Anthropic
    if (provider !== 'anthropic') {
      return;
    }

    const FEATURE_LIST = [
      { key: 'summarization', label: 'Summarization' },
      { key: 'textSimplification', label: 'Text Simplification' },
      { key: 'studyPathGenerator', label: 'Study Path Generator' },
      { key: 'assignmentBreakdown', label: 'Assignment Breakdown' },
      { key: 'socraticTutor', label: 'Socratic Tutor' },
      { key: 'citationAnalyzer', label: 'Citation Analyzer' },
      { key: 'knowledgeGraph', label: 'Knowledge Graph' },
      { key: 'multiDocCompare', label: 'Multi-Doc Compare' },
      { key: 'emotionalTTS', label: 'Emotional TTS' },
    ];

    const MODEL_OPTIONS = [
      { value: 'auto', label: 'Auto (feature default)' },
      { value: 'haiku', label: 'Haiku (fastest)' },
      { value: 'sonnet', label: 'Sonnet (balanced)' },
      { value: 'opus', label: 'Opus (most capable)' },
    ];

    // Load current preferences
    const storageKeys = [
      'featureModelAutoSelect',
      ...FEATURE_LIST.map(f => `featureModel_${f.key}`),
    ];
    const stored = await chrome.storage.local.get(storageKeys);
    const autoSelect = stored.featureModelAutoSelect !== false; // default true

    const section = document.createElement('div');
    section.className = 'ai-feature-models-section';
    section.style.cssText =
      'margin-top:12px;border-top:1px solid var(--border-color,#e0e0e0);padding-top:10px;';

    // Section header + toggle row
    const headerRow = document.createElement('div');
    headerRow.className = 'ai-panel-row';
    headerRow.style.marginBottom = '6px';
    headerRow.innerHTML = `<span class="ai-panel-label" style="font-weight:600">Feature Models</span>`;

    const toggleLabel = document.createElement('label');
    toggleLabel.style.cssText =
      'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary,#666);cursor:pointer;';
    const toggleCheck = document.createElement('input');
    toggleCheck.type = 'checkbox';
    toggleCheck.checked = autoSelect;
    toggleCheck.setAttribute('aria-label', 'Auto-select best model for each feature');
    toggleLabel.appendChild(toggleCheck);
    toggleLabel.appendChild(document.createTextNode('Auto-select'));
    headerRow.appendChild(toggleLabel);
    section.appendChild(headerRow);

    // Per-feature dropdown rows (shown when auto-select is OFF)
    const featureRows = document.createElement('div');
    featureRows.className = 'ai-feature-model-rows';
    featureRows.style.display = autoSelect ? 'none' : 'block';

    FEATURE_LIST.forEach(feature => {
      const currentVal = stored[`featureModel_${feature.key}`] || 'auto';
      const row = document.createElement('div');
      row.className = 'ai-panel-row';
      row.style.cssText = 'padding:3px 0;';
      const labelEl = document.createElement('span');
      labelEl.className = 'ai-panel-label';
      labelEl.style.cssText = 'font-size:12px;color:var(--text-secondary,#666);';
      labelEl.textContent = feature.label;
      const sel = document.createElement('select');
      sel.className = 'ai-panel-select';
      sel.style.cssText = 'font-size:12px;padding:2px 4px;';
      sel.setAttribute('aria-label', `Model for ${feature.label}`);
      MODEL_OPTIONS.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        o.selected = opt.value === currentVal;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        chrome.storage.local.set({ [`featureModel_${feature.key}`]: sel.value });
      });
      row.appendChild(labelEl);
      row.appendChild(sel);
      featureRows.appendChild(row);
    });

    section.appendChild(featureRows);
    container.appendChild(section);

    // Toggle handler
    toggleCheck.addEventListener('change', () => {
      const isAuto = toggleCheck.checked;
      chrome.storage.local.set({ featureModelAutoSelect: isAuto });
      featureRows.style.display = isAuto ? 'none' : 'block';
    });
  }

  /**
   * Render the Browser AI (WebLLM) panel into a container element.
   * @param {HTMLElement} container
   * @param {boolean} isModal
   */
  async _renderWebLLMPanel(container, isModal) {
    if (isModal) {
      await this._renderWebLLMBrowser(container);
    } else {
      await this._renderWebLLMQuick(container);
    }
  }

  // ── Compact dropdown panel (popup quick-switch) ────────────────────────────

  async _renderWebLLMQuick(container) {
    const MODELS = [
      { key: 'llama-3.2-1b', label: 'Llama 3.2 1B (650 MB)' },
      { key: 'gemma-2b', label: 'Gemma 2B (1.6 GB)' },
      { key: 'llama-3.2-3b', label: 'Llama 3.2 3B (1.9 GB)' },
      { key: 'phi-3.5-mini', label: 'Phi-3.5 Mini (2.3 GB)' },
      { key: 'qwen2.5-3b', label: 'Qwen 2.5 3B (1.9 GB)' },
      { key: 'mistral-7b', label: 'Mistral 7B (4.4 GB)' },
      { key: 'llama-3.1-8b', label: 'Llama 3.1 8B (4.9 GB)' },
      { key: 'gemma-7b', label: 'Gemma 7B (4.3 GB)' },
    ];

    const s = await chrome.storage.local.get(['webllmModel', 'webllmCachedModels']);
    const currentModel = s.webllmModel || 'llama-3.2-1b';
    const cachedModels = s.webllmCachedModels || [];

    const modelRow = document.createElement('div');
    modelRow.className = 'ai-panel-row';
    modelRow.innerHTML = `<span class="ai-panel-label">Model</span>`;
    const modelSel = document.createElement('select');
    modelSel.className = 'ai-panel-select';
    modelSel.setAttribute('aria-label', 'Browser AI model');
    MODELS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.key;
      opt.textContent = cachedModels.includes(m.key) ? `${m.label} ✓` : m.label;
      opt.selected = m.key === currentModel;
      modelSel.appendChild(opt);
    });
    modelRow.appendChild(modelSel);
    container.appendChild(modelRow);

    const actionRow = document.createElement('div');
    actionRow.className = 'ai-panel-row';
    actionRow.style.marginTop = '6px';
    const dot = document.createElement('span');
    dot.className = 'ai-status-dot';
    const statusText = document.createElement('span');
    statusText.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary)';
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'ai-panel-action-btn primary';
    actionRow.append(dot, statusText, actionBtn);
    container.appendChild(actionRow);

    const progressBar = document.createElement('div');
    progressBar.className = 'ai-download-bar';
    progressBar.style.display = 'none';
    const progressFill = document.createElement('div');
    progressFill.className = 'ai-download-bar-fill';
    progressBar.appendChild(progressFill);
    container.appendChild(progressBar);

    const refresh = async key => {
      const cached = cachedModels.includes(key);
      try {
        const r = await chrome.runtime.sendMessage({ action: 'WEBLLM_STATUS' });
        const loaded =
          r?.loaded &&
          r?.modelId &&
          r.modelId.toLowerCase().includes(key.split('-').slice(0, 2).join('-').toLowerCase());
        if (loaded) {
          dot.className = 'ai-status-dot online';
          statusText.textContent = 'Ready';
          actionBtn.textContent = 'Change model';
          actionBtn.className = 'ai-panel-action-btn';
        } else if (cached) {
          dot.className = 'ai-status-dot warning';
          statusText.textContent = 'Downloaded — not loaded';
          actionBtn.textContent = 'Load model';
          actionBtn.className = 'ai-panel-action-btn primary';
        } else {
          dot.className = 'ai-status-dot';
          statusText.textContent = 'Not downloaded';
          actionBtn.textContent = 'Download';
          actionBtn.className = 'ai-panel-action-btn primary';
        }
      } catch {
        dot.className = 'ai-status-dot';
        statusText.textContent = cached ? 'Downloaded' : 'Not downloaded';
        actionBtn.textContent = cached ? 'Load model' : 'Download';
        actionBtn.className = 'ai-panel-action-btn primary';
      }
    };

    await refresh(currentModel);

    modelSel.addEventListener('change', async () => {
      chrome.storage.local.set({ webllmModel: modelSel.value });
      await refresh(modelSel.value);
    });

    this.attachInteractiveHandler(actionBtn, 'Download or Load WebLLM Model', async () => {
      progressBar.style.display = 'block';
      progressFill.style.width = '10%';
      actionBtn.disabled = true;
      statusText.textContent = 'Initialising…';
      dot.className = 'ai-status-dot warning';
      try {
        await chrome.runtime.sendMessage({ action: 'WEBLLM_INITIALIZE', modelKey: modelSel.value });
        progressFill.style.width = '100%';
        setTimeout(() => {
          progressBar.style.display = 'none';
        }, 800);
        dot.className = 'ai-status-dot online';
        statusText.textContent = 'Ready';
        actionBtn.textContent = 'Change model';
        actionBtn.className = 'ai-panel-action-btn';
        actionBtn.disabled = false;
      } catch (err) {
        progressBar.style.display = 'none';
        dot.className = 'ai-status-dot offline';
        statusText.textContent = 'Failed — try wizard';
        actionBtn.disabled = false;
        console.error('[Popup] WebLLM init error:', err);
      }
    });
  }

  // ── Full model browser (modal AI tab) ─────────────────────────────────────

  async _renderWebLLMBrowser(container) {
    // Model data — sourced from REGISTRY but inlined to avoid async import in popup
    const MODELS = [
      {
        key: 'llama-3.2-1b',
        name: 'Llama 3.2 1B',
        size: '650 MB',
        speed: '15–25 tok/s',
        quant: 'q4f16_1',
        category: 'lightweight',
      },
      {
        key: 'gemma-2b',
        name: 'Gemma 2B',
        size: '1.6 GB',
        speed: '15–20 tok/s',
        quant: 'q4f16_1',
        category: 'lightweight',
      },
      {
        key: 'llama-3.2-3b',
        name: 'Llama 3.2 3B',
        size: '1.9 GB',
        speed: '12–18 tok/s',
        quant: 'q4f16_1',
        category: 'balanced',
      },
      {
        key: 'phi-3.5-mini',
        name: 'Phi-3.5 Mini',
        size: '2.3 GB',
        speed: '10–18 tok/s',
        quant: 'q4f16_1',
        category: 'balanced',
      },
      {
        key: 'qwen2.5-3b',
        name: 'Qwen 2.5 3B',
        size: '1.9 GB',
        speed: '12–20 tok/s',
        quant: 'q4f16_1',
        category: 'balanced',
      },
      {
        key: 'mistral-7b',
        name: 'Mistral 7B',
        size: '4.4 GB',
        speed: '6–12 tok/s',
        quant: 'q4f16_1',
        category: 'high-quality',
      },
      {
        key: 'llama-3.1-8b',
        name: 'Llama 3.1 8B',
        size: '4.9 GB',
        speed: '5–10 tok/s',
        quant: 'q4f16_1',
        category: 'high-quality',
      },
      {
        key: 'gemma-7b',
        name: 'Gemma 7B',
        size: '4.3 GB',
        speed: '6–11 tok/s',
        quant: 'q4f16_1',
        category: 'high-quality',
      },
    ];

    const s = await chrome.storage.local.get(['webllmModel', 'webllmCachedModels']);
    let activeKey = s.webllmModel || 'llama-3.2-1b';
    const cachedModels = new Set(s.webllmCachedModels || []);

    // Get loaded model from service worker
    let loadedKey = null;
    try {
      const r = await chrome.runtime.sendMessage({ action: 'WEBLLM_STATUS' });
      if (r?.loaded && r?.modelId) {
        const found = MODELS.find(m =>
          r.modelId.toLowerCase().includes(m.key.split('-').slice(0, 2).join('-').toLowerCase())
        );
        if (found) {
          loadedKey = found.key;
        }
      }
    } catch {
      /* service worker not ready */
    }

    // ── Filter bar ────────────────────────────────────────────────
    const filterRow = document.createElement('div');
    filterRow.className = 'webllm-filter-row';

    const filterSel = document.createElement('select');
    filterSel.className = 'ai-panel-select webllm-filter-select';
    filterSel.setAttribute('aria-label', 'Filter models by category');
    [
      { value: 'all', label: 'All models' },
      { value: 'lightweight', label: 'Lightweight  (< 2 GB)' },
      { value: 'balanced', label: 'Balanced  (2–3 GB)' },
      { value: 'high-quality', label: 'High-quality  (4+ GB)' },
    ].forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      filterSel.appendChild(opt);
    });
    filterRow.appendChild(filterSel);
    container.appendChild(filterRow);

    // ── Card list ─────────────────────────────────────────────────
    const cardList = document.createElement('div');
    cardList.className = 'webllm-card-list';
    container.appendChild(cardList);

    // Shared progress bar (one for the whole browser)
    const progressBar = document.createElement('div');
    progressBar.className = 'ai-download-bar webllm-browser-progress';
    progressBar.style.display = 'none';
    const progressFill = document.createElement('div');
    progressFill.className = 'ai-download-bar-fill';
    progressBar.appendChild(progressFill);
    container.appendChild(progressBar);

    const renderCards = category => {
      cardList.innerHTML = '';
      const visible = category === 'all' ? MODELS : MODELS.filter(m => m.category === category);

      visible.forEach(m => {
        const isLoaded = m.key === loadedKey;
        const isCached = cachedModels.has(m.key);
        const isActive = m.key === activeKey;

        const card = document.createElement('div');
        card.className =
          'webllm-model-card' + (isLoaded ? ' is-loaded' : isCached ? ' is-cached' : '');
        card.setAttribute('data-key', m.key);

        // Status dot
        const dot = document.createElement('span');
        dot.className = 'ai-status-dot ' + (isLoaded ? 'online' : isCached ? 'warning' : '');

        // Info block
        const info = document.createElement('div');
        info.className = 'webllm-card-info';

        const nameLine = document.createElement('div');
        nameLine.className = 'webllm-card-name';
        nameLine.textContent = m.name;
        if (isActive) {
          const badge = document.createElement('span');
          badge.className = 'webllm-active-badge';
          badge.textContent = 'Active';
          nameLine.appendChild(badge);
        }

        const metaLine = document.createElement('div');
        metaLine.className = 'webllm-card-meta';
        metaLine.textContent = `${m.size} · ${m.quant} · ${m.speed}`;

        info.append(nameLine, metaLine);

        // Action button
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-panel-action-btn' + (isLoaded ? '' : ' primary');
        if (isLoaded) {
          btn.textContent = 'Unload';
        } else if (isCached) {
          btn.textContent = 'Load';
        } else {
          btn.textContent = '↓ Get';
        }

        card.append(dot, info, btn);
        cardList.appendChild(card);

        this.attachInteractiveHandler(btn, `${btn.textContent} ${m.name}`, async () => {
          if (isLoaded) {
            // Unload = switch active key away, don't unload from VRAM (WebLLM has no unload API)
            // Just mark as no longer the selection
            activeKey = '';
            chrome.storage.local.set({ webllmModel: '' });
            renderCards(filterSel.value);
            return;
          }
          // Download or load
          progressBar.style.display = 'block';
          progressFill.style.width = '10%';
          btn.disabled = true;
          try {
            await chrome.runtime.sendMessage({ action: 'WEBLLM_INITIALIZE', modelKey: m.key });
            progressFill.style.width = '100%';
            setTimeout(() => {
              progressBar.style.display = 'none';
            }, 800);
            loadedKey = m.key;
            activeKey = m.key;
            cachedModels.add(m.key);
            chrome.storage.local.set({ webllmModel: m.key });
            renderCards(filterSel.value);
          } catch (err) {
            progressBar.style.display = 'none';
            btn.disabled = false;
            btn.textContent = 'Failed';
            console.error('[Popup] WebLLM browser error:', err);
          }
        });
      });
    };

    renderCards('all');

    filterSel.addEventListener('change', () => renderCards(filterSel.value));
  }

  /**
   * Render the Local AI (Ollama) panel into a container element.
   * @param {HTMLElement} container
   * @param {boolean} isModal
   */
  async _renderLocalPanel(container, _isModal) {
    // Status row
    const card = document.createElement('div');
    card.className = 'ai-panel-row';

    const dot = document.createElement('span');
    dot.className = 'ai-status-dot';
    const statusText = document.createElement('span');
    statusText.style.flex = '1';
    statusText.style.fontSize = '12px';
    statusText.textContent = 'Checking Ollama…';
    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'ai-panel-action-btn';
    checkBtn.textContent = 'Check again';

    card.appendChild(dot);
    card.appendChild(statusText);
    card.appendChild(checkBtn);
    container.appendChild(card);

    // Model selector row
    const modelRow = document.createElement('div');
    modelRow.className = 'ai-panel-row';
    const modelLabel = document.createElement('span');
    modelLabel.className = 'ai-panel-label';
    modelLabel.textContent = 'Model';
    const modelSel = document.createElement('select');
    modelSel.className = 'ai-panel-select';
    modelSel.setAttribute('aria-label', 'Ollama model');
    modelSel.style.flex = '1';
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(modelSel);
    container.appendChild(modelRow);

    const { ollamaModel: savedModel = '' } = await chrome.storage.local.get('ollamaModel');

    const populateModels = detectedModels => {
      modelSel.innerHTML = '';
      const models =
        detectedModels && detectedModels.length > 0
          ? detectedModels
          : ['llama3.2', 'phi3:mini', 'mistral', 'llava'];
      models.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        opt.selected = name === (savedModel || models[0]);
        modelSel.appendChild(opt);
      });
      // Persist initial selection if nothing saved yet
      if (!savedModel && models.length > 0) {
        chrome.storage.local.set({ ollamaModel: models[0] });
      }
    };

    modelSel.addEventListener('change', () => {
      chrome.storage.local.set({ ollamaModel: modelSel.value });
    });

    const checkOllama = async () => {
      statusText.textContent = 'Checking…';
      dot.className = 'ai-status-dot';
      try {
        const r = await chrome.runtime.sendMessage({ action: 'LOCAL_LLM_CHECK' });
        if (r?.success && r?.available) {
          dot.className = 'ai-status-dot online';
          const models = r.models || [];
          statusText.textContent = `Online — ${models.length} model${models.length !== 1 ? 's' : ''} available`;
          populateModels(models);
          // Update header badge
          const badge = document.getElementById('llm-status-badge');
          if (badge) {
            badge.textContent = 'Online';
            badge.className = 'llm-badge online';
          }
        } else {
          dot.className = 'ai-status-dot offline';
          statusText.textContent = 'Offline — start Ollama to use Local AI';
          populateModels([]);
          const badge = document.getElementById('llm-status-badge');
          if (badge) {
            badge.textContent = 'Offline';
            badge.className = 'llm-badge offline';
          }
        }
      } catch {
        dot.className = 'ai-status-dot offline';
        statusText.textContent = 'Could not reach Ollama';
        populateModels([]);
      }
    };

    await checkOllama();

    this.attachInteractiveHandler(checkBtn, 'Check Ollama Status', checkOllama);
  }

  /**
   * Render the Gemini Nano panel into a container element.
   * @param {HTMLElement} container
   */
  async _renderGeminiPanel(container) {
    const row = document.createElement('div');
    row.className = 'ai-panel-row';
    const dot = document.createElement('span');
    dot.className = 'ai-status-dot';
    const statusText = document.createElement('span');
    statusText.style.fontSize = '12px';
    statusText.textContent = 'Checking device support…';
    row.appendChild(dot);
    row.appendChild(statusText);
    container.appendChild(row);

    try {
      const r = await chrome.runtime.sendMessage({ action: 'GEMINI_LLM_CHECK' });
      if (r?.available) {
        dot.className = 'ai-status-dot online';
        statusText.textContent = 'Ready — Gemini Nano on this device';
      } else {
        dot.className = 'ai-status-dot offline';
        statusText.textContent = 'Not available on this device';
        const note = document.createElement('p');
        note.style.cssText = 'font-size:11px; color:var(--text-secondary); margin-top:6px;';
        note.textContent = 'Gemini Nano requires Chrome with AI features enabled.';
        container.appendChild(note);
      }
    } catch {
      dot.className = 'ai-status-dot offline';
      statusText.textContent = 'Check failed';
    }
  }

  /**
   * Update AI mode (show/hide containers, update badge, notify background)
   */
  updateAIMode(mode) {
    const localAIContainer = document.getElementById('local-ai-container');
    const cloudAIContainer = document.getElementById('cloud-ai-container');
    const geminiAIContainer = document.getElementById('gemini-ai-container');
    const webllmAIContainer = document.getElementById('webllm-ai-container');
    const llmStatusBadge = document.getElementById('llm-status-badge');
    const cloudUsageStats = document.getElementById('cloud-usage-stats');

    // Hide all containers first
    localAIContainer?.classList.add('hidden');
    cloudAIContainer?.classList.add('hidden');
    geminiAIContainer?.classList.add('hidden');
    webllmAIContainer?.classList.add('hidden');

    // Show appropriate container and update badge
    switch (mode) {
      case 'local':
        localAIContainer?.classList.remove('hidden');
        llmStatusBadge.textContent = 'Checking...';
        llmStatusBadge.className = 'llm-badge';
        this.checkLLMStatus();

        // Update legacy settings for compatibility
        this.settings.localLLM.enabled = true;
        this.saveSettings();

        // Notify content scripts
        chrome.runtime
          .sendMessage({
            action: 'LOCAL_LLM_MODE_CHANGED',
            enabled: true,
          })
          .catch(() => {});

        chrome.storage.local.set({
          llmEnabled: true,
          cloudModeEnabled: false,
          geminiEnabled: false,
        });

        this.updateStatus('Local AI enabled', 'success');
        break;

      case 'cloud':
        cloudAIContainer?.classList.remove('hidden');
        llmStatusBadge.textContent = 'Cloud';
        llmStatusBadge.className = 'llm-badge online';

        // Update legacy settings for compatibility
        this.settings.localLLM.enabled = false;
        this.saveSettings();

        // Notify content scripts
        chrome.runtime
          .sendMessage({
            action: 'CLOUD_MODE_CHANGED',
            enabled: true,
          })
          .catch(() => {});

        chrome.storage.local.set({
          llmEnabled: false,
          cloudModeEnabled: true,
          geminiEnabled: false,
        });

        this.updateStatus('Cloud AI enabled', 'success');
        break;

      case 'gemini':
        geminiAIContainer?.classList.remove('hidden');
        llmStatusBadge.textContent = 'Gemini';
        llmStatusBadge.className = 'llm-badge';
        this.checkGeminiStatus();

        // Update legacy settings for compatibility
        this.settings.localLLM.enabled = false;
        this.saveSettings();

        // Notify content scripts
        chrome.runtime
          .sendMessage({
            action: 'GEMINI_MODE_CHANGED',
            enabled: true,
          })
          .catch(() => {});

        chrome.storage.local.set({
          llmEnabled: false,
          cloudModeEnabled: false,
          geminiEnabled: true,
        });

        this.updateStatus('Gemini Nano enabled', 'success');
        break;

      case 'webllm':
        webllmAIContainer?.classList.remove('hidden');
        llmStatusBadge.textContent = 'Browser AI';
        llmStatusBadge.className = 'llm-badge';
        this.checkWebLLMStatus();
        this.loadWebLLMModels();

        // Update legacy settings for compatibility
        this.settings.localLLM.enabled = false;
        this.saveSettings();

        // Notify content scripts
        chrome.runtime
          .sendMessage({
            action: 'WEBLLM_MODE_CHANGED',
            enabled: true,
          })
          .catch(() => {});

        chrome.storage.local.set({
          llmEnabled: false,
          cloudModeEnabled: false,
          geminiEnabled: false,
          webllmEnabled: true,
        });

        this.updateStatus('Browser AI enabled', 'success');
        break;

      case 'off':
      default:
        llmStatusBadge.textContent = 'Off';
        llmStatusBadge.className = 'llm-badge offline';

        // Hide cloud usage stats
        if (cloudUsageStats) {
          cloudUsageStats.style.display = 'none';
        }

        // Update legacy settings for compatibility
        this.settings.localLLM.enabled = false;
        this.saveSettings();

        // Notify content scripts
        chrome.runtime
          .sendMessage({
            action: 'LOCAL_LLM_MODE_CHANGED',
            enabled: false,
          })
          .catch(() => {});

        chrome.runtime
          .sendMessage({
            action: 'CLOUD_MODE_CHANGED',
            enabled: false,
          })
          .catch(() => {});

        chrome.storage.local.set({
          llmEnabled: false,
          cloudModeEnabled: false,
          geminiEnabled: false,
        });

        this.updateStatus('AI Assist disabled', 'success');
        break;
    }
  }

  async checkLLMStatus() {
    const llmStatusBadge = document.getElementById('llm-status-badge');
    const llmConnectionStatus = document.getElementById('llm-connection-status');
    const llmModelsRow = document.getElementById('llm-models-row');
    const llmInstalledModels = document.getElementById('llm-installed-models');

    // Legacy UI elements - only update if they exist
    if (llmConnectionStatus) {
      llmConnectionStatus.textContent = 'Checking...';
      llmConnectionStatus.className = 'llm-status-value';
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'LOCAL_LLM_CHECK',
      });

      if (response.success && response.available) {
        // Update badge (always exists in new UI)
        if (llmStatusBadge) {
          llmStatusBadge.textContent = 'Online';
          llmStatusBadge.className = 'llm-badge online';
        }

        // Legacy UI elements
        if (llmConnectionStatus) {
          llmConnectionStatus.textContent = 'Connected to Ollama';
          llmConnectionStatus.className = 'llm-status-value connected';
        }

        // Show models (legacy UI)
        this.installedModels = response.models || [];
        if (this.installedModels.length > 0) {
          if (llmModelsRow) {
            llmModelsRow.style.display = 'flex';
          }
          if (llmInstalledModels) {
            llmInstalledModels.textContent = this.installedModels.join(', ');
          }
          this.updateModelList();
        } else {
          if (llmModelsRow) {
            llmModelsRow.style.display = 'none';
          }
        }
      } else {
        // Ollama not available
        if (llmStatusBadge) {
          llmStatusBadge.textContent = 'Offline';
          llmStatusBadge.className = 'llm-badge offline';
        }
        if (llmConnectionStatus) {
          llmConnectionStatus.textContent = 'Not connected - Start Ollama';
          llmConnectionStatus.className = 'llm-status-value disconnected';
        }
        if (llmModelsRow) {
          llmModelsRow.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('[Popup] LLM check failed:', error);
      // Update badge to show error
      if (llmStatusBadge) {
        llmStatusBadge.textContent = 'Error';
        llmStatusBadge.className = 'llm-badge error';
      }
      if (llmConnectionStatus) {
        llmConnectionStatus.textContent = 'Connection error';
        llmConnectionStatus.className = 'llm-status-value disconnected';
      }
      if (llmModelsRow) {
        llmModelsRow.style.display = 'none';
      }
    }
  }

  /**
   * Check Gemini Nano availability status
   */
  async checkGeminiStatus() {
    const badge = document.getElementById('gemini-status-badge');
    const instructions = document.getElementById('gemini-setup-instructions');

    if (!badge) {
      console.warn('[Popup] Gemini status badge not found');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: 'GEMINI_LLM_CHECK' });

      if (response?.available) {
        badge.textContent = 'Ready';
        badge.className = 'llm-badge online';
        instructions?.classList.add('hidden');
      } else {
        badge.textContent = 'Not Available';
        badge.className = 'llm-badge offline';
        instructions?.classList.remove('hidden');
      }
    } catch (error) {
      console.error('[Popup] Gemini check failed:', error);
      badge.textContent = 'Error';
      badge.className = 'llm-badge error';
    }
  }

  /**
   * Check WebLLM/WebGPU availability and update UI
   */
  async checkWebLLMStatus() {
    const statusCard = document.getElementById('webllm-status');
    const statusText = statusCard?.querySelector('.status-text');
    const hardwareInfo = document.getElementById('webllm-hardware-info');
    const gpuName = document.getElementById('webllm-gpu-name');
    const engineStatus = document.getElementById('webllm-engine-status');
    const fallbackMessage = document.getElementById('webllm-fallback');
    const fallbackText = document.getElementById('webllm-fallback-text');
    const modelSelection = document.getElementById('webllm-model-selection');

    if (!statusCard) {
      return;
    }

    // Show checking state
    statusCard.className = 'webllm-status-card status-loading';
    if (statusText) {
      statusText.textContent = 'Checking WebGPU...';
    }

    try {
      // Check WebLLM availability via service worker
      const response = await chrome.runtime.sendMessage({
        action: 'WEBLLM_CHECK',
      });

      if (response.success && response.available) {
        // WebGPU is available
        statusCard.className = 'webllm-status-card status-ready';
        if (statusText) {
          statusText.textContent = 'WebGPU Available';
        }

        // Show hardware info
        if (hardwareInfo) {
          hardwareInfo.style.display = 'block';
          if (gpuName && response.gpu) {
            gpuName.textContent = response.gpu;
          }
        }

        // Hide fallback, show model list
        if (fallbackMessage) {
          fallbackMessage.style.display = 'none';
        }
        if (modelSelection) {
          modelSelection.style.display = 'block';
        }

        // Check if engine is initialized
        const statusResponse = await chrome.runtime.sendMessage({
          action: 'WEBLLM_STATUS',
        });

        if (statusResponse.success && statusResponse.status) {
          const { ready, loading, model } = statusResponse.status;

          if (engineStatus) {
            if (ready) {
              engineStatus.textContent = `Ready (${model})`;
            } else if (loading) {
              engineStatus.textContent = 'Loading model...';
            } else {
              engineStatus.textContent = 'Not initialized';
            }
          }
        }
      } else {
        // WebGPU not available
        statusCard.className = 'webllm-status-card status-error';
        if (statusText) {
          statusText.textContent = 'WebGPU Not Available';
        }

        // Hide hardware info and model list
        if (hardwareInfo) {
          hardwareInfo.style.display = 'none';
        }
        if (modelSelection) {
          modelSelection.style.display = 'none';
        }

        // Show fallback message
        if (fallbackMessage) {
          fallbackMessage.style.display = 'block';
          if (fallbackText && response.error) {
            fallbackText.textContent = response.error;
          }
        }
      }
    } catch (error) {
      console.error('[Popup] WebLLM status check failed:', error);
      statusCard.className = 'webllm-status-card status-error';
      if (statusText) {
        statusText.textContent = 'Status Check Failed';
      }
    }
  }

  /**
   * Load and render available WebLLM models
   */
  async loadWebLLMModels() {
    const modelListContainer = document.getElementById('webllm-model-list');
    if (!modelListContainer) {
      return;
    }

    try {
      // Get available models from service worker
      const response = await chrome.runtime.sendMessage({
        action: 'WEBLLM_GET_MODELS',
      });

      if (!response.success || !response.models) {
        throw new Error('Failed to fetch models');
      }

      // Get cached models
      const cacheResponse = await chrome.runtime.sendMessage({
        action: 'WEBLLM_GET_CACHED',
      });
      const cachedModelKeys = new Set(cacheResponse.success ? cacheResponse.cachedModels : []);

      // Get currently selected model from storage
      const { webllmModel } = await chrome.storage.local.get(['webllmModel']);
      const selectedModel = webllmModel || 'llama-3.2-1b';

      // Group models by category
      const categories = {
        lightweight: [],
        balanced: [],
        'high-quality': [],
      };

      response.models.forEach(model => {
        const category = model.category || 'balanced';
        if (categories[category]) {
          categories[category].push(model);
        }
      });

      // Render model cards grouped by category
      modelListContainer.innerHTML = '';

      Object.entries(categories).forEach(([category, models]) => {
        if (models.length === 0) {
          return;
        }

        // Category header
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'webllm-category-header';
        categoryHeader.textContent =
          category === 'lightweight'
            ? 'Lightweight (< 1GB)'
            : category === 'balanced'
              ? 'Balanced (1-3GB)'
              : 'High-Quality (4-6GB)';
        modelListContainer.appendChild(categoryHeader);

        models.forEach(model => {
          const card = document.createElement('div');
          card.className = 'webllm-model-card';
          card.dataset.modelKey = model.key;

          if (model.key === selectedModel) {
            card.classList.add('selected');
          }

          const isCached = cachedModelKeys.has(model.key);
          const cacheBadge = isCached ? '<span class="model-cache-badge">✓ Downloaded</span>' : '';

          card.innerHTML = `
            <div class="model-card-header">
              <span class="model-card-name">${model.name}</span>
              <span class="model-card-size">${model.size}</span>
            </div>
            <div class="model-card-description">${model.description}</div>
            <div class="model-card-footer">
              <div class="model-card-tags">
                ${model.bestFor
                  .slice(0, 3)
                  .map(tag => `<span class="model-tag">${tag}</span>`)
                  .join('')}
              </div>
              ${cacheBadge}
            </div>
          `;

          // Click to select and initialize
          this.attachInteractiveHandler(card, `WebLLM Model: ${model.name}`, () => {
            this.selectWebLLMModel(model.key);
          });

          modelListContainer.appendChild(card);
        });
      });
    } catch (error) {
      console.error('[Popup] Failed to load WebLLM models:', error);
      modelListContainer.innerHTML = `
        <div class="error-message" style="padding: 16px; text-align: center; color: var(--error-color);">
          Failed to load models. Please try again.
        </div>
      `;
    }
  }

  /**
   * Select and initialize a WebLLM model
   * @param {string} modelKey - Model key to initialize
   */
  async selectWebLLMModel(modelKey) {
    console.log('[Popup] Selecting WebLLM model:', modelKey);

    // Update selection UI
    document.querySelectorAll('.webllm-model-card').forEach(card => {
      if (card.dataset.modelKey === modelKey) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    // Save to storage
    await chrome.storage.local.set({ webllmModel: modelKey });

    // Show download progress UI
    const progressContainer = document.getElementById('webllm-download-progress');
    const downloadModelName = document.getElementById('download-model-name');
    const downloadPercent = document.getElementById('download-percent');
    const downloadBarFill = document.getElementById('download-bar-fill');
    const downloadStatusText = document.getElementById('download-status-text');

    if (progressContainer) {
      progressContainer.style.display = 'block';
    }
    if (downloadModelName) {
      const modelCard = document.querySelector(`.webllm-model-card[data-model-key="${modelKey}"]`);
      const modelName = modelCard?.querySelector('.model-card-name')?.textContent || modelKey;
      downloadModelName.textContent = modelName;
    }

    // Set up progress listener
    const progressListener = message => {
      if (message.action === 'WEBLLM_PROGRESS' && message.modelKey === modelKey) {
        const { progress } = message;

        if (downloadPercent) {
          downloadPercent.textContent = `${progress.percent}%`;
        }
        if (downloadBarFill) {
          downloadBarFill.style.width = `${progress.percent}%`;
        }
        if (downloadStatusText) {
          downloadStatusText.textContent = progress.status;
        }
      }
    };

    chrome.runtime.onMessage.addListener(progressListener);

    try {
      // Initialize model via service worker
      const response = await chrome.runtime.sendMessage({
        action: 'WEBLLM_INITIALIZE',
        modelKey,
      });

      // Remove progress listener
      chrome.runtime.onMessage.removeListener(progressListener);

      if (response.success) {
        console.log('[Popup] Model initialized:', modelKey);

        // Hide progress, update status
        if (progressContainer) {
          progressContainer.style.display = 'none';
        }

        // Update engine status
        await this.checkWebLLMStatus();

        // Show success
        this.updateStatus(`${modelKey} ready to use!`, 'success');
      } else {
        throw new Error(response.error || 'Initialization failed');
      }
    } catch (error) {
      console.error('[Popup] Model initialization failed:', error);

      // Remove progress listener
      chrome.runtime.onMessage.removeListener(progressListener);

      // Hide progress
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }

      // Show error
      this.updateStatus(`Failed to load model: ${error.message}`, 'error');
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

  /**
   * Set up Dark Mode controls
   * REMOVED - Web page dark mode feature removed
   * Extension UI dark mode button (in header) remains functional
   */
  setupDarkMode() {
    // No-op: Dark mode feature removed
    console.log('[Popup] Dark mode feature removed - skipping setup');
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] DOMContentLoaded fired');
  try {
    const popup = new PopupController();
    console.log('[Popup] PopupController created');
    await popup.initialize();
    console.log('[Popup] Initialize complete');
    await popup.setupUserProfiles();
    console.log('[Popup] Setup complete - ready');
  } catch (error) {
    console.error('[Popup] Initialization error:', error);
    // Show user-friendly error in status bar
    const statusIndicator = document.getElementById('status-indicator');
    if (statusIndicator) {
      statusIndicator.textContent = 'Initialization Error - See Console (F12)';
      statusIndicator.className = 'status-indicator error';
    }
  }
});
