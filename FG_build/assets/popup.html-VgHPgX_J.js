const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/api-key-manager-IXHEYm1y.js","assets/_commonjs-dynamic-modules-C0OTmW6W.js"])))=>i.map(i=>d[i]);
import { g as getStorageAdapter, _ as __vitePreload, l as loadShortcuts, S as SHORTCUT_LABELS, s as saveShortcuts, e as eventToShortcut, v as validateShortcut } from "./storage-adapter-CU703aa-.js";
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
  },
  /**
   * UI Layout settings for modular popup customization
   * Allows users to reorder, rename, and hide sections/features
   */
  ui_layout: {
    // Order of accordion sections in main popup (matches data-section in HTML)
    sectionOrder: ["reading", "writing", "lookup", "display", "school", "local-ai"],
    // Visibility of each section (true = visible, false = hidden)
    sectionVisibility: {
      reading: true,
      writing: true,
      lookup: true,
      display: true,
      school: true,
      "local-ai": true
    },
    // Custom titles for sections (user-editable)
    sectionTitles: {
      reading: "Reading Help",
      writing: "Writing Help",
      lookup: "Look Up Words",
      display: "Page Display",
      school: "School Tools",
      "local-ai": "Local AI"
    },
    // Order of features within each section
    featureOrder: {
      reading: ["tts", "ocr", "reading-mode", "dyslexia-mode"],
      writing: ["stt", "annotations"],
      lookup: ["dictionary", "translation", "highlight-menu"],
      display: [
        "text-customization",
        "reading-guide",
        "focus-mode",
        "screen-overlay",
        "reduced-motion",
        "media-control",
        "dark-mode",
        "simplify",
        "reading-progress",
        "pomodoro",
        "stargardt"
      ],
      school: ["citations", "canvas", "moodle", "google-classroom"],
      "local-ai": ["llm-core", "llm-features"]
    },
    // Visibility of individual features within sections
    featureVisibility: {
      // Reading features
      tts: true,
      ocr: true,
      "reading-mode": true,
      "dyslexia-mode": true,
      // Writing features
      stt: true,
      annotations: true,
      // Lookup features
      dictionary: true,
      translation: true,
      "highlight-menu": true,
      // Display features
      "text-customization": true,
      "reading-guide": true,
      "focus-mode": true,
      "screen-overlay": true,
      "reduced-motion": true,
      "media-control": true,
      "dark-mode": true,
      simplify: true,
      "reading-progress": true,
      pomodoro: true,
      stargardt: true,
      // School tools (school section)
      citations: true,
      canvas: true,
      moodle: true,
      "google-classroom": true,
      // Local AI (local-ai section)
      "llm-core": true,
      "llm-features": true
    }
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
    let newIndex2;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        newIndex2 = (currentIndex + 1) % tabsArray.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        newIndex2 = (currentIndex - 1 + tabsArray.length) % tabsArray.length;
        break;
      case "Home":
        e.preventDefault();
        newIndex2 = 0;
        break;
      case "End":
        e.preventDefault();
        newIndex2 = tabsArray.length - 1;
        break;
      default:
        return;
    }
    tabsArray[newIndex2].focus();
    tabsArray[newIndex2].click();
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
    list.innerHTML = this.filteredCitations.slice(0, 20).map((citation, index2) => this.renderCitationCard(citation, index2)).join("");
    list.querySelectorAll(".citation-card").forEach((card, index2) => {
      card.addEventListener("click", () => {
        this.openCitation(this.filteredCitations[index2]);
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
  renderCitationCard(citation, index2) {
    const faviconUrl = citation.favicon || this.getFaviconFromUrl(citation.url);
    const authors = citation.authors?.length > 0 ? citation.authors.slice(0, 2).join(", ") : "Unknown author";
    const date = citation.savedAt ? this.formatDate(citation.savedAt) : "";
    return `
      <div class="citation-card"
           data-id="${citation.id}"
           role="listitem"
           tabindex="${index2 === this.focusedIndex ? "0" : "-1"}"
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
/**!
 * Sortable 1.15.6
 * @author	RubaXa   <trash@rubaxa.org>
 * @author	owenm    <owen23355@gmail.com>
 * @license MIT
 */
function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    if (enumerableOnly) {
      symbols = symbols.filter(function(sym) {
        return Object.getOwnPropertyDescriptor(object, sym).enumerable;
      });
    }
    keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread2(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};
    if (i % 2) {
      ownKeys(Object(source), true).forEach(function(key) {
        _defineProperty(target, key, source[key]);
      });
    } else if (Object.getOwnPropertyDescriptors) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
      ownKeys(Object(source)).forEach(function(key) {
        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
      });
    }
  }
  return target;
}
function _typeof(obj) {
  "@babel/helpers - typeof";
  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function(obj2) {
      return typeof obj2;
    };
  } else {
    _typeof = function(obj2) {
      return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
    };
  }
  return _typeof(obj);
}
function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
function _extends() {
  _extends = Object.assign || function(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}
function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;
  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }
  return target;
}
function _objectWithoutProperties(source, excluded) {
  if (source == null) return {};
  var target = _objectWithoutPropertiesLoose(source, excluded);
  var key, i;
  if (Object.getOwnPropertySymbols) {
    var sourceSymbolKeys = Object.getOwnPropertySymbols(source);
    for (i = 0; i < sourceSymbolKeys.length; i++) {
      key = sourceSymbolKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
      target[key] = source[key];
    }
  }
  return target;
}
var version = "1.15.6";
function userAgent(pattern) {
  if (typeof window !== "undefined" && window.navigator) {
    return !!/* @__PURE__ */ navigator.userAgent.match(pattern);
  }
}
var IE11OrLess = userAgent(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i);
var Edge = userAgent(/Edge/i);
var FireFox = userAgent(/firefox/i);
var Safari = userAgent(/safari/i) && !userAgent(/chrome/i) && !userAgent(/android/i);
var IOS = userAgent(/iP(ad|od|hone)/i);
var ChromeForAndroid = userAgent(/chrome/i) && userAgent(/android/i);
var captureMode = {
  capture: false,
  passive: false
};
function on(el, event, fn) {
  el.addEventListener(event, fn, !IE11OrLess && captureMode);
}
function off(el, event, fn) {
  el.removeEventListener(event, fn, !IE11OrLess && captureMode);
}
function matches(el, selector) {
  if (!selector) return;
  selector[0] === ">" && (selector = selector.substring(1));
  if (el) {
    try {
      if (el.matches) {
        return el.matches(selector);
      } else if (el.msMatchesSelector) {
        return el.msMatchesSelector(selector);
      } else if (el.webkitMatchesSelector) {
        return el.webkitMatchesSelector(selector);
      }
    } catch (_) {
      return false;
    }
  }
  return false;
}
function getParentOrHost(el) {
  return el.host && el !== document && el.host.nodeType ? el.host : el.parentNode;
}
function closest(el, selector, ctx, includeCTX) {
  if (el) {
    ctx = ctx || document;
    do {
      if (selector != null && (selector[0] === ">" ? el.parentNode === ctx && matches(el, selector) : matches(el, selector)) || includeCTX && el === ctx) {
        return el;
      }
      if (el === ctx) break;
    } while (el = getParentOrHost(el));
  }
  return null;
}
var R_SPACE = /\s+/g;
function toggleClass(el, name, state) {
  if (el && name) {
    if (el.classList) {
      el.classList[state ? "add" : "remove"](name);
    } else {
      var className = (" " + el.className + " ").replace(R_SPACE, " ").replace(" " + name + " ", " ");
      el.className = (className + (state ? " " + name : "")).replace(R_SPACE, " ");
    }
  }
}
function css(el, prop, val) {
  var style = el && el.style;
  if (style) {
    if (val === void 0) {
      if (document.defaultView && document.defaultView.getComputedStyle) {
        val = document.defaultView.getComputedStyle(el, "");
      } else if (el.currentStyle) {
        val = el.currentStyle;
      }
      return prop === void 0 ? val : val[prop];
    } else {
      if (!(prop in style) && prop.indexOf("webkit") === -1) {
        prop = "-webkit-" + prop;
      }
      style[prop] = val + (typeof val === "string" ? "" : "px");
    }
  }
}
function matrix(el, selfOnly) {
  var appliedTransforms = "";
  if (typeof el === "string") {
    appliedTransforms = el;
  } else {
    do {
      var transform = css(el, "transform");
      if (transform && transform !== "none") {
        appliedTransforms = transform + " " + appliedTransforms;
      }
    } while (!selfOnly && (el = el.parentNode));
  }
  var matrixFn = window.DOMMatrix || window.WebKitCSSMatrix || window.CSSMatrix || window.MSCSSMatrix;
  return matrixFn && new matrixFn(appliedTransforms);
}
function find(ctx, tagName, iterator) {
  if (ctx) {
    var list = ctx.getElementsByTagName(tagName), i = 0, n = list.length;
    if (iterator) {
      for (; i < n; i++) {
        iterator(list[i], i);
      }
    }
    return list;
  }
  return [];
}
function getWindowScrollingElement() {
  var scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    return scrollingElement;
  } else {
    return document.documentElement;
  }
}
function getRect(el, relativeToContainingBlock, relativeToNonStaticParent, undoScale, container) {
  if (!el.getBoundingClientRect && el !== window) return;
  var elRect, top, left, bottom, right, height, width;
  if (el !== window && el.parentNode && el !== getWindowScrollingElement()) {
    elRect = el.getBoundingClientRect();
    top = elRect.top;
    left = elRect.left;
    bottom = elRect.bottom;
    right = elRect.right;
    height = elRect.height;
    width = elRect.width;
  } else {
    top = 0;
    left = 0;
    bottom = window.innerHeight;
    right = window.innerWidth;
    height = window.innerHeight;
    width = window.innerWidth;
  }
  if ((relativeToContainingBlock || relativeToNonStaticParent) && el !== window) {
    container = container || el.parentNode;
    if (!IE11OrLess) {
      do {
        if (container && container.getBoundingClientRect && (css(container, "transform") !== "none" || relativeToNonStaticParent && css(container, "position") !== "static")) {
          var containerRect = container.getBoundingClientRect();
          top -= containerRect.top + parseInt(css(container, "border-top-width"));
          left -= containerRect.left + parseInt(css(container, "border-left-width"));
          bottom = top + elRect.height;
          right = left + elRect.width;
          break;
        }
      } while (container = container.parentNode);
    }
  }
  if (undoScale && el !== window) {
    var elMatrix = matrix(container || el), scaleX = elMatrix && elMatrix.a, scaleY = elMatrix && elMatrix.d;
    if (elMatrix) {
      top /= scaleY;
      left /= scaleX;
      width /= scaleX;
      height /= scaleY;
      bottom = top + height;
      right = left + width;
    }
  }
  return {
    top,
    left,
    bottom,
    right,
    width,
    height
  };
}
function isScrolledPast(el, elSide, parentSide) {
  var parent = getParentAutoScrollElement(el, true), elSideVal = getRect(el)[elSide];
  while (parent) {
    var parentSideVal = getRect(parent)[parentSide], visible = void 0;
    {
      visible = elSideVal >= parentSideVal;
    }
    if (!visible) return parent;
    if (parent === getWindowScrollingElement()) break;
    parent = getParentAutoScrollElement(parent, false);
  }
  return false;
}
function getChild(el, childNum, options, includeDragEl) {
  var currentChild = 0, i = 0, children = el.children;
  while (i < children.length) {
    if (children[i].style.display !== "none" && children[i] !== Sortable.ghost && (includeDragEl || children[i] !== Sortable.dragged) && closest(children[i], options.draggable, el, false)) {
      if (currentChild === childNum) {
        return children[i];
      }
      currentChild++;
    }
    i++;
  }
  return null;
}
function lastChild(el, selector) {
  var last = el.lastElementChild;
  while (last && (last === Sortable.ghost || css(last, "display") === "none" || selector && !matches(last, selector))) {
    last = last.previousElementSibling;
  }
  return last || null;
}
function index(el, selector) {
  var index2 = 0;
  if (!el || !el.parentNode) {
    return -1;
  }
  while (el = el.previousElementSibling) {
    if (el.nodeName.toUpperCase() !== "TEMPLATE" && el !== Sortable.clone && (!selector || matches(el, selector))) {
      index2++;
    }
  }
  return index2;
}
function getRelativeScrollOffset(el) {
  var offsetLeft = 0, offsetTop = 0, winScroller = getWindowScrollingElement();
  if (el) {
    do {
      var elMatrix = matrix(el), scaleX = elMatrix.a, scaleY = elMatrix.d;
      offsetLeft += el.scrollLeft * scaleX;
      offsetTop += el.scrollTop * scaleY;
    } while (el !== winScroller && (el = el.parentNode));
  }
  return [offsetLeft, offsetTop];
}
function indexOfObject(arr, obj) {
  for (var i in arr) {
    if (!arr.hasOwnProperty(i)) continue;
    for (var key in obj) {
      if (obj.hasOwnProperty(key) && obj[key] === arr[i][key]) return Number(i);
    }
  }
  return -1;
}
function getParentAutoScrollElement(el, includeSelf) {
  if (!el || !el.getBoundingClientRect) return getWindowScrollingElement();
  var elem = el;
  var gotSelf = false;
  do {
    if (elem.clientWidth < elem.scrollWidth || elem.clientHeight < elem.scrollHeight) {
      var elemCSS = css(elem);
      if (elem.clientWidth < elem.scrollWidth && (elemCSS.overflowX == "auto" || elemCSS.overflowX == "scroll") || elem.clientHeight < elem.scrollHeight && (elemCSS.overflowY == "auto" || elemCSS.overflowY == "scroll")) {
        if (!elem.getBoundingClientRect || elem === document.body) return getWindowScrollingElement();
        if (gotSelf || includeSelf) return elem;
        gotSelf = true;
      }
    }
  } while (elem = elem.parentNode);
  return getWindowScrollingElement();
}
function extend(dst, src) {
  if (dst && src) {
    for (var key in src) {
      if (src.hasOwnProperty(key)) {
        dst[key] = src[key];
      }
    }
  }
  return dst;
}
function isRectEqual(rect1, rect2) {
  return Math.round(rect1.top) === Math.round(rect2.top) && Math.round(rect1.left) === Math.round(rect2.left) && Math.round(rect1.height) === Math.round(rect2.height) && Math.round(rect1.width) === Math.round(rect2.width);
}
var _throttleTimeout;
function throttle(callback, ms) {
  return function() {
    if (!_throttleTimeout) {
      var args = arguments, _this = this;
      if (args.length === 1) {
        callback.call(_this, args[0]);
      } else {
        callback.apply(_this, args);
      }
      _throttleTimeout = setTimeout(function() {
        _throttleTimeout = void 0;
      }, ms);
    }
  };
}
function cancelThrottle() {
  clearTimeout(_throttleTimeout);
  _throttleTimeout = void 0;
}
function scrollBy(el, x, y) {
  el.scrollLeft += x;
  el.scrollTop += y;
}
function clone(el) {
  var Polymer = window.Polymer;
  var $ = window.jQuery || window.Zepto;
  if (Polymer && Polymer.dom) {
    return Polymer.dom(el).cloneNode(true);
  } else if ($) {
    return $(el).clone(true)[0];
  } else {
    return el.cloneNode(true);
  }
}
function getChildContainingRectFromElement(container, options, ghostEl2) {
  var rect = {};
  Array.from(container.children).forEach(function(child) {
    var _rect$left, _rect$top, _rect$right, _rect$bottom;
    if (!closest(child, options.draggable, container, false) || child.animated || child === ghostEl2) return;
    var childRect = getRect(child);
    rect.left = Math.min((_rect$left = rect.left) !== null && _rect$left !== void 0 ? _rect$left : Infinity, childRect.left);
    rect.top = Math.min((_rect$top = rect.top) !== null && _rect$top !== void 0 ? _rect$top : Infinity, childRect.top);
    rect.right = Math.max((_rect$right = rect.right) !== null && _rect$right !== void 0 ? _rect$right : -Infinity, childRect.right);
    rect.bottom = Math.max((_rect$bottom = rect.bottom) !== null && _rect$bottom !== void 0 ? _rect$bottom : -Infinity, childRect.bottom);
  });
  rect.width = rect.right - rect.left;
  rect.height = rect.bottom - rect.top;
  rect.x = rect.left;
  rect.y = rect.top;
  return rect;
}
var expando = "Sortable" + (/* @__PURE__ */ new Date()).getTime();
function AnimationStateManager() {
  var animationStates = [], animationCallbackId;
  return {
    captureAnimationState: function captureAnimationState() {
      animationStates = [];
      if (!this.options.animation) return;
      var children = [].slice.call(this.el.children);
      children.forEach(function(child) {
        if (css(child, "display") === "none" || child === Sortable.ghost) return;
        animationStates.push({
          target: child,
          rect: getRect(child)
        });
        var fromRect = _objectSpread2({}, animationStates[animationStates.length - 1].rect);
        if (child.thisAnimationDuration) {
          var childMatrix = matrix(child, true);
          if (childMatrix) {
            fromRect.top -= childMatrix.f;
            fromRect.left -= childMatrix.e;
          }
        }
        child.fromRect = fromRect;
      });
    },
    addAnimationState: function addAnimationState(state) {
      animationStates.push(state);
    },
    removeAnimationState: function removeAnimationState(target) {
      animationStates.splice(indexOfObject(animationStates, {
        target
      }), 1);
    },
    animateAll: function animateAll(callback) {
      var _this = this;
      if (!this.options.animation) {
        clearTimeout(animationCallbackId);
        if (typeof callback === "function") callback();
        return;
      }
      var animating = false, animationTime = 0;
      animationStates.forEach(function(state) {
        var time = 0, target = state.target, fromRect = target.fromRect, toRect = getRect(target), prevFromRect = target.prevFromRect, prevToRect = target.prevToRect, animatingRect = state.rect, targetMatrix = matrix(target, true);
        if (targetMatrix) {
          toRect.top -= targetMatrix.f;
          toRect.left -= targetMatrix.e;
        }
        target.toRect = toRect;
        if (target.thisAnimationDuration) {
          if (isRectEqual(prevFromRect, toRect) && !isRectEqual(fromRect, toRect) && // Make sure animatingRect is on line between toRect & fromRect
          (animatingRect.top - toRect.top) / (animatingRect.left - toRect.left) === (fromRect.top - toRect.top) / (fromRect.left - toRect.left)) {
            time = calculateRealTime(animatingRect, prevFromRect, prevToRect, _this.options);
          }
        }
        if (!isRectEqual(toRect, fromRect)) {
          target.prevFromRect = fromRect;
          target.prevToRect = toRect;
          if (!time) {
            time = _this.options.animation;
          }
          _this.animate(target, animatingRect, toRect, time);
        }
        if (time) {
          animating = true;
          animationTime = Math.max(animationTime, time);
          clearTimeout(target.animationResetTimer);
          target.animationResetTimer = setTimeout(function() {
            target.animationTime = 0;
            target.prevFromRect = null;
            target.fromRect = null;
            target.prevToRect = null;
            target.thisAnimationDuration = null;
          }, time);
          target.thisAnimationDuration = time;
        }
      });
      clearTimeout(animationCallbackId);
      if (!animating) {
        if (typeof callback === "function") callback();
      } else {
        animationCallbackId = setTimeout(function() {
          if (typeof callback === "function") callback();
        }, animationTime);
      }
      animationStates = [];
    },
    animate: function animate(target, currentRect, toRect, duration) {
      if (duration) {
        css(target, "transition", "");
        css(target, "transform", "");
        var elMatrix = matrix(this.el), scaleX = elMatrix && elMatrix.a, scaleY = elMatrix && elMatrix.d, translateX = (currentRect.left - toRect.left) / (scaleX || 1), translateY = (currentRect.top - toRect.top) / (scaleY || 1);
        target.animatingX = !!translateX;
        target.animatingY = !!translateY;
        css(target, "transform", "translate3d(" + translateX + "px," + translateY + "px,0)");
        this.forRepaintDummy = repaint(target);
        css(target, "transition", "transform " + duration + "ms" + (this.options.easing ? " " + this.options.easing : ""));
        css(target, "transform", "translate3d(0,0,0)");
        typeof target.animated === "number" && clearTimeout(target.animated);
        target.animated = setTimeout(function() {
          css(target, "transition", "");
          css(target, "transform", "");
          target.animated = false;
          target.animatingX = false;
          target.animatingY = false;
        }, duration);
      }
    }
  };
}
function repaint(target) {
  return target.offsetWidth;
}
function calculateRealTime(animatingRect, fromRect, toRect, options) {
  return Math.sqrt(Math.pow(fromRect.top - animatingRect.top, 2) + Math.pow(fromRect.left - animatingRect.left, 2)) / Math.sqrt(Math.pow(fromRect.top - toRect.top, 2) + Math.pow(fromRect.left - toRect.left, 2)) * options.animation;
}
var plugins = [];
var defaults = {
  initializeByDefault: true
};
var PluginManager = {
  mount: function mount(plugin) {
    for (var option2 in defaults) {
      if (defaults.hasOwnProperty(option2) && !(option2 in plugin)) {
        plugin[option2] = defaults[option2];
      }
    }
    plugins.forEach(function(p) {
      if (p.pluginName === plugin.pluginName) {
        throw "Sortable: Cannot mount plugin ".concat(plugin.pluginName, " more than once");
      }
    });
    plugins.push(plugin);
  },
  pluginEvent: function pluginEvent(eventName, sortable, evt) {
    var _this = this;
    this.eventCanceled = false;
    evt.cancel = function() {
      _this.eventCanceled = true;
    };
    var eventNameGlobal = eventName + "Global";
    plugins.forEach(function(plugin) {
      if (!sortable[plugin.pluginName]) return;
      if (sortable[plugin.pluginName][eventNameGlobal]) {
        sortable[plugin.pluginName][eventNameGlobal](_objectSpread2({
          sortable
        }, evt));
      }
      if (sortable.options[plugin.pluginName] && sortable[plugin.pluginName][eventName]) {
        sortable[plugin.pluginName][eventName](_objectSpread2({
          sortable
        }, evt));
      }
    });
  },
  initializePlugins: function initializePlugins(sortable, el, defaults2, options) {
    plugins.forEach(function(plugin) {
      var pluginName = plugin.pluginName;
      if (!sortable.options[pluginName] && !plugin.initializeByDefault) return;
      var initialized = new plugin(sortable, el, sortable.options);
      initialized.sortable = sortable;
      initialized.options = sortable.options;
      sortable[pluginName] = initialized;
      _extends(defaults2, initialized.defaults);
    });
    for (var option2 in sortable.options) {
      if (!sortable.options.hasOwnProperty(option2)) continue;
      var modified = this.modifyOption(sortable, option2, sortable.options[option2]);
      if (typeof modified !== "undefined") {
        sortable.options[option2] = modified;
      }
    }
  },
  getEventProperties: function getEventProperties(name, sortable) {
    var eventProperties = {};
    plugins.forEach(function(plugin) {
      if (typeof plugin.eventProperties !== "function") return;
      _extends(eventProperties, plugin.eventProperties.call(sortable[plugin.pluginName], name));
    });
    return eventProperties;
  },
  modifyOption: function modifyOption(sortable, name, value) {
    var modifiedValue;
    plugins.forEach(function(plugin) {
      if (!sortable[plugin.pluginName]) return;
      if (plugin.optionListeners && typeof plugin.optionListeners[name] === "function") {
        modifiedValue = plugin.optionListeners[name].call(sortable[plugin.pluginName], value);
      }
    });
    return modifiedValue;
  }
};
function dispatchEvent(_ref) {
  var sortable = _ref.sortable, rootEl2 = _ref.rootEl, name = _ref.name, targetEl = _ref.targetEl, cloneEl2 = _ref.cloneEl, toEl = _ref.toEl, fromEl = _ref.fromEl, oldIndex2 = _ref.oldIndex, newIndex2 = _ref.newIndex, oldDraggableIndex2 = _ref.oldDraggableIndex, newDraggableIndex2 = _ref.newDraggableIndex, originalEvent = _ref.originalEvent, putSortable2 = _ref.putSortable, extraEventProperties = _ref.extraEventProperties;
  sortable = sortable || rootEl2 && rootEl2[expando];
  if (!sortable) return;
  var evt, options = sortable.options, onName = "on" + name.charAt(0).toUpperCase() + name.substr(1);
  if (window.CustomEvent && !IE11OrLess && !Edge) {
    evt = new CustomEvent(name, {
      bubbles: true,
      cancelable: true
    });
  } else {
    evt = document.createEvent("Event");
    evt.initEvent(name, true, true);
  }
  evt.to = toEl || rootEl2;
  evt.from = fromEl || rootEl2;
  evt.item = targetEl || rootEl2;
  evt.clone = cloneEl2;
  evt.oldIndex = oldIndex2;
  evt.newIndex = newIndex2;
  evt.oldDraggableIndex = oldDraggableIndex2;
  evt.newDraggableIndex = newDraggableIndex2;
  evt.originalEvent = originalEvent;
  evt.pullMode = putSortable2 ? putSortable2.lastPutMode : void 0;
  var allEventProperties = _objectSpread2(_objectSpread2({}, extraEventProperties), PluginManager.getEventProperties(name, sortable));
  for (var option2 in allEventProperties) {
    evt[option2] = allEventProperties[option2];
  }
  if (rootEl2) {
    rootEl2.dispatchEvent(evt);
  }
  if (options[onName]) {
    options[onName].call(sortable, evt);
  }
}
var _excluded = ["evt"];
var pluginEvent2 = function pluginEvent3(eventName, sortable) {
  var _ref = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {}, originalEvent = _ref.evt, data = _objectWithoutProperties(_ref, _excluded);
  PluginManager.pluginEvent.bind(Sortable)(eventName, sortable, _objectSpread2({
    dragEl,
    parentEl,
    ghostEl,
    rootEl,
    nextEl,
    lastDownEl,
    cloneEl,
    cloneHidden,
    dragStarted: moved,
    putSortable,
    activeSortable: Sortable.active,
    originalEvent,
    oldIndex,
    oldDraggableIndex,
    newIndex,
    newDraggableIndex,
    hideGhostForTarget: _hideGhostForTarget,
    unhideGhostForTarget: _unhideGhostForTarget,
    cloneNowHidden: function cloneNowHidden() {
      cloneHidden = true;
    },
    cloneNowShown: function cloneNowShown() {
      cloneHidden = false;
    },
    dispatchSortableEvent: function dispatchSortableEvent(name) {
      _dispatchEvent({
        sortable,
        name,
        originalEvent
      });
    }
  }, data));
};
function _dispatchEvent(info) {
  dispatchEvent(_objectSpread2({
    putSortable,
    cloneEl,
    targetEl: dragEl,
    rootEl,
    oldIndex,
    oldDraggableIndex,
    newIndex,
    newDraggableIndex
  }, info));
}
var dragEl, parentEl, ghostEl, rootEl, nextEl, lastDownEl, cloneEl, cloneHidden, oldIndex, newIndex, oldDraggableIndex, newDraggableIndex, activeGroup, putSortable, awaitingDragStarted = false, ignoreNextClick = false, sortables = [], tapEvt, touchEvt, lastDx, lastDy, tapDistanceLeft, tapDistanceTop, moved, lastTarget, lastDirection, pastFirstInvertThresh = false, isCircumstantialInvert = false, targetMoveDistance, ghostRelativeParent, ghostRelativeParentInitialScroll = [], _silent = false, savedInputChecked = [];
var documentExists = typeof document !== "undefined", PositionGhostAbsolutely = IOS, CSSFloatProperty = Edge || IE11OrLess ? "cssFloat" : "float", supportDraggable = documentExists && !ChromeForAndroid && !IOS && "draggable" in document.createElement("div"), supportCssPointerEvents = (function() {
  if (!documentExists) return;
  if (IE11OrLess) {
    return false;
  }
  var el = document.createElement("x");
  el.style.cssText = "pointer-events:auto";
  return el.style.pointerEvents === "auto";
})(), _detectDirection = function _detectDirection2(el, options) {
  var elCSS = css(el), elWidth = parseInt(elCSS.width) - parseInt(elCSS.paddingLeft) - parseInt(elCSS.paddingRight) - parseInt(elCSS.borderLeftWidth) - parseInt(elCSS.borderRightWidth), child1 = getChild(el, 0, options), child2 = getChild(el, 1, options), firstChildCSS = child1 && css(child1), secondChildCSS = child2 && css(child2), firstChildWidth = firstChildCSS && parseInt(firstChildCSS.marginLeft) + parseInt(firstChildCSS.marginRight) + getRect(child1).width, secondChildWidth = secondChildCSS && parseInt(secondChildCSS.marginLeft) + parseInt(secondChildCSS.marginRight) + getRect(child2).width;
  if (elCSS.display === "flex") {
    return elCSS.flexDirection === "column" || elCSS.flexDirection === "column-reverse" ? "vertical" : "horizontal";
  }
  if (elCSS.display === "grid") {
    return elCSS.gridTemplateColumns.split(" ").length <= 1 ? "vertical" : "horizontal";
  }
  if (child1 && firstChildCSS["float"] && firstChildCSS["float"] !== "none") {
    var touchingSideChild2 = firstChildCSS["float"] === "left" ? "left" : "right";
    return child2 && (secondChildCSS.clear === "both" || secondChildCSS.clear === touchingSideChild2) ? "vertical" : "horizontal";
  }
  return child1 && (firstChildCSS.display === "block" || firstChildCSS.display === "flex" || firstChildCSS.display === "table" || firstChildCSS.display === "grid" || firstChildWidth >= elWidth && elCSS[CSSFloatProperty] === "none" || child2 && elCSS[CSSFloatProperty] === "none" && firstChildWidth + secondChildWidth > elWidth) ? "vertical" : "horizontal";
}, _dragElInRowColumn = function _dragElInRowColumn2(dragRect, targetRect, vertical) {
  var dragElS1Opp = vertical ? dragRect.left : dragRect.top, dragElS2Opp = vertical ? dragRect.right : dragRect.bottom, dragElOppLength = vertical ? dragRect.width : dragRect.height, targetS1Opp = vertical ? targetRect.left : targetRect.top, targetS2Opp = vertical ? targetRect.right : targetRect.bottom, targetOppLength = vertical ? targetRect.width : targetRect.height;
  return dragElS1Opp === targetS1Opp || dragElS2Opp === targetS2Opp || dragElS1Opp + dragElOppLength / 2 === targetS1Opp + targetOppLength / 2;
}, _detectNearestEmptySortable = function _detectNearestEmptySortable2(x, y) {
  var ret;
  sortables.some(function(sortable) {
    var threshold = sortable[expando].options.emptyInsertThreshold;
    if (!threshold || lastChild(sortable)) return;
    var rect = getRect(sortable), insideHorizontally = x >= rect.left - threshold && x <= rect.right + threshold, insideVertically = y >= rect.top - threshold && y <= rect.bottom + threshold;
    if (insideHorizontally && insideVertically) {
      return ret = sortable;
    }
  });
  return ret;
}, _prepareGroup = function _prepareGroup2(options) {
  function toFn(value, pull) {
    return function(to, from, dragEl2, evt) {
      var sameGroup = to.options.group.name && from.options.group.name && to.options.group.name === from.options.group.name;
      if (value == null && (pull || sameGroup)) {
        return true;
      } else if (value == null || value === false) {
        return false;
      } else if (pull && value === "clone") {
        return value;
      } else if (typeof value === "function") {
        return toFn(value(to, from, dragEl2, evt), pull)(to, from, dragEl2, evt);
      } else {
        var otherGroup = (pull ? to : from).options.group.name;
        return value === true || typeof value === "string" && value === otherGroup || value.join && value.indexOf(otherGroup) > -1;
      }
    };
  }
  var group = {};
  var originalGroup = options.group;
  if (!originalGroup || _typeof(originalGroup) != "object") {
    originalGroup = {
      name: originalGroup
    };
  }
  group.name = originalGroup.name;
  group.checkPull = toFn(originalGroup.pull, true);
  group.checkPut = toFn(originalGroup.put);
  group.revertClone = originalGroup.revertClone;
  options.group = group;
}, _hideGhostForTarget = function _hideGhostForTarget2() {
  if (!supportCssPointerEvents && ghostEl) {
    css(ghostEl, "display", "none");
  }
}, _unhideGhostForTarget = function _unhideGhostForTarget2() {
  if (!supportCssPointerEvents && ghostEl) {
    css(ghostEl, "display", "");
  }
};
if (documentExists && !ChromeForAndroid) {
  document.addEventListener("click", function(evt) {
    if (ignoreNextClick) {
      evt.preventDefault();
      evt.stopPropagation && evt.stopPropagation();
      evt.stopImmediatePropagation && evt.stopImmediatePropagation();
      ignoreNextClick = false;
      return false;
    }
  }, true);
}
var nearestEmptyInsertDetectEvent = function nearestEmptyInsertDetectEvent2(evt) {
  if (dragEl) {
    evt = evt.touches ? evt.touches[0] : evt;
    var nearest = _detectNearestEmptySortable(evt.clientX, evt.clientY);
    if (nearest) {
      var event = {};
      for (var i in evt) {
        if (evt.hasOwnProperty(i)) {
          event[i] = evt[i];
        }
      }
      event.target = event.rootEl = nearest;
      event.preventDefault = void 0;
      event.stopPropagation = void 0;
      nearest[expando]._onDragOver(event);
    }
  }
};
var _checkOutsideTargetEl = function _checkOutsideTargetEl2(evt) {
  if (dragEl) {
    dragEl.parentNode[expando]._isOutsideThisEl(evt.target);
  }
};
function Sortable(el, options) {
  if (!(el && el.nodeType && el.nodeType === 1)) {
    throw "Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(el));
  }
  this.el = el;
  this.options = options = _extends({}, options);
  el[expando] = this;
  var defaults2 = {
    group: null,
    sort: true,
    disabled: false,
    store: null,
    handle: null,
    draggable: /^[uo]l$/i.test(el.nodeName) ? ">li" : ">*",
    swapThreshold: 1,
    // percentage; 0 <= x <= 1
    invertSwap: false,
    // invert always
    invertedSwapThreshold: null,
    // will be set to same as swapThreshold if default
    removeCloneOnHide: true,
    direction: function direction() {
      return _detectDirection(el, this.options);
    },
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    ignore: "a, img",
    filter: null,
    preventOnFilter: true,
    animation: 0,
    easing: null,
    setData: function setData(dataTransfer, dragEl2) {
      dataTransfer.setData("Text", dragEl2.textContent);
    },
    dropBubble: false,
    dragoverBubble: false,
    dataIdAttr: "data-id",
    delay: 0,
    delayOnTouchOnly: false,
    touchStartThreshold: (Number.parseInt ? Number : window).parseInt(window.devicePixelRatio, 10) || 1,
    forceFallback: false,
    fallbackClass: "sortable-fallback",
    fallbackOnBody: false,
    fallbackTolerance: 0,
    fallbackOffset: {
      x: 0,
      y: 0
    },
    // Disabled on Safari: #1571; Enabled on Safari IOS: #2244
    supportPointer: Sortable.supportPointer !== false && "PointerEvent" in window && (!Safari || IOS),
    emptyInsertThreshold: 5
  };
  PluginManager.initializePlugins(this, el, defaults2);
  for (var name in defaults2) {
    !(name in options) && (options[name] = defaults2[name]);
  }
  _prepareGroup(options);
  for (var fn in this) {
    if (fn.charAt(0) === "_" && typeof this[fn] === "function") {
      this[fn] = this[fn].bind(this);
    }
  }
  this.nativeDraggable = options.forceFallback ? false : supportDraggable;
  if (this.nativeDraggable) {
    this.options.touchStartThreshold = 1;
  }
  if (options.supportPointer) {
    on(el, "pointerdown", this._onTapStart);
  } else {
    on(el, "mousedown", this._onTapStart);
    on(el, "touchstart", this._onTapStart);
  }
  if (this.nativeDraggable) {
    on(el, "dragover", this);
    on(el, "dragenter", this);
  }
  sortables.push(this.el);
  options.store && options.store.get && this.sort(options.store.get(this) || []);
  _extends(this, AnimationStateManager());
}
Sortable.prototype = /** @lends Sortable.prototype */
{
  constructor: Sortable,
  _isOutsideThisEl: function _isOutsideThisEl(target) {
    if (!this.el.contains(target) && target !== this.el) {
      lastTarget = null;
    }
  },
  _getDirection: function _getDirection(evt, target) {
    return typeof this.options.direction === "function" ? this.options.direction.call(this, evt, target, dragEl) : this.options.direction;
  },
  _onTapStart: function _onTapStart(evt) {
    if (!evt.cancelable) return;
    var _this = this, el = this.el, options = this.options, preventOnFilter = options.preventOnFilter, type = evt.type, touch = evt.touches && evt.touches[0] || evt.pointerType && evt.pointerType === "touch" && evt, target = (touch || evt).target, originalTarget = evt.target.shadowRoot && (evt.path && evt.path[0] || evt.composedPath && evt.composedPath()[0]) || target, filter = options.filter;
    _saveInputCheckedState(el);
    if (dragEl) {
      return;
    }
    if (/mousedown|pointerdown/.test(type) && evt.button !== 0 || options.disabled) {
      return;
    }
    if (originalTarget.isContentEditable) {
      return;
    }
    if (!this.nativeDraggable && Safari && target && target.tagName.toUpperCase() === "SELECT") {
      return;
    }
    target = closest(target, options.draggable, el, false);
    if (target && target.animated) {
      return;
    }
    if (lastDownEl === target) {
      return;
    }
    oldIndex = index(target);
    oldDraggableIndex = index(target, options.draggable);
    if (typeof filter === "function") {
      if (filter.call(this, evt, target, this)) {
        _dispatchEvent({
          sortable: _this,
          rootEl: originalTarget,
          name: "filter",
          targetEl: target,
          toEl: el,
          fromEl: el
        });
        pluginEvent2("filter", _this, {
          evt
        });
        preventOnFilter && evt.preventDefault();
        return;
      }
    } else if (filter) {
      filter = filter.split(",").some(function(criteria) {
        criteria = closest(originalTarget, criteria.trim(), el, false);
        if (criteria) {
          _dispatchEvent({
            sortable: _this,
            rootEl: criteria,
            name: "filter",
            targetEl: target,
            fromEl: el,
            toEl: el
          });
          pluginEvent2("filter", _this, {
            evt
          });
          return true;
        }
      });
      if (filter) {
        preventOnFilter && evt.preventDefault();
        return;
      }
    }
    if (options.handle && !closest(originalTarget, options.handle, el, false)) {
      return;
    }
    this._prepareDragStart(evt, touch, target);
  },
  _prepareDragStart: function _prepareDragStart(evt, touch, target) {
    var _this = this, el = _this.el, options = _this.options, ownerDocument = el.ownerDocument, dragStartFn;
    if (target && !dragEl && target.parentNode === el) {
      var dragRect = getRect(target);
      rootEl = el;
      dragEl = target;
      parentEl = dragEl.parentNode;
      nextEl = dragEl.nextSibling;
      lastDownEl = target;
      activeGroup = options.group;
      Sortable.dragged = dragEl;
      tapEvt = {
        target: dragEl,
        clientX: (touch || evt).clientX,
        clientY: (touch || evt).clientY
      };
      tapDistanceLeft = tapEvt.clientX - dragRect.left;
      tapDistanceTop = tapEvt.clientY - dragRect.top;
      this._lastX = (touch || evt).clientX;
      this._lastY = (touch || evt).clientY;
      dragEl.style["will-change"] = "all";
      dragStartFn = function dragStartFn2() {
        pluginEvent2("delayEnded", _this, {
          evt
        });
        if (Sortable.eventCanceled) {
          _this._onDrop();
          return;
        }
        _this._disableDelayedDragEvents();
        if (!FireFox && _this.nativeDraggable) {
          dragEl.draggable = true;
        }
        _this._triggerDragStart(evt, touch);
        _dispatchEvent({
          sortable: _this,
          name: "choose",
          originalEvent: evt
        });
        toggleClass(dragEl, options.chosenClass, true);
      };
      options.ignore.split(",").forEach(function(criteria) {
        find(dragEl, criteria.trim(), _disableDraggable);
      });
      on(ownerDocument, "dragover", nearestEmptyInsertDetectEvent);
      on(ownerDocument, "mousemove", nearestEmptyInsertDetectEvent);
      on(ownerDocument, "touchmove", nearestEmptyInsertDetectEvent);
      if (options.supportPointer) {
        on(ownerDocument, "pointerup", _this._onDrop);
        !this.nativeDraggable && on(ownerDocument, "pointercancel", _this._onDrop);
      } else {
        on(ownerDocument, "mouseup", _this._onDrop);
        on(ownerDocument, "touchend", _this._onDrop);
        on(ownerDocument, "touchcancel", _this._onDrop);
      }
      if (FireFox && this.nativeDraggable) {
        this.options.touchStartThreshold = 4;
        dragEl.draggable = true;
      }
      pluginEvent2("delayStart", this, {
        evt
      });
      if (options.delay && (!options.delayOnTouchOnly || touch) && (!this.nativeDraggable || !(Edge || IE11OrLess))) {
        if (Sortable.eventCanceled) {
          this._onDrop();
          return;
        }
        if (options.supportPointer) {
          on(ownerDocument, "pointerup", _this._disableDelayedDrag);
          on(ownerDocument, "pointercancel", _this._disableDelayedDrag);
        } else {
          on(ownerDocument, "mouseup", _this._disableDelayedDrag);
          on(ownerDocument, "touchend", _this._disableDelayedDrag);
          on(ownerDocument, "touchcancel", _this._disableDelayedDrag);
        }
        on(ownerDocument, "mousemove", _this._delayedDragTouchMoveHandler);
        on(ownerDocument, "touchmove", _this._delayedDragTouchMoveHandler);
        options.supportPointer && on(ownerDocument, "pointermove", _this._delayedDragTouchMoveHandler);
        _this._dragStartTimer = setTimeout(dragStartFn, options.delay);
      } else {
        dragStartFn();
      }
    }
  },
  _delayedDragTouchMoveHandler: function _delayedDragTouchMoveHandler(e) {
    var touch = e.touches ? e.touches[0] : e;
    if (Math.max(Math.abs(touch.clientX - this._lastX), Math.abs(touch.clientY - this._lastY)) >= Math.floor(this.options.touchStartThreshold / (this.nativeDraggable && window.devicePixelRatio || 1))) {
      this._disableDelayedDrag();
    }
  },
  _disableDelayedDrag: function _disableDelayedDrag() {
    dragEl && _disableDraggable(dragEl);
    clearTimeout(this._dragStartTimer);
    this._disableDelayedDragEvents();
  },
  _disableDelayedDragEvents: function _disableDelayedDragEvents() {
    var ownerDocument = this.el.ownerDocument;
    off(ownerDocument, "mouseup", this._disableDelayedDrag);
    off(ownerDocument, "touchend", this._disableDelayedDrag);
    off(ownerDocument, "touchcancel", this._disableDelayedDrag);
    off(ownerDocument, "pointerup", this._disableDelayedDrag);
    off(ownerDocument, "pointercancel", this._disableDelayedDrag);
    off(ownerDocument, "mousemove", this._delayedDragTouchMoveHandler);
    off(ownerDocument, "touchmove", this._delayedDragTouchMoveHandler);
    off(ownerDocument, "pointermove", this._delayedDragTouchMoveHandler);
  },
  _triggerDragStart: function _triggerDragStart(evt, touch) {
    touch = touch || evt.pointerType == "touch" && evt;
    if (!this.nativeDraggable || touch) {
      if (this.options.supportPointer) {
        on(document, "pointermove", this._onTouchMove);
      } else if (touch) {
        on(document, "touchmove", this._onTouchMove);
      } else {
        on(document, "mousemove", this._onTouchMove);
      }
    } else {
      on(dragEl, "dragend", this);
      on(rootEl, "dragstart", this._onDragStart);
    }
    try {
      if (document.selection) {
        _nextTick(function() {
          document.selection.empty();
        });
      } else {
        window.getSelection().removeAllRanges();
      }
    } catch (err) {
    }
  },
  _dragStarted: function _dragStarted(fallback, evt) {
    awaitingDragStarted = false;
    if (rootEl && dragEl) {
      pluginEvent2("dragStarted", this, {
        evt
      });
      if (this.nativeDraggable) {
        on(document, "dragover", _checkOutsideTargetEl);
      }
      var options = this.options;
      !fallback && toggleClass(dragEl, options.dragClass, false);
      toggleClass(dragEl, options.ghostClass, true);
      Sortable.active = this;
      fallback && this._appendGhost();
      _dispatchEvent({
        sortable: this,
        name: "start",
        originalEvent: evt
      });
    } else {
      this._nulling();
    }
  },
  _emulateDragOver: function _emulateDragOver() {
    if (touchEvt) {
      this._lastX = touchEvt.clientX;
      this._lastY = touchEvt.clientY;
      _hideGhostForTarget();
      var target = document.elementFromPoint(touchEvt.clientX, touchEvt.clientY);
      var parent = target;
      while (target && target.shadowRoot) {
        target = target.shadowRoot.elementFromPoint(touchEvt.clientX, touchEvt.clientY);
        if (target === parent) break;
        parent = target;
      }
      dragEl.parentNode[expando]._isOutsideThisEl(target);
      if (parent) {
        do {
          if (parent[expando]) {
            var inserted = void 0;
            inserted = parent[expando]._onDragOver({
              clientX: touchEvt.clientX,
              clientY: touchEvt.clientY,
              target,
              rootEl: parent
            });
            if (inserted && !this.options.dragoverBubble) {
              break;
            }
          }
          target = parent;
        } while (parent = getParentOrHost(parent));
      }
      _unhideGhostForTarget();
    }
  },
  _onTouchMove: function _onTouchMove(evt) {
    if (tapEvt) {
      var options = this.options, fallbackTolerance = options.fallbackTolerance, fallbackOffset = options.fallbackOffset, touch = evt.touches ? evt.touches[0] : evt, ghostMatrix = ghostEl && matrix(ghostEl, true), scaleX = ghostEl && ghostMatrix && ghostMatrix.a, scaleY = ghostEl && ghostMatrix && ghostMatrix.d, relativeScrollOffset = PositionGhostAbsolutely && ghostRelativeParent && getRelativeScrollOffset(ghostRelativeParent), dx = (touch.clientX - tapEvt.clientX + fallbackOffset.x) / (scaleX || 1) + (relativeScrollOffset ? relativeScrollOffset[0] - ghostRelativeParentInitialScroll[0] : 0) / (scaleX || 1), dy = (touch.clientY - tapEvt.clientY + fallbackOffset.y) / (scaleY || 1) + (relativeScrollOffset ? relativeScrollOffset[1] - ghostRelativeParentInitialScroll[1] : 0) / (scaleY || 1);
      if (!Sortable.active && !awaitingDragStarted) {
        if (fallbackTolerance && Math.max(Math.abs(touch.clientX - this._lastX), Math.abs(touch.clientY - this._lastY)) < fallbackTolerance) {
          return;
        }
        this._onDragStart(evt, true);
      }
      if (ghostEl) {
        if (ghostMatrix) {
          ghostMatrix.e += dx - (lastDx || 0);
          ghostMatrix.f += dy - (lastDy || 0);
        } else {
          ghostMatrix = {
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: dx,
            f: dy
          };
        }
        var cssMatrix = "matrix(".concat(ghostMatrix.a, ",").concat(ghostMatrix.b, ",").concat(ghostMatrix.c, ",").concat(ghostMatrix.d, ",").concat(ghostMatrix.e, ",").concat(ghostMatrix.f, ")");
        css(ghostEl, "webkitTransform", cssMatrix);
        css(ghostEl, "mozTransform", cssMatrix);
        css(ghostEl, "msTransform", cssMatrix);
        css(ghostEl, "transform", cssMatrix);
        lastDx = dx;
        lastDy = dy;
        touchEvt = touch;
      }
      evt.cancelable && evt.preventDefault();
    }
  },
  _appendGhost: function _appendGhost() {
    if (!ghostEl) {
      var container = this.options.fallbackOnBody ? document.body : rootEl, rect = getRect(dragEl, true, PositionGhostAbsolutely, true, container), options = this.options;
      if (PositionGhostAbsolutely) {
        ghostRelativeParent = container;
        while (css(ghostRelativeParent, "position") === "static" && css(ghostRelativeParent, "transform") === "none" && ghostRelativeParent !== document) {
          ghostRelativeParent = ghostRelativeParent.parentNode;
        }
        if (ghostRelativeParent !== document.body && ghostRelativeParent !== document.documentElement) {
          if (ghostRelativeParent === document) ghostRelativeParent = getWindowScrollingElement();
          rect.top += ghostRelativeParent.scrollTop;
          rect.left += ghostRelativeParent.scrollLeft;
        } else {
          ghostRelativeParent = getWindowScrollingElement();
        }
        ghostRelativeParentInitialScroll = getRelativeScrollOffset(ghostRelativeParent);
      }
      ghostEl = dragEl.cloneNode(true);
      toggleClass(ghostEl, options.ghostClass, false);
      toggleClass(ghostEl, options.fallbackClass, true);
      toggleClass(ghostEl, options.dragClass, true);
      css(ghostEl, "transition", "");
      css(ghostEl, "transform", "");
      css(ghostEl, "box-sizing", "border-box");
      css(ghostEl, "margin", 0);
      css(ghostEl, "top", rect.top);
      css(ghostEl, "left", rect.left);
      css(ghostEl, "width", rect.width);
      css(ghostEl, "height", rect.height);
      css(ghostEl, "opacity", "0.8");
      css(ghostEl, "position", PositionGhostAbsolutely ? "absolute" : "fixed");
      css(ghostEl, "zIndex", "100000");
      css(ghostEl, "pointerEvents", "none");
      Sortable.ghost = ghostEl;
      container.appendChild(ghostEl);
      css(ghostEl, "transform-origin", tapDistanceLeft / parseInt(ghostEl.style.width) * 100 + "% " + tapDistanceTop / parseInt(ghostEl.style.height) * 100 + "%");
    }
  },
  _onDragStart: function _onDragStart(evt, fallback) {
    var _this = this;
    var dataTransfer = evt.dataTransfer;
    var options = _this.options;
    pluginEvent2("dragStart", this, {
      evt
    });
    if (Sortable.eventCanceled) {
      this._onDrop();
      return;
    }
    pluginEvent2("setupClone", this);
    if (!Sortable.eventCanceled) {
      cloneEl = clone(dragEl);
      cloneEl.removeAttribute("id");
      cloneEl.draggable = false;
      cloneEl.style["will-change"] = "";
      this._hideClone();
      toggleClass(cloneEl, this.options.chosenClass, false);
      Sortable.clone = cloneEl;
    }
    _this.cloneId = _nextTick(function() {
      pluginEvent2("clone", _this);
      if (Sortable.eventCanceled) return;
      if (!_this.options.removeCloneOnHide) {
        rootEl.insertBefore(cloneEl, dragEl);
      }
      _this._hideClone();
      _dispatchEvent({
        sortable: _this,
        name: "clone"
      });
    });
    !fallback && toggleClass(dragEl, options.dragClass, true);
    if (fallback) {
      ignoreNextClick = true;
      _this._loopId = setInterval(_this._emulateDragOver, 50);
    } else {
      off(document, "mouseup", _this._onDrop);
      off(document, "touchend", _this._onDrop);
      off(document, "touchcancel", _this._onDrop);
      if (dataTransfer) {
        dataTransfer.effectAllowed = "move";
        options.setData && options.setData.call(_this, dataTransfer, dragEl);
      }
      on(document, "drop", _this);
      css(dragEl, "transform", "translateZ(0)");
    }
    awaitingDragStarted = true;
    _this._dragStartId = _nextTick(_this._dragStarted.bind(_this, fallback, evt));
    on(document, "selectstart", _this);
    moved = true;
    window.getSelection().removeAllRanges();
    if (Safari) {
      css(document.body, "user-select", "none");
    }
  },
  // Returns true - if no further action is needed (either inserted or another condition)
  _onDragOver: function _onDragOver(evt) {
    var el = this.el, target = evt.target, dragRect, targetRect, revert, options = this.options, group = options.group, activeSortable = Sortable.active, isOwner = activeGroup === group, canSort = options.sort, fromSortable = putSortable || activeSortable, vertical, _this = this, completedFired = false;
    if (_silent) return;
    function dragOverEvent(name, extra) {
      pluginEvent2(name, _this, _objectSpread2({
        evt,
        isOwner,
        axis: vertical ? "vertical" : "horizontal",
        revert,
        dragRect,
        targetRect,
        canSort,
        fromSortable,
        target,
        completed,
        onMove: function onMove(target2, after2) {
          return _onMove(rootEl, el, dragEl, dragRect, target2, getRect(target2), evt, after2);
        },
        changed
      }, extra));
    }
    function capture() {
      dragOverEvent("dragOverAnimationCapture");
      _this.captureAnimationState();
      if (_this !== fromSortable) {
        fromSortable.captureAnimationState();
      }
    }
    function completed(insertion) {
      dragOverEvent("dragOverCompleted", {
        insertion
      });
      if (insertion) {
        if (isOwner) {
          activeSortable._hideClone();
        } else {
          activeSortable._showClone(_this);
        }
        if (_this !== fromSortable) {
          toggleClass(dragEl, putSortable ? putSortable.options.ghostClass : activeSortable.options.ghostClass, false);
          toggleClass(dragEl, options.ghostClass, true);
        }
        if (putSortable !== _this && _this !== Sortable.active) {
          putSortable = _this;
        } else if (_this === Sortable.active && putSortable) {
          putSortable = null;
        }
        if (fromSortable === _this) {
          _this._ignoreWhileAnimating = target;
        }
        _this.animateAll(function() {
          dragOverEvent("dragOverAnimationComplete");
          _this._ignoreWhileAnimating = null;
        });
        if (_this !== fromSortable) {
          fromSortable.animateAll();
          fromSortable._ignoreWhileAnimating = null;
        }
      }
      if (target === dragEl && !dragEl.animated || target === el && !target.animated) {
        lastTarget = null;
      }
      if (!options.dragoverBubble && !evt.rootEl && target !== document) {
        dragEl.parentNode[expando]._isOutsideThisEl(evt.target);
        !insertion && nearestEmptyInsertDetectEvent(evt);
      }
      !options.dragoverBubble && evt.stopPropagation && evt.stopPropagation();
      return completedFired = true;
    }
    function changed() {
      newIndex = index(dragEl);
      newDraggableIndex = index(dragEl, options.draggable);
      _dispatchEvent({
        sortable: _this,
        name: "change",
        toEl: el,
        newIndex,
        newDraggableIndex,
        originalEvent: evt
      });
    }
    if (evt.preventDefault !== void 0) {
      evt.cancelable && evt.preventDefault();
    }
    target = closest(target, options.draggable, el, true);
    dragOverEvent("dragOver");
    if (Sortable.eventCanceled) return completedFired;
    if (dragEl.contains(evt.target) || target.animated && target.animatingX && target.animatingY || _this._ignoreWhileAnimating === target) {
      return completed(false);
    }
    ignoreNextClick = false;
    if (activeSortable && !options.disabled && (isOwner ? canSort || (revert = parentEl !== rootEl) : putSortable === this || (this.lastPutMode = activeGroup.checkPull(this, activeSortable, dragEl, evt)) && group.checkPut(this, activeSortable, dragEl, evt))) {
      vertical = this._getDirection(evt, target) === "vertical";
      dragRect = getRect(dragEl);
      dragOverEvent("dragOverValid");
      if (Sortable.eventCanceled) return completedFired;
      if (revert) {
        parentEl = rootEl;
        capture();
        this._hideClone();
        dragOverEvent("revert");
        if (!Sortable.eventCanceled) {
          if (nextEl) {
            rootEl.insertBefore(dragEl, nextEl);
          } else {
            rootEl.appendChild(dragEl);
          }
        }
        return completed(true);
      }
      var elLastChild = lastChild(el, options.draggable);
      if (!elLastChild || _ghostIsLast(evt, vertical, this) && !elLastChild.animated) {
        if (elLastChild === dragEl) {
          return completed(false);
        }
        if (elLastChild && el === evt.target) {
          target = elLastChild;
        }
        if (target) {
          targetRect = getRect(target);
        }
        if (_onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt, !!target) !== false) {
          capture();
          if (elLastChild && elLastChild.nextSibling) {
            el.insertBefore(dragEl, elLastChild.nextSibling);
          } else {
            el.appendChild(dragEl);
          }
          parentEl = el;
          changed();
          return completed(true);
        }
      } else if (elLastChild && _ghostIsFirst(evt, vertical, this)) {
        var firstChild = getChild(el, 0, options, true);
        if (firstChild === dragEl) {
          return completed(false);
        }
        target = firstChild;
        targetRect = getRect(target);
        if (_onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt, false) !== false) {
          capture();
          el.insertBefore(dragEl, firstChild);
          parentEl = el;
          changed();
          return completed(true);
        }
      } else if (target.parentNode === el) {
        targetRect = getRect(target);
        var direction = 0, targetBeforeFirstSwap, differentLevel = dragEl.parentNode !== el, differentRowCol = !_dragElInRowColumn(dragEl.animated && dragEl.toRect || dragRect, target.animated && target.toRect || targetRect, vertical), side1 = vertical ? "top" : "left", scrolledPastTop = isScrolledPast(target, "top", "top") || isScrolledPast(dragEl, "top", "top"), scrollBefore = scrolledPastTop ? scrolledPastTop.scrollTop : void 0;
        if (lastTarget !== target) {
          targetBeforeFirstSwap = targetRect[side1];
          pastFirstInvertThresh = false;
          isCircumstantialInvert = !differentRowCol && options.invertSwap || differentLevel;
        }
        direction = _getSwapDirection(evt, target, targetRect, vertical, differentRowCol ? 1 : options.swapThreshold, options.invertedSwapThreshold == null ? options.swapThreshold : options.invertedSwapThreshold, isCircumstantialInvert, lastTarget === target);
        var sibling;
        if (direction !== 0) {
          var dragIndex = index(dragEl);
          do {
            dragIndex -= direction;
            sibling = parentEl.children[dragIndex];
          } while (sibling && (css(sibling, "display") === "none" || sibling === ghostEl));
        }
        if (direction === 0 || sibling === target) {
          return completed(false);
        }
        lastTarget = target;
        lastDirection = direction;
        var nextSibling = target.nextElementSibling, after = false;
        after = direction === 1;
        var moveVector = _onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt, after);
        if (moveVector !== false) {
          if (moveVector === 1 || moveVector === -1) {
            after = moveVector === 1;
          }
          _silent = true;
          setTimeout(_unsilent, 30);
          capture();
          if (after && !nextSibling) {
            el.appendChild(dragEl);
          } else {
            target.parentNode.insertBefore(dragEl, after ? nextSibling : target);
          }
          if (scrolledPastTop) {
            scrollBy(scrolledPastTop, 0, scrollBefore - scrolledPastTop.scrollTop);
          }
          parentEl = dragEl.parentNode;
          if (targetBeforeFirstSwap !== void 0 && !isCircumstantialInvert) {
            targetMoveDistance = Math.abs(targetBeforeFirstSwap - getRect(target)[side1]);
          }
          changed();
          return completed(true);
        }
      }
      if (el.contains(dragEl)) {
        return completed(false);
      }
    }
    return false;
  },
  _ignoreWhileAnimating: null,
  _offMoveEvents: function _offMoveEvents() {
    off(document, "mousemove", this._onTouchMove);
    off(document, "touchmove", this._onTouchMove);
    off(document, "pointermove", this._onTouchMove);
    off(document, "dragover", nearestEmptyInsertDetectEvent);
    off(document, "mousemove", nearestEmptyInsertDetectEvent);
    off(document, "touchmove", nearestEmptyInsertDetectEvent);
  },
  _offUpEvents: function _offUpEvents() {
    var ownerDocument = this.el.ownerDocument;
    off(ownerDocument, "mouseup", this._onDrop);
    off(ownerDocument, "touchend", this._onDrop);
    off(ownerDocument, "pointerup", this._onDrop);
    off(ownerDocument, "pointercancel", this._onDrop);
    off(ownerDocument, "touchcancel", this._onDrop);
    off(document, "selectstart", this);
  },
  _onDrop: function _onDrop(evt) {
    var el = this.el, options = this.options;
    newIndex = index(dragEl);
    newDraggableIndex = index(dragEl, options.draggable);
    pluginEvent2("drop", this, {
      evt
    });
    parentEl = dragEl && dragEl.parentNode;
    newIndex = index(dragEl);
    newDraggableIndex = index(dragEl, options.draggable);
    if (Sortable.eventCanceled) {
      this._nulling();
      return;
    }
    awaitingDragStarted = false;
    isCircumstantialInvert = false;
    pastFirstInvertThresh = false;
    clearInterval(this._loopId);
    clearTimeout(this._dragStartTimer);
    _cancelNextTick(this.cloneId);
    _cancelNextTick(this._dragStartId);
    if (this.nativeDraggable) {
      off(document, "drop", this);
      off(el, "dragstart", this._onDragStart);
    }
    this._offMoveEvents();
    this._offUpEvents();
    if (Safari) {
      css(document.body, "user-select", "");
    }
    css(dragEl, "transform", "");
    if (evt) {
      if (moved) {
        evt.cancelable && evt.preventDefault();
        !options.dropBubble && evt.stopPropagation();
      }
      ghostEl && ghostEl.parentNode && ghostEl.parentNode.removeChild(ghostEl);
      if (rootEl === parentEl || putSortable && putSortable.lastPutMode !== "clone") {
        cloneEl && cloneEl.parentNode && cloneEl.parentNode.removeChild(cloneEl);
      }
      if (dragEl) {
        if (this.nativeDraggable) {
          off(dragEl, "dragend", this);
        }
        _disableDraggable(dragEl);
        dragEl.style["will-change"] = "";
        if (moved && !awaitingDragStarted) {
          toggleClass(dragEl, putSortable ? putSortable.options.ghostClass : this.options.ghostClass, false);
        }
        toggleClass(dragEl, this.options.chosenClass, false);
        _dispatchEvent({
          sortable: this,
          name: "unchoose",
          toEl: parentEl,
          newIndex: null,
          newDraggableIndex: null,
          originalEvent: evt
        });
        if (rootEl !== parentEl) {
          if (newIndex >= 0) {
            _dispatchEvent({
              rootEl: parentEl,
              name: "add",
              toEl: parentEl,
              fromEl: rootEl,
              originalEvent: evt
            });
            _dispatchEvent({
              sortable: this,
              name: "remove",
              toEl: parentEl,
              originalEvent: evt
            });
            _dispatchEvent({
              rootEl: parentEl,
              name: "sort",
              toEl: parentEl,
              fromEl: rootEl,
              originalEvent: evt
            });
            _dispatchEvent({
              sortable: this,
              name: "sort",
              toEl: parentEl,
              originalEvent: evt
            });
          }
          putSortable && putSortable.save();
        } else {
          if (newIndex !== oldIndex) {
            if (newIndex >= 0) {
              _dispatchEvent({
                sortable: this,
                name: "update",
                toEl: parentEl,
                originalEvent: evt
              });
              _dispatchEvent({
                sortable: this,
                name: "sort",
                toEl: parentEl,
                originalEvent: evt
              });
            }
          }
        }
        if (Sortable.active) {
          if (newIndex == null || newIndex === -1) {
            newIndex = oldIndex;
            newDraggableIndex = oldDraggableIndex;
          }
          _dispatchEvent({
            sortable: this,
            name: "end",
            toEl: parentEl,
            originalEvent: evt
          });
          this.save();
        }
      }
    }
    this._nulling();
  },
  _nulling: function _nulling() {
    pluginEvent2("nulling", this);
    rootEl = dragEl = parentEl = ghostEl = nextEl = cloneEl = lastDownEl = cloneHidden = tapEvt = touchEvt = moved = newIndex = newDraggableIndex = oldIndex = oldDraggableIndex = lastTarget = lastDirection = putSortable = activeGroup = Sortable.dragged = Sortable.ghost = Sortable.clone = Sortable.active = null;
    savedInputChecked.forEach(function(el) {
      el.checked = true;
    });
    savedInputChecked.length = lastDx = lastDy = 0;
  },
  handleEvent: function handleEvent(evt) {
    switch (evt.type) {
      case "drop":
      case "dragend":
        this._onDrop(evt);
        break;
      case "dragenter":
      case "dragover":
        if (dragEl) {
          this._onDragOver(evt);
          _globalDragOver(evt);
        }
        break;
      case "selectstart":
        evt.preventDefault();
        break;
    }
  },
  /**
   * Serializes the item into an array of string.
   * @returns {String[]}
   */
  toArray: function toArray() {
    var order = [], el, children = this.el.children, i = 0, n = children.length, options = this.options;
    for (; i < n; i++) {
      el = children[i];
      if (closest(el, options.draggable, this.el, false)) {
        order.push(el.getAttribute(options.dataIdAttr) || _generateId(el));
      }
    }
    return order;
  },
  /**
   * Sorts the elements according to the array.
   * @param  {String[]}  order  order of the items
   */
  sort: function sort(order, useAnimation) {
    var items = {}, rootEl2 = this.el;
    this.toArray().forEach(function(id, i) {
      var el = rootEl2.children[i];
      if (closest(el, this.options.draggable, rootEl2, false)) {
        items[id] = el;
      }
    }, this);
    useAnimation && this.captureAnimationState();
    order.forEach(function(id) {
      if (items[id]) {
        rootEl2.removeChild(items[id]);
        rootEl2.appendChild(items[id]);
      }
    });
    useAnimation && this.animateAll();
  },
  /**
   * Save the current sorting
   */
  save: function save() {
    var store = this.options.store;
    store && store.set && store.set(this);
  },
  /**
   * For each element in the set, get the first element that matches the selector by testing the element itself and traversing up through its ancestors in the DOM tree.
   * @param   {HTMLElement}  el
   * @param   {String}       [selector]  default: `options.draggable`
   * @returns {HTMLElement|null}
   */
  closest: function closest$1(el, selector) {
    return closest(el, selector || this.options.draggable, this.el, false);
  },
  /**
   * Set/get option
   * @param   {string} name
   * @param   {*}      [value]
   * @returns {*}
   */
  option: function option(name, value) {
    var options = this.options;
    if (value === void 0) {
      return options[name];
    } else {
      var modifiedValue = PluginManager.modifyOption(this, name, value);
      if (typeof modifiedValue !== "undefined") {
        options[name] = modifiedValue;
      } else {
        options[name] = value;
      }
      if (name === "group") {
        _prepareGroup(options);
      }
    }
  },
  /**
   * Destroy
   */
  destroy: function destroy() {
    pluginEvent2("destroy", this);
    var el = this.el;
    el[expando] = null;
    off(el, "mousedown", this._onTapStart);
    off(el, "touchstart", this._onTapStart);
    off(el, "pointerdown", this._onTapStart);
    if (this.nativeDraggable) {
      off(el, "dragover", this);
      off(el, "dragenter", this);
    }
    Array.prototype.forEach.call(el.querySelectorAll("[draggable]"), function(el2) {
      el2.removeAttribute("draggable");
    });
    this._onDrop();
    this._disableDelayedDragEvents();
    sortables.splice(sortables.indexOf(this.el), 1);
    this.el = el = null;
  },
  _hideClone: function _hideClone() {
    if (!cloneHidden) {
      pluginEvent2("hideClone", this);
      if (Sortable.eventCanceled) return;
      css(cloneEl, "display", "none");
      if (this.options.removeCloneOnHide && cloneEl.parentNode) {
        cloneEl.parentNode.removeChild(cloneEl);
      }
      cloneHidden = true;
    }
  },
  _showClone: function _showClone(putSortable2) {
    if (putSortable2.lastPutMode !== "clone") {
      this._hideClone();
      return;
    }
    if (cloneHidden) {
      pluginEvent2("showClone", this);
      if (Sortable.eventCanceled) return;
      if (dragEl.parentNode == rootEl && !this.options.group.revertClone) {
        rootEl.insertBefore(cloneEl, dragEl);
      } else if (nextEl) {
        rootEl.insertBefore(cloneEl, nextEl);
      } else {
        rootEl.appendChild(cloneEl);
      }
      if (this.options.group.revertClone) {
        this.animate(dragEl, cloneEl);
      }
      css(cloneEl, "display", "");
      cloneHidden = false;
    }
  }
};
function _globalDragOver(evt) {
  if (evt.dataTransfer) {
    evt.dataTransfer.dropEffect = "move";
  }
  evt.cancelable && evt.preventDefault();
}
function _onMove(fromEl, toEl, dragEl2, dragRect, targetEl, targetRect, originalEvent, willInsertAfter) {
  var evt, sortable = fromEl[expando], onMoveFn = sortable.options.onMove, retVal;
  if (window.CustomEvent && !IE11OrLess && !Edge) {
    evt = new CustomEvent("move", {
      bubbles: true,
      cancelable: true
    });
  } else {
    evt = document.createEvent("Event");
    evt.initEvent("move", true, true);
  }
  evt.to = toEl;
  evt.from = fromEl;
  evt.dragged = dragEl2;
  evt.draggedRect = dragRect;
  evt.related = targetEl || toEl;
  evt.relatedRect = targetRect || getRect(toEl);
  evt.willInsertAfter = willInsertAfter;
  evt.originalEvent = originalEvent;
  fromEl.dispatchEvent(evt);
  if (onMoveFn) {
    retVal = onMoveFn.call(sortable, evt, originalEvent);
  }
  return retVal;
}
function _disableDraggable(el) {
  el.draggable = false;
}
function _unsilent() {
  _silent = false;
}
function _ghostIsFirst(evt, vertical, sortable) {
  var firstElRect = getRect(getChild(sortable.el, 0, sortable.options, true));
  var childContainingRect = getChildContainingRectFromElement(sortable.el, sortable.options, ghostEl);
  var spacer = 10;
  return vertical ? evt.clientX < childContainingRect.left - spacer || evt.clientY < firstElRect.top && evt.clientX < firstElRect.right : evt.clientY < childContainingRect.top - spacer || evt.clientY < firstElRect.bottom && evt.clientX < firstElRect.left;
}
function _ghostIsLast(evt, vertical, sortable) {
  var lastElRect = getRect(lastChild(sortable.el, sortable.options.draggable));
  var childContainingRect = getChildContainingRectFromElement(sortable.el, sortable.options, ghostEl);
  var spacer = 10;
  return vertical ? evt.clientX > childContainingRect.right + spacer || evt.clientY > lastElRect.bottom && evt.clientX > lastElRect.left : evt.clientY > childContainingRect.bottom + spacer || evt.clientX > lastElRect.right && evt.clientY > lastElRect.top;
}
function _getSwapDirection(evt, target, targetRect, vertical, swapThreshold, invertedSwapThreshold, invertSwap, isLastTarget) {
  var mouseOnAxis = vertical ? evt.clientY : evt.clientX, targetLength = vertical ? targetRect.height : targetRect.width, targetS1 = vertical ? targetRect.top : targetRect.left, targetS2 = vertical ? targetRect.bottom : targetRect.right, invert = false;
  if (!invertSwap) {
    if (isLastTarget && targetMoveDistance < targetLength * swapThreshold) {
      if (!pastFirstInvertThresh && (lastDirection === 1 ? mouseOnAxis > targetS1 + targetLength * invertedSwapThreshold / 2 : mouseOnAxis < targetS2 - targetLength * invertedSwapThreshold / 2)) {
        pastFirstInvertThresh = true;
      }
      if (!pastFirstInvertThresh) {
        if (lastDirection === 1 ? mouseOnAxis < targetS1 + targetMoveDistance : mouseOnAxis > targetS2 - targetMoveDistance) {
          return -lastDirection;
        }
      } else {
        invert = true;
      }
    } else {
      if (mouseOnAxis > targetS1 + targetLength * (1 - swapThreshold) / 2 && mouseOnAxis < targetS2 - targetLength * (1 - swapThreshold) / 2) {
        return _getInsertDirection(target);
      }
    }
  }
  invert = invert || invertSwap;
  if (invert) {
    if (mouseOnAxis < targetS1 + targetLength * invertedSwapThreshold / 2 || mouseOnAxis > targetS2 - targetLength * invertedSwapThreshold / 2) {
      return mouseOnAxis > targetS1 + targetLength / 2 ? 1 : -1;
    }
  }
  return 0;
}
function _getInsertDirection(target) {
  if (index(dragEl) < index(target)) {
    return 1;
  } else {
    return -1;
  }
}
function _generateId(el) {
  var str = el.tagName + el.className + el.src + el.href + el.textContent, i = str.length, sum = 0;
  while (i--) {
    sum += str.charCodeAt(i);
  }
  return sum.toString(36);
}
function _saveInputCheckedState(root) {
  savedInputChecked.length = 0;
  var inputs = root.getElementsByTagName("input");
  var idx = inputs.length;
  while (idx--) {
    var el = inputs[idx];
    el.checked && savedInputChecked.push(el);
  }
}
function _nextTick(fn) {
  return setTimeout(fn, 0);
}
function _cancelNextTick(id) {
  return clearTimeout(id);
}
if (documentExists) {
  on(document, "touchmove", function(evt) {
    if ((Sortable.active || awaitingDragStarted) && evt.cancelable) {
      evt.preventDefault();
    }
  });
}
Sortable.utils = {
  on,
  off,
  css,
  find,
  is: function is(el, selector) {
    return !!closest(el, selector, el, false);
  },
  extend,
  throttle,
  closest,
  toggleClass,
  clone,
  index,
  nextTick: _nextTick,
  cancelNextTick: _cancelNextTick,
  detectDirection: _detectDirection,
  getChild,
  expando
};
Sortable.get = function(element) {
  return element[expando];
};
Sortable.mount = function() {
  for (var _len = arguments.length, plugins2 = new Array(_len), _key = 0; _key < _len; _key++) {
    plugins2[_key] = arguments[_key];
  }
  if (plugins2[0].constructor === Array) plugins2 = plugins2[0];
  plugins2.forEach(function(plugin) {
    if (!plugin.prototype || !plugin.prototype.constructor) {
      throw "Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(plugin));
    }
    if (plugin.utils) Sortable.utils = _objectSpread2(_objectSpread2({}, Sortable.utils), plugin.utils);
    PluginManager.mount(plugin);
  });
};
Sortable.create = function(el, options) {
  return new Sortable(el, options);
};
Sortable.version = version;
var autoScrolls = [], scrollEl, scrollRootEl, scrolling = false, lastAutoScrollX, lastAutoScrollY, touchEvt$1, pointerElemChangedInterval;
function AutoScrollPlugin() {
  function AutoScroll() {
    this.defaults = {
      scroll: true,
      forceAutoScrollFallback: false,
      scrollSensitivity: 30,
      scrollSpeed: 10,
      bubbleScroll: true
    };
    for (var fn in this) {
      if (fn.charAt(0) === "_" && typeof this[fn] === "function") {
        this[fn] = this[fn].bind(this);
      }
    }
  }
  AutoScroll.prototype = {
    dragStarted: function dragStarted(_ref) {
      var originalEvent = _ref.originalEvent;
      if (this.sortable.nativeDraggable) {
        on(document, "dragover", this._handleAutoScroll);
      } else {
        if (this.options.supportPointer) {
          on(document, "pointermove", this._handleFallbackAutoScroll);
        } else if (originalEvent.touches) {
          on(document, "touchmove", this._handleFallbackAutoScroll);
        } else {
          on(document, "mousemove", this._handleFallbackAutoScroll);
        }
      }
    },
    dragOverCompleted: function dragOverCompleted(_ref2) {
      var originalEvent = _ref2.originalEvent;
      if (!this.options.dragOverBubble && !originalEvent.rootEl) {
        this._handleAutoScroll(originalEvent);
      }
    },
    drop: function drop3() {
      if (this.sortable.nativeDraggable) {
        off(document, "dragover", this._handleAutoScroll);
      } else {
        off(document, "pointermove", this._handleFallbackAutoScroll);
        off(document, "touchmove", this._handleFallbackAutoScroll);
        off(document, "mousemove", this._handleFallbackAutoScroll);
      }
      clearPointerElemChangedInterval();
      clearAutoScrolls();
      cancelThrottle();
    },
    nulling: function nulling() {
      touchEvt$1 = scrollRootEl = scrollEl = scrolling = pointerElemChangedInterval = lastAutoScrollX = lastAutoScrollY = null;
      autoScrolls.length = 0;
    },
    _handleFallbackAutoScroll: function _handleFallbackAutoScroll(evt) {
      this._handleAutoScroll(evt, true);
    },
    _handleAutoScroll: function _handleAutoScroll(evt, fallback) {
      var _this = this;
      var x = (evt.touches ? evt.touches[0] : evt).clientX, y = (evt.touches ? evt.touches[0] : evt).clientY, elem = document.elementFromPoint(x, y);
      touchEvt$1 = evt;
      if (fallback || this.options.forceAutoScrollFallback || Edge || IE11OrLess || Safari) {
        autoScroll(evt, this.options, elem, fallback);
        var ogElemScroller = getParentAutoScrollElement(elem, true);
        if (scrolling && (!pointerElemChangedInterval || x !== lastAutoScrollX || y !== lastAutoScrollY)) {
          pointerElemChangedInterval && clearPointerElemChangedInterval();
          pointerElemChangedInterval = setInterval(function() {
            var newElem = getParentAutoScrollElement(document.elementFromPoint(x, y), true);
            if (newElem !== ogElemScroller) {
              ogElemScroller = newElem;
              clearAutoScrolls();
            }
            autoScroll(evt, _this.options, newElem, fallback);
          }, 10);
          lastAutoScrollX = x;
          lastAutoScrollY = y;
        }
      } else {
        if (!this.options.bubbleScroll || getParentAutoScrollElement(elem, true) === getWindowScrollingElement()) {
          clearAutoScrolls();
          return;
        }
        autoScroll(evt, this.options, getParentAutoScrollElement(elem, false), false);
      }
    }
  };
  return _extends(AutoScroll, {
    pluginName: "scroll",
    initializeByDefault: true
  });
}
function clearAutoScrolls() {
  autoScrolls.forEach(function(autoScroll2) {
    clearInterval(autoScroll2.pid);
  });
  autoScrolls = [];
}
function clearPointerElemChangedInterval() {
  clearInterval(pointerElemChangedInterval);
}
var autoScroll = throttle(function(evt, options, rootEl2, isFallback) {
  if (!options.scroll) return;
  var x = (evt.touches ? evt.touches[0] : evt).clientX, y = (evt.touches ? evt.touches[0] : evt).clientY, sens = options.scrollSensitivity, speed = options.scrollSpeed, winScroller = getWindowScrollingElement();
  var scrollThisInstance = false, scrollCustomFn;
  if (scrollRootEl !== rootEl2) {
    scrollRootEl = rootEl2;
    clearAutoScrolls();
    scrollEl = options.scroll;
    scrollCustomFn = options.scrollFn;
    if (scrollEl === true) {
      scrollEl = getParentAutoScrollElement(rootEl2, true);
    }
  }
  var layersOut = 0;
  var currentParent = scrollEl;
  do {
    var el = currentParent, rect = getRect(el), top = rect.top, bottom = rect.bottom, left = rect.left, right = rect.right, width = rect.width, height = rect.height, canScrollX = void 0, canScrollY = void 0, scrollWidth = el.scrollWidth, scrollHeight = el.scrollHeight, elCSS = css(el), scrollPosX = el.scrollLeft, scrollPosY = el.scrollTop;
    if (el === winScroller) {
      canScrollX = width < scrollWidth && (elCSS.overflowX === "auto" || elCSS.overflowX === "scroll" || elCSS.overflowX === "visible");
      canScrollY = height < scrollHeight && (elCSS.overflowY === "auto" || elCSS.overflowY === "scroll" || elCSS.overflowY === "visible");
    } else {
      canScrollX = width < scrollWidth && (elCSS.overflowX === "auto" || elCSS.overflowX === "scroll");
      canScrollY = height < scrollHeight && (elCSS.overflowY === "auto" || elCSS.overflowY === "scroll");
    }
    var vx = canScrollX && (Math.abs(right - x) <= sens && scrollPosX + width < scrollWidth) - (Math.abs(left - x) <= sens && !!scrollPosX);
    var vy = canScrollY && (Math.abs(bottom - y) <= sens && scrollPosY + height < scrollHeight) - (Math.abs(top - y) <= sens && !!scrollPosY);
    if (!autoScrolls[layersOut]) {
      for (var i = 0; i <= layersOut; i++) {
        if (!autoScrolls[i]) {
          autoScrolls[i] = {};
        }
      }
    }
    if (autoScrolls[layersOut].vx != vx || autoScrolls[layersOut].vy != vy || autoScrolls[layersOut].el !== el) {
      autoScrolls[layersOut].el = el;
      autoScrolls[layersOut].vx = vx;
      autoScrolls[layersOut].vy = vy;
      clearInterval(autoScrolls[layersOut].pid);
      if (vx != 0 || vy != 0) {
        scrollThisInstance = true;
        autoScrolls[layersOut].pid = setInterval((function() {
          if (isFallback && this.layer === 0) {
            Sortable.active._onTouchMove(touchEvt$1);
          }
          var scrollOffsetY = autoScrolls[this.layer].vy ? autoScrolls[this.layer].vy * speed : 0;
          var scrollOffsetX = autoScrolls[this.layer].vx ? autoScrolls[this.layer].vx * speed : 0;
          if (typeof scrollCustomFn === "function") {
            if (scrollCustomFn.call(Sortable.dragged.parentNode[expando], scrollOffsetX, scrollOffsetY, evt, touchEvt$1, autoScrolls[this.layer].el) !== "continue") {
              return;
            }
          }
          scrollBy(autoScrolls[this.layer].el, scrollOffsetX, scrollOffsetY);
        }).bind({
          layer: layersOut
        }), 24);
      }
    }
    layersOut++;
  } while (options.bubbleScroll && currentParent !== winScroller && (currentParent = getParentAutoScrollElement(currentParent, false)));
  scrolling = scrollThisInstance;
}, 30);
var drop = function drop2(_ref) {
  var originalEvent = _ref.originalEvent, putSortable2 = _ref.putSortable, dragEl2 = _ref.dragEl, activeSortable = _ref.activeSortable, dispatchSortableEvent = _ref.dispatchSortableEvent, hideGhostForTarget = _ref.hideGhostForTarget, unhideGhostForTarget = _ref.unhideGhostForTarget;
  if (!originalEvent) return;
  var toSortable = putSortable2 || activeSortable;
  hideGhostForTarget();
  var touch = originalEvent.changedTouches && originalEvent.changedTouches.length ? originalEvent.changedTouches[0] : originalEvent;
  var target = document.elementFromPoint(touch.clientX, touch.clientY);
  unhideGhostForTarget();
  if (toSortable && !toSortable.el.contains(target)) {
    dispatchSortableEvent("spill");
    this.onSpill({
      dragEl: dragEl2,
      putSortable: putSortable2
    });
  }
};
function Revert() {
}
Revert.prototype = {
  startIndex: null,
  dragStart: function dragStart(_ref2) {
    var oldDraggableIndex2 = _ref2.oldDraggableIndex;
    this.startIndex = oldDraggableIndex2;
  },
  onSpill: function onSpill(_ref3) {
    var dragEl2 = _ref3.dragEl, putSortable2 = _ref3.putSortable;
    this.sortable.captureAnimationState();
    if (putSortable2) {
      putSortable2.captureAnimationState();
    }
    var nextSibling = getChild(this.sortable.el, this.startIndex, this.options);
    if (nextSibling) {
      this.sortable.el.insertBefore(dragEl2, nextSibling);
    } else {
      this.sortable.el.appendChild(dragEl2);
    }
    this.sortable.animateAll();
    if (putSortable2) {
      putSortable2.animateAll();
    }
  },
  drop
};
_extends(Revert, {
  pluginName: "revertOnSpill"
});
function Remove() {
}
Remove.prototype = {
  onSpill: function onSpill2(_ref4) {
    var dragEl2 = _ref4.dragEl, putSortable2 = _ref4.putSortable;
    var parentSortable = putSortable2 || this.sortable;
    parentSortable.captureAnimationState();
    dragEl2.parentNode && dragEl2.parentNode.removeChild(dragEl2);
    parentSortable.animateAll();
  },
  drop
};
_extends(Remove, {
  pluginName: "removeOnSpill"
});
Sortable.mount(new AutoScrollPlugin());
Sortable.mount(Remove, Revert);
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
    document.querySelector(".popup-container").classList.add("organize-mode");
    document.getElementById("btn-organize").classList.add("active");
    document.getElementById("organize-banner").classList.remove("hidden");
    this.injectOrganizeControls();
    this.initSortables();
    this.setupKeyboardNav();
    console.log("[OrganizeMode] Entered organize mode");
  }
  /**
   * Exit organize mode
   */
  exit() {
    this.isActive = false;
    document.querySelector(".popup-container").classList.remove("organize-mode");
    document.getElementById("btn-organize").classList.remove("active");
    document.getElementById("organize-banner").classList.add("hidden");
    this.destroySortables();
    this.saveLayout();
    this.showToast("Layout saved");
    console.log("[OrganizeMode] Exited organize mode");
  }
  /**
   * Inject drag handles and visibility toggles into accordion headers
   */
  injectOrganizeControls() {
    const sections = document.querySelectorAll(".accordion-section");
    sections.forEach((section) => {
      const header = section.querySelector(".accordion-header");
      const titleSpan = header.querySelector(".accordion-title");
      const sectionId = section.dataset.section;
      if (header.querySelector(".drag-handle")) {
        return;
      }
      const isVisible = this.popup.settings?.ui_layout?.sectionVisibility?.[sectionId] !== false;
      const dragHandle = document.createElement("span");
      dragHandle.className = "drag-handle";
      dragHandle.innerHTML = "⠿";
      dragHandle.setAttribute("aria-hidden", "true");
      const visibilityToggle = document.createElement("button");
      visibilityToggle.className = "visibility-toggle";
      visibilityToggle.setAttribute("aria-pressed", isVisible ? "true" : "false");
      visibilityToggle.setAttribute("aria-label", isVisible ? "Hide section" : "Show section");
      visibilityToggle.innerHTML = `<span class="visibility-icon">${isVisible ? "👁️" : "👁️‍🗨️"}</span>`;
      visibilityToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleSectionVisibility(sectionId, visibilityToggle);
      });
      const editTitleBtn = document.createElement("button");
      editTitleBtn.className = "edit-title-btn";
      editTitleBtn.setAttribute("aria-label", "Edit section title");
      editTitleBtn.innerHTML = "✏️";
      editTitleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.editSectionTitle(sectionId);
      });
      const titleText = titleSpan.childNodes[1];
      if (titleText && titleText.nodeType === Node.TEXT_NODE) {
        const titleTextSpan = document.createElement("span");
        titleTextSpan.className = "accordion-title-text";
        titleTextSpan.textContent = titleText.textContent.trim();
        titleSpan.replaceChild(titleTextSpan, titleText);
      }
      const moveButtons = document.createElement("div");
      moveButtons.className = "move-buttons";
      moveButtons.innerHTML = `
        <button class="move-btn move-up" aria-label="Move section up" title="Move up">▲</button>
        <button class="move-btn move-down" aria-label="Move section down" title="Move down">▼</button>
      `;
      moveButtons.querySelector(".move-up").addEventListener("click", (e) => {
        e.stopPropagation();
        this.moveSection(section, "up");
      });
      moveButtons.querySelector(".move-down").addEventListener("click", (e) => {
        e.stopPropagation();
        this.moveSection(section, "down");
      });
      header.insertBefore(dragHandle, header.firstChild);
      titleSpan.appendChild(editTitleBtn);
      header.insertBefore(visibilityToggle, header.querySelector(".accordion-icon"));
      header.insertBefore(moveButtons, header.querySelector(".accordion-icon"));
      if (!isVisible) {
        section.classList.add("hidden-by-user");
      }
    });
  }
  /**
   * Initialize SortableJS for sections and features
   */
  initSortables() {
    const main = document.querySelector(".popup-main");
    this.sectionSortable = new Sortable(main, {
      handle: ".drag-handle",
      animation: 200,
      ghostClass: "section-ghost",
      chosenClass: "section-chosen",
      dragClass: "section-dragging",
      filter: ".visibility-toggle, .edit-title-btn, .move-buttons",
      onEnd: () => {
        this.saveLayout();
        this.announceForScreenReader("Section order updated");
      }
    });
    document.querySelectorAll(".accordion-content").forEach((content) => {
      this.injectFeatureControls(content);
      const sortable = new Sortable(content, {
        handle: ".feature-drag-handle",
        animation: 150,
        ghostClass: "feature-ghost",
        chosenClass: "feature-chosen",
        filter: ".feature-visibility-toggle",
        draggable: ".control-section",
        onEnd: () => {
          this.saveLayout();
          this.announceForScreenReader("Feature order updated");
        }
      });
      this.featureSortables.push(sortable);
    });
  }
  /**
   * Inject drag handles into feature control sections
   */
  injectFeatureControls(content) {
    const features = content.querySelectorAll(".control-section");
    features.forEach((feature) => {
      if (feature.querySelector(".feature-drag-handle")) {
        return;
      }
      if (feature.classList.contains("hidden")) {
        return;
      }
      const toggleControl = feature.querySelector(".toggle-control");
      if (!toggleControl) {
        return;
      }
      const label = toggleControl.querySelector(".toggle-label");
      if (!label) {
        return;
      }
      const dragHandle = document.createElement("span");
      dragHandle.className = "feature-drag-handle";
      dragHandle.innerHTML = "⠿";
      dragHandle.setAttribute("aria-hidden", "true");
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
    this.featureSortables.forEach((sortable) => sortable.destroy());
    this.featureSortables = [];
  }
  /**
   * Toggle section visibility
   */
  toggleSectionVisibility(sectionId, toggleBtn) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    const isCurrentlyVisible = toggleBtn.getAttribute("aria-pressed") === "true";
    const newVisibility = !isCurrentlyVisible;
    toggleBtn.setAttribute("aria-pressed", newVisibility ? "true" : "false");
    toggleBtn.setAttribute("aria-label", newVisibility ? "Hide section" : "Show section");
    toggleBtn.querySelector(".visibility-icon").textContent = newVisibility ? "👁️" : "👁️‍🗨️";
    if (newVisibility) {
      section.classList.remove("hidden-by-user");
    } else {
      section.classList.add("hidden-by-user");
    }
    this.saveLayout();
    this.announceForScreenReader(`Section ${newVisibility ? "shown" : "hidden"}`);
  }
  /**
   * Edit section title inline
   */
  editSectionTitle(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    let titleTextSpan = section.querySelector(".accordion-title-text");
    if (!titleTextSpan) {
      const titleSpan = section.querySelector(".accordion-title");
      const iconSpan = titleSpan.querySelector(".accordion-icon-left");
      const fullText = titleSpan.textContent;
      const iconText = iconSpan ? iconSpan.textContent : "";
      const titleText = fullText.replace(iconText, "").trim();
      titleTextSpan = document.createElement("span");
      titleTextSpan.className = "accordion-title-text";
      titleTextSpan.textContent = titleText;
      while (titleSpan.childNodes.length > 1) {
        titleSpan.removeChild(titleSpan.lastChild);
      }
      titleSpan.appendChild(document.createTextNode(" "));
      titleSpan.appendChild(titleTextSpan);
    }
    const currentTitle = titleTextSpan.textContent;
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentTitle;
    input.className = "title-edit-input";
    input.setAttribute("aria-label", "Edit section title");
    titleTextSpan.replaceWith(input);
    input.focus();
    input.select();
    const saveEdit = () => {
      const newTitle = input.value.trim() || currentTitle;
      const newSpan = document.createElement("span");
      newSpan.className = "accordion-title-text";
      newSpan.textContent = newTitle;
      input.replaceWith(newSpan);
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
    input.addEventListener("blur", saveEdit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = currentTitle;
        input.blur();
      }
    });
  }
  /**
   * Move section up or down (keyboard accessibility)
   */
  moveSection(section, direction) {
    const main = document.querySelector(".popup-main");
    const sections = Array.from(main.querySelectorAll(".accordion-section"));
    const currentIndex = sections.indexOf(section);
    if (direction === "up" && currentIndex > 0) {
      main.insertBefore(section, sections[currentIndex - 1]);
    } else if (direction === "down" && currentIndex < sections.length - 1) {
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
    const sections = document.querySelectorAll(".accordion-section");
    sections.forEach((section, index2) => {
      const moveUp = section.querySelector(".move-up");
      const moveDown = section.querySelector(".move-down");
      if (moveUp) {
        moveUp.disabled = index2 === 0;
      }
      if (moveDown) {
        moveDown.disabled = index2 === sections.length - 1;
      }
    });
  }
  /**
   * Setup keyboard navigation for organize mode
   */
  setupKeyboardNav() {
    this.keyHandler = (e) => {
      if (!this.isActive) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.exit();
        return;
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const focused = document.activeElement.closest(".accordion-section");
        if (focused) {
          e.preventDefault();
          this.moveSection(focused, e.key === "ArrowUp" ? "up" : "down");
        }
      }
    };
    document.addEventListener("keydown", this.keyHandler);
  }
  /**
   * Capture current state for potential undo
   */
  captureState() {
    return {
      sectionOrder: this.getSectionOrder(),
      sectionVisibility: { ...this.popup.settings?.ui_layout?.sectionVisibility },
      sectionTitles: { ...this.popup.settings?.ui_layout?.sectionTitles }
    };
  }
  /**
   * Get current section order from DOM
   */
  getSectionOrder() {
    const sections = document.querySelectorAll(".accordion-section");
    return Array.from(sections).map((s) => s.dataset.section);
  }
  /**
   * Get current feature order from DOM
   */
  getFeatureOrder() {
    const featureOrder = {};
    document.querySelectorAll(".accordion-section").forEach((section) => {
      const sectionId = section.dataset.section;
      const content = section.querySelector(".accordion-content");
      if (content) {
        const features = content.querySelectorAll(".control-section[id]");
        featureOrder[sectionId] = Array.from(features).map((f) => {
          return f.id.replace("-section", "");
        });
      }
    });
    return featureOrder;
  }
  /**
   * Save current layout to settings
   */
  async saveLayout() {
    if (!this.popup.settings.ui_layout) {
      this.popup.settings.ui_layout = {};
    }
    this.popup.settings.ui_layout.sectionOrder = this.getSectionOrder();
    if (!this.popup.settings.ui_layout.sectionVisibility) {
      this.popup.settings.ui_layout.sectionVisibility = {};
    }
    document.querySelectorAll(".accordion-section").forEach((section) => {
      const sectionId = section.dataset.section;
      this.popup.settings.ui_layout.sectionVisibility[sectionId] = !section.classList.contains("hidden-by-user");
    });
    this.popup.settings.ui_layout.featureOrder = this.getFeatureOrder();
    await this.popup.saveSettings();
    console.log("[OrganizeMode] Layout saved:", this.popup.settings.ui_layout);
  }
  /**
   * Apply saved layout on popup load
   */
  applyLayout() {
    const layout = this.popup.settings?.ui_layout;
    if (!layout) {
      return;
    }
    const main = document.querySelector(".popup-main");
    if (layout.sectionOrder) {
      layout.sectionOrder.forEach((sectionId) => {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (section) {
          main.appendChild(section);
        }
      });
    }
    if (layout.sectionVisibility) {
      Object.entries(layout.sectionVisibility).forEach(([sectionId, visible]) => {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (section) {
          section.classList.toggle("hidden-by-user", !visible);
        }
      });
    }
    if (layout.sectionTitles) {
      Object.entries(layout.sectionTitles).forEach(([sectionId, title]) => {
        const section = document.querySelector(`[data-section="${sectionId}"]`);
        if (section) {
          const titleSpan = section.querySelector(".accordion-title");
          if (titleSpan) {
            const titleTextSpan = titleSpan.querySelector(".accordion-title-text");
            if (titleTextSpan) {
              titleTextSpan.textContent = title;
            } else {
              const textNode = Array.from(titleSpan.childNodes).find(
                (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
              );
              if (textNode) {
                textNode.textContent = " " + title;
              }
            }
          }
        }
      });
    }
    console.log("[OrganizeMode] Layout applied");
  }
  /**
   * Show toast notification
   */
  showToast(message) {
    const toast = document.createElement("div");
    toast.className = "layout-toast";
    toast.textContent = message;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
  }
  /**
   * Announce message for screen readers
   */
  announceForScreenReader(message) {
    let region = document.querySelector(".sr-live-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "sr-live-region";
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "true");
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
    console.log("[Popup] Initializing...");
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tabs[0];
    await this.loadSettings();
    this.setupEventListeners();
    this.setupAccordions();
    this.updateUI();
    this.loadVoices();
    this.organizeMode.applyLayout();
    this.setupOrganizeModeListeners();
    this.isInitialized = true;
    this.updateStatus("Ready");
    console.log("[Popup] Initialized");
  }
  /**
   * Setup event listeners for organize mode
   */
  setupOrganizeModeListeners() {
    const organizeBtn = document.getElementById("btn-organize");
    if (organizeBtn) {
      organizeBtn.addEventListener("click", () => {
        this.organizeMode.toggle();
      });
    }
    const doneBtn = document.getElementById("btn-organize-done");
    if (doneBtn) {
      doneBtn.addEventListener("click", () => {
        this.organizeMode.exit();
      });
    }
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
    toggleSection("dark-mode-section", "show_dark_mode");
    toggleSection("simplify-section", "show_simplify");
    toggleSection("reading-progress-section", "show_reading_progress");
    toggleSection("pomodoro-section", "show_pomodoro");
    toggleSection("stargardt-section", "show_stargardt");
    toggleSection("reduced-motion-section", "show_reduced_motion");
    toggleSection("media-control-section", "show_media_control");
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
  async resetToDefaults() {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    try {
      const defaults2 = await chrome.runtime.sendMessage({
        type: "RESET_SETTINGS"
      });
      console.log("[Popup] Settings reset to defaults:", defaults2);
      window.location.reload();
    } catch (error) {
      console.error("[Popup] Error resetting settings:", error);
      alert("Failed to reset settings. Please try again.");
    }
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
    this.setupModalTabs(modal);
    this.setupModalActions(modal);
    this.loadModalSettings();
    this.setupProfilesTab(modal);
    this.setupAITab(modal);
  }
  /**
   * Setup the Profiles tab in the advanced settings modal
   * @param {HTMLElement} modal - The modal element
   */
  setupProfilesTab(modal) {
    this.populateModalProfileSelector(modal);
    const profileSelect = modal.querySelector("#modal-profile-select");
    if (profileSelect) {
      profileSelect.addEventListener("change", (e) => {
        this.profiles_loadProfile(e.target.value);
        this.updateProfileDescription(modal, e.target.value);
      });
    }
    const saveBtn = modal.querySelector("#btn-profile-save-modal");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        this.profiles_showSaveModal();
        setTimeout(() => this.populateModalProfileSelector(modal), 500);
      });
    }
    const deleteBtn = modal.querySelector("#btn-profile-delete-modal");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        this.profiles_confirmDelete();
        setTimeout(() => this.populateModalProfileSelector(modal), 500);
      });
    }
    const exportBtn = modal.querySelector("#btn-profile-export-modal");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        this.profiles_export();
      });
    }
    const importBtn = modal.querySelector("#btn-profile-import-modal");
    const importInput = modal.querySelector("#profile-import-input-modal");
    if (importBtn && importInput) {
      importBtn.addEventListener("click", () => {
        importInput.click();
      });
      importInput.addEventListener("change", async (e) => {
        if (e.target.files[0]) {
          await this.profiles_import(e.target.files[0]);
          this.populateModalProfileSelector(modal);
          e.target.value = "";
        }
      });
    }
    const presetItems = modal.querySelectorAll(".preset-item[data-preset]");
    presetItems.forEach((item) => {
      item.addEventListener("click", () => {
        const presetName = item.getAttribute("data-preset");
        if (confirm(`Load the "${presetName}" preset profile?

This will apply all settings from this preset.`)) {
          this.profiles_loadProfile(presetName);
          const profileSelect2 = modal.querySelector("#modal-profile-select");
          if (profileSelect2) {
            profileSelect2.value = presetName;
            this.updateProfileDescription(modal, presetName);
          }
        }
      });
      item.addEventListener("mouseenter", () => {
        item.style.backgroundColor = "#f0f0f0";
      });
      item.addEventListener("mouseleave", () => {
        item.style.backgroundColor = "";
      });
    });
    const currentProfile = this.currentProfileName || "Default";
    this.updateProfileDescription(modal, currentProfile);
  }
  /**
   * Populate the profile selector in the modal
   * @param {HTMLElement} modal - The modal element
   */
  populateModalProfileSelector(modal) {
    const selector = modal.querySelector("#modal-profile-select");
    if (!selector) {
      return;
    }
    chrome.storage.local.get("assist_profiles", (result) => {
      const profiles = result.assist_profiles || this.profiles_createDefaults();
      const currentProfile = this.currentProfileName || "Default";
      selector.innerHTML = "";
      Object.entries(profiles).forEach(([name, profile]) => {
        const option2 = document.createElement("option");
        option2.value = name;
        option2.textContent = profile.displayName || name;
        if (name === currentProfile) {
          option2.selected = true;
        }
        selector.appendChild(option2);
      });
    });
  }
  /**
   * Update the profile description in the modal
   * @param {HTMLElement} modal - The modal element
   * @param {string} profileName - The selected profile name
   */
  updateProfileDescription(modal, profileName) {
    const descriptionEl = modal.querySelector("#profile-description-modal p");
    if (!descriptionEl) {
      return;
    }
    chrome.storage.local.get("assist_profiles", (result) => {
      const profiles = result.assist_profiles || {};
      const profile = profiles[profileName];
      if (profile && profile.description) {
        descriptionEl.textContent = profile.description;
      } else {
        const defaultDescriptions = {
          Default: "Standard settings with all features available.",
          "ADHD Focus": "Optimized for focus and productivity with Pomodoro timer, progress tracking, and simplified interface.",
          "Autism Comfort": "Calm, predictable environment with reduced motion, gentle colors, and consistent behavior.",
          "Dyslexia Support": "Enhanced readability with OpenDyslexic font, increased spacing, and reading progress indicator.",
          "Sensory Sensitive": "Minimal sensory input with no animations, muted colors, and auto-playing media blocked.",
          "Night Study": "Reduced eye strain with dark mode, warm colors, and Pomodoro timer for study sessions.",
          "Anxiety Calm": "Gentle, non-overwhelming interface with calm colors and predictable interactions."
        };
        descriptionEl.textContent = defaultDescriptions[profileName] || "Custom profile with user-defined settings.";
      }
    });
  }
  /**
   * Setup the AI tab in the advanced settings modal
   * @param {HTMLElement} modal - The modal element
   */
  setupAITab(modal) {
    const localRadio = modal.querySelector('[name="ai-mode"][value="local"]');
    const cloudRadio = modal.querySelector('[name="ai-mode"][value="cloud"]');
    modal.querySelector("#cloud-provider-section");
    modal.querySelector("#local-ai-section");
    modal.querySelector("#usage-stats-section");
    chrome.storage.local.get(["cloudModeEnabled"], (result) => {
      const isCloud = result.cloudModeEnabled || false;
      if (isCloud) {
        cloudRadio.checked = true;
        this.switchToCloudMode(modal);
      } else {
        localRadio.checked = true;
        this.switchToLocalMode(modal);
      }
    });
    localRadio.addEventListener("change", () => this.switchToLocalMode(modal));
    cloudRadio.addEventListener("change", () => this.switchToCloudMode(modal));
    const providerSelect = modal.querySelector("#cloud-provider");
    if (providerSelect) {
      providerSelect.addEventListener("change", (e) => {
        this.updateCloudProvider(e.target.value);
      });
    }
    const cloudModelSelect = modal.querySelector("#cloud-model-select");
    if (cloudModelSelect) {
      chrome.storage.local.get(["cloudModel"], (result) => {
        if (result.cloudModel) {
          cloudModelSelect.value = result.cloudModel;
        }
      });
      cloudModelSelect.addEventListener("change", (e) => {
        chrome.storage.local.set({ cloudModel: e.target.value });
      });
    }
    const testBtn = modal.querySelector("#test-api-key");
    if (testBtn) {
      testBtn.addEventListener("click", async () => {
        const apiKeyInput = modal.querySelector("#api-key-input");
        const provider = modal.querySelector("#cloud-provider").value;
        await this.testAPIKey(provider, apiKeyInput.value, modal);
      });
    }
    const installModelBtn = modal.querySelector("#install-model");
    if (installModelBtn) {
      installModelBtn.addEventListener("click", () => {
        this.showInstallModelDialog();
      });
    }
    const exportJsonBtn = modal.querySelector("#export-stats-json");
    const exportCsvBtn = modal.querySelector("#export-stats-csv");
    const clearStatsBtn = modal.querySelector("#clear-stats");
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener("click", () => this.exportUsageStats("json"));
    }
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => this.exportUsageStats("csv"));
    }
    if (clearStatsBtn) {
      clearStatsBtn.addEventListener("click", () => this.clearUsageStats());
    }
    this.checkOllamaStatus(modal);
  }
  /**
   * Switch to Local AI mode
   * @param {HTMLElement} modal - The modal element
   */
  switchToLocalMode(modal) {
    const cloudSection = modal.querySelector("#cloud-provider-section");
    const localSection = modal.querySelector("#local-ai-section");
    const usageSection = modal.querySelector("#usage-stats-section");
    const modelPrefsSection = modal.querySelector(".feature-models-section");
    cloudSection.classList.add("hidden");
    usageSection.classList.add("hidden");
    localSection.classList.remove("hidden");
    if (modelPrefsSection) modelPrefsSection.classList.remove("hidden");
    chrome.storage.local.set({ cloudModeEnabled: false });
  }
  /**
   * Switch to Cloud AI mode
   * @param {HTMLElement} modal - The modal element
   */
  switchToCloudMode(modal) {
    const cloudSection = modal.querySelector("#cloud-provider-section");
    const localSection = modal.querySelector("#local-ai-section");
    const usageSection = modal.querySelector("#usage-stats-section");
    const modelPrefsSection = modal.querySelector(".feature-models-section");
    cloudSection.classList.remove("hidden");
    usageSection.classList.remove("hidden");
    localSection.classList.add("hidden");
    if (modelPrefsSection) modelPrefsSection.classList.add("hidden");
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
      alert("Please enter an API key");
      return;
    }
    const testBtn = modal.querySelector("#test-api-key");
    const originalText = testBtn.textContent;
    testBtn.textContent = "Testing...";
    testBtn.disabled = true;
    try {
      const { saveAPIKey, testConnection } = await __vitePreload(async () => {
        const { saveAPIKey: saveAPIKey2, testConnection: testConnection2 } = await import("./api-key-manager-IXHEYm1y.js");
        return { saveAPIKey: saveAPIKey2, testConnection: testConnection2 };
      }, true ? __vite__mapDeps([0,1]) : void 0);
      const isValid = await testConnection(provider, apiKey);
      if (isValid) {
        await saveAPIKey(provider, apiKey);
        alert("✅ Connection successful! API key saved.");
      } else {
        alert("❌ Connection failed. Please check your API key.");
      }
    } catch (error) {
      console.error("API key test failed:", error);
      alert("❌ Connection failed: " + error.message);
    } finally {
      testBtn.textContent = originalText;
      testBtn.disabled = false;
    }
  }
  /**
   * Show install model dialog
   */
  showInstallModelDialog() {
    const modelName = prompt("Enter model name to install (e.g., llama3.2):");
    if (modelName) {
      alert(`Installing model: ${modelName}

Run this in your terminal:

ollama pull ${modelName}`);
    }
  }
  /**
   * Check Ollama status
   * @param {HTMLElement} modal - The modal element
   */
  async checkOllamaStatus(modal) {
    const statusDot = modal.querySelector("#ollama-status .status-dot");
    const statusText = modal.querySelector("#ollama-status .status-text");
    try {
      const response = await fetch("http://localhost:11434/api/tags");
      if (response.ok) {
        const data = await response.json();
        statusDot.style.backgroundColor = "#10b981";
        statusText.textContent = `Connected (${data.models?.length || 0} models)`;
        this.populateModelList(modal, data.models || []);
      } else {
        throw new Error("Ollama not responding");
      }
    } catch (error) {
      statusDot.style.backgroundColor = "#ef4444";
      statusText.textContent = "Not connected";
    }
  }
  /**
   * Populate model list
   * @param {HTMLElement} modal - The modal element
   * @param {Array} models - List of Ollama models
   */
  populateModelList(modal, models) {
    const modelSelect = modal.querySelector("#local-model-select");
    if (!modelSelect) return;
    modelSelect.innerHTML = "";
    if (models.length === 0) {
      const option2 = document.createElement("option");
      option2.textContent = "No models installed";
      option2.disabled = true;
      modelSelect.appendChild(option2);
    } else {
      models.forEach((model) => {
        const option2 = document.createElement("option");
        option2.value = model.name;
        option2.textContent = model.name;
        modelSelect.appendChild(option2);
      });
    }
    const featureModelSelects = modal.querySelectorAll(".model-select[data-feature]");
    featureModelSelects.forEach((select) => {
      select.innerHTML = "";
      const autoOption = document.createElement("option");
      autoOption.value = "auto";
      autoOption.textContent = "Auto (Recommended)";
      select.appendChild(autoOption);
      if (models.length > 0) {
        models.forEach((model) => {
          const option2 = document.createElement("option");
          option2.value = model.name;
          option2.textContent = model.name;
          select.appendChild(option2);
        });
      }
    });
  }
  /**
   * Export usage statistics
   * @param {string} format - 'json' or 'csv'
   */
  exportUsageStats(format) {
    chrome.storage.local.get(["usageStats"], (result) => {
      const stats = result.usageStats || { requests: 0, tokens: 0, history: [] };
      let content, filename, mimeType;
      if (format === "json") {
        content = JSON.stringify(stats, null, 2);
        filename = `assist-usage-stats-${Date.now()}.json`;
        mimeType = "application/json";
      } else {
        content = "Date,Feature,Requests,Tokens\n";
        stats.history?.forEach((entry) => {
          content += `${entry.date},${entry.feature},${entry.requests},${entry.tokens}
`;
        });
        filename = `assist-usage-stats-${Date.now()}.csv`;
        mimeType = "text/csv";
      }
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
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
    if (confirm("Clear all usage statistics? This cannot be undone.")) {
      chrome.storage.local.set({
        usageStats: { requests: 0, tokens: 0, history: [] }
      }, () => {
        alert("Usage statistics cleared.");
        document.querySelector("#stat-requests").textContent = "0";
        document.querySelector("#stat-tokens").textContent = "0";
      });
    }
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
    loadCheckbox("show-dark-mode", "show_dark_mode");
    loadCheckbox("show-simplify", "show_simplify");
    loadCheckbox("show-reading-progress", "show_reading_progress");
    loadCheckbox("show-pomodoro", "show_pomodoro");
    loadCheckbox("show-stargardt", "show_stargardt");
    loadCheckbox("show-reduced-motion", "show_reduced_motion");
    loadCheckbox("show-media-control", "show_media_control");
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
    const grid = document.getElementById("keyboard-shortcuts-grid");
    if (!grid) {
      console.warn("[Popup] Keyboard shortcuts grid not found");
      return;
    }
    const categories = {
      tts_play_pause: "TTS Controls",
      tts_stop: "TTS Controls",
      ocr_activate: "Reading",
      reading_mode_toggle: "Reading",
      reading_mode_exit: "Reading",
      dictionary_lookup: "Lookup Tools",
      text_stats_toggle: "Reading",
      highlight_menu_toggle: "Lookup Tools",
      sticky_note_create: "Writing",
      translation_toggle: "Lookup Tools",
      focus_mode_toggle: "Display",
      reading_guide_toggle: "Display",
      screen_overlay_toggle: "Display",
      dyslexia_mode_toggle: "Display"
    };
    grid.innerHTML = "";
    for (const [key, shortcut] of Object.entries(shortcuts)) {
      const card = document.createElement("div");
      card.className = "shortcut-card";
      card.setAttribute("data-shortcut", key);
      const displayShortcut = shortcut || "Not set";
      const isEmpty = !shortcut;
      card.innerHTML = `
        <div class="shortcut-header">
          <span class="shortcut-category">${categories[key] || "General"}</span>
        </div>
        <div class="shortcut-body">
          <span class="shortcut-name">${SHORTCUT_LABELS[key] || key}</span>
          <kbd class="shortcut-key${isEmpty ? " empty" : ""}">${displayShortcut}</kbd>
        </div>
        <div class="shortcut-footer">
          <button class="shortcut-edit-btn" data-key="${key}" title="Click to assign shortcut">
            <span class="btn-icon">✏️</span>
            <span class="btn-text">Assign</span>
          </button>
          ${!isEmpty ? `<button class="shortcut-clear-btn" data-key="${key}" title="Clear shortcut">🗑️</button>` : ""}
        </div>
      `;
      grid.appendChild(card);
    }
    grid.querySelectorAll(".shortcut-edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const key = e.currentTarget.getAttribute("data-key");
        this.startShortcutRecording(key, shortcuts);
      });
    });
    grid.querySelectorAll(".shortcut-clear-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const key = e.currentTarget.getAttribute("data-key");
        shortcuts[key] = "";
        await saveShortcuts(shortcuts);
        this.loadKeyboardShortcuts();
        this.updateStatus(`Cleared shortcut: ${SHORTCUT_LABELS[key]}`);
      });
    });
    const clearAllBtn = document.getElementById("btn-clear-all-shortcuts");
    if (clearAllBtn) {
      clearAllBtn.onclick = async () => {
        if (confirm("Clear all keyboard shortcuts? This cannot be undone.")) {
          const emptyShortcuts = {};
          for (const key of Object.keys(shortcuts)) {
            emptyShortcuts[key] = "";
          }
          await saveShortcuts(emptyShortcuts);
          this.loadKeyboardShortcuts();
          this.updateStatus("All shortcuts cleared");
        }
      };
    }
    this.setupShortcutPresets();
  }
  /**
   * Setup shortcut preset buttons
   */
  setupShortcutPresets() {
    const presetBtns = document.querySelectorAll(".preset-btn");
    presetBtns.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const preset = e.target.getAttribute("data-preset");
        presetBtns.forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
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
        tts_play_pause: "Ctrl+Shift+Space",
        tts_stop: "Ctrl+Shift+S",
        ocr_activate: "Alt+O",
        reading_mode_toggle: "Ctrl+Shift+R",
        reading_mode_exit: "Escape",
        dictionary_lookup: "Ctrl+Shift+D"
      },
      minimal: {
        tts_play_pause: "Ctrl+Space",
        tts_stop: "",
        ocr_activate: "",
        reading_mode_toggle: "Ctrl+R",
        reading_mode_exit: "Escape",
        dictionary_lookup: ""
      },
      oneHanded: {
        tts_play_pause: "Alt+Q",
        tts_stop: "Alt+W",
        ocr_activate: "Alt+E",
        reading_mode_toggle: "Alt+A",
        reading_mode_exit: "Escape",
        dictionary_lookup: "Alt+S"
      }
    };
    const selectedPreset = presets[preset];
    if (!selectedPreset) {
      return;
    }
    for (const [key, value] of Object.entries(selectedPreset)) {
      await updateShortcut(key, value);
    }
    this.loadKeyboardShortcuts();
    this.updateStatus(`Applied "${preset}" shortcut preset`);
  }
  startShortcutRecording(featureKey, currentShortcuts) {
    const overlay = document.getElementById("shortcut-recording-overlay");
    const display = document.getElementById("recording-display");
    const currentKeyDisplay = document.getElementById("recording-current-key");
    const errorDiv = document.getElementById("recording-error");
    const saveBtn = document.getElementById("btn-recording-save");
    const cancelBtn = document.getElementById("btn-recording-cancel");
    const clearBtn = document.getElementById("btn-recording-clear");
    const modifierKeys = document.querySelectorAll(".modifier-key");
    if (!overlay) {
      return;
    }
    overlay.classList.add("active");
    const currentShortcut = currentShortcuts[featureKey] || "None";
    if (currentKeyDisplay) {
      currentKeyDisplay.textContent = currentShortcut;
    }
    display.textContent = "Press keys...";
    errorDiv.textContent = "";
    saveBtn.disabled = true;
    modifierKeys.forEach((key) => key.classList.remove("active"));
    let recordedShortcut = null;
    let isValid = false;
    const updateModifierVisuals = (e) => {
      modifierKeys.forEach((key) => {
        const keyName = key.getAttribute("data-key");
        if (keyName === "ctrl" && e.ctrlKey) {
          key.classList.add("active");
        } else if (keyName === "alt" && e.altKey) {
          key.classList.add("active");
        } else if (keyName === "shift" && e.shiftKey) {
          key.classList.add("active");
        } else if (!e.ctrlKey && keyName === "ctrl") {
          key.classList.remove("active");
        } else if (!e.altKey && keyName === "alt") {
          key.classList.remove("active");
        } else if (!e.shiftKey && keyName === "shift") {
          key.classList.remove("active");
        }
      });
    };
    const handleKeyPress = (e) => {
      e.preventDefault();
      e.stopPropagation();
      updateModifierVisuals(e);
      recordedShortcut = eventToShortcut(e);
      display.textContent = recordedShortcut;
      const validation = validateShortcut(recordedShortcut, currentShortcuts, featureKey);
      if (validation.valid) {
        errorDiv.textContent = "";
        errorDiv.style.color = "#059669";
        errorDiv.textContent = "✓ Valid shortcut";
        saveBtn.disabled = false;
        isValid = true;
      } else {
        errorDiv.style.color = "#dc2626";
        errorDiv.textContent = validation.error;
        saveBtn.disabled = true;
        isValid = false;
      }
    };
    const handleKeyUp = (e) => {
      updateModifierVisuals(e);
    };
    document.addEventListener("keydown", handleKeyPress);
    document.addEventListener("keyup", handleKeyUp);
    const closeOverlay = () => {
      document.removeEventListener("keydown", handleKeyPress);
      document.removeEventListener("keyup", handleKeyUp);
      overlay.classList.remove("active");
      modifierKeys.forEach((key) => key.classList.remove("active"));
    };
    cancelBtn.onclick = closeOverlay;
    if (clearBtn) {
      clearBtn.onclick = () => {
        recordedShortcut = null;
        display.textContent = "Press keys...";
        errorDiv.textContent = "";
        saveBtn.disabled = true;
        modifierKeys.forEach((key) => key.classList.remove("active"));
      };
    }
    saveBtn.onclick = async () => {
      if (isValid && recordedShortcut) {
        currentShortcuts[featureKey] = recordedShortcut;
        await saveShortcuts(currentShortcuts);
        this.loadKeyboardShortcuts();
        closeOverlay();
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
    saveCheckbox("show-dark-mode", "show_dark_mode");
    saveCheckbox("show-simplify", "show_simplify");
    saveCheckbox("show-reading-progress", "show_reading_progress");
    saveCheckbox("show-pomodoro", "show_pomodoro");
    saveCheckbox("show-stargardt", "show_stargardt");
    saveCheckbox("show-reduced-motion", "show_reduced_motion");
    saveCheckbox("show-media-control", "show_media_control");
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
        const option2 = document.createElement("option");
        option2.value = voice.name;
        option2.textContent = voice.name + (voice.default ? " (Default)" : "");
        option2.selected = voice.name === this.settings?.tts?.voice;
        optgroup.appendChild(option2);
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
          auto: "Auto (selecting...)",
          whisper: "Whisper (Offline)",
          "web-speech": "Web Speech API",
          azure: "Azure Speech Services"
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
        const index2 = parseInt(btn.dataset.index);
        const word = this.settings.stt.vocabulary.customWords[index2];
        this.settings.stt.vocabulary.customWords.splice(index2, 1);
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
    if (wpmEl) {
      wpmEl.textContent = stats.wordsPerMinute || 0;
    }
    if (accuracyEl) {
      const accuracy = stats.averageConfidence || 0;
      accuracyEl.textContent = `${accuracy}%`;
      const color = accuracy >= 85 ? "#22c55e" : accuracy >= 60 ? "#eab308" : "#ef4444";
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
    if (selector) {
      selector.innerHTML = "";
      Object.keys(this.profiles).forEach((name) => {
        const option2 = document.createElement("option");
        option2.value = name;
        option2.textContent = name;
        option2.selected = name === this.activeProfile;
        selector.appendChild(option2);
      });
    }
    const modalSelector = document.getElementById("modal-profile-select");
    if (modalSelector) {
      modalSelector.innerHTML = "";
      Object.keys(this.profiles).forEach((name) => {
        const option2 = document.createElement("option");
        option2.value = name;
        option2.textContent = name;
        option2.selected = name === this.activeProfile;
        modalSelector.appendChild(option2);
      });
    }
  }
  profiles_setupEventListeners() {
    const selector = document.getElementById("profile-select");
    if (selector) {
      selector.addEventListener("change", (e) => {
        this.profiles_loadProfile(e.target.value);
      });
    }
    const modalSelector = document.getElementById("modal-profile-select");
    if (modalSelector) {
      modalSelector.addEventListener("change", (e) => {
        this.profiles_loadProfile(e.target.value);
      });
    }
    const saveBtn = document.getElementById("btn-save-profile");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        this.profiles_showSaveModal();
      });
    }
    const exportBtn = document.getElementById("btn-export-profiles");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        this.profiles_export();
      });
    }
    const importBtn = document.getElementById("btn-import-profiles");
    if (importBtn) {
      importBtn.addEventListener("click", () => {
        const importInput2 = document.getElementById("profile-import-input");
        if (importInput2) {
          importInput2.click();
        }
      });
    }
    const importInput = document.getElementById("profile-import-input");
    if (importInput) {
      importInput.addEventListener("change", (e) => {
        this.profiles_import(e.target.files[0]);
      });
    }
    const cancelSaveBtn = document.getElementById("btn-cancel-save-profile");
    if (cancelSaveBtn) {
      cancelSaveBtn.addEventListener("click", () => {
        document.getElementById("save-profile-modal")?.classList.add("hidden");
      });
    }
    const confirmSaveBtn = document.getElementById("btn-confirm-save-profile");
    if (confirmSaveBtn) {
      confirmSaveBtn.addEventListener("click", () => {
        this.profiles_saveNew();
      });
    }
    const cancelDeleteBtn = document.getElementById("btn-cancel-delete-profile");
    if (cancelDeleteBtn) {
      cancelDeleteBtn.addEventListener("click", () => {
        document.getElementById("delete-profile-modal")?.classList.add("hidden");
      });
    }
    const confirmDeleteBtn = document.getElementById("btn-confirm-delete-profile");
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener("click", () => {
        this.profiles_confirmDelete();
      });
    }
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", () => {
        overlay.closest(".modal")?.classList.add("hidden");
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
        preferredModel: "mistral:7b-instruct",
        fastModel: "phi3:mini",
        visionModel: "llava",
        vramTier: "8gb",
        // Default to 8GB tier
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
    this.setupAIAssist();
  }
  /**
   * Set up unified AI Assist section with radio toggles
   */
  setupAIAssist() {
    const aiModeRadios = document.querySelectorAll('input[name="ai-mode"]');
    const btnCheckLLM = document.getElementById("btn-check-llm");
    const llmInstallProgress = document.getElementById("llm-install-progress");
    const llmProgressModel = document.getElementById("llm-progress-model");
    const llmProgressPercent = document.getElementById("llm-progress-percent");
    const llmProgressFill = document.getElementById("llm-progress-fill");
    this.installedModels = [];
    chrome.storage.local.get(["aiMode", "llmEnabled", "cloudModeEnabled"], (result) => {
      let currentMode = result.aiMode || "off";
      if (!result.aiMode) {
        if (result.cloudModeEnabled) {
          currentMode = "cloud";
        } else if (result.llmEnabled || this.settings.localLLM.enabled) {
          currentMode = "local";
        }
        chrome.storage.local.set({ aiMode: currentMode });
      }
      aiModeRadios.forEach((radio) => {
        if (radio.value === currentMode) {
          radio.checked = true;
        }
      });
      this.updateAIMode(currentMode);
    });
    aiModeRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          const mode = e.target.value;
          chrome.storage.local.set({ aiMode: mode });
          this.updateAIMode(mode);
        }
      });
    });
    if (btnCheckLLM) {
      btnCheckLLM.addEventListener("click", () => {
        this.checkLLMStatus();
      });
    }
    const vramTierSelect = document.getElementById("vram-tier-select");
    const vramTierDescription = document.getElementById("vram-tier-description");
    const VRAM_TIERS = {
      auto: {
        quality: "Auto-detect",
        models: "Based on installed models",
        preferredModel: null
        // Use auto-detection
      },
      "2gb": {
        quality: "15-30%",
        models: "phi3:mini, llama3.2",
        preferredModel: "phi3:mini"
      },
      "4gb": {
        quality: "30-45%",
        models: "gemma3:4b, llama3.2, phi3:mini",
        preferredModel: "gemma3:4b"
      },
      "8gb": {
        quality: "55-70%",
        models: "mistral:7b, qwen2.5:7b",
        preferredModel: "mistral:7b-instruct"
      },
      "12gb": {
        quality: "65-75%",
        models: "llama3.1:8b, mixtral:8x7b",
        preferredModel: "llama3.1:8b"
      },
      "16gb": {
        quality: "75-85%",
        models: "llama3.1:70b-q4, qwen2.5:14b",
        preferredModel: "qwen2.5:14b"
      },
      "24gb": {
        quality: "85-92%",
        models: "llama3.1:70b, mixtral:8x22b",
        preferredModel: "llama3.1:70b"
      }
    };
    const updateVramDescription = (tier) => {
      const config = VRAM_TIERS[tier];
      if (config && vramTierDescription) {
        vramTierDescription.innerHTML = `
          <span class="vram-quality">Quality: ${config.quality}</span>
          <span class="vram-models">Models: ${config.models}</span>
        `;
      }
    };
    if (vramTierSelect) {
      const savedTier = this.settings.localLLM.vramTier || "8gb";
      vramTierSelect.value = savedTier;
      updateVramDescription(savedTier);
      vramTierSelect.addEventListener("change", async (e) => {
        const selectedTier = e.target.value;
        this.settings.localLLM.vramTier = selectedTier;
        const tierConfig = VRAM_TIERS[selectedTier];
        if (tierConfig && tierConfig.preferredModel) {
          this.settings.localLLM.preferredModel = tierConfig.preferredModel;
        }
        this.saveSettings();
        updateVramDescription(selectedTier);
        try {
          await chrome.runtime.sendMessage({
            action: "SET_VRAM_TIER",
            tier: selectedTier,
            preferredModel: tierConfig?.preferredModel
          });
          console.log(`[Popup] VRAM tier set to ${selectedTier}`);
        } catch (error) {
          console.warn("[Popup] Failed to notify service worker of tier change:", error);
        }
      });
    }
    document.querySelectorAll(".llm-install-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const modelName = btn.dataset.model;
        if (btn.classList.contains("installed") || btn.classList.contains("installing")) {
          return;
        }
        btn.classList.add("installing");
        btn.textContent = "Installing...";
        if (llmInstallProgress) llmInstallProgress.classList.remove("hidden");
        if (llmProgressModel) llmProgressModel.textContent = `Installing ${modelName}...`;
        if (llmProgressPercent) llmProgressPercent.textContent = "0%";
        if (llmProgressFill) llmProgressFill.style.width = "0%";
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
          const errorMsg = error.message || "Installation failed";
          this.updateStatus(errorMsg, "error");
        } finally {
          if (llmInstallProgress) llmInstallProgress.classList.add("hidden");
        }
      });
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "LLM_INSTALL_PROGRESS") {
        if (llmProgressModel) llmProgressModel.textContent = `Installing ${message.modelName}...`;
        if (llmProgressPercent) llmProgressPercent.textContent = `${message.progress.percent}%`;
        if (llmProgressFill) llmProgressFill.style.width = `${message.progress.percent}%`;
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
          const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json"
          });
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
    const btnExportJson = document.getElementById("btn-export-usage-json");
    const btnExportCsv = document.getElementById("btn-export-usage-csv");
    const btnClearUsage = document.getElementById("btn-clear-usage");
    if (btnExportJson) {
      btnExportJson.addEventListener("click", async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            action: "EXPORT_USAGE_JSON"
          });
          if (response.success) {
            const blob = new Blob([response.data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `assist-cloud-usage-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.updateStatus("Usage exported (JSON)", "success");
          } else {
            throw new Error(response.error);
          }
        } catch (error) {
          console.error("[Popup] Export JSON failed:", error);
          this.updateStatus("Export failed", "error");
        }
      });
    }
    if (btnExportCsv) {
      btnExportCsv.addEventListener("click", async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            action: "EXPORT_USAGE_CSV"
          });
          if (response.success) {
            const blob = new Blob([response.data], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `assist-cloud-usage-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            this.updateStatus("Usage exported (CSV)", "success");
          } else {
            throw new Error(response.error);
          }
        } catch (error) {
          console.error("[Popup] Export CSV failed:", error);
          this.updateStatus("Export failed", "error");
        }
      });
    }
    if (btnClearUsage) {
      btnClearUsage.addEventListener("click", async () => {
        if (confirm("Clear all cloud usage data? This cannot be undone.")) {
          try {
            const response = await chrome.runtime.sendMessage({
              action: "CLEAR_USAGE_DATA"
            });
            if (response.success) {
              this.loadCloudUsageStats();
              this.updateStatus("Usage data cleared", "success");
            } else {
              throw new Error(response.error);
            }
          } catch (error) {
            console.error("[Popup] Clear usage failed:", error);
            this.updateStatus("Clear failed", "error");
          }
        }
      });
    }
    console.log("[Popup] AI Assist setup complete");
  }
  /**
   * Update AI mode (show/hide containers, update badge, notify background)
   */
  updateAIMode(mode) {
    const localAIContainer = document.getElementById("local-ai-container");
    const cloudAIContainer = document.getElementById("cloud-ai-container");
    const llmStatusBadge = document.getElementById("llm-status-badge");
    const cloudUsageStats = document.getElementById("cloud-usage-stats");
    localAIContainer?.classList.add("hidden");
    cloudAIContainer?.classList.add("hidden");
    switch (mode) {
      case "local":
        localAIContainer?.classList.remove("hidden");
        llmStatusBadge.textContent = "Checking...";
        llmStatusBadge.className = "llm-badge";
        this.checkLLMStatus();
        this.settings.localLLM.enabled = true;
        this.saveSettings();
        chrome.runtime.sendMessage({
          action: "LOCAL_LLM_MODE_CHANGED",
          enabled: true
        }).catch(() => {
        });
        this.updateStatus("Local AI enabled", "success");
        break;
      case "cloud":
        cloudAIContainer?.classList.remove("hidden");
        llmStatusBadge.textContent = "Cloud";
        llmStatusBadge.className = "llm-badge online";
        if (cloudUsageStats) {
          cloudUsageStats.style.display = "block";
          this.loadCloudUsageStats();
        }
        this.settings.localLLM.enabled = false;
        this.saveSettings();
        chrome.runtime.sendMessage({
          action: "CLOUD_MODE_CHANGED",
          enabled: true
        }).catch(() => {
        });
        chrome.storage.local.set({ cloudModeEnabled: true });
        this.updateStatus("Cloud AI enabled", "success");
        break;
      case "off":
      default:
        llmStatusBadge.textContent = "Off";
        llmStatusBadge.className = "llm-badge offline";
        if (cloudUsageStats) {
          cloudUsageStats.style.display = "none";
        }
        this.settings.localLLM.enabled = false;
        this.saveSettings();
        chrome.runtime.sendMessage({
          action: "LOCAL_LLM_MODE_CHANGED",
          enabled: false
        }).catch(() => {
        });
        chrome.runtime.sendMessage({
          action: "CLOUD_MODE_CHANGED",
          enabled: false
        }).catch(() => {
        });
        chrome.storage.local.set({ cloudModeEnabled: false });
        this.updateStatus("AI Assist disabled", "success");
        break;
    }
  }
  /**
   * Load and display cloud usage statistics
   */
  async loadCloudUsageStats() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "GET_USAGE_STATS"
      });
      if (response.success && response.data) {
        const stats = response.data;
        document.getElementById("cloud-stat-requests").textContent = stats.totalRequests || 0;
        document.getElementById("cloud-stat-tokens").textContent = stats.totalTokens || 0;
        document.getElementById("cloud-stat-avg-in").textContent = stats.averageInputTokens || 0;
        document.getElementById("cloud-stat-avg-out").textContent = stats.averageOutputTokens || 0;
      }
    } catch (error) {
      console.error("[Popup] Failed to load usage stats:", error);
    }
  }
  async checkLLMStatus() {
    const llmStatusBadge = document.getElementById("llm-status-badge");
    const llmConnectionStatus = document.getElementById("llm-connection-status");
    const llmModelsRow = document.getElementById("llm-models-row");
    const llmInstalledModels = document.getElementById("llm-installed-models");
    if (llmConnectionStatus) {
      llmConnectionStatus.textContent = "Checking...";
      llmConnectionStatus.className = "llm-status-value";
    }
    try {
      const response = await chrome.runtime.sendMessage({
        action: "LOCAL_LLM_CHECK"
      });
      if (response.success && response.available) {
        if (llmStatusBadge) {
          llmStatusBadge.textContent = "Online";
          llmStatusBadge.className = "llm-badge online";
        }
        if (llmConnectionStatus) {
          llmConnectionStatus.textContent = "Connected to Ollama";
          llmConnectionStatus.className = "llm-status-value connected";
        }
        this.installedModels = response.models || [];
        if (this.installedModels.length > 0) {
          if (llmModelsRow) llmModelsRow.style.display = "flex";
          if (llmInstalledModels) llmInstalledModels.textContent = this.installedModels.join(", ");
          this.updateModelList();
        } else {
          if (llmModelsRow) llmModelsRow.style.display = "none";
        }
      } else {
        if (llmStatusBadge) {
          llmStatusBadge.textContent = "Offline";
          llmStatusBadge.className = "llm-badge offline";
        }
        if (llmConnectionStatus) {
          llmConnectionStatus.textContent = "Not connected - Start Ollama";
          llmConnectionStatus.className = "llm-status-value disconnected";
        }
        if (llmModelsRow) llmModelsRow.style.display = "none";
      }
    } catch (error) {
      console.error("[Popup] LLM check failed:", error);
      if (llmStatusBadge) {
        llmStatusBadge.textContent = "Error";
        llmStatusBadge.className = "llm-badge error";
      }
      if (llmConnectionStatus) {
        llmConnectionStatus.textContent = "Connection error";
        llmConnectionStatus.className = "llm-status-value disconnected";
      }
      if (llmModelsRow) llmModelsRow.style.display = "none";
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
  console.log("[Popup] DOMContentLoaded fired");
  try {
    const popup = new PopupController();
    console.log("[Popup] PopupController created");
    await popup.initialize();
    console.log("[Popup] Initialize complete");
    await popup.setupUserProfiles();
    console.log("[Popup] Setup complete - ready");
  } catch (error) {
    console.error("[Popup] Initialization error:", error);
    const statusIndicator = document.getElementById("status-indicator");
    if (statusIndicator) {
      statusIndicator.textContent = "Initialization Error - See Console (F12)";
      statusIndicator.className = "status-indicator error";
    }
  }
});
//# sourceMappingURL=popup.html-VgHPgX_J.js.map
