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

import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { captureFromSelection } from '../mindMap/capture.js';
import { createCardFromSelection } from '../flashcards/flashcards-ui.js';
import { COMPANION_STORAGE_KEY } from '../companion/companion-settings.js';
import { selectionContainer } from '../../utils/dialog-return-focus.js';
import { showToast } from '../../core/ui/toast.js';

let highlightMenu_toolbar = null;
let highlightMenu_selectedText = '';
let highlightMenu_selectionRange = null;
let highlightMenu_autoHideTimeout = null;
let highlightMenu_currentFocusIndex = 0;
let highlightMenu_returnFocus = null; // where keyboard focus was before Tab entered the menu
let highlightMenu_announceTimeout = null;
/**
 * The buttons activate on mousedown, but the menu is shown from a document-level mouseup.
 * Without this, the mouseup that completes the very same click found the selection still in
 * place and put the menu straight back — over the RSVP overlay it had just opened.
 */
let highlightMenu_suppressNextSelection = false;
const highlightMenu_settings = {
  enabled: true,
  compactMode: true, // Compact mode (icons only) vs descriptive mode (icons + labels)
  showTTS: true,
  showDictionary: true,
  showTranslate: true,
  showAnnotate: true,
  showSaveCitation: true, // Save selected text as citation
  showMindMap: true, // Send selected text to a mind map
  showSummarize: true, // AI summarization (LLM Edition)
  showSimplify: true, // AI text simplification (LLM Edition)
  showBreakdown: true, // AI assignment breakdown (LLM Edition)
  showSocraticTutor: true, // AI Socratic questioning (LLM Edition)
  showKnowledgeGraph: true, // AI knowledge graph visualization
  showSpeedRead: true, // RSVP speed reading (modular system)
  showFlashcard: true, // Make a spaced-repetition card from the selection
  mindMapEnabled: true, // assist_settings.mindMap.enabled — the student's own switch, default on
  flashcardsEnabled: true, // companionFeatures.flashcards — the student's own switch, default on
  showCitationAnalyzer: true, // AI citation/source analysis
  showMultiDocCompare: true, // Multi-document comparison
  showStudyPath: true, // Study path generator
  autoHideDelay: 5000, // milliseconds
  // AI mode states - loaded from storage on init
  llmEnabled: false, // Local AI (Ollama) enabled
  cloudModeEnabled: false, // Cloud AI enabled
  webllmEnabled: false, // Browser AI (WebLLM) enabled
};

/** AssisT surfaces named by id or by a marker attribute; any element inside one is AssisT's. */
const HIGHLIGHT_MENU_ASSIST_SURFACES =
  '[id^="assist-"], [data-assist-consent-panel], [data-assist-consent-window-note]';

/** Reading Mode's copy of the article is the page's text, shown larger: the menu works there. */
const HIGHLIGHT_MENU_READING_SURFACE = '#assist-reading-mode-content';

/**
 * Is this node part of AssisT's own UI rather than the page? Most surfaces carry an `assist-`
 * id; the rest (sticky notes, the action tray, the mic button, the LMS buttons) are named only
 * by an `assist-` class on their root, which sits directly on <body>.
 *
 * @param {Node|null} node
 * @returns {boolean}
 */
function highlightMenu_isAssistUI(node) {
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element || element.closest(HIGHLIGHT_MENU_READING_SURFACE)) {
    return false;
  }
  if (element.closest(HIGHLIGHT_MENU_ASSIST_SURFACES)) {
    return true;
  }
  let root = element;
  while (root.parentElement && root.parentElement !== document.body) {
    root = root.parentElement;
  }
  return (
    root.parentElement === document.body &&
    Array.from(root.classList).some(name => name.startsWith('assist-'))
  );
}

/**
 * Handles text selection (mouseup event)
 *
 * @param {MouseEvent|KeyboardEvent} event - The mouseup or keyup that may have made a selection
 */
function highlightMenu_handleSelection(event) {
  if (!highlightMenu_settings.enabled) {
    return;
  }

  // An action has just run on this click: its own mouseup must not re-open the menu.
  if (highlightMenu_suppressNextSelection) {
    highlightMenu_suppressNextSelection = false;
    return;
  }

  // The menu is for the page's text. A press inside AssisT's own UI (Speed Read keeps the page
  // selection while its buttons are used) or words selected inside a panel never open it.
  if (highlightMenu_isAssistUI(event?.target)) {
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

  // Only a selection wholly inside AssisT's UI is AssisT's. Chrome ends a triple-click at the start
  // of whatever follows the paragraph, which on a course page is often AssisT's capture bar.
  if (
    highlightMenu_isAssistUI(selection.anchorNode) &&
    highlightMenu_isAssistUI(selection.focusNode)
  ) {
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
  if (highlightMenu_settings.showSaveCitation) {
    allButtons.push({
      icon: '📌',
      label: 'Cite',
      fullLabel: 'Save as Citation',
      handler: highlightMenu_handleSaveCitation,
      index: buttonIndex++,
    });
  }
  // Offered only while the mind map is switched on: with it off the button used to send the
  // note into a feature that was not there and the student saw nothing happen at all.
  if (highlightMenu_settings.showMindMap && highlightMenu_settings.mindMapEnabled) {
    allButtons.push({
      icon: '🧠',
      label: 'Map',
      fullLabel: 'Add to mind map',
      handler: highlightMenu_handleAddToMindMap,
      index: buttonIndex++,
    });
  }
  if (highlightMenu_settings.showSpeedRead) {
    allButtons.push({
      icon: '⚡',
      label: 'Speed',
      fullLabel: 'Speed Read (RSVP)',
      handler: highlightMenu_handleSpeedRead,
      index: buttonIndex++,
    });
  }
  // The only route into flashcards for a student who has none yet: the floating "Cards ready"
  // card mounts only once a card is due, so without this entry a fresh profile could never make
  // a first card. Offered only while the support is switched on.
  if (highlightMenu_settings.showFlashcard && highlightMenu_settings.flashcardsEnabled) {
    allButtons.push({
      icon: '🃏',
      label: 'Card',
      fullLabel: 'Make a flashcard',
      handler: highlightMenu_handleFlashcard,
      index: buttonIndex++,
    });
  }

  // Row 2: AI tools part 1 (5 buttons) - Show if Local AI, Cloud AI, Gemini Nano, OR Browser AI is enabled
  const aiEnabled =
    highlightMenu_settings.llmEnabled ||
    highlightMenu_settings.cloudModeEnabled ||
    highlightMenu_settings.geminiEnabled ||
    highlightMenu_settings.webllmEnabled;
  if (aiEnabled && highlightMenu_settings.showSummarize) {
    allButtons.push({
      icon: '✨',
      label: 'Summary',
      fullLabel: 'Summarize with AI',
      handler: highlightMenu_handleSummarize,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (aiEnabled && highlightMenu_settings.showSimplify) {
    allButtons.push({
      icon: '💡',
      label: 'Simplify',
      fullLabel: 'Simplify Text',
      handler: highlightMenu_handleSimplify,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (aiEnabled && highlightMenu_settings.showBreakdown) {
    allButtons.push({
      icon: '✅',
      label: 'Tasks',
      fullLabel: 'Break Down Assignment',
      handler: highlightMenu_handleBreakdown,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (aiEnabled && highlightMenu_settings.showSocraticTutor) {
    allButtons.push({
      icon: '🎓',
      label: 'Tutor',
      fullLabel: 'Socratic Tutor',
      handler: highlightMenu_handleSocraticTutor,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (aiEnabled && highlightMenu_settings.showKnowledgeGraph) {
    allButtons.push({
      icon: '🕸️',
      label: 'Graph',
      fullLabel: 'Knowledge Graph',
      handler: highlightMenu_handleKnowledgeGraph,
      index: buttonIndex++,
      isAI: true,
    });
  }

  // Row 3: AI tools part 2 (5 buttons) - Show if Local AI OR Cloud AI is enabled
  if (aiEnabled && highlightMenu_settings.showCitationAnalyzer) {
    allButtons.push({
      icon: '⚖️',
      label: 'Cite',
      fullLabel: 'Analyze Citation',
      handler: highlightMenu_handleCitationAnalyzer,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (aiEnabled && highlightMenu_settings.showMultiDocCompare) {
    allButtons.push({
      icon: '📊',
      label: 'Compare',
      fullLabel: 'Compare Documents',
      handler: highlightMenu_handleMultiDocCompare,
      index: buttonIndex++,
      isAI: true,
    });
  }
  if (aiEnabled && highlightMenu_settings.showStudyPath) {
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

  // Mousedown (with preventDefault, so the page selection survives) plus Enter/Space.
  attachAccessibleHandler(
    button,
    `HighlightMenu ${fullLabel}`,
    event => {
      onClick();
      // Only a mouse press has a mouseup still to come; after Enter or Space the student's
      // next mouse selection must open the menu.
      if (event.type === 'keydown') {
        highlightMenu_suppressNextSelection = false;
      }
    },
    { enableVisualFeedback: false }
  );

  return button;
}

/**
 * Speaks a short message to screen readers through a visually hidden polite
 * status region that lives outside the menu, so rebuilding the menu does not
 * re-announce it. The text is written a tick after the region exists, so a
 * region created on this call is still announced. An empty message clears it,
 * so the next opening is a change that gets announced.
 *
 * @param {string} message - Text to announce, or '' to clear
 */
function highlightMenu_announce(message) {
  clearTimeout(highlightMenu_announceTimeout);
  let region = document.getElementById('assist-hm-status');
  if (!region && !message) {
    return;
  }
  if (!region) {
    region = document.createElement('div');
    region.id = 'assist-hm-status';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;' +
      'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';
    document.body.appendChild(region);
  }
  if (!message) {
    region.textContent = '';
    return;
  }
  highlightMenu_announceTimeout = setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/**
 * Shows the toolbar at the specified position
 *
 * @param {DOMRect} selectionRect - Selection bounding rectangle
 */
function highlightMenu_show(selectionRect) {
  // Remove existing toolbar; a menu that was already open is not announced again
  if (highlightMenu_toolbar) {
    highlightMenu_toolbar.remove();
  } else {
    highlightMenu_announce('AssisT tools available. Press Tab to use them, Escape to close.');
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

  // A keyboard user inside the menu gets as long as they need (SC 2.2.1).
  highlightMenu_toolbar.addEventListener('focusin', highlightMenu_toolbar.onmouseenter);

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
 * Hides the toolbar. If keyboard focus was inside it, focus goes back to where it was before
 * the student entered the menu; a dialog an action opens afterwards still takes focus itself.
 */
function highlightMenu_hide() {
  if (highlightMenu_toolbar) {
    const focusWasInside = highlightMenu_toolbar.contains(document.activeElement);
    highlightMenu_toolbar.remove();
    highlightMenu_toolbar = null;
    if (focusWasInside && highlightMenu_returnFocus?.isConnected) {
      highlightMenu_returnFocus.focus({ preventScroll: true });
    }
  }

  highlightMenu_selectedText = '';
  highlightMenu_selectionRange = null;
  highlightMenu_currentFocusIndex = 0;
  highlightMenu_returnFocus = null;
  highlightMenu_announce('');

  if (highlightMenu_autoHideTimeout) {
    clearTimeout(highlightMenu_autoHideTimeout);
    highlightMenu_autoHideTimeout = null;
  }
}

/**
 * Hides the toolbar after one of its actions has run, and keeps it hidden for the rest of
 * that click. The selection survives the action (RSVP reads it, the citation keeps it), so
 * the mouseup completing the press would otherwise be read as a brand new selection.
 */
function highlightMenu_dismiss() {
  highlightMenu_suppressNextSelection = true;
  highlightMenu_hide();
}

/**
 * Say something to the student about an action they just took.
 *
 * Forced past the "minimize clutter" setting: these are answers to something the student did,
 * not feature chatter, and the toast's role="status" is the only way the words are announced.
 *
 * @param {string} message - One plain sentence.
 */
function highlightMenu_tell(message) {
  showToast(message, 4000, { force: true });
}

/**
 * Hand the selection over to an action that opens a dialog.
 *
 * The menu goes first, before the dialog exists: it used to float over the Annotation and
 * Translation dialogs and Tab walked straight out of the dialog onto its buttons. Hiding the
 * menu clears the stored selection, so the text and a clone of the range are taken first, and
 * the element the selection sits in travels with them — that is where the dialog puts focus
 * back, since the button that opened it is gone by the time the dialog closes.
 *
 * @param {(text: string, range: Range|null, returnFocus: HTMLElement|null) => void} action
 */
function highlightMenu_openDialog(action) {
  const text = highlightMenu_selectedText;
  const range = highlightMenu_selectionRange ? highlightMenu_selectionRange.cloneRange() : null;
  const returnFocus = selectionContainer(range);

  highlightMenu_dismiss();

  action(text, range, returnFocus);
}

/**
 * Keyboard support, following the WAI-ARIA toolbar pattern: Tab enters the menu on its
 * current button, arrow keys and Home/End move inside it, Enter and Space activate (bound on
 * each button), Tab or Escape leaves. Keys pressed outside the menu are left to the page, so
 * Shift+Arrow can keep extending the selection.
 *
 * @param {KeyboardEvent} event - Keyboard event
 */
function highlightMenu_handleKeyboardNav(event) {
  if (!highlightMenu_toolbar) {
    return;
  }

  const buttons = Array.from(highlightMenu_toolbar.querySelectorAll('.assist-hm-btn'));
  if (buttons.length === 0) {
    return;
  }
  const inside = highlightMenu_toolbar.contains(document.activeElement);

  if (event.key === 'Escape') {
    if (inside) {
      event.preventDefault();
    }
    highlightMenu_hide();
    return;
  }

  if (!inside) {
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      highlightMenu_returnFocus = document.activeElement;
      highlightMenu_focusButton(buttons, highlightMenu_currentFocusIndex);
    }
    return;
  }

  const next = (highlightMenu_currentFocusIndex + 1) % buttons.length;
  const previous = (highlightMenu_currentFocusIndex - 1 + buttons.length) % buttons.length;
  const moves = {
    ArrowRight: next,
    ArrowDown: next,
    ArrowLeft: previous,
    ArrowUp: previous,
    Home: 0,
    End: buttons.length - 1,
  };

  if (event.key === 'Tab') {
    event.preventDefault();
    highlightMenu_hide();
  } else if (event.key in moves) {
    event.preventDefault();
    highlightMenu_focusButton(buttons, moves[event.key]);
  }
}

/**
 * Roving tabindex: exactly one button is in the tab order, and it gets focus.
 *
 * @param {HTMLElement[]} buttons - Toolbar buttons in order
 * @param {number} index - Button to focus
 */
function highlightMenu_focusButton(buttons, index) {
  highlightMenu_currentFocusIndex = index;
  buttons.forEach((btn, idx) => btn.setAttribute('tabindex', idx === index ? '0' : '-1'));
  buttons[index].focus();
}

/**
 * Opens the menu for a selection made from the keyboard (Shift+Arrow, Shift+Home/End,
 * Ctrl/Cmd+A), without moving focus.
 *
 * @param {KeyboardEvent} event - Keyboard event
 */
function highlightMenu_handleKeyboardSelection(event) {
  if (highlightMenu_toolbar?.contains(document.activeElement)) {
    return;
  }
  const extendsSelection =
    event.shiftKey && /^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(event.key);
  const selectsAll = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a';
  if (extendsSelection || selectsAll) {
    highlightMenu_handleSelection(event);
  }
}

/**
 * Reads the selected words aloud through the content script's selection
 * reader, which highlights them word by word in the tightest block holding them.
 */
function highlightMenu_handleTTS() {
  if (typeof window.readSelection !== 'function') {
    highlightMenu_tell('Read Aloud is not ready on this page yet. Reload the page and try again.');
  } else if (!highlightMenu_selectionRange || !window.readSelection(highlightMenu_selectionRange)) {
    highlightMenu_tell('There is no readable text in that selection to read aloud.');
  }

  highlightMenu_dismiss();
}

/**
 * Handles Dictionary action
 */
function highlightMenu_handleDictionary() {
  highlightMenu_openDialog((text, range, returnFocus) => {
    if (window.assistFeatures?.dictionary?.lookup) {
      window.assistFeatures.dictionary.lookup(text, { returnFocus });
    } else {
      highlightMenu_tell(
        'The dictionary is not ready on this page yet. Reload the page and try again.'
      );
    }
  });
}

/**
 * Handles Translate action
 */
function highlightMenu_handleTranslate() {
  highlightMenu_openDialog((text, range, returnFocus) => {
    if (window.assistFeatures?.translationUI) {
      // No explicit language args: the dialog uses the pair the student last chose.
      window.assistFeatures.translationUI.openModal(text, null, null, { returnFocus });
    } else {
      highlightMenu_tell(
        'Translation is not ready on this page yet. Reload the page and try again.'
      );
    }
  });
}

/**
 * Handles Annotate action
 */
function highlightMenu_handleAnnotate() {
  highlightMenu_openDialog((text, range) => {
    if (!window.assistFeatures?.inlineAnnotations) {
      highlightMenu_tell(
        'Annotations are not ready on this page yet. Reload the page and try again.'
      );
      return;
    }

    const { openAnnotationModal, getPositionFromRange } = window.assistFeatures.inlineAnnotations;

    if (!range) {
      highlightMenu_tell('Select the text again to annotate it.');
      return;
    }

    // The dialog derives its own focus return from the range it is handed.
    openAnnotationModal(null, text, getPositionFromRange(range), range);
  });
}

/**
 * Handles Save Citation action — saves selected text + page metadata to citation manager
 */
function highlightMenu_handleSaveCitation() {
  highlightMenu_openDialog(text => {
    if (window.assistFeatures?.citation) {
      window.assistFeatures.citation.saveCitationFromCurrentPage(text).catch(err => {
        if (!err.message?.includes('cancelled')) {
          console.error('[HighlightMenu] Citation save error:', err);
        }
      });
    } else {
      highlightMenu_tell(
        'Citations are not ready on this page yet. Reload the page and try again.'
      );
    }
  });
}

/**
 * Handles Add to mind map — sends the selection to the service worker, which appends it to the
 * student's chosen map (or the Inbox) and answers with the map it landed in.
 *
 * The node text is the short label a branch can carry; the full selection travels alongside as the
 * quote, so the student can see the words they picked without the branch becoming a paragraph.
 * `captureFromSelection` shapes both — a selection off a page carries the page's line breaks, and
 * a label is one line.
 */
function highlightMenu_handleAddToMindMap() {
  const { text, quote } = captureFromSelection(highlightMenu_selectedText);

  chrome.runtime
    .sendMessage({
      type: 'MINDMAP_ADD_NODE',
      text,
      quote,
      url: location.href,
      title: document.title,
    })
    .then(response => {
      // Said in words, every time. The only sign it had worked used to be a console line,
      // and window.showToast is not there on every page the content script runs on.
      if (response?.success) {
        highlightMenu_tell(`Added to your mind map ${response.mapTitle || 'Inbox'}.`);
      } else {
        // response.error is the developer's message; the student gets a sentence.
        console.error('[HighlightMenu] Mind map add failed:', response?.error);
        highlightMenu_tell('Could not add that to a mind map. Try again.');
      }
    })
    .catch(error => {
      console.error('[HighlightMenu] Mind map add error:', error);
      highlightMenu_tell('Could not add that to a mind map. Try again.');
    });

  highlightMenu_dismiss();
}

/**
 * Handles Make a flashcard — turns the selected words into a spaced-repetition card.
 *
 * The text is taken before the menu goes away: dismissing it clears the page selection, so the
 * card builder is handed the words rather than left to read a selection that no longer exists.
 * The answer is said in words either way, because a card lands in storage with nothing on screen
 * to show for it.
 */
function highlightMenu_handleFlashcard() {
  const text = highlightMenu_selectedText;
  highlightMenu_dismiss();

  createCardFromSelection(text)
    .then(result => {
      highlightMenu_tell(
        result.created
          ? 'Card saved — it will come up for review.'
          : result.reason || 'Could not make a card from those words.'
      );
    })
    .catch(error => {
      console.error('[HighlightMenu] Flashcard create error:', error);
      highlightMenu_tell('Could not make a card from those words.');
    });
}

/**
 * Handles Summarize action (AI-powered summarization)
 */
function highlightMenu_handleSummarize() {
  // Check if summarization feature is available
  if (window.assistFeatures?.summarization) {
    // Get selection rectangle for positioning
    const rect = highlightMenu_selectionRange
      ? highlightMenu_selectionRange.getBoundingClientRect()
      : null;

    window.assistFeatures.summarization.start(highlightMenu_selectedText, rect);
  } else {
    highlightMenu_tell('Summarize is not ready on this page yet. Reload the page and try again.');
  }

  highlightMenu_dismiss();
}

/**
 * Handles Simplify action (AI-powered text simplification)
 */
function highlightMenu_handleSimplify() {
  // Check if text simplification feature is available
  if (window.assistFeatures?.textSimplification) {
    // Get selection rectangle for positioning
    const rect = highlightMenu_selectionRange
      ? highlightMenu_selectionRange.getBoundingClientRect()
      : null;

    window.assistFeatures.textSimplification.start(highlightMenu_selectedText, rect);
  } else {
    highlightMenu_tell(
      'Simplify Text is not ready on this page yet. Reload the page and try again.'
    );
  }

  highlightMenu_dismiss();
}

/**
 * Handles Breakdown action (AI-powered assignment breakdown)
 */
function highlightMenu_handleBreakdown() {
  // Check if assignment breakdown feature is available
  if (window.assistFeatures?.assignmentBreakdown) {
    // Get selection rectangle for positioning
    const rect = highlightMenu_selectionRange
      ? highlightMenu_selectionRange.getBoundingClientRect()
      : null;

    window.assistFeatures.assignmentBreakdown.start(highlightMenu_selectedText, rect);
  } else {
    highlightMenu_tell(
      'Assignment Breakdown is not ready on this page yet. Reload the page and try again.'
    );
  }

  highlightMenu_dismiss();
}

/**
 * Handles Socratic Tutor action (AI-powered questioning)
 */
function highlightMenu_handleSocraticTutor() {
  // Check if socratic tutor feature is available
  if (window.assistFeatures?.socraticTutor) {
    window.assistFeatures.socraticTutor.start(highlightMenu_selectedText);
  } else {
    highlightMenu_tell(
      'Socratic Tutor is not ready on this page yet. Reload the page and try again.'
    );
  }

  highlightMenu_dismiss();
}

/**
 * Handles Knowledge Graph action (concept visualization)
 */
function highlightMenu_handleKnowledgeGraph() {
  // Check if knowledge graph feature is available
  if (window.assistFeatures?.knowledgeGraph) {
    window.assistFeatures.knowledgeGraph.start(highlightMenu_selectedText);
  } else {
    highlightMenu_tell(
      'Knowledge Graph is not ready on this page yet. Reload the page and try again.'
    );
  }

  highlightMenu_dismiss();
}

/**
 * Handles Speed Read action (RSVP) - Calls new modular RSVP API
 */
function highlightMenu_handleSpeedRead() {
  // A full-screen modal, so it goes through openDialog like the others: the menu is taken down
  // first and the overlay is told where to put focus back, since this button will be gone.
  highlightMenu_openDialog((text, _range, returnFocus) => {
    if (window.assistFeatures?.rsvp) {
      window.assistFeatures.rsvp.start(text, { returnFocus });
    } else {
      highlightMenu_tell(
        'Speed Read is not ready on this page yet. Reload the page and try again.'
      );
    }
  });
}

/**
 * Handles Citation Analyzer action (AI source evaluation)
 */
function highlightMenu_handleCitationAnalyzer() {
  // Check if citation analyzer feature is available
  if (window.assistFeatures?.citationAnalyzer) {
    window.assistFeatures.citationAnalyzer.start(highlightMenu_selectedText);
  } else {
    highlightMenu_tell(
      'Citation Analyzer is not ready on this page yet. Reload the page and try again.'
    );
  }

  highlightMenu_dismiss();
}

/**
 * Handles Multi-Document Compare action (add selection to comparison)
 */
function highlightMenu_handleMultiDocCompare() {
  // Check if multi-doc compare feature is available
  if (window.assistFeatures?.multiDocCompare) {
    // Show panel with current selection added
    window.assistFeatures.multiDocCompare.show(highlightMenu_selectedText);
  } else {
    highlightMenu_tell(
      'Compare Documents is not ready on this page yet. Reload the page and try again.'
    );
  }

  highlightMenu_dismiss();
}

/**
 * Handles Study Path Generator action (generate learning path from content)
 */
function highlightMenu_handleStudyPath() {
  // Check if study path generator feature is available
  if (window.assistFeatures?.studyPathGenerator) {
    // Show panel and generate path from selected text
    window.assistFeatures.studyPathGenerator.show(highlightMenu_selectedText);
  } else {
    highlightMenu_tell('Study Path is not ready on this page yet. Reload the page and try again.');
  }

  highlightMenu_dismiss();
}

/**
 * Initializes the highlight menu feature
 */
function highlightMenu_init() {
  console.log('[HighlightMenu] Initializing...');

  // Add mouseup listener for text selection
  document.addEventListener('mouseup', highlightMenu_handleSelection);

  // Add keyboard navigation listener, and open the menu for keyboard selections
  document.addEventListener('keydown', highlightMenu_handleKeyboardNav);
  document.addEventListener('keyup', highlightMenu_handleKeyboardSelection);

  // Hide toolbar when clicking outside (bubble phase - runs AFTER button handlers)
  document.addEventListener('mousedown', e => {
    // A press that did not come from a menu button starts a fresh gesture, so any
    // suppression left over from a keyboard activation ends here.
    highlightMenu_suppressNextSelection = false;

    // Don't hide if clicking on the toolbar or its buttons
    // Note: If button handler called stopPropagation(), this won't run
    if (highlightMenu_toolbar && !highlightMenu_toolbar.contains(e.target)) {
      highlightMenu_hide();
    }
  });

  // Load settings from chrome.storage
  chrome.storage.local.get(
    [
      'highlightMenuSettings',
      'assist_settings',
      COMPANION_STORAGE_KEY,
      'aiMode',
      'llmEnabled',
      'cloudModeEnabled',
      'geminiEnabled',
      'webllmEnabled',
    ],
    result => {
      if (result.highlightMenuSettings) {
        Object.assign(highlightMenu_settings, result.highlightMenuSettings);
        console.log(
          '[HighlightMenu] Settings loaded:',
          Object.keys(highlightMenu_settings).join(', ')
        );
      }

      highlightMenu_settings.mindMapEnabled = result.assist_settings?.mindMap?.enabled !== false;
      // Companion toggles default ON, so an absent key is on — same reading as
      // companion-settings.js applies when it merges its defaults.
      highlightMenu_settings.flashcardsEnabled =
        result[COMPANION_STORAGE_KEY]?.flashcards !== false;

      // Derive AI enabled states from unified aiMode OR legacy flags
      // This ensures compatibility with both old and new storage patterns
      const aiMode = result.aiMode || 'off';

      // If aiMode is set, use it to determine legacy flags (new unified approach)
      // Otherwise fall back to explicit legacy flags (backwards compatibility)
      highlightMenu_settings.llmEnabled =
        aiMode === 'local' || (result.llmEnabled !== undefined ? result.llmEnabled : false);
      highlightMenu_settings.cloudModeEnabled =
        aiMode === 'cloud' ||
        (result.cloudModeEnabled !== undefined ? result.cloudModeEnabled : false);
      highlightMenu_settings.geminiEnabled =
        aiMode === 'gemini' || (result.geminiEnabled !== undefined ? result.geminiEnabled : false);
      highlightMenu_settings.webllmEnabled =
        aiMode === 'webllm' || (result.webllmEnabled !== undefined ? result.webllmEnabled : false);

      console.log(
        '[HighlightMenu] AI mode:',
        aiMode,
        'local:',
        highlightMenu_settings.llmEnabled,
        'cloud:',
        highlightMenu_settings.cloudModeEnabled,
        'gemini:',
        highlightMenu_settings.geminiEnabled
      );
    }
  );

  // Listen for settings updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.highlightMenuSettings) {
        Object.assign(highlightMenu_settings, changes.highlightMenuSettings.newValue);
        console.log(
          '[HighlightMenu] Settings updated:',
          Object.keys(highlightMenu_settings).join(', ')
        );
      }
      if (changes.assist_settings) {
        highlightMenu_settings.mindMapEnabled =
          changes.assist_settings.newValue?.mindMap?.enabled !== false;
        // Rebuilt on the next selection, so the item matches the switch straight away.
        if (highlightMenu_toolbar) {
          highlightMenu_hide();
        }
      }
      if (changes[COMPANION_STORAGE_KEY]) {
        highlightMenu_settings.flashcardsEnabled =
          changes[COMPANION_STORAGE_KEY].newValue?.flashcards !== false;
        // Rebuilt on the next selection, so the item matches the switch straight away.
        if (highlightMenu_toolbar) {
          highlightMenu_hide();
        }
      }
      if (changes.llmEnabled) {
        highlightMenu_settings.llmEnabled = changes.llmEnabled.newValue;
        console.log(
          '[HighlightMenu] Local AI enabled state updated:',
          highlightMenu_settings.llmEnabled
        );

        // Hide current toolbar so it gets recreated with new AI button visibility on next text selection
        if (highlightMenu_toolbar) {
          highlightMenu_hide();
        }
      }
      if (changes.cloudModeEnabled) {
        highlightMenu_settings.cloudModeEnabled = changes.cloudModeEnabled.newValue;
        console.log(
          '[HighlightMenu] Cloud AI enabled state updated:',
          highlightMenu_settings.cloudModeEnabled
        );

        // Hide current toolbar so it gets recreated with new AI button visibility on next text selection
        if (highlightMenu_toolbar) {
          highlightMenu_hide();
        }
      }

      // Listen for unified aiMode changes (new storage pattern)
      if (changes.aiMode) {
        const newMode = changes.aiMode.newValue;
        console.log('[HighlightMenu] AI mode changed to:', newMode);

        // Update legacy flags based on new unified mode
        highlightMenu_settings.llmEnabled = newMode === 'local';
        highlightMenu_settings.cloudModeEnabled = newMode === 'cloud';
        highlightMenu_settings.geminiEnabled = newMode === 'gemini';
        highlightMenu_settings.webllmEnabled = newMode === 'webllm';

        // Hide current toolbar so it gets recreated with new AI button visibility on next text selection
        if (highlightMenu_toolbar) {
          highlightMenu_hide();
        }
      }

      // Listen for individual geminiEnabled flag changes (legacy compatibility)
      if (changes.geminiEnabled) {
        highlightMenu_settings.geminiEnabled = changes.geminiEnabled.newValue;
        console.log(
          '[HighlightMenu] Gemini enabled state updated:',
          highlightMenu_settings.geminiEnabled
        );

        // Hide current toolbar so it gets recreated with new AI button visibility
        if (highlightMenu_toolbar) {
          highlightMenu_hide();
        }
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
    cleanup: highlightMenu_cleanup,
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
  document.removeEventListener('keyup', highlightMenu_handleKeyboardSelection);
}

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  highlightMenu_init();
}
