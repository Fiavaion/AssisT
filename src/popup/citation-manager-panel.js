/**
 * @fileoverview Citation Manager Panel for Popup UI
 * @module popup/citation-manager-panel
 * @version 1.0.0
 *
 * Provides an expanded citation management panel directly in the popup
 * with search, filters, view switching, and quick actions.
 *
 * Features:
 * - View switcher (All/Projects/Recent)
 * - Search bar with filters
 * - Gallery/List view toggle
 * - Quick citation preview cards
 * - Keyboard navigation (WCAG 2.2 compliant)
 *
 * @see Feature 11.6: Citation UI Design
 */

import { MESSAGE_TYPES } from '../config/constants.js';
import { sanitizeHTML } from '../utils/sanitize.js';
import {
  attachAccessibleHandler,
  attachAccessibleDelegatedHandler,
} from '../utils/event-handlers.js';
import { normalizeCitation } from '../features/citations/citation-types.js';
import { formatReference, referenceSetFor } from '../features/citations/citation-styles/index.js';

/** The local, decorative icon a card shows when its citation holds none of its own. */
const GENERIC_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📄</text></svg>'
  );

let panelSequence = 0;

/**
 * Citation Manager Panel Component
 * Renders an inline citation management interface in the popup
 */
export class CitationManagerPanel {
  /**
   * @param {HTMLElement} container - Container element to render panel
   * @param {Object} options - Configuration options
   * @param {Function} options.onStatusUpdate - Callback for status updates
   * @param {Object} options.currentTab - Current browser tab
   */
  constructor(container, options = {}) {
    this.container = container;
    this.onStatusUpdate = options.onStatusUpdate || (() => {});
    this.currentTab = options.currentTab;

    // State
    this.citations = [];
    this.projects = [];
    this.filteredCitations = [];
    this.currentView = 'all'; // 'all' | 'projects' | 'recent'
    this.displayMode = 'list'; // 'list' | 'gallery'
    this.searchQuery = '';
    this.selectedProject = null;
    this.isLoading = false;
    this.isExpanded = false;
    this.loadError = false;

    // Keyboard navigation
    this.focusedIndex = -1;

    // Removes the citation list's delegated handler; the list is re-rendered often and
    // the container element survives, so the old listener has to go before the new one
    // is attached or one Copy would fire once per render.
    this.listCleanup = null;

    // Ids tie the view tabs to their tabpanel; unique per panel instance.
    this.idPrefix = `citation-panel-${++panelSequence}`;
  }

  /**
   * Initialize the panel
   */
  async initialize() {
    this.render();
    this.attachEventListeners();
    await this.loadCitations();
  }

  /**
   * Load citations from content script via background
   */
  async loadCitations() {
    if (!this.currentTab) {
      return;
    }

    this.isLoading = true;
    this.updateLoadingState();

    try {
      // Request citations from content script
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'GET_CITATIONS',
      });

      if (response && response.success) {
        this.loadError = false;
        this.citations = (response.citations || []).map(normalizeCitation);
        this.projects = response.projects || [];
        this.applyFilters();
        this.renderCitationList();
        this.updateStats();
      } else {
        console.log('[CitationPanel] No citations response, initializing empty');
        this.loadError = false;
        this.citations = [];
        this.projects = [];
        this.renderEmptyState();
      }
    } catch (error) {
      console.log('[CitationPanel] Failed to load citations:', error.message);
      this.loadError = true;
      this.citations = [];
      this.projects = [];
      this.renderEmptyState();
    } finally {
      this.isLoading = false;
      this.updateLoadingState();
    }
  }

  /**
   * Apply search and filter criteria to citations
   */
  applyFilters() {
    // The focused position indexes the list about to be replaced, so it means nothing
    // once the filter changes: index 3 of six citations is nothing at all once a search
    // leaves one. Every render path runs through here, so resetting it here is what keeps
    // the roving tab stop on a card that exists.
    this.focusedIndex = -1;

    let filtered = [...this.citations];

    // Filter by view
    switch (this.currentView) {
      case 'recent': {
        // Last 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        filtered = filtered.filter(c => new Date(c.createdAt).getTime() > weekAgo);
        // Sort by date descending
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      }

      case 'projects': {
        if (this.selectedProject) {
          filtered = filtered.filter(
            c => c.projectId === this.selectedProject || c.projects?.includes(this.selectedProject)
          );
        }
        break;
      }

      default:
        // 'all' - no additional filtering
        break;
    }

    // Apply search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.title?.toLowerCase().includes(query) ||
          c.authors?.some(a => a.toLowerCase().includes(query)) ||
          c.tags?.some(t => t.toLowerCase().includes(query)) ||
          c.url?.toLowerCase().includes(query)
      );
    }

    this.filteredCitations = filtered;
  }

  /**
   * Render the main panel structure
   */
  render() {
    const id = this.idPrefix;
    this.container.innerHTML = sanitizeHTML(`
      <div class="citation-panel" role="region" aria-label="Citation Manager">
        <!-- Panel Header with View Switcher -->
        <div class="citation-panel-header">
          <div class="citation-view-tabs" role="tablist" aria-label="Citation views">
            <button class="view-tab active" id="${id}-tab-all" data-view="all" role="tab"
                    aria-selected="true" aria-controls="${id}-tabpanel" tabindex="0">
              All
            </button>
            <button class="view-tab" id="${id}-tab-projects" data-view="projects" role="tab"
                    aria-selected="false" aria-controls="${id}-tabpanel" tabindex="-1">
              Projects
            </button>
            <button class="view-tab" id="${id}-tab-recent" data-view="recent" role="tab"
                    aria-selected="false" aria-controls="${id}-tabpanel" tabindex="-1">
              Recent
            </button>
          </div>
          <div class="citation-display-toggle" role="group" aria-label="Display mode">
            <button class="display-btn active" data-mode="list" title="List view" aria-pressed="true">
              <span aria-hidden="true">☰</span>
            </button>
            <button class="display-btn" data-mode="gallery" title="Gallery view" aria-pressed="false">
              <span aria-hidden="true">⊞</span>
            </button>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="citation-search-bar">
          <input
            type="search"
            class="citation-search-input"
            placeholder="Search citations..."
            aria-label="Search citations"
          />
          <button class="citation-filter-btn" title="Filter options" aria-haspopup="true">
            <span aria-hidden="true">▼</span>
          </button>
        </div>

        <div class="citation-tabpanel" id="${id}-tabpanel" role="tabpanel"
             aria-labelledby="${id}-tab-all">
          <!-- Project Selector (shown when Projects view active) -->
          <div class="citation-project-selector hidden">
            <select class="project-select" aria-label="Select project">
              <option value="">All Projects</option>
            </select>
          </div>

          <!-- Stats Bar -->
          <div class="citation-stats-bar">
            <span class="citation-count">0 citations</span>
            <span class="citation-page-indicator"></span>
          </div>

          <!-- The list is NOT a live region: it is rebuilt on every keystroke, and a live list
               would be read out whole each time. Only the count summary is announced. -->
          <div class="citation-list-status" role="status"></div>

          <!-- Citation List -->
          <div class="citation-list-container">
            <div class="citation-list"></div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="citation-quick-actions">
          <button class="quick-action-btn" data-command="save" data-action="save" title="Save current page">
            <span aria-hidden="true">💾</span> Save Page
          </button>
          <button class="quick-action-btn" data-command="library" title="Open full library">
            <span aria-hidden="true">📚</span> Library
          </button>
        </div>
      </div>
    `);

    this.injectStyles();
  }

  /**
   * Inject component styles
   */
  injectStyles() {
    if (document.getElementById('citation-panel-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'citation-panel-styles';
    style.textContent = `
      .citation-panel {
        background: #fff;
        border-radius: 8px;
        margin-top: 8px;
        border: 1px solid #e0e0e0;
        overflow: hidden;
      }

      .citation-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        border-bottom: 1px solid #c77d05;
      }

      .citation-view-tabs {
        display: flex;
        gap: 2px;
        background: rgba(0,0,0,0.1);
        border-radius: 6px;
        padding: 2px;
      }

      .view-tab {
        background: transparent;
        border: none;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 500;
        color: rgba(255,255,255,0.8);
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s;
      }

      .view-tab:hover {
        color: #fff;
        background: rgba(255,255,255,0.1);
      }

      .view-tab.active {
        background: #fff;
        color: #d97706;
      }

      .view-tab:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
      }

      .citation-display-toggle {
        display: flex;
        gap: 4px;
      }

      .display-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        width: 26px;
        height: 26px;
        border-radius: 4px;
        cursor: pointer;
        color: #fff;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .display-btn:hover {
        background: rgba(255,255,255,0.3);
      }

      .display-btn.active {
        background: #fff;
        color: #d97706;
      }

      .display-btn:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
      }

      .citation-search-bar {
        display: flex;
        padding: 8px;
        gap: 6px;
        background: #f9f9f9;
        border-bottom: 1px solid #e0e0e0;
      }

      .citation-search-input {
        flex: 1;
        padding: 6px 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
        outline: none;
        transition: border-color 0.2s;
      }

      .citation-search-input:focus {
        border-color: #f59e0b;
        box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
      }

      .citation-filter-btn {
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 0 10px;
        cursor: pointer;
        font-size: 10px;
        color: #666;
        transition: all 0.2s;
      }

      .citation-filter-btn:hover {
        background: #f5f5f5;
        border-color: #ccc;
      }

      .citation-project-selector {
        padding: 8px;
        background: #fffbeb;
        border-bottom: 1px solid #fcd34d;
      }

      .citation-project-selector.hidden {
        display: none;
      }

      .project-select {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #fcd34d;
        border-radius: 4px;
        font-size: 12px;
        background: #fff;
        cursor: pointer;
      }

      .citation-stats-bar {
        display: flex;
        justify-content: space-between;
        padding: 6px 10px;
        font-size: 11px;
        color: #666;
        background: #f5f5f5;
        border-bottom: 1px solid #e0e0e0;
      }

      .citation-count {
        font-weight: 600;
      }

      .citation-page-indicator {
        color: #999;
      }

      .citation-list-container {
        max-height: 200px;
        overflow-y: auto;
        background: #fff;
      }

      .citation-list {
        padding: 4px;
      }

      /* Visually hidden, still read by screen readers. */
      .citation-list-status {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .citation-list.gallery {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
        padding: 8px;
      }

      /* List View Card */
      .citation-card {
        display: flex;
        gap: 8px;
        padding: 8px;
        background: #fff;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        margin-bottom: 4px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .citation-card:hover {
        border-color: #f59e0b;
        background: #fffbeb;
      }

      .citation-open:focus-visible {
        outline: 2px solid #f59e0b;
        outline-offset: 2px;
      }

      .citation-card.focused {
        border-color: #f59e0b;
        background: #fef3c7;
      }

      .citation-favicon {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        flex-shrink: 0;
        background: #f0f0f0;
        object-fit: cover;
      }

      .citation-info {
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }

      /* The card's open control is a real button; it looks like the card text it always was. */
      .citation-open {
        background: none;
        border: 0;
        padding: 0;
        margin: 0;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .citation-open .citation-title,
      .citation-open .citation-meta {
        display: block;
      }

      .citation-title {
        font-size: 12px;
        font-weight: 500;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
      }

      .citation-meta {
        font-size: 10px;
        color: #888;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .citation-actions {
        display: flex;
        gap: 4px;
        align-items: center;
      }

      .citation-action-btn {
        background: none;
        border: none;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        color: #666;
      }

      .citation-action-btn:hover {
        background: rgba(245, 158, 11, 0.1);
        color: #d97706;
      }

      /* Gallery View Card */
      .citation-list.gallery .citation-card {
        flex-direction: column;
        padding: 10px;
        margin-bottom: 0;
      }

      .citation-list.gallery .citation-favicon {
        width: 100%;
        height: 60px;
        border-radius: 4px;
        object-fit: cover;
      }

      .citation-list.gallery .citation-info {
        margin-top: 6px;
      }

      .citation-list.gallery .citation-title {
        font-size: 11px;
        white-space: normal;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .citation-list.gallery .citation-actions {
        margin-top: 6px;
        justify-content: center;
      }

      /* Empty State */
      .citation-empty-state {
        padding: 24px;
        text-align: center;
        color: #999;
      }

      .citation-empty-icon {
        font-size: 32px;
        margin-bottom: 8px;
        opacity: 0.5;
      }

      .citation-empty-text {
        font-size: 12px;
        margin-bottom: 12px;
      }

      .citation-empty-action {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: #fff;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: transform 0.2s;
      }

      .citation-empty-action:hover {
        transform: translateY(-1px);
      }

      /* Loading State */
      .citation-loading {
        padding: 24px;
        text-align: center;
      }

      .citation-loading-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid #f0f0f0;
        border-top-color: #f59e0b;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 8px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Quick Actions */
      .citation-quick-actions {
        display: flex;
        gap: 6px;
        padding: 8px;
        background: #f9f9f9;
        border-top: 1px solid #e0e0e0;
      }

      .quick-action-btn {
        flex: 1;
        background: #fff;
        border: 1px solid #ddd;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.2s;
        color: #555;
      }

      .quick-action-btn:hover {
        background: #f5f5f5;
        border-color: #ccc;
      }

      .quick-action-btn:focus-visible {
        outline: 2px solid #f59e0b;
        outline-offset: 2px;
      }

      /* High Contrast Support */
      @media (prefers-contrast: high) {
        .citation-card {
          border-width: 2px;
        }

        .citation-open:focus-visible {
          outline-width: 3px;
        }

        .view-tab.active {
          font-weight: 700;
        }
      }

      /* Reduced Motion Support */
      @media (prefers-reduced-motion: reduce) {
        .citation-loading-spinner {
          animation: none;
        }

        .citation-card,
        .view-tab,
        .display-btn,
        .quick-action-btn {
          transition: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // View tabs
    const viewTabs = this.container.querySelectorAll('.view-tab');
    viewTabs.forEach(tab => {
      attachAccessibleHandler(tab, 'View Tab', e => {
        this.setView(e.currentTarget.dataset.view);
      });

      tab.addEventListener('keydown', e => {
        this.handleTabKeyNav(e, viewTabs);
      });
    });

    // Display mode toggle
    const displayBtns = this.container.querySelectorAll('.display-btn');
    displayBtns.forEach(btn => {
      attachAccessibleHandler(btn, 'Display Mode Button', e => {
        this.setDisplayMode(e.currentTarget.dataset.mode);
      });
    });

    // Search input
    const searchInput = this.container.querySelector('.citation-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        this.searchQuery = e.target.value;
        this.applyFilters();
        this.renderCitationList();
      });

      searchInput.addEventListener('keydown', e => {
        // Escape clears a search first. With nothing typed it is left to reach the Quick View
        // dialog, which it closes.
        if (e.key === 'Escape' && e.target.value !== '') {
          e.preventDefault();
          e.stopPropagation();
          e.target.value = '';
          this.searchQuery = '';
          this.applyFilters();
          this.renderCitationList();
        }
      });
    }

    // Project selector
    const projectSelect = this.container.querySelector('.project-select');
    if (projectSelect) {
      projectSelect.addEventListener('change', e => {
        this.selectedProject = e.target.value || null;
        this.applyFilters();
        this.renderCitationList();
      });
    }

    // Quick action buttons
    const quickActions = this.container.querySelectorAll('.quick-action-btn');
    quickActions.forEach(btn => {
      attachAccessibleHandler(btn, 'Quick Action Button', () => {
        this.handleQuickAction(btn.dataset.command);
      });
    });

    // Keyboard navigation for citation list
    const listContainer = this.container.querySelector('.citation-list-container');
    if (listContainer) {
      listContainer.addEventListener('keydown', e => {
        this.handleListKeyNav(e);
      });
    }
  }

  /**
   * Handle tab key navigation for view tabs (WCAG compliance)
   */
  handleTabKeyNav(e, tabs) {
    const tabsArray = Array.from(tabs);
    const currentIndex = tabsArray.indexOf(e.target);

    let newIndex;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = (currentIndex + 1) % tabsArray.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = (currentIndex - 1 + tabsArray.length) % tabsArray.length;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = tabsArray.length - 1;
        break;
      default:
        return;
    }

    tabsArray[newIndex].focus();
    this.setView(tabsArray[newIndex].dataset.view);
  }

  /**
   * Handle keyboard navigation for citation list
   */
  handleListKeyNav(e) {
    const cards = Array.from(this.container.querySelectorAll('.citation-open'));
    if (cards.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.focusedIndex = Math.min(this.focusedIndex + 1, cards.length - 1);
        this.updateFocusedCard(cards);
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
        this.updateFocusedCard(cards);
        break;

      // Enter and Space are deliberately absent: the list's own delegated handler
      // activates whatever is focused — a card, or an action button inside one — so the
      // keyboard runs the same code the mouse does and reaches the button too. Handling
      // them here as well would open the card behind a Copy press.

      case 'Home':
        e.preventDefault();
        this.focusedIndex = 0;
        this.updateFocusedCard(cards);
        break;

      case 'End':
        e.preventDefault();
        this.focusedIndex = cards.length - 1;
        this.updateFocusedCard(cards);
        break;
    }
  }

  /**
   * Index of the one card that sits in the tab order, given how many are rendered.
   *
   * Bounded at both ends, because focusedIndex runs off both. It is -1 until an arrow key
   * moves it and is reset to -1 by applyFilters(), so without the lower bound NO card
   * would be tabbable at first render or after any filter change, and Tab would skip the
   * list and stop only on the Copy and Open buttons inside it. The upper bound matters
   * because the rendered list is capped at 20 and shrinks under a search: a stale index
   * past the end would leave no card tabbable either. A roving tab stop needs exactly one
   * entry point, and it has to be a card that exists.
   *
   * @param {number} count - Number of cards actually rendered
   * @returns {number} Index of the tabbable card
   */
  tabbableIndex(count) {
    if (count <= 0) {
      return -1;
    }
    return Math.min(Math.max(this.focusedIndex, 0), count - 1);
  }

  /**
   * Update focused card visual state
   * @param {HTMLElement[]} cards - each card's open button, which holds the roving tab stop
   */
  updateFocusedCard(cards) {
    const tabbable = this.tabbableIndex(cards.length);
    cards.forEach((card, i) => {
      // The highlight follows the real focus; the tab stop follows the entry point.
      card.closest('.citation-card')?.classList.toggle('focused', i === this.focusedIndex);
      card.setAttribute('tabindex', i === tabbable ? '0' : '-1');
    });

    if (this.focusedIndex >= 0 && cards[this.focusedIndex]) {
      cards[this.focusedIndex].focus();
      cards[this.focusedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Set the current view
   */
  setView(view) {
    this.currentView = view;
    this.focusedIndex = -1;

    // Update tab states
    const tabs = this.container.querySelectorAll('.view-tab');
    tabs.forEach(tab => {
      const isActive = tab.dataset.view === view;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
      if (isActive) {
        this.container.querySelector('[role="tabpanel"]')?.setAttribute('aria-labelledby', tab.id);
      }
    });

    // Show/hide project selector
    const projectSelector = this.container.querySelector('.citation-project-selector');
    if (projectSelector) {
      projectSelector.classList.toggle('hidden', view !== 'projects');
    }

    this.applyFilters();
    this.renderCitationList();
  }

  /**
   * Set the display mode (list/gallery)
   */
  setDisplayMode(mode) {
    this.displayMode = mode;

    // Update button states
    const btns = this.container.querySelectorAll('.display-btn');
    btns.forEach(btn => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Update list class
    const list = this.container.querySelector('.citation-list');
    if (list) {
      list.classList.toggle('gallery', mode === 'gallery');
    }
  }

  /**
   * Handle quick action button clicks
   */
  async handleQuickAction(action) {
    if (!this.currentTab) {
      return;
    }

    try {
      switch (action) {
        case 'save':
          this.onStatusUpdate('Saving citation...', 'processing');
          const saveResponse = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'SAVE_CITATION',
          });
          if (saveResponse?.success) {
            this.onStatusUpdate('Citation saved!', 'success');
            await this.loadCitations();
          } else {
            this.onStatusUpdate('Failed to save', 'error');
          }
          break;

        case 'library':
          await chrome.tabs.sendMessage(this.currentTab.id, {
            type: MESSAGE_TYPES.OPEN_BIBLIOGRAPHY_MANAGER,
          });
          this.onStatusUpdate('Opening library...', 'info');
          break;
      }
    } catch (error) {
      console.error('[CitationPanel] Quick action failed:', error);
      this.onStatusUpdate('Action failed', 'error');
    }
  }

  /**
   * Render the citation list
   */
  renderCitationList() {
    const list = this.container.querySelector('.citation-list');
    if (!list) {
      return;
    }

    list.classList.toggle('gallery', this.displayMode === 'gallery');

    this.listCleanup?.();
    this.listCleanup = null;
    this.updateVisibleCount();
    this.announceCount();

    if (this.filteredCitations.length === 0) {
      list.removeAttribute('role');
      this.renderEmptyState();
      return;
    }

    const visible = this.filteredCitations.slice(0, 20); // Limit for performance
    const tabbable = this.tabbableIndex(visible.length);

    list.setAttribute('role', 'list');
    list.innerHTML = sanitizeHTML(
      visible.map((citation, index) => this.renderCitationCard(citation, index, tabbable)).join('')
    );

    // A stored icon that will not decode falls back to the generic one (CSP-compliant - no inline
    // handlers).
    list.querySelectorAll('.citation-favicon').forEach(img => {
      img.addEventListener('error', () => {
        img.src = GENERIC_ICON;
      });
    });

    // One delegate for the whole list, so mouse, Enter and Space all reach the same code.
    // The selector list matters: closest() resolves a hit on an action button to the
    // button rather than to the card around it, so Copy never also opens the citation.
    // A click elsewhere on the card (the favicon, the padding) still opens it; the keyboard
    // reaches the same action through the card's open button.
    this.listCleanup = attachAccessibleDelegatedHandler(
      list,
      '.citation-action-btn, .citation-open, .citation-card',
      'Citation List',
      (e, target) => {
        if (target.classList.contains('citation-action-btn')) {
          const id = target.closest('.citation-card')?.dataset.id;
          if (id) {
            this.handleCitationAction(target.dataset.command, id);
          }
          return;
        }

        const card = target.closest('.citation-card');
        const index = Array.from(list.querySelectorAll('.citation-card')).indexOf(card);
        if (index >= 0) {
          this.openCitation(this.filteredCitations[index]);
        }
      }
    );
  }

  /**
   * Show how many citations are on screen. While a search or view narrows the list it reads
   * "1 of 2 citations", so the number agrees with the cards the student can see.
   */
  updateVisibleCount() {
    const countEl = this.container.querySelector('.citation-count');
    if (!countEl) {
      return;
    }
    const shown = this.filteredCitations.length;
    const total = this.citations.length;
    const noun = `citation${total === 1 ? '' : 's'}`;
    countEl.textContent = shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
  }

  /**
   * Announce the result count through the status element. Written only when the wording
   * changes, so a keystroke that leaves the count alone says nothing.
   */
  announceCount() {
    const statusEl = this.container.querySelector('.citation-list-status');
    if (!statusEl) {
      return;
    }
    const total = this.filteredCitations.length;
    let message;
    if (total > 0) {
      message = `${total} citation${total === 1 ? '' : 's'}`;
    } else {
      message = this.searchQuery ? 'No citations match your search' : 'No citations';
    }
    if (statusEl.textContent !== message) {
      statusEl.textContent = message;
    }
  }

  /**
   * Render a single citation card
   *
   * @param {Object} citation - Citation to render
   * @param {number} index - Position in the rendered list
   * @param {number} tabbableIndex - Index of the one card holding the tab stop, resolved
   *   once against the rendered count rather than per card
   * @returns {string} Card markup
   */
  renderCitationCard(citation, index, tabbableIndex) {
    const faviconUrl = this.iconFor(citation);
    const authors =
      citation.authors?.length > 0 ? citation.authors.slice(0, 2).join(', ') : 'Unknown author';
    const date = citation.createdAt ? this.formatDate(citation.createdAt) : '';
    // Named by the title alone, described by the author line, so a screen reader hears
    // "Deep Residual Learning, button" first and the details after.
    const cardId = `${this.idPrefix}-card-${index}`;

    return `
      <div class="citation-card" data-id="${this.escapeHtml(String(citation.id))}" role="listitem">
        <img class="citation-favicon"
             src="${this.escapeHtml(faviconUrl)}"
             alt=""
        />
        <button type="button" class="citation-open citation-info"
                tabindex="${index === tabbableIndex ? '0' : '-1'}"
                aria-labelledby="${cardId}-title" aria-describedby="${cardId}-meta">
          <span class="citation-title" id="${cardId}-title">${this.escapeHtml(citation.title || 'Untitled')}</span>
          <span class="citation-meta" id="${cardId}-meta">${this.escapeHtml(authors)}${date ? ' • ' + date : ''}</span>
        </button>
        <div class="citation-actions">
          <!-- The glyph is aria-hidden, so without an explicit label these buttons have
               only their title to fall back on. aria-label matches the title word for
               word: a visible name and an accessible name that disagree is its own
               failure. -->
          <button class="citation-action-btn" data-command="copy" data-action="copy"
                  title="Copy citation" aria-label="Copy citation">
            <span aria-hidden="true">📋</span>
          </button>
          <button class="citation-action-btn" data-command="open" data-action="open"
                  title="Open URL" aria-label="Open URL">
            <span aria-hidden="true">🔗</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    const list = this.container.querySelector('.citation-list');
    if (!list) {
      return;
    }

    let message;
    let icon;
    let showSaveBtn;

    if (this.loadError) {
      message = "Can't read citations on this page — open a normal web page to view your library.";
      icon = '🚫';
      showSaveBtn = false;
    } else if (this.searchQuery) {
      message = 'No citations match your search';
      icon = '📚';
      showSaveBtn = false;
    } else if (this.currentView === 'recent') {
      message = 'No citations from the past week';
      icon = '📚';
      showSaveBtn = true;
    } else if (this.currentView === 'projects' && this.selectedProject) {
      message = 'No citations in this project';
      icon = '📚';
      showSaveBtn = true;
    } else {
      message = 'No citations saved yet';
      icon = '📚';
      showSaveBtn = true;
    }

    list.innerHTML = sanitizeHTML(`
      <div class="citation-empty-state">
        <div class="citation-empty-icon">${icon}</div>
        <div class="citation-empty-text">${message}</div>
        ${
          showSaveBtn
            ? `
          <button class="citation-empty-action" data-command="save-first">
            Save Current Page
          </button>
        `
            : ''
        }
      </div>
    `);

    const saveBtn = list.querySelector('[data-command="save-first"]');
    if (saveBtn) {
      attachAccessibleHandler(saveBtn, 'Save First Action', () => {
        this.handleQuickAction('save');
      });
    }
  }

  /**
   * Update loading state
   */
  updateLoadingState() {
    const list = this.container.querySelector('.citation-list');
    if (!list) {
      return;
    }

    if (this.isLoading) {
      list.innerHTML = sanitizeHTML(`
        <div class="citation-loading">
          <div class="citation-loading-spinner"></div>
          <div style="font-size: 12px; color: #999;">Loading citations...</div>
        </div>
      `);
    }
  }

  /**
   * Update statistics display
   */
  updateStats() {
    const pageIndicator = this.container.querySelector('.citation-page-indicator');

    if (pageIndicator) {
      const currentPage = this.checkCurrentPageCitation();
      pageIndicator.textContent = currentPage ? '✓ Page saved' : '';
    }

    // Update project selector options
    this.updateProjectSelector();
  }

  /**
   * Update project selector dropdown
   */
  updateProjectSelector() {
    const select = this.container.querySelector('.project-select');
    if (!select) {
      return;
    }

    const options = ['<option value="">All Projects</option>'];

    this.projects.forEach(project => {
      options.push(
        `<option value="${project.id}" ${project.id === this.selectedProject ? 'selected' : ''}>
          ${this.escapeHtml(project.name)} (${project.citationCount || 0})
        </option>`
      );
    });

    select.innerHTML = sanitizeHTML(options.join(''));
  }

  /**
   * Check if current page has a citation
   */
  checkCurrentPageCitation() {
    if (!this.currentTab?.url) {
      return false;
    }
    return this.citations.some(c => c.url === this.currentTab.url);
  }

  /**
   * Open citation details
   */
  async openCitation(citation) {
    if (!this.currentTab) {
      return;
    }

    try {
      // Send message to open bibliography manager with citation focused
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: MESSAGE_TYPES.OPEN_BIBLIOGRAPHY_MANAGER,
        citationId: citation.id,
      });
    } catch (error) {
      console.error('[CitationPanel] Failed to open citation:', error);
    }
  }

  /**
   * Handle citation card actions
   */
  async handleCitationAction(action, citationId) {
    const citation = this.citations.find(c => String(c.id) === String(citationId));
    if (!citation) {
      return;
    }

    switch (action) {
      case 'copy':
        await this.copyCitation(citation);
        break;

      case 'open':
        if (citation.url) {
          chrome.tabs.create({ url: citation.url });
        }
        break;
    }
  }

  /**
   * Copy citation to clipboard
   */
  async copyCitation(citation) {
    const text = await this.formatCitation(citation);

    try {
      await navigator.clipboard.writeText(text);
      this.onStatusUpdate('Copied!', 'success');
    } catch (error) {
      console.error('[CitationPanel] Copy failed:', error);
      this.onStatusUpdate('Copy failed', 'error');
    }
  }

  /**
   * Format citation for the clipboard in the student's CHOSEN style (persisted by the library's
   * style switcher) — the popup must never silently fall back to Harvard for an APA student.
   */
  async formatCitation(citation) {
    let style;
    try {
      style = (await chrome.storage.local.get('citationStyle')).citationStyle;
    } catch {
      style = undefined; // default style applies
    }
    // Within its reference list — its collection, or every unfiled citation — so the year letter
    // is the one the library copies and the reference list carries.
    return formatReference(normalizeCitation(citation), style, {
      set: referenceSetFor(citation, this.citations),
    });
  }

  /**
   * The card's icon. Never fetched from anywhere: asking a favicon service for a source's icon
   * would tell that service the domain of every source the student has saved. An icon the
   * citation already holds as a data: image is used; anything else gets the local generic icon.
   * @param {Object} citation
   * @returns {string} a data: URL
   */
  iconFor(citation) {
    const stored = typeof citation.favicon === 'string' ? citation.favicon.trim() : '';
    return /^data:image\//i.test(stored) ? stored : GENERIC_ICON;
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    }
    if (diffDays === 1) {
      return 'Yesterday';
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }

    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  }

  /**
   * Escape HTML for safe rendering
   */
  escapeHtml(str) {
    if (!str) {
      return '';
    }
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Expand/collapse the panel
   */
  toggle() {
    this.isExpanded = !this.isExpanded;
    this.container.style.display = this.isExpanded ? 'block' : 'none';

    if (this.isExpanded) {
      this.loadCitations();
    }
  }

  /**
   * Show the panel
   */
  show() {
    this.isExpanded = true;
    this.container.style.display = 'block';
    this.loadCitations();
  }

  /**
   * Hide the panel
   */
  hide() {
    this.isExpanded = false;
    this.container.style.display = 'none';
  }
}

export default CitationManagerPanel;
