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
const OBFUSCATION_KEY = "ASSIST_FOCUS_GROUP_2025";
const ENCRYPTED_KEY = "Mjh+KD0gcic/KmVgcjQRKQEzCnNbWnAqKjUhHh8ZAXsqZDEMEBgrZglrQ2BHZzMnYxEpYGYOeBkvOCUIPGIkEQ1GSlRNDAFgGBYfAAF7JBYQKT8mGwwUEnNEewMZJgARAGwea343Gj0sMBMO";
async function getDecryptedApiKey() {
  try {
    const encrypted = atob(ENCRYPTED_KEY);
    let decrypted = "";
    for (let i = 0; i < encrypted.length; i++) {
      decrypted += String.fromCharCode(
        encrypted.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
      );
    }
    return decrypted;
  } catch (error) {
    console.error("[KeyManager] Failed to decrypt API key:", error);
    return null;
  }
}
async function hasApiKey() {
  const key = await getDecryptedApiKey();
  return key !== null && key.startsWith("sk-");
}
function isValidKeyFormat(key) {
  return typeof key === "string" && key.startsWith("sk-") && key.length > 20;
}
function encryptApiKey(plainKey) {
  if (!isValidKeyFormat(plainKey)) {
    console.error('[KeyManager] Invalid API key format. Must start with "sk-"');
    return null;
  }
  let encrypted = "";
  for (let i = 0; i < plainKey.length; i++) {
    encrypted += String.fromCharCode(
      plainKey.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
    );
  }
  const result = btoa(encrypted);
  console.log("[KeyManager] Encrypted key generated. Replace ENCRYPTED_KEY with:");
  console.log(result);
  return result;
}
if (typeof window !== "undefined") {
  window.assistEncryptApiKey = encryptApiKey;
}
const USAGE_STORAGE_KEY = "assist_cloud_usage";
const SESSION_KEY = "assist_session_id";
const MAX_ENTRIES = 1e3;
async function getSessionId() {
  try {
    const result = await chrome.storage.local.get(SESSION_KEY);
    if (result[SESSION_KEY]) {
      return result[SESSION_KEY];
    }
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await chrome.storage.local.set({ [SESSION_KEY]: sessionId });
    return sessionId;
  } catch (error) {
    console.warn("[UsageTracker] Failed to get session ID:", error);
    return `fallback_${Date.now()}`;
  }
}
async function trackUsage(usageData) {
  try {
    const sessionId = await getSessionId();
    const result = await chrome.storage.local.get(USAGE_STORAGE_KEY);
    const usage = result[USAGE_STORAGE_KEY] || [];
    usage.push({
      ...usageData,
      sessionId,
      id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    });
    const trimmed = usage.slice(-MAX_ENTRIES);
    await chrome.storage.local.set({ [USAGE_STORAGE_KEY]: trimmed });
    console.log(`[UsageTracker] Tracked: ${usageData.feature} - ${usageData.inputTokens + usageData.outputTokens} tokens`);
  } catch (error) {
    console.error("[UsageTracker] Failed to track usage:", error);
  }
}
async function getRawUsage() {
  try {
    const result = await chrome.storage.local.get(USAGE_STORAGE_KEY);
    return result[USAGE_STORAGE_KEY] || [];
  } catch (error) {
    console.error("[UsageTracker] Failed to get raw usage:", error);
    return [];
  }
}
async function getUsageStats() {
  const usage = await getRawUsage();
  if (usage.length === 0) {
    return {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      averageInputTokens: 0,
      averageOutputTokens: 0,
      averageResponseTime: 0,
      byFeature: {},
      byModel: {},
      bySession: {},
      firstRequest: null,
      lastRequest: null,
      rawData: []
    };
  }
  const byFeature = {};
  const byModel = {};
  const bySession = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalResponseTime = 0;
  for (const entry of usage) {
    totalInput += entry.inputTokens || 0;
    totalOutput += entry.outputTokens || 0;
    totalResponseTime += entry.responseTime || 0;
    const feature = entry.feature || "unknown";
    if (!byFeature[feature]) {
      byFeature[feature] = { input: 0, output: 0, count: 0, totalTime: 0 };
    }
    byFeature[feature].input += entry.inputTokens || 0;
    byFeature[feature].output += entry.outputTokens || 0;
    byFeature[feature].count++;
    byFeature[feature].totalTime += entry.responseTime || 0;
    const modelKey = entry.modelKey || entry.model || "unknown";
    if (!byModel[modelKey]) {
      byModel[modelKey] = { input: 0, output: 0, count: 0, totalTime: 0 };
    }
    byModel[modelKey].input += entry.inputTokens || 0;
    byModel[modelKey].output += entry.outputTokens || 0;
    byModel[modelKey].count++;
    byModel[modelKey].totalTime += entry.responseTime || 0;
    const session = entry.sessionId || "unknown";
    if (!bySession[session]) {
      bySession[session] = { input: 0, output: 0, count: 0, firstRequest: entry.timestamp };
    }
    bySession[session].input += entry.inputTokens || 0;
    bySession[session].output += entry.outputTokens || 0;
    bySession[session].count++;
    bySession[session].lastRequest = entry.timestamp;
  }
  for (const key of Object.keys(byFeature)) {
    byFeature[key].avgInput = Math.round(byFeature[key].input / byFeature[key].count);
    byFeature[key].avgOutput = Math.round(byFeature[key].output / byFeature[key].count);
    byFeature[key].avgTime = Math.round(byFeature[key].totalTime / byFeature[key].count);
  }
  for (const key of Object.keys(byModel)) {
    byModel[key].avgInput = Math.round(byModel[key].input / byModel[key].count);
    byModel[key].avgOutput = Math.round(byModel[key].output / byModel[key].count);
    byModel[key].avgTime = Math.round(byModel[key].totalTime / byModel[key].count);
  }
  const sorted = [...usage].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return {
    totalRequests: usage.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    averageInputTokens: Math.round(totalInput / usage.length),
    averageOutputTokens: Math.round(totalOutput / usage.length),
    averageResponseTime: Math.round(totalResponseTime / usage.length),
    byFeature,
    byModel,
    bySession,
    sessionCount: Object.keys(bySession).length,
    firstRequest: sorted[0]?.timestamp || null,
    lastRequest: sorted[sorted.length - 1]?.timestamp || null,
    rawData: usage
  };
}
async function exportUsageData() {
  const stats = await getUsageStats();
  const exportData = {
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    summary: {
      totalRequests: stats.totalRequests,
      totalTokens: stats.totalTokens,
      totalInputTokens: stats.totalInputTokens,
      totalOutputTokens: stats.totalOutputTokens,
      averageInputTokens: stats.averageInputTokens,
      averageOutputTokens: stats.averageOutputTokens,
      averageResponseTime: stats.averageResponseTime,
      sessionCount: stats.sessionCount,
      dateRange: {
        first: stats.firstRequest ? new Date(stats.firstRequest).toISOString() : null,
        last: stats.lastRequest ? new Date(stats.lastRequest).toISOString() : null
      }
    },
    byFeature: stats.byFeature,
    byModel: stats.byModel,
    bySession: stats.bySession,
    rawData: stats.rawData
  };
  return JSON.stringify(exportData, null, 2);
}
async function exportUsageCSV() {
  const usage = await getRawUsage();
  const headers = [
    "timestamp",
    "datetime",
    "sessionId",
    "feature",
    "model",
    "modelKey",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "responseTime",
    "promptLength"
  ];
  const rows = usage.map((entry) => [
    entry.timestamp || "",
    entry.timestamp ? new Date(entry.timestamp).toISOString() : "",
    entry.sessionId || "",
    entry.feature || "",
    entry.model || "",
    entry.modelKey || "",
    entry.inputTokens || 0,
    entry.outputTokens || 0,
    (entry.inputTokens || 0) + (entry.outputTokens || 0),
    entry.responseTime || "",
    entry.promptLength || ""
  ]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map(
      (cell) => typeof cell === "string" && cell.includes(",") ? `"${cell}"` : cell
    ).join(","))
  ].join("\n");
  return csv;
}
async function clearUsageData() {
  try {
    await chrome.storage.local.remove([USAGE_STORAGE_KEY, SESSION_KEY]);
    console.log("[UsageTracker] Usage data cleared");
  } catch (error) {
    console.error("[UsageTracker] Failed to clear usage data:", error);
  }
}
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const CLOUD_MODELS = {
  "local": {
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
  "summarization": "haiku-4.5",
  "textSimplification": "sonnet-4.5",
  "assignmentBreakdown": "sonnet-4.5",
  "citationAnalyzer": "sonnet-4.5",
  "socraticTutor": "opus-4.5",
  "imageUnderstanding": "sonnet-4.5",
  "studyPathGenerator": "sonnet-4.5",
  "multiDocCompare": "opus-4.5"
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
  const keyAvailable = await hasApiKey();
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
  const apiKey = await getDecryptedApiKey();
  if (!apiKey) {
    throw new Error("Claude API key not configured");
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
        messages: [
          { role: "user", content: prompt }
        ]
      }),
      signal: controller.signal
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
    await trackUsage({
      model: modelId,
      modelKey,
      feature: opts.feature || "unknown",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      responseTime,
      promptLength: prompt.length,
      timestamp: Date.now()
    });
    const result = { content, usage };
    if (!opts.noCache) {
      cache.set(prompt, modelId, result);
    }
    console.log(`[ClaudeClient] ${modelKey} response: ${usage.totalTokens} tokens in ${responseTime}ms`);
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
  if (message.action === "LOCAL_LLM_GENERATE") {
    ollamaGenerate(message.prompt, message.options || {}).then((result) => sendResponse({ success: true, data: result })).catch((error) => sendResponse({ success: false, error: error.message }));
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
    claudeGenerate(message.prompt, message.options || {}).then((result) => sendResponse({
      success: true,
      data: result.content,
      usage: result.usage
    })).catch((error) => sendResponse({ success: false, error: error.message }));
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
  if (message.action === "GET_USAGE_STATS") {
    getUsageStats().then((stats) => sendResponse({ success: true, data: stats })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "EXPORT_USAGE_JSON") {
    exportUsageData().then((data) => sendResponse({ success: true, data })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "EXPORT_USAGE_CSV") {
    exportUsageCSV().then((data) => sendResponse({ success: true, data })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "CLEAR_USAGE_DATA") {
    clearUsageData().then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "BENCHMARK_RUN_TEST") {
    runBenchmarkTest(message).then((result) => sendResponse(result)).catch((error) => sendResponse({ success: false, error: error.message }));
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
        console.log(`[LLM Bridge] Model '${requestedModel}' not found, using fallback '${fallbackMatch}'`);
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
  "gemma3": {
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
  "default": {
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
function getOptimalModelForTask(taskType, level = null, availableModels = []) {
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
const VRAM_TIER_MODELS = {
  "auto": {
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
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
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
//# sourceMappingURL=service-worker.js-Bppcdoa1.js.map
