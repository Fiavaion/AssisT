import { g as getStorageAdapter, l as loadShortcuts, S as SHORTCUT_LABELS, a as resetShortcuts, e as eventToShortcut, v as validateShortcut, s as saveShortcuts } from "./storage-adapter-_vjWlDz9.js";
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) return;
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) processPreload(link);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
    }
  }).observe(document, {
    childList: true,
    subtree: true
  });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep) return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const MESSAGE_TYPES = {
  GET_SETTINGS: "GET_SETTINGS",
  UPDATE_SETTINGS: "UPDATE_SETTINGS",
  RESET_SETTINGS: "RESET_SETTINGS",
  EXPORT_SETTINGS: "EXPORT_SETTINGS",
  IMPORT_SETTINGS: "IMPORT_SETTINGS",
  GET_TAB_CONTEXT: "GET_TAB_CONTEXT",
  GET_PAGE_CONTEXT: "GET_PAGE_CONTEXT",
  TTS_COMMAND: "TTS_COMMAND",
  STT_COMMAND: "STT_COMMAND",
  OPEN_BIBLIOGRAPHY_MANAGER: "OPEN_BIBLIOGRAPHY_MANAGER",
  OPEN_PROJECT_MANAGER: "OPEN_PROJECT_MANAGER"
};
const DEFAULT_SETTINGS = {
  tts: {
    enabled: false,
    highlightEnabled: true,
    highlightColor: "#FFEB3B",
    highlightOpacity: 0.7,
    wordByWordEnabled: false,
    rate: 1,
    pitch: 1,
    volume: 1,
    voice: null
    // Voice name or null for default
  },
  stt: {
    enabled: false
  },
  ocr: {
    enabled: true,
    // Enable/disable OCR feature
    autoActivateReadingMode: true,
    // Automatically activate reading mode before OCR capture
    filterNoise: true,
    // Remove cookie notices, social embeds, ads, and UI clutter from OCR text
    upscaleFactor: 1.5
    // Image upscaling for better OCR accuracy (1.5 = 150%, 2.0 = 200%)
  },
  waiAdapt: {
    textSpacing: false,
    focusMode: {
      enabled: false
    },
    numericSimplification: false
  },
  textCustomization: {
    fontFamily: "default",
    fontSize: "16px",
    lineSpacing: 1.5,
    letterSpacing: 0
  },
  keyboardShortcuts: {
    tts_play_pause: "Ctrl+Shift+Space",
    tts_stop: "Ctrl+Shift+S",
    ocr_activate: "Alt+O",
    reading_mode_toggle: "Ctrl+Shift+R",
    reading_mode_exit: "Escape",
    dictionary_lookup: "Ctrl+Shift+D"
  },
  annotations: {
    enabled: true,
    // Enable/disable annotations feature
    storageMode: "local",
    // 'local' (chrome.storage.local) or 'indexeddb' (Dexie)
    maxLocalEntries: 100,
    // Max annotations in local storage before suggesting IndexedDB
    autoMigrate: true
    // Auto-migrate between storage modes when switching
  }
};
class SettingsManager {
  /**
   * Create a new SettingsManager instance
   * @constructor
   */
  constructor() {
    this.currentSettings = { ...DEFAULT_SETTINGS };
    this.listeners = /* @__PURE__ */ new Map();
    this.saveDebounceTimer = null;
    this.DEBOUNCE_DELAY = 300;
    this.initStorageListener();
  }
  /**
   * Initialize the storage change listener
   * Listens for changes from other tabs/windows and updates local cache
   *
   * @private
   */
  initStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" && changes.assist_settings) {
        this.currentSettings = { ...changes.assist_settings.newValue };
        this.emit("settingsChanged", {
          newSettings: this.currentSettings,
          changes: changes.assist_settings
        });
      }
    });
  }
  /**
   * Load settings from Chrome storage
   * Falls back to default settings if none exist
   *
   * @returns {Promise<Object>} Loaded settings object
   * @example
   * const settings = await settingsManager.loadSettings();
   * console.log(settings.tts.enabled);
   */
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get("assist_settings", (result) => {
        if (result.assist_settings) {
          this.currentSettings = this.mergeSettings(DEFAULT_SETTINGS, result.assist_settings);
        } else {
          this.currentSettings = { ...DEFAULT_SETTINGS };
        }
        resolve(this.currentSettings);
      });
    });
  }
  /**
   * Get current settings (cached in memory)
   * Does NOT hit storage - use loadSettings() for fresh data from storage
   *
   * @returns {Object} Current settings object
   * @example
   * const settings = settingsManager.getSettings();
   * console.log(settings.tts.rate);
   */
  getSettings() {
    return { ...this.currentSettings };
  }
  /**
   * Get a specific feature's settings by path
   *
   * @param {string} path - Dot-separated path (e.g., 'tts.highlightColor')
   * @returns {*} The value at the specified path, or undefined
   * @example
   * const highlightColor = settingsManager.getSetting('tts.highlightColor');
   * const enabled = settingsManager.getSetting('tts.enabled');
   */
  getSetting(path) {
    return path.split(".").reduce((obj, key) => obj?.[key], this.currentSettings);
  }
  /**
   * Update settings and persist to Chrome storage
   * Implements debouncing to prevent excessive storage writes
   *
   * @param {Object} updatedSettings - Settings object or partial update
   * @param {boolean} [merge=true] - Whether to merge with existing settings
   * @returns {Promise<Object>} Updated settings after storage write
   * @example
   * await settingsManager.updateSettings({ tts: { enabled: true } });
   * await settingsManager.updateSettings({ tts: { rate: 1.5 } });
   */
  async updateSettings(updatedSettings, merge = true) {
    if (merge) {
      this.currentSettings = this.mergeSettings(this.currentSettings, updatedSettings);
    } else {
      this.currentSettings = updatedSettings;
    }
    this.emit("settingsChanged", {
      newSettings: this.currentSettings,
      changes: updatedSettings
    });
    return new Promise((resolve) => {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = setTimeout(() => {
        chrome.storage.sync.set({ assist_settings: this.currentSettings }, () => {
          resolve(this.currentSettings);
        });
      }, this.DEBOUNCE_DELAY);
    });
  }
  /**
   * Update a specific setting by path
   * Useful for single setting updates without affecting others
   *
   * @param {string} path - Dot-separated path (e.g., 'tts.rate')
   * @param {*} value - The new value
   * @returns {Promise<Object>} Updated settings after storage write
   * @example
   * await settingsManager.updateSetting('tts.rate', 1.5);
   * await settingsManager.updateSetting('tts.highlightColor', '#FF0000');
   */
  async updateSetting(path, value) {
    const keys = path.split(".");
    const update = {};
    let current = update;
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    return this.updateSettings(update, true);
  }
  /**
   * Reset all settings to defaults
   *
   * @returns {Promise<Object>} Reset settings
   * @example
   * await settingsManager.resetSettings();
   */
  async resetSettings() {
    this.currentSettings = { ...DEFAULT_SETTINGS };
    return new Promise((resolve) => {
      chrome.storage.sync.set({ assist_settings: this.currentSettings }, () => {
        resolve(this.currentSettings);
      });
    });
  }
  /**
   * Clear all settings from storage (complete wipe)
   *
   * @returns {Promise<void>}
   * @example
   * await settingsManager.clearStorage();
   */
  async clearStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.remove("assist_settings", () => {
        this.currentSettings = { ...DEFAULT_SETTINGS };
        resolve();
      });
    });
  }
  /**
   * Register a listener for settings changes
   * Listener will be called with { newSettings, changes } object
   *
   * @param {string} event - Event name (e.g., 'settingsChanged')
   * @param {Function} callback - Function to call on event
   * @returns {Function} Unsubscribe function
   * @example
   * const unsubscribe = settingsManager.on('settingsChanged', (data) => {
   *   console.log('Settings changed:', data.newSettings);
   * });
   *
   * // Later, unsubscribe
   * unsubscribe();
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, /* @__PURE__ */ new Set());
    }
    this.listeners.get(event).add(callback);
    return () => {
      this.listeners.get(event).delete(callback);
    };
  }
  /**
   * Remove a specific listener
   *
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   * @returns {void}
   * @example
   * settingsManager.off('settingsChanged', myCallback);
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }
  /**
   * Emit an event to all registered listeners
   *
   * @private
   * @param {string} event - Event name
   * @param {*} data - Data to pass to listeners
   * @returns {void}
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[SettingsManager] Error in ${event} listener:`, err);
        }
      });
    }
  }
  /**
   * Deep merge settings objects
   * Later values override earlier values
   *
   * @private
   * @param {Object} target - Target object
   * @param {Object} source - Source object to merge in
   * @returns {Object} Merged object
   */
  mergeSettings(target, source) {
    const result = { ...target };
    Object.keys(source).forEach((key) => {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
        result[key] = this.mergeSettings(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    });
    return result;
  }
}
const settingsManager = new SettingsManager();
async function migrateAnnotations(fromMode, toMode, options = {}) {
  const { clearSource = true, onProgress } = options;
  if (fromMode === toMode) {
    return {
      success: false,
      count: 0,
      error: "Source and target storage modes are the same"
    };
  }
  if (!["local", "indexeddb"].includes(fromMode) || !["local", "indexeddb"].includes(toMode)) {
    return {
      success: false,
      count: 0,
      error: 'Invalid storage mode. Must be "local" or "indexeddb"'
    };
  }
  try {
    const sourceAdapter = getStorageAdapter(fromMode);
    const targetAdapter = getStorageAdapter(toMode);
    if (onProgress) {
      onProgress({
        status: "exporting",
        current: 0,
        total: 0,
        message: `Exporting annotations from ${fromMode}...`
      });
    }
    const annotations = await sourceAdapter.export();
    const totalCount = annotations.length;
    if (totalCount === 0) {
      if (onProgress) {
        onProgress({
          status: "complete",
          current: 0,
          total: 0,
          message: "No annotations to migrate"
        });
      }
      await settingsManager.updateSetting("annotations.storageMode", toMode);
      return {
        success: true,
        count: 0,
        error: null
      };
    }
    await targetAdapter.clear();
    if (onProgress) {
      onProgress({
        status: "importing",
        current: 0,
        total: totalCount,
        message: `Importing ${totalCount} annotations to ${toMode}...`
      });
    }
    const annotationsWithoutIds = annotations.map(({ id: _id, ...rest }) => rest);
    await targetAdapter.import(annotationsWithoutIds);
    if (onProgress) {
      onProgress({
        status: "verifying",
        current: totalCount,
        total: totalCount,
        message: "Verifying migration..."
      });
    }
    const verifyCount = await targetAdapter.count();
    if (verifyCount !== totalCount) {
      throw new Error(
        `Migration verification failed: Expected ${totalCount} annotations, found ${verifyCount}`
      );
    }
    if (clearSource) {
      await sourceAdapter.clear();
    }
    await settingsManager.updateSetting("annotations.storageMode", toMode);
    if (onProgress) {
      onProgress({
        status: "complete",
        current: totalCount,
        total: totalCount,
        message: `Successfully migrated ${totalCount} annotations to ${toMode}`
      });
    }
    return {
      success: true,
      count: totalCount,
      error: null
    };
  } catch (error) {
    console.error("[MigrationManager] Migration failed:", error);
    if (onProgress) {
      onProgress({
        status: "error",
        current: 0,
        total: 0,
        message: `Migration failed: ${error.message}`
      });
    }
    return {
      success: false,
      count: 0,
      error: error.message
    };
  }
}
class CitationManagerPanel {
  /**
   * @param {HTMLElement} container - Container element to render panel
   * @param {Object} options - Configuration options
   * @param {Function} options.onStatusUpdate - Callback for status updates
   * @param {Object} options.currentTab - Current browser tab
   */
  constructor(container, options = {}) {
    this.container = container;
    this.onStatusUpdate = options.onStatusUpdate || (() => {
    });
    this.currentTab = options.currentTab;
    this.citations = [];
    this.projects = [];
    this.filteredCitations = [];
    this.currentView = "all";
    this.displayMode = "list";
    this.searchQuery = "";
    this.selectedProject = null;
    this.isLoading = false;
    this.isExpanded = false;
    this.focusedIndex = -1;
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
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        type: "GET_CITATIONS"
      });
      if (response && response.success) {
        this.citations = response.citations || [];
        this.projects = response.projects || [];
        this.applyFilters();
        this.renderCitationList();
        this.updateStats();
      } else {
        console.log("[CitationPanel] No citations response, initializing empty");
        this.citations = [];
        this.projects = [];
        this.renderEmptyState();
      }
    } catch (error) {
      console.log("[CitationPanel] Failed to load citations:", error.message);
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
    let filtered = [...this.citations];
    switch (this.currentView) {
      case "recent":
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3;
        filtered = filtered.filter((c) => new Date(c.savedAt).getTime() > weekAgo);
        filtered.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        break;
      case "projects":
        if (this.selectedProject) {
          filtered = filtered.filter(
            (c) => c.projectId === this.selectedProject || c.projects?.includes(this.selectedProject)
          );
        }
        break;
    }
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) => c.title?.toLowerCase().includes(query) || c.authors?.some((a) => a.toLowerCase().includes(query)) || c.tags?.some((t) => t.toLowerCase().includes(query)) || c.url?.toLowerCase().includes(query)
      );
    }
    this.filteredCitations = filtered;
  }
  /**
   * Render the main panel structure
   */
  render() {
    this.container.innerHTML = `
      <div class="citation-panel" role="region" aria-label="Citation Manager">
        <!-- Panel Header with View Switcher -->
        <div class="citation-panel-header">
          <div class="citation-view-tabs" role="tablist">
            <button class="view-tab active" data-view="all" role="tab" aria-selected="true" tabindex="0">
              All
            </button>
            <button class="view-tab" data-view="projects" role="tab" aria-selected="false" tabindex="-1">
              Projects
            </button>
            <button class="view-tab" data-view="recent" role="tab" aria-selected="false" tabindex="-1">
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

        <!-- Citation List -->
        <div class="citation-list-container" role="list" aria-live="polite">
          <div class="citation-list"></div>
        </div>

        <!-- Quick Actions -->
        <div class="citation-quick-actions">
          <button class="quick-action-btn" data-action="save" title="Save current page">
            <span aria-hidden="true">💾</span> Save Page
          </button>
          <button class="quick-action-btn" data-action="library" title="Open full library">
            <span aria-hidden="true">📚</span> Library
          </button>
          <button class="quick-action-btn" data-action="projects" title="Manage projects">
            <span aria-hidden="true">📁</span> Projects
          </button>
        </div>
      </div>
    `;
    this.injectStyles();
  }
  /**
   * Inject component styles
   */
  injectStyles() {
    if (document.getElementById("citation-panel-styles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "citation-panel-styles";
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

      .citation-card:focus-visible {
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

        .citation-card:focus-visible {
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
    const viewTabs = this.container.querySelectorAll(".view-tab");
    viewTabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        this.setView(e.target.dataset.view);
      });
      tab.addEventListener("keydown", (e) => {
        this.handleTabKeyNav(e, viewTabs);
      });
    });
    const displayBtns = this.container.querySelectorAll(".display-btn");
    displayBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.setDisplayMode(e.currentTarget.dataset.mode);
      });
    });
    const searchInput = this.container.querySelector(".citation-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        this.applyFilters();
        this.renderCitationList();
      });
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.target.value = "";
          this.searchQuery = "";
          this.applyFilters();
          this.renderCitationList();
        }
      });
    }
    const projectSelect = this.container.querySelector(".project-select");
    if (projectSelect) {
      projectSelect.addEventListener("change", (e) => {
        this.selectedProject = e.target.value || null;
        this.applyFilters();
        this.renderCitationList();
      });
    }
    const quickActions = this.container.querySelectorAll(".quick-action-btn");
    quickActions.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.handleQuickAction(btn.dataset.action);
      });
    });
    const listContainer = this.container.querySelector(".citation-list-container");
    if (listContainer) {
      listContainer.addEventListener("keydown", (e) => {
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
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        newIndex = (currentIndex + 1) % tabsArray.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        newIndex = (currentIndex - 1 + tabsArray.length) % tabsArray.length;
        break;
      case "Home":
        e.preventDefault();
        newIndex = 0;
        break;
      case "End":
        e.preventDefault();
        newIndex = tabsArray.length - 1;
        break;
      default:
        return;
    }
    tabsArray[newIndex].focus();
    tabsArray[newIndex].click();
  }
  /**
   * Handle keyboard navigation for citation list
   */
  handleListKeyNav(e) {
    const cards = Array.from(this.container.querySelectorAll(".citation-card"));
    if (cards.length === 0) {
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.focusedIndex = Math.min(this.focusedIndex + 1, cards.length - 1);
        this.updateFocusedCard(cards);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
        this.updateFocusedCard(cards);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (this.focusedIndex >= 0 && cards[this.focusedIndex]) {
          cards[this.focusedIndex].click();
        }
        break;
      case "Home":
        e.preventDefault();
        this.focusedIndex = 0;
        this.updateFocusedCard(cards);
        break;
      case "End":
        e.preventDefault();
        this.focusedIndex = cards.length - 1;
        this.updateFocusedCard(cards);
        break;
    }
  }
  /**
   * Update focused card visual state
   */
  updateFocusedCard(cards) {
    cards.forEach((card, i) => {
      card.classList.toggle("focused", i === this.focusedIndex);
      card.setAttribute("tabindex", i === this.focusedIndex ? "0" : "-1");
    });
    if (this.focusedIndex >= 0 && cards[this.focusedIndex]) {
      cards[this.focusedIndex].focus();
      cards[this.focusedIndex].scrollIntoView({ block: "nearest" });
    }
  }
  /**
   * Set the current view
   */
  setView(view) {
    this.currentView = view;
    this.focusedIndex = -1;
    const tabs = this.container.querySelectorAll(".view-tab");
    tabs.forEach((tab) => {
      const isActive = tab.dataset.view === view;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    const projectSelector = this.container.querySelector(".citation-project-selector");
    if (projectSelector) {
      projectSelector.classList.toggle("hidden", view !== "projects");
    }
    this.applyFilters();
    this.renderCitationList();
  }
  /**
   * Set the display mode (list/gallery)
   */
  setDisplayMode(mode) {
    this.displayMode = mode;
    const btns = this.container.querySelectorAll(".display-btn");
    btns.forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    const list = this.container.querySelector(".citation-list");
    if (list) {
      list.classList.toggle("gallery", mode === "gallery");
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
        case "save":
          this.onStatusUpdate("Saving citation...", "processing");
          const saveResponse = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: "SAVE_CITATION"
          });
          if (saveResponse?.success) {
            this.onStatusUpdate("Citation saved!", "success");
            await this.loadCitations();
          } else {
            this.onStatusUpdate("Failed to save", "error");
          }
          break;
        case "library":
          await chrome.tabs.sendMessage(this.currentTab.id, {
            type: MESSAGE_TYPES.OPEN_BIBLIOGRAPHY_MANAGER
          });
          this.onStatusUpdate("Opening library...", "info");
          break;
        case "projects":
          await chrome.tabs.sendMessage(this.currentTab.id, {
            type: MESSAGE_TYPES.OPEN_PROJECT_MANAGER
          });
          this.onStatusUpdate("Opening projects...", "info");
          break;
      }
    } catch (error) {
      console.error("[CitationPanel] Quick action failed:", error);
      this.onStatusUpdate("Action failed", "error");
    }
  }
  /**
   * Render the citation list
   */
  renderCitationList() {
    const list = this.container.querySelector(".citation-list");
    if (!list) {
      return;
    }
    list.classList.toggle("gallery", this.displayMode === "gallery");
    if (this.filteredCitations.length === 0) {
      this.renderEmptyState();
      return;
    }
    list.innerHTML = this.filteredCitations.slice(0, 20).map((citation, index) => this.renderCitationCard(citation, index)).join("");
    list.querySelectorAll(".citation-card").forEach((card, index) => {
      card.addEventListener("click", () => {
        this.openCitation(this.filteredCitations[index]);
      });
    });
    list.querySelectorAll(".citation-action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.closest(".citation-card").dataset.id;
        this.handleCitationAction(action, id);
      });
    });
  }
  /**
   * Render a single citation card
   */
  renderCitationCard(citation, index) {
    const faviconUrl = citation.favicon || this.getFaviconFromUrl(citation.url);
    const authors = citation.authors?.length > 0 ? citation.authors.slice(0, 2).join(", ") : "Unknown author";
    const date = citation.savedAt ? this.formatDate(citation.savedAt) : "";
    return `
      <div class="citation-card"
           data-id="${citation.id}"
           role="listitem"
           tabindex="${index === this.focusedIndex ? "0" : "-1"}"
           aria-label="${citation.title || "Untitled citation"}">
        <img class="citation-favicon"
             src="${faviconUrl}"
             alt=""
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📄</text></svg>'"
        />
        <div class="citation-info">
          <div class="citation-title">${this.escapeHtml(citation.title || "Untitled")}</div>
          <div class="citation-meta">${this.escapeHtml(authors)}${date ? " • " + date : ""}</div>
        </div>
        <div class="citation-actions">
          <button class="citation-action-btn" data-action="copy" title="Copy citation">
            <span aria-hidden="true">📋</span>
          </button>
          <button class="citation-action-btn" data-action="open" title="Open URL">
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
    const list = this.container.querySelector(".citation-list");
    if (!list) {
      return;
    }
    const message = this.searchQuery ? "No citations match your search" : this.currentView === "recent" ? "No citations from the past week" : this.currentView === "projects" && this.selectedProject ? "No citations in this project" : "No citations saved yet";
    list.innerHTML = `
      <div class="citation-empty-state">
        <div class="citation-empty-icon">📚</div>
        <div class="citation-empty-text">${message}</div>
        ${!this.searchQuery ? `
          <button class="citation-empty-action" data-action="save-first">
            Save Current Page
          </button>
        ` : ""}
      </div>
    `;
    const saveBtn = list.querySelector('[data-action="save-first"]');
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        this.handleQuickAction("save");
      });
    }
  }
  /**
   * Update loading state
   */
  updateLoadingState() {
    const list = this.container.querySelector(".citation-list");
    if (!list) {
      return;
    }
    if (this.isLoading) {
      list.innerHTML = `
        <div class="citation-loading">
          <div class="citation-loading-spinner"></div>
          <div style="font-size: 12px; color: #999;">Loading citations...</div>
        </div>
      `;
    }
  }
  /**
   * Update statistics display
   */
  updateStats() {
    const countEl = this.container.querySelector(".citation-count");
    const pageIndicator = this.container.querySelector(".citation-page-indicator");
    if (countEl) {
      const total = this.filteredCitations.length;
      countEl.textContent = `${total} citation${total === 1 ? "" : "s"}`;
    }
    if (pageIndicator) {
      const currentPage = this.checkCurrentPageCitation();
      pageIndicator.textContent = currentPage ? "✓ Page saved" : "";
    }
    this.updateProjectSelector();
  }
  /**
   * Update project selector dropdown
   */
  updateProjectSelector() {
    const select = this.container.querySelector(".project-select");
    if (!select) {
      return;
    }
    const options = ['<option value="">All Projects</option>'];
    this.projects.forEach((project) => {
      options.push(
        `<option value="${project.id}" ${project.id === this.selectedProject ? "selected" : ""}>
          ${this.escapeHtml(project.name)} (${project.citationCount || 0})
        </option>`
      );
    });
    select.innerHTML = options.join("");
  }
  /**
   * Check if current page has a citation
   */
  checkCurrentPageCitation() {
    if (!this.currentTab?.url) {
      return false;
    }
    return this.citations.some((c) => c.url === this.currentTab.url);
  }
  /**
   * Open citation details
   */
  async openCitation(citation) {
    if (!this.currentTab) {
      return;
    }
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: MESSAGE_TYPES.OPEN_BIBLIOGRAPHY_MANAGER,
        citationId: citation.id
      });
    } catch (error) {
      console.error("[CitationPanel] Failed to open citation:", error);
    }
  }
  /**
   * Handle citation card actions
   */
  async handleCitationAction(action, citationId) {
    const citation = this.citations.find((c) => c.id === citationId);
    if (!citation) {
      return;
    }
    switch (action) {
      case "copy":
        await this.copyCitation(citation);
        break;
      case "open":
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
    const text = this.formatCitation(citation);
    try {
      await navigator.clipboard.writeText(text);
      this.onStatusUpdate("Copied!", "success");
    } catch (error) {
      console.error("[CitationPanel] Copy failed:", error);
      this.onStatusUpdate("Copy failed", "error");
    }
  }
  /**
   * Format citation for clipboard (Harvard style)
   */
  formatCitation(citation) {
    const authors = citation.authors?.length > 0 ? citation.authors.join(", ") : citation.siteName || "Unknown Author";
    const year = citation.publicationDate ? new Date(citation.publicationDate).getFullYear() : new Date(citation.savedAt).getFullYear();
    const title = citation.title || "Untitled";
    const url = citation.url || "";
    const accessed = (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    return `${authors} (${year}). ${title}. Available at: ${url} (Accessed: ${accessed}).`;
  }
  /**
   * Get favicon URL from page URL
   */
  getFaviconFromUrl(url) {
    if (!url) {
      return "";
    }
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
      return "";
    }
  }
  /**
   * Format date for display
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = /* @__PURE__ */ new Date();
    const diffDays = Math.floor((now - date) / (1e3 * 60 * 60 * 24));
    if (diffDays === 0) {
      return "Today";
    }
    if (diffDays === 1) {
      return "Yesterday";
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short"
    });
  }
  /**
   * Escape HTML for safe rendering
   */
  escapeHtml(str) {
    if (!str) {
      return "";
    }
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  /**
   * Expand/collapse the panel
   */
  toggle() {
    this.isExpanded = !this.isExpanded;
    this.container.style.display = this.isExpanded ? "block" : "none";
    if (this.isExpanded) {
      this.loadCitations();
    }
  }
  /**
   * Show the panel
   */
  show() {
    this.isExpanded = true;
    this.container.style.display = "block";
    this.loadCitations();
  }
  /**
   * Hide the panel
   */
  hide() {
    this.isExpanded = false;
    this.container.style.display = "none";
  }
}
class PopupController {
  constructor() {
    this.settings = null;
    this.currentTab = null;
    this.isInitialized = false;
    this.citationPanel = null;
    this.citationPanelExpanded = false;
  }
  async initialize() {
    console.log("[Popup] Initializing...");
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tabs[0];
    await this.loadSettings();
    this.setupEventListeners();
    this.setupAccordions();
    this.updateUI();
    this.loadVoices();
    this.isInitialized = true;
    this.updateStatus("Ready");
    console.log("[Popup] Initialized");
  }
  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_SETTINGS
      });
      if (response.success) {
        this.settings = response.data;
        console.log("[Popup] Settings loaded:", this.settings);
      }
    } catch (error) {
      console.error("[Popup] Error loading settings:", error);
      this.updateStatus("Error loading settings", "error");
    }
  }
  async saveSettings() {
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_SETTINGS,
        data: this.settings
      });
      console.log("[Popup] Settings saved");
    } catch (error) {
      console.error("[Popup] Error saving settings:", error);
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
        highlightMenuSettings: this.settings.highlightMenu
      });
      console.log("[Popup] Highlight Menu settings saved to storage:", this.settings.highlightMenu);
    } catch (error) {
      console.error("[Popup] Error saving highlight menu settings:", error);
    }
  }
  applyVisibilitySettings() {
    const visibility = this.settings.ui_visibility || {};
    const toggleSection = (sectionId, visibilityKey, defaultValue = true) => {
      const section = document.getElementById(sectionId);
      if (section) {
        const isVisible = visibility[visibilityKey] !== void 0 ? visibility[visibilityKey] : defaultValue;
        section.style.display = isVisible ? "" : "none";
      }
    };
    toggleSection("ocr-section", "show_ocr");
    toggleSection("highlight-menu-section", "show_highlight_menu");
    toggleSection("dictionary-section", "show_dictionary");
    toggleSection("highlight-options-container", "show_highlighting");
    toggleSection("speed-presets-container", "show_speed_presets");
    toggleSection("text-customization-section", "show_text_customization");
    toggleSection("reading-guide-section", "show_reading_guide");
    toggleSection("focus-mode-section", "show_focus_mode");
    toggleSection("stt-section", "show_stt", false);
    toggleSection("screen-overlay-section", "show_screen_overlay");
    toggleSection("canvas-integration-section", "show_canvas_integration", false);
    toggleSection("moodle-integration-section", "show_moodle_integration", false);
    toggleSection(
      "google-classroom-integration-section",
      "show_google_classroom_integration",
      false
    );
    toggleSection("dyslexia-mode-section", "show_dyslexia_mode");
    console.log("[Popup] Visibility settings applied:", visibility);
  }
  /**
   * Initialize accordion sections for cleaner UI organization
   */
  setupAccordions() {
    const accordionSections = document.querySelectorAll(".accordion-section");
    const savedState = this.loadAccordionState();
    accordionSections.forEach((section) => {
      const header = section.querySelector(".accordion-header");
      const content = section.querySelector(".accordion-content");
      const sectionId = section.dataset.section;
      if (!header || !content) {
        return;
      }
      const isExpanded = savedState[sectionId] !== void 0 ? savedState[sectionId] : sectionId === "reading";
      this.setAccordionState(header, content, isExpanded);
      header.addEventListener("click", () => {
        const currentlyExpanded = header.getAttribute("aria-expanded") === "true";
        this.setAccordionState(header, content, !currentlyExpanded);
        this.saveAccordionState();
      });
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const currentlyExpanded = header.getAttribute("aria-expanded") === "true";
          this.setAccordionState(header, content, !currentlyExpanded);
          this.saveAccordionState();
        }
      });
    });
  }
  setAccordionState(header, content, expanded) {
    header.setAttribute("aria-expanded", expanded.toString());
    content.setAttribute("data-expanded", expanded.toString());
  }
  loadAccordionState() {
    try {
      const saved = localStorage.getItem("assist_accordion_state");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }
  saveAccordionState() {
    const state = {};
    document.querySelectorAll(".accordion-section").forEach((section) => {
      const header = section.querySelector(".accordion-header");
      const sectionId = section.dataset.section;
      if (header && sectionId) {
        state[sectionId] = header.getAttribute("aria-expanded") === "true";
      }
    });
    try {
      localStorage.setItem("assist_accordion_state", JSON.stringify(state));
    } catch {
    }
  }
  setupEventListeners() {
    this.applyVisibilitySettings();
    const optionsContainer = document.getElementById("options-container");
    const ocrOptionsContainer = document.getElementById("ocr-options-container");
    const ocrEnabled = document.getElementById("ocr-enabled");
    if (ocrEnabled) {
      if (!this.settings.ocr) {
        this.settings.ocr = {
          enabled: true,
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5
        };
      }
      ocrEnabled.checked = this.settings.ocr.enabled !== false;
      if (ocrEnabled.checked) {
        ocrOptionsContainer.classList.remove("hidden");
      } else {
        ocrOptionsContainer.classList.add("hidden");
      }
      ocrEnabled.addEventListener("change", (e) => {
        this.settings.ocr.enabled = e.target.checked;
        this.saveSettings();
        if (e.target.checked) {
          ocrOptionsContainer.classList.remove("hidden");
        } else {
          ocrOptionsContainer.classList.add("hidden");
        }
      });
    }
    const ttsEnabled = document.getElementById("tts-enabled");
    ttsEnabled.checked = this.settings?.tts?.enabled || false;
    if (ttsEnabled.checked) {
      optionsContainer.classList.remove("hidden");
    } else {
      optionsContainer.classList.add("hidden");
    }
    ttsEnabled.addEventListener("change", (e) => {
      this.settings.tts.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        optionsContainer.classList.remove("hidden");
      } else {
        optionsContainer.classList.add("hidden");
      }
      this.sendCommandToTab(e.target.checked ? "enable" : "disable");
    });
    const btnReadPage = document.getElementById("btn-read-page");
    btnReadPage.addEventListener("click", () => {
      console.log("[Popup] Read Page button clicked");
      this.sendCommandToTab("readPage");
      this.updateStatus("Reading page...", "speaking");
    });
    const btnTriggerOCR = document.getElementById("btn-trigger-ocr");
    if (btnTriggerOCR) {
      btnTriggerOCR.addEventListener("click", async () => {
        console.log("[Popup] OCR button clicked");
        this.updateStatus("Starting OCR...", "processing");
        try {
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: "TRIGGER_OCR"
          });
          if (response && response.success) {
            this.updateStatus("OCR complete!", "success");
          } else {
            this.updateStatus("OCR failed", "error");
          }
        } catch (error) {
          console.error("[Popup] OCR trigger failed:", error);
          this.updateStatus("OCR error: " + error.message, "error");
        }
      });
    }
    const ocrAutoReadingMode = document.getElementById("ocr-auto-reading-mode");
    if (ocrAutoReadingMode) {
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5
        };
      }
      ocrAutoReadingMode.checked = this.settings.ocr.autoActivateReadingMode !== false;
      ocrAutoReadingMode.addEventListener("change", (e) => {
        this.settings.ocr.autoActivateReadingMode = e.target.checked;
        this.saveSettings();
        console.log("[Popup] OCR auto-activate reading mode:", e.target.checked);
      });
    }
    const ocrUpscaleSlider = document.getElementById("ocr-upscale-factor");
    const ocrUpscaleLabel = document.getElementById("ocr-upscale-label");
    if (ocrUpscaleSlider && ocrUpscaleLabel) {
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5
        };
      }
      const getQualityLabel = (factor) => {
        if (factor <= 1) {
          return "Low (1.0x)";
        }
        if (factor <= 1.4) {
          return "Medium-Low (1.3x)";
        }
        if (factor <= 1.6) {
          return "Medium (1.5x)";
        }
        if (factor <= 1.8) {
          return "Medium-High (1.8x)";
        }
        return "High (2.0x)";
      };
      const initialFactor = this.settings.ocr.upscaleFactor ?? 1.5;
      ocrUpscaleSlider.value = initialFactor;
      ocrUpscaleLabel.textContent = getQualityLabel(initialFactor);
      ocrUpscaleSlider.addEventListener("input", (e) => {
        const factor = parseFloat(e.target.value);
        ocrUpscaleLabel.textContent = getQualityLabel(factor);
        this.settings.ocr.upscaleFactor = factor;
        this.saveSettings();
        console.log("[Popup] OCR upscale factor:", factor);
      });
    }
    const ocrLanguageSelect = document.getElementById("ocr-language");
    if (ocrLanguageSelect) {
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
          language: "eng",
          confidenceThreshold: 60,
          autoTTS: true
        };
      }
      ocrLanguageSelect.value = this.settings.ocr.language || "eng";
      ocrLanguageSelect.addEventListener("change", (e) => {
        this.settings.ocr.language = e.target.value;
        this.saveSettings();
        console.log("[Popup] OCR language changed to:", e.target.value);
      });
    }
    const ocrConfidenceSlider = document.getElementById("ocr-confidence-threshold");
    const ocrConfidenceLabel = document.getElementById("ocr-confidence-label");
    if (ocrConfidenceSlider && ocrConfidenceLabel) {
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
          language: "eng",
          confidenceThreshold: 60,
          autoTTS: true
        };
      }
      const initialConfidence = this.settings.ocr.confidenceThreshold ?? 60;
      ocrConfidenceSlider.value = initialConfidence;
      ocrConfidenceLabel.textContent = `${initialConfidence}%`;
      ocrConfidenceSlider.addEventListener("input", (e) => {
        const confidence = parseInt(e.target.value, 10);
        ocrConfidenceLabel.textContent = `${confidence}%`;
        this.settings.ocr.confidenceThreshold = confidence;
        this.saveSettings();
        console.log("[Popup] OCR confidence threshold:", confidence);
      });
    }
    const ocrAutoTTS = document.getElementById("ocr-auto-tts");
    if (ocrAutoTTS) {
      if (!this.settings.ocr) {
        this.settings.ocr = {
          autoActivateReadingMode: true,
          filterNoise: true,
          upscaleFactor: 1.5,
          language: "eng",
          confidenceThreshold: 60,
          autoTTS: true
        };
      }
      ocrAutoTTS.checked = this.settings.ocr.autoTTS !== false;
      ocrAutoTTS.addEventListener("change", (e) => {
        this.settings.ocr.autoTTS = e.target.checked;
        this.saveSettings();
        console.log("[Popup] OCR auto-TTS:", e.target.checked);
      });
    }
    const highlightMenuEnabled = document.getElementById("highlight-menu-enabled");
    const highlightMenuOptionsContainer = document.getElementById(
      "highlight-menu-options-container"
    );
    if (highlightMenuEnabled && highlightMenuOptionsContainer) {
      if (!this.settings.highlightMenu) {
        this.settings.highlightMenu = {
          enabled: true,
          showTTS: true,
          showDictionary: true,
          showTranslate: true,
          showSearch: true,
          showAnnotate: true,
          showCopy: true,
          autoHideDelay: 5e3
        };
      }
      highlightMenuEnabled.checked = this.settings.highlightMenu.enabled !== false;
      if (highlightMenuEnabled.checked) {
        highlightMenuOptionsContainer.classList.remove("hidden");
      } else {
        highlightMenuOptionsContainer.classList.add("hidden");
      }
      highlightMenuEnabled.addEventListener("change", (e) => {
        this.settings.highlightMenu.enabled = e.target.checked;
        this.saveSettings();
        this.saveHighlightMenuSettings();
        if (e.target.checked) {
          highlightMenuOptionsContainer.classList.remove("hidden");
        } else {
          highlightMenuOptionsContainer.classList.add("hidden");
        }
        console.log("[Popup] Highlight Menu enabled:", e.target.checked);
      });
    }
    const buttonToggles = [
      { id: "highlight-menu-show-tts", key: "showTTS" },
      { id: "highlight-menu-show-dictionary", key: "showDictionary" },
      { id: "highlight-menu-show-translate", key: "showTranslate" },
      { id: "highlight-menu-show-search", key: "showSearch" },
      { id: "highlight-menu-show-annotate", key: "showAnnotate" },
      { id: "highlight-menu-show-copy", key: "showCopy" }
    ];
    buttonToggles.forEach(({ id, key }) => {
      const toggle = document.getElementById(id);
      console.log(`[Popup] Looking for toggle ${id}:`, toggle ? "FOUND" : "NOT FOUND");
      if (toggle) {
        if (!this.settings.highlightMenu) {
          this.settings.highlightMenu = {};
        }
        toggle.checked = this.settings.highlightMenu[key] !== false;
        console.log(`[Popup] Toggle ${id} initial state:`, toggle.checked);
        toggle.addEventListener("change", (e) => {
          console.log(`[Popup] Toggle ${id} CHANGED to:`, e.target.checked);
          this.settings.highlightMenu[key] = e.target.checked;
          this.saveSettings();
          this.saveHighlightMenuSettings();
          console.log(`[Popup] Highlight Menu ${key}:`, e.target.checked);
        });
      }
    });
    const highlightMenuDelaySlider = document.getElementById("highlight-menu-auto-hide-delay");
    const highlightMenuDelayLabel = document.getElementById("highlight-menu-delay-label");
    if (highlightMenuDelaySlider && highlightMenuDelayLabel) {
      if (!this.settings.highlightMenu) {
        this.settings.highlightMenu = { autoHideDelay: 5e3 };
      }
      const delayValue = this.settings.highlightMenu.autoHideDelay || 5e3;
      highlightMenuDelaySlider.value = delayValue;
      highlightMenuDelayLabel.textContent = `${delayValue / 1e3} second${delayValue === 1e3 ? "" : "s"}`;
      highlightMenuDelaySlider.addEventListener("input", (e) => {
        const delay = parseInt(e.target.value);
        highlightMenuDelayLabel.textContent = `${delay / 1e3} second${delay === 1e3 ? "" : "s"}`;
        this.settings.highlightMenu.autoHideDelay = delay;
        this.saveSettings();
        this.saveHighlightMenuSettings();
        console.log("[Popup] Highlight Menu auto-hide delay:", delay);
      });
    }
    const dictionaryEnabled = document.getElementById("dictionary-enabled");
    const dictionaryOptionsContainer = document.getElementById("dictionary-options-container");
    if (dictionaryEnabled && dictionaryOptionsContainer) {
      if (!this.settings.dictionary) {
        this.settings.dictionary = {
          enabled: true,
          autoLookup: true,
          cacheSize: 50
        };
      }
      dictionaryEnabled.checked = this.settings.dictionary.enabled !== false;
      if (dictionaryEnabled.checked) {
        dictionaryOptionsContainer.classList.remove("hidden");
      } else {
        dictionaryOptionsContainer.classList.add("hidden");
      }
      dictionaryEnabled.addEventListener("change", (e) => {
        this.settings.dictionary.enabled = e.target.checked;
        this.saveSettings();
        if (e.target.checked) {
          dictionaryOptionsContainer.classList.remove("hidden");
        } else {
          dictionaryOptionsContainer.classList.add("hidden");
        }
        console.log("[Popup] Dictionary enabled:", e.target.checked);
      });
    }
    const dictionaryAutoLookup = document.getElementById("dictionary-auto-lookup");
    if (dictionaryAutoLookup) {
      dictionaryAutoLookup.checked = this.settings.dictionary?.autoLookup !== false;
      dictionaryAutoLookup.addEventListener("change", (e) => {
        if (!this.settings.dictionary) {
          this.settings.dictionary = {};
        }
        this.settings.dictionary.autoLookup = e.target.checked;
        this.saveSettings();
        console.log("[Popup] Dictionary auto-lookup:", e.target.checked);
      });
    }
    const dictionaryCacheSizeSlider = document.getElementById("dictionary-cache-size");
    const dictionaryCacheLabel = document.getElementById("dictionary-cache-label");
    if (dictionaryCacheSizeSlider && dictionaryCacheLabel) {
      const cacheSize = this.settings.dictionary?.cacheSize || 50;
      dictionaryCacheSizeSlider.value = cacheSize;
      dictionaryCacheLabel.textContent = `${cacheSize} entr${cacheSize === 1 ? "y" : "ies"}`;
      dictionaryCacheSizeSlider.addEventListener("input", (e) => {
        const size = parseInt(e.target.value);
        dictionaryCacheLabel.textContent = `${size} entr${size === 1 ? "y" : "ies"}`;
        if (!this.settings.dictionary) {
          this.settings.dictionary = {};
        }
        this.settings.dictionary.cacheSize = size;
        this.saveSettings();
        console.log("[Popup] Dictionary cache size:", size);
      });
    }
    const translationEnabled = document.getElementById("translation-enabled");
    const translationOptionsContainer = document.getElementById("translation-options-container");
    if (translationEnabled && translationOptionsContainer) {
      if (!this.settings.translation) {
        this.settings.translation = {
          enabled: true,
          targetLanguage: "en"
        };
      }
      translationEnabled.checked = this.settings.translation.enabled !== false;
      if (translationEnabled.checked) {
        translationOptionsContainer.classList.remove("hidden");
      } else {
        translationOptionsContainer.classList.add("hidden");
      }
      translationEnabled.addEventListener("change", (e) => {
        this.settings.translation.enabled = e.target.checked;
        this.saveSettings();
        if (e.target.checked) {
          translationOptionsContainer.classList.remove("hidden");
        } else {
          translationOptionsContainer.classList.add("hidden");
        }
        console.log("[Popup] Translation enabled:", e.target.checked);
      });
    }
    const btnTranslatePage = document.getElementById("btn-translate-page");
    const targetLanguageSelect = document.getElementById("translation-target-language");
    if (btnTranslatePage && targetLanguageSelect) {
      targetLanguageSelect.value = this.settings.translation?.targetLanguage || "en";
      targetLanguageSelect.addEventListener("change", (e) => {
        if (!this.settings.translation) {
          this.settings.translation = { enabled: true };
        }
        this.settings.translation.targetLanguage = e.target.value;
        this.saveSettings();
        console.log("[Popup] Translation target language:", e.target.value);
      });
      btnTranslatePage.addEventListener("click", async () => {
        console.log("[Popup] Translate Page button clicked");
        this.updateStatus("Translating page...", "processing");
        const targetLang = targetLanguageSelect.value;
        try {
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: "TRANSLATE_PAGE",
            targetLang
          });
          if (response && response.success) {
            this.updateStatus("Page translated!", "success");
          } else {
            this.updateStatus("Translation failed", "error");
          }
        } catch (error) {
          console.error("[Popup] Translation trigger failed:", error);
          this.updateStatus("Translation error: " + error.message, "error");
        }
      });
    }
    const citationEnabled = document.getElementById("citation-enabled");
    const citationOptionsContainer = document.getElementById("citation-options-container");
    if (citationEnabled && citationOptionsContainer) {
      citationEnabled.checked = this.settings.citation?.enabled !== false;
      if (citationEnabled.checked) {
        citationOptionsContainer.classList.remove("hidden");
      } else {
        citationOptionsContainer.classList.add("hidden");
      }
      citationEnabled.addEventListener("change", (e) => {
        if (!this.settings.citation) {
          this.settings.citation = { enabled: true };
        }
        this.settings.citation.enabled = e.target.checked;
        this.saveSettings();
        if (e.target.checked) {
          citationOptionsContainer.classList.remove("hidden");
        } else {
          citationOptionsContainer.classList.add("hidden");
        }
        console.log("[Popup] Citation enabled:", e.target.checked);
      });
    }
    const btnSaveCitation = document.getElementById("btn-save-citation");
    if (btnSaveCitation) {
      btnSaveCitation.addEventListener("click", async () => {
        console.log("[Popup] Save Citation button clicked");
        this.updateStatus("Extracting citation...", "processing");
        try {
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: "SAVE_CITATION"
          });
          if (response && response.success) {
            this.updateStatus("Citation saved!", "success");
            await this.updateCitationCount();
            if (this.citationPanelExpanded && this.citationPanel) {
              await this.citationPanel.loadCitations();
            }
          } else {
            this.updateStatus("Failed to save citation", "error");
          }
        } catch (error) {
          console.error("[Popup] Citation save failed:", error);
          this.updateStatus("Citation error: " + error.message, "error");
        }
      });
    }
    const btnCitationManager = document.getElementById("btn-citation-manager");
    if (btnCitationManager) {
      btnCitationManager.addEventListener("click", async () => {
        console.log("[Popup] Citation Manager button clicked");
        try {
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: "OPEN_BIBLIOGRAPHY_MANAGER"
          });
          if (response?.success) {
            this.updateStatus("Opening Citation Library...", "info");
            setTimeout(() => window.close(), 300);
          } else {
            throw new Error(response?.error || "Failed to open");
          }
        } catch (error) {
          console.error("[Popup] Error opening citation manager:", error);
          this.updateStatus("Failed to open Citation Library", "error");
        }
      });
    }
    const btnCitationProjects = document.getElementById("btn-citation-projects");
    if (btnCitationProjects) {
      btnCitationProjects.addEventListener("click", async () => {
        console.log("[Popup] Citation Projects button clicked");
        try {
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: "OPEN_PROJECT_MANAGER"
          });
          if (response?.success) {
            this.updateStatus("Opening Projects...", "info");
            setTimeout(() => window.close(), 300);
          } else {
            throw new Error(response?.error || "Failed to open");
          }
        } catch (error) {
          console.error("[Popup] Error opening project manager:", error);
          this.updateStatus("Failed to open Projects", "error");
        }
      });
    }
    this.setupCitationPanel();
    const voiceSelect = document.getElementById("voice-select");
    voiceSelect.addEventListener("change", (e) => {
      this.settings.tts.voice = e.target.value;
      this.saveSettings();
      this.sendCommandToTab("setVoice", { voice: e.target.value });
    });
    const rateSlider = document.getElementById("rate-slider");
    const rateValue = document.getElementById("rate-value");
    rateSlider.value = this.settings?.tts?.rate || 1;
    rateValue.textContent = `${rateSlider.value}x`;
    rateSlider.addEventListener("input", (e) => {
      const rate = parseFloat(e.target.value);
      rateValue.textContent = `${rate}x`;
      this.settings.tts.rate = rate;
      this.saveSettings();
      this.sendCommandToTab("setRate", { rate });
      this.updatePresetButtonStates(rate);
    });
    this.setupSpeedPresets();
    const pitchSlider = document.getElementById("pitch-slider");
    const pitchValue = document.getElementById("pitch-value");
    pitchSlider.value = this.settings?.tts?.pitch || 1;
    pitchValue.textContent = pitchSlider.value;
    pitchSlider.addEventListener("input", (e) => {
      const pitch = parseFloat(e.target.value);
      pitchValue.textContent = pitch;
      this.settings.tts.pitch = pitch;
      this.saveSettings();
      this.sendCommandToTab("setPitch", { pitch });
    });
    const volumeSlider = document.getElementById("volume-slider");
    const volumeValue = document.getElementById("volume-value");
    volumeSlider.value = this.settings?.tts?.volume || 1;
    volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;
    volumeSlider.addEventListener("input", (e) => {
      const volume = parseFloat(e.target.value);
      volumeValue.textContent = `${Math.round(volume * 100)}%`;
      this.settings.tts.volume = volume;
      this.saveSettings();
      this.sendCommandToTab("setVolume", { volume });
    });
    const highlightOptionsContainer = document.getElementById("highlight-options-container");
    const highlightEnabled = document.getElementById("highlight-enabled");
    highlightEnabled.checked = this.settings?.tts?.highlightEnabled ?? true;
    if (highlightEnabled.checked) {
      highlightOptionsContainer.classList.remove("hidden");
    } else {
      highlightOptionsContainer.classList.add("hidden");
    }
    highlightEnabled.addEventListener("change", (e) => {
      this.settings.tts.highlightEnabled = e.target.checked;
      this.saveSettings();
      this.sendCommandToTab("setHighlighting", { enabled: e.target.checked });
      if (e.target.checked) {
        highlightOptionsContainer.classList.remove("hidden");
      } else {
        highlightOptionsContainer.classList.add("hidden");
      }
    });
    const highlightColor = document.getElementById("highlight-color");
    highlightColor.value = this.settings?.tts?.highlightColor || "#FFEB3B";
    highlightColor.addEventListener("change", (e) => {
      this.settings.tts.highlightColor = e.target.value;
      this.saveSettings();
      this.sendCommandToTab("setHighlightColor", { color: e.target.value });
    });
    const highlightOpacity = document.getElementById("highlight-opacity");
    const opacityValue = document.getElementById("opacity-value");
    highlightOpacity.value = this.settings?.tts?.highlightOpacity || 0.7;
    opacityValue.textContent = `${Math.round(highlightOpacity.value * 100)}%`;
    highlightOpacity.addEventListener("input", (e) => {
      const opacity = parseFloat(e.target.value);
      opacityValue.textContent = `${Math.round(opacity * 100)}%`;
      this.settings.tts.highlightOpacity = opacity;
      this.saveSettings();
      this.sendCommandToTab("setHighlightOpacity", { opacity });
    });
    const wordByWordEnabled = document.getElementById("word-by-word-enabled");
    wordByWordEnabled.checked = this.settings?.tts?.wordByWordEnabled || false;
    wordByWordEnabled.addEventListener("change", (e) => {
      this.settings.tts.wordByWordEnabled = e.target.checked;
      this.saveSettings();
      this.sendCommandToTab("setWordByWord", { enabled: e.target.checked });
    });
    this.setupTextCustomization();
    this.setupReadingGuide();
    this.setupFocusMode();
    this.setupScreenOverlay();
    this.setupReducedMotion();
    this.setupMediaControl();
    this.setupDarkMode();
    this.setupSimplify();
    this.setupReadingProgress();
    this.setupPomodoro();
    this.setupStargardt();
    this.setupCanvasIntegration();
    this.setupSTT();
    this.setupReadingMode();
    this.setupDyslexiaMode();
    this.setupAnnotations();
    this.setupLocalLLM();
    document.getElementById("link-settings").addEventListener("click", (e) => {
      e.preventDefault();
      console.log("[Popup] Settings clicked");
    });
    document.getElementById("btn-reset").addEventListener("click", () => {
      if (confirm("Reset all settings to defaults? This cannot be undone.")) {
        this.resetToDefaults();
      }
    });
    document.getElementById("btn-help").addEventListener("click", () => {
      chrome.tabs.create({
        url: "https://github.com/MarJone/AssisT#readme"
      });
    });
    const btnDiscovery = document.getElementById("btn-discovery");
    if (btnDiscovery) {
      btnDiscovery.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "OPEN_DISCOVERY_QUIZ" });
        window.close();
      });
    }
    document.getElementById("btn-options").addEventListener("click", () => {
      this.showAdvancedOptions();
    });
  }
  resetToDefaults() {
    this.settings.tts = {
      enabled: false,
      voice: "default",
      rate: 1,
      pitch: 1,
      volume: 1,
      highlightEnabled: true,
      highlightColor: "#FFEB3B",
      highlightOpacity: 0.7
    };
    this.saveSettings();
    window.location.reload();
  }
  setupSpeedPresets() {
    const presetButtons = document.querySelectorAll(".preset-btn");
    const rateSlider = document.getElementById("rate-slider");
    const rateValue = document.getElementById("rate-value");
    presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const speed = parseFloat(btn.getAttribute("data-speed"));
        rateSlider.value = speed;
        rateValue.textContent = `${speed}x`;
        this.settings.tts.rate = speed;
        this.saveSettings();
        this.sendCommandToTab("setRate", { rate: speed });
        this.updatePresetButtonStates(speed);
      });
    });
    const currentRate = this.settings?.tts?.rate || 1;
    this.updatePresetButtonStates(currentRate);
  }
  updatePresetButtonStates(currentRate) {
    const presetButtons = document.querySelectorAll(".preset-btn");
    presetButtons.forEach((btn) => {
      const btnSpeed = parseFloat(btn.getAttribute("data-speed"));
      if (Math.abs(btnSpeed - currentRate) < 0.01) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }
  showAdvancedOptions() {
    const modal = document.createElement("div");
    modal.id = "advanced-options-modal";
    modal.className = "modal-overlay";
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
    this.setupModalTabs(modal);
    this.setupModalActions(modal);
    this.loadModalSettings();
  }
  setupModalTabs(modal) {
    const tabs = modal.querySelectorAll(".modal-tab");
    const contents = modal.querySelectorAll(".tab-content");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        contents.forEach((c) => c.classList.remove("active"));
        tab.classList.add("active");
        const tabId = tab.getAttribute("data-tab");
        modal.querySelector(`#tab-${tabId}`).classList.add("active");
      });
    });
  }
  setupModalActions(modal) {
    modal.querySelector("#modal-close").addEventListener("click", () => {
      modal.remove();
    });
    modal.querySelector("#modal-cancel").addEventListener("click", () => {
      modal.remove();
    });
    modal.querySelector("#modal-save").addEventListener("click", () => {
      this.saveModalSettings();
      modal.remove();
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }
  loadModalSettings() {
    const visibility = this.settings.ui_visibility || {};
    const loadCheckbox = (id, visibilityKey, defaultValue = true) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.checked = visibility[visibilityKey] !== void 0 ? visibility[visibilityKey] : defaultValue;
      }
    };
    loadCheckbox("show-ocr", "show_ocr");
    loadCheckbox("show-highlight-menu", "show_highlight_menu");
    loadCheckbox("show-dictionary", "show_dictionary");
    loadCheckbox("show-highlighting", "show_highlighting");
    loadCheckbox("show-speed-presets", "show_speed_presets");
    loadCheckbox("show-text-customization", "show_text_customization");
    loadCheckbox("show-reading-guide", "show_reading_guide");
    loadCheckbox("show-focus-mode", "show_focus_mode");
    loadCheckbox("show-stt", "show_stt", false);
    loadCheckbox("show-screen-overlay", "show_screen_overlay");
    loadCheckbox("show-canvas-integration", "show_canvas_integration", false);
    loadCheckbox("show-moodle-integration", "show_moodle_integration", false);
    loadCheckbox("show-google-classroom-integration", "show_google_classroom_integration", false);
    loadCheckbox("show-dyslexia-mode", "show_dyslexia_mode");
    loadCheckbox("show-annotations", "show_annotations");
    const storageMode = document.getElementById("annotations-storage-mode");
    if (storageMode) {
      const currentMode = this.settings.annotations?.storageMode || "local";
      storageMode.value = currentMode;
      console.warn("[Popup] Attaching storage mode change listener. Current mode:", currentMode);
      let committedMode = currentMode;
      storageMode.addEventListener("change", async (e) => {
        console.warn("[Popup] ⚡ CHANGE EVENT FIRED");
        const newMode = e.target.value;
        console.warn("[Popup] Storage mode change detected:", {
          committedMode,
          newMode,
          willMigrate: newMode !== committedMode
        });
        if (newMode !== committedMode) {
          e.target.value = committedMode;
          await this.handleStorageMigration(committedMode, newMode);
          committedMode = newMode;
          e.target.value = newMode;
        }
      });
    }
    if (!this.settings.annotations) {
      this.settings.annotations = {
        storageMode: "local",
        defaultColor: "yellow",
        defaultNoteSize: "medium",
        autoSave: true,
        showBadge: true,
        sidebarAutoOpen: true
      };
    }
    const defaultColorSelect = document.getElementById("annotations-default-color");
    if (defaultColorSelect) {
      defaultColorSelect.value = this.settings.annotations.defaultColor || "yellow";
      defaultColorSelect.addEventListener("change", (e) => {
        this.settings.annotations.defaultColor = e.target.value;
        this.saveSettings();
        console.log("[Popup] Annotation default color changed to:", e.target.value);
      });
    }
    const defaultSizeSelect = document.getElementById("annotations-default-size");
    if (defaultSizeSelect) {
      defaultSizeSelect.value = this.settings.annotations.defaultNoteSize || "medium";
      defaultSizeSelect.addEventListener("change", (e) => {
        this.settings.annotations.defaultNoteSize = e.target.value;
        this.saveSettings();
        console.log("[Popup] Annotation default size changed to:", e.target.value);
      });
    }
    const autoSaveToggle = document.getElementById("annotations-auto-save");
    if (autoSaveToggle) {
      autoSaveToggle.checked = this.settings.annotations.autoSave !== false;
      autoSaveToggle.addEventListener("change", (e) => {
        this.settings.annotations.autoSave = e.target.checked;
        this.saveSettings();
        console.log("[Popup] Annotation auto-save:", e.target.checked);
      });
    }
    const showBadgeToggle = document.getElementById("annotations-show-badge");
    if (showBadgeToggle) {
      showBadgeToggle.checked = this.settings.annotations.showBadge !== false;
      showBadgeToggle.addEventListener("change", (e) => {
        this.settings.annotations.showBadge = e.target.checked;
        this.saveSettings();
        console.log("[Popup] Annotation show badge:", e.target.checked);
      });
    }
    const sidebarAutoOpenToggle = document.getElementById("annotations-sidebar-auto-open");
    if (sidebarAutoOpenToggle) {
      sidebarAutoOpenToggle.checked = this.settings.annotations.sidebarAutoOpen !== false;
      sidebarAutoOpenToggle.addEventListener("change", (e) => {
        this.settings.annotations.sidebarAutoOpen = e.target.checked;
        this.saveSettings();
        console.log("[Popup] Annotation sidebar auto-open:", e.target.checked);
      });
    }
    loadCheckbox("show-translation", "show_translation");
    if (!this.settings.translationSettings) {
      this.settings.translationSettings = {
        preferredEngine: "libre",
        googleApiKey: "",
        cacheEnabled: true,
        cacheDuration: 7,
        defaultTargetLanguage: "en"
      };
    }
    const engineLibre = document.getElementById("translation-engine-libre");
    const engineGoogle = document.getElementById("translation-engine-google");
    const googleApiKeyContainer = document.getElementById("google-api-key-container");
    if (engineLibre && engineGoogle) {
      const preferredEngine = this.settings.translationSettings.preferredEngine || "libre";
      if (preferredEngine === "libre") {
        engineLibre.checked = true;
      } else {
        engineGoogle.checked = true;
      }
      if (googleApiKeyContainer) {
        googleApiKeyContainer.style.display = preferredEngine === "google" ? "block" : "none";
      }
      engineLibre.addEventListener("change", () => {
        if (googleApiKeyContainer) {
          googleApiKeyContainer.style.display = "none";
        }
        this.settings.translationSettings.preferredEngine = "libre";
        this.saveSettings();
        console.log("[Popup] Translation engine changed to: LibreTranslate");
      });
      engineGoogle.addEventListener("change", () => {
        if (googleApiKeyContainer) {
          googleApiKeyContainer.style.display = "block";
        }
        this.settings.translationSettings.preferredEngine = "google";
        this.saveSettings();
        console.log("[Popup] Translation engine changed to: Google Translate");
      });
    }
    const googleApiKeyInput = document.getElementById("translation-google-api-key");
    const googleApiKeyToggle = document.getElementById("translation-toggle-api-key");
    const googleApiKeyStatus = document.getElementById("translation-api-key-status");
    if (googleApiKeyInput) {
      googleApiKeyInput.value = this.settings.translationSettings.googleApiKey || "";
      const validateApiKey = (key) => {
        const apiKeyPattern = /^AIza[A-Za-z0-9_-]{35}$/;
        return apiKeyPattern.test(key);
      };
      const updateApiKeyStatus = (key) => {
        if (!key) {
          googleApiKeyStatus.textContent = "";
        } else if (validateApiKey(key)) {
          googleApiKeyStatus.textContent = "✓";
          googleApiKeyStatus.style.color = "#4caf50";
        } else {
          googleApiKeyStatus.textContent = "✗";
          googleApiKeyStatus.style.color = "#f44336";
        }
      };
      updateApiKeyStatus(googleApiKeyInput.value);
      googleApiKeyInput.addEventListener("input", (e) => {
        this.settings.translationSettings.googleApiKey = e.target.value;
        updateApiKeyStatus(e.target.value);
        this.saveSettings();
        console.log("[Popup] Translation Google API key updated");
      });
      if (googleApiKeyToggle) {
        googleApiKeyToggle.addEventListener("click", () => {
          if (googleApiKeyInput.type === "password") {
            googleApiKeyInput.type = "text";
            googleApiKeyToggle.textContent = "Hide";
          } else {
            googleApiKeyInput.type = "password";
            googleApiKeyToggle.textContent = "Show";
          }
        });
      }
    }
    const defaultLanguageSelect = document.getElementById("translation-default-language");
    if (defaultLanguageSelect) {
      defaultLanguageSelect.value = this.settings.translationSettings.defaultTargetLanguage || "en";
      defaultLanguageSelect.addEventListener("change", (e) => {
        this.settings.translationSettings.defaultTargetLanguage = e.target.value;
        this.saveSettings();
        console.log("[Popup] Translation default target language:", e.target.value);
      });
    }
    const cacheEnabledToggle = document.getElementById("translation-cache-enabled");
    const cacheSettingsDiv = document.getElementById("translation-cache-settings");
    if (cacheEnabledToggle) {
      cacheEnabledToggle.checked = this.settings.translationSettings.cacheEnabled !== false;
      if (cacheSettingsDiv) {
        cacheSettingsDiv.style.display = cacheEnabledToggle.checked ? "block" : "none";
      }
      cacheEnabledToggle.addEventListener("change", (e) => {
        this.settings.translationSettings.cacheEnabled = e.target.checked;
        if (cacheSettingsDiv) {
          cacheSettingsDiv.style.display = e.target.checked ? "block" : "none";
        }
        this.saveSettings();
        console.log("[Popup] Translation cache enabled:", e.target.checked);
      });
    }
    const cacheDurationSlider = document.getElementById("translation-cache-duration");
    const cacheDurationLabel = document.getElementById("translation-cache-duration-label");
    if (cacheDurationSlider && cacheDurationLabel) {
      const duration = this.settings.translationSettings.cacheDuration || 7;
      cacheDurationSlider.value = duration;
      cacheDurationLabel.textContent = `${duration} day${duration === 1 ? "" : "s"}`;
      cacheDurationSlider.addEventListener("input", (e) => {
        const days = parseInt(e.target.value);
        cacheDurationLabel.textContent = `${days} day${days === 1 ? "" : "s"}`;
        this.settings.translationSettings.cacheDuration = days;
        this.saveSettings();
        console.log("[Popup] Translation cache duration:", days);
      });
    }
    const clearCacheButton = document.getElementById("translation-clear-cache");
    const cacheCountSpan = document.getElementById("translation-cache-count");
    if (clearCacheButton && cacheCountSpan) {
      chrome.storage.local.get("translationCache", (result) => {
        const cacheCount = result.translationCache ? Object.keys(result.translationCache).length : 0;
        cacheCountSpan.textContent = cacheCount;
      });
      clearCacheButton.addEventListener("click", async () => {
        await chrome.storage.local.set({ translationCache: {} });
        cacheCountSpan.textContent = "0";
        console.log("[Popup] Translation cache cleared");
        alert("Translation cache cleared successfully!");
      });
    }
    const compactMode = document.getElementById("compact-mode");
    if (compactMode) {
      compactMode.checked = this.settings.appearance?.compact_mode !== false;
    }
    const showIcons = document.getElementById("show-icons");
    if (showIcons) {
      showIcons.checked = this.settings.appearance?.show_icons !== false;
    }
    const debugMode = document.getElementById("debug-mode");
    if (debugMode) {
      debugMode.checked = this.settings.appearance?.debug_mode === true;
    }
    this.loadKeyboardShortcuts();
  }
  async loadKeyboardShortcuts() {
    const shortcuts = await loadShortcuts();
    const tbody = document.getElementById("shortcuts-table-body");
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";
    for (const [key, shortcut] of Object.entries(shortcuts)) {
      const row = document.createElement("tr");
      row.style.cssText = "border-bottom: 1px solid #e0e0e0;";
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
    document.querySelectorAll(".btn-edit-shortcut").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const key = e.target.getAttribute("data-key");
        this.startShortcutRecording(key, shortcuts);
      });
    });
    const resetBtn = document.getElementById("btn-reset-shortcuts");
    if (resetBtn) {
      resetBtn.onclick = async () => {
        if (confirm("Reset all keyboard shortcuts to defaults?")) {
          await resetShortcuts();
          this.loadKeyboardShortcuts();
          this.updateStatus("Shortcuts reset to defaults");
        }
      };
    }
  }
  startShortcutRecording(featureKey, currentShortcuts) {
    const overlay = document.getElementById("shortcut-recording-overlay");
    const display = document.getElementById("recording-display");
    const errorDiv = document.getElementById("recording-error");
    const saveBtn = document.getElementById("btn-recording-save");
    const cancelBtn = document.getElementById("btn-recording-cancel");
    if (!overlay) {
      return;
    }
    overlay.style.display = "flex";
    display.textContent = "Waiting...";
    errorDiv.textContent = "";
    saveBtn.disabled = true;
    let recordedShortcut = null;
    let isValid = false;
    const handleKeyPress = (e) => {
      e.preventDefault();
      e.stopPropagation();
      recordedShortcut = eventToShortcut(e);
      display.textContent = recordedShortcut;
      const validation = validateShortcut(recordedShortcut, currentShortcuts, featureKey);
      if (validation.valid) {
        errorDiv.textContent = "";
        errorDiv.style.color = "#28a745";
        errorDiv.textContent = "✓ Valid shortcut";
        saveBtn.disabled = false;
        isValid = true;
      } else {
        errorDiv.style.color = "#dc3545";
        errorDiv.textContent = validation.error;
        saveBtn.disabled = true;
        isValid = false;
      }
    };
    document.addEventListener("keydown", handleKeyPress);
    const cancelHandler = () => {
      document.removeEventListener("keydown", handleKeyPress);
      overlay.style.display = "none";
    };
    cancelBtn.onclick = cancelHandler;
    saveBtn.onclick = async () => {
      if (isValid && recordedShortcut) {
        currentShortcuts[featureKey] = recordedShortcut;
        await saveShortcuts(currentShortcuts);
        const display2 = document.querySelector(`.shortcut-display[data-key="${featureKey}"]`);
        if (display2) {
          display2.textContent = recordedShortcut;
        }
        document.removeEventListener("keydown", handleKeyPress);
        overlay.style.display = "none";
        this.updateStatus(`Shortcut updated: ${SHORTCUT_LABELS[featureKey]}`);
      }
    };
    const escapeHandler = (e) => {
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        cancelHandler();
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);
  }
  saveModalSettings() {
    if (!this.settings.ui_visibility) {
      this.settings.ui_visibility = {};
    }
    if (!this.settings.appearance) {
      this.settings.appearance = {};
    }
    const oldVisibility = { ...this.settings.ui_visibility };
    const saveCheckbox = (id, visibilityKey) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        this.settings.ui_visibility[visibilityKey] = checkbox.checked;
      }
    };
    saveCheckbox("show-ocr", "show_ocr");
    saveCheckbox("show-highlight-menu", "show_highlight_menu");
    saveCheckbox("show-dictionary", "show_dictionary");
    saveCheckbox("show-highlighting", "show_highlighting");
    saveCheckbox("show-speed-presets", "show_speed_presets");
    saveCheckbox("show-text-customization", "show_text_customization");
    saveCheckbox("show-reading-guide", "show_reading_guide");
    saveCheckbox("show-focus-mode", "show_focus_mode");
    saveCheckbox("show-stt", "show_stt");
    saveCheckbox("show-screen-overlay", "show_screen_overlay");
    saveCheckbox("show-canvas-integration", "show_canvas_integration");
    saveCheckbox("show-moodle-integration", "show_moodle_integration");
    saveCheckbox("show-google-classroom-integration", "show_google_classroom_integration");
    saveCheckbox("show-dyslexia-mode", "show_dyslexia_mode");
    saveCheckbox("show-annotations", "show_annotations");
    saveCheckbox("show-translation", "show_translation");
    const storageMode = document.getElementById("annotations-storage-mode");
    if (storageMode) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.storageMode = storageMode.value;
    }
    const defaultColorSelect = document.getElementById("annotations-default-color");
    if (defaultColorSelect) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.defaultColor = defaultColorSelect.value;
    }
    const defaultSizeSelect = document.getElementById("annotations-default-size");
    if (defaultSizeSelect) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.defaultNoteSize = defaultSizeSelect.value;
    }
    const autoSaveToggle = document.getElementById("annotations-auto-save");
    if (autoSaveToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.autoSave = autoSaveToggle.checked;
    }
    const showBadgeToggle = document.getElementById("annotations-show-badge");
    if (showBadgeToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.showBadge = showBadgeToggle.checked;
    }
    const sidebarAutoOpenToggle = document.getElementById("annotations-sidebar-auto-open");
    if (sidebarAutoOpenToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.sidebarAutoOpen = sidebarAutoOpenToggle.checked;
    }
    const compactMode = document.getElementById("compact-mode");
    if (compactMode) {
      this.settings.appearance.compact_mode = compactMode.checked;
    }
    const showIcons = document.getElementById("show-icons");
    if (showIcons) {
      this.settings.appearance.show_icons = showIcons.checked;
    }
    const debugMode = document.getElementById("debug-mode");
    if (debugMode) {
      this.settings.appearance.debug_mode = debugMode.checked;
    }
    this.saveSettings();
    this.updateStatus("Settings saved");
    console.log("[Popup] Modal settings saved:", {
      ui_visibility: this.settings.ui_visibility,
      appearance: this.settings.appearance
    });
    const visibilityChanged = Object.keys(oldVisibility).some(
      (key) => oldVisibility[key] !== this.settings.ui_visibility[key]
    ) || Object.keys(this.settings.ui_visibility).some(
      (key) => oldVisibility[key] !== this.settings.ui_visibility[key]
    );
    if (visibilityChanged) {
      console.log("[Popup] Visibility changed, reloading...");
      setTimeout(() => window.location.reload(), 300);
    }
  }
  async loadVoices() {
    try {
      const voices = speechSynthesis.getVoices();
      if (voices.length === 0) {
        speechSynthesis.addEventListener("voiceschanged", () => {
          this.populateVoices(speechSynthesis.getVoices());
        });
      } else {
        this.populateVoices(voices);
      }
    } catch (error) {
      console.error("[Popup] Error loading voices:", error);
    }
  }
  populateVoices(voices) {
    const voiceSelect = document.getElementById("voice-select");
    voiceSelect.innerHTML = "";
    const preferredVoice = voices.find(
      (v) => v.name.includes("Google") && v.name.includes("UK") && v.name.includes("Female")
    ) || voices.find((v) => v.lang.startsWith("en-GB") && v.name.toLowerCase().includes("female")) || voices.find((v) => v.lang.startsWith("en-") && v.name.toLowerCase().includes("female"));
    if (preferredVoice && (!this.settings?.tts?.voice || this.settings.tts.voice === "default")) {
      this.settings.tts.voice = preferredVoice.name;
      this.saveSettings();
    }
    const grouped = voices.reduce((acc, voice) => {
      const lang = voice.lang.split("-")[0];
      if (!acc[lang]) {
        acc[lang] = [];
      }
      acc[lang].push(voice);
      return acc;
    }, {});
    Object.keys(grouped).sort().forEach((lang) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = lang.toUpperCase();
      grouped[lang].forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.name;
        option.textContent = voice.name + (voice.default ? " (Default)" : "");
        option.selected = voice.name === this.settings?.tts?.voice;
        optgroup.appendChild(option);
      });
      voiceSelect.appendChild(optgroup);
    });
    console.log("[Popup] Loaded", voices.length, "voices");
    if (preferredVoice) {
      console.log("[Popup] Default voice set to:", preferredVoice.name);
    }
  }
  async sendCommandToTab(command, data = {}) {
    if (!this.currentTab) {
      console.warn("[Popup] No current tab");
      return;
    }
    if (!this.currentTab.url || this.currentTab.url.startsWith("chrome://") || this.currentTab.url.startsWith("chrome-extension://") || this.currentTab.url.startsWith("edge://") || this.currentTab.url.startsWith("about:")) {
      console.warn("[Popup] Cannot access this page type");
      this.updateStatus("Cannot access browser system pages", "error");
      return;
    }
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: MESSAGE_TYPES.TTS_COMMAND,
        data: { command, ...data }
      });
    } catch (error) {
      console.error("[Popup] Error sending command:", error);
      if (error.message.includes("Could not establish connection")) {
        this.updateStatus("Please reload the page", "error");
      } else {
        this.updateStatus("Error: Tab not accessible", "error");
      }
    }
  }
  updateUI() {
  }
  updateStatus(message, type = "") {
    const statusIndicator = document.getElementById("status-indicator");
    statusIndicator.textContent = message;
    statusIndicator.className = "status-indicator " + type;
  }
  // ============================================================
  // SPRINT 3 FEATURE: TEXT CUSTOMIZATION
  // ============================================================
  setupTextCustomization() {
    if (!this.settings.textCustomization) {
      this.settings.textCustomization = {
        enabled: false,
        fontFamily: "lexend",
        lineSpacing: 1.5,
        letterSpacing: 0.12,
        wordSpacing: 0.16,
        paragraphSpacing: 2
      };
    }
    const textCustomizationEnabled = document.getElementById("text-customization-enabled");
    const textCustomizationDescription = document.getElementById("text-customization-description");
    const textCustomizationOptions = document.getElementById("text-customization-options");
    textCustomizationEnabled.checked = this.settings.textCustomization.enabled || false;
    if (textCustomizationEnabled.checked) {
      textCustomizationDescription.classList.remove("hidden");
      textCustomizationOptions.classList.remove("hidden");
    } else {
      textCustomizationDescription.classList.add("hidden");
      textCustomizationOptions.classList.add("hidden");
    }
    textCustomizationEnabled.addEventListener("change", (e) => {
      this.settings.textCustomization.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        textCustomizationDescription.classList.remove("hidden");
        textCustomizationOptions.classList.remove("hidden");
      } else {
        textCustomizationDescription.classList.add("hidden");
        textCustomizationOptions.classList.add("hidden");
      }
    });
    const fontFamilySelect = document.getElementById("text-font-family");
    fontFamilySelect.value = this.settings.textCustomization.fontFamily || "lexend";
    fontFamilySelect.addEventListener("change", (e) => {
      this.settings.textCustomization.fontFamily = e.target.value;
      this.saveSettings();
    });
    const lineSpacingSlider = document.getElementById("text-line-spacing");
    const lineSpacingValue = document.getElementById("text-line-spacing-value");
    lineSpacingSlider.value = this.settings.textCustomization.lineSpacing || 1.5;
    lineSpacingValue.textContent = lineSpacingSlider.value;
    lineSpacingSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      lineSpacingValue.textContent = value;
      this.settings.textCustomization.lineSpacing = value;
      this.saveSettings();
    });
    const letterSpacingSlider = document.getElementById("text-letter-spacing");
    const letterSpacingValue = document.getElementById("text-letter-spacing-value");
    const letterSpacingPercent = Math.round(
      (this.settings.textCustomization.letterSpacing || 0.12) * 100
    );
    letterSpacingSlider.value = letterSpacingPercent;
    letterSpacingValue.textContent = letterSpacingPercent + "%";
    letterSpacingSlider.addEventListener("input", (e) => {
      const percent = parseInt(e.target.value);
      letterSpacingValue.textContent = percent + "%";
      this.settings.textCustomization.letterSpacing = percent / 100;
      this.saveSettings();
    });
    const wordSpacingSlider = document.getElementById("text-word-spacing");
    const wordSpacingValue = document.getElementById("text-word-spacing-value");
    const wordSpacingPercent = Math.round(
      (this.settings.textCustomization.wordSpacing || 0.16) * 100
    );
    wordSpacingSlider.value = wordSpacingPercent;
    wordSpacingValue.textContent = wordSpacingPercent + "%";
    wordSpacingSlider.addEventListener("input", (e) => {
      const percent = parseInt(e.target.value);
      wordSpacingValue.textContent = percent + "%";
      this.settings.textCustomization.wordSpacing = percent / 100;
      this.saveSettings();
    });
    const paragraphSpacingSlider = document.getElementById("text-paragraph-spacing");
    const paragraphSpacingValue = document.getElementById("text-paragraph-spacing-value");
    paragraphSpacingSlider.value = this.settings.textCustomization.paragraphSpacing || 2;
    paragraphSpacingValue.textContent = paragraphSpacingSlider.value + "em";
    paragraphSpacingSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      paragraphSpacingValue.textContent = value + "em";
      this.settings.textCustomization.paragraphSpacing = value;
      this.saveSettings();
    });
    console.log("[Popup] Text Customization initialized");
  }
  // ============================================================
  // SPRINT 3 FEATURE: READING GUIDE
  // ============================================================
  setupReadingGuide() {
    if (!this.settings.readingGuide) {
      this.settings.readingGuide = {
        enabled: false,
        lineColor: "#000000",
        lineThickness: 3,
        lineOpacity: 0.7
      };
    }
    const readingGuideEnabled = document.getElementById("reading-guide-enabled");
    const readingGuideDescription = document.getElementById("reading-guide-description");
    const readingGuideOptions = document.getElementById("reading-guide-options");
    readingGuideEnabled.checked = this.settings.readingGuide.enabled || false;
    if (readingGuideEnabled.checked) {
      readingGuideDescription.classList.remove("hidden");
      readingGuideOptions.classList.remove("hidden");
    } else {
      readingGuideDescription.classList.add("hidden");
      readingGuideOptions.classList.add("hidden");
    }
    readingGuideEnabled.addEventListener("change", (e) => {
      this.settings.readingGuide.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        readingGuideDescription.classList.remove("hidden");
        readingGuideOptions.classList.remove("hidden");
      } else {
        readingGuideDescription.classList.add("hidden");
        readingGuideOptions.classList.add("hidden");
      }
    });
    const lineColorSelect = document.getElementById("reading-guide-color");
    lineColorSelect.value = this.settings.readingGuide.lineColor || "#000000";
    lineColorSelect.addEventListener("change", (e) => {
      this.settings.readingGuide.lineColor = e.target.value;
      this.saveSettings();
    });
    const lineThicknessSlider = document.getElementById("reading-guide-thickness");
    const lineThicknessValue = document.getElementById("reading-guide-thickness-value");
    lineThicknessSlider.value = this.settings.readingGuide.lineThickness || 3;
    lineThicknessValue.textContent = lineThicknessSlider.value + "px";
    lineThicknessSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      lineThicknessValue.textContent = value + "px";
      this.settings.readingGuide.lineThickness = value;
      this.saveSettings();
    });
    const lineOpacitySlider = document.getElementById("reading-guide-opacity");
    const lineOpacityValue = document.getElementById("reading-guide-opacity-value");
    lineOpacitySlider.value = this.settings.readingGuide.lineOpacity || 0.7;
    lineOpacityValue.textContent = Math.round(lineOpacitySlider.value * 100) + "%";
    lineOpacitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      lineOpacityValue.textContent = Math.round(value * 100) + "%";
      this.settings.readingGuide.lineOpacity = value;
      this.saveSettings();
    });
    console.log("[Popup] Reading Guide initialized");
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
        overlayOpacity: 0.7
      };
    }
    const focusModeEnabled = document.getElementById("focus-mode-enabled");
    const focusModeDescription = document.getElementById("focus-mode-description");
    const focusModeOptions = document.getElementById("focus-mode-options");
    focusModeEnabled.checked = this.settings.focusMode.enabled || false;
    if (focusModeEnabled.checked) {
      focusModeDescription.classList.remove("hidden");
      focusModeOptions.classList.remove("hidden");
    } else {
      focusModeDescription.classList.add("hidden");
      focusModeOptions.classList.add("hidden");
    }
    focusModeEnabled.addEventListener("change", (e) => {
      this.settings.focusMode.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        focusModeDescription.classList.remove("hidden");
        focusModeOptions.classList.remove("hidden");
      } else {
        focusModeDescription.classList.add("hidden");
        focusModeOptions.classList.add("hidden");
      }
    });
    const boxWidthSlider = document.getElementById("focus-mode-width");
    const boxWidthValue = document.getElementById("focus-mode-width-value");
    boxWidthSlider.value = this.settings.focusMode.boxWidth || 400;
    boxWidthValue.textContent = boxWidthSlider.value + "px";
    boxWidthSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      boxWidthValue.textContent = value + "px";
      this.settings.focusMode.boxWidth = value;
      this.saveSettings();
    });
    const boxHeightSlider = document.getElementById("focus-mode-height");
    const boxHeightValue = document.getElementById("focus-mode-height-value");
    boxHeightSlider.value = this.settings.focusMode.boxHeight || 100;
    boxHeightValue.textContent = boxHeightSlider.value + "px";
    boxHeightSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      boxHeightValue.textContent = value + "px";
      this.settings.focusMode.boxHeight = value;
      this.saveSettings();
    });
    const overlayOpacitySlider = document.getElementById("focus-mode-opacity");
    const overlayOpacityValue = document.getElementById("focus-mode-opacity-value");
    overlayOpacitySlider.value = this.settings.focusMode.overlayOpacity || 0.7;
    overlayOpacityValue.textContent = Math.round(overlayOpacitySlider.value * 100) + "%";
    overlayOpacitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      overlayOpacityValue.textContent = Math.round(value * 100) + "%";
      this.settings.focusMode.overlayOpacity = value;
      this.saveSettings();
    });
    console.log("[Popup] Focus Mode initialized");
  }
  // ============================================================
  // SPRINT 6 FEATURE: SCREEN COLOR OVERLAY
  // ============================================================
  setupScreenOverlay() {
    if (!this.settings.screenOverlay) {
      this.settings.screenOverlay = {
        enabled: false,
        color: "#FFE4C4",
        opacity: 0.3
      };
    }
    const screenOverlayEnabled = document.getElementById("screen-overlay-enabled");
    const screenOverlayDescription = document.getElementById("screen-overlay-description");
    const screenOverlayOptions = document.getElementById("screen-overlay-options");
    screenOverlayEnabled.checked = this.settings.screenOverlay.enabled || false;
    if (screenOverlayEnabled.checked) {
      screenOverlayDescription.classList.remove("hidden");
      screenOverlayOptions.classList.remove("hidden");
    } else {
      screenOverlayDescription.classList.add("hidden");
      screenOverlayOptions.classList.add("hidden");
    }
    screenOverlayEnabled.addEventListener("change", (e) => {
      this.settings.screenOverlay.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        screenOverlayDescription.classList.remove("hidden");
        screenOverlayOptions.classList.remove("hidden");
      } else {
        screenOverlayDescription.classList.add("hidden");
        screenOverlayOptions.classList.add("hidden");
      }
    });
    const colorSelect = document.getElementById("screen-overlay-color");
    colorSelect.value = this.settings.screenOverlay.color || "#FFE4C4";
    colorSelect.addEventListener("change", (e) => {
      this.settings.screenOverlay.color = e.target.value;
      this.saveSettings();
    });
    const opacitySlider = document.getElementById("screen-overlay-opacity");
    const opacityValue = document.getElementById("screen-overlay-opacity-value");
    opacitySlider.value = this.settings.screenOverlay.opacity || 0.3;
    opacityValue.textContent = Math.round(opacitySlider.value * 100) + "%";
    opacitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      opacityValue.textContent = Math.round(value * 100) + "%";
      this.settings.screenOverlay.opacity = value;
      this.saveSettings();
    });
    console.log("[Popup] Screen Overlay initialized");
  }
  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: REDUCED MOTION
  // ============================================================
  setupReducedMotion() {
    if (!this.settings.reducedMotion) {
      this.settings.reducedMotion = {
        enabled: false,
        respectSystemPreference: true
      };
    }
    const reducedMotionEnabled = document.getElementById("reduced-motion-enabled");
    const reducedMotionDescription = document.getElementById("reduced-motion-description");
    const reducedMotionOptions = document.getElementById("reduced-motion-options");
    reducedMotionEnabled.checked = this.settings.reducedMotion.enabled || false;
    if (reducedMotionEnabled.checked) {
      reducedMotionDescription.classList.remove("hidden");
      reducedMotionOptions.classList.remove("hidden");
    } else {
      reducedMotionDescription.classList.add("hidden");
      reducedMotionOptions.classList.add("hidden");
    }
    reducedMotionEnabled.addEventListener("change", (e) => {
      this.settings.reducedMotion.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        reducedMotionDescription.classList.remove("hidden");
        reducedMotionOptions.classList.remove("hidden");
      } else {
        reducedMotionDescription.classList.add("hidden");
        reducedMotionOptions.classList.add("hidden");
      }
    });
    const systemToggle = document.getElementById("reduced-motion-system");
    systemToggle.checked = this.settings.reducedMotion.respectSystemPreference !== false;
    systemToggle.addEventListener("change", (e) => {
      this.settings.reducedMotion.respectSystemPreference = e.target.checked;
      this.saveSettings();
    });
    console.log("[Popup] Reduced Motion initialized");
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
        showIndicator: true
      };
    }
    const mediaControlEnabled = document.getElementById("media-control-enabled");
    const mediaControlDescription = document.getElementById("media-control-description");
    mediaControlEnabled.checked = this.settings.mediaControl.enabled || false;
    if (mediaControlEnabled.checked) {
      mediaControlDescription.classList.remove("hidden");
    } else {
      mediaControlDescription.classList.add("hidden");
    }
    mediaControlEnabled.addEventListener("change", (e) => {
      this.settings.mediaControl.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        mediaControlDescription.classList.remove("hidden");
      } else {
        mediaControlDescription.classList.add("hidden");
      }
    });
    console.log("[Popup] Media Control initialized");
  }
  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: DARK MODE
  // ============================================================
  setupDarkMode() {
    if (!this.settings.darkMode) {
      this.settings.darkMode = {
        enabled: false,
        preset: "dark-gray",
        respectSystemPreference: true
      };
    }
    const darkModeEnabled = document.getElementById("dark-mode-enabled");
    const darkModeDescription = document.getElementById("dark-mode-description");
    const darkModeOptions = document.getElementById("dark-mode-options");
    darkModeEnabled.checked = this.settings.darkMode.enabled || false;
    if (darkModeEnabled.checked) {
      darkModeDescription.classList.remove("hidden");
      darkModeOptions.classList.remove("hidden");
    } else {
      darkModeDescription.classList.add("hidden");
      darkModeOptions.classList.add("hidden");
    }
    darkModeEnabled.addEventListener("change", (e) => {
      this.settings.darkMode.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        darkModeDescription.classList.remove("hidden");
        darkModeOptions.classList.remove("hidden");
      } else {
        darkModeDescription.classList.add("hidden");
        darkModeOptions.classList.add("hidden");
      }
    });
    const presetSelect = document.getElementById("dark-mode-preset");
    presetSelect.value = this.settings.darkMode.preset || "dark-gray";
    presetSelect.addEventListener("change", (e) => {
      this.settings.darkMode.preset = e.target.value;
      this.saveSettings();
    });
    const systemToggle = document.getElementById("dark-mode-system");
    systemToggle.checked = this.settings.darkMode.respectSystemPreference !== false;
    systemToggle.addEventListener("change", (e) => {
      this.settings.darkMode.respectSystemPreference = e.target.checked;
      this.saveSettings();
    });
    console.log("[Popup] Dark Mode initialized");
  }
  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: SIMPLIFIED INTERFACE
  // ============================================================
  setupSimplify() {
    if (!this.settings.simplify) {
      this.settings.simplify = {
        enabled: false,
        intensity: "moderate",
        focusMainContent: true,
        hideAds: true,
        hideSidebars: true,
        hideComments: true,
        hideRelated: true,
        hideFooters: true,
        hideSocialButtons: true,
        hidePopups: true,
        hideAnimations: true
      };
    }
    const simplifyEnabled = document.getElementById("simplify-enabled");
    const simplifyDescription = document.getElementById("simplify-description");
    const simplifyOptions = document.getElementById("simplify-options");
    simplifyEnabled.checked = this.settings.simplify.enabled || false;
    if (simplifyEnabled.checked) {
      simplifyDescription.classList.remove("hidden");
      simplifyOptions.classList.remove("hidden");
    } else {
      simplifyDescription.classList.add("hidden");
      simplifyOptions.classList.add("hidden");
    }
    simplifyEnabled.addEventListener("change", (e) => {
      this.settings.simplify.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        simplifyDescription.classList.remove("hidden");
        simplifyOptions.classList.remove("hidden");
      } else {
        simplifyDescription.classList.add("hidden");
        simplifyOptions.classList.add("hidden");
      }
    });
    const intensitySelect = document.getElementById("simplify-intensity");
    intensitySelect.value = this.settings.simplify.intensity || "moderate";
    intensitySelect.addEventListener("change", (e) => {
      this.settings.simplify.intensity = e.target.value;
      this.saveSettings();
    });
    const focusContentToggle = document.getElementById("simplify-focus-content");
    focusContentToggle.checked = this.settings.simplify.focusMainContent !== false;
    focusContentToggle.addEventListener("change", (e) => {
      this.settings.simplify.focusMainContent = e.target.checked;
      this.saveSettings();
    });
    console.log("[Popup] Simplified Interface initialized");
  }
  // ============================================================
  // NEURODIVERGENT PROFILE FEATURE: READING PROGRESS
  // ============================================================
  setupReadingProgress() {
    if (!this.settings.readingProgress) {
      this.settings.readingProgress = {
        enabled: false,
        position: "top",
        height: 4,
        color: "#4CAF50",
        backgroundColor: "rgba(0,0,0,0.1)",
        showPercentage: false,
        smoothScroll: true,
        hideOnComplete: false
      };
    }
    const progressEnabled = document.getElementById("reading-progress-enabled");
    const progressDescription = document.getElementById("reading-progress-description");
    const progressOptions = document.getElementById("reading-progress-options");
    progressEnabled.checked = this.settings.readingProgress.enabled || false;
    if (progressEnabled.checked) {
      progressDescription.classList.remove("hidden");
      progressOptions.classList.remove("hidden");
    } else {
      progressDescription.classList.add("hidden");
      progressOptions.classList.add("hidden");
    }
    progressEnabled.addEventListener("change", (e) => {
      this.settings.readingProgress.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        progressDescription.classList.remove("hidden");
        progressOptions.classList.remove("hidden");
      } else {
        progressDescription.classList.add("hidden");
        progressOptions.classList.add("hidden");
      }
    });
    const positionSelect = document.getElementById("reading-progress-position");
    positionSelect.value = this.settings.readingProgress.position || "top";
    positionSelect.addEventListener("change", (e) => {
      this.settings.readingProgress.position = e.target.value;
      this.saveSettings();
    });
    const colorSelect = document.getElementById("reading-progress-color");
    colorSelect.value = this.settings.readingProgress.color || "#4CAF50";
    colorSelect.addEventListener("change", (e) => {
      this.settings.readingProgress.color = e.target.value;
      this.saveSettings();
    });
    const percentageToggle = document.getElementById("reading-progress-percentage");
    percentageToggle.checked = this.settings.readingProgress.showPercentage || false;
    percentageToggle.addEventListener("change", (e) => {
      this.settings.readingProgress.showPercentage = e.target.checked;
      this.saveSettings();
    });
    console.log("[Popup] Reading Progress initialized");
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
        position: "bottom-right"
      };
    }
    const pomodoroEnabled = document.getElementById("pomodoro-enabled");
    const pomodoroDescription = document.getElementById("pomodoro-description");
    const pomodoroOptions = document.getElementById("pomodoro-options");
    pomodoroEnabled.checked = this.settings.pomodoro.enabled || false;
    if (pomodoroEnabled.checked) {
      pomodoroDescription.classList.remove("hidden");
      pomodoroOptions.classList.remove("hidden");
    } else {
      pomodoroDescription.classList.add("hidden");
      pomodoroOptions.classList.add("hidden");
    }
    pomodoroEnabled.addEventListener("change", (e) => {
      this.settings.pomodoro.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        pomodoroDescription.classList.remove("hidden");
        pomodoroOptions.classList.remove("hidden");
      } else {
        pomodoroDescription.classList.add("hidden");
        pomodoroOptions.classList.add("hidden");
      }
    });
    const workSlider = document.getElementById("pomodoro-work-duration");
    const workValue = document.getElementById("pomodoro-work-value");
    workSlider.value = this.settings.pomodoro.workDuration || 25;
    workValue.textContent = `${workSlider.value} min`;
    workSlider.addEventListener("input", (e) => {
      workValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.workDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const breakSlider = document.getElementById("pomodoro-break-duration");
    const breakValue = document.getElementById("pomodoro-break-value");
    breakSlider.value = this.settings.pomodoro.shortBreakDuration || 5;
    breakValue.textContent = `${breakSlider.value} min`;
    breakSlider.addEventListener("input", (e) => {
      breakValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.shortBreakDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const longBreakSlider = document.getElementById("pomodoro-long-break");
    const longBreakValue = document.getElementById("pomodoro-long-break-value");
    longBreakSlider.value = this.settings.pomodoro.longBreakDuration || 15;
    longBreakValue.textContent = `${longBreakSlider.value} min`;
    longBreakSlider.addEventListener("input", (e) => {
      longBreakValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.longBreakDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const positionSelect = document.getElementById("pomodoro-position");
    positionSelect.value = this.settings.pomodoro.position || "bottom-right";
    positionSelect.addEventListener("change", (e) => {
      this.settings.pomodoro.position = e.target.value;
      this.saveSettings();
    });
    const autoBreaksToggle = document.getElementById("pomodoro-auto-start-breaks");
    autoBreaksToggle.checked = this.settings.pomodoro.autoStartBreaks || false;
    autoBreaksToggle.addEventListener("change", (e) => {
      this.settings.pomodoro.autoStartBreaks = e.target.checked;
      this.saveSettings();
    });
    const soundToggle = document.getElementById("pomodoro-sound");
    soundToggle.checked = this.settings.pomodoro.playSound !== false;
    soundToggle.addEventListener("change", (e) => {
      this.settings.pomodoro.playSound = e.target.checked;
      this.saveSettings();
    });
    console.log("[Popup] Pomodoro Timer initialized");
  }
  // ============================================================
  // STARGARDT MODULE: CENTRAL VISION SUPPORT
  // ============================================================
  setupStargardt() {
    if (!this.settings.stargardt) {
      this.settings.stargardt = {
        enabled: false,
        mode: "lite",
        setupComplete: false,
        remapping: {
          enabled: true,
          mode: "peripheral-push",
          preferredSide: "right"
        },
        textOptimization: {
          enabled: true,
          letterSpacing: 150,
          lineHeight: 200
        },
        lightAdaptation: {
          enabled: true,
          targetBrightness: 70
        }
      };
    }
    const stargardtEnabled = document.getElementById("stargardt-enabled");
    const stargardtDescription = document.getElementById("stargardt-description");
    const stargardtOptions = document.getElementById("stargardt-options");
    if (!stargardtEnabled) {
      console.log("[Popup] Stargardt section not found in DOM, skipping setup");
      return;
    }
    stargardtEnabled.checked = this.settings.stargardt.enabled || false;
    if (stargardtEnabled.checked) {
      stargardtDescription.classList.remove("hidden");
      stargardtOptions.classList.remove("hidden");
    } else {
      stargardtDescription.classList.add("hidden");
      stargardtOptions.classList.add("hidden");
    }
    stargardtEnabled.addEventListener("change", (e) => {
      this.settings.stargardt.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        stargardtDescription.classList.remove("hidden");
        stargardtOptions.classList.remove("hidden");
      } else {
        stargardtDescription.classList.add("hidden");
        stargardtOptions.classList.add("hidden");
      }
    });
    const modeSelect = document.getElementById("stargardt-mode");
    const calibrateSection = document.getElementById("stargardt-calibrate-section");
    modeSelect.value = this.settings.stargardt.mode || "lite";
    if (modeSelect.value === "advanced") {
      calibrateSection.style.display = "block";
    } else {
      calibrateSection.style.display = "none";
    }
    modeSelect.addEventListener("change", (e) => {
      this.settings.stargardt.mode = e.target.value;
      this.saveSettings();
      if (e.target.value === "advanced") {
        calibrateSection.style.display = "block";
      } else {
        calibrateSection.style.display = "none";
      }
    });
    const cursorEnabled = document.getElementById("stargardt-cursor-enabled");
    const cursorOptions = document.getElementById("stargardt-cursor-options");
    const cursorSizeSlider = document.getElementById("stargardt-cursor-size");
    const cursorSizeValue = document.getElementById("stargardt-cursor-size-value");
    const cursorStyleSelect = document.getElementById("stargardt-cursor-style");
    const cursorColorSelect = document.getElementById("stargardt-cursor-color");
    if (!this.settings.stargardt.cursor) {
      this.settings.stargardt.cursor = {
        enabled: false,
        size: 32,
        style: "crosshair",
        color: "#ff0000"
      };
    }
    cursorEnabled.checked = this.settings.stargardt.cursor.enabled || false;
    cursorSizeSlider.value = this.settings.stargardt.cursor.size || 32;
    cursorSizeValue.textContent = `${cursorSizeSlider.value}px`;
    cursorStyleSelect.value = this.settings.stargardt.cursor.style || "crosshair";
    cursorColorSelect.value = this.settings.stargardt.cursor.color || "#ff0000";
    if (cursorEnabled.checked) {
      cursorOptions.classList.remove("hidden");
    } else {
      cursorOptions.classList.add("hidden");
    }
    cursorEnabled.addEventListener("change", (e) => {
      this.settings.stargardt.cursor.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        cursorOptions.classList.remove("hidden");
      } else {
        cursorOptions.classList.add("hidden");
      }
    });
    cursorSizeSlider.addEventListener("input", (e) => {
      cursorSizeValue.textContent = `${e.target.value}px`;
      this.settings.stargardt.cursor.size = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    cursorStyleSelect.addEventListener("change", (e) => {
      this.settings.stargardt.cursor.style = e.target.value;
      this.saveSettings();
    });
    cursorColorSelect.addEventListener("change", (e) => {
      this.settings.stargardt.cursor.color = e.target.value;
      this.saveSettings();
    });
    const remappingToggle = document.getElementById("stargardt-remapping");
    const remappingOptions = document.getElementById("stargardt-remapping-options");
    remappingToggle.checked = this.settings.stargardt.remapping?.enabled !== false;
    if (remappingToggle.checked) {
      remappingOptions.style.display = "block";
    } else {
      remappingOptions.style.display = "none";
    }
    remappingToggle.addEventListener("change", (e) => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        remappingOptions.style.display = "block";
      } else {
        remappingOptions.style.display = "none";
      }
    });
    const remapModeSelect = document.getElementById("stargardt-remap-mode");
    const magnifyOptions = document.getElementById("stargardt-magnify-options");
    remapModeSelect.value = this.settings.stargardt.remapping?.mode || "peripheral-push";
    const updateMagnifyOptionsVisibility = (mode) => {
      if (mode === "magnify-remap") {
        magnifyOptions.classList.remove("hidden");
      } else {
        magnifyOptions.classList.add("hidden");
      }
    };
    updateMagnifyOptionsVisibility(remapModeSelect.value);
    remapModeSelect.addEventListener("change", (e) => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.mode = e.target.value;
      this.saveSettings();
      updateMagnifyOptionsVisibility(e.target.value);
    });
    const magnifyScaleSlider = document.getElementById("stargardt-magnify-scale");
    const magnifyScaleValue = document.getElementById("stargardt-magnify-scale-value");
    magnifyScaleSlider.value = this.settings.stargardt.remapping?.magnifyScale || 2;
    magnifyScaleValue.textContent = `${magnifyScaleSlider.value}x`;
    magnifyScaleSlider.addEventListener("input", (e) => {
      magnifyScaleValue.textContent = `${e.target.value}x`;
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifyScale = parseFloat(e.target.value);
      this.saveSettings();
    });
    const magnifySizeSlider = document.getElementById("stargardt-magnify-size");
    const magnifySizeValue = document.getElementById("stargardt-magnify-size-value");
    magnifySizeSlider.value = this.settings.stargardt.remapping?.magnifySize || 275;
    magnifySizeValue.textContent = `${magnifySizeSlider.value}px`;
    magnifySizeSlider.addEventListener("input", (e) => {
      magnifySizeValue.textContent = `${e.target.value}px`;
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifySize = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const magnifyOffsetSlider = document.getElementById("stargardt-magnify-offset");
    const magnifyOffsetValue = document.getElementById("stargardt-magnify-offset-value");
    magnifyOffsetSlider.value = this.settings.stargardt.remapping?.magnifyOffset || 150;
    magnifyOffsetValue.textContent = `${magnifyOffsetSlider.value}px`;
    magnifyOffsetSlider.addEventListener("input", (e) => {
      magnifyOffsetValue.textContent = `${e.target.value}px`;
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifyOffset = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const magnifyOffsetDirSelect = document.getElementById("stargardt-magnify-offset-dir");
    magnifyOffsetDirSelect.value = this.settings.stargardt.remapping?.magnifyOffsetDir || "right";
    magnifyOffsetDirSelect.addEventListener("change", (e) => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifyOffsetDir = e.target.value;
      this.saveSettings();
    });
    const magnifyLockToggle = document.getElementById("stargardt-magnify-lock");
    magnifyLockToggle.checked = this.settings.stargardt.remapping?.magnifyLock === true;
    magnifyLockToggle.addEventListener("change", (e) => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.magnifyLock = e.target.checked;
      this.saveSettings();
    });
    const sideSelect = document.getElementById("stargardt-preferred-side");
    sideSelect.value = this.settings.stargardt.remapping?.preferredSide || "right";
    sideSelect.addEventListener("change", (e) => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.preferredSide = e.target.value;
      this.saveSettings();
    });
    const readingModeToggle = document.getElementById("stargardt-reading-mode");
    readingModeToggle.checked = this.settings.stargardt.remapping?.readingMode !== false;
    readingModeToggle.addEventListener("change", (e) => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.readingMode = e.target.checked;
      this.saveSettings();
    });
    const fontSizeSlider = document.getElementById("stargardt-remap-font-size");
    const fontSizeValue = document.getElementById("stargardt-font-size-value");
    fontSizeSlider.value = this.settings.stargardt.remapping?.fontSize || 100;
    fontSizeValue.textContent = `${fontSizeSlider.value}%`;
    fontSizeSlider.addEventListener("input", (e) => {
      fontSizeValue.textContent = `${e.target.value}%`;
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.fontSize = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const fontFamilySelect = document.getElementById("stargardt-font-family");
    fontFamilySelect.value = this.settings.stargardt.remapping?.fontFamily || "system";
    fontFamilySelect.addEventListener("change", (e) => {
      if (!this.settings.stargardt.remapping) {
        this.settings.stargardt.remapping = {};
      }
      this.settings.stargardt.remapping.fontFamily = e.target.value;
      this.saveSettings();
    });
    const textOptToggle = document.getElementById("stargardt-text-opt");
    textOptToggle.checked = this.settings.stargardt.textOptimization?.enabled !== false;
    textOptToggle.addEventListener("change", (e) => {
      if (!this.settings.stargardt.textOptimization) {
        this.settings.stargardt.textOptimization = {};
      }
      this.settings.stargardt.textOptimization.enabled = e.target.checked;
      this.saveSettings();
    });
    const letterSlider = document.getElementById("stargardt-letter-spacing");
    const letterValue = document.getElementById("stargardt-letter-value");
    letterSlider.value = this.settings.stargardt.textOptimization?.letterSpacing || 150;
    letterValue.textContent = `${letterSlider.value}%`;
    letterSlider.addEventListener("input", (e) => {
      letterValue.textContent = `${e.target.value}%`;
      if (!this.settings.stargardt.textOptimization) {
        this.settings.stargardt.textOptimization = {};
      }
      this.settings.stargardt.textOptimization.letterSpacing = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const lineSlider = document.getElementById("stargardt-line-height");
    const lineValue = document.getElementById("stargardt-line-value");
    lineSlider.value = this.settings.stargardt.textOptimization?.lineHeight || 200;
    lineValue.textContent = `${lineSlider.value}%`;
    lineSlider.addEventListener("input", (e) => {
      lineValue.textContent = `${e.target.value}%`;
      if (!this.settings.stargardt.textOptimization) {
        this.settings.stargardt.textOptimization = {};
      }
      this.settings.stargardt.textOptimization.lineHeight = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const lightToggle = document.getElementById("stargardt-light-adapt");
    const brightnessSection = document.getElementById("stargardt-brightness-section");
    lightToggle.checked = this.settings.stargardt.lightAdaptation?.enabled !== false;
    if (lightToggle.checked) {
      brightnessSection.style.display = "block";
    } else {
      brightnessSection.style.display = "none";
    }
    lightToggle.addEventListener("change", (e) => {
      if (!this.settings.stargardt.lightAdaptation) {
        this.settings.stargardt.lightAdaptation = {};
      }
      this.settings.stargardt.lightAdaptation.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        brightnessSection.style.display = "block";
      } else {
        brightnessSection.style.display = "none";
      }
    });
    const brightnessSlider = document.getElementById("stargardt-brightness");
    const brightnessValue = document.getElementById("stargardt-brightness-value");
    brightnessSlider.value = this.settings.stargardt.lightAdaptation?.targetBrightness || 70;
    brightnessValue.textContent = `${brightnessSlider.value}%`;
    brightnessSlider.addEventListener("input", (e) => {
      brightnessValue.textContent = `${e.target.value}%`;
      if (!this.settings.stargardt.lightAdaptation) {
        this.settings.stargardt.lightAdaptation = {};
      }
      this.settings.stargardt.lightAdaptation.targetBrightness = parseInt(e.target.value, 10);
      this.saveSettings();
    });
    const setupBtn = document.getElementById("stargardt-setup-btn");
    setupBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "stargardt_showSetupWizard"
          });
        }
      });
    });
    const calibrateBtn = document.getElementById("stargardt-calibrate-btn");
    calibrateBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "stargardt_runCalibration"
          });
        }
      });
    });
    const prlBtn = document.getElementById("stargardt-prl-btn");
    prlBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        action: "openTab",
        url: chrome.runtime.getURL("pages/prl-training/training.html")
      });
    });
    console.log("[Popup] Stargardt Central Vision Support initialized");
  }
  // ============================================================
  // SPRINT 4 FEATURE: CANVAS INTEGRATION
  // ============================================================
  setupCanvasIntegration() {
    if (!this.settings.canvasIntegration) {
      this.settings.canvasIntegration = {
        enabled: false,
        assignmentReader: true,
        quizHelper: false,
        keyboardNav: false
      };
    }
    const canvasIntegrationEnabled = document.getElementById("canvas-integration-enabled");
    const canvasIntegrationDescription = document.getElementById("canvas-integration-description");
    const canvasIntegrationOptions = document.getElementById("canvas-integration-options");
    canvasIntegrationEnabled.checked = this.settings.canvasIntegration.enabled || false;
    if (canvasIntegrationEnabled.checked) {
      canvasIntegrationDescription.classList.remove("hidden");
      canvasIntegrationOptions.classList.remove("hidden");
    } else {
      canvasIntegrationDescription.classList.add("hidden");
      canvasIntegrationOptions.classList.add("hidden");
    }
    canvasIntegrationEnabled.addEventListener("change", (e) => {
      this.settings.canvasIntegration.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        canvasIntegrationDescription.classList.remove("hidden");
        canvasIntegrationOptions.classList.remove("hidden");
      } else {
        canvasIntegrationDescription.classList.add("hidden");
        canvasIntegrationOptions.classList.add("hidden");
      }
    });
    const assignmentReaderCheckbox = document.getElementById("canvas-assignment-reader");
    assignmentReaderCheckbox.checked = this.settings.canvasIntegration.assignmentReader !== false;
    assignmentReaderCheckbox.addEventListener("change", (e) => {
      this.settings.canvasIntegration.assignmentReader = e.target.checked;
      this.saveSettings();
    });
    if (!this.settings.canvasIntegration.quizHelper) {
      this.settings.canvasIntegration.quizHelper = {
        enabled: false,
        readAnswers: true,
        autoRead: false,
        highlightQuestion: true,
        highlightColor: "#4A90E2",
        keyboardNavigation: true
      };
    }
    const quizHelperCheckbox = document.getElementById("canvas-quiz-helper");
    const quizHelperOptions = document.getElementById("quiz-helper-options");
    const quizHelperEnabled = typeof this.settings.canvasIntegration.quizHelper === "object" ? this.settings.canvasIntegration.quizHelper.enabled : this.settings.canvasIntegration.quizHelper || false;
    quizHelperCheckbox.checked = quizHelperEnabled;
    if (quizHelperEnabled) {
      quizHelperOptions.classList.remove("hidden");
    } else {
      quizHelperOptions.classList.add("hidden");
    }
    quizHelperCheckbox.addEventListener("change", (e) => {
      if (typeof this.settings.canvasIntegration.quizHelper !== "object") {
        this.settings.canvasIntegration.quizHelper = {
          enabled: e.target.checked,
          readAnswers: true,
          autoRead: false,
          highlightQuestion: true,
          highlightColor: "#4A90E2",
          keyboardNavigation: true
        };
      } else {
        this.settings.canvasIntegration.quizHelper.enabled = e.target.checked;
      }
      this.saveSettings();
      if (e.target.checked) {
        quizHelperOptions.classList.remove("hidden");
      } else {
        quizHelperOptions.classList.add("hidden");
      }
    });
    const quizReadAnswers = document.getElementById("quiz-read-answers");
    quizReadAnswers.checked = this.settings.canvasIntegration.quizHelper.readAnswers !== false;
    quizReadAnswers.addEventListener("change", (e) => {
      this.settings.canvasIntegration.quizHelper.readAnswers = e.target.checked;
      this.saveSettings();
    });
    const quizAutoRead = document.getElementById("quiz-auto-read");
    quizAutoRead.checked = this.settings.canvasIntegration.quizHelper.autoRead || false;
    quizAutoRead.addEventListener("change", (e) => {
      this.settings.canvasIntegration.quizHelper.autoRead = e.target.checked;
      this.saveSettings();
    });
    const quizHighlightQuestion = document.getElementById("quiz-highlight-question");
    quizHighlightQuestion.checked = this.settings.canvasIntegration.quizHelper.highlightQuestion !== false;
    quizHighlightQuestion.addEventListener("change", (e) => {
      this.settings.canvasIntegration.quizHelper.highlightQuestion = e.target.checked;
      this.saveSettings();
    });
    const quizHighlightColor = document.getElementById("quiz-highlight-color");
    quizHighlightColor.value = this.settings.canvasIntegration.quizHelper.highlightColor || "#4A90E2";
    quizHighlightColor.addEventListener("change", (e) => {
      this.settings.canvasIntegration.quizHelper.highlightColor = e.target.value;
      this.saveSettings();
    });
    const quizKeyboardNav = document.getElementById("quiz-keyboard-nav");
    quizKeyboardNav.checked = this.settings.canvasIntegration.quizHelper.keyboardNavigation !== false;
    quizKeyboardNav.addEventListener("change", (e) => {
      this.settings.canvasIntegration.quizHelper.keyboardNavigation = e.target.checked;
      this.saveSettings();
    });
    const keyboardNavCheckbox = document.getElementById("canvas-keyboard-nav");
    if (keyboardNavCheckbox) {
      keyboardNavCheckbox.checked = this.settings.canvasIntegration.keyboardNav || false;
    }
    console.log("[Popup] Canvas Integration initialized", this.settings.canvasIntegration);
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
        language: "en-US",
        autoCapitalize: true,
        punctuationCommands: true,
        floatingButton: true
      };
    }
    const sttEnabled = document.getElementById("stt-enabled");
    const sttDescription = document.getElementById("stt-description");
    const sttOptions = document.getElementById("stt-options");
    sttEnabled.checked = this.settings.stt.enabled || false;
    if (sttEnabled.checked) {
      sttDescription.classList.remove("hidden");
      sttOptions.classList.remove("hidden");
    } else {
      sttDescription.classList.add("hidden");
      sttOptions.classList.add("hidden");
    }
    sttEnabled.addEventListener("change", (e) => {
      this.settings.stt.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        sttDescription.classList.remove("hidden");
        sttOptions.classList.remove("hidden");
      } else {
        sttDescription.classList.add("hidden");
        sttOptions.classList.add("hidden");
      }
    });
    const continuousModeCheckbox = document.getElementById("stt-continuous-mode");
    continuousModeCheckbox.checked = this.settings.stt.continuousMode !== false;
    continuousModeCheckbox.addEventListener("change", (e) => {
      this.settings.stt.continuousMode = e.target.checked;
      this.saveSettings();
    });
    const languageSelect = document.getElementById("stt-language");
    languageSelect.value = this.settings.stt.language || "en-US";
    languageSelect.addEventListener("change", (e) => {
      this.settings.stt.language = e.target.value;
      this.saveSettings();
    });
    const engineSelect = document.getElementById("stt-engine");
    const engineStatusIndicator = document.getElementById("stt-engine-indicator");
    const engineNameDisplay = document.getElementById("stt-engine-name");
    const engineOfflineBadge = document.getElementById("stt-engine-offline-badge");
    const preferOfflineCheckbox = document.getElementById("stt-prefer-offline");
    const whisperDownloadSection = document.getElementById("stt-whisper-download");
    if (engineSelect) {
      if (this.settings.stt.engine === void 0) {
        this.settings.stt.engine = "auto";
      }
      if (this.settings.stt.preferOffline === void 0) {
        this.settings.stt.preferOffline = true;
      }
      engineSelect.value = this.settings.stt.engine || "auto";
      const updateEngineStatus = (engineType, isOffline = false) => {
        const engineNames = {
          "auto": "Auto (selecting...)",
          "whisper": "Whisper (Offline)",
          "web-speech": "Web Speech API",
          "azure": "Azure Speech Services"
        };
        if (engineNameDisplay) {
          engineNameDisplay.textContent = engineNames[engineType] || engineType;
        }
        if (engineStatusIndicator) {
          engineStatusIndicator.style.background = "#10b981";
        }
        if (engineOfflineBadge) {
          if (isOffline || engineType === "whisper") {
            engineOfflineBadge.classList.remove("hidden");
          } else {
            engineOfflineBadge.classList.add("hidden");
          }
        }
      };
      updateEngineStatus(this.settings.stt.engine, this.settings.stt.engine === "whisper");
      engineSelect.addEventListener("change", (e) => {
        this.settings.stt.engine = e.target.value;
        this.saveSettings();
        updateEngineStatus(e.target.value, e.target.value === "whisper");
        if (e.target.value === "whisper" && whisperDownloadSection) ;
        this.sendCommandToTab({
          command: "UPDATE_STT_SETTINGS",
          settings: {
            engine: e.target.value,
            preferOffline: this.settings.stt.preferOffline
          }
        });
      });
    }
    if (preferOfflineCheckbox) {
      preferOfflineCheckbox.checked = this.settings.stt.preferOffline !== false;
      preferOfflineCheckbox.addEventListener("change", (e) => {
        this.settings.stt.preferOffline = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab({
          command: "UPDATE_STT_SETTINGS",
          settings: {
            engine: this.settings.stt.engine,
            preferOffline: e.target.checked
          }
        });
      });
    }
    const punctuationCheckbox = document.getElementById("stt-punctuation-commands");
    punctuationCheckbox.checked = this.settings.stt.punctuationCommands !== false;
    punctuationCheckbox.addEventListener("change", (e) => {
      this.settings.stt.punctuationCommands = e.target.checked;
      this.saveSettings();
    });
    const autoPunctuationCheckbox = document.getElementById("stt-auto-punctuation");
    const autoPunctuationModeSection = document.getElementById("auto-punctuation-mode-section");
    const autoPunctuationModeSelect = document.getElementById("stt-auto-punctuation-mode");
    if (autoPunctuationCheckbox) {
      if (this.settings.stt.autoPunctuation === void 0) {
        this.settings.stt.autoPunctuation = true;
      }
      if (this.settings.stt.autoPunctuationMode === void 0) {
        this.settings.stt.autoPunctuationMode = "auto";
      }
      autoPunctuationCheckbox.checked = this.settings.stt.autoPunctuation !== false;
      autoPunctuationModeSelect.value = this.settings.stt.autoPunctuationMode || "auto";
      if (autoPunctuationModeSection) {
        autoPunctuationModeSection.style.display = autoPunctuationCheckbox.checked ? "block" : "none";
      }
      autoPunctuationCheckbox.addEventListener("change", (e) => {
        this.settings.stt.autoPunctuation = e.target.checked;
        this.saveSettings();
        if (autoPunctuationModeSection) {
          autoPunctuationModeSection.style.display = e.target.checked ? "block" : "none";
        }
        this.sendCommandToTab({
          command: "UPDATE_STT_SETTINGS",
          settings: {
            autoPunctuation: e.target.checked,
            autoPunctuationMode: this.settings.stt.autoPunctuationMode
          }
        });
      });
      if (autoPunctuationModeSelect) {
        autoPunctuationModeSelect.addEventListener("change", (e) => {
          this.settings.stt.autoPunctuationMode = e.target.value;
          this.saveSettings();
          this.sendCommandToTab({
            command: "UPDATE_STT_SETTINGS",
            settings: {
              autoPunctuation: this.settings.stt.autoPunctuation,
              autoPunctuationMode: e.target.value
            }
          });
        });
      }
    }
    const confidenceFeedbackCheckbox = document.getElementById("stt-confidence-feedback");
    const confidenceThresholdSlider = document.getElementById("stt-confidence-threshold");
    const confidenceThresholdValue = document.getElementById("stt-confidence-threshold-value");
    const confidenceThresholdSection = document.getElementById("confidence-threshold-section");
    const highlightLowConfidenceCheckbox = document.getElementById("stt-highlight-low-confidence");
    const showAlternativesCheckbox = document.getElementById("stt-show-alternatives");
    const showStatsBtn = document.getElementById("stt-show-stats");
    const statsSummary = document.getElementById("stt-stats-summary");
    if (confidenceFeedbackCheckbox) {
      if (this.settings.stt.confidenceFeedback === void 0) {
        this.settings.stt.confidenceFeedback = true;
      }
      if (this.settings.stt.confidenceThreshold === void 0) {
        this.settings.stt.confidenceThreshold = 60;
      }
      if (this.settings.stt.highlightLowConfidence === void 0) {
        this.settings.stt.highlightLowConfidence = true;
      }
      if (this.settings.stt.showAlternatives === void 0) {
        this.settings.stt.showAlternatives = true;
      }
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
      if (confidenceThresholdSection) {
        confidenceThresholdSection.style.display = confidenceFeedbackCheckbox.checked ? "block" : "none";
      }
      confidenceFeedbackCheckbox.addEventListener("change", (e) => {
        this.settings.stt.confidenceFeedback = e.target.checked;
        this.saveSettings();
        if (confidenceThresholdSection) {
          confidenceThresholdSection.style.display = e.target.checked ? "block" : "none";
        }
        this.sendCommandToTab({
          command: "UPDATE_STT_SETTINGS",
          settings: {
            confidenceFeedback: e.target.checked,
            confidenceThreshold: this.settings.stt.confidenceThreshold / 100,
            highlightLowConfidence: this.settings.stt.highlightLowConfidence,
            showAlternatives: this.settings.stt.showAlternatives
          }
        });
      });
      if (confidenceThresholdSlider) {
        confidenceThresholdSlider.addEventListener("input", (e) => {
          const value = parseInt(e.target.value);
          if (confidenceThresholdValue) {
            confidenceThresholdValue.textContent = `${value}%`;
          }
          const color = value >= 85 ? "#22c55e" : value >= 60 ? "#eab308" : "#ef4444";
          confidenceThresholdValue.style.color = color;
        });
        confidenceThresholdSlider.addEventListener("change", (e) => {
          this.settings.stt.confidenceThreshold = parseInt(e.target.value);
          this.saveSettings();
          this.sendCommandToTab({
            command: "UPDATE_STT_SETTINGS",
            settings: {
              confidenceFeedback: this.settings.stt.confidenceFeedback,
              confidenceThreshold: parseInt(e.target.value) / 100,
              highlightLowConfidence: this.settings.stt.highlightLowConfidence,
              showAlternatives: this.settings.stt.showAlternatives
            }
          });
        });
      }
      if (highlightLowConfidenceCheckbox) {
        highlightLowConfidenceCheckbox.addEventListener("change", (e) => {
          this.settings.stt.highlightLowConfidence = e.target.checked;
          this.saveSettings();
          this.sendCommandToTab({
            command: "UPDATE_STT_SETTINGS",
            settings: {
              highlightLowConfidence: e.target.checked
            }
          });
        });
      }
      if (showAlternativesCheckbox) {
        showAlternativesCheckbox.addEventListener("change", (e) => {
          this.settings.stt.showAlternatives = e.target.checked;
          this.saveSettings();
          this.sendCommandToTab({
            command: "UPDATE_STT_SETTINGS",
            settings: {
              showAlternatives: e.target.checked
            }
          });
        });
      }
      if (showStatsBtn) {
        showStatsBtn.addEventListener("click", async () => {
          if (statsSummary) {
            const isVisible = statsSummary.style.display !== "none";
            statsSummary.style.display = isVisible ? "none" : "block";
            if (!isVisible) {
              try {
                const response = await this.sendCommandToTab({
                  command: "GET_STT_STATS"
                });
                if (response && response.stats) {
                  this.updateSTTStatsDisplay(response.stats);
                }
              } catch {
                console.log("[STT Stats] No response from content script");
              }
            }
          }
        });
      }
    }
    const voiceCommandsCheckbox = document.getElementById("stt-voice-commands");
    if (voiceCommandsCheckbox) {
      if (this.settings.stt.voiceCommands === void 0) {
        this.settings.stt.voiceCommands = true;
      }
      voiceCommandsCheckbox.checked = this.settings.stt.voiceCommands !== false;
      voiceCommandsCheckbox.addEventListener("change", (e) => {
        this.settings.stt.voiceCommands = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab({ command: "UPDATE_STT_SETTINGS", settings: this.settings.stt });
      });
      const showCommandsBtn = document.getElementById("stt-show-commands");
      if (showCommandsBtn) {
        showCommandsBtn.addEventListener("click", () => {
          this.showVoiceCommandsModal();
        });
      }
    }
    const autoCapitalizeCheckbox = document.getElementById("stt-auto-capitalize");
    autoCapitalizeCheckbox.checked = this.settings.stt.autoCapitalize !== false;
    autoCapitalizeCheckbox.addEventListener("change", (e) => {
      this.settings.stt.autoCapitalize = e.target.checked;
      this.saveSettings();
    });
    const interimResultsCheckbox = document.getElementById("stt-interim-results");
    interimResultsCheckbox.checked = this.settings.stt.interimResults !== false;
    interimResultsCheckbox.addEventListener("change", (e) => {
      this.settings.stt.interimResults = e.target.checked;
      this.saveSettings();
    });
    const floatingButtonCheckbox = document.getElementById("stt-floating-button");
    floatingButtonCheckbox.checked = this.settings.stt.floatingButton !== false;
    floatingButtonCheckbox.addEventListener("change", (e) => {
      this.settings.stt.floatingButton = e.target.checked;
      this.saveSettings();
    });
    this.initializeVocabulary();
    console.log("[Popup] STT initialized");
  }
  /**
   * Initialize Custom Vocabulary UI (Phase 2.7 - S.5)
   * Handles vocabulary presets, word management, import/export
   */
  async initializeVocabulary() {
    if (!this.settings.stt.vocabulary) {
      this.settings.stt.vocabulary = {
        autoLearn: true,
        enabledPresets: [],
        customWords: []
      };
    }
    const autoLearnCheckbox = document.getElementById("stt-auto-learn");
    if (autoLearnCheckbox) {
      autoLearnCheckbox.checked = this.settings.stt.vocabulary.autoLearn !== false;
      autoLearnCheckbox.addEventListener("change", (e) => {
        this.settings.stt.vocabulary.autoLearn = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab({
          command: "UPDATE_VOCABULARY_SETTINGS",
          settings: { autoLearnEnabled: e.target.checked }
        });
      });
    }
    const presetButtons = document.querySelectorAll(".preset-chip");
    presetButtons.forEach((btn) => {
      const preset = btn.dataset.preset;
      const isEnabled = this.settings.stt.vocabulary.enabledPresets?.includes(preset);
      this.updatePresetButtonState(btn, isEnabled);
      btn.addEventListener("click", async () => {
        const currentlyEnabled = btn.getAttribute("aria-pressed") === "true";
        const newState = !currentlyEnabled;
        this.updatePresetButtonState(btn, newState);
        if (newState) {
          if (!this.settings.stt.vocabulary.enabledPresets) {
            this.settings.stt.vocabulary.enabledPresets = [];
          }
          if (!this.settings.stt.vocabulary.enabledPresets.includes(preset)) {
            this.settings.stt.vocabulary.enabledPresets.push(preset);
          }
        } else {
          this.settings.stt.vocabulary.enabledPresets = this.settings.stt.vocabulary.enabledPresets.filter((p) => p !== preset);
        }
        this.saveSettings();
        this.sendCommandToTab({
          command: newState ? "LOAD_VOCABULARY_PRESET" : "UNLOAD_VOCABULARY_PRESET",
          preset
        });
        this.updateVocabularyStats();
      });
    });
    const addWordBtn = document.getElementById("btn-add-vocab-word");
    if (addWordBtn) {
      addWordBtn.addEventListener("click", () => {
        this.showAddVocabularyWordModal();
      });
    }
    const manageBtn = document.getElementById("btn-manage-vocabulary");
    if (manageBtn) {
      manageBtn.addEventListener("click", () => {
        this.showManageVocabularyModal();
      });
    }
    const importBtn = document.getElementById("btn-import-vocabulary");
    if (importBtn) {
      importBtn.addEventListener("click", () => {
        this.importVocabulary();
      });
    }
    const exportBtn = document.getElementById("btn-export-vocabulary");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        this.exportVocabulary();
      });
    }
    this.updateVocabularyStats();
    console.log("[Popup] Vocabulary controls initialized");
  }
  /**
   * Update preset button visual state
   */
  updatePresetButtonState(btn, enabled) {
    btn.setAttribute("aria-pressed", enabled.toString());
    if (enabled) {
      btn.style.background = "linear-gradient(135deg, #4a90d9, #357abd)";
      btn.style.color = "white";
      btn.style.borderColor = "#357abd";
    } else {
      btn.style.background = "#f5f5f5";
      btn.style.color = "#333";
      btn.style.borderColor = "#ddd";
    }
  }
  /**
   * Update vocabulary statistics display
   */
  async updateVocabularyStats() {
    const customCountEl = document.getElementById("vocab-word-count");
    const presetCountEl = document.getElementById("vocab-preset-count");
    if (!customCountEl || !presetCountEl) {
      return;
    }
    try {
      const response = await this.sendCommandToTabWithResponse({
        command: "GET_VOCABULARY_STATS"
      });
      if (response && response.stats) {
        customCountEl.textContent = response.stats.customCount || 0;
        presetCountEl.textContent = response.stats.presetCount || 0;
      } else {
        customCountEl.textContent = this.settings.stt.vocabulary.customWords?.length || 0;
        let presetCount = 0;
        const presetSizes = { medical: 48, legal: 38, academic: 31, stem: 43 };
        for (const preset of this.settings.stt.vocabulary.enabledPresets || []) {
          presetCount += presetSizes[preset] || 0;
        }
        presetCountEl.textContent = presetCount;
      }
    } catch (error) {
      console.warn("[Popup] Could not get vocabulary stats:", error);
      customCountEl.textContent = this.settings.stt.vocabulary.customWords?.length || 0;
      presetCountEl.textContent = "0";
    }
  }
  /**
   * Show Add Vocabulary Word Modal
   */
  showAddVocabularyWordModal() {
    const existingModal = document.getElementById("add-vocab-modal");
    if (existingModal) {
      existingModal.remove();
    }
    const modal = document.createElement("div");
    modal.id = "add-vocab-modal";
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
    const wordInput = document.getElementById("vocab-word-input");
    setTimeout(() => wordInput.focus(), 100);
    const closeModal = () => modal.remove();
    document.getElementById("close-add-vocab-modal").addEventListener("click", closeModal);
    document.getElementById("cancel-add-vocab").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
    document.getElementById("confirm-add-vocab").addEventListener("click", async () => {
      const word = wordInput.value.trim();
      const phonetic = document.getElementById("vocab-phonetic-input").value.trim();
      if (!word) {
        wordInput.style.borderColor = "#e74c3c";
        wordInput.focus();
        return;
      }
      if (!this.settings.stt.vocabulary.customWords) {
        this.settings.stt.vocabulary.customWords = [];
      }
      const exists = this.settings.stt.vocabulary.customWords.some(
        (w) => w.word.toLowerCase() === word.toLowerCase()
      );
      if (exists) {
        alert("This word is already in your vocabulary.");
        return;
      }
      this.settings.stt.vocabulary.customWords.push({ word, phonetic });
      this.saveSettings();
      this.sendCommandToTab({
        command: "ADD_VOCABULARY_WORD",
        word,
        phonetic
      });
      this.updateVocabularyStats();
      closeModal();
    });
    wordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        document.getElementById("confirm-add-vocab").click();
      }
    });
  }
  /**
   * Show Manage Vocabulary Modal
   */
  showManageVocabularyModal() {
    const existingModal = document.getElementById("manage-vocab-modal");
    if (existingModal) {
      existingModal.remove();
    }
    const customWords = this.settings.stt.vocabulary.customWords || [];
    const modal = document.createElement("div");
    modal.id = "manage-vocab-modal";
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
    const wordsList = customWords.length > 0 ? customWords.map(
      (w, i) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
              <div>
                <span style="font-weight: 500;">${w.word}</span>
                ${w.phonetic ? `<span style="font-size: 11px; color: #888; margin-left: 8px;">(${w.phonetic})</span>` : ""}
              </div>
              <button class="delete-vocab-word" data-index="${i}" style="background: #ff4757; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px;">Delete</button>
            </div>
          `
    ).join("") : '<p style="text-align: center; color: #888; padding: 20px;">No custom words added yet.</p>';
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
    document.getElementById("close-manage-vocab-modal").addEventListener("click", closeModal);
    document.getElementById("done-manage-vocab").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
    modal.querySelectorAll(".delete-vocab-word").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index);
        const word = this.settings.stt.vocabulary.customWords[index];
        this.settings.stt.vocabulary.customWords.splice(index, 1);
        this.saveSettings();
        this.sendCommandToTab({
          command: "DELETE_VOCABULARY_WORD",
          word: word.word
        });
        this.updateVocabularyStats();
        closeModal();
        this.showManageVocabularyModal();
      });
    });
    document.getElementById("clear-all-vocab").addEventListener("click", () => {
      if (confirm("Are you sure you want to delete all custom words?")) {
        this.settings.stt.vocabulary.customWords = [];
        this.saveSettings();
        this.sendCommandToTab({ command: "CLEAR_VOCABULARY" });
        this.updateVocabularyStats();
        closeModal();
      }
    });
  }
  /**
   * Import vocabulary from file
   */
  importVocabulary() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.json";
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) {
        return;
      }
      try {
        const content = await file.text();
        let words = [];
        if (file.name.endsWith(".json")) {
          const data = JSON.parse(content);
          words = Array.isArray(data) ? data : data.vocabulary || [];
        } else {
          words = content.split("\n").filter((line) => line.trim()).map((line) => {
            const parts = line.split("|");
            return {
              word: parts[0].trim(),
              phonetic: parts[1] ? parts[1].trim() : ""
            };
          });
        }
        if (!this.settings.stt.vocabulary.customWords) {
          this.settings.stt.vocabulary.customWords = [];
        }
        const existingWords = new Set(
          this.settings.stt.vocabulary.customWords.map((w) => w.word.toLowerCase())
        );
        let addedCount = 0;
        for (const word of words) {
          if (!existingWords.has(word.word.toLowerCase())) {
            this.settings.stt.vocabulary.customWords.push(word);
            addedCount++;
          }
        }
        this.saveSettings();
        this.sendCommandToTab({
          command: "IMPORT_VOCABULARY",
          words
        });
        this.updateVocabularyStats();
        alert(`Imported ${addedCount} new words.`);
      } catch (error) {
        console.error("[Popup] Import vocabulary failed:", error);
        alert("Failed to import vocabulary. Please check the file format.");
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
      alert("No custom words to export.");
      return;
    }
    const exportData = {
      exportDate: (/* @__PURE__ */ new Date()).toISOString(),
      version: "1.0",
      vocabulary: words
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assist-vocabulary-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  /**
   * Send command to tab and wait for response
   */
  async sendCommandToTabWithResponse(message, timeout = 1e3) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.id) {
          resolve(null);
          return;
        }
        const timeoutId = setTimeout(() => resolve(null), timeout);
        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
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
    const existingModal = document.getElementById("voice-commands-modal");
    if (existingModal) {
      existingModal.remove();
    }
    const modal = document.createElement("div");
    modal.id = "voice-commands-modal";
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
    const modalContent = document.createElement("div");
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
    const closeBtn = document.getElementById("close-voice-commands-modal");
    closeBtn.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    document.addEventListener("keydown", function closeOnEsc(e) {
      if (e.key === "Escape") {
        modal.remove();
        document.removeEventListener("keydown", closeOnEsc);
      }
    });
  }
  /**
   * Update STT statistics display (Phase 2.7 - S.4)
   * @param {Object} stats - Statistics object from content script
   */
  updateSTTStatsDisplay(stats) {
    const wpmEl = document.getElementById("stt-stats-wpm");
    const accuracyEl = document.getElementById("stt-stats-accuracy");
    const wordsEl = document.getElementById("stt-stats-words");
    const durationEl = document.getElementById("stt-stats-duration");
    if (wpmEl) wpmEl.textContent = stats.wordsPerMinute || 0;
    if (accuracyEl) {
      const accuracy = stats.averageConfidence || 0;
      accuracyEl.textContent = `${accuracy}%`;
      const color = accuracy >= 85 ? "#22c55e" : accuracy >= 60 ? "#eab308" : "#ef4444";
      accuracyEl.style.color = color;
    }
    if (wordsEl) wordsEl.textContent = stats.totalWords || 0;
    if (durationEl) durationEl.textContent = `${stats.duration || 0}m`;
  }
  // ============================================================
  // PHASE 2 FEATURE 3: READING MODE
  // ============================================================
  setupReadingMode() {
    if (!this.settings.readingMode) {
      this.settings.readingMode = {
        enabled: false,
        backgroundColor: "#FBF8F3",
        fontFamily: "OpenDyslexic, Georgia, serif",
        fontSize: "18px",
        lineHeight: "1.6",
        maxWidth: "800px"
      };
    }
    const readingModeEnabled = document.getElementById("reading-mode-enabled");
    const readingModeDescription = document.getElementById("reading-mode-description");
    const readingModeOptions = document.getElementById("reading-mode-options");
    const toggleButton = document.getElementById("btn-toggle-reading-mode");
    readingModeEnabled.checked = this.settings.readingMode.enabled || false;
    if (readingModeEnabled.checked) {
      readingModeDescription.classList.remove("hidden");
      readingModeOptions.classList.remove("hidden");
    } else {
      readingModeDescription.classList.add("hidden");
      readingModeOptions.classList.add("hidden");
    }
    readingModeEnabled.addEventListener("change", (e) => {
      this.settings.readingMode.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        readingModeDescription.classList.remove("hidden");
        readingModeOptions.classList.remove("hidden");
      } else {
        readingModeDescription.classList.add("hidden");
        readingModeOptions.classList.add("hidden");
      }
    });
    toggleButton.addEventListener("click", async () => {
      if (!this.currentTab) {
        this.updateStatus("No active tab", "error");
        return;
      }
      try {
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: "READING_MODE_TOGGLE"
        });
        const btnText = toggleButton.querySelector(".btn-text");
        if (btnText.textContent === "Enter Reading Mode") {
          btnText.textContent = "Exit Reading Mode";
        } else {
          btnText.textContent = "Enter Reading Mode";
        }
      } catch (error) {
        console.error("[Popup] Error toggling reading mode:", error);
        this.updateStatus("Error: Please reload the page", "error");
      }
    });
    console.log("[Popup] Reading Mode initialized");
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
        colorIntensity: 0.7
      };
    }
    const dyslexiaEnabled = document.getElementById("dyslexia-mode-enabled");
    const dyslexiaDescription = document.getElementById("dyslexia-mode-description");
    const dyslexiaOptions = document.getElementById("dyslexia-mode-options");
    dyslexiaEnabled.checked = this.settings.dyslexiaMode.enabled || false;
    if (dyslexiaEnabled.checked) {
      dyslexiaDescription.classList.remove("hidden");
      dyslexiaOptions.classList.remove("hidden");
    } else {
      dyslexiaDescription.classList.add("hidden");
      dyslexiaOptions.classList.add("hidden");
    }
    dyslexiaEnabled.addEventListener("change", (e) => {
      this.settings.dyslexiaMode.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        dyslexiaDescription.classList.remove("hidden");
        dyslexiaOptions.classList.remove("hidden");
      } else {
        dyslexiaDescription.classList.add("hidden");
        dyslexiaOptions.classList.add("hidden");
      }
    });
    const bionicRadio = document.getElementById("dyslexia-bionic");
    const syllableRadio = document.getElementById("dyslexia-syllable");
    const grammarRadio = document.getElementById("dyslexia-grammar");
    if (this.settings.dyslexiaMode.bionicReading) {
      bionicRadio.checked = true;
    } else if (this.settings.dyslexiaMode.syllableHighlighting) {
      syllableRadio.checked = true;
    } else if (this.settings.dyslexiaMode.grammarColors) {
      grammarRadio.checked = true;
    }
    bionicRadio.addEventListener("change", (e) => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = true;
        this.settings.dyslexiaMode.syllableHighlighting = false;
        this.settings.dyslexiaMode.grammarColors = false;
        this.saveSettings();
      }
    });
    syllableRadio.addEventListener("change", (e) => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = false;
        this.settings.dyslexiaMode.syllableHighlighting = true;
        this.settings.dyslexiaMode.grammarColors = false;
        this.saveSettings();
      }
    });
    grammarRadio.addEventListener("change", (e) => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = false;
        this.settings.dyslexiaMode.syllableHighlighting = false;
        this.settings.dyslexiaMode.grammarColors = true;
        this.saveSettings();
      }
    });
    const intensitySlider = document.getElementById("dyslexia-intensity");
    const intensityValue = document.getElementById("dyslexia-intensity-value");
    intensitySlider.value = this.settings.dyslexiaMode.colorIntensity || 0.7;
    intensityValue.textContent = Math.round(intensitySlider.value * 100) + "%";
    intensitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      intensityValue.textContent = Math.round(value * 100) + "%";
      this.settings.dyslexiaMode.colorIntensity = value;
      this.saveSettings();
    });
    console.log("[Popup] Dyslexia Mode initialized");
    const btnMigrationClose = document.getElementById("btn-migration-close");
    if (btnMigrationClose) {
      btnMigrationClose.addEventListener("click", () => {
        this.closeMigrationModal();
      });
    }
  }
  // ============================================================
  // SPRINT 7 FEATURE: USER PROFILES
  // ============================================================
  async setupUserProfiles() {
    console.log("[Popup] Setting up User Profiles...");
    await this.profiles_initialize();
    this.profiles_setupEventListeners();
  }
  async profiles_initialize() {
    const result = await chrome.storage.local.get(["assist_profiles", "assist_active_profile"]);
    let profiles = result.assist_profiles || {};
    const activeProfile = result.assist_active_profile || "Default";
    if (Object.keys(profiles).length === 0) {
      profiles = this.profiles_createDefaults();
      await chrome.storage.local.set({
        assist_profiles: profiles,
        assist_active_profile: "Default"
      });
      console.log("[Profiles] Created default profiles");
    }
    this.profiles = profiles;
    this.activeProfile = activeProfile;
    this.profiles_populateSelector();
    console.log("[Profiles] Initialized with", Object.keys(profiles).length, "profiles");
  }
  profiles_createDefaults() {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    return {
      Default: {
        name: "Default",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: {
            enabled: false,
            rate: 1,
            pitch: 1,
            volume: 1,
            highlightEnabled: true,
            highlightColor: "#FFEB3B",
            highlightOpacity: 0.7
          },
          textCustomization: { enabled: false },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          canvasIntegration: { enabled: false }
        }
      },
      "Reading Mode": {
        name: "Reading Mode",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.2, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.8,
            fontFamily: "OpenDyslexic"
          },
          readingGuide: { enabled: true, lineColor: "#4A90E2", opacity: 0.5 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: "#FFF4E6", opacity: 0.2 },
          canvasIntegration: { enabled: false }
        }
      },
      "Quiz Mode": {
        name: "Quiz Mode",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1, highlightEnabled: true, wordByWordEnabled: false },
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
              keyboardNavigation: true
            }
          }
        }
      },
      "Low Vision": {
        name: "Low Vision",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: {
            enabled: true,
            rate: 0.9,
            highlightEnabled: true,
            highlightColor: "#FFEB3B",
            highlightOpacity: 0.9
          },
          textCustomization: {
            enabled: true,
            fontSize: 22,
            lineHeight: 2,
            letterSpacing: 0.15,
            wordSpacing: 0.2
          },
          readingGuide: { enabled: true, lineColor: "#FF0000", opacity: 0.8 },
          focusMode: { enabled: true, dimAmount: 0.9 },
          screenOverlay: { enabled: false },
          canvasIntegration: { enabled: false }
        }
      },
      // ============================================================
      // NEURODIVERGENT-FOCUSED PROFILES (Phase 2.6 + S.7 STT)
      // ============================================================
      "ADHD Focus": {
        name: "ADHD Focus",
        description: "Structured intervals, reduced distractions, and clear visual progress",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.2, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: { enabled: true, fontSize: 16, lineHeight: 1.6, fontFamily: "lexend" },
          readingGuide: { enabled: true, lineColor: "#4A90E2", opacity: 0.6 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          simplify: { enabled: true, intensity: "moderate", focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: "top",
            color: "#4CAF50",
            showPercentage: true
          },
          pomodoro: {
            enabled: true,
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            autoStartBreaks: true,
            playSound: true
          },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: true },
          darkMode: { enabled: false },
          // S.7.1: ADHD STT Profile - fast response, minimal distractions
          stt: {
            enabled: true,
            profile: "adhd",
            silenceTimeout: 800,
            buttonSize: "large",
            animations: false,
            audioFeedback: false
          }
        }
      },
      "Autism Comfort": {
        name: "Autism Comfort",
        description: "Predictable environment with sensory-friendly settings",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.9, highlightEnabled: true, wordByWordEnabled: false },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.8,
            fontFamily: "atkinson-hyperlegible"
          },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: "#FFF4E6", opacity: 0.15 },
          simplify: { enabled: true, intensity: "aggressive", focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: "top",
            color: "#9C27B0",
            showPercentage: false
          },
          pomodoro: {
            enabled: true,
            workDuration: 30,
            shortBreakDuration: 10,
            longBreakDuration: 20,
            autoStartBreaks: false,
            playSound: false
            // Avoid unexpected sounds
          },
          reducedMotion: { enabled: true, respectSystemPreference: true },
          mediaControl: { enabled: true },
          darkMode: { enabled: false, respectSystemPreference: true },
          // S.7.6: Autism STT Profile - predictable, literal commands
          stt: {
            enabled: true,
            profile: "autism",
            interimResults: false,
            // Final results only - no changing text
            commandMode: "literal",
            commandPrefix: "do",
            animations: false,
            audioFeedback: true
          }
        }
      },
      "Dyslexia Support": {
        name: "Dyslexia Support",
        description: "Optimized fonts, spacing, and reading aids for dyslexic users",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 2,
            letterSpacing: 0.12,
            wordSpacing: 0.16,
            fontFamily: "opendyslexic"
          },
          readingGuide: { enabled: true, lineColor: "#000000", opacity: 0.5 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: "#FFF59D", opacity: 0.2 },
          simplify: { enabled: true, intensity: "light", focusMainContent: false },
          readingProgress: {
            enabled: true,
            position: "top",
            color: "#2196F3",
            showPercentage: true
          },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: false },
          darkMode: { enabled: false },
          // S.7.2: Dyslexia STT Profile - extra pause time, simple commands
          stt: {
            enabled: true,
            profile: "dyslexia",
            silenceTimeout: 3e3,
            // Extra time to think
            maxAlternatives: 3,
            // More phonetic alternatives
            commandMode: "simple",
            spellingCorrection: true,
            audioFeedback: true
          }
        }
      },
      "Sensory Sensitive": {
        name: "Sensory Sensitive",
        description: "Minimal animations, muted colors, and calming interface",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.8, highlightEnabled: true, highlightOpacity: 0.5 },
          textCustomization: {
            enabled: true,
            fontSize: 16,
            lineHeight: 1.6,
            fontFamily: "verdana"
          },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: "#E1BEE7", opacity: 0.15 },
          simplify: { enabled: true, intensity: "aggressive", focusMainContent: true },
          readingProgress: { enabled: false },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: true, respectSystemPreference: false },
          // Always reduce motion
          mediaControl: { enabled: true },
          darkMode: { enabled: false, respectSystemPreference: true },
          // S.7.3: Anxiety/Sensory STT Profile - calm colors, no alarming sounds
          stt: {
            enabled: true,
            profile: "anxiety",
            silenceTimeout: 4e3,
            // Forgiving timing
            animations: true,
            // Smooth, calming
            audioFeedback: true,
            audioVolume: 0.2,
            // Very quiet
            errorSounds: false
            // No alarming sounds
          }
        }
      },
      "Night Study": {
        name: "Night Study",
        description: "Dark mode with reduced eye strain for late-night studying",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1, highlightEnabled: true, highlightColor: "#FFD700" },
          textCustomization: { enabled: true, fontSize: 17, lineHeight: 1.7, fontFamily: "lexend" },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          simplify: { enabled: true, intensity: "moderate", focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: "top",
            color: "#FF9800",
            showPercentage: true
          },
          pomodoro: {
            enabled: true,
            workDuration: 45,
            shortBreakDuration: 10,
            longBreakDuration: 20,
            autoStartBreaks: true,
            playSound: true
          },
          reducedMotion: { enabled: true },
          mediaControl: { enabled: true },
          darkMode: { enabled: true, preset: "dark-gray", respectSystemPreference: false }
        }
      },
      "Anxiety Calm": {
        name: "Anxiety Calm",
        description: "Distraction-free reading with gentle pacing and progress indicators",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.85, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.9,
            fontFamily: "atkinson-hyperlegible"
          },
          readingGuide: { enabled: true, lineColor: "#90EE90", opacity: 0.4 },
          focusMode: { enabled: true, dimAmount: 0.5 },
          screenOverlay: { enabled: true, color: "#C8E6C9", opacity: 0.1 },
          simplify: { enabled: true, intensity: "aggressive", focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: "bottom",
            color: "#4CAF50",
            showPercentage: false
          },
          pomodoro: {
            enabled: true,
            workDuration: 20,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            autoStartBreaks: false,
            playSound: false
          },
          reducedMotion: { enabled: true },
          mediaControl: { enabled: true },
          darkMode: { enabled: false, respectSystemPreference: true },
          // S.7.3: Anxiety STT Profile - calm, forgiving, no pressure
          stt: {
            enabled: true,
            profile: "anxiety",
            silenceTimeout: 4e3,
            // Very forgiving
            speechTimeout: 3e4,
            // Extended - take your time
            animations: true,
            // Smooth, calming
            audioFeedback: true,
            audioVolume: 0.2,
            errorSounds: false,
            // No alarming sounds
            flashOnRecognition: false
            // No sudden flashes
          }
        }
      },
      // S.7.4: Motor Impairment Profile - voice-only, large targets
      "Motor Impairment": {
        name: "Motor Impairment",
        description: "Voice-only activation, large touch targets, patient timing",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1, highlightEnabled: true },
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
            profile: "motor-impairment",
            continuous: true,
            // Continuous to avoid re-clicking
            silenceTimeout: 5e3,
            // Very long - no rush
            speechTimeout: 6e4,
            // Extended dictation
            buttonSize: "xlarge",
            holdToActivate: true,
            holdDuration: 500,
            voiceActivation: true,
            voiceActivationPhrase: "start dictation",
            voiceDeactivationPhrase: "stop dictation",
            audioFeedback: true,
            hapticFeedback: true
          }
        }
      },
      // S.7.5: Low Vision Profile - large buttons, high contrast, audio feedback
      "Low Vision STT": {
        name: "Low Vision STT",
        description: "Extra-large mic button, high contrast, comprehensive audio feedback",
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: {
            enabled: true,
            rate: 0.9,
            highlightEnabled: true,
            highlightColor: "#FFEB3B",
            highlightOpacity: 0.9
          },
          textCustomization: {
            enabled: true,
            fontSize: 24,
            lineHeight: 2,
            letterSpacing: 0.15,
            wordSpacing: 0.2
          },
          readingGuide: { enabled: true, lineColor: "#FF0000", opacity: 0.8 },
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
            profile: "low-vision",
            buttonSize: "xlarge",
            buttonSizePx: 96,
            // Very large
            highContrast: true,
            audioFeedback: true,
            audioVolume: 0.7,
            // Louder
            speakTranscript: true,
            // Read back what was typed
            hapticFeedback: true,
            announceState: true,
            transcriptFontSize: 24
          }
        }
      }
    };
  }
  profiles_populateSelector() {
    const selector = document.getElementById("profile-select");
    selector.innerHTML = "";
    Object.keys(this.profiles).forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === this.activeProfile;
      selector.appendChild(option);
    });
  }
  profiles_setupEventListeners() {
    const selector = document.getElementById("profile-select");
    selector.addEventListener("change", (e) => {
      this.profiles_loadProfile(e.target.value);
    });
    document.getElementById("btn-save-profile").addEventListener("click", () => {
      this.profiles_showSaveModal();
    });
    document.getElementById("btn-export-profiles").addEventListener("click", () => {
      this.profiles_export();
    });
    document.getElementById("btn-import-profiles").addEventListener("click", () => {
      document.getElementById("profile-import-input").click();
    });
    document.getElementById("profile-import-input").addEventListener("change", (e) => {
      this.profiles_import(e.target.files[0]);
    });
    document.getElementById("btn-cancel-save-profile").addEventListener("click", () => {
      document.getElementById("save-profile-modal").classList.add("hidden");
    });
    document.getElementById("btn-confirm-save-profile").addEventListener("click", () => {
      this.profiles_saveNew();
    });
    document.getElementById("btn-cancel-delete-profile").addEventListener("click", () => {
      document.getElementById("delete-profile-modal").classList.add("hidden");
    });
    document.getElementById("btn-confirm-delete-profile").addEventListener("click", () => {
      this.profiles_confirmDelete();
    });
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", () => {
        overlay.closest(".modal").classList.add("hidden");
      });
    });
  }
  async profiles_loadProfile(name) {
    if (!this.profiles[name]) {
      console.error("[Profiles] Profile not found:", name);
      return;
    }
    const profile = this.profiles[name];
    this.activeProfile = name;
    this.settings = { ...this.settings, ...profile.settings };
    await chrome.storage.local.set({ assist_active_profile: name });
    await this.saveSettings();
    if (profile.settings.stt && profile.settings.stt.profile) {
      await this.profiles_applySTTProfile(name, profile.settings.stt);
    }
    window.location.reload();
  }
  /**
   * Apply STT profile to content script (S.7)
   * @param {string} profileName - Name of the user profile
   * @param {Object} sttSettings - STT settings from the profile
   */
  async profiles_applySTTProfile(profileName, sttSettings) {
    try {
      await chrome.storage.local.set({
        assist_stt_profile: {
          type: sttSettings.profile,
          profileName,
          customizations: sttSettings,
          savedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
      if (this.currentTab?.id) {
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: "STT_COMMAND",
          command: "applyProfile",
          profileType: sttSettings.profile,
          customizations: sttSettings
        });
      }
      console.log("[Profiles] STT profile applied:", sttSettings.profile);
    } catch (error) {
      console.error("[Profiles] Failed to apply STT profile:", error);
    }
  }
  profiles_showSaveModal() {
    const modal = document.getElementById("save-profile-modal");
    const input = document.getElementById("profile-name-input");
    input.value = "";
    modal.classList.remove("hidden");
    input.focus();
  }
  async profiles_saveNew() {
    const input = document.getElementById("profile-name-input");
    const name = input.value.trim();
    if (!name) {
      alert("Please enter a profile name");
      return;
    }
    if (this.profiles[name]) {
      if (!confirm(`Profile "${name}" already exists. Overwrite?`)) {
        return;
      }
    }
    const newProfile = {
      name,
      isDefault: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      settings: JSON.parse(JSON.stringify(this.settings))
      // Deep clone
    };
    this.profiles[name] = newProfile;
    await chrome.storage.local.set({ assist_profiles: this.profiles });
    this.profiles_populateSelector();
    document.getElementById("save-profile-modal").classList.add("hidden");
    this.updateStatus(`Profile "${name}" saved!`, "success");
    console.log("[Profiles] Saved new profile:", name);
  }
  profiles_showDeleteModal(name) {
    const modal = document.getElementById("delete-profile-modal");
    const nameSpan = document.getElementById("delete-profile-name");
    nameSpan.textContent = name;
    modal.classList.add("hidden");
    this.profileToDelete = name;
    modal.classList.remove("hidden");
  }
  async profiles_confirmDelete() {
    const name = this.profileToDelete;
    if (!name || !this.profiles[name]) {
      return;
    }
    if (this.profiles[name].isDefault) {
      alert("Cannot delete default profiles");
      return;
    }
    delete this.profiles[name];
    if (this.activeProfile === name) {
      await this.profiles_loadProfile("Default");
    }
    await chrome.storage.local.set({ assist_profiles: this.profiles });
    this.profiles_populateSelector();
    document.getElementById("delete-profile-modal").classList.add("hidden");
    this.updateStatus(`Profile "${name}" deleted`, "success");
    console.log("[Profiles] Deleted profile:", name);
  }
  profiles_export() {
    const data = {
      version: "1.0",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      profiles: this.profiles
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assist-profiles-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.updateStatus("Profiles exported!", "success");
    console.log("[Profiles] Exported", Object.keys(this.profiles).length, "profiles");
  }
  async profiles_import(file) {
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.profiles || typeof data.profiles !== "object") {
        alert("Invalid profile file format");
        return;
      }
      let importedCount = 0;
      for (const [name, profile] of Object.entries(data.profiles)) {
        if (!this.profiles[name] || !this.profiles[name].isDefault) {
          this.profiles[name] = profile;
          importedCount++;
        }
      }
      await chrome.storage.local.set({ assist_profiles: this.profiles });
      this.profiles_populateSelector();
      this.updateStatus(`Imported ${importedCount} profiles!`, "success");
      console.log("[Profiles] Imported", importedCount, "profiles");
    } catch (error) {
      console.error("[Profiles] Import error:", error);
      alert("Error importing profiles: " + error.message);
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
    this.showMigrationModal();
    try {
      const result = await migrateAnnotations(fromMode, toMode, {
        clearSource: true,
        onProgress: (progress) => {
          this.updateMigrationProgress(progress);
        }
      });
      if (result.success) {
        console.log(`[Popup] Migration successful: ${result.count} annotations migrated`);
        this.updateMigrationComplete(result.count, toMode);
      } else {
        console.error("[Popup] Migration failed:", result.error);
        this.updateMigrationError(result.error);
      }
    } catch (error) {
      console.error("[Popup] Migration exception:", error);
      this.updateMigrationError(error.message);
    }
  }
  /**
   * Show migration modal
   */
  showMigrationModal() {
    const modal = document.getElementById("migration-modal");
    if (modal) {
      modal.classList.remove("hidden");
      const closeBtn = document.getElementById("btn-migration-close");
      if (closeBtn) {
        closeBtn.style.display = "none";
      }
      const progressFill = document.getElementById("migration-progress-fill");
      const progressText = document.getElementById("migration-progress-text");
      if (progressFill) {
        progressFill.style.width = "0%";
      }
      if (progressText) {
        progressText.textContent = "0%";
      }
    }
  }
  /**
   * Close migration modal
   */
  closeMigrationModal() {
    const modal = document.getElementById("migration-modal");
    if (modal) {
      modal.classList.add("hidden");
      this.loadSettings();
    }
  }
  /**
   * Update migration progress in modal
   * @param {Object} progress - Progress information
   */
  updateMigrationProgress(progress) {
    const { status, current, total, message } = progress;
    const messageEl = document.getElementById("migration-message");
    if (messageEl) {
      messageEl.textContent = message;
    }
    let percentage = 0;
    if (total > 0) {
      percentage = Math.round(current / total * 100);
    } else if (status === "complete") {
      percentage = 100;
    }
    const progressFill = document.getElementById("migration-progress-fill");
    const progressText = document.getElementById("migration-progress-text");
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    if (progressText) {
      progressText.textContent = `${percentage}%`;
    }
    const detailsEl = document.getElementById("migration-details");
    if (detailsEl) {
      if (total > 0) {
        detailsEl.textContent = `${current} of ${total} annotations processed`;
      } else {
        detailsEl.textContent = "";
      }
    }
  }
  /**
   * Update migration modal on completion
   * @param {number} count - Number of annotations migrated
   * @param {string} toMode - Target storage mode
   */
  updateMigrationComplete(count, toMode) {
    const messageEl = document.getElementById("migration-message");
    if (messageEl) {
      if (count === 0) {
        messageEl.textContent = "No annotations to migrate";
      } else {
        const storageLabel = toMode === "indexeddb" ? "IndexedDB" : "Chrome Local Storage";
        messageEl.textContent = `Successfully migrated ${count} annotation${count === 1 ? "" : "s"} to ${storageLabel}`;
      }
    }
    const progressFill = document.getElementById("migration-progress-fill");
    const progressText = document.getElementById("migration-progress-text");
    if (progressFill) {
      progressFill.style.width = "100%";
    }
    if (progressText) {
      progressText.textContent = "100%";
    }
    const detailsEl = document.getElementById("migration-details");
    if (detailsEl) {
      detailsEl.textContent = "";
    }
    const closeBtn = document.getElementById("btn-migration-close");
    if (closeBtn) {
      closeBtn.style.display = "";
    }
  }
  /**
   * Update migration modal on error
   * @param {string} error - Error message
   */
  updateMigrationError(error) {
    const messageEl = document.getElementById("migration-message");
    if (messageEl) {
      messageEl.textContent = `Migration failed: ${error}`;
    }
    const progressFill = document.getElementById("migration-progress-fill");
    if (progressFill) {
      progressFill.style.background = "linear-gradient(90deg, #f44336 0%, #d32f2f 100%)";
    }
    const detailsEl = document.getElementById("migration-details");
    if (detailsEl) {
      detailsEl.textContent = "Please try again or contact support if the issue persists.";
    }
    const closeBtn = document.getElementById("btn-migration-close");
    if (closeBtn) {
      closeBtn.style.display = "";
    }
  }
  // ============================================================
  // ANNOTATIONS: STICKY NOTES
  // ============================================================
  setupAnnotations() {
    if (!this.settings.annotations) {
      this.settings.annotations = {
        enabled: false
      };
    }
    const annotationsEnabled = document.getElementById("annotations-enabled");
    const annotationsDescription = document.getElementById("annotations-description");
    const annotationsOptions = document.getElementById("annotations-options");
    const createNoteButton = document.getElementById("btn-create-sticky-note");
    const viewAnnotationsButton = document.getElementById("btn-view-annotations");
    annotationsEnabled.checked = this.settings.annotations.enabled || false;
    if (annotationsEnabled.checked) {
      annotationsDescription.classList.remove("hidden");
      annotationsOptions.classList.remove("hidden");
    } else {
      annotationsDescription.classList.add("hidden");
      annotationsOptions.classList.add("hidden");
    }
    annotationsEnabled.addEventListener("change", (e) => {
      this.settings.annotations.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        annotationsDescription.classList.remove("hidden");
        annotationsOptions.classList.remove("hidden");
      } else {
        annotationsDescription.classList.add("hidden");
        annotationsOptions.classList.add("hidden");
      }
    });
    createNoteButton.addEventListener("click", async () => {
      if (!this.currentTab) {
        this.updateStatus("No active tab", "error");
        return;
      }
      try {
        await chrome.tabs.sendMessage(this.currentTab.id, {
          action: "createStickyNote",
          x: null,
          // Will be centered by content script
          y: null,
          content: "",
          color: "yellow"
        });
        this.updateStatus("Sticky note created!", "success");
      } catch (error) {
        console.error("[Popup] Error creating sticky note:", error);
        this.updateStatus("Error: Please reload the page", "error");
      }
    });
    viewAnnotationsButton.addEventListener("click", async () => {
      if (!this.currentTab) {
        this.updateStatus("No active tab", "error");
        return;
      }
      try {
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: "toggleAnnotationSidebar"
        });
        this.updateStatus("Sidebar toggled", "success");
      } catch (error) {
        console.error("[Popup] Error toggling sidebar:", error);
        this.updateStatus("Error: Please reload the page", "error");
      }
    });
    console.log("[Popup] Annotations initialized");
  }
  // ============================================================
  // CITATION: QUICK VIEW PANEL
  // ============================================================
  setupCitationPanel() {
    const expandBtn = document.getElementById("btn-expand-citations");
    const panelContainer = document.getElementById("citation-manager-panel");
    const expandIcon = document.getElementById("expand-citations-icon");
    const expandText = document.getElementById("expand-citations-text");
    if (!expandBtn || !panelContainer) {
      console.log("[Popup] Citation panel elements not found");
      return;
    }
    this.citationPanel = new CitationManagerPanel(panelContainer, {
      onStatusUpdate: (msg, type) => this.updateStatus(msg, type),
      currentTab: this.currentTab
    });
    this.updateCitationCount();
    expandBtn.addEventListener("click", async () => {
      this.citationPanelExpanded = !this.citationPanelExpanded;
      if (this.citationPanelExpanded) {
        panelContainer.style.display = "block";
        expandIcon.style.transform = "rotate(180deg)";
        expandText.textContent = "Hide Quick View";
        expandBtn.setAttribute("aria-expanded", "true");
        await this.citationPanel.initialize();
      } else {
        panelContainer.style.display = "none";
        expandIcon.style.transform = "rotate(0deg)";
        expandText.textContent = "Show Quick View";
        expandBtn.setAttribute("aria-expanded", "false");
      }
    });
    expandBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        expandBtn.click();
      }
    });
    console.log("[Popup] Citation panel initialized");
  }
  async updateCitationCount() {
    const countBadge = document.getElementById("citation-count-badge");
    if (!countBadge || !this.currentTab) {
      return;
    }
    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        type: "GET_CITATIONS"
      });
      if (response && response.success) {
        const count = response.citations?.length || 0;
        countBadge.textContent = count;
        countBadge.title = `${count} citation${count === 1 ? "" : "s"} saved`;
      } else {
        countBadge.textContent = "0";
      }
    } catch (error) {
      console.log("[Popup] Could not get citation count:", error.message);
      countBadge.textContent = "0";
    }
  }
  // ============================================================
  // LOCAL LLM INTEGRATION
  // ============================================================
  setupLocalLLM() {
    if (!this.settings.localLLM) {
      this.settings.localLLM = {
        enabled: false,
        baseUrl: "http://localhost:11434",
        preferredModel: "llama3.2",
        fastModel: "phi3:mini",
        visionModel: "llava",
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
          predictiveLoading: true
        },
        cognitiveProfile: {
          persistence: "6months",
          lastCleared: null,
          exportEnabled: true
        },
        privacy: {
          neverSendToCloud: true,
          clearContextAfterSession: false,
          noPersonalDataInPrompts: true,
          localProcessingOnly: true
        },
        performance: {
          cacheResponses: true,
          cacheTTL: 3e5,
          maxConcurrentRequests: 2,
          timeoutMs: 3e4
        },
        ui: {
          showAIIndicator: true,
          showFallbackMessages: true,
          compactMode: false
        }
      };
    }
    const llmEnabled = document.getElementById("llm-enabled");
    const llmOptionsContainer = document.getElementById("llm-options-container");
    const llmStatusBadge = document.getElementById("llm-status-badge");
    document.getElementById("llm-connection-status");
    document.getElementById("llm-models-row");
    document.getElementById("llm-installed-models");
    const btnCheckLLM = document.getElementById("btn-check-llm");
    const llmInstallProgress = document.getElementById("llm-install-progress");
    const llmProgressModel = document.getElementById("llm-progress-model");
    const llmProgressPercent = document.getElementById("llm-progress-percent");
    const llmProgressFill = document.getElementById("llm-progress-fill");
    this.installedModels = [];
    llmEnabled.checked = this.settings.localLLM.enabled || false;
    if (llmEnabled.checked) {
      llmOptionsContainer.classList.remove("hidden");
      this.checkLLMStatus();
    } else {
      llmOptionsContainer.classList.add("hidden");
    }
    llmEnabled.addEventListener("change", (e) => {
      this.settings.localLLM.enabled = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        llmOptionsContainer.classList.remove("hidden");
        this.checkLLMStatus();
      } else {
        llmOptionsContainer.classList.add("hidden");
        llmStatusBadge.textContent = "Offline";
        llmStatusBadge.className = "llm-badge offline";
      }
    });
    btnCheckLLM.addEventListener("click", () => {
      this.checkLLMStatus();
    });
    document.querySelectorAll(".llm-install-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const modelName = btn.dataset.model;
        if (btn.classList.contains("installed") || btn.classList.contains("installing")) {
          return;
        }
        btn.classList.add("installing");
        btn.textContent = "Installing...";
        llmInstallProgress.classList.remove("hidden");
        llmProgressModel.textContent = `Installing ${modelName}...`;
        llmProgressPercent.textContent = "0%";
        llmProgressFill.style.width = "0%";
        try {
          const response = await chrome.runtime.sendMessage({
            action: "LOCAL_LLM_INSTALL_MODEL",
            modelName
          });
          if (response.success) {
            btn.classList.remove("installing");
            btn.classList.add("installed");
            btn.textContent = "Installed";
            this.installedModels.push(modelName);
            this.updateModelList();
          } else {
            throw new Error(response.error || "Installation failed");
          }
        } catch (error) {
          console.error("[Popup] Model install failed:", error);
          btn.classList.remove("installing");
          btn.textContent = "Install";
          this.updateStatus(`Failed to install ${modelName}`, "error");
        } finally {
          llmInstallProgress.classList.add("hidden");
        }
      });
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "LLM_INSTALL_PROGRESS") {
        llmProgressModel.textContent = `Installing ${message.modelName}...`;
        llmProgressPercent.textContent = `${message.progress.percent}%`;
        llmProgressFill.style.width = `${message.progress.percent}%`;
      }
    });
    const featureToggles = {
      "llm-feature-summarize": "smartSummarization",
      "llm-feature-simplify": "textSimplification",
      "llm-feature-tutor": "socraticTutor",
      "llm-feature-assignment": "assignmentAnalyzer",
      "llm-feature-prosody": "emotionalProsody",
      "llm-feature-vision": "visionAnalysis"
    };
    Object.entries(featureToggles).forEach(([elementId, settingKey]) => {
      const toggle = document.getElementById(elementId);
      if (toggle) {
        toggle.checked = this.settings.localLLM.features[settingKey] !== false;
        toggle.addEventListener("change", (e) => {
          this.settings.localLLM.features[settingKey] = e.target.checked;
          this.saveSettings();
        });
      }
    });
    const cognitiveToggle = document.getElementById("llm-cognitive-enabled");
    if (cognitiveToggle) {
      cognitiveToggle.checked = this.settings.localLLM.features.cognitiveProfile !== false;
      cognitiveToggle.addEventListener("change", (e) => {
        this.settings.localLLM.features.cognitiveProfile = e.target.checked;
        this.saveSettings();
      });
    }
    const persistenceSelect = document.getElementById("llm-profile-persistence");
    if (persistenceSelect) {
      persistenceSelect.value = this.settings.localLLM.cognitiveProfile?.persistence || "6months";
      persistenceSelect.addEventListener("change", (e) => {
        if (!this.settings.localLLM.cognitiveProfile) {
          this.settings.localLLM.cognitiveProfile = {};
        }
        this.settings.localLLM.cognitiveProfile.persistence = e.target.value;
        this.saveSettings();
      });
    }
    const btnExportProfile = document.getElementById("btn-export-profile");
    if (btnExportProfile) {
      btnExportProfile.addEventListener("click", async () => {
        try {
          const exportData = {
            version: "1.0",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            cognitiveProfile: this.settings.localLLM.cognitiveProfile,
            features: this.settings.localLLM.features
          };
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `assist-cognitive-profile-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          this.updateStatus("Profile exported", "success");
        } catch (error) {
          console.error("[Popup] Export failed:", error);
          this.updateStatus("Export failed", "error");
        }
      });
    }
    const btnClearProfile = document.getElementById("btn-clear-profile");
    if (btnClearProfile) {
      btnClearProfile.addEventListener("click", () => {
        if (confirm("Clear all cognitive profile data? This cannot be undone.")) {
          this.settings.localLLM.cognitiveProfile = {
            persistence: this.settings.localLLM.cognitiveProfile?.persistence || "6months",
            lastCleared: Date.now(),
            exportEnabled: true
          };
          this.saveSettings();
          this.updateStatus("Profile cleared", "success");
        }
      });
    }
    console.log("[Popup] Local LLM setup complete");
  }
  async checkLLMStatus() {
    const llmStatusBadge = document.getElementById("llm-status-badge");
    const llmConnectionStatus = document.getElementById("llm-connection-status");
    const llmModelsRow = document.getElementById("llm-models-row");
    const llmInstalledModels = document.getElementById("llm-installed-models");
    llmConnectionStatus.textContent = "Checking...";
    llmConnectionStatus.className = "llm-status-value";
    try {
      const response = await chrome.runtime.sendMessage({
        action: "LOCAL_LLM_CHECK"
      });
      if (response.success && response.available) {
        llmStatusBadge.textContent = "Online";
        llmStatusBadge.className = "llm-badge online";
        llmConnectionStatus.textContent = "Connected to Ollama";
        llmConnectionStatus.className = "llm-status-value connected";
        this.installedModels = response.models || [];
        if (this.installedModels.length > 0) {
          llmModelsRow.style.display = "flex";
          llmInstalledModels.textContent = this.installedModels.join(", ");
          this.updateModelList();
        } else {
          llmModelsRow.style.display = "none";
        }
      } else {
        llmStatusBadge.textContent = "Offline";
        llmStatusBadge.className = "llm-badge offline";
        llmConnectionStatus.textContent = "Not connected - Start Ollama";
        llmConnectionStatus.className = "llm-status-value disconnected";
        llmModelsRow.style.display = "none";
      }
    } catch (error) {
      console.error("[Popup] LLM check failed:", error);
      llmStatusBadge.textContent = "Error";
      llmStatusBadge.className = "llm-badge error";
      llmConnectionStatus.textContent = "Connection error";
      llmConnectionStatus.className = "llm-status-value disconnected";
      llmModelsRow.style.display = "none";
    }
  }
  updateModelList() {
    document.querySelectorAll(".llm-install-btn").forEach((btn) => {
      const modelName = btn.dataset.model;
      const isInstalled = this.installedModels.some(
        (m) => m === modelName || m.startsWith(modelName.split(":")[0])
      );
      if (isInstalled && !btn.classList.contains("installing")) {
        btn.classList.add("installed");
        btn.textContent = "Installed";
      }
    });
    const llmInstalledModels = document.getElementById("llm-installed-models");
    if (llmInstalledModels && this.installedModels.length > 0) {
      llmInstalledModels.textContent = this.installedModels.slice(0, 3).join(", ");
      if (this.installedModels.length > 3) {
        llmInstalledModels.textContent += ` +${this.installedModels.length - 3} more`;
      }
    }
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  const popup = new PopupController();
  await popup.initialize();
  await popup.setupUserProfiles();
});
//# sourceMappingURL=popup.html-BHjVKI6Y.js.map
