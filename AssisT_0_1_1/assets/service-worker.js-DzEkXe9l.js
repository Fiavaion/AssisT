import { _ as __vitePreload } from "./preload-helper-DPb_hSpc.js";
import { hasSecureAPIKey, getSecureAPIKey } from "./secure-key-storage-C4xryL8P.js";
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
    // OCR (Optical Character Recognition)
    ocr: {
      enabled: false,
      // Default OFF - requires user activation
      autoActivateReadingMode: true,
      filterNoise: true,
      upscaleFactor: 1.5
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
async function checkGeminiAvailability() {
  try {
    if (!window.ai || !window.ai.languageModel) {
      return {
        available: false,
        status: "unavailable",
        error: "Chrome Prompt API not found. Requires Chrome 128+ with feature flag enabled."
      };
    }
    const availability = await window.ai.languageModel.availability();
    if (availability === "readily") {
      return {
        available: true,
        status: "ready"
      };
    } else if (availability === "after-download") {
      return {
        available: false,
        status: "needs-download",
        error: "Model needs to be downloaded. This happens automatically on first use."
      };
    } else {
      return {
        available: false,
        status: "not-supported",
        error: "Gemini Nano is not supported on this device or Chrome version."
      };
    }
  } catch (error) {
    console.error("[Gemini] Availability check failed:", error);
    return {
      available: false,
      status: "error",
      error: error.message || "Unknown error checking availability"
    };
  }
}
async function generateText(prompt, options = {}) {
  const availability = await checkGeminiAvailability();
  if (!availability.available) {
    throw new Error(availability.error || "Gemini Nano not available");
  }
  try {
    const session = await window.ai.languageModel.create({
      temperature: options.temperature !== void 0 ? options.temperature : 0.7,
      topK: options.topK !== void 0 ? options.topK : 40
    });
    console.log("[Gemini] Session created, generating text...");
    const result = await session.prompt(prompt);
    session.destroy();
    console.log("[Gemini] Generation successful");
    return result;
  } catch (error) {
    console.error("[Gemini] Generation failed:", error);
    throw new Error(`Gemini generation failed: ${error.message}`);
  }
}
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const CLOUD_MODELS = {
  local: {
    id: "local",
    name: "Local (Ollama)",
    description: "Offline processing with local AI",
    isLocal: true
  },
  "haiku-4.5": {
    id: "claude-haiku-4-5",
    name: "Haiku 4.5",
    description: "Fastest for quick answers",
    avgCost: 1e-3,
    // per 1K tokens (input)
    outputCost: 5e-3
  },
  "sonnet-4.5": {
    id: "claude-sonnet-4-5",
    name: "Sonnet 4.5",
    description: "Best for everyday tasks",
    avgCost: 3e-3,
    outputCost: 0.015
  },
  "opus-4.5": {
    id: "claude-opus-4-5",
    name: "Opus 4.5",
    description: "Most capable for complex work",
    avgCost: 0.015,
    outputCost: 0.075
  }
};
const FEATURE_DEFAULT_MODELS = {
  summarization: "haiku-4.5",
  textSimplification: "sonnet-4.5",
  assignmentBreakdown: "sonnet-4.5",
  citationAnalyzer: "sonnet-4.5",
  socraticTutor: "opus-4.5",
  imageUnderstanding: "sonnet-4.5",
  studyPathGenerator: "sonnet-4.5",
  multiDocCompare: "opus-4.5"
};
const DEFAULT_OPTIONS = {
  maxTokens: 1024,
  temperature: 0.7,
  timeout: 6e4,
  // 60 seconds
  maxRetries: 2
};
class ClaudeCache {
  constructor(ttl = 3e5) {
    this.cache = /* @__PURE__ */ new Map();
    this.ttl = ttl;
  }
  generateKey(prompt, model) {
    const normalized = JSON.stringify({ prompt: prompt.slice(0, 500), model });
    return btoa(unescape(encodeURIComponent(normalized))).slice(0, 64);
  }
  get(prompt, model) {
    const key = this.generateKey(prompt, model);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log("[ClaudeClient] Cache hit");
      return cached.response;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }
  set(prompt, model, response) {
    const key = this.generateKey(prompt, model);
    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });
    if (this.cache.size > 50) {
      this.cleanup();
    }
  }
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
  clear() {
    this.cache.clear();
  }
}
const cache = new ClaudeCache();
async function checkCloudAvailability() {
  const keyAvailable = await hasSecureAPIKey("anthropic");
  return {
    available: keyAvailable,
    models: keyAvailable ? CLOUD_MODELS : {},
    reason: keyAvailable ? null : "API key not configured"
  };
}
async function claudeGenerate(prompt, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const modelKey = opts.model || "sonnet-4.5";
  const modelConfig = CLOUD_MODELS[modelKey];
  if (!modelConfig) {
    throw new Error(`Unknown model: ${modelKey}`);
  }
  if (modelConfig.isLocal) {
    throw new Error("Local model requested - use Ollama client instead");
  }
  const modelId = modelConfig.id;
  if (!opts.noCache) {
    const cached = cache.get(prompt, modelId);
    if (cached) {
      return cached;
    }
  }
  const apiKey = await getSecureAPIKey("anthropic");
  if (!apiKey) {
    throw new Error(
      "Claude API key not configured. Please add your API key in Advanced Options > AI tab."
    );
  }
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store"
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `Claude API error: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    const responseTime = Date.now() - startTime;
    const content = data.content?.[0]?.text || "";
    const usage = {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    };
    const result = { content, usage };
    if (!opts.noCache) {
      cache.set(prompt, modelId, result);
    }
    console.log(
      `[ClaudeClient] ${modelKey} response: ${usage.totalTokens} tokens in ${responseTime}ms`
    );
    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("[ClaudeClient] Request timed out");
      throw new Error("Claude request timed out. Try again or use a faster model.");
    }
    if (error.message.includes("429") || error.message.includes("rate")) {
      console.warn("[ClaudeClient] Rate limited");
      throw new Error("Rate limited. Please wait a moment before trying again.");
    }
    if (opts._retryCount < opts.maxRetries && !error.message.includes("API key")) {
      console.log(`[ClaudeClient] Retrying... (${(opts._retryCount || 0) + 1}/${opts.maxRetries})`);
      return claudeGenerate(prompt, {
        ...opts,
        _retryCount: (opts._retryCount || 0) + 1
      });
    }
    throw error;
  }
}
function isValidSender(sender) {
  if (sender.id === chrome.runtime.id) {
    return true;
  }
  if (sender.tab && sender.id === chrome.runtime.id) {
    return true;
  }
  return false;
}
function validateURL(url, options = {}) {
  const { allowFile = false, allowExtension = true } = options;
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
  const dangerousProtocols = ["javascript:", "data:", "vbscript:"];
  if (dangerousProtocols.includes(parsed.protocol)) {
    return { valid: false, error: `Blocked protocol: ${parsed.protocol}` };
  }
  if (parsed.protocol === "file:") {
    if (!allowFile) {
      return { valid: false, error: "file:// URLs not allowed" };
    }
    return { valid: true };
  }
  if (parsed.protocol === "chrome-extension:") {
    if (!allowExtension) {
      return { valid: false, error: "Extension URLs not allowed" };
    }
    if (parsed.hostname !== chrome.runtime.id) {
      return { valid: false, error: "External extension URLs not allowed" };
    }
    return { valid: true };
  }
  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    const hostname = parsed.hostname.toLowerCase();
    const blockedHostnames = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"];
    if (blockedHostnames.includes(hostname)) {
      if (hostname === "localhost" && parsed.port === "11434") {
        return { valid: true };
      }
      return { valid: false, error: "Internal network URLs blocked" };
    }
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Pattern);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168) {
        return { valid: false, error: "Private network IPs blocked" };
      }
    }
    return { valid: true };
  }
  return { valid: false, error: `Unsupported protocol: ${parsed.protocol}` };
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
    try {
      const { migrateLegacyKeys, autoRotateIfNeeded } = await __vitePreload(async () => {
        const { migrateLegacyKeys: migrateLegacyKeys2, autoRotateIfNeeded: autoRotateIfNeeded2 } = await import("./secure-key-storage-C4xryL8P.js");
        return { migrateLegacyKeys: migrateLegacyKeys2, autoRotateIfNeeded: autoRotateIfNeeded2 };
      }, true ? [] : void 0);
      const stats = await migrateLegacyKeys();
      if (stats.migrated > 0) {
        console.log(`[AssisT] Migrated ${stats.migrated} credentials to encrypted storage`);
      }
      const rotationResult = await autoRotateIfNeeded();
      if (rotationResult.rotated) {
        console.log(`[AssisT] Auto-rotated ${rotationResult.keysRotated} credentials`);
      }
    } catch (err) {
      if (err.message?.includes("window") || err.message?.includes("document")) {
        console.log("[AssisT] Security module uses browser APIs - will initialize in page context");
      } else {
        console.warn("[AssisT] Security initialization skipped:", err.message);
      }
    }
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
  if (!isValidSender(sender)) {
    console.warn("[AssisT Security] Rejected message from untrusted sender:", sender);
    sendResponse({ success: false, error: "Unauthorized sender" });
    return false;
  }
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
  if (message.action === "INJECT_CONTENT_SCRIPT") {
    const tabId = message.tabId;
    console.log("[AssisT] INJECT_CONTENT_SCRIPT requested for tab:", tabId);
    const manifest = chrome.runtime.getManifest();
    let contentScriptPath = null;
    if (manifest.content_scripts && manifest.content_scripts[0]?.js?.[0]) {
      contentScriptPath = manifest.content_scripts[0].js[0];
    }
    if (!contentScriptPath) {
      console.error("[AssisT] Could not find content script path in manifest");
      sendResponse({ success: false, error: "Content script path not found" });
      return false;
    }
    console.log("[AssisT] Injecting content script:", contentScriptPath);
    chrome.scripting.executeScript({
      target: { tabId },
      files: [contentScriptPath]
    }).then(() => {
      console.log("[AssisT] ✓ Content script injected successfully");
      sendResponse({ success: true });
    }).catch((error) => {
      console.error("[AssisT] Content script injection failed:", error.message);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  if (message.action === "openTab" && message.url) {
    const validation = validateURL(message.url, { allowFile: false, allowExtension: true });
    if (!validation.valid) {
      console.warn(
        "[AssisT Security] Blocked openTab with invalid URL:",
        message.url,
        validation.error
      );
      sendResponse({ success: false, error: validation.error });
      return false;
    }
    chrome.tabs.create({
      url: message.url
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
    const validation = validateURL(message.url, { allowFile: false, allowExtension: false });
    if (!validation.valid) {
      console.warn(
        "[AssisT Security] Blocked FETCH_IMAGE with invalid URL:",
        message.url,
        validation.error
      );
      sendResponse({ success: false, error: validation.error });
      return true;
    }
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
    const validation = validateURL(message.url, { allowFile: true, allowExtension: false });
    if (!validation.valid) {
      console.warn(
        "[AssisT Security] Blocked FETCH_PDF with invalid URL:",
        message.url,
        validation.error
      );
      sendResponse({ success: false, error: validation.error });
      return true;
    }
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
  if (message.action === "LOCAL_LLM_MODE_CHANGED") {
    console.log("[AssisT] Local LLM mode changed:", message.enabled ? "enabled" : "disabled");
    sendResponse({ success: true });
    return false;
  }
  if (message.action === "CLOUD_MODE_CHANGED") {
    console.log("[AssisT] Cloud mode changed:", message.enabled ? "enabled" : "disabled");
    sendResponse({ success: true });
    return false;
  }
  if (message.action === "SET_VRAM_TIER") {
    const tier = message.tier || "8gb";
    const validTiers = ["auto", "2gb", "4gb", "8gb", "12gb", "16gb", "24gb"];
    if (validTiers.includes(tier)) {
      currentVramTier = tier;
      console.log(`[LLM Bridge] VRAM tier set to: ${tier} (default model: ${getDefaultModel()})`);
      sendResponse({ success: true, tier, defaultModel: getDefaultModel() });
    } else {
      sendResponse({ success: false, error: `Invalid tier: ${tier}` });
    }
    return true;
  }
  if (message.action === "GET_VRAM_TIER") {
    sendResponse({
      success: true,
      tier: currentVramTier,
      defaultModel: getDefaultModel(),
      fallbackModels: getTierFallbackModels()
    });
    return true;
  }
  if (message.action === "SET_MODEL_PREFERENCE") {
    const { taskType, model } = message;
    if (taskType && model) {
      userModelPreferences[taskType] = model;
      console.log(`[LLM Bridge] Model preference set: ${taskType} → ${model}`);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Missing taskType or model" });
    }
    return false;
  }
  if (message.action === "GET_MODEL_PREFERENCES") {
    sendResponse({ success: true, preferences: userModelPreferences });
    return false;
  }
  if (message.action === "LOCAL_LLM_GENERATE") {
    (async () => {
      try {
        let options = message.options || {};
        if (message.taskType || options.taskType) {
          const status = await checkOllamaAvailability();
          if (status.available && status.models.length > 0) {
            const taskType = message.taskType || options.taskType;
            const routing = getOptimalModelForTask(taskType, options.level, status.models);
            options = { ...options, model: routing.model };
            console.log(`[LLM Generate] Task "${taskType}" → ${routing.model} (${routing.reason})`);
          }
        }
        const result = await ollamaGenerate(message.prompt, options);
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  if (message.action === "LOCAL_LLM_TASK_GENERATE") {
    (async () => {
      try {
        const status = await checkOllamaAvailability();
        if (!status.available) {
          return sendResponse({ success: false, error: "Ollama not available" });
        }
        const taskType = message.taskType || "default";
        const level = message.level || null;
        const routing = getOptimalModelForTask(taskType, level, status.models);
        console.log(`[LLM Routing] Task "${taskType}" (${level || "default"}) → ${routing.model}`);
        console.log(`[LLM Routing] Reason: ${routing.reason}`);
        const result = await ollamaGenerate(message.prompt, {
          ...message.options,
          model: routing.model
        });
        sendResponse({
          success: true,
          data: result,
          routing: {
            model: routing.model,
            reason: routing.reason,
            matched: routing.matched
          }
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
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
  if (message.action === "CLOUD_LLM_CHECK") {
    checkCloudAvailability().then((status) => sendResponse({ success: true, ...status })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "CLOUD_LLM_GENERATE") {
    claudeGenerate(message.prompt, message.options || {}).then(
      (result) => sendResponse({
        success: true,
        data: result.content,
        usage: result.usage
      })
    ).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "CLOUD_LLM_GET_MODELS") {
    sendResponse({
      success: true,
      models: CLOUD_MODELS,
      featureDefaults: FEATURE_DEFAULT_MODELS
    });
    return false;
  }
  if (message.action === "BENCHMARK_RUN_TEST") {
    runBenchmarkTest(message).then((result) => sendResponse(result)).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "GEMINI_LLM_CHECK") {
    checkGeminiAvailability().then((availability) => {
      sendResponse({ success: true, ...availability });
    }).catch((error) => {
      sendResponse({
        success: false,
        available: false,
        status: "error",
        error: error.message
      });
    });
    return true;
  }
  if (message.action === "GEMINI_LLM_REQUEST") {
    const { prompt, options } = message;
    if (!prompt) {
      sendResponse({ success: false, error: "Prompt is required" });
      return false;
    }
    console.log("[Gemini] Generation request received, prompt length:", prompt.length);
    generateText(prompt, options || {}).then((text) => {
      console.log("[Gemini] Generation complete, response length:", text.length);
      sendResponse({ success: true, text });
    }).catch((error) => {
      console.error("[Gemini] Generation error:", error);
      sendResponse({ success: false, error: error.message });
    });
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
    const tierFallback = getTierFallbackModels();
    console.log(`[LLM Bridge] Using ${currentVramTier} tier fallback models:`, tierFallback);
    for (const fallback of tierFallback) {
      const fallbackMatch = status.models.find(
        (m) => m === fallback || m.startsWith(`${fallback}:`) || m.startsWith(fallback)
      );
      if (fallbackMatch) {
        console.log(
          `[LLM Bridge] Model '${requestedModel}' not found, using fallback '${fallbackMatch}'`
        );
        return fallbackMatch;
      }
    }
    console.log(`[LLM Bridge] No preferred model found, using '${status.models[0]}'`);
    return status.models[0];
  } catch (error) {
    console.warn("[LLM Bridge] Error finding model:", error);
    return requestedModel;
  }
}
const MODEL_OPTIMIZATION_PROFILES = {
  // Gemma 3 4B - Optimized for structured output
  "gemma3:4b": {
    num_ctx: 4096,
    // Reduced from 8k default for speed
    temperature: 0.7,
    // Google's recommended range
    top_k: 40,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ["formatting", "structure", "definitions"]
  },
  gemma3: {
    num_ctx: 4096,
    temperature: 0.7,
    top_k: 40,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ["formatting", "structure", "definitions"]
  },
  // Mistral 7B - Optimized for reasoning (was slow due to 32k default context)
  "mistral:7b-instruct": {
    num_ctx: 4096,
    // Critical: reduced from 32k default
    temperature: 0.4,
    // Lower for educational content
    top_p: 0.9,
    repeat_penalty: 1.15,
    // Slight increase for less repetition
    strengths: ["reasoning", "pedagogy", "analysis"]
  },
  "mistral:7b": {
    num_ctx: 4096,
    temperature: 0.4,
    top_p: 0.9,
    repeat_penalty: 1.15,
    strengths: ["reasoning", "pedagogy", "analysis"]
  },
  // Llama 3.2 - Optimized for speed
  "llama3.2": {
    num_ctx: 2048,
    // Minimal context for max speed
    temperature: 0.6,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ["speed", "simple-text", "summarization"]
  },
  "llama3.2:3b": {
    num_ctx: 2048,
    temperature: 0.6,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ["speed", "simple-text", "summarization"]
  },
  // Phi3 Mini - Balance of quality and speed
  "phi3:mini": {
    num_ctx: 2048,
    // Reduced for speed
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ["general", "fallback"]
  },
  // Qwen 2.5 7B - Good for academic text
  "qwen2.5:7b": {
    num_ctx: 4096,
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ["academic", "multilingual"]
  },
  // Default fallback profile
  default: {
    num_ctx: 4096,
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: []
  }
};
const TASK_OPTIMAL_MODELS = {
  // Speed-critical tasks → smaller, faster models
  summarization: {
    priority: ["llama3.2", "llama3.2:3b", "phi3:mini", "gemma3:4b"],
    reason: "Summarization benefits from fast inference; quality differences minimal"
  },
  // Formatting tasks → Gemma excels at structured output
  assignmentBreakdown: {
    priority: ["gemma3:4b", "gemma3", "mistral:7b-instruct", "qwen2.5:7b"],
    reason: "Gemma produces better structured, formatted output"
  },
  textSimplification: {
    basic: {
      priority: ["llama3.2", "phi3:mini", "gemma3:4b"],
      reason: "Basic simplification needs speed over complexity"
    },
    moderate: {
      priority: ["gemma3:4b", "mistral:7b-instruct", "qwen2.5:7b"],
      reason: "Moderate simplification needs balanced capability"
    },
    academic: {
      priority: ["mistral:7b-instruct", "qwen2.5:7b", "gemma3:4b"],
      reason: "Academic simplification needs reasoning + vocabulary"
    }
  },
  // Reasoning-heavy tasks → Mistral excels
  socraticTutor: {
    priority: ["mistral:7b-instruct", "mistral:7b", "qwen2.5:7b", "gemma3:4b"],
    reason: "Socratic questioning requires strong reasoning/pedagogy"
  },
  citationAnalyzer: {
    priority: ["mistral:7b-instruct", "qwen2.5:7b", "gemma3:4b", "llama3.2"],
    reason: "Citation analysis requires analytical reasoning"
  },
  // Default fallback
  default: {
    priority: ["gemma3:4b", "mistral:7b-instruct", "llama3.2", "phi3:mini"],
    reason: "Balanced default for unknown tasks"
  }
};
const TASK_TO_PREFERENCE_CATEGORY = {
  // General tasks
  summarization: "general",
  multiDocCompare: "general",
  emotionalTTS: "general",
  // Academic tasks
  textSimplification: "academic",
  socraticTutor: "academic",
  assignmentBreakdown: "academic",
  knowledgeGraph: "academic",
  citationAnalyzer: "academic",
  studyPathGenerator: "academic",
  // Vision tasks
  imageUnderstanding: "vision",
  // Code tasks
  codeAnalysis: "code",
  codeGeneration: "code",
  // Default fallback
  default: "general"
};
function getOptimalModelForTask(taskType, level = null, availableModels = []) {
  const prefCategory = TASK_TO_PREFERENCE_CATEGORY[taskType] || "general";
  const userPref = userModelPreferences[prefCategory];
  if (userPref && userPref !== "auto" && availableModels.length > 0) {
    const userMatch = availableModels.find(
      (m) => m === userPref || m.startsWith(`${userPref}:`) || m.startsWith(userPref)
    );
    if (userMatch) {
      console.log(`[LLM Routing] Using user preference: ${prefCategory} → ${userMatch}`);
      return {
        model: userMatch,
        reason: `User preference for ${prefCategory} tasks`,
        matched: true,
        userPreference: true
      };
    }
  }
  let taskConfig = TASK_OPTIMAL_MODELS[taskType];
  if (taskConfig && level && taskConfig[level]) {
    taskConfig = taskConfig[level];
  }
  if (!taskConfig || !taskConfig.priority) {
    taskConfig = TASK_OPTIMAL_MODELS.default;
  }
  if (!availableModels.length) {
    return {
      model: taskConfig.priority[0],
      reason: taskConfig.reason,
      matched: false
    };
  }
  for (const preferredModel of taskConfig.priority) {
    const match = availableModels.find(
      (m) => m === preferredModel || m.startsWith(`${preferredModel}:`) || m.startsWith(preferredModel)
    );
    if (match) {
      return {
        model: match,
        reason: taskConfig.reason,
        matched: true
      };
    }
  }
  return {
    model: availableModels[0],
    reason: "No optimal model available, using fallback",
    matched: false
  };
}
function getModelProfile(model) {
  if (MODEL_OPTIMIZATION_PROFILES[model]) {
    return MODEL_OPTIMIZATION_PROFILES[model];
  }
  for (const [key, profile] of Object.entries(MODEL_OPTIMIZATION_PROFILES)) {
    if (model.startsWith(key)) {
      return profile;
    }
  }
  return MODEL_OPTIMIZATION_PROFILES["default"];
}
let currentVramTier = "8gb";
let userModelPreferences = {
  general: "auto",
  academic: "auto",
  vision: "auto",
  code: "auto"
};
chrome.storage.local.get("modelPreferences", (result) => {
  if (result.modelPreferences) {
    userModelPreferences = { ...userModelPreferences, ...result.modelPreferences };
    console.log("[LLM Bridge] Loaded model preferences:", userModelPreferences);
  }
});
const VRAM_TIER_MODELS = {
  auto: {
    default: "mistral:7b-instruct",
    fallback: ["mistral:7b-instruct", "qwen2.5:7b", "gemma3:4b", "llama3.2:3b", "phi3:mini"]
  },
  "2gb": {
    default: "phi3:mini",
    fallback: ["phi3:mini", "llama3.2", "llama3.2:1b", "tinyllama"]
  },
  "4gb": {
    default: "gemma3:4b",
    fallback: ["gemma3:4b", "qwen3:4b", "llama3.2:3b", "llama3.2", "phi3:mini"]
  },
  "8gb": {
    default: "mistral:7b-instruct",
    fallback: ["mistral:7b-instruct", "mistral:7b", "qwen2.5:7b", "gemma3:4b", "llama3.2:3b"]
  },
  "12gb": {
    default: "llama3.1:8b",
    fallback: ["llama3.1:8b", "mixtral:8x7b", "mistral:7b-instruct", "qwen2.5:7b"]
  },
  "16gb": {
    default: "qwen2.5:14b",
    fallback: ["qwen2.5:14b", "llama3.1:70b-q4", "llama3.1:8b", "mixtral:8x7b"]
  },
  "24gb": {
    default: "llama3.1:70b",
    fallback: ["llama3.1:70b", "mixtral:8x22b", "qwen2.5:14b", "llama3.1:8b"]
  }
};
function getDefaultModel() {
  const tierConfig = VRAM_TIER_MODELS[currentVramTier] || VRAM_TIER_MODELS["8gb"];
  return tierConfig.default;
}
function getTierFallbackModels() {
  const tierConfig = VRAM_TIER_MODELS[currentVramTier] || VRAM_TIER_MODELS["8gb"];
  return tierConfig.fallback;
}
const BENCHMARK_PROMPTS = {
  textSimplification: (text, level) => {
    const prompts = {
      basic: `Simplify this text for someone with reading difficulties. Use very simple words and short sentences:

${text}

Simplified version:`,
      moderate: `Simplify this academic text while keeping important terms. Add brief definitions in parentheses for difficult words:

${text}

Simplified version:`,
      academic: `Improve the readability of this academic text while preserving scholarly vocabulary. Add definitions for complex terms:

${text}

Improved version:`
    };
    return prompts[level] || prompts.moderate;
  },
  summarization: (text, level) => {
    const prompts = {
      brief: `Summarize this text in 1-2 sentences:

${text}

Summary:`,
      moderate: `Provide a clear summary of this text in 3-4 sentences, capturing the main points:

${text}

Summary:`,
      detailed: `Provide a comprehensive summary of this text, including key details and supporting points:

${text}

Detailed summary:`
    };
    return prompts[level] || prompts.brief;
  },
  socraticTutor: (text) => `You are a Socratic tutor. Generate 3-4 thought-provoking questions to help a student understand this text deeply. Focus on comprehension, analysis, and critical thinking:

${text}

Questions:`,
  assignmentBreakdown: (text) => `Break down this assignment into clear, actionable steps. Include estimated time for each step and key requirements:

${text}

Breakdown:`,
  citationAnalyzer: (text) => `Analyze this text or source for credibility. Assess: source type, potential bias, key claims, and reliability. Provide a credibility score (1-10):

${text}

Analysis:`
};
async function runBenchmarkTest(params) {
  const { feature, model, isCloud, text, level } = params;
  const promptBuilder = BENCHMARK_PROMPTS[feature];
  if (!promptBuilder) {
    return { success: false, error: `Unknown feature: ${feature}` };
  }
  const prompt = typeof promptBuilder === "function" ? level ? promptBuilder(text, level) : promptBuilder(text) : promptBuilder;
  const maxTokens = feature === "summarization" ? 300 : 600;
  try {
    let result;
    if (isCloud) {
      result = await claudeGenerate(prompt, {
        model,
        maxTokens,
        temperature: 0.3
      });
      return {
        success: true,
        data: result.content,
        tokens: result.usage?.output_tokens || 0,
        model,
        isCloud: true
      };
    } else {
      const profile = getModelProfile(model);
      console.log(`[Benchmark] Using optimized profile for ${model}:`, {
        num_ctx: profile.num_ctx,
        temperature: profile.temperature
      });
      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            num_ctx: profile.num_ctx,
            // Key optimization
            num_predict: maxTokens,
            temperature: profile.temperature,
            top_p: profile.top_p,
            top_k: profile.top_k,
            repeat_penalty: profile.repeat_penalty
          }
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      return {
        success: true,
        data: data.response,
        tokens: data.eval_count || 0,
        model,
        isCloud: false,
        evalDuration: data.eval_duration,
        totalDuration: data.total_duration
      };
    }
  } catch (error) {
    console.error("[Benchmark] Test failed:", error);
    return {
      success: false,
      error: error.message,
      model,
      isCloud
    };
  }
}
async function ollamaGenerate(prompt, options = {}) {
  const requestedModel = options.model || getDefaultModel();
  const model = await findInstalledModel(requestedModel);
  const profile = getModelProfile(model);
  console.log(`[LLM Bridge] Using profile for ${model}:`, {
    num_ctx: profile.num_ctx,
    temperature: options.temperature ?? profile.temperature
  });
  console.log(`[LLM Bridge] Sending request to Ollama...`);
  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          // Core optimization: reduced context window for speed
          num_ctx: options.num_ctx ?? profile.num_ctx,
          // Model-specific temperature (can be overridden)
          temperature: options.temperature ?? profile.temperature,
          // Token prediction limit
          num_predict: options.maxTokens ?? 500,
          // Additional optimizations from profile
          top_p: profile.top_p,
          top_k: profile.top_k,
          repeat_penalty: profile.repeat_penalty
        }
      }),
      signal: AbortSignal.timeout(options.timeout || 3e4)
    });
  } catch (fetchError) {
    console.error(`[LLM Bridge] Fetch error:`, fetchError.message);
    throw fetchError;
  }
  console.log(`[LLM Bridge] Response status: ${response.status}`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`[LLM Bridge] Request failed: ${response.status} ${errorText}`);
    throw new Error(`Ollama request failed: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  console.log(`[LLM Bridge] Response received, length: ${data.response?.length || 0} chars`);
  if (options.format === "json") {
    try {
      const jsonMatch = data.response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : data.response;
      return JSON.parse(jsonStr.trim());
    } catch {
      return { raw: data.response, parseError: true };
    }
  }
  if (!data.response || data.response.trim().length === 0) {
    console.warn("[LLM Bridge] Ollama returned empty response");
    throw new Error("Model produced no output - prompt may be unclear or model may be overloaded");
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
        Accept: "application/x-ndjson"
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
    if (done) {
      break;
    }
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
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:"))) {
      return;
    }
    console.log("[AssisT] Tab activated:", tab.id);
  } catch (error) {
    console.log("[AssisT] Tab activation error:", error.message);
  }
});
const LMS_DOMAINS = [
  "instructure.com",
  "canvas.com",
  "moodle.org",
  "moodlecloud.com",
  "classroom.google.com",
  "docs.google.com"
];
function isLmsSite(url) {
  if (!url) {
    return false;
  }
  return LMS_DOMAINS.some((domain) => url.includes(domain));
}
function isSystemPage(url) {
  if (!url) {
    return true;
  }
  return url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("edge://") || url.startsWith("about:") || // file:// URLs are allowed if user enables "Allow access to file URLs" in chrome://extensions
  url.startsWith("devtools://");
}
async function maybeInjectContentScript(tabId, url) {
  if (isSystemPage(url)) {
    return;
  }
  if (isLmsSite(url)) {
    return;
  }
  let hasAllUrls = false;
  try {
    hasAllUrls = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  } catch {
    return;
  }
  if (!hasAllUrls) {
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (response?.loaded || response?.success) {
      console.log("[AssisT] Content script already loaded in tab:", tabId);
      return;
    }
  } catch {
  }
  const manifest = chrome.runtime.getManifest();
  const contentScriptPath = manifest.content_scripts?.[0]?.js?.[0];
  if (!contentScriptPath) {
    console.error("[AssisT] Could not find content script path in manifest");
    return;
  }
  try {
    console.log("[AssisT] Auto-injecting content script into tab:", tabId, "URL:", url);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [contentScriptPath]
    });
    console.log("[AssisT] ✓ Content script auto-injected successfully");
  } catch (error) {
    console.log("[AssisT] Content script injection failed:", error.message);
  }
}
const injectionQueue = /* @__PURE__ */ new Set();
const injectionTimers = /* @__PURE__ */ new Map();
const DEBOUNCE_MS = 100;
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }
  if (injectionQueue.has(tabId)) {
    console.log("[AssisT] Tab", tabId, "already queued for injection, skipping");
    return;
  }
  injectionQueue.add(tabId);
  if (injectionTimers.has(tabId)) {
    clearTimeout(injectionTimers.get(tabId));
  }
  const timer = setTimeout(async () => {
    try {
      await maybeInjectContentScript(tabId, tab.url);
    } finally {
      injectionQueue.delete(tabId);
      injectionTimers.delete(tabId);
    }
  }, DEBOUNCE_MS);
  injectionTimers.set(tabId, timer);
});
chrome.action.onClicked.addListener(async (tab) => {
  console.log("[AssisT] Extension icon clicked on tab:", tab.id);
  chrome.tabs.sendMessage(tab.id, {
    type: "TOGGLE_ASSIST_PANEL"
  });
});
chrome.permissions.onAdded.addListener(async (permissions) => {
  console.log("[AssisT] Permissions added:", permissions);
  if (permissions.origins?.includes("<all_urls>")) {
    console.log("[AssisT] ✓ All-sites permission granted - injecting content scripts");
    try {
      const allTabs = await chrome.tabs.query({});
      const activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const manifest = chrome.runtime.getManifest();
      const contentScriptPath = manifest.content_scripts?.[0]?.js?.[0];
      if (!contentScriptPath) {
        console.error("[AssisT] Content script path not found in manifest");
        return;
      }
      const eligibleTabs = allTabs.filter(
        (tab) => tab.id && tab.url && !isSystemPage(tab.url) && !isLmsSite(tab.url)
      );
      console.log(
        `[AssisT] Injecting content script into ${eligibleTabs.length} eligible tabs (${allTabs.length} total)`
      );
      const CHUNK_SIZE = 10;
      let successCount = 0;
      let failCount = 0;
      for (let i = 0; i < eligibleTabs.length; i += CHUNK_SIZE) {
        const chunk = eligibleTabs.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(
            (tab) => chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [contentScriptPath]
            }).then(() => {
              successCount++;
              console.log("[AssisT] ✓ Content script injected into tab:", tab.id);
            }).catch((err) => {
              failCount++;
              console.log("[AssisT] Could not inject into tab", tab.id, ":", err.message);
            })
          )
        );
      }
      console.log(`[AssisT] Injection complete: ${successCount} success, ${failCount} failed`);
      if (activeTab?.id) {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            const existing = document.getElementById("assist-permission-toast");
            if (existing) {
              existing.remove();
            }
            const toast = document.createElement("div");
            toast.id = "assist-permission-toast";
            toast.innerHTML = `
              <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                padding: 32px 48px;
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                z-index: 2147483647;
                text-align: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: assistToastIn 0.3s ease-out;
              ">
                <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                <div style="font-size: 24px; font-weight: bold; margin-bottom: 12px;">Permission Granted!</div>
                <div style="font-size: 18px; opacity: 0.95;">AssisT is now ready on all websites</div>
              </div>
              <div id="assist-permission-toast-backdrop" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2147483646;
                cursor: pointer;
              "></div>
              <style>
                @keyframes assistToastIn {
                  from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
                  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
              </style>
            `;
            document.body.appendChild(toast);
            const backdrop = document.getElementById("assist-permission-toast-backdrop");
            if (backdrop) {
              backdrop.addEventListener("click", () => {
                const t = document.getElementById("assist-permission-toast");
                if (t) {
                  t.remove();
                }
              });
            }
            setTimeout(() => {
              const t = document.getElementById("assist-permission-toast");
              if (t) {
                t.remove();
              }
            }, 3e3);
          }
        });
        console.log("[AssisT] ✓ Permission toast shown");
      }
    } catch (error) {
      console.log("[AssisT] Permission handler error:", error.message);
    }
  }
});
chrome.permissions.onRemoved.addListener((permissions) => {
  console.log("[AssisT] Permissions removed:", permissions);
});
console.log("[AssisT] Background service worker initialized");
//# sourceMappingURL=service-worker.js-DzEkXe9l.js.map
