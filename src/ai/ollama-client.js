/**
 * Enhanced Ollama Client for AssisT LLM Edition
 *
 * Provides comprehensive local LLM integration with:
 * - Multi-model support (phi-3, llama3.2, mistral, llava)
 * - Automatic availability detection
 * - Response caching for performance
 * - Graceful fallback handling
 * - Vision model support (optional one-click install)
 *
 * @module ai/ollama-client
 */

// Model configurations — sourced from model-registry.js (single source of truth)
import { REGISTRY } from './model-registry.js';

const MODEL_CONFIGS = REGISTRY.ollama.models;

// Default configuration
const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:11434',
  defaultModel: 'llama3.2',
  fastModel: 'phi3:mini',
  visionModel: 'llava',
  timeout: 30000,
  maxRetries: 2,
  cacheEnabled: true,
  cacheTTL: 300000, // 5 minutes
};

/**
 * Response cache for performance optimization
 */
class ResponseCache {
  constructor(ttl = 300000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  /**
   * Generate cache key from prompt and options
   */
  generateKey(prompt, options) {
    const normalized = JSON.stringify({ prompt: prompt.trim(), model: options.model });
    return btoa(normalized).slice(0, 64);
  }

  /**
   * Get cached response if valid
   */
  get(prompt, options) {
    const key = this.generateKey(prompt, options);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log('[OllamaClient] Cache hit');
      return cached.response;
    }

    if (cached) {
      this.cache.delete(key); // Expired
    }
    return null;
  }

  /**
   * Store response in cache
   */
  set(prompt, options, response) {
    const key = this.generateKey(prompt, options);
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
    });

    // Cleanup old entries if cache is large
    if (this.cache.size > 100) {
      this.cleanup();
    }
  }

  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }
}

/**
 * Enhanced Ollama Client
 */
export class OllamaClient {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isAvailable = false;
    this.availableModels = [];
    this.visionAvailable = false;
    this.lastCheck = 0;
    this.checkInterval = 30000; // Re-check availability every 30s
    this.cache = new ResponseCache(this.config.cacheTTL);
    this.pendingRequests = new Map();
  }

  /**
   * Check if Ollama is running and get available models
   * @returns {Promise<{available: boolean, models: string[], visionAvailable: boolean}>}
   */
  async checkAvailability() {
    // Don't re-check too frequently
    if (Date.now() - this.lastCheck < this.checkInterval && this.lastCheck > 0) {
      return {
        available: this.isAvailable,
        models: this.availableModels,
        visionAvailable: this.visionAvailable,
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        this.availableModels = data.models?.map(m => m.name) || [];
        this.isAvailable = true;
        this.visionAvailable = this.availableModels.some(
          m => m.includes('llava') || m.includes('bakllava')
        );
        this.lastCheck = Date.now();

        console.log('[OllamaClient] Connected. Models:', this.availableModels);

        return {
          available: true,
          models: this.availableModels,
          visionAvailable: this.visionAvailable,
        };
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('[OllamaClient] Not available:', error.message);
      }
    }

    this.isAvailable = false;
    this.availableModels = [];
    this.visionAvailable = false;
    this.lastCheck = Date.now();

    return {
      available: false,
      models: [],
      visionAvailable: false,
    };
  }

  /**
   * Get the best available model for a task type
   * @param {string} taskType - Type of task (fast, balanced, vision, etc.)
   * @returns {string} Model name to use
   */
  getBestModelForTask(taskType) {
    const modelPreferences = {
      fast: ['phi3:mini', 'phi3', 'llama3.2:latest'],
      balanced: ['llama3.2', 'llama3.2:latest', 'mistral', 'mistral:latest'],
      detailed: ['mistral', 'mistral:latest', 'llama3.2', 'llama3.2:latest'],
      vision: ['llava', 'llava:latest', 'bakllava'],
    };

    const preferences = modelPreferences[taskType] || modelPreferences['balanced'];

    for (const pref of preferences) {
      const match = this.availableModels.find(m => m === pref || m.startsWith(pref.split(':')[0]));
      if (match) {
        return match;
      }
    }

    // Fallback to first available model
    return this.availableModels[0] || this.config.defaultModel;
  }

  /**
   * Generate text completion from Ollama
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Generation options
   * @returns {Promise<string|Object>}
   */
  async generate(prompt, options = {}) {
    // Check availability first
    if (!this.isAvailable) {
      const status = await this.checkAvailability();
      if (!status.available) {
        return this._handleUnavailable(prompt, options);
      }
    }

    // Check cache
    if (this.config.cacheEnabled && !options.noCache) {
      const cached = this.cache.get(prompt, options);
      if (cached) {
        return cached;
      }
    }

    // Deduplicate identical concurrent requests
    const requestKey = JSON.stringify({ prompt: prompt.slice(0, 100), model: options.model });
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey);
    }

    const model = options.model || this.config.defaultModel;
    const requestPromise = this._executeGeneration(prompt, model, options);

    this.pendingRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;

      // Cache successful responses
      if (this.config.cacheEnabled && !options.noCache) {
        this.cache.set(prompt, options, result);
      }

      return result;
    } finally {
      this.pendingRequests.delete(requestKey);
    }
  }

  /**
   * Execute the actual generation request
   * @private
   */
  async _executeGeneration(prompt, model, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 500,
            top_p: options.topP ?? 0.9,
            ...(options.ollamaOptions || {}),
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Parse JSON if requested
      if (options.format === 'json') {
        return this._parseJsonResponse(data.response);
      }

      return data.response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        console.error('[OllamaClient] Request timed out');
        throw new Error('LLM request timed out');
      }

      // Retry logic
      if (options._retryCount < this.config.maxRetries) {
        console.log(
          `[OllamaClient] Retrying... (${options._retryCount + 1}/${this.config.maxRetries})`
        );
        return this._executeGeneration(prompt, model, {
          ...options,
          _retryCount: (options._retryCount || 0) + 1,
        });
      }

      throw error;
    }
  }

  /**
   * Generate with vision model (image understanding)
   * @param {string} imageBase64 - Base64 encoded image
   * @param {string} prompt - Question about the image
   * @param {Object} options - Generation options
   * @returns {Promise<string>}
   */
  async vision(imageBase64, prompt, options = {}) {
    if (!this.visionAvailable) {
      const status = await this.checkAvailability();
      if (!status.visionAvailable) {
        return {
          error: true,
          message: 'Vision model not installed. Click "Install Vision AI" to enable.',
          requiresInstall: true,
        };
      }
    }

    const model = options.model || this.getBestModelForTask('vision');

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          images: [imageBase64],
          stream: false,
          options: {
            temperature: options.temperature ?? 0.5,
            num_predict: options.maxTokens ?? 1000,
          },
        }),
        signal: AbortSignal.timeout(this.config.timeout * 2), // Vision needs more time
      });

      if (!response.ok) {
        throw new Error(`Vision request failed: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('[OllamaClient] Vision error:', error);
      throw error;
    }
  }

  /**
   * Pull/install a model via Ollama
   * @param {string} modelName - Model to install (e.g., 'llava')
   * @param {function} onProgress - Progress callback
   * @returns {Promise<boolean>}
   */
  async installModel(modelName, onProgress = null) {
    console.log(`[OllamaClient] Installing model: ${modelName}`);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start model download: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const lines = decoder.decode(value).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const progress = JSON.parse(line);
            if (onProgress && progress.total) {
              onProgress({
                status: progress.status,
                completed: progress.completed || 0,
                total: progress.total,
                percent: Math.round((progress.completed / progress.total) * 100),
              });
            }
          } catch {
            // Ignore parse errors for progress updates
          }
        }
      }

      // Refresh available models
      this.lastCheck = 0;
      await this.checkAvailability();

      console.log(`[OllamaClient] Model ${modelName} installed successfully`);
      return true;
    } catch (error) {
      console.error(`[OllamaClient] Failed to install ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Parse JSON from LLM response (handles markdown code blocks)
   * @private
   */
  _parseJsonResponse(text) {
    try {
      // Try to extract JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;
      return JSON.parse(jsonStr.trim());
    } catch {
      console.warn('[OllamaClient] Failed to parse JSON response');
      return { raw: text, parseError: true };
    }
  }

  /**
   * Handle case when Ollama is unavailable
   * @private
   */
  _handleUnavailable(_prompt, _options) {
    console.log('[OllamaClient] Using fallback - LLM unavailable');
    return {
      unavailable: true,
      message: 'Local AI not running. Please start Ollama to enable AI features.',
      suggestion: 'Run "ollama serve" in terminal, or download from ollama.ai',
    };
  }

  /**
   * Get model information
   */
  getModelInfo(modelName) {
    // Find matching config
    for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
      if (modelName.includes(key.split(':')[0])) {
        return config;
      }
    }
    return null;
  }

  /**
   * Clear response cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get client status
   */
  getStatus() {
    return {
      available: this.isAvailable,
      baseUrl: this.config.baseUrl,
      models: this.availableModels,
      visionAvailable: this.visionAvailable,
      cacheSize: this.cache.cache.size,
      lastCheck: this.lastCheck,
    };
  }
}

// Singleton instance
let clientInstance = null;

/**
 * Get the Ollama client singleton
 * @param {Object} config - Optional configuration
 * @returns {OllamaClient}
 */
export function getOllamaClient(config = {}) {
  if (!clientInstance) {
    clientInstance = new OllamaClient(config);
  }
  return clientInstance;
}

/**
 * Export model configurations for UI
 */
export { MODEL_CONFIGS };

export default OllamaClient;
