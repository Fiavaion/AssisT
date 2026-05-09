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
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';

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

    this.badge.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${isDarkMode ? '#1e2330' : 'rgba(255, 255, 255, 0.95)'};
      border: 2px solid ${isDarkMode ? '#3a4353' : '#4a90e2'};
      border-radius: 8px;
      padding: 12px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      color: ${isDarkMode ? '#e4e6eb' : '#333'};
      box-shadow: 0 4px 12px rgba(0, 0, 0, ${isDarkMode ? '0.5' : '0.15'});
      cursor: pointer;
      z-index: 999998;
      transition: all 0.3s ease;
      min-width: 200px;
      display: ${this.badgeVisible ? 'block' : 'none'};
    `;

    const titleColor = isDarkMode ? '#6b8dd6' : '#4a90e2';
    const secondaryColor = isDarkMode ? '#9ba3af' : '#666';
    const borderColor = isDarkMode ? '#3a4353' : '#e0e0e0';

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
            style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; width: 100%; font-weight: 600;"
          >⚡ Speed Read</button>
          <button
            id="assist-textstats-details"
            aria-label="View detailed statistics"
            style="background: ${titleColor}; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; width: 100%;"
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
    attachInteractiveHandler(closeBtn, 'TextStats Badge Close', () => {
      this.hideBadge();
    });

    // Speed Read button (on badge) - Calls new modular RSVP API
    const speedReadBadgeBtn = this.badge.querySelector('#assist-textstats-speed-read-badge');
    attachInteractiveHandler(speedReadBadgeBtn, 'TextStats Badge Speed Read', () => {
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
    attachInteractiveHandler(detailsBtn, 'TextStats View Details', () => {
      this.showModal();
    });

    document.body.appendChild(this.badge);
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
      z-index: 999999;
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
            <button id="assist-textstats-scope-page" class="scope-btn active" data-scope="page" style="flex: 1; padding: 8px; border: 2px solid #4a90e2; border-radius: 6px; background: #e3f2fd; cursor: pointer; font-size: 14px; color: #4a90e2; font-weight: 600;">
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
            <span id="assist-textstats-progress-percentage" style="font-weight: 600; color: #4a90e2;">0%</span>
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
            style="flex: 1; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;"
          >⚡ Speed Read</button>
          <button
            id="assist-textstats-refresh"
            style="flex: 1; padding: 12px; background: #4a90e2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;"
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

    attachInteractiveHandler(modalClose, 'TextStats Modal Close', () => this.hideModal());
    attachInteractiveHandler(modalDone, 'TextStats Modal Done', () => this.hideModal());

    // Click outside to close
    this.modal.addEventListener('click', e => {
      if (e.target === this.modal) {
        this.hideModal();
      }
    });

    // Scope buttons
    const scopeButtons = this.modal.querySelectorAll('.scope-btn');
    scopeButtons.forEach(btn => {
      attachInteractiveHandler(btn, `TextStats Scope: ${btn.dataset.scope}`, () => {
        this.currentScope = btn.dataset.scope;
        scopeButtons.forEach(b => {
          b.style.border = '2px solid #e0e0e0';
          b.style.background = 'white';
          b.style.color = '#333';
          b.style.fontWeight = 'normal';
        });
        btn.style.border = '2px solid #4a90e2';
        btn.style.background = '#e3f2fd';
        btn.style.color = '#4a90e2';
        btn.style.fontWeight = '600';
        this.updateStats();
      });
    });

    // Speed Read button (on modal) - Calls new modular RSVP API
    const speedReadBtn = this.modal.querySelector('#assist-textstats-speed-read');
    attachInteractiveHandler(speedReadBtn, 'TextStats Modal Speed Read', () => {
      const text = this.getTextForScope();

      if (window.assistFeatures?.rsvp) {
        window.assistFeatures.rsvp.start(text);
        this.hideModal();
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
    attachInteractiveHandler(refreshBtn, 'TextStats Refresh', () => this.updateStats());

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
   * Show modal
   */
  showModal() {
    if (this.modal) {
      this.modal.style.display = 'flex';
      this.updateStats();

      // Focus modal for accessibility
      const closeBtn = this.modal.querySelector('#assist-textstats-modal-close');
      if (closeBtn) {
        closeBtn.focus();
      }
    }
  }

  /**
   * Hide modal
   */
  hideModal() {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
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
   * Register keyboard shortcut (Ctrl+Shift+W)
   */
  registerKeyboardShortcut() {
    document.addEventListener('keydown', e => {
      // Ctrl+Shift+W or Cmd+Shift+W
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        this.showModal();
      }
    });
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
      this.badge.remove();
      this.badge = null;
    }
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
    clearTimeout(this.updateDebounceTimer);
    console.log('[TextStats UI] Destroyed');
  }
}

// Export singleton instance
export const textStatsUI = new TextStatsUI();

// ============================================================
// AUTO-INITIALIZATION
// ============================================================
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

    // Direct message listener - handles case where storage value hasn't changed
    // so chrome.storage.onChanged doesn't fire (e.g. minimize clutter pressed twice)
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === 'MINIMIZE_CLUTTER_UPDATE') {
        if (message.state) {
          textStatsUI?.hideBadge();
        } else {
          textStatsUI?.showBadge();
        }
      }
    });
  } catch (error) {
    console.error('[TextStats] Initialization error:', error);
  }
})();
