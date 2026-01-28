/**
 * Claude API Client for AssisT Cloud AI Mode
 *
 * Provides integration with Anthropic's Claude API for cloud-based
 * AI processing. Supports Claude 4.5 models (Opus, Sonnet, Haiku).
 *
 * Features:
 * - Multi-model support with feature-specific defaults
 * - Automatic usage tracking
 * - Error handling and retry logic
 * - Response caching for performance
 *
 * @module ai/claude-client
 */

// SECURITY: Use AES-GCM-256 encrypted API key storage with PBKDF2 key derivation
import {
  getSecureAPIKey as getApiKey,
  hasSecureAPIKey as hasApiKey,
} from '../core/storage/secure-key-storage.js';

// Anthropic API endpoint
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// API version header required by Anthropic
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Claude 4.5 Model Configurations
 */
export const CLOUD_MODELS = {
  local: {
    id: 'local',
    name: 'Local (Ollama)',
    description: 'Offline processing with local AI',
    isLocal: true,
  },
  'haiku-4.5': {
    id: 'claude-haiku-4-5',
    name: 'Haiku 4.5',
    description: 'Fastest for quick answers',
    avgCost: 0.001, // per 1K tokens (input)
    outputCost: 0.005,
  },
  'sonnet-4.5': {
    id: 'claude-sonnet-4-5',
    name: 'Sonnet 4.5',
    description: 'Best for everyday tasks',
    avgCost: 0.003,
    outputCost: 0.015,
  },
  'opus-4.5': {
    id: 'claude-opus-4-5',
    name: 'Opus 4.5',
    description: 'Most capable for complex work',
    avgCost: 0.015,
    outputCost: 0.075,
  },
};

/**
 * Feature-specific default model mappings
 */
export const FEATURE_DEFAULT_MODELS = {
  summarization: 'haiku-4.5',
  textSimplification: 'sonnet-4.5',
  assignmentBreakdown: 'sonnet-4.5',
  citationAnalyzer: 'sonnet-4.5',
  socraticTutor: 'opus-4.5',
  imageUnderstanding: 'sonnet-4.5',
  studyPathGenerator: 'sonnet-4.5',
  multiDocCompare: 'opus-4.5',
};

/**
 * Default generation options
 */
const DEFAULT_OPTIONS = {
  maxTokens: 1024,
  temperature: 0.7,
  timeout: 60000, // 60 seconds
  maxRetries: 2,
};

/**
 * Response cache for performance
 */
class ClaudeCache {
  constructor(ttl = 300000) {
    // 5 minutes default
    this.cache = new Map();
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
      console.log('[ClaudeClient] Cache hit');
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
      timestamp: Date.now(),
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

// Singleton cache instance
const cache = new ClaudeCache();

/**
 * Check if cloud mode is available (API key configured)
 * @returns {Promise<{available: boolean, models: Object}>}
 */
export async function checkCloudAvailability() {
  const keyAvailable = await hasApiKey('anthropic');

  return {
    available: keyAvailable,
    models: keyAvailable ? CLOUD_MODELS : {},
    reason: keyAvailable ? null : 'API key not configured',
  };
}

/**
 * Generate text completion using Claude API
 *
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @param {string} options.model - Model key from CLOUD_MODELS (e.g., 'sonnet-4.5')
 * @param {number} options.maxTokens - Maximum tokens to generate
 * @param {number} options.temperature - Sampling temperature (0-1)
 * @param {string} options.feature - Feature name for usage tracking
 * @param {boolean} options.noCache - Skip cache lookup
 * @returns {Promise<{content: string, usage: Object}>}
 */
export async function claudeGenerate(prompt, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Resolve model ID from key
  const modelKey = opts.model || 'sonnet-4.5';
  const modelConfig = CLOUD_MODELS[modelKey];

  if (!modelConfig) {
    throw new Error(`Unknown model: ${modelKey}`);
  }

  if (modelConfig.isLocal) {
    throw new Error('Local model requested - use Ollama client instead');
  }

  const modelId = modelConfig.id;

  // Check cache first
  if (!opts.noCache) {
    const cached = cache.get(prompt, modelId);
    if (cached) {
      return cached;
    }
  }

  // Get API key
  const apiKey = await getApiKey('anthropic');
  if (!apiKey) {
    throw new Error(
      'Claude API key not configured. Please add your API key in Advanced Options > AI tab.'
    );
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    // SECURITY: credentials:'omit' prevents cookies/auth leaking to API
    // SECURITY: cache:'no-store' prevents caching of request/response with API key
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
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

    // Extract content
    const content = data.content?.[0]?.text || '';
    const usage = {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };

    const result = { content, usage };

    // Cache the result
    if (!opts.noCache) {
      cache.set(prompt, modelId, result);
    }

    console.log(
      `[ClaudeClient] ${modelKey} response: ${usage.totalTokens} tokens in ${responseTime}ms`
    );

    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[ClaudeClient] Request timed out');
      throw new Error('Claude request timed out. Try again or use a faster model.');
    }

    // Handle rate limiting
    if (error.message.includes('429') || error.message.includes('rate')) {
      console.warn('[ClaudeClient] Rate limited');
      throw new Error('Rate limited. Please wait a moment before trying again.');
    }

    // Retry logic for transient errors
    if (opts._retryCount < opts.maxRetries && !error.message.includes('API key')) {
      console.log(`[ClaudeClient] Retrying... (${(opts._retryCount || 0) + 1}/${opts.maxRetries})`);
      return claudeGenerate(prompt, {
        ...opts,
        _retryCount: (opts._retryCount || 0) + 1,
      });
    }

    throw error;
  }
}

/**
 * Get the default model for a feature
 * @param {string} featureName - Feature name
 * @returns {string} Model key
 */
export function getDefaultModelForFeature(featureName) {
  return FEATURE_DEFAULT_MODELS[featureName] || 'sonnet-4.5';
}

/**
 * Get all available cloud models for dropdown
 * @returns {Array<{key: string, name: string, description: string}>}
 */
export function getAvailableModels() {
  return Object.entries(CLOUD_MODELS).map(([key, config]) => ({
    key,
    name: config.name,
    description: config.description,
    isLocal: config.isLocal || false,
  }));
}

/**
 * Get model information
 * @param {string} modelKey - Model key
 * @returns {Object|null}
 */
export function getModelInfo(modelKey) {
  return CLOUD_MODELS[modelKey] || null;
}

/**
 * Clear response cache
 */
export function clearCache() {
  cache.clear();
  console.log('[ClaudeClient] Cache cleared');
}

/**
 * Estimate cost for a generation
 * @param {string} modelKey - Model key
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @returns {number} Estimated cost in USD
 */
export function estimateCost(modelKey, inputTokens, outputTokens) {
  const model = CLOUD_MODELS[modelKey];
  if (!model || model.isLocal) {
    return 0;
  }

  const inputCost = (inputTokens / 1000) * (model.avgCost || 0);
  const outputCost = (outputTokens / 1000) * (model.outputCost || 0);

  return inputCost + outputCost;
}

export default {
  checkCloudAvailability,
  claudeGenerate,
  getDefaultModelForFeature,
  getAvailableModels,
  getModelInfo,
  clearCache,
  estimateCost,
  CLOUD_MODELS,
  FEATURE_DEFAULT_MODELS,
};
