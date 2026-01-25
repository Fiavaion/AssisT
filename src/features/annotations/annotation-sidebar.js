/**
 * @fileoverview Annotation Sidebar Panel
 *
 * ARCHITECTURAL PATTERN: Self-Initializing Feature Module
 *
 * Provides a slide-in sidebar panel that displays all annotations and sticky notes
 * for the current page. Supports real-time synchronization with storage changes.
 *
 * FEATURES:
 * - Sidebar slides in from right (300px wide, full height)
 * - Lists all annotations and sticky notes for current page URL
 * - Each item shows: type icon, excerpt/content, timestamp, color dot
 * - Click item to scroll to and highlight it temporarily
 * - Real-time sync with storage changes
 * - Empty state with helpful message
 * - Export functionality (Markdown, Plain Text, JSON, CSV)
 * - WCAG 2.2 Level AA compliant (keyboard nav, ARIA labels, focus trap)
 *
 * DEPENDENCIES:
 * - storage-adapter.js (getByUrl, storage change events)
 * - export-manager.js (exportAnnotations)
 *
 * @module features/annotations/annotation-sidebar
 * @see {@link storage-adapter.js} - Storage backend
 * @see {@link export-manager.js} - Export functionality
 */

import { getStorageAdapter } from './storage-adapter.js';
import { exportAnnotations } from './export-manager.js';
import { getExistingTags } from './tag-manager.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler, attachAccessibleHandler } from '../../utils/event-handlers.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/** @type {BaseStorageAdapter} Current storage adapter instance */
let storageAdapter = null;

/** @type {string} Current storage mode ('local' or 'indexeddb') */
let storageMode = 'local';

/** @type {HTMLElement|null} Sidebar panel element */
let sidebarElement = null;

/** @type {boolean} Is sidebar currently open */
let isSidebarOpen = false;

/** @type {Array<Object>} Current page annotations */
let currentAnnotations = [];

/** @type {string} Current search query */
let currentSearchQuery = '';

/** @type {Array<Object>} All annotations (from all pages) for search */
let allAnnotations = [];

/** @type {number} Debounce timer ID */
let searchDebounceTimer = null;

/** @type {Array<Object>} Filtered annotations (display) */
let filteredAnnotations = [];

/** @type {Object} Active filters state */
let activeFilters = {
  page: 'current', // 'current' or 'all'
  tags: [], // Array of selected tag names
  date: 'all', // 'today', 'week', 'month', 'all'
  color: 'all', // 'yellow', 'blue', 'green', 'pink', 'purple', 'all'
  type: 'all', // 'note', 'annotation', 'all'
};

/** @type {Array<string>} Available tags from storage */
let availableTags = [];

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the annotation sidebar system
 * - Load storage adapter based on settings
 * - Set up Chrome message listeners for toggle commands
 * - Listen for storage changes
 */
async function initializeAnnotationSidebar() {
  console.log('[AnnotationSidebar] Initializing...');

  try {
    // Load storage mode from settings
    await loadStorageMode();

    // Initialize storage adapter
    storageAdapter = getStorageAdapter(storageMode);
    console.log(`[AnnotationSidebar] Using storage mode: ${storageMode}`);

    // Inject sidebar styles
    injectStyles();

    // Create sidebar element
    createSidebar();

    // Listen for toggle commands from popup
    chrome.runtime.onMessage.addListener(handleMessage);

    // Listen for storage mode changes
    chrome.storage.local.onChanged.addListener(handleStorageChange);

    // Listen for annotation changes (custom events from annotation modules)
    document.addEventListener('annotationChanged', handleAnnotationChange);

    console.log('[AnnotationSidebar] Initialized successfully');
  } catch (error) {
    console.error('[AnnotationSidebar] Initialization failed:', error);
  }
}

/**
 * Load storage mode from settings
 */
async function loadStorageMode() {
  return new Promise(resolve => {
    chrome.storage.local.get(['annotationStorageMode'], result => {
      storageMode = result.annotationStorageMode || 'local';
      resolve();
    });
  });
}

/**
 * Handle Chrome messages (toggle sidebar)
 */
function handleMessage(message, sender, sendResponse) {
  if (message.type === 'toggleAnnotationSidebar') {
    toggleSidebar();
    sendResponse({ success: true });
    return true;
  }
}

/**
 * Handle storage mode changes
 */
function handleStorageChange(changes) {
  if (changes.annotationStorageMode) {
    const newMode = changes.annotationStorageMode.newValue;
    console.log(`[AnnotationSidebar] Storage mode changed to: ${newMode}`);

    // Reload with new adapter
    storageMode = newMode;
    storageAdapter = getStorageAdapter(storageMode);

    // Refresh sidebar if open
    if (isSidebarOpen) {
      loadAnnotations();
    }
  }
}

/**
 * Handle annotation change events (create, update, delete)
 */
function handleAnnotationChange(event) {
  console.log('[AnnotationSidebar] Annotation changed:', event.detail);

  // Refresh sidebar if open
  if (isSidebarOpen) {
    loadAnnotations();
  }
}

// ============================================================
// SIDEBAR CREATION
// ============================================================

/**
 * Create the sidebar DOM element
 */
function createSidebar() {
  if (sidebarElement) {
    return; // Already created
  }

  const sidebar = document.createElement('div');
  sidebar.id = 'assist-annotation-sidebar';
  sidebar.className = 'assist-annotation-sidebar';
  sidebar.setAttribute('role', 'complementary');
  sidebar.setAttribute('aria-label', 'Annotations sidebar');
  sidebar.style.transform = 'translateX(100%)'; // Hidden by default

  sidebar.innerHTML = sanitizeHTML(`
    <div class="assist-sidebar-header">
      <h2 id="sidebar-title" class="assist-sidebar-title">
        Annotations (<span id="sidebar-count">0</span>)
      </h2>
      <div class="assist-sidebar-header-buttons">
        <button
          id="sidebar-filter-btn"
          class="assist-sidebar-button"
          aria-label="Filter annotations"
          title="Filter annotations"
          aria-expanded="false"
          aria-controls="filter-dropdown-container"
        >
          ⚙️
        </button>
        <button
          id="sidebar-export-btn"
          class="assist-sidebar-button"
          aria-label="Export annotations"
          title="Export annotations (Markdown, Plain Text, JSON, CSV)"
        >
          📥
        </button>
        <button
          id="sidebar-close-btn"
          class="assist-sidebar-close"
          aria-label="Close sidebar"
          title="Close sidebar (Escape)"
        >
          ×
        </button>
      </div>
    </div>
    <div id="export-dropdown-container" class="assist-export-dropdown-container">
      <!-- Export dropdown will be populated here -->
    </div>
    <div id="filter-dropdown-container" class="assist-filter-dropdown-container">
      <!-- Filter dropdown will be populated here -->
    </div>
    <div id="active-filters-container" class="assist-active-filters-container">
      <!-- Active filter badges will be populated here -->
    </div>
    <div class="assist-search-container">
      <div class="assist-search-wrapper">
        <span class="assist-search-icon">🔍</span>
        <input
          id="sidebar-search-input"
          type="text"
          class="assist-search-input"
          placeholder="Search annotations..."
          aria-label="Search annotations across all pages"
          aria-describedby="search-results-region"
        />
        <button
          id="sidebar-search-clear"
          class="assist-search-clear"
          aria-label="Clear search"
          title="Clear search"
          style="display: none;"
        >
          ×
        </button>
      </div>
      <div
        id="search-results-region"
        class="assist-search-results-info"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style="display: none;"
      >
        <!-- Search results info will be populated here -->
      </div>
    </div>
    <div id="sidebar-content" class="assist-sidebar-content">
      <!-- Content will be populated by loadAnnotations() -->
    </div>
  `);

  // Attach event listeners
  const closeBtn = sidebar.querySelector('#sidebar-close-btn');
  attachInteractiveHandler(closeBtn, 'Sidebar Close', closeSidebar);

  const filterBtn = sidebar.querySelector('#sidebar-filter-btn');
  attachInteractiveHandler(filterBtn, 'Sidebar Filter', handleFilterClick);

  const exportBtn = sidebar.querySelector('#sidebar-export-btn');
  attachInteractiveHandler(exportBtn, 'Sidebar Export', handleExportClick);

  const searchInput = sidebar.querySelector('#sidebar-search-input');
  const searchClearBtn = sidebar.querySelector('#sidebar-search-clear');

  searchInput.addEventListener('input', handleSearchInput);
  attachInteractiveHandler(searchClearBtn, 'Search Clear', clearSearch);

  // Keyboard support (Escape to close or clear search)
  sidebar.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (currentSearchQuery) {
        clearSearch();
      } else {
        closeSidebar();
      }
    }
  });

  document.body.appendChild(sidebar);
  sidebarElement = sidebar;

  console.log('[AnnotationSidebar] Sidebar element created');
}

// ============================================================
// SIDEBAR TOGGLE
// ============================================================

/**
 * Toggle sidebar open/closed
 */
export function toggleSidebar() {
  if (isSidebarOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

/**
 * Open sidebar and load annotations
 */
async function openSidebar() {
  if (!sidebarElement) {
    createSidebar();
  }

  // Load available tags for filter dropdown
  await loadAvailableTags();

  // Load all annotations (for search) and current page annotations
  await loadAllAnnotations();
  await loadAnnotations();

  // Apply filters initially
  applyFilters();

  // Slide in
  sidebarElement.style.transform = 'translateX(0)';
  isSidebarOpen = true;

  // Focus the search input
  setTimeout(() => {
    const searchInput = sidebarElement.querySelector('#sidebar-search-input');
    if (searchInput) {
      searchInput.focus();
    }
  }, 300); // Wait for animation

  console.log('[AnnotationSidebar] Sidebar opened');
}

/**
 * Close sidebar
 */
function closeSidebar() {
  if (!sidebarElement) {
    return;
  }

  // Slide out
  sidebarElement.style.transform = 'translateX(100%)';
  isSidebarOpen = false;

  console.log('[AnnotationSidebar] Sidebar closed');
}

// ============================================================
// ANNOTATION LOADING
// ============================================================

/**
 * Load all annotations from storage (for search functionality)
 */
async function loadAllAnnotations() {
  try {
    allAnnotations = await storageAdapter.getAll();
    console.log(`[AnnotationSidebar] Loaded ${allAnnotations.length} total annotations for search`);
  } catch (error) {
    console.error('[AnnotationSidebar] Error loading all annotations:', error);
    allAnnotations = [];
  }
}

/**
 * Load annotations for current page URL
 */
async function loadAnnotations() {
  try {
    const currentUrl = window.location.href;
    const annotations = await storageAdapter.getByUrl(currentUrl);

    currentAnnotations = annotations;

    // Sort by creation date (newest first)
    currentAnnotations.sort((a, b) => b.createdAt - a.createdAt);

    // Update UI
    renderAnnotations();

    console.log(
      `[AnnotationSidebar] Loaded ${currentAnnotations.length} annotations for current page`
    );
  } catch (error) {
    console.error('[AnnotationSidebar] Error loading annotations:', error);
    renderError();
  }
}

// ============================================================
// FILTER FUNCTIONALITY
// ============================================================

/**
 * Load available tags from storage
 */
async function loadAvailableTags() {
  try {
    availableTags = await getExistingTags();
    console.log('[AnnotationSidebar] Loaded available tags:', availableTags);
  } catch (error) {
    console.error('[AnnotationSidebar] Error loading tags:', error);
    availableTags = [];
  }
}

/**
 * Handle filter button click - show/hide filter dropdown
 */
function handleFilterClick() {
  const dropdownContainer = sidebarElement.querySelector('#filter-dropdown-container');
  const isVisible = dropdownContainer.style.display !== 'none';
  const filterBtn = sidebarElement.querySelector('#sidebar-filter-btn');

  if (isVisible) {
    // Hide dropdown
    dropdownContainer.style.display = 'none';
    filterBtn.setAttribute('aria-expanded', 'false');
  } else {
    // Show dropdown
    showFilterDropdown();
    filterBtn.setAttribute('aria-expanded', 'true');
  }
}

/**
 * Show filter dropdown menu
 */
async function showFilterDropdown() {
  const dropdownContainer = sidebarElement.querySelector('#filter-dropdown-container');

  // Create page filter options
  const pageOptions = `
    <div class="assist-filter-group">
      <label class="assist-filter-group-label">Page</label>
      <div class="assist-filter-options">
        <label class="assist-filter-checkbox">
          <input type="radio" name="page" value="current" ${activeFilters.page === 'current' ? 'checked' : ''} />
          <span>Current page</span>
        </label>
        <label class="assist-filter-checkbox">
          <input type="radio" name="page" value="all" ${activeFilters.page === 'all' ? 'checked' : ''} />
          <span>All pages</span>
        </label>
      </div>
    </div>
  `;

  // Create date filter options
  const dateOptions = `
    <div class="assist-filter-group">
      <label class="assist-filter-group-label">Date</label>
      <div class="assist-filter-options">
        <label class="assist-filter-checkbox">
          <input type="radio" name="date" value="today" ${activeFilters.date === 'today' ? 'checked' : ''} />
          <span>Today</span>
        </label>
        <label class="assist-filter-checkbox">
          <input type="radio" name="date" value="week" ${activeFilters.date === 'week' ? 'checked' : ''} />
          <span>This week</span>
        </label>
        <label class="assist-filter-checkbox">
          <input type="radio" name="date" value="month" ${activeFilters.date === 'month' ? 'checked' : ''} />
          <span>This month</span>
        </label>
        <label class="assist-filter-checkbox">
          <input type="radio" name="date" value="all" ${activeFilters.date === 'all' ? 'checked' : ''} />
          <span>All time</span>
        </label>
      </div>
    </div>
  `;

  // Create color filter options
  const colorOptions = `
    <div class="assist-filter-group">
      <label class="assist-filter-group-label">Color</label>
      <div class="assist-filter-options assist-filter-color-options">
        <label class="assist-filter-color">
          <input type="radio" name="color" value="all" ${activeFilters.color === 'all' ? 'checked' : ''} />
          <span>All</span>
        </label>
        <label class="assist-filter-color" style="border-color: #fbbf24;">
          <input type="radio" name="color" value="yellow" ${activeFilters.color === 'yellow' ? 'checked' : ''} />
          <span style="background: #fbbf24;"></span>
        </label>
        <label class="assist-filter-color" style="border-color: #3b82f6;">
          <input type="radio" name="color" value="blue" ${activeFilters.color === 'blue' ? 'checked' : ''} />
          <span style="background: #3b82f6;"></span>
        </label>
        <label class="assist-filter-color" style="border-color: #10b981;">
          <input type="radio" name="color" value="green" ${activeFilters.color === 'green' ? 'checked' : ''} />
          <span style="background: #10b981;"></span>
        </label>
        <label class="assist-filter-color" style="border-color: #ec4899;">
          <input type="radio" name="color" value="pink" ${activeFilters.color === 'pink' ? 'checked' : ''} />
          <span style="background: #ec4899;"></span>
        </label>
        <label class="assist-filter-color" style="border-color: #a855f7;">
          <input type="radio" name="color" value="purple" ${activeFilters.color === 'purple' ? 'checked' : ''} />
          <span style="background: #a855f7;"></span>
        </label>
      </div>
    </div>
  `;

  // Create type filter options
  const typeOptions = `
    <div class="assist-filter-group">
      <label class="assist-filter-group-label">Type</label>
      <div class="assist-filter-options">
        <label class="assist-filter-checkbox">
          <input type="radio" name="type" value="all" ${activeFilters.type === 'all' ? 'checked' : ''} />
          <span>All</span>
        </label>
        <label class="assist-filter-checkbox">
          <input type="radio" name="type" value="note" ${activeFilters.type === 'note' ? 'checked' : ''} />
          <span>Sticky notes</span>
        </label>
        <label class="assist-filter-checkbox">
          <input type="radio" name="type" value="annotation" ${activeFilters.type === 'annotation' ? 'checked' : ''} />
          <span>Inline annotations</span>
        </label>
      </div>
    </div>
  `;

  // Create tags filter options
  const tagsHTML = availableTags
    .map(
      tag => `
        <label class="assist-filter-checkbox assist-filter-tag-checkbox">
          <input
            type="checkbox"
            value="${tag}"
            ${activeFilters.tags.includes(tag) ? 'checked' : ''}
          />
          <span>${tag}</span>
        </label>
      `
    )
    .join('');

  const tagsOptions = `
    <div class="assist-filter-group">
      <label class="assist-filter-group-label">Tags</label>
      <div class="assist-filter-options assist-filter-tags-container">
        ${tagsHTML || '<p class="assist-filter-empty-text">No tags available</p>'}
      </div>
    </div>
  `;

  const clearButtonHTML = hasActiveFilters()
    ? '<button id="clear-all-filters-btn" class="assist-clear-all-filters-btn">Clear all filters</button>'
    : '';

  dropdownContainer.innerHTML = sanitizeHTML(`
    <div class="assist-filter-dropdown">
      ${pageOptions}
      ${dateOptions}
      ${colorOptions}
      ${typeOptions}
      ${tagsOptions}
      ${clearButtonHTML}
    </div>
  `);

  dropdownContainer.style.display = 'block';

  // Attach event listeners for filter changes
  dropdownContainer.querySelectorAll('input[type="radio"]').forEach(input => {
    input.addEventListener('change', e => {
      const filterType = e.target.name;
      activeFilters[filterType] = e.target.value;
      applyFilters();
    });
  });

  // Attach event listeners for tag checkboxes
  dropdownContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', e => {
      const tag = e.target.value;
      if (e.target.checked) {
        if (!activeFilters.tags.includes(tag)) {
          activeFilters.tags.push(tag);
        }
      } else {
        activeFilters.tags = activeFilters.tags.filter(t => t !== tag);
      }
      applyFilters();
    });
  });

  // Attach clear all filters button listener
  const clearBtn = dropdownContainer.querySelector('#clear-all-filters-btn');
  if (clearBtn) {
    attachInteractiveHandler(clearBtn, 'Clear All Filters', clearAllFilters);
  }

  console.log('[AnnotationSidebar] Filter dropdown shown');
}

/**
 * Check if any filters are active
 * @returns {boolean}
 */
function hasActiveFilters() {
  return (
    activeFilters.page !== 'current' ||
    activeFilters.tags.length > 0 ||
    activeFilters.date !== 'all' ||
    activeFilters.color !== 'all' ||
    activeFilters.type !== 'all'
  );
}

/**
 * Apply filters and re-render annotations
 */
function applyFilters() {
  // Filter current annotations based on active filters
  filteredAnnotations = currentAnnotations.filter(annotation => {
    return matchesAllFilters(annotation);
  });

  // Update UI
  renderActiveFilters();
  renderFilteredAnnotations();
}

/**
 * Check if an annotation matches all active filters (AND logic)
 * @param {Object} annotation
 * @returns {boolean}
 */
function matchesAllFilters(annotation) {
  // Page filter
  if (activeFilters.page === 'current') {
    // Only show annotations from current page (already filtered)
  }

  // Date filter
  if (activeFilters.date !== 'all') {
    const now = Date.now();
    const annotationDate = annotation.createdAt;
    const diffMs = now - annotationDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (activeFilters.date === 'today') {
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours > 24) {
        return false;
      }
    } else if (activeFilters.date === 'week') {
      if (diffDays > 7) {
        return false;
      }
    } else if (activeFilters.date === 'month') {
      if (diffDays > 30) {
        return false;
      }
    }
  }

  // Color filter
  if (activeFilters.color !== 'all') {
    if (annotation.color !== activeFilters.color) {
      return false;
    }
  }

  // Type filter
  if (activeFilters.type !== 'all') {
    if (annotation.type !== activeFilters.type) {
      return false;
    }
  }

  // Tags filter (AND logic - must have all selected tags)
  if (activeFilters.tags.length > 0) {
    const annotationTags = annotation.tags || [];
    const hasAllTags = activeFilters.tags.every(tag => annotationTags.includes(tag));
    if (!hasAllTags) {
      return false;
    }
  }

  return true;
}

/**
 * Render active filter badges
 */
function renderActiveFilters() {
  const container = sidebarElement.querySelector('#active-filters-container');

  if (!hasActiveFilters()) {
    container.innerHTML = sanitizeHTML('');
    container.style.display = 'none';
    return;
  }

  const badges = [];

  if (activeFilters.page !== 'current') {
    badges.push(createFilterBadge('Page', 'All pages', 'page'));
  }

  if (activeFilters.date !== 'all') {
    const dateLabels = {
      today: 'Today',
      week: 'This week',
      month: 'This month',
    };
    badges.push(createFilterBadge('Date', dateLabels[activeFilters.date], 'date'));
  }

  if (activeFilters.color !== 'all') {
    badges.push(createFilterBadge('Color', activeFilters.color, 'color'));
  }

  if (activeFilters.type !== 'all') {
    const typeLabels = { note: 'Sticky notes', annotation: 'Inline annotations' };
    badges.push(createFilterBadge('Type', typeLabels[activeFilters.type], 'type'));
  }

  activeFilters.tags.forEach(tag => {
    badges.push(createFilterBadge('Tag', tag, 'tag', tag));
  });

  container.innerHTML = sanitizeHTML(badges.join(''));
  container.style.display = 'block';

  // Attach remove listeners
  container.querySelectorAll('.assist-filter-badge-remove').forEach(btn => {
    attachInteractiveHandler(btn, 'Filter Badge Remove', () => {
      const filterType = btn.dataset.filterType;
      const filterValue = btn.dataset.filterValue;
      removeFilter(filterType, filterValue);
    });
  });
}

/**
 * Create a filter badge HTML
 * @param {string} label - Filter label (Page, Tag, etc.)
 * @param {string} value - Filter value to display
 * @param {string} type - Filter type
 * @param {string} [dataValue] - Data attribute value for removal
 * @returns {string} HTML
 */
function createFilterBadge(label, value, type, dataValue = null) {
  const displayValue = dataValue || value;
  return `
    <span class="assist-filter-badge">
      <span class="assist-filter-badge-text">${label}: ${value}</span>
      <button
        class="assist-filter-badge-remove"
        data-filter-type="${type}"
        data-filter-value="${displayValue}"
        aria-label="Remove ${label}: ${value} filter"
        title="Remove filter"
      >
        ×
      </button>
    </span>
  `;
}

/**
 * Remove a specific filter
 * @param {string} filterType
 * @param {string} filterValue
 */
function removeFilter(filterType, filterValue) {
  if (filterType === 'page') {
    activeFilters.page = 'current';
  } else if (filterType === 'date') {
    activeFilters.date = 'all';
  } else if (filterType === 'color') {
    activeFilters.color = 'all';
  } else if (filterType === 'type') {
    activeFilters.type = 'all';
  } else if (filterType === 'tag') {
    activeFilters.tags = activeFilters.tags.filter(t => t !== filterValue);
  }

  // Update filter dropdown UI
  const filterDropdown = sidebarElement.querySelector('#filter-dropdown-container');
  if (filterDropdown.style.display !== 'none') {
    showFilterDropdown();
  }

  // Reapply filters
  applyFilters();
}

/**
 * Clear all filters
 */
function clearAllFilters() {
  activeFilters = {
    page: 'current',
    tags: [],
    date: 'all',
    color: 'all',
    type: 'all',
  };

  // Update filter dropdown UI
  const filterDropdown = sidebarElement.querySelector('#filter-dropdown-container');
  if (filterDropdown.style.display !== 'none') {
    showFilterDropdown();
  }

  // Reapply filters
  applyFilters();
  console.log('[AnnotationSidebar] All filters cleared');
}

/**
 * Render filtered annotations in sidebar
 */
function renderFilteredAnnotations() {
  const content = sidebarElement.querySelector('#sidebar-content');
  const countElement = sidebarElement.querySelector('#sidebar-count');

  // Update count
  countElement.textContent = filteredAnnotations.length;

  // Empty state
  if (filteredAnnotations.length === 0) {
    content.innerHTML = sanitizeHTML(`
      <div class="assist-sidebar-empty">
        <div class="assist-sidebar-empty-icon">🔍</div>
        <p class="assist-sidebar-empty-text">No annotations match filters</p>
        <p class="assist-sidebar-empty-hint">Try adjusting your filter selections</p>
      </div>
    `);
    return;
  }

  // Render items
  const itemsHTML = filteredAnnotations
    .map(annotation => createAnnotationItemHTML(annotation))
    .join('');

  content.innerHTML = sanitizeHTML(itemsHTML);

  // Attach click handlers with keyboard support
  content.querySelectorAll('.assist-sidebar-item').forEach(item => {
    attachAccessibleHandler(item, 'Sidebar Item', () => {
      const id = parseInt(item.dataset.id);
      scrollToAnnotation(id);
    });
  });
}

// ============================================================
// SEARCH FUNCTIONALITY
// ============================================================

/**
 * Handle search input with debouncing
 * @param {Event} event - Input event
 */
function handleSearchInput(event) {
  const query = event.target.value.trim();

  // Clear existing debounce timer
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  // Show/hide clear button
  const clearBtn = sidebarElement.querySelector('#sidebar-search-clear');
  if (query) {
    clearBtn.style.display = 'block';
  } else {
    clearBtn.style.display = 'none';
  }

  // Debounce search (300ms)
  searchDebounceTimer = setTimeout(() => {
    performSearch(query);
  }, 300);
}

/**
 * Clear search and restore annotations list
 */
function clearSearch() {
  currentSearchQuery = '';
  const searchInput = sidebarElement.querySelector('#sidebar-search-input');
  const clearBtn = sidebarElement.querySelector('#sidebar-search-clear');
  const resultsRegion = sidebarElement.querySelector('#search-results-region');

  searchInput.value = '';
  clearBtn.style.display = 'none';
  resultsRegion.style.display = 'none';

  renderAnnotations();
}

/**
 * Perform search across all annotations
 * @param {string} query - Search query
 */
function performSearch(query) {
  if (!query) {
    clearSearch();
    return;
  }

  currentSearchQuery = query;
  const resultsRegion = sidebarElement.querySelector('#search-results-region');

  try {
    // Search annotations
    const results = searchAnnotations(query);

    // Update ARIA live region
    resultsRegion.textContent = `Found ${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`;
    resultsRegion.style.display = 'block';

    // Render search results
    renderSearchResults(results);

    console.log(`[AnnotationSidebar] Search found ${results.length} results for "${query}"`);
  } catch (error) {
    console.error('[AnnotationSidebar] Error performing search:', error);
    resultsRegion.textContent = 'Error searching annotations';
    resultsRegion.style.display = 'block';
  }
}

/**
 * Search annotations across all pages
 * Searches in: content, tags, and URL
 * @param {string} query - Search query
 * @returns {Array<Object>} Filtered and sorted results
 */
function searchAnnotations(query) {
  const lowerQuery = query.toLowerCase();
  const currentUrl = window.location.href;

  // Score and filter annotations
  const scoredResults = allAnnotations
    .map(annotation => {
      let matchCount = 0;
      const matchedFields = [];

      // Check content field
      const content = (annotation.content || annotation.selectedText || '').toLowerCase();
      if (content.includes(lowerQuery)) {
        matchCount += 2; // Higher weight for content match
        matchedFields.push('content');
      }

      // Check tags
      const tags = (annotation.tags || []).join(' ').toLowerCase();
      if (tags.includes(lowerQuery)) {
        matchCount += 1;
        matchedFields.push('tags');
      }

      // Check URL (exact domain match)
      const url = (annotation.url || '').toLowerCase();
      if (url.includes(lowerQuery)) {
        matchCount += 1;
        matchedFields.push('url');
      }

      // Check title/comment
      const comment = (annotation.comment || '').toLowerCase();
      if (comment.includes(lowerQuery)) {
        matchCount += 2;
        matchedFields.push('comment');
      }

      return {
        ...annotation,
        matchCount,
        matchedFields,
        isCurrentPage: annotation.url === currentUrl,
      };
    })
    .filter(item => item.matchCount > 0);

  // Sort by: relevance (match count), then timestamp (newest first)
  scoredResults.sort((a, b) => {
    if (b.matchCount !== a.matchCount) {
      return b.matchCount - a.matchCount;
    }
    return b.createdAt - a.createdAt;
  });

  return scoredResults;
}

/**
 * Highlight matching text in a string
 * @param {string} text - Original text
 * @param {string} query - Search query
 * @returns {string} HTML with matching text bolded
 */
function highlightMatches(text, query) {
  if (!text || !query) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text;
  }

  // Escape HTML and highlight the match
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query);
  const highlighted = escaped.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<strong>$1</strong>');

  return highlighted;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render search results in sidebar
 * @param {Array<Object>} results - Search results
 */
function renderSearchResults(results) {
  const content = sidebarElement.querySelector('#sidebar-content');
  const countElement = sidebarElement.querySelector('#sidebar-count');
  const currentUrl = window.location.href;

  // Update count
  countElement.textContent = results.length;

  // Empty state
  if (results.length === 0) {
    content.innerHTML = sanitizeHTML(`
      <div class="assist-sidebar-empty">
        <div class="assist-sidebar-empty-icon">🔍</div>
        <p class="assist-sidebar-empty-text">No results for "${escapeHtml(currentSearchQuery)}"</p>
        <p class="assist-sidebar-empty-hint">Try different keywords or clear search</p>
      </div>
    `);
    return;
  }

  // Render search result items
  const itemsHTML = results
    .map(annotation => createSearchResultItemHTML(annotation, currentUrl))
    .join('');

  content.innerHTML = sanitizeHTML(itemsHTML);

  // Attach click handlers with keyboard support
  content.querySelectorAll('.assist-sidebar-item').forEach(item => {
    attachAccessibleHandler(item, 'Search Result Item', () => {
      const id = parseInt(item.dataset.id);
      const result = results.find(r => r.id === id);
      if (result) {
        scrollToAnnotationFromSearch(result);
      }
    });
  });
}

/**
 * Create HTML for a search result item
 * @param {Object} annotation - Annotation data (with search metadata)
 * @param {string} currentUrl - Current page URL
 * @returns {string} HTML string
 */
function createSearchResultItemHTML(annotation, currentUrl) {
  const icon = annotation.type === 'note' ? '📌' : '📝';
  const excerpt = getExcerpt(annotation);
  const highlightedExcerpt = highlightMatches(excerpt, currentSearchQuery);
  const timestamp = formatRelativeTime(annotation.createdAt);
  const colorDot = getColorDot(annotation.color);

  // Show page URL if not on current page
  const pageUrlHtml =
    annotation.url !== currentUrl
      ? `<div class="assist-search-result-url">${escapeHtml(getDisplayUrl(annotation.url))}</div>`
      : '';

  return `
    <div
      class="assist-sidebar-item assist-search-result-item"
      data-id="${annotation.id}"
      tabindex="0"
      role="button"
      aria-label="View ${annotation.type}: ${excerpt.substring(0, 50)}"
    >
      <div class="assist-sidebar-item-header">
        <span class="assist-sidebar-item-icon">${icon}</span>
        <span class="assist-sidebar-item-type">${annotation.type === 'note' ? 'Sticky Note' : 'Annotation'}</span>
        ${colorDot}
      </div>
      <div class="assist-sidebar-item-excerpt">${highlightedExcerpt}</div>
      ${pageUrlHtml}
      <div class="assist-sidebar-item-footer">
        <span class="assist-sidebar-item-timestamp">${timestamp}</span>
      </div>
    </div>
  `;
}

/**
 * Get display URL (domain and path only)
 * @param {string} url - Full URL
 * @returns {string} Display URL
 */
function getDisplayUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    return url.substring(0, 50) + (url.length > 50 ? '...' : '');
  }
}

/**
 * Scroll to annotation from search result (may be on different page)
 * @param {Object} annotation - Annotation with search metadata
 */
async function scrollToAnnotationFromSearch(annotation) {
  try {
    const currentUrl = window.location.href;

    // If on different page, show toast message
    if (annotation.url !== currentUrl) {
      if (window.showToast) {
        window.showToast(`⚠️ This annotation is on a different page. Navigate there to view it.`);
      }
      console.log(
        `[AnnotationSidebar] Annotation ${annotation.id} is on different page: ${annotation.url}`
      );
      return;
    }

    // Same page: scroll to it
    await scrollToAnnotation(annotation.id);
  } catch (error) {
    console.error('[AnnotationSidebar] Error scrolling to search result:', error);
  }
}

/**
 * Render annotations in sidebar
 */
function renderAnnotations() {
  const content = sidebarElement.querySelector('#sidebar-content');
  const countElement = sidebarElement.querySelector('#sidebar-count');

  // Update count
  countElement.textContent = currentAnnotations.length;

  // Empty state
  if (currentAnnotations.length === 0) {
    content.innerHTML = sanitizeHTML(`
      <div class="assist-sidebar-empty">
        <div class="assist-sidebar-empty-icon">📝</div>
        <p class="assist-sidebar-empty-text">No annotations on this page</p>
        <p class="assist-sidebar-empty-hint">
          Select text and click "Annotate" to add your first note
        </p>
      </div>
    `);
    return;
  }

  // Render items
  const itemsHTML = currentAnnotations
    .map(annotation => createAnnotationItemHTML(annotation))
    .join('');

  content.innerHTML = sanitizeHTML(itemsHTML);

  // Attach click handlers with keyboard support
  content.querySelectorAll('.assist-sidebar-item').forEach(item => {
    attachAccessibleHandler(item, 'Sidebar Item', () => {
      const id = parseInt(item.dataset.id);
      scrollToAnnotation(id);
    });
  });
}

/**
 * Create HTML for a single annotation item
 * @param {Object} annotation - Annotation data
 * @returns {string} HTML string
 */
function createAnnotationItemHTML(annotation) {
  const icon = annotation.type === 'note' ? '📌' : '📝';
  const excerpt = getExcerpt(annotation);
  const timestamp = formatRelativeTime(annotation.createdAt);
  const colorDot = getColorDot(annotation.color);

  return `
    <div
      class="assist-sidebar-item"
      data-id="${annotation.id}"
      tabindex="0"
      role="button"
      aria-label="View ${annotation.type}: ${excerpt}"
    >
      <div class="assist-sidebar-item-header">
        <span class="assist-sidebar-item-icon">${icon}</span>
        <span class="assist-sidebar-item-type">${annotation.type === 'note' ? 'Sticky Note' : 'Annotation'}</span>
        ${colorDot}
      </div>
      <div class="assist-sidebar-item-excerpt">${excerpt}</div>
      <div class="assist-sidebar-item-footer">
        <span class="assist-sidebar-item-timestamp">${timestamp}</span>
      </div>
    </div>
  `;
}

/**
 * Get excerpt from annotation (truncated content)
 * @param {Object} annotation - Annotation data
 * @returns {string} Truncated text
 */
function getExcerpt(annotation) {
  let text = '';

  if (annotation.type === 'note') {
    // Sticky note: use content
    text = annotation.content || 'Empty note';
  } else {
    // Inline annotation: use selectedText or comment
    text = annotation.selectedText || annotation.comment || 'Empty annotation';
  }

  // Truncate to 2 lines (approx 80 characters)
  if (text.length > 80) {
    return text.substring(0, 80) + '...';
  }

  return text;
}

/**
 * Format timestamp as relative time (e.g., "2 hours ago")
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Relative time string
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Get color dot HTML
 * @param {string} color - Color name
 * @returns {string} HTML string
 */
function getColorDot(color) {
  const colorMap = {
    yellow: '#fbbf24',
    blue: '#3b82f6',
    green: '#10b981',
    pink: '#ec4899',
    purple: '#a855f7',
  };

  const hexColor = colorMap[color] || colorMap.yellow;

  return `<span class="assist-sidebar-color-dot" style="background-color: ${hexColor}"></span>`;
}

/**
 * Render error state
 */
function renderError() {
  const content = sidebarElement.querySelector('#sidebar-content');
  content.innerHTML = sanitizeHTML(`
    <div class="assist-sidebar-empty">
      <div class="assist-sidebar-empty-icon">⚠️</div>
      <p class="assist-sidebar-empty-text">Error loading annotations</p>
      <p class="assist-sidebar-empty-hint">Please try again later</p>
    </div>
  `);
}

// ============================================================
// ANNOTATION NAVIGATION
// ============================================================

/**
 * Scroll to annotation and highlight it temporarily
 * @param {number} annotationId - Annotation ID
 */
async function scrollToAnnotation(annotationId) {
  try {
    const annotation = currentAnnotations.find(a => a.id === annotationId);
    if (!annotation) {
      console.warn(`[AnnotationSidebar] Annotation ${annotationId} not found`);
      return;
    }

    let targetElement = null;

    if (annotation.type === 'note') {
      // Sticky note: find by data-note-id attribute
      targetElement = document.querySelector(`[data-note-id="${annotationId}"]`);
    } else {
      // Inline annotation: find by data-annotation-id attribute
      targetElement = document.querySelector(`[data-annotation-id="${annotationId}"]`);
    }

    if (!targetElement) {
      console.warn(`[AnnotationSidebar] Element for annotation ${annotationId} not found on page`);
      // Show toast notification
      if (window.showToast) {
        window.showToast('⚠️ Annotation not visible on page');
      }
      return;
    }

    // Scroll to element
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight temporarily
    highlightTemporarily(targetElement);

    console.log(`[AnnotationSidebar] Scrolled to annotation ${annotationId}`);
  } catch (error) {
    console.error('[AnnotationSidebar] Error scrolling to annotation:', error);
  }
}

/**
 * Highlight element temporarily (pulse effect)
 * @param {HTMLElement} element - Element to highlight
 */
function highlightTemporarily(element) {
  // Add pulse animation class
  element.classList.add('assist-annotation-pulse');

  // Remove after animation completes
  setTimeout(() => {
    element.classList.remove('assist-annotation-pulse');
  }, 2000);
}

// ============================================================
// EXPORT FUNCTIONALITY
// ============================================================

/**
 * Handle export button click - show dropdown menu
 */
function handleExportClick() {
  const dropdownContainer = sidebarElement.querySelector('#export-dropdown-container');
  const isVisible = dropdownContainer.style.display !== 'none';

  if (isVisible) {
    // Hide dropdown
    dropdownContainer.style.display = 'none';
  } else {
    // Show dropdown
    showExportDropdown();
  }
}

/**
 * Show export format dropdown menu
 */
function showExportDropdown() {
  const dropdownContainer = sidebarElement.querySelector('#export-dropdown-container');

  dropdownContainer.innerHTML = sanitizeHTML(`
    <div class="assist-export-dropdown">
      <button
        class="assist-export-option"
        data-format="md"
        aria-label="Export as Markdown"
      >
        📄 Markdown (.md)
      </button>
      <button
        class="assist-export-option"
        data-format="txt"
        aria-label="Export as Plain Text"
      >
        📝 Plain Text (.txt)
      </button>
      <button
        class="assist-export-option"
        data-format="json"
        aria-label="Export as JSON"
      >
        {} JSON (.json)
      </button>
      <button
        class="assist-export-option"
        data-format="csv"
        aria-label="Export as CSV"
      >
        📊 CSV (.csv)
      </button>
    </div>
  `);

  dropdownContainer.style.display = 'block';

  // Attach click handlers
  dropdownContainer.querySelectorAll('.assist-export-option').forEach(btn => {
    attachInteractiveHandler(btn, `Export ${btn.dataset.format}`, () => {
      const format = btn.dataset.format;
      handleExportFormat(format);
    });
  });

  console.log('[AnnotationSidebar] Export dropdown shown');
}

/**
 * Handle export format selection
 * @param {string} format - Export format (md, txt, json, csv)
 */
async function handleExportFormat(format) {
  try {
    // Determine which annotations to export
    const annotationsToExport = currentSearchQuery
      ? currentAnnotations // Use filtered results if search is active
      : currentAnnotations; // Use current page annotations

    if (annotationsToExport.length === 0) {
      showToast('⚠️ No annotations to export');
      return;
    }

    // Show loading state
    const dropdownContainer = sidebarElement.querySelector('#export-dropdown-container');
    const button = dropdownContainer.querySelector(`[data-format="${format}"]`);
    const originalText = button.textContent;
    button.textContent = '⏳ Exporting...';
    button.disabled = true;

    // Perform export
    const result = await exportAnnotations(annotationsToExport, format);

    // Hide dropdown
    dropdownContainer.style.display = 'none';

    // Show result toast
    if (result.success) {
      showToast(`✅ ${result.message}`);
      console.log(`[AnnotationSidebar] Export successful: ${result.count} items`);
    } else {
      showToast(`❌ ${result.message}`);
      console.error(`[AnnotationSidebar] Export failed: ${result.message}`);
    }

    // Restore button state
    button.textContent = originalText;
    button.disabled = false;
  } catch (error) {
    console.error('[AnnotationSidebar] Export error:', error);
    showToast('❌ Export failed: ' + error.message);
  }
}

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {number} duration - Duration in milliseconds
 */
function showToast(message, duration = 3000) {
  // Check if a custom toast function exists globally
  if (window.showToast && typeof window.showToast === 'function') {
    window.showToast(message);
    return;
  }

  // Fallback: Create a simple toast
  const toast = document.createElement('div');
  toast.className = 'assist-toast';
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  document.body.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.remove();
  }, duration);
}

// ============================================================
// STYLES (INJECTED INTO PAGE)
// ============================================================

/**
 * Inject sidebar CSS into page
 */
function injectStyles() {
  const styleId = 'assist-annotation-sidebar-styles';
  if (document.getElementById(styleId)) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .assist-annotation-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 300px;
      height: 100%;
      background: white;
      box-shadow: -4px 0 10px rgba(0, 0, 0, 0.1);
      z-index: 999997;
      display: flex;
      flex-direction: column;
      transition: transform 0.3s ease-in-out;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .assist-sidebar-header {
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .assist-sidebar-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      flex: 1;
    }

    .assist-sidebar-header-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .assist-sidebar-button {
      background: transparent;
      border: none;
      font-size: 20px;
      cursor: pointer;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.15s;
      padding: 0;
      line-height: 1;
    }

    .assist-sidebar-button:hover {
      background: #f3f4f6;
    }

    .assist-sidebar-button:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-sidebar-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .assist-sidebar-close {
      background: transparent;
      border: none;
      font-size: 28px;
      font-weight: 300;
      color: #6b7280;
      cursor: pointer;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.15s;
      line-height: 1;
      padding: 0;
    }

    .assist-sidebar-close:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .assist-sidebar-close:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-export-dropdown-container {
      display: none;
      padding: 8px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .assist-export-dropdown {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .assist-export-option {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
      text-align: left;
      font-family: inherit;
    }

    .assist-export-option:hover {
      background: #f3f4f6;
      border-color: #d1d5db;
    }

    .assist-export-option:focus {
      outline: 2px solid #3b82f6;
      outline-offset: -2px;
    }

    .assist-export-option:active {
      background: #e5e7eb;
    }

    .assist-export-option:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .assist-toast {
      position: fixed;
      bottom: 24px;
      left: 24px;
      background: #111827;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 999999;
      animation: assist-toast-slide 0.3s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    @keyframes assist-toast-slide {
      from {
        transform: translateY(10px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .assist-search-container {
      padding: 8px 12px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .assist-search-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 0 8px;
      height: 36px;
    }

    .assist-search-icon {
      font-size: 16px;
      color: #9ca3af;
      flex-shrink: 0;
    }

    .assist-search-input {
      flex: 1;
      border: none;
      background: transparent;
      font-size: 14px;
      color: #111827;
      padding: 0;
      min-width: 0;
      font-family: inherit;
    }

    .assist-search-input::placeholder {
      color: #d1d5db;
    }

    .assist-search-input:focus {
      outline: none;
    }

    .assist-search-input:focus ~ .assist-search-clear,
    .assist-search-input:focus + .assist-search-clear {
      color: #6b7280;
    }

    .assist-search-clear {
      background: transparent;
      border: none;
      font-size: 18px;
      color: #9ca3af;
      cursor: pointer;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      flex-shrink: 0;
      transition: color 0.15s;
      line-height: 1;
    }

    .assist-search-clear:hover {
      color: #6b7280;
    }

    .assist-search-clear:focus {
      outline: 2px solid #3b82f6;
      outline-offset: -2px;
      border-radius: 3px;
    }

    .assist-search-results-info {
      font-size: 12px;
      color: #6b7280;
      padding: 6px 0;
      text-align: center;
    }

    .assist-search-result-url {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid #f3f4f6;
      word-break: break-word;
    }

    .assist-sidebar-close {
      background: transparent;
      border: none;
      font-size: 28px;
      font-weight: 300;
      color: #6b7280;
      cursor: pointer;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.15s;
      line-height: 1;
      padding: 0;
    }

    .assist-sidebar-close:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .assist-sidebar-close:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .assist-sidebar-item {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      cursor: pointer;
      transition: background-color 0.15s;
      border-radius: 6px;
      margin-bottom: 4px;
    }

    .assist-sidebar-item:hover {
      background: #f9fafb;
    }

    .assist-sidebar-item:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
      background: #f9fafb;
    }

    .assist-sidebar-item-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }

    .assist-sidebar-item-icon {
      font-size: 16px;
    }

    .assist-sidebar-item-type {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex: 1;
    }

    .assist-sidebar-color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .assist-sidebar-item-excerpt {
      font-size: 14px;
      color: #374151;
      line-height: 1.4;
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .assist-sidebar-item-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .assist-sidebar-item-timestamp {
      font-size: 11px;
      color: #9ca3af;
    }

    .assist-sidebar-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      text-align: center;
    }

    .assist-sidebar-empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .assist-sidebar-empty-text {
      font-size: 16px;
      font-weight: 600;
      color: #6b7280;
      margin: 0 0 8px 0;
    }

    .assist-sidebar-empty-hint {
      font-size: 13px;
      color: #9ca3af;
      margin: 0;
      max-width: 200px;
    }

    @keyframes assist-annotation-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
      }
      50% {
        box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
      }
    }

    .assist-annotation-pulse {
      animation: assist-annotation-pulse 1s ease-in-out 2;
    }

    /* Filter Dropdown Styles */
    .assist-filter-dropdown-container {
      display: none;
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
      background: #f9fafb;
      max-height: 400px;
      overflow-y: auto;
    }

    .assist-filter-dropdown {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .assist-filter-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .assist-filter-group-label {
      font-size: 12px;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .assist-filter-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .assist-filter-checkbox,
    .assist-filter-tag-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 13px;
      color: #374151;
    }

    .assist-filter-checkbox input[type="radio"],
    .assist-filter-checkbox input[type="checkbox"],
    .assist-filter-tag-checkbox input[type="checkbox"] {
      cursor: pointer;
      width: 14px;
      height: 14px;
      margin: 0;
      accent-color: #3b82f6;
    }

    .assist-filter-checkbox:hover,
    .assist-filter-tag-checkbox:hover {
      color: #111827;
    }

    .assist-filter-color-options {
      display: flex;
      flex-direction: row;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .assist-filter-color {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      padding: 0;
    }

    .assist-filter-color input[type="radio"] {
      display: none;
    }

    .assist-filter-color span {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      display: block;
    }

    .assist-filter-color input[type="radio"]:checked + span,
    .assist-filter-color input[type="radio"]:checked {
      box-shadow: 0 0 0 2px white, 0 0 0 4px #3b82f6;
    }

    .assist-filter-color:has(input:checked) {
      border-color: currentColor;
    }

    .assist-filter-tags-container {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      max-height: 150px;
      overflow-y: auto;
    }

    .assist-filter-empty-text {
      font-size: 12px;
      color: #9ca3af;
      font-style: italic;
      margin: 0;
      padding: 8px;
    }

    .assist-clear-all-filters-btn {
      padding: 8px 12px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      margin-top: 8px;
    }

    .assist-clear-all-filters-btn:hover {
      background: #dc2626;
    }

    .assist-clear-all-filters-btn:focus {
      outline: 2px solid #3b82f6;
      outline-offset: -2px;
    }

    /* Active Filters Badges */
    .assist-active-filters-container {
      display: none;
      padding: 8px 12px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: 6px;
    }

    .assist-filter-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #93c5fd;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 500;
    }

    .assist-filter-badge-text {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .assist-filter-badge-remove {
      background: transparent;
      border: none;
      color: #1e40af;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      padding: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      transition: opacity 0.15s;
    }

    .assist-filter-badge-remove:hover {
      opacity: 0.7;
    }

    .assist-filter-badge-remove:focus {
      outline: 2px solid #3b82f6;
      outline-offset: -2px;
      border-radius: 2px;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// AUTO-INITIALIZATION
// ============================================================

// Self-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeAnnotationSidebar();
    registerFeature();
  });
} else {
  initializeAnnotationSidebar();
  registerFeature();
}

/**
 * Register feature API with window.assistFeatures
 */
function registerFeature() {
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.annotationSidebar = {
    toggleSidebar,
    openSidebar,
    closeSidebar,
  };

  console.log('[AnnotationSidebar] Feature API registered');
}

// Export for external use
export { initializeAnnotationSidebar, openSidebar, closeSidebar };
