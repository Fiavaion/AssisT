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
  compactMode: true, // Compact mode (icons only) vs descriptive mode (icons + labels)
  showTTS: true,
  showDictionary: true,
  showTranslate: true,
  showAnnotate: true,
  showCopy: true,
  showSummarize: true, // AI summarization (LLM Edition)
  showSimplify: true, // AI text simplification (LLM Edition)
  showBreakdown: true, // AI assignment breakdown (LLM Edition)
  showSocraticTutor: true, // AI Socratic questioning (LLM Edition)
  showKnowledgeGraph: true, // AI knowledge graph visualization
  showSpeedRead: true, // Adaptive RSVP speed reading
  showCitationAnalyzer: true, // AI citation/source analysis
  showCognitiveMonitor: true, // AI cognitive state monitoring
  showMultiDocCompare: true, // Multi-document comparison
  showStudyPath: true, // Study path generator
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
 * Creates the floating toolbar element with multi-row grid layout
 *
 * @returns {HTMLElement} Toolbar element
 */
function highlightMenu_createToolbar() {
  const toolbar = document.createElement('div');
  toolbar.id = 'assist-highlight-menu';
  toolbar.className = highlightMenu_settings.compactMode ? 'compact' : 'descriptive';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text selection actions');

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #assist-highlight-menu {
      position: fixed;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      z-index: 999997;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    /* Compact mode (default) */
    #assist-highlight-menu.compact {
      padding: 6px;
    }

    #assist-highlight-menu.compact .assist-hm-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 3px;
    }

    #assist-highlight-menu.compact .assist-hm-btn {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      width: 32px;
      height: 32px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
      padding: 0;
    }

    #assist-highlight-menu.compact .assist-hm-btn:hover {
      background: #e3f2fd;
      border-color: #2196F3;
      transform: scale(1.1);
    }

    #assist-highlight-menu.compact .assist-hm-btn:focus {
      outline: 2px solid #2196F3;
      outline-offset: 1px;
    }

    #assist-highlight-menu.compact .assist-hm-btn-icon {
      font-size: 16px;
      line-height: 1;
    }

    #assist-highlight-menu.compact .assist-hm-btn-label {
      display: none;
    }

    #assist-highlight-menu.compact .assist-hm-section-label {
      display: none;
    }

    #assist-highlight-menu.compact .assist-hm-section {
      margin-bottom: 3px;
    }

    #assist-highlight-menu.compact .assist-hm-section:last-child {
      margin-bottom: 0;
    }

    #assist-highlight-menu.compact .assist-hm-divider {
      height: 1px;
      background: #e0e0e0;
      margin: 3px 0;
    }

    #assist-highlight-menu.compact .assist-hm-btn-ai {
      background: linear-gradient(135deg, #f3e5f5 0%, #e8eaf6 100%);
      border-color: #ce93d8;
    }

    #assist-highlight-menu.compact .assist-hm-btn-ai:hover {
      background: linear-gradient(135deg, #e1bee7 0%, #c5cae9 100%);
      border-color: #9c27b0;
    }

    /* Descriptive mode */
    #assist-highlight-menu.descriptive {
      padding: 12px;
      max-width: 420px;
    }

    #assist-highlight-menu.descriptive .assist-hm-section {
      margin-bottom: 8px;
    }

    #assist-highlight-menu.descriptive .assist-hm-section:last-child {
      margin-bottom: 0;
    }

    #assist-highlight-menu.descriptive .assist-hm-section-label {
      font-size: 10px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      padding-left: 4px;
    }

    #assist-highlight-menu.descriptive .assist-hm-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
    }

    #assist-highlight-menu.descriptive .assist-hm-btn {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      width: 56px;
      height: 52px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      transition: all 0.15s ease;
      padding: 4px 2px;
    }

    #assist-highlight-menu.descriptive .assist-hm-btn:hover {
      background: #e3f2fd;
      border-color: #2196F3;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(33, 150, 243, 0.2);
    }

    #assist-highlight-menu.descriptive .assist-hm-btn:focus {
      outline: 2px solid #2196F3;
      outline-offset: 2px;
    }

    #assist-highlight-menu.descriptive .assist-hm-btn-icon {
      font-size: 20px;
      line-height: 1;
    }

    #assist-highlight-menu.descriptive .assist-hm-btn-label {
      font-size: 9px;
      color: #666;
      text-align: center;
      line-height: 1.1;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #assist-highlight-menu.descriptive .assist-hm-btn-ai {
      background: linear-gradient(135deg, #f3e5f5 0%, #e8eaf6 100%);
      border-color: #ce93d8;
    }

    #assist-highlight-menu.descriptive .assist-hm-btn-ai:hover {
      background: linear-gradient(135deg, #e1bee7 0%, #c5cae9 100%);
      border-color: #9c27b0;
      box-shadow: 0 4px 8px rgba(156, 39, 176, 0.2);
    }
  `;
  toolbar.appendChild(style);

  // Collect all buttons into a single array for unified 3x5 grid (15 buttons)
  const allButtons = [];
  let buttonIndex = 0;

  // Row 1: Core tools (5 buttons)
  if (highlightMenu_settings.showTTS) {
    allButtons.push({
      icon: '🔊',
      label: 'Read',
      fullLabel: 'Read Aloud (TTS)',
      handler: highlightMenu_handleTTS,
      index: buttonIndex++,
    });
  }
  if (highlightMenu_settings.showDictionary) {
    allButtons.push({
      icon: '📖',
      label: 'Define',
      fullLabel: 'Dictionary Lookup',
      handler: highlightMenu_handleDictionary,
      index: buttonIndex++,
    });
  }
  if (highlightMenu_settings.showTranslate) {
    allButtons.push({
      icon: '🌐',
      label: 'Translate',
      fullLabel: 'Translate',
      handler: highlightMenu_handleTranslate,
      index: buttonIndex++,
    });
  }
  if (highlightMenu_settings.showAnnotate) {
    allButtons.push({
      icon: '📝',
      label: 'Annotate',
      fullLabel: 'Add Annotation',
      handler: highlightMenu_handleAnnotate,
      index: buttonIndex++,
    });
  }
  if (highlightMenu_settings.showCopy) {
    allButtons.push({
      icon: '📋',
      label: 'Copy',
      fullLabel: 'Copy Text',
      handler: highlightMenu_handleCopy,
      index: buttonIndex++,
    });
  }

  // Row 2: AI tools part 1 (5 buttons) - Only show if Local AI is enabled
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showSummarize) {
    allButtons.push({
      icon: '✨',
      label: 'Summary',
      fullLabel: 'Summarize with AI',
      handler: highlightMenu_handleSummarize,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showSimplify) {
    allButtons.push({
      icon: '💡',
      label: 'Simplify',
      fullLabel: 'Simplify Text',
      handler: highlightMenu_handleSimplify,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showBreakdown) {
    allButtons.push({
      icon: '✅',
      label: 'Tasks',
      fullLabel: 'Break Down Assignment',
      handler: highlightMenu_handleBreakdown,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showSocraticTutor) {
    allButtons.push({
      icon: '🎓',
      label: 'Tutor',
      fullLabel: 'Socratic Tutor',
      handler: highlightMenu_handleSocraticTutor,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showKnowledgeGraph) {
    allButtons.push({
      icon: '🕸️',
      label: 'Graph',
      fullLabel: 'Knowledge Graph',
      handler: highlightMenu_handleKnowledgeGraph,
      index: buttonIndex++,
      isAI: true,
    });
  }

  // Row 3: AI tools part 2 (5 buttons) - Only show if Local AI is enabled
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showSpeedRead) {
    allButtons.push({
      icon: '⚡',
      label: 'Speed',
      fullLabel: 'Speed Read (RSVP)',
      handler: highlightMenu_handleSpeedRead,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showCitationAnalyzer) {
    allButtons.push({
      icon: '⚖️',
      label: 'Cite',
      fullLabel: 'Analyze Citation',
      handler: highlightMenu_handleCitationAnalyzer,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showCognitiveMonitor) {
    allButtons.push({
      icon: '🧠',
      label: 'Focus',
      fullLabel: 'Cognitive Monitor',
      handler: highlightMenu_handleCognitiveMonitor,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showMultiDocCompare) {
    allButtons.push({
      icon: '📊',
      label: 'Compare',
      fullLabel: 'Compare Documents',
      handler: highlightMenu_handleMultiDocCompare,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (highlightMenu_settings.llmEnabled && highlightMenu_settings.showStudyPath) {
    allButtons.push({
      icon: '📚',
      label: 'Study',
      fullLabel: 'Generate Study Path',
      handler: highlightMenu_handleStudyPath,
      index: buttonIndex++,
      isAI: true,
    });
  }

  // Create single unified grid (3 rows x 5 columns)
  if (allButtons.length > 0) {
    const section = document.createElement('div');
    section.className = 'assist-hm-section';

    const grid = document.createElement('div');
    grid.className = 'assist-hm-grid';
    allButtons.forEach(btn => {
      const button = highlightMenu_createButton(
        btn.icon,
        btn.label,
        btn.fullLabel,
        btn.handler,
        btn.index
      );
      if (btn.isAI) {
        button.classList.add('assist-hm-btn-ai');
      }
      grid.appendChild(button);
    });
    section.appendChild(grid);
    toolbar.appendChild(section);
  }

  return toolbar;
}

/**
 * Creates a toolbar button with icon and label
 *
 * @param {string} icon - Button icon/emoji
 * @param {string} shortLabel - Short label displayed under icon
 * @param {string} fullLabel - Full accessible label for tooltip
 * @param {Function} onClick - Click handler
 * @param {number} index - Button index for keyboard navigation
 * @returns {HTMLElement} Button element
 */
function highlightMenu_createButton(icon, shortLabel, fullLabel, onClick, index) {
  const button = document.createElement('button');
  button.className = 'assist-hm-btn';
  button.setAttribute('aria-label', fullLabel);
  button.setAttribute('title', fullLabel);
  button.setAttribute('tabindex', index === 0 ? '0' : '-1');
  button.setAttribute('data-button-index', index);

  // Icon element
  const iconSpan = document.createElement('span');
  iconSpan.className = 'assist-hm-btn-icon';
  iconSpan.textContent = icon;
  button.appendChild(iconSpan);

  // Label element
  const labelSpan = document.createElement('span');
  labelSpan.className = 'assist-hm-btn-label';
  labelSpan.textContent = shortLabel;
  button.appendChild(labelSpan);

  // Use mousedown instead of onclick to prevent race condition with document mousedown listener
  button.onmousedown = e => {
    e.preventDefault();
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

  // Pause auto-hide when hovering over toolbar
  highlightMenu_toolbar.onmouseenter = () => {
    if (highlightMenu_autoHideTimeout) {
      clearTimeout(highlightMenu_autoHideTimeout);
      highlightMenu_autoHideTimeout = null;
    }
  };

  // Resume auto-hide when mouse leaves toolbar
  highlightMenu_toolbar.onmouseleave = () => {
    if (highlightMenu_settings.autoHideDelay > 0) {
      highlightMenu_autoHideTimeout = setTimeout(() => {
        highlightMenu_hide();
      }, highlightMenu_settings.autoHideDelay);
    }
  };

  // Position toolbar
  const toolbarRect = highlightMenu_toolbar.getBoundingClientRect();

  // Calculate position (above selection, centered)
  let left = selectionRect.left + selectionRect.width / 2 - toolbarRect.width / 2;
  let top = selectionRect.top - toolbarRect.height - 8;

  // Adjust if toolbar would be off-screen
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Horizontal bounds
  if (left < 8) {
    left = 8;
  }
  if (left + toolbarRect.width > viewportWidth - 8) {
    left = viewportWidth - toolbarRect.width - 8;
  }

  // Vertical bounds
  // First: if no room above, try below selection
  if (top < 8) {
    top = selectionRect.bottom + 8;
  }

  // Second: if toolbar goes off bottom, clamp to viewport
  if (top + toolbarRect.height > viewportHeight - 8) {
    top = viewportHeight - toolbarRect.height - 8;
  }

  // Final safety: ensure top is never negative
  if (top < 8) {
    top = 8;
  }

  // Apply position (using fixed positioning, no scroll offset needed)
  highlightMenu_toolbar.style.left = `${left}px`;
  highlightMenu_toolbar.style.top = `${top}px`;
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

  const buttons = Array.from(highlightMenu_toolbar.querySelectorAll('.assist-hm-btn'));
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
 * Handles Translate action
 */
function highlightMenu_handleTranslate() {
  console.log('[HighlightMenu] Translate action triggered');

  // Check if translation UI is available
  if (window.assistFeatures?.translationUI) {
    window.assistFeatures.translationUI.openModal(highlightMenu_selectedText, 'auto', 'en');
  } else {
    console.warn('[HighlightMenu] Translation UI not loaded');
    alert('Translation feature not available. Please reload the page.');
  }

  highlightMenu_hide();
}

/**
 * Handles Annotate action
 */
function highlightMenu_handleAnnotate() {
  console.log('[HighlightMenu] Annotate action triggered');

  // Check if inline annotations feature is available
  if (window.assistFeatures?.inlineAnnotations) {
    const { openAnnotationModal, getPositionFromRange } = window.assistFeatures.inlineAnnotations;

    // Get position data from current selection
    if (highlightMenu_selectionRange) {
      const position = getPositionFromRange(highlightMenu_selectionRange);
      openAnnotationModal(null, highlightMenu_selectedText, position);
    } else {
      console.warn('[HighlightMenu] No selection range available');
      alert('Please select text again to annotate.');
    }
  } else {
    console.warn('[HighlightMenu] Inline Annotations feature not loaded');
    alert('Annotations feature not available. Please reload the page.');
  }

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

/**
 * Handles Summarize action (AI-powered summarization)
 */
function highlightMenu_handleSummarize() {
  console.log('[HighlightMenu] Summarize action triggered');

  // Check if summarization feature is available
  if (window.assistFeatures?.summarization) {
    // Get selection rectangle for positioning
    const rect = highlightMenu_selectionRange
      ? highlightMenu_selectionRange.getBoundingClientRect()
      : null;

    window.assistFeatures.summarization.start(highlightMenu_selectedText, rect);
  } else {
    console.warn('[HighlightMenu] Summarization feature not loaded');
    if (window.showToast) {
      window.showToast('Summarization feature not available. Enable LLM Edition.');
    } else {
      alert('Summarization feature not available. Please enable LLM Edition.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Simplify action (AI-powered text simplification)
 */
function highlightMenu_handleSimplify() {
  console.log('[HighlightMenu] Simplify action triggered');

  // Check if text simplification feature is available
  if (window.assistFeatures?.textSimplification) {
    // Get selection rectangle for positioning
    const rect = highlightMenu_selectionRange
      ? highlightMenu_selectionRange.getBoundingClientRect()
      : null;

    window.assistFeatures.textSimplification.start(highlightMenu_selectedText, rect);
  } else {
    console.warn('[HighlightMenu] Text Simplification feature not loaded');
    if (window.showToast) {
      window.showToast('Text Simplification feature not available.');
    } else {
      alert('Text Simplification feature not available. Please reload the page.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Breakdown action (AI-powered assignment breakdown)
 */
function highlightMenu_handleBreakdown() {
  console.log('[HighlightMenu] Breakdown action triggered');

  // Check if assignment breakdown feature is available
  if (window.assistFeatures?.assignmentBreakdown) {
    // Get selection rectangle for positioning
    const rect = highlightMenu_selectionRange
      ? highlightMenu_selectionRange.getBoundingClientRect()
      : null;

    window.assistFeatures.assignmentBreakdown.start(highlightMenu_selectedText, rect);
  } else {
    console.warn('[HighlightMenu] Assignment Breakdown feature not loaded');
    if (window.showToast) {
      window.showToast('Assignment Breakdown feature not available.');
    } else {
      alert('Assignment Breakdown feature not available. Please reload the page.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Socratic Tutor action (AI-powered questioning)
 */
function highlightMenu_handleSocraticTutor() {
  console.log('[HighlightMenu] Socratic Tutor action triggered');

  // Check if socratic tutor feature is available
  if (window.assistFeatures?.socraticTutor) {
    window.assistFeatures.socraticTutor.start(highlightMenu_selectedText);
  } else {
    console.warn('[HighlightMenu] Socratic Tutor feature not loaded');
    if (window.showToast) {
      window.showToast('Socratic Tutor feature not available.');
    } else {
      alert('Socratic Tutor feature not available. Please reload the page.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Knowledge Graph action (concept visualization)
 */
function highlightMenu_handleKnowledgeGraph() {
  console.log('[HighlightMenu] Knowledge Graph action triggered');

  // Check if knowledge graph feature is available
  if (window.assistFeatures?.knowledgeGraph) {
    window.assistFeatures.knowledgeGraph.start(highlightMenu_selectedText);
  } else {
    console.warn('[HighlightMenu] Knowledge Graph feature not loaded');
    if (window.showToast) {
      window.showToast('Knowledge Graph feature not available.');
    } else {
      alert('Knowledge Graph feature not available. Please reload the page.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Speed Read action (Adaptive RSVP)
 */
function highlightMenu_handleSpeedRead() {
  console.log('[HighlightMenu] Speed Read (RSVP) action triggered');

  // Check if adaptive RSVP feature is available
  if (window.assistFeatures?.adaptiveRSVP) {
    window.assistFeatures.adaptiveRSVP.start(highlightMenu_selectedText);
  } else {
    console.warn('[HighlightMenu] Adaptive RSVP feature not loaded');
    if (window.showToast) {
      window.showToast('Speed Read feature not available.');
    } else {
      alert('Speed Read feature not available. Please reload the page.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Citation Analyzer action (AI source evaluation)
 */
function highlightMenu_handleCitationAnalyzer() {
  console.log('[HighlightMenu] Citation Analyzer action triggered');

  // Check if citation analyzer feature is available
  if (window.assistFeatures?.citationAnalyzer) {
    window.assistFeatures.citationAnalyzer.start(highlightMenu_selectedText);
  } else {
    console.warn('[HighlightMenu] Citation Analyzer feature not loaded');
    if (window.showToast) {
      window.showToast('Citation Analyzer feature not available.');
    } else {
      alert('Citation Analyzer feature not available. Please reload the page.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Cognitive Monitor action (cognitive state tracking)
 */
function highlightMenu_handleCognitiveMonitor() {
  console.log('[HighlightMenu] Cognitive Monitor action triggered');

  // Check if cognitive state monitor feature is available
  if (window.assistFeatures?.cognitiveStateMonitor) {
    window.assistFeatures.cognitiveStateMonitor.show();
  } else {
    console.warn('[HighlightMenu] Cognitive State Monitor feature not loaded');
    if (window.showToast) {
      window.showToast('Cognitive Monitor feature not available.');
    } else {
      alert('Cognitive Monitor feature not available. Please reload the page.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Multi-Document Compare action (add selection to comparison)
 */
function highlightMenu_handleMultiDocCompare() {
  console.log('[HighlightMenu] Multi-Doc Compare action triggered');

  // Check if multi-doc compare feature is available
  if (window.assistFeatures?.multiDocCompare) {
    // Show panel with current selection added
    window.assistFeatures.multiDocCompare.show(highlightMenu_selectedText);
  } else {
    console.warn('[HighlightMenu] Multi-Document Compare feature not loaded');
    if (window.showToast) {
      window.showToast('Multi-Document Compare feature not available.');
    } else {
      alert('Multi-Document Compare feature not available. Please reload the page.');
    }
  }

  highlightMenu_hide();
}

/**
 * Handles Study Path Generator action (generate learning path from content)
 */
function highlightMenu_handleStudyPath() {
  console.log('[HighlightMenu] Study Path Generator action triggered');

  // Check if study path generator feature is available
  if (window.assistFeatures?.studyPathGenerator) {
    // Show panel and generate path from selected text
    window.assistFeatures.studyPathGenerator.show(highlightMenu_selectedText);
  } else {
    console.warn('[HighlightMenu] Study Path Generator feature not loaded');
    if (window.showToast) {
      window.showToast('Study Path Generator feature not available.');
    } else {
      alert('Study Path Generator feature not available. Please reload the page.');
    }
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

  // Hide toolbar when clicking outside (bubble phase - runs AFTER button handlers)
  document.addEventListener('mousedown', e => {
    // Don't hide if clicking on the toolbar or its buttons
    // Note: If button handler called stopPropagation(), this won't run
    if (highlightMenu_toolbar && !highlightMenu_toolbar.contains(e.target)) {
      highlightMenu_hide();
    }
  });

  // Load settings from chrome.storage
  chrome.storage.local.get(['highlightMenuSettings', 'llmEnabled'], result => {
    if (result.highlightMenuSettings) {
      Object.assign(highlightMenu_settings, result.highlightMenuSettings);
      console.log('[HighlightMenu] Settings loaded:', highlightMenu_settings);
    }
    // Store LLM enabled state to filter AI buttons
    highlightMenu_settings.llmEnabled = result.llmEnabled !== undefined ? result.llmEnabled : false;
  });

  // Listen for settings updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.highlightMenuSettings) {
        Object.assign(highlightMenu_settings, changes.highlightMenuSettings.newValue);
        console.log('[HighlightMenu] Settings updated:', highlightMenu_settings);
      }
      if (changes.llmEnabled) {
        highlightMenu_settings.llmEnabled = changes.llmEnabled.newValue;
        console.log(
          '[HighlightMenu] LLM enabled state updated:',
          highlightMenu_settings.llmEnabled
        );
      }
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
