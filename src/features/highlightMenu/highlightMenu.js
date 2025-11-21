/**
 * Highlight Menu Feature
 *
 * Floating toolbar that appears when text is selected, providing quick actions
 *
 * Features:
 * - Text selection detection (mouseup event)
 * - Floating toolbar positioned near selection
 * - 6 action buttons: TTS, Dictionary, Translate, Search, Annotate, Copy
 * - Keyboard navigation (Tab/Arrow keys)
 * - Auto-hide after timeout
 * - Settings integration
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern (DEC-202510-010)
 * - All functions prefixed with 'highlightMenu_' to avoid naming conflicts
 * - Integrates with existing TTS, Dictionary (Feature 4), Translation (Feature 6)
 *
 * @module features/highlightMenu
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let highlightMenu_toolbar = null;
let highlightMenu_selectedText = '';
let highlightMenu_selectionRange = null;
let highlightMenu_autoHideTimeout = null;
let highlightMenu_currentFocusIndex = 0;
const highlightMenu_settings = {
  enabled: true,
  showTTS: true,
  showDictionary: true,
  showTranslate: true,
  showSearch: true,
  showAnnotate: true,
  showCopy: true,
  autoHideDelay: 5000, // milliseconds
};

// ============================================================================
// TEXT SELECTION DETECTION
// ============================================================================

/**
 * Handles text selection (mouseup event)
 *
 * @param {MouseEvent} _event - Mouse event (unused)
 */
function highlightMenu_handleSelection(_event) {
  if (!highlightMenu_settings.enabled) {
    return;
  }

  // Clear existing timeout
  if (highlightMenu_autoHideTimeout) {
    clearTimeout(highlightMenu_autoHideTimeout);
    highlightMenu_autoHideTimeout = null;
  }

  // Get selected text
  const selection = window.getSelection();
  const text = selection.toString().trim();

  // Hide toolbar if no text selected
  if (!text || text.length === 0) {
    highlightMenu_hide();
    return;
  }

  // Store selection
  highlightMenu_selectedText = text;
  highlightMenu_selectionRange = selection.getRangeAt(0);

  // Get selection position
  const rect = highlightMenu_selectionRange.getBoundingClientRect();

  // Show toolbar
  highlightMenu_show(rect);

  // Set auto-hide timeout
  if (highlightMenu_settings.autoHideDelay > 0) {
    highlightMenu_autoHideTimeout = setTimeout(() => {
      highlightMenu_hide();
    }, highlightMenu_settings.autoHideDelay);
  }
}

// ============================================================================
// TOOLBAR UI
// ============================================================================

/**
 * Creates the floating toolbar element
 *
 * @returns {HTMLElement} Toolbar element
 */
function highlightMenu_createToolbar() {
  const toolbar = document.createElement('div');
  toolbar.id = 'assist-highlight-menu';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text selection actions');
  toolbar.style.cssText = `
    position: fixed;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 8px;
    display: flex;
    gap: 4px;
    z-index: 999997;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  // Add buttons
  const buttons = [];
  let buttonIndex = 0;

  if (highlightMenu_settings.showTTS) {
    buttons.push(
      highlightMenu_createButton(
        '🔊',
        'Read Aloud (TTS)',
        () => highlightMenu_handleTTS(),
        buttonIndex++
      )
    );
  }

  if (highlightMenu_settings.showDictionary) {
    buttons.push(
      highlightMenu_createButton(
        '📖',
        'Dictionary Lookup',
        () => highlightMenu_handleDictionary(),
        buttonIndex++
      )
    );
  }

  if (highlightMenu_settings.showTranslate) {
    buttons.push(
      highlightMenu_createButton(
        '🌐',
        'Translate',
        () => highlightMenu_handleTranslate(),
        buttonIndex++
      )
    );
  }

  if (highlightMenu_settings.showSearch) {
    buttons.push(
      highlightMenu_createButton(
        '🔍',
        'Search Google',
        () => highlightMenu_handleSearch(),
        buttonIndex++
      )
    );
  }

  if (highlightMenu_settings.showAnnotate) {
    buttons.push(
      highlightMenu_createButton(
        '📝',
        'Add Annotation',
        () => highlightMenu_handleAnnotate(),
        buttonIndex++
      )
    );
  }

  if (highlightMenu_settings.showCopy) {
    buttons.push(
      highlightMenu_createButton('📋', 'Copy Text', () => highlightMenu_handleCopy(), buttonIndex++)
    );
  }

  buttons.forEach(btn => toolbar.appendChild(btn));

  return toolbar;
}

/**
 * Creates a toolbar button
 *
 * @param {string} icon - Button icon/emoji
 * @param {string} label - Accessible label
 * @param {Function} onClick - Click handler
 * @param {number} index - Button index for keyboard navigation
 * @returns {HTMLElement} Button element
 */
function highlightMenu_createButton(icon, label, onClick, index) {
  const button = document.createElement('button');
  button.className = 'assist-highlight-menu-btn';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('tabindex', index === 0 ? '0' : '-1');
  button.setAttribute('data-button-index', index);
  button.textContent = icon;
  button.style.cssText = `
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    width: 36px;
    height: 36px;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  `;

  button.onmouseenter = () => {
    button.style.background = '#f0f0f0';
    button.style.transform = 'scale(1.1)';
  };

  button.onmouseleave = () => {
    button.style.background = 'white';
    button.style.transform = 'scale(1)';
  };

  button.onfocus = () => {
    button.style.outline = '2px solid #4285f4';
    button.style.outlineOffset = '2px';
  };

  button.onblur = () => {
    button.style.outline = 'none';
  };

  button.onclick = e => {
    e.stopPropagation();
    onClick();
  };

  return button;
}

/**
 * Shows the toolbar at the specified position
 *
 * @param {DOMRect} selectionRect - Selection bounding rectangle
 */
function highlightMenu_show(selectionRect) {
  // Remove existing toolbar
  if (highlightMenu_toolbar) {
    highlightMenu_toolbar.remove();
  }

  // Create new toolbar
  highlightMenu_toolbar = highlightMenu_createToolbar();
  document.body.appendChild(highlightMenu_toolbar);

  // Position toolbar
  const toolbarRect = highlightMenu_toolbar.getBoundingClientRect();

  // Calculate position (above selection, centered)
  let left = selectionRect.left + selectionRect.width / 2 - toolbarRect.width / 2;
  let top = selectionRect.top - toolbarRect.height - 8;

  // Adjust if toolbar would be off-screen
  const viewportWidth = window.innerWidth;

  // Horizontal bounds
  if (left < 8) {
    left = 8;
  }
  if (left + toolbarRect.width > viewportWidth - 8) {
    left = viewportWidth - toolbarRect.width - 8;
  }

  // Vertical bounds (show below selection if no room above)
  if (top < 8) {
    top = selectionRect.bottom + 8;
  }

  // Apply position
  highlightMenu_toolbar.style.left = `${left + window.scrollX}px`;
  highlightMenu_toolbar.style.top = `${top + window.scrollY}px`;

  console.log('[HighlightMenu] Toolbar shown');
}

/**
 * Hides the toolbar
 */
function highlightMenu_hide() {
  if (highlightMenu_toolbar) {
    highlightMenu_toolbar.remove();
    highlightMenu_toolbar = null;
  }

  highlightMenu_selectedText = '';
  highlightMenu_selectionRange = null;
  highlightMenu_currentFocusIndex = 0;

  if (highlightMenu_autoHideTimeout) {
    clearTimeout(highlightMenu_autoHideTimeout);
    highlightMenu_autoHideTimeout = null;
  }

  console.log('[HighlightMenu] Toolbar hidden');
}

/**
 * Handles keyboard navigation within the toolbar
 *
 * @param {KeyboardEvent} event - Keyboard event
 */
function highlightMenu_handleKeyboardNav(event) {
  if (!highlightMenu_toolbar) {
    return;
  }

  const buttons = Array.from(highlightMenu_toolbar.querySelectorAll('.assist-highlight-menu-btn'));
  const totalButtons = buttons.length;

  if (totalButtons === 0) {
    return;
  }

  let handled = false;

  switch (event.key) {
    case 'Tab':
      event.preventDefault();
      if (event.shiftKey) {
        // Shift+Tab: move backward
        highlightMenu_currentFocusIndex =
          (highlightMenu_currentFocusIndex - 1 + totalButtons) % totalButtons;
      } else {
        // Tab: move forward
        highlightMenu_currentFocusIndex = (highlightMenu_currentFocusIndex + 1) % totalButtons;
      }
      handled = true;
      break;

    case 'ArrowRight':
      event.preventDefault();
      highlightMenu_currentFocusIndex = (highlightMenu_currentFocusIndex + 1) % totalButtons;
      handled = true;
      break;

    case 'ArrowLeft':
      event.preventDefault();
      highlightMenu_currentFocusIndex =
        (highlightMenu_currentFocusIndex - 1 + totalButtons) % totalButtons;
      handled = true;
      break;

    case 'Escape':
      event.preventDefault();
      highlightMenu_hide();
      handled = true;
      break;

    case 'Enter':
    case ' ':
      // Let the focused button handle the event
      break;
  }

  if (handled) {
    // Update tabindex and focus
    buttons.forEach((btn, idx) => {
      if (idx === highlightMenu_currentFocusIndex) {
        btn.setAttribute('tabindex', '0');
        btn.focus();
      } else {
        btn.setAttribute('tabindex', '-1');
      }
    });
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Handles TTS action
 */
function highlightMenu_handleTTS() {
  console.log('[HighlightMenu] TTS action triggered');

  // Check if TTS is available via readText function in content-simple.js
  if (typeof window.readText === 'function') {
    // Create a temporary element to pass to readText
    // Since we're reading selected text, we'll use the selection range
    let targetElement = document.body;

    // Try to get the element that contains the selection
    if (highlightMenu_selectionRange) {
      const container = highlightMenu_selectionRange.commonAncestorContainer;
      // If it's a text node, get its parent element
      targetElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    }

    window.readText(highlightMenu_selectedText, targetElement);
  } else {
    console.warn('[HighlightMenu] TTS not available');
    alert('TTS feature not available. Please reload the page.');
  }

  highlightMenu_hide();
}

/**
 * Handles Dictionary action
 */
function highlightMenu_handleDictionary() {
  console.log('[HighlightMenu] Dictionary action triggered');

  // Check if dictionary feature is available
  if (window.assistFeatures?.dictionary?.lookup) {
    window.assistFeatures.dictionary.lookup(highlightMenu_selectedText);
  } else {
    console.warn('[HighlightMenu] Dictionary feature not loaded');
    alert('Dictionary feature not available. Please reload the page.');
  }

  highlightMenu_hide();
}

/**
 * Handles Translate action (placeholder for Feature 6)
 */
function highlightMenu_handleTranslate() {
  console.log('[HighlightMenu] Translate action triggered');
  alert(
    `Translate: "${highlightMenu_selectedText}"\n\n(Feature 6 - Translation will be implemented later)`
  );
  highlightMenu_hide();
}

/**
 * Handles Search action
 */
function highlightMenu_handleSearch() {
  console.log('[HighlightMenu] Search action triggered');
  const query = encodeURIComponent(highlightMenu_selectedText);
  window.open(`https://www.google.com/search?q=${query}`, '_blank');
  highlightMenu_hide();
}

/**
 * Handles Annotate action (placeholder for Feature 5)
 */
function highlightMenu_handleAnnotate() {
  console.log('[HighlightMenu] Annotate action triggered');
  alert(
    `Add annotation for: "${highlightMenu_selectedText}"\n\n(Feature 5 - Annotations will be implemented later)`
  );
  highlightMenu_hide();
}

/**
 * Handles Copy action
 */
async function highlightMenu_handleCopy() {
  console.log('[HighlightMenu] Copy action triggered');

  try {
    await navigator.clipboard.writeText(highlightMenu_selectedText);
    console.log('[HighlightMenu] Text copied to clipboard');

    // Show toast if available
    if (window.showToast) {
      window.showToast('Text copied to clipboard');
    } else {
      alert('Text copied to clipboard');
    }
  } catch (error) {
    console.error('[HighlightMenu] Clipboard copy failed:', error);
    alert('Failed to copy text');
  }

  highlightMenu_hide();
}

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

/**
 * Initializes the highlight menu feature
 */
function highlightMenu_init() {
  console.log('[HighlightMenu] Initializing...');

  // Add mouseup listener for text selection
  document.addEventListener('mouseup', highlightMenu_handleSelection);

  // Add keyboard navigation listener
  document.addEventListener('keydown', highlightMenu_handleKeyboardNav);

  // Hide toolbar when clicking outside
  document.addEventListener('mousedown', e => {
    if (highlightMenu_toolbar && !highlightMenu_toolbar.contains(e.target)) {
      highlightMenu_hide();
    }
  });

  // Load settings from chrome.storage
  chrome.storage.local.get(['highlightMenuSettings'], result => {
    if (result.highlightMenuSettings) {
      Object.assign(highlightMenu_settings, result.highlightMenuSettings);
      console.log('[HighlightMenu] Settings loaded:', highlightMenu_settings);
    }
  });

  // Listen for settings updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.highlightMenuSettings) {
      Object.assign(highlightMenu_settings, changes.highlightMenuSettings.newValue);
      console.log('[HighlightMenu] Settings updated:', highlightMenu_settings);
    }
  });

  // Register feature
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.highlightMenu = {
    show: highlightMenu_show,
    hide: highlightMenu_hide,
    settings: highlightMenu_settings,
  };

  console.log('[HighlightMenu] Feature initialized');
}

/**
 * Cleanup function
 */
function highlightMenu_cleanup() {
  console.log('[HighlightMenu] Cleaning up...');
  highlightMenu_hide();
  document.removeEventListener('mouseup', highlightMenu_handleSelection);
  document.removeEventListener('keydown', highlightMenu_handleKeyboardNav);
}

// ============================================================================
// EXPORTS
// ============================================================================

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  highlightMenu_init();
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    highlightMenu_init,
    highlightMenu_cleanup,
    highlightMenu_show,
    highlightMenu_hide,
    highlightMenu_handleSelection,
  };
}
