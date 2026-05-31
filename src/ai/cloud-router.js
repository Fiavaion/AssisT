/**
 * Cloud AI Router for AssisT
 *
 * Provider-agnostic routing layer that delegates generation requests
 * to the correct cloud AI client based on the user's selected provider.
 *
 * All features send CLOUD_LLM_GENERATE → service worker → this router.
 * The router reads cloudProvider from storage and dispatches accordingly.
 *
 * @module ai/cloud-router
 */

import { claudeGenerate } from './claude-client.js';
import { openaiGenerate, fetchOpenAIModels } from './openai-client.js';
import { geminiGenerate, fetchGeminiModels } from './google-client.js';
import { perplexityGenerate, fetchPerplexityModels } from './perplexity-client.js';
import { getSecureAPIKey } from '../core/storage/secure-key-storage.js';
import { resolveModel, getHardcodedFallbackModels } from './model-registry.js';

const MODELS_CACHE_VERSION = 2;

const PROVIDERS = {
  anthropic: {
    generate: claudeGenerate,
    fetchModels: fetchAnthropicModels,
    name: 'Anthropic',
  },
  openai: {
    generate: openaiGenerate,
    fetchModels: fetchOpenAIModelsWithKey,
    name: 'OpenAI',
  },
  google: {
    generate: geminiGenerate,
    fetchModels: fetchGeminiModelsWithKey,
    name: 'Google',
  },
  perplexity: {
    generate: perplexityGenerate,
    fetchModels: fetchPerplexityModelsWrapper,
    name: 'Perplexity',
  },
};

/**
 * Generate text using the user's selected cloud provider
 * Reads cloudProvider from storage and routes to the correct client.
 *
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options (model, maxTokens, temperature, feature)
 * @returns {Promise<{content: string, usage: Object}>}
 */
export async function cloudGenerate(prompt, options = {}) {
  const provider = await getActiveProvider();
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    throw new Error(
      `Unknown cloud provider: ${provider}. Supported: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }

  console.log(
    `[CloudRouter] Routing to ${providerConfig.name} (model: ${options.model || 'default'})`
  );

  // Resolve model keys (e.g., 'sonnet-4.6') to actual API model IDs via registry
  if (options.model) {
    options.model = resolveModel(provider, options.model);
  }

  return providerConfig.generate(prompt, options);
}

/**
 * Check if cloud AI is available for the active provider
 * @returns {Promise<{available: boolean, provider: string, reason?: string}>}
 */
export async function checkCloudAvailability() {
  const provider = await getActiveProvider();
  const hasKey = await getSecureAPIKey(provider);

  return {
    available: !!hasKey,
    provider,
    providerName: PROVIDERS[provider]?.name || provider,
    reason: hasKey ? null : 'API key not configured',
  };
}

/**
 * Fetch available models for a specific provider
 * @param {string} provider - Provider name
 * @param {string} [apiKey] - Optional API key (fetched from storage if not provided)
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
export async function cloudFetchModels(provider, apiKey = null) {
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const key = apiKey || (await getSecureAPIKey(provider));
  if (!key) {
    throw new Error(`No API key configured for ${providerConfig.name}`);
  }

  console.log(`[CloudRouter] Fetching models for ${providerConfig.name}`);

  try {
    const models = await providerConfig.fetchModels(key);

    // Cache the results
    await cacheModels(provider, models);

    return models;
  } catch (error) {
    console.warn(`[CloudRouter] Model fetch failed for ${provider}:`, error.message);

    // Try to return cached models as fallback
    const cached = await getCachedModels(provider);
    if (cached && cached.length > 0) {
      console.log(`[CloudRouter] Using cached models for ${provider}`);
      return cached;
    }

    // Return hardcoded fallbacks
    return getHardcodedFallback(provider);
  }
}

/**
 * Get cached models for a provider (if available)
 * @param {string} provider
 * @returns {Promise<Array|null>}
 */
export async function getCachedModels(provider) {
  try {
    const key = `cloudModels_${provider}`;
    const result = await chrome.storage.local.get(key);
    const cached = result[key];

    if (cached && cached.models && cached.timestamp) {
      // Invalidate if cache version doesn't match
      if (cached.version !== MODELS_CACHE_VERSION) {
        return null;
      }
      // Cache valid for 24 hours
      const age = Date.now() - cached.timestamp;
      if (age < 24 * 60 * 60 * 1000) {
        return cached.models;
      }
    }
    return null;
  } catch {
    // storage unavailable — caller falls back to live fetch
    return null;
  }
}

/**
 * Get the active cloud provider from storage
 * @returns {Promise<string>}
 */
async function getActiveProvider() {
  try {
    const result = await chrome.storage.local.get('cloudProvider');
    return result.cloudProvider || 'anthropic';
  } catch {
    return 'anthropic';
  }
}

/**
 * Cache fetched models in storage
 * @param {string} provider
 * @param {Array} models
 */
async function cacheModels(provider, models) {
  try {
    const key = `cloudModels_${provider}`;
    await chrome.storage.local.set({
      [key]: {
        models,
        timestamp: Date.now(),
        version: MODELS_CACHE_VERSION,
      },
    });
  } catch (error) {
    console.warn('[CloudRouter] Failed to cache models:', error.message);
  }
}

/**
 * Fetch Anthropic models (hardcoded — no listing API).
 * Uses model-registry as the single source of truth.
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
async function fetchAnthropicModels() {
  return getHardcodedFallbackModels('anthropic');
}

/**
 * Wrapper for OpenAI model fetching (injects API key)
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
async function fetchOpenAIModelsWithKey(apiKey) {
  return fetchOpenAIModels(apiKey);
}

/**
 * Wrapper for Gemini model fetching (injects API key)
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
async function fetchGeminiModelsWithKey(apiKey) {
  return fetchGeminiModels(apiKey);
}

/**
 * Wrapper for Perplexity model fetching (no key needed)
 * @returns {Promise<Array>}
 */
async function fetchPerplexityModelsWrapper() {
  return fetchPerplexityModels();
}

/**
 * Hardcoded fallback models when API fetch fails.
 * Delegates to model-registry — the single source of truth.
 * @param {string} provider
 * @returns {Array<{id: string, name: string, description: string}>}
 */
function getHardcodedFallback(provider) {
  const models = getHardcodedFallbackModels(provider);
  return models.length > 0 ? models : getHardcodedFallbackModels('anthropic');
}

export default {
  cloudGenerate,
  cloudFetchModels,
  checkCloudAvailability,
  getCachedModels,
};
