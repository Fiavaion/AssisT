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
    },
    // Local LLM Integration (AssisT LLM Edition)
    localLLM: {
      enabled: false,
      // Master toggle for all AI features
      baseUrl: "http://localhost:11434",
      // Ollama default URL
      preferredModel: "llama3.2",
      // Default model for most tasks
      fastModel: "phi3:mini",
      // Model for quick responses
      visionModel: "llava",
      // Model for image understanding
      // Individual feature toggles
      features: {
        smartSummarization: true,
        // AI-powered text summaries
        textSimplification: true,
        // Semantic text simplification
        cognitiveProfile: true,
        // Cognitive Twin learning
        stateDetection: true,
        // Cognitive state monitoring
        struggleDetection: true,
        // Proactive help triggers
        socraticTutor: true,
        // Guided questioning mode
        assignmentAnalyzer: true,
        // Assignment breakdown
        citationAnalyzer: true,
        // Source evaluation
        emotionalProsody: true,
        // TTS emotional tone
        visionAnalysis: true,
        // Image/page understanding
        knowledgeGraph: true,
        // Annotation linking
        adaptiveRSVP: true,
        // Intelligent RSVP timing
        predictiveLoading: true
        // Pre-load content
      },
      // Cognitive profile settings
      cognitiveProfile: {
        persistence: "6months",
        // 'session' | '1month' | '6months' | '1year' | 'permanent'
        lastCleared: null,
        exportEnabled: true
      },
      // Privacy settings (enforced)
      privacy: {
        neverSendToCloud: true,
        // Cannot be disabled
        clearContextAfterSession: false,
        // Clear conversation context after session
        noPersonalDataInPrompts: true,
        // Sanitize prompts
        localProcessingOnly: true
        // Enforced - no cloud APIs
      },
      // Performance settings
      performance: {
        cacheResponses: true,
        // Cache identical requests
        cacheTTL: 3e5,
        // 5 minutes cache duration
        maxConcurrentRequests: 2,
        // Limit parallel AI requests
        timeoutMs: 3e4
        // Request timeout
      },
      // UI preferences
      ui: {
        showAIIndicator: true,
        // Show when AI is processing
        showFallbackMessages: true,
        // Notify when using fallbacks
        compactMode: false
        // Reduce AI UI footprint
      }
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
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    console.log("[AssisT] Setting up context menus...");
    chrome.contextMenus.create({
      id: "save-citation",
      title: "Save Citation",
      contexts: ["page", "link"]
    });
    chrome.contextMenus.create({
      id: "describe-image",
      title: "🖼️ Describe Image with AI",
      contexts: ["image"]
    });
    console.log("[AssisT] Context menus created");
  });
}
setupContextMenus();
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[AssisT] Extension installed:", details.reason);
  if (details.reason === "install") {
    await StorageManager.initializeDefaults();
    console.log("[AssisT] Installation complete! Click the extension icon to get started.");
  }
  if (details.reason === "update") {
    console.log("[AssisT] Extension updated from", details.previousVersion);
  }
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
  if (info.menuItemId === "describe-image") {
    console.log('[AssisT] Context menu "Describe Image" clicked', info.srcUrl);
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "DESCRIBE_IMAGE",
        imageUrl: info.srcUrl
      });
      if (response && response.success) {
        console.log("[AssisT] Image description initiated");
      } else {
        console.error("[AssisT] Image description failed:", response?.error);
      }
    } catch (error) {
      console.error("[AssisT] Context menu image error:", error);
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
  if (message.action === "FETCH_IMAGE") {
    console.log("[AssisT] Fetching image:", message.url);
    fetch(message.url, {
      mode: "cors",
      credentials: "omit"
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.blob();
    }).then((blob) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }).then((base64) => {
      console.log(`[AssisT] Fetched image: ${base64.length} chars`);
      sendResponse({ success: true, base64 });
    }).catch((error) => {
      console.error("[AssisT] Image fetch failed:", error);
      sendResponse({ success: false, error: error.message });
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
  if (message.action === "LOCAL_LLM_CHECK") {
    checkOllamaAvailability().then((status) => sendResponse({ success: true, ...status })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "LOCAL_LLM_GENERATE") {
    ollamaGenerate(message.prompt, message.options || {}).then((result) => sendResponse({ success: true, data: result })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "LOCAL_LLM_VISION") {
    ollamaVision(message.image, message.prompt, message.options || {}).then((result) => sendResponse({ success: true, data: result })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "LOCAL_LLM_INSTALL_MODEL") {
    ollamaInstallModel(message.modelName, (progress) => {
      chrome.runtime.sendMessage({
        type: "LLM_INSTALL_PROGRESS",
        modelName: message.modelName,
        progress
      }).catch(() => {
      });
    }).then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "LOCAL_LLM_GET_MODELS") {
    getOllamaModels().then((models) => sendResponse({ success: true, models })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  MessageRouter.route(message, sender).then((response) => sendResponse({ success: true, data: response })).catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});
const OLLAMA_BASE_URL = "http://localhost:11434";
async function checkOllamaAvailability() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      const models = data.models?.map((m) => m.name) || [];
      const visionAvailable = models.some((m) => m.includes("llava") || m.includes("bakllava"));
      console.log("[LLM Bridge] Ollama available. Models:", models);
      return {
        available: true,
        models,
        visionAvailable
      };
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      console.log("[LLM Bridge] Ollama not available:", error.message);
    }
  }
  return {
    available: false,
    models: [],
    visionAvailable: false
  };
}
async function findInstalledModel(requestedModel) {
  try {
    const status = await checkOllamaAvailability();
    if (!status.available || !status.models.length) {
      return requestedModel;
    }
    if (status.models.includes(requestedModel)) {
      return requestedModel;
    }
    if (status.models.includes(`${requestedModel}:latest`)) {
      return `${requestedModel}:latest`;
    }
    const matchingModel = status.models.find(
      (m) => m.startsWith(requestedModel) || m.startsWith(`${requestedModel}:`)
    );
    if (matchingModel) {
      console.log(`[LLM Bridge] Resolved '${requestedModel}' to '${matchingModel}'`);
      return matchingModel;
    }
    console.log(`[LLM Bridge] Model '${requestedModel}' not found, using '${status.models[0]}'`);
    return status.models[0];
  } catch (error) {
    console.warn("[LLM Bridge] Error finding model:", error);
    return requestedModel;
  }
}
async function ollamaGenerate(prompt, options = {}) {
  const requestedModel = options.model || "llama3.2";
  const model = await findInstalledModel(requestedModel);
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 500
      }
    }),
    signal: AbortSignal.timeout(options.timeout || 3e4),
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Ollama request failed: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  if (options.format === "json") {
    try {
      const jsonMatch = data.response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : data.response;
      return JSON.parse(jsonStr.trim());
    } catch (e) {
      return { raw: data.response, parseError: true };
    }
  }
  return data.response;
}
async function ollamaVision(imageBase64, prompt, options = {}) {
  const requestedModel = options.model || "llava";
  const model = await findInstalledModel(requestedModel);
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      images: [imageBase64],
      stream: false,
      options: {
        temperature: options.temperature ?? 0.5,
        num_predict: options.maxTokens ?? 1e3
      }
    }),
    signal: AbortSignal.timeout(options.timeout || 6e4),
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Vision request failed: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  return data.response;
}
async function ollamaInstallModel(modelName, onProgress = null) {
  console.log(`[LLM Bridge] Installing model: ${modelName}`);
  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/x-ndjson"
      },
      body: JSON.stringify({ name: modelName }),
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
  } catch (networkError) {
    console.error("[LLM Bridge] Network error connecting to Ollama:", networkError);
    throw new Error("Cannot connect to Ollama. Make sure Ollama is running (ollama serve)");
  }
  console.log(`[LLM Bridge] Pull response status: ${response.status}`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`[LLM Bridge] Pull failed: ${response.status} - ${errorText}`);
    if (response.status === 403) {
      throw new Error(
        "CORS blocked (403). To fix, restart Ollama with:\nOLLAMA_ORIGINS=* ollama serve\n\nOr install models in terminal:\nollama pull " + modelName
      );
    }
    throw new Error(`Failed to start model download: ${response.status} - ${errorText}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lastProgressUpdate = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const progress = JSON.parse(line);
        if (progress.error) {
          throw new Error(progress.error);
        }
        const now = Date.now();
        if (onProgress && progress.total && now - lastProgressUpdate > 500) {
          lastProgressUpdate = now;
          onProgress({
            status: progress.status,
            completed: progress.completed || 0,
            total: progress.total,
            percent: Math.round(progress.completed / progress.total * 100)
          });
        }
      } catch (e) {
        if (e.message && !e.message.includes("JSON")) {
          throw e;
        }
      }
    }
  }
  console.log(`[LLM Bridge] Model ${modelName} installed successfully`);
  return true;
}
async function getOllamaModels() {
  const status = await checkOllamaAvailability();
  return status.models;
}
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
//# sourceMappingURL=service-worker.js-X00vL5ev.js.map
