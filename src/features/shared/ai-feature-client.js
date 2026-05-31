/**
 * Shared AI Feature Client
 *
 * Single source of truth for AI mode detection, availability checking,
 * and generation routing across all AI-powered features. Replaces the
 * per-feature getCurrentModel / checkCloudApiKey / checkLLM triad that
 * was duplicated across 9 feature files with inconsistent WebLLM and
 * Gemini Nano support.
 *
 * Usage:
 *   import { getAIMode, checkAIAvailable, generateWithAI,
 *            getSuccessStatusMessage, getUnavailableStatusMessage }
 *     from '../shared/ai-feature-client.js';
 *
 * @module features/shared/ai-feature-client
 */

import { REGISTRY, getFeatureDefault } from '../../ai/model-registry.js';

const WEBLLM_KEYS = new Set(Object.keys(REGISTRY.webllm.models));

/**
 * Return true if modelKey belongs to the WebLLM provider.
 * Uses the registry directly rather than brittle string-prefix matching.
 * @param {string} modelKey
 * @returns {boolean}
 */
export function isWebLLMModel(modelKey) {
  return WEBLLM_KEYS.has(modelKey);
}

/**
 * @typedef {Object} AIMode
 * @property {'cloud'|'local'|'webllm'|'gemini'|'off'} aiMode - Raw value from storage
 * @property {string} modelKey  - Resolved model key (e.g. 'llama-3.2-1b', 'haiku-4.5', 'local')
 * @property {string} [provider] - Cloud provider key when isCloud === true
 * @property {boolean} isCloud  - True only for cloud providers (Anthropic, OpenAI, Google, Perplexity)
 * @property {boolean} isWebLLM - True for browser-native WebLLM/WebGPU models
 * @property {boolean} isGemini - True for Chrome Gemini Nano (Prompt API)
 * @property {boolean} isLocal  - True for Ollama / local LLM
 * @property {boolean} isOff    - True when AI is disabled
 * @property {string}  displayLabel - Human-readable label suitable for status bars
 */

/**
 * Read and resolve the current AI mode from chrome.storage.local.
 *
 * This is the single replacement for all per-feature getCurrentModel() functions.
 * Follows the same storage key pattern as src/utils/ai-badge.js::getAIBadgeInfo().
 *
 * @param {string} [featureName='summarization'] - Used to look up the cloud model default
 * @returns {Promise<AIMode>}
 */
// ── Per-feature model override: short name → registry key mapping ─────────────
const FEATURE_MODEL_KEY_MAP = {
  haiku: 'haiku-4.5',
  sonnet: 'sonnet-4.6',
  opus: 'opus-4.6',
};

export async function getAIMode(featureName = 'summarization') {
  try {
    const storageKeys = [
      'aiMode',
      'cloudProvider',
      'cloudModel',
      'webllmModel',
      'featureModelAutoSelect',
    ];
    if (featureName && featureName !== 'summarization') {
      storageKeys.push(`featureModel_${featureName}`);
    } else {
      storageKeys.push('featureModel_summarization');
    }
    const result = await chrome.storage.local.get(storageKeys);
    const aiMode = result.aiMode || 'off';

    if (aiMode === 'local') {
      return {
        aiMode: 'local',
        modelKey: 'local',
        isCloud: false,
        isWebLLM: false,
        isGemini: false,
        isLocal: true,
        isOff: false,
        displayLabel: 'Local AI (Ollama)',
      };
    }

    if (aiMode === 'cloud') {
      const provider = result.cloudProvider || 'anthropic';
      let modelKey;
      const autoSelect = result.featureModelAutoSelect !== false; // default true
      const featureOverride = result[`featureModel_${featureName}`];
      if (autoSelect) {
        // Auto-select ON: user's dropdown model is always respected — never override with feature defaults
        modelKey = result.cloudModel || 'haiku-4.5';
      } else if (featureOverride && featureOverride !== 'auto' && provider === 'anthropic') {
        // Auto-select OFF + per-feature override explicitly set
        modelKey = FEATURE_MODEL_KEY_MAP[featureOverride] || featureOverride;
      } else {
        // Auto-select OFF, no per-feature override: use feature-optimal model
        modelKey = getFeatureDefault(provider, featureName) || result.cloudModel || 'haiku-4.5';
      }
      return {
        aiMode: 'cloud',
        modelKey,
        provider,
        isCloud: true,
        isWebLLM: false,
        isGemini: false,
        isLocal: false,
        isOff: false,
        displayLabel: `${provider}: ${modelKey}`,
      };
    }

    if (aiMode === 'webllm') {
      const modelKey = result.webllmModel || REGISTRY.webllm.defaultModel;
      return {
        aiMode: 'webllm',
        modelKey,
        isCloud: false,
        isWebLLM: true,
        isGemini: false,
        isLocal: false,
        isOff: false,
        displayLabel: `Browser AI (${modelKey})`,
      };
    }

    if (aiMode === 'gemini') {
      return {
        aiMode: 'gemini',
        modelKey: 'gemini',
        isCloud: false,
        isWebLLM: false,
        isGemini: true,
        isLocal: false,
        isOff: false,
        displayLabel: 'Gemini Nano',
      };
    }

    // aiMode === 'off' or unknown
    return {
      aiMode: 'off',
      modelKey: 'local',
      isCloud: false,
      isWebLLM: false,
      isGemini: false,
      isLocal: false,
      isOff: true,
      displayLabel: 'AI Off',
    };
  } catch (error) {
    console.warn('[AIFeatureClient] Failed to get AI mode:', error);
    return {
      aiMode: 'off',
      modelKey: 'local',
      isCloud: false,
      isWebLLM: false,
      isGemini: false,
      isLocal: false,
      isOff: true,
      displayLabel: 'AI Off',
    };
  }
}

/**
 * @typedef {Object} AIAvailability
 * @property {boolean} available      - Whether the configured AI mode is ready to use
 * @property {string}  reason         - Human-readable explanation if unavailable
 * @property {boolean} needsApiKey    - True if a cloud API key must be configured
 * @property {boolean} needsOllama    - True if Ollama must be started
 * @property {boolean} needsWebLLMInit - True if the WebLLM model must be initialised
 */

/**
 * Check whether the current AI mode is available and ready to use.
 * Replaces the per-feature checkCloudApiKey() + checkLLM() pair.
 *
 * @param {AIMode} modeInfo - Result of getAIMode()
 * @returns {Promise<AIAvailability>}
 */
export async function checkAIAvailable(modeInfo) {
  if (modeInfo.isOff) {
    return {
      available: false,
      reason: 'AI is disabled. Enable it in AI Settings.',
      needsApiKey: false,
      needsOllama: false,
      needsWebLLMInit: false,
    };
  }

  if (modeInfo.isCloud) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'CLOUD_LLM_CHECK' });
      if (response?.success && response?.available) {
        return {
          available: true,
          reason: '',
          needsApiKey: false,
          needsOllama: false,
          needsWebLLMInit: false,
        };
      }
      return {
        available: false,
        reason:
          'Cloud AI mode is enabled but no API key is configured. Please add your API key in AI Settings.',
        needsApiKey: true,
        needsOllama: false,
        needsWebLLMInit: false,
      };
    } catch {
      return {
        available: false,
        reason: 'Cloud AI check failed. Check your connection and API key.',
        needsApiKey: true,
        needsOllama: false,
        needsWebLLMInit: false,
      };
    }
  }

  if (modeInfo.isWebLLM) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'WEBLLM_STATUS' });
      if (response?.status?.ready) {
        return {
          available: true,
          reason: '',
          needsApiKey: false,
          needsOllama: false,
          needsWebLLMInit: false,
        };
      }
      return {
        available: false,
        reason: 'Browser AI model not loaded — tap to open AI settings and load a model.',
        needsApiKey: false,
        needsOllama: false,
        needsWebLLMInit: true,
      };
    } catch {
      return {
        available: false,
        reason: 'Browser AI not ready — tap to open AI settings and load a model.',
        needsApiKey: false,
        needsOllama: false,
        needsWebLLMInit: true,
      };
    }
  }

  if (modeInfo.isGemini) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GEMINI_NANO_CHECK' });
      if (response?.available) {
        return {
          available: true,
          reason: '',
          needsApiKey: false,
          needsOllama: false,
          needsWebLLMInit: false,
        };
      }
      return {
        available: false,
        reason: 'Gemini Nano is not available on this device or browser.',
        needsApiKey: false,
        needsOllama: false,
        needsWebLLMInit: false,
      };
    } catch {
      return {
        available: false,
        reason: 'Gemini Nano check failed.',
        needsApiKey: false,
        needsOllama: false,
        needsWebLLMInit: false,
      };
    }
  }

  if (modeInfo.isLocal) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'LOCAL_LLM_CHECK' });
      if (response?.success && response?.available) {
        return {
          available: true,
          reason: '',
          needsApiKey: false,
          needsOllama: false,
          needsWebLLMInit: false,
        };
      }
      return {
        available: false,
        reason: 'Local AI (Ollama) is not running. Start Ollama or switch AI mode in Settings.',
        needsApiKey: false,
        needsOllama: true,
        needsWebLLMInit: false,
      };
    } catch {
      return {
        available: false,
        reason: 'Local AI check failed. Ensure Ollama is running.',
        needsApiKey: false,
        needsOllama: true,
        needsWebLLMInit: false,
      };
    }
  }

  return {
    available: false,
    reason: 'Unknown AI mode.',
    needsApiKey: false,
    needsOllama: false,
    needsWebLLMInit: false,
  };
}

/**
 * @typedef {Object} GenerateOptions
 * @property {number}  [maxTokens=800]   - Maximum tokens to generate
 * @property {number}  [temperature=0.5] - Sampling temperature
 * @property {string}  [feature]         - Feature name for cloud routing & logging
 * @property {string}  [taskType]        - Task type for local LLM routing (defaults to feature)
 * @property {string}  [system]          - Optional system prompt (cloud only)
 * @property {boolean} [noCache]         - Disable cloud response caching
 * @property {string}  [format]          - Response format hint, e.g. 'json' (local only)
 */

/**
 * Generate text using the current AI mode.
 *
 * Routes to the correct service-worker action based on modeInfo. Throws on
 * failure so callers can implement their own fallback / error display logic.
 *
 * @param {string}        prompt
 * @param {AIMode}        modeInfo - Result of getAIMode()
 * @param {GenerateOptions} [options={}]
 * @returns {Promise<{text: string, isCloud: boolean, isWebLLM: boolean, isGemini: boolean, isLocal: boolean}>}
 */
export async function generateWithAI(prompt, modeInfo, options = {}) {
  const {
    maxTokens = 800,
    temperature = 0.5,
    feature = 'unknown',
    taskType,
    system,
    noCache,
    format,
    timeout,
    num_ctx,
  } = options;

  let response;

  if (modeInfo.isGemini) {
    response = await chrome.runtime.sendMessage({
      action: 'GEMINI_LLM_REQUEST',
      prompt,
      options: { temperature, topK: 40 },
    });
    if (response?.success) {
      return {
        text: response.text,
        isCloud: false,
        isWebLLM: false,
        isGemini: true,
        isLocal: false,
      };
    }
    throw new Error(response?.error || 'Gemini Nano generation failed');
  }

  if (modeInfo.isWebLLM) {
    response = await chrome.runtime.sendMessage({
      action: 'WEBLLM_GENERATE',
      prompt,
      options: { maxTokens, temperature },
    });
    if (response?.success) {
      return {
        text: response.data,
        isCloud: false,
        isWebLLM: true,
        isGemini: false,
        isLocal: false,
      };
    }
    if (response?.requiresInit) {
      throw new Error('Browser AI model not loaded — open AI settings to load a model.');
    }
    throw new Error(response?.error || 'Browser AI generation failed');
  }

  if (modeInfo.isCloud) {
    response = await chrome.runtime.sendMessage({
      action: 'CLOUD_LLM_GENERATE',
      prompt,
      options: {
        model: modeInfo.modelKey,
        maxTokens,
        temperature,
        feature,
        ...(system ? { system } : {}),
        ...(noCache ? { noCache } : {}),
      },
    });
    if (response?.success) {
      return {
        text: response.data,
        isCloud: true,
        isWebLLM: false,
        isGemini: false,
        isLocal: false,
      };
    }
    throw new Error(response?.error || 'Cloud AI generation failed');
  }

  if (modeInfo.isLocal) {
    response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_GENERATE',
      prompt,
      taskType: taskType || feature,
      options: {
        maxTokens,
        temperature,
        ...(format ? { format } : {}),
        ...(timeout ? { timeout } : {}),
        ...(num_ctx ? { num_ctx } : {}),
      },
    });
    if (response?.success) {
      return {
        text: response.data,
        isCloud: false,
        isWebLLM: false,
        isGemini: false,
        isLocal: true,
      };
    }
    throw new Error(response?.error || 'Local AI generation failed');
  }

  throw new Error('AI is disabled or mode is unknown');
}

/**
 * Get a mode-aware success status message for feature status bars.
 *
 * @param {AIMode}  modeInfo
 * @param {string}  actionVerb - Past-tense description e.g. 'summary generated', 'analysis complete'
 * @returns {string}
 */
export function getSuccessStatusMessage(modeInfo, actionVerb) {
  if (modeInfo.isCloud) {
    return `☁️ ${actionVerb} with ${modeInfo.displayLabel}`;
  }
  if (modeInfo.isWebLLM) {
    return `🌐 ${actionVerb} with Browser AI (${modeInfo.modelKey})`;
  }
  if (modeInfo.isGemini) {
    return `💎 ${actionVerb} with Gemini Nano`;
  }
  if (modeInfo.isLocal) {
    return `✨ ${actionVerb} (Local AI)`;
  }
  return `⚠️ ${actionVerb} (basic mode)`;
}

/**
 * Get a mode-aware unavailability message for feature status bars.
 *
 * @param {AIAvailability} availability - Result of checkAIAvailable()
 * @returns {string}
 */
export function getUnavailableStatusMessage(availability) {
  return `⚠️ ${availability.reason}`;
}

/**
 * Set a status bar element to reflect AI unavailability.
 *
 * When `needsWebLLMInit` is true the bar becomes clickable — clicking it sends
 * OPEN_AI_SETUP so the user lands directly in the AI setup wizard. The bar
 * also gets a hover underline (via `data-assist-clickable` attribute) to
 * signal interactivity. The caller is responsible for adding the
 * `data-assist-clickable` CSS rule to their panel styles:
 *
 *   [data-assist-clickable]:hover { text-decoration: underline; }
 *
 * @param {HTMLElement}    statusBar    - The status-bar element to update
 * @param {AIAvailability} availability - Result of checkAIAvailable()
 * @param {string}         baseClass    - The element's base CSS class (e.g. 'assist-summary-status')
 */
export function setAIStatusBar(statusBar, availability, baseClass) {
  statusBar.className = `${baseClass} visible`;
  statusBar.textContent = getUnavailableStatusMessage(availability);

  // Clean up any previous click handler
  if (statusBar._aiClickHandler) {
    statusBar.removeEventListener('click', statusBar._aiClickHandler);
    statusBar._aiClickHandler = null;
  }

  if (availability.needsWebLLMInit) {
    statusBar.style.cursor = 'pointer';
    statusBar.title = 'Open AI settings';
    statusBar.setAttribute('data-assist-clickable', '');
    const handler = () => chrome.runtime.sendMessage({ action: 'OPEN_AI_SETUP' });
    statusBar._aiClickHandler = handler;
    statusBar.addEventListener('click', handler);
  } else {
    statusBar.style.cursor = '';
    statusBar.title = '';
    statusBar.removeAttribute('data-assist-clickable');
  }
}
