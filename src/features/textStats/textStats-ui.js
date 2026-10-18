/**
 * Text Statistics UI
 *
 * Provides floating badge and full stats modal for real-time text analysis.
 * Supports selected text, page content, and document-wide statistics.
 *
 * Features:
 * - Floating badge (bottom-right, toggle visibility)
 * - Full stats modal with detailed metrics
 * - Target word count progress bar
 * - Color coding (red/yellow/green)
 * - Keyboard shortcut (Ctrl+Shift+W)
 * - Auto-update on typing (debounced)
 * - WCAG 2.2 Level AA compliant
 *
 * @module textStatsUI
 */

import { textStatsEngine } from './textStats.js';
import { Z } from '../../utils/z-index.js';
import { placeInRail, releaseFromRail } from '../../utils/corner-slots.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { registerShortcut } from '../../utils/keyboard-shortcuts.js';
import { trapFocus } from '../../utils/focus-trap.js';

/**
 * The badge's own colours.
 *
 * Every one of these was picked by eye and overnight release testing measured what that costs: the
 * "Text Stats" heading came out at 3.28:1, "View Details" at 3.29:1, and "⚡ Speed Read" sat on a
 * gradient whose light end gave white text 3.66:1 - all three under the 4.5:1 that SC 1.4.3 asks of
 * text this size. The badge is injected into somebody else's page, so it cannot borrow a contrast
 * from the page's own palette: the ratios have to be a property of these values, which is what
 * tests/unit/textStats/badge-contrast.test.js grades them on. Any change here has to hold the
 * heading and both buttons at 4.5:1 on both the light and the dark badge, the gradient at its
 * lightest stop included.
 *
 * `ink` is the text laid on `accent` when accent is the background: a mid blue cannot carry white
 * text and also read as text on a near-black surface, so the dark badge uses a dark ink on its
 * accent rather than a second, darker accent.
 */
export const BADGE_COLORS = Object.freeze({
  light: Object.freeze({
    surface: 'rgba(255, 255, 255, 0.95)',
    opaqueSurface: '#ffffff',
    text: '#333333',
    secondary: '#666666',
    border: '#15589e',
    divider: '#e0e0e0',
    accent: '#15589e',
    ink: '#ffffff',
  }),
  dark: Object.freeze({
    surface: '#1e2330',
    opaqueSurface: '#1e2330',
    text: '#e4e6eb',
    secondary: '#9ba3af',
    border: '#3a4353',
    divider: '#3a4353',
    accent: '#6b8dd6',
    ink: '#0a1020',
  }),
  /** Both stops carry white text; the lighter one is what the ratio depends on. */
  speedReadGradient: Object.freeze(['#4c5bd4', '#764ba2']),
  speedReadInk: '#ffffff',
});

/**
 * Text Statistics UI Manager
 */
export class TextStatsUI {
  constructor() {
    this.badge = null;
    this.modal = null;
    this.enabled = false;
    this.badgeVisible = true;
    this.currentScope = 'page'; // 'selection', 'page', 'document'
    this.autoUpdate = true;
    this.updateDebounceTimer = null;
    this.lastAnalysis = null;
    // Set while the detailed-statistics dialog is open; calling it closes the focus trap and
    // hands the keyboard back to whatever opened the dialog.
    this.releaseModalFocus = null;
  }

  /**
   * Initialize the UI
   */
  async initialize(settings = {}) {
    this.enabled = settings.enabled !== false;
    this.badgeVisible = settings.badgeVisible !== false;
    this.autoUpdate = settings.autoUpdate !== false;

    if (this.enabled) {
      this.createBadge();
      this.createModal();
      this.attachEventListeners();
      this.registerKeyboardShortcut();

      console.log('[TextStats UI] Initialized', {
        enabled: this.enabled,
        badgeVisible: this.badgeVisible,
        autoUpdate: this.autoUpdate,
      });
    }
  }

  /**
   * Create floating badge
   */
  createBadge() {
    if (this.badge) {
      return;
    }

    this.badge = document.createElement('div');
    this.badge.id = 'assist-textstats-badge';
    this.badge.className = 'assist-textstats-badge';
    this.badge.setAttribute('role', 'status');
    this.badge.setAttribute('aria-live', 'polite');
    this.badge.setAttribute('aria-label', 'Text statistics');
    // Detect dark mode from document
    const isDarkMode =
      document.body.classList.contains('dark-mode') ||
      document.documentElement.classList.contains('dark-mode');

    // Placement comes from the shared corner rail below - see src/utils/corner-slots.js.
    // The badge is the base of the bottom-right rail; the companion cards stack above it
    // rather than over it, which is what used to happen.
    const palette = isDarkMode ? BADGE_COLORS.dark : BADGE_COLORS.light;

    this.badge.style.cssText = `
      background: ${palette.surface};
      border: 2px solid ${palette.border};
      border-radius: 8px;
      padding: 12px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      color: ${palette.text};
      box-shadow: 0 4px 12px rgba(0, 0, 0, ${isDarkMode ? '0.5' : '0.15'});
      cursor: pointer;
      z-index: ${Z.CONTROLS};
      transition: all 0.3s ease;
      min-width: 200px;
      display: ${this.badgeVisible ? 'block' : 'none'};
    `;

    const titleColor = palette.accent;
    const secondaryColor = palette.secondary;
    const borderColor = palette.divider;
    const [gradientFrom, gradientTo] = BADGE_COLORS.speedReadGradient;

    this.badge.innerHTML = sanitizeHTML(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="font-size: 13px; color: ${titleColor};">Text Stats</strong>
        <button
          id="assist-textstats-close"
          aria-label="Close statistics badge"
          style="background: none; border: none; cursor: pointer; font-size: 18px; color: ${secondaryColor}; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;"
        >×</button>
      </div>
      <div id="assist-textstats-content" style="line-height: 1.6;">
        <div style="margin-bottom: 4px;">
          <span style="color: ${secondaryColor};">Words:</span> <strong id="assist-textstats-words">0</strong>
        </div>
        <div style="margin-bottom: 4px;">
          <span style="color: ${secondaryColor};">Reading:</span> <strong id="assist-textstats-time">0 min</strong>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor}; display: flex; flex-direction: column; gap: 6px;">
          <button
            id="assist-textstats-speed-read-badge"
            aria-label="Speed read this text"
            style="background: linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%); color: ${BADGE_COLORS.speedReadInk}; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; width: 100%; font-weight: 600;"
          >⚡ Speed Read</button>
          <button
            id="assist-textstats-details"
            aria-label="View detailed statistics"
            style="background: ${palette.accent}; color: ${palette.ink}; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; width: 100%;"
          >View Details</button>
        </div>
      </div>
    `);

    // Add hover effect
    this.badge.addEventListener('mouseenter', () => {
      this.badge.style.transform = 'translateY(-2px)';
      this.badge.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
    });

    this.badge.addEventListener('mouseleave', () => {
      this.badge.style.transform = 'translateY(0)';
      this.badge.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    });

    // Close button
    const closeBtn = this.badge.querySelector('#assist-textstats-close');
    attachAccessibleHandler(closeBtn, 'TextStats Badge Close', () => {
      this.hideBadge();
    });

    // Speed Read button (on badge) - Calls new modular RSVP API
    const speedReadBadgeBtn = this.badge.querySelector('#assist-textstats-speed-read-badge');
    attachAccessibleHandler(speedReadBadgeBtn, 'TextStats Badge Speed Read', () => {
      const text = document.body.innerText || '';

      if (window.assistFeatures?.rsvp) {
        this.hideBadge(); // Hide badge before launching to avoid UI clutter
        window.assistFeatures.rsvp.start(text);
      } else {
        console.warn('[TextStats] RSVP feature not loaded');
        if (window.showToast) {
          window.showToast('Speed Read feature not available. Please reload the page.');
        } else {
          alert('Speed Read feature not available. Please reload the page.');
        }
      }
    });

    // Details button
    const detailsBtn = this.badge.querySelector('#assist-textstats-details');
    attachAccessibleHandler(detailsBtn, 'TextStats View Details', () => {
      this.showModal();
    });

    document.body.appendChild(this.badge);
    placeInRail(this.badge, 'text-stats-badge');
  }

  /**
   * Create full stats modal
   */
  createModal() {
    if (this.modal) {
      return;
    }

    this.modal = document.createElement('div');
    this.modal.id = 'assist-textstats-modal';
    this.modal.className = 'assist-textstats-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-labelledby', 'assist-textstats-modal-title');
    this.modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: ${Z.MODAL};
    `;

    this.modal.innerHTML = sanitizeHTML(`
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 id="assist-textstats-modal-title" style="margin: 0; font-size: 24px; color: #333;">Detailed Statistics</h2>
          <button
            id="assist-textstats-modal-close"
            aria-label="Close statistics modal"
            style="background: none; border: none; cursor: pointer; font-size: 28px; color: #666; padding: 0; width: 32px; height: 32px;"
          >×</button>
        </div>

        <!-- Scope Selector -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #666;">Analyze:</label>
          <div style="display: flex; gap: 8px;">
            <button id="assist-textstats-scope-selection" class="scope-btn" data-scope="selection" style="flex: 1; padding: 8px; border: 2px solid #e0e0e0; border-radius: 6px; background: white; cursor: pointer; font-size: 14px;">
              Selected Text
            </button>
            <button id="assist-textstats-scope-page" class="scope-btn active" data-scope="page" style="flex: 1; padding: 8px; border: 2px solid ${BADGE_COLORS.light.accent}; border-radius: 6px; background: #e3f2fd; cursor: pointer; font-size: 14px; color: ${BADGE_COLORS.light.accent}; font-weight: 600;">
              Current Page
            </button>
            <button id="assist-textstats-scope-document" class="scope-btn" data-scope="document" style="flex: 1; padding: 8px; border: 2px solid #e0e0e0; border-radius: 6px; background: white; cursor: pointer; font-size: 14px;">
              Full Document
            </button>
          </div>
        </div>

        <!-- Progress Bar (if target set) -->
        <div id="assist-textstats-progress-container" style="margin-bottom: 24px; display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 600; color: #666;">Target Progress</span>
            <span id="assist-textstats-progress-percentage" style="font-weight: 600; color: ${BADGE_COLORS.light.accent};">0%</span>
          </div>
          <div style="background: #e0e0e0; height: 12px; border-radius: 6px; overflow: hidden;">
            <div id="assist-textstats-progress-bar" style="height: 100%; width: 0%; background: #4caf50; transition: width 0.3s ease, background 0.3s ease;"></div>
          </div>
          <div id="assist-textstats-progress-text" style="margin-top: 6px; font-size: 13px; color: #666;"></div>
        </div>

        <!-- Statistics Grid -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px;">
          <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
            <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Words</div>
            <div id="assist-textstats-modal-words" style="font-size: 28px; font-weight: 700; color: #333;">0</div>
          </div>
          <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
            <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Characters</div>
            <div id="assist-textstats-modal-chars" style="font-size: 28px; font-weight: 700; color: #333;">0</div>
          </div>
          <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
            <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Sentences</div>
            <div id="assist-textstats-modal-sentences" style="font-size: 28px; font-weight: 700; color: #333;">0</div>
          </div>
          <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
            <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Paragraphs</div>
            <div id="assist-textstats-modal-paragraphs" style="font-size: 28px; font-weight: 700; color: #333;">0</div>
          </div>
          <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
            <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Reading Time</div>
            <div id="assist-textstats-modal-reading" style="font-size: 28px; font-weight: 700; color: #333;">0 min</div>
          </div>
          <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
            <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Unique Words</div>
            <div id="assist-textstats-modal-unique" style="font-size: 28px; font-weight: 700; color: #333;">0</div>
          </div>
        </div>

        <!-- Additional Metrics -->
        <div style="padding: 16px; background: #fafafa; border-radius: 8px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #666;">Characters (no spaces):</span>
            <strong id="assist-textstats-modal-chars-nospace">0</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #666;">Average word length:</span>
            <strong id="assist-textstats-modal-avg-word">0</strong>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <button
            id="assist-textstats-speed-read"
            style="flex: 1; padding: 12px; background: linear-gradient(135deg, ${BADGE_COLORS.speedReadGradient[0]} 0%, ${BADGE_COLORS.speedReadGradient[1]} 100%); color: ${BADGE_COLORS.speedReadInk}; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;"
          >⚡ Speed Read</button>
          <button
            id="assist-textstats-refresh"
            style="flex: 1; padding: 12px; background: ${BADGE_COLORS.light.accent}; color: ${BADGE_COLORS.light.ink}; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;"
          >Refresh Stats</button>
        </div>
        <div style="display: flex; gap: 12px;">
          <button
            id="assist-textstats-modal-done"
            style="flex: 1; padding: 12px; background: #e0e0e0; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;"
          >Done</button>
        </div>
      </div>
    `);

    // Modal close handlers
    const modalClose = this.modal.querySelector('#assist-textstats-modal-close');
    const modalDone = this.modal.querySelector('#assist-textstats-modal-done');

    attachAccessibleHandler(modalClose, 'TextStats Modal Close', () => this.hideModal());
    attachAccessibleHandler(modalDone, 'TextStats Modal Done', () => this.hideModal());

    // A press on the backdrop dismisses. Deliberately a plain mousedown listener and not
    // attachInteractiveHandler: that helper calls preventDefault() and stopPropagation() for every
    // press anywhere inside the overlay, which would cancel text selection in the statistics panel.
    // The target check keeps a press on the panel itself from closing the dialog.
    this.modal.addEventListener('mousedown', e => {
      if (e.target === this.modal) {
        this.hideModal();
      }
    });

    // Scope buttons
    const scopeButtons = this.modal.querySelectorAll('.scope-btn');
    scopeButtons.forEach(btn => {
      attachAccessibleHandler(btn, `TextStats Scope: ${btn.dataset.scope}`, () => {
        this.currentScope = btn.dataset.scope;
        scopeButtons.forEach(b => {
          b.style.border = '2px solid #e0e0e0';
          b.style.background = 'white';
          b.style.color = '#333';
          b.style.fontWeight = 'normal';
        });
        btn.style.border = `2px solid ${BADGE_COLORS.light.accent}`;
        btn.style.background = '#e3f2fd';
        btn.style.color = BADGE_COLORS.light.accent;
        btn.style.fontWeight = '600';
        this.updateStats();
      });
    });

    // Speed Read button (on modal) - Calls new modular RSVP API
    const speedReadBtn = this.modal.querySelector('#assist-textstats-speed-read');
    attachAccessibleHandler(speedReadBtn, 'TextStats Modal Speed Read', () => {
      const text = this.getTextForScope();

      if (window.assistFeatures?.rsvp) {
        // Close first: hideModal hands the keyboard back to the badge, and doing that after the
        // reader has opened would pull focus straight back out of it.
        this.hideModal();
        window.assistFeatures.rsvp.start(text);
      } else {
        console.warn('[TextStats] RSVP feature not loaded');
        if (window.showToast) {
          window.showToast('Speed Read feature not available. Please reload the page.');
        } else {
          alert('Speed Read feature not available. Please reload the page.');
        }
      }
    });

    // Refresh button
    const refreshBtn = this.modal.querySelector('#assist-textstats-refresh');
    attachAccessibleHandler(refreshBtn, 'TextStats Refresh', () => this.updateStats());

    document.body.appendChild(this.modal);
  }

  /**
   * Get text based on current scope
   */
  getTextForScope() {
    switch (this.currentScope) {
      case 'selection':
        return window.getSelection().toString();

      case 'page':
        // Get visible page content
        return document.body.innerText || '';

      case 'document':
        // Get entire document including iframes
        return this.getDocumentText();

      default:
        return document.body.innerText || '';
    }
  }

  /**
   * Get full document text (including iframes)
   */
  getDocumentText() {
    let text = document.body.innerText || '';

    // Try to get iframe content
    try {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc && iframeDoc.body) {
            text += '\n' + iframeDoc.body.innerText;
          }
        } catch {
          // Cross-origin iframe, skip
          console.log('[TextStats] Skipping cross-origin iframe');
        }
      });
    } catch {
      console.warn('[TextStats] Could not access iframe content');
    }

    return text;
  }

  /**
   * Update statistics display
   */
  updateStats() {
    const text = this.getTextForScope();
    const stats = textStatsEngine.analyzeText(text);
    this.lastAnalysis = stats;

    // Update badge
    if (this.badge) {
      const wordsEl = this.badge.querySelector('#assist-textstats-words');
      const timeEl = this.badge.querySelector('#assist-textstats-time');
      if (wordsEl) {
        wordsEl.textContent = stats.words.toLocaleString();
      }
      if (timeEl) {
        timeEl.textContent = `${stats.readingTime} min`;
      }
    }

    // Update modal if visible
    if (this.modal && this.modal.style.display !== 'none') {
      this.updateModalStats(stats);
    }

    console.log('[TextStats] Stats updated', { scope: this.currentScope, stats });
  }

  /**
   * Update modal with detailed statistics
   */
  updateModalStats(stats) {
    // Update stat values
    document.getElementById('assist-textstats-modal-words').textContent =
      stats.words.toLocaleString();
    document.getElementById('assist-textstats-modal-chars').textContent =
      stats.characters.toLocaleString();
    document.getElementById('assist-textstats-modal-sentences').textContent =
      stats.sentences.toLocaleString();
    document.getElementById('assist-textstats-modal-paragraphs').textContent =
      stats.paragraphs.toLocaleString();
    document.getElementById('assist-textstats-modal-reading').textContent =
      `${stats.readingTime} min`;
    document.getElementById('assist-textstats-modal-unique').textContent =
      stats.uniqueWords.toLocaleString();
    document.getElementById('assist-textstats-modal-chars-nospace').textContent =
      stats.charactersNoSpaces.toLocaleString();
    document.getElementById('assist-textstats-modal-avg-word').textContent =
      stats.averageWordLength;

    // Update progress bar if target is set
    const progress = textStatsEngine.calculateProgress(stats.words);
    const progressContainer = document.getElementById('assist-textstats-progress-container');

    if (textStatsEngine.targetWordCount > 0) {
      progressContainer.style.display = 'block';

      const progressBar = document.getElementById('assist-textstats-progress-bar');
      const progressPercentage = document.getElementById('assist-textstats-progress-percentage');
      const progressText = document.getElementById('assist-textstats-progress-text');

      progressPercentage.textContent = `${progress.percentage}%`;
      progressBar.style.width = `${progress.percentage}%`;

      // Color coding based on status
      if (progress.status === 'over') {
        progressBar.style.background = '#ff9800'; // Orange
        progressText.textContent = `${Math.abs(progress.remaining)} words over target`;
        progressText.style.color = '#ff9800';
      } else if (progress.status === 'target') {
        progressBar.style.background = '#4caf50'; // Green
        progressText.textContent = 'Target reached!';
        progressText.style.color = '#4caf50';
      } else {
        progressBar.style.background = progress.percentage > 50 ? '#2196f3' : '#f44336'; // Blue or Red
        progressText.textContent = `${progress.remaining} words remaining`;
        progressText.style.color = '#666';
      }
    } else {
      progressContainer.style.display = 'none';
    }
  }

  /**
   * Show floating badge
   */
  showBadge() {
    if (this.badge) {
      this.badge.style.display = 'block';
      this.badgeVisible = true;
      // Retake the base of the rail, so anything stacked above it moves up to make room.
      placeInRail(this.badge, 'text-stats-badge');
      this.updateStats();
    }
  }

  /**
   * Hide floating badge
   */
  hideBadge() {
    if (this.badge) {
      this.badge.style.display = 'none';
      this.badgeVisible = false;
      // A hidden control holds no space; the rail closes up behind it.
      placeInRail(this.badge, 'text-stats-badge');
    }
  }

  /**
   * Toggle badge visibility
   */
  toggleBadge() {
    if (this.badgeVisible) {
      this.hideBadge();
    } else {
      this.showBadge();
    }
  }

  /**
   * Show modal.
   *
   * The overlay covers the whole viewport, so a dialog that cannot be dismissed with the keyboard
   * is a keyboard trap that also blocks every click on the page behind it (SC 2.1.2) — which is
   * exactly how this shipped. trapFocus supplies the Escape route, the Tab containment and the
   * focus restore; the same helper the citation, OCR, annotation and popup dialogs use.
   */
  showModal() {
    if (!this.modal) {
      return;
    }

    // Already open (the keyboard shortcut works whether or not the dialog is up): refresh the
    // figures rather than laying a second focus trap over the first.
    if (this.releaseModalFocus) {
      this.updateStats();
      return;
    }

    this.modal.style.display = 'flex';
    this.updateStats();

    this.releaseModalFocus = trapFocus(this.modal, {
      onEscape: () => this.hideModal(),
      initialFocus: this.modal.querySelector('#assist-textstats-modal-close'),
    });
  }

  /**
   * Hide modal and hand the keyboard back to the control that opened it.
   */
  hideModal() {
    if (!this.modal) {
      return;
    }

    this.modal.style.display = 'none';

    const release = this.releaseModalFocus;
    this.releaseModalFocus = null;
    if (release) {
      release();
    }
    this.returnFocusToBadge();
  }

  /**
   * Put the keyboard back on the badge's "View Details" button, whichever way the dialog was opened.
   *
   * trapFocus hands focus back to whatever held it when the dialog opened, and after a mouse press
   * that is nothing: the shared event helper calls preventDefault() on mousedown, which is exactly
   * what cancels the browser's own focus-on-press, so the trigger never held focus and the restore
   * left the keyboard on BODY - the student was returned to the top of the page (SC 2.4.3). Real
   * Chrome showed it; jsdom cannot, because it does not focus on a press in the first place.
   *
   * The button is looked up now rather than remembered: the badge rewrites its own markup as the
   * figures change, so a reference taken when the dialog opened can be a detached node.
   */
  returnFocusToBadge() {
    if (!this.badge || this.badge.style.display === 'none') {
      // The badge went with the dialog - Speed Read hides it - so whatever opens next takes the
      // keyboard; pulling focus onto something off screen would be worse than leaving it.
      return;
    }
    const target = this.badge.querySelector('#assist-textstats-details') || this.badge;
    if (target === this.badge && !this.badge.hasAttribute('tabindex')) {
      // The badge is a status region, not a control: focusable for this hand-back only, never in
      // the tab order.
      this.badge.setAttribute('tabindex', '-1');
    }
    target.focus();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Text selection events
    document.addEventListener('selectionchange', () => {
      if (this.autoUpdate && this.currentScope === 'selection') {
        this.debouncedUpdate();
      }
    });

    // Typing events (debounced)
    document.addEventListener('input', () => {
      if (this.autoUpdate) {
        this.debouncedUpdate();
      }
    });

    // Page load complete
    if (document.readyState === 'complete') {
      this.updateStats();
    } else {
      window.addEventListener('load', () => this.updateStats());
    }
  }

  /**
   * Debounced update (500ms delay)
   */
  debouncedUpdate() {
    clearTimeout(this.updateDebounceTimer);
    this.updateDebounceTimer = setTimeout(() => {
      this.updateStats();
    }, 500);
  }

  /**
   * Register keyboard shortcut via the centralized shortcuts manager
   */
  registerKeyboardShortcut() {
    registerShortcut('text_stats_toggle', () => this.showModal());
  }

  /**
   * Enable UI
   */
  enable() {
    this.enabled = true;
    if (!this.badge) {
      this.createBadge();
      this.createModal();
      this.attachEventListeners();
      this.registerKeyboardShortcut();
    }
    this.showBadge();
    console.log('[TextStats UI] Enabled');
  }

  /**
   * Disable UI
   */
  disable() {
    this.enabled = false;
    this.hideBadge();
    this.hideModal();
    console.log('[TextStats UI] Disabled');
  }

  /**
   * Destroy UI (remove from DOM)
   */
  destroy() {
    if (this.badge) {
      releaseFromRail('text-stats-badge');
      this.badge.remove();
      this.badge = null;
    }
    if (this.modal) {
      // Release the trap before the node goes: otherwise the keyboard is left on a detached
      // element and never returns to the page.
      this.hideModal();
      this.modal.remove();
      this.modal = null;
    }
    clearTimeout(this.updateDebounceTimer);
    console.log('[TextStats UI] Destroyed');
  }
}

// Export singleton instance
export const textStatsUI = new TextStatsUI();

// Initialize on page load
(async function initializeTextStatsModule() {
  try {
    // Load settings from Chrome storage
    const settings = await chrome.storage.local.get([
      'textStats',
      'textStatsTargetWordCount',
      'textStatsReadingSpeed',
      'textStatsBadgeVisible',
      'textStatsAutoUpdate',
    ]);

    const textStatsSettings = {
      enabled: settings.textStats?.enabled !== false,
      targetWordCount: settings.textStatsTargetWordCount || 0,
      readingSpeed: settings.textStatsReadingSpeed || 225,
      badgeVisible: settings.textStatsBadgeVisible === true,
      autoUpdate: settings.textStatsAutoUpdate !== false,
    };

    // Initialize text stats engine
    await textStatsEngine.initialize(textStatsSettings);

    // Initialize UI if enabled
    if (textStatsSettings.enabled) {
      await textStatsUI.initialize(textStatsSettings);
      console.log('[TextStats] Module initialized successfully');
    }

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      if (changes.textStats?.newValue) {
        const enabled = changes.textStats.newValue.enabled;
        if (enabled) {
          textStatsUI.enable();
        } else {
          textStatsUI.disable();
        }
      }

      if (changes.textStatsTargetWordCount) {
        textStatsEngine.setTargetWordCount(changes.textStatsTargetWordCount.newValue || 0);
      }

      if (changes.textStatsReadingSpeed) {
        textStatsEngine.setReadingSpeed(changes.textStatsReadingSpeed.newValue || 225);
      }

      if (changes.textStatsBadgeVisible?.newValue !== undefined) {
        if (changes.textStatsBadgeVisible.newValue) {
          textStatsUI.showBadge();
        } else {
          textStatsUI.hideBadge();
        }
      }
    });
  } catch (error) {
    console.error('[TextStats] Initialization error:', error);
  }
})();
