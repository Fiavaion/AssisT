class StorageManager {
  static STORAGE_KEYS = {
    SETTINGS: "assist_settings",
    USER_PROFILE: "assist_user_profile",
    LAST_SYNC: "assist_last_sync"
  };
  static DEFAULT_SETTINGS = {
    tts: {
      enabled: false,
      voice: "default",
      rate: 1,
      pitch: 1,
      volume: 1,
      highlightEnabled: true,
      highlightColor: "#FFEB3B",
      highlightOpacity: 0.7,
      autoStart: false
    },
    // Sprint 5 Features
    stt: {
      enabled: false,
      // Default OFF
      continuousMode: true,
      // Keep listening vs single utterance
      interimResults: true,
      // Show partial results
      language: "en-US",
      // Recognition language
      autoCapitalize: true,
      // Capitalize first word of sentences
      punctuationCommands: true,
      // Voice punctuation ("period", "comma")
      floatingButton: true
      // Show mic button on text field focus
    },
    waiAdapt: {
      textSpacing: {
        enabled: false,
        lineHeight: 1.5,
        paragraphSpacing: 2,
        letterSpacing: 0.12,
        wordSpacing: 0.16
      },
      focusMode: {
        enabled: false,
        hideExtraneous: true,
        simplifyNavigation: true
      },
      numericSimplification: {
        enabled: false,
        useText: true,
        useGraphics: false
      },
      typography: {
        font: "system",
        fontSize: 16,
        useOpenDyslexic: false
      },
      colorScheme: {
        mode: "default",
        backgroundColor: "#FFFFFF",
        textColor: "#000000",
        contrast: "normal"
      }
    },
    accessibility: {
      keyboardShortcuts: true,
      screenReaderOptimized: false,
      reducedMotion: false
    },
    // Sprint 3 Features
    textCustomization: {
      enabled: false,
      fontFamily: "system",
      // 'system' | 'lexend' | 'opendyslexic' | 'comic-sans' | 'arial'
      lineSpacing: 1.5,
      // WCAG min: 1.5
      letterSpacing: 0.12,
      // WCAG min: 0.12em (displayed as 12%)
      wordSpacing: 0.16,
      // WCAG min: 0.16em (displayed as 16%)
      paragraphSpacing: 2
      // WCAG min: 2.0em
    },
    readingGuide: {
      enabled: false,
      lineColor: "#000000",
      lineThickness: 3,
      // px, range: 1-10px
      lineOpacity: 0.7
      // 0.0-1.0
    },
    focusMode: {
      enabled: false,
      boxWidth: 400,
      // px, min: 150, max: 800, step: 5
      boxHeight: 100,
      // px, min: 50, max: 250, step: 5
      overlayOpacity: 0.7
      // 0.0-1.0 (darkness of surrounding area)
    },
    // Sprint 4 Features
    canvasIntegration: {
      enabled: false,
      // Default OFF - user will test post-launch
      assignmentReader: true,
      // Auto-reader for Canvas assignments
      quizHelper: false,
      // Future: Quiz content extraction
      keyboardNav: false
      // Future: Keyboard navigation enhancements
    },
    // Sprint 9 Features - Multi-Platform LMS Support
    moodleIntegration: {
      enabled: false,
      // Default OFF - EXPERIMENTAL feature
      assignmentReader: true,
      // Auto-reader for Moodle assignments
      forumReader: true,
      // Read forum posts
      pageReader: true,
      // Read page resources
      quizHelper: false
      // Future: Quiz content extraction
    },
    googleClassroomIntegration: {
      enabled: false,
      // Default OFF - EXPERIMENTAL feature
      assignmentReader: true,
      // Auto-reader for Google Classroom assignments
      streamReader: true,
      // Read stream posts/announcements
      classworkReader: true
      // Read classwork items
    }
  };
  /**
   * Initialize default settings on first install
   */
  static async initializeDefaults() {
    try {
      const existing = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);
      if (!existing[this.STORAGE_KEYS.SETTINGS]) {
        await chrome.storage.local.set({
          [this.STORAGE_KEYS.SETTINGS]: this.DEFAULT_SETTINGS,
          [this.STORAGE_KEYS.LAST_SYNC]: Date.now()
        });
        console.log("[Storage] Default settings initialized");
      }
      return this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error("[Storage] Failed to initialize defaults:", error);
      throw error;
    }
  }
  /**
   * Get all user settings
   */
  static async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);
      return result[this.STORAGE_KEYS.SETTINGS] || this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error("[Storage] Failed to get settings:", error);
      return this.DEFAULT_SETTINGS;
    }
  }
  /**
   * Update specific setting
   */
  static async updateSetting(path, value) {
    try {
      const settings = await this.getSettings();
      const keys = path.split(".");
      let current = settings;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: settings,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now()
      });
      console.log("[Storage] Setting updated:", path, value);
      return settings;
    } catch (error) {
      console.error("[Storage] Failed to update setting:", error);
      throw error;
    }
  }
  /**
   * Save complete settings object
   */
  static async saveSettings(settings) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: settings,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now()
      });
      console.log("[Storage] Settings saved");
      return settings;
    } catch (error) {
      console.error("[Storage] Failed to save settings:", error);
      throw error;
    }
  }
  /**
   * Reset to defaults
   */
  static async resetToDefaults() {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: this.DEFAULT_SETTINGS,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now()
      });
      console.log("[Storage] Settings reset to defaults");
      return this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error("[Storage] Failed to reset settings:", error);
      throw error;
    }
  }
  /**
   * Export settings for backup (FERPA-compliant - no PII)
   */
  static async exportSettings() {
    try {
      const settings = await this.getSettings();
      const exportData = {
        version: "1.0",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        settings
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error("[Storage] Failed to export settings:", error);
      throw error;
    }
  }
  /**
   * Import settings from backup
   */
  static async importSettings(jsonString) {
    try {
      const importData = JSON.parse(jsonString);
      if (!importData.settings) {
        throw new Error("Invalid import format");
      }
      await this.saveSettings(importData.settings);
      console.log("[Storage] Settings imported successfully");
      return importData.settings;
    } catch (error) {
      console.error("[Storage] Failed to import settings:", error);
      throw error;
    }
  }
}
class MessageRouter {
  static async route(message, sender) {
    const { type, data } = message;
    console.log("[MessageRouter] Routing message:", type, "from:", sender.tab?.id || "popup");
    try {
      switch (type) {
        case "GET_SETTINGS":
          return await this.handleGetSettings();
        case "UPDATE_SETTINGS":
          return await this.handleUpdateSettings(data);
        case "RESET_SETTINGS":
          return await this.handleResetSettings();
        case "EXPORT_SETTINGS":
          return await this.handleExportSettings();
        case "IMPORT_SETTINGS":
          return await this.handleImportSettings(data);
        case "GET_TAB_CONTEXT":
          return await this.handleGetTabContext(sender.tab);
        case "TTS_COMMAND":
          return await this.handleTTSCommand(sender.tab?.id, data);
        case "STT_COMMAND":
          return await this.handleSTTCommand(sender.tab?.id, data);
        default:
          throw new Error(`Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error("[MessageRouter] Error routing message:", error);
      throw error;
    }
  }
  static async handleGetSettings() {
    return await StorageManager.getSettings();
  }
  static async handleUpdateSettings(settings) {
    const updated = await StorageManager.saveSettings(settings);
    await this.broadcastToCanvasTabs({
      type: "UPDATE_SETTINGS",
      settings: updated
    });
    return updated;
  }
  static async handleResetSettings() {
    const defaults = await StorageManager.resetToDefaults();
    await this.broadcastToCanvasTabs({
      type: "UPDATE_SETTINGS",
      settings: defaults
    });
    return defaults;
  }
  static async handleExportSettings() {
    return await StorageManager.exportSettings();
  }
  static async handleImportSettings(jsonString) {
    const settings = await StorageManager.importSettings(jsonString);
    await this.broadcastToCanvasTabs({
      type: "UPDATE_SETTINGS",
      settings
    });
    return settings;
  }
  static async handleGetTabContext(tab) {
    if (!tab?.id) {
      throw new Error("No active tab");
    }
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_CONTEXT"
    });
    return response;
  }
  static async handleTTSCommand(tabId, command) {
    if (!tabId) {
      throw new Error("No active tab");
    }
    return await chrome.tabs.sendMessage(tabId, {
      type: "TTS_COMMAND",
      command
    });
  }
  static async handleSTTCommand(tabId, command) {
    if (!tabId) {
      throw new Error("No active tab");
    }
    return await chrome.tabs.sendMessage(tabId, {
      type: "STT_COMMAND",
      command
    });
  }
  /**
   * Broadcast message to all Canvas VLE tabs
   */
  static async broadcastToCanvasTabs(message) {
    try {
      const tabs = await chrome.tabs.query({
        url: "*://*.instructure.com/*"
      });
      const promises = tabs.map(
        (tab) => chrome.tabs.sendMessage(tab.id, message).catch((err) => {
          console.warn(`[MessageRouter] Failed to send to tab ${tab.id}:`, err.message);
        })
      );
      await Promise.allSettled(promises);
      console.log(`[MessageRouter] Broadcasted to ${tabs.length} Canvas tabs`);
    } catch (error) {
      console.error("[MessageRouter] Broadcast failed:", error);
    }
  }
}
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[AssisT] Extension installed:", details.reason);
  if (details.reason === "install") {
    await StorageManager.initializeDefaults();
    console.log("[AssisT] Installation complete! Click the extension icon to get started.");
  }
  if (details.reason === "update") {
    console.log("[AssisT] Extension updated from", details.previousVersion);
  }
  chrome.contextMenus.create({
    id: "save-citation",
    title: "Save Citation",
    contexts: ["page", "link"]
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-citation") {
    console.log('[AssisT] Context menu "Save Citation" clicked');
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "SAVE_CITATION"
      });
      if (response && response.success) {
        console.log("[AssisT] Citation saved via context menu");
      } else {
        console.error("[AssisT] Citation save failed via context menu");
      }
    } catch (error) {
      console.error("[AssisT] Context menu citation error:", error);
    }
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "OPEN_DISCOVERY_QUIZ") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/pages/discovery/discovery.html")
    });
    sendResponse({ success: true });
    return false;
  }
  if (message.action === "OPEN_DEMO_PAGE") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/pages/demo/demo.html")
    });
    sendResponse({ success: true });
    return false;
  }
  if (message.action === "CAPTURE_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(null, { format: message.options?.format || "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message
        });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    return true;
  }
  if (message.action === "FETCH_PDF") {
    console.log("[AssisT] Fetching PDF:", message.url);
    fetch(message.url).then((response) => {
      if (!response.ok && !message.url.startsWith("file://")) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.arrayBuffer();
    }).then((arrayBuffer) => {
      console.log(`[AssisT] Fetched PDF: ${arrayBuffer.byteLength} bytes`);
      const uint8Array = new Uint8Array(arrayBuffer);
      const dataArray = Array.from(uint8Array);
      sendResponse({ success: true, data: dataArray, byteLength: arrayBuffer.byteLength });
    }).catch((error) => {
      console.error("[AssisT] PDF fetch failed:", error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  if (message.action === "SCROLL_PDF") {
    const tabId = sender.tab?.id || message.tabId;
    if (!tabId) {
      sendResponse({ success: false, error: "No tab ID provided" });
      return false;
    }
    if (message.scrollY === "PAGE_DOWN") {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          console.log("[PDF Page Down] Simulating Page Down keypress");
          const pageDownEvent = new KeyboardEvent("keydown", {
            key: "PageDown",
            code: "PageDown",
            keyCode: 34,
            which: 34,
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(pageDownEvent);
          for (let i = 0; i < 10; i++) {
            const arrowDownEvent = new KeyboardEvent("keydown", {
              key: "ArrowDown",
              code: "ArrowDown",
              keyCode: 40,
              which: 40,
              bubbles: true,
              cancelable: true
            });
            document.dispatchEvent(arrowDownEvent);
          }
          window.scrollBy(0, window.innerHeight);
          const newY = window.scrollY;
          console.log("[PDF Page Down] Result scroll position:", newY);
          return newY;
        }
      }).then((results) => {
        const actualScrollY = results && results[0] && results[0].result !== void 0 ? results[0].result : -1;
        console.log("[AssisT] PDF Page Down result:", actualScrollY);
        sendResponse({ success: true, actualScrollY });
      }).catch((error) => {
        console.error("[AssisT] PDF Page Down failed:", error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId },
      func: (scrollY) => {
        console.log("[PDF Scroll Injection] Attempting to scroll to", scrollY);
        console.log(
          "[PDF Scroll Injection] Initial state - window.scrollY:",
          window.scrollY,
          "docElement.scrollTop:",
          document.documentElement.scrollTop
        );
        window.scrollTo(0, scrollY);
        console.log("[PDF Scroll Injection] After window.scrollTo:", window.scrollY);
        if (window.scrollY === 0 && scrollY > 0 && document.scrollingElement) {
          console.log("[PDF Scroll Injection] Trying document.scrollingElement");
          document.scrollingElement.scrollTop = scrollY;
          console.log(
            "[PDF Scroll Injection] After scrollingElement:",
            document.scrollingElement.scrollTop
          );
        }
        if (window.scrollY === 0 && scrollY > 0) {
          console.log("[PDF Scroll Injection] Trying document.documentElement");
          document.documentElement.scrollTop = scrollY;
          console.log(
            "[PDF Scroll Injection] After documentElement:",
            document.documentElement.scrollTop
          );
        }
        if (window.scrollY === 0 && scrollY > 0 && document.body) {
          console.log("[PDF Scroll Injection] Trying document.body");
          document.body.scrollTop = scrollY;
          console.log("[PDF Scroll Injection] After body:", document.body?.scrollTop);
        }
        if (window.scrollY === 0 && scrollY > 0) {
          console.log("[PDF Scroll Injection] Trying window.scrollBy");
          window.scrollBy(0, scrollY);
          console.log("[PDF Scroll Injection] After scrollBy:", window.scrollY);
        }
        const actualScroll = window.scrollY || document.documentElement.scrollTop || document.scrollingElement?.scrollTop || document.body?.scrollTop || 0;
        console.log("[PDF Scroll Injection] Final scroll position:", actualScroll);
        console.log(
          "[PDF Scroll Injection] ScrollHeight:",
          document.documentElement.scrollHeight,
          "ClientHeight:",
          document.documentElement.clientHeight
        );
        return actualScroll;
      },
      args: [message.scrollY]
    }).then((results) => {
      const actualScrollY = results && results[0] && results[0].result !== void 0 ? results[0].result : -1;
      console.log("[AssisT] PDF scroll injection result:", actualScrollY);
      sendResponse({ success: true, actualScrollY });
    }).catch((error) => {
      console.error("[AssisT] PDF scroll failed:", error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  MessageRouter.route(message, sender).then((response) => sendResponse({ success: true, data: response })).catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:"))) {
    return;
  }
  console.log("[AssisT] Tab activated:", tab.id);
});
chrome.action.onClicked.addListener(async (tab) => {
  console.log("[AssisT] Extension icon clicked on tab:", tab.id);
  chrome.tabs.sendMessage(tab.id, {
    type: "TOGGLE_ASSIST_PANEL"
  });
});
console.log("[AssisT] Background service worker initialized");
//# sourceMappingURL=service-worker.js-B4hUxdMI.js.map
