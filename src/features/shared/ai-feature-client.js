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
import { stripThinking } from '../../utils/ollama-models.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { CLOUD_AI_DESTINATIONS, DESTINATIONS } from '../../utils/consent.js';

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
 * @property {string} modelKey  - Resolved model key (e.g. 'llama-3.2-1b', 'haiku-5.5', 'local')
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
  haiku: 'haiku-5.5',
  sonnet: 'sonnet-5.5',
  opus: 'opus-5.5',
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
        modelKey = result.cloudModel || 'haiku-5.5';
      } else if (featureOverride && featureOverride !== 'auto' && provider === 'anthropic') {
        // Auto-select OFF + per-feature override explicitly set
        modelKey = FEATURE_MODEL_KEY_MAP[featureOverride] || featureOverride;
      } else {
        // Auto-select OFF, no per-feature override: use feature-optimal model
        modelKey = getFeatureDefault(provider, featureName) || result.cloudModel || 'haiku-5.5';
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
 * @property {string}  [provider]     - The cloud provider, when a key is missing
 */

/**
 * The sentence an "API Key Required" screen shows, naming the provider the student chose.
 *
 * @param {string} [provider] - Cloud provider id from `availability.provider`
 * @returns {string}
 */
export function missingKeyMessage(provider) {
  if (CLOUD_AI_DESTINATIONS.includes(provider)) {
    return `Please add your ${DESTINATIONS[provider].service} API key to use cloud features.`;
  }
  return 'Please add an API key for your AI provider to use cloud features.';
}

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
      // The key is there but something else is not (consent, or Chrome's permission to reach the
      // provider): the router's own sentence says what, and how to fix it.
      if (response?.success && response.needsApiKey === false && response.reason) {
        return {
          available: false,
          reason: response.reason,
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
        provider: modeInfo.provider,
      };
    } catch {
      return {
        available: false,
        reason: 'Cloud AI check failed. Check your connection and API key.',
        needsApiKey: true,
        needsOllama: false,
        needsWebLLMInit: false,
        provider: modeInfo.provider,
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
        reason: 'Browser AI model not loaded. Open AI settings to finish setting up.',
        needsApiKey: false,
        needsOllama: false,
        needsWebLLMInit: true,
      };
    } catch {
      return {
        available: false,
        reason: 'Browser AI not ready. Open AI settings to finish setting up.',
        needsApiKey: false,
        needsOllama: false,
        needsWebLLMInit: true,
      };
    }
  }

  if (modeInfo.isGemini) {
    try {
      // GEMINI_LLM_CHECK is the probe the worker answers; the popup uses the same one. This sent a
      // name nothing handled, so Nano could never report itself available to any feature.
      const response = await chrome.runtime.sendMessage({ action: 'GEMINI_LLM_CHECK' });
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
 * Extract a JSON object from a model's string output. Strips reasoning `<think>` blocks and Markdown
 * code fences, tolerates leading/trailing prose, and repairs trailing commas. Returns null if no
 * parseable object is found.
 * @param {string} str
 * @returns {Object|null}
 */
export function extractJsonObject(str) {
  if (typeof str !== 'string') {
    return null;
  }
  const cleaned = str.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = (fence ? fence[1] : cleaned).trim();
  const obj = body.match(/\{[\s\S]*\}/);
  if (!obj) {
    return null;
  }
  const candidate = obj[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Normalise a raw provider payload into a consistent `{ text, json }`:
 *   - `text` is ALWAYS a string.
 *   - `json` is the parsed object when `wantJson`, else null.
 * Handles all three payload shapes a provider can return: a string, an already-parsed object (the
 * local Ollama service worker pre-parses `format:'json'`), and the `{ raw, parseError }` shape the
 * service worker returns when its own parse fails.
 * @param {string|Object} payload
 * @param {boolean} wantJson
 * @returns {{text: string, json: Object|null}}
 */
function normalisePayload(payload, wantJson) {
  if (payload && typeof payload === 'object') {
    if (payload.parseError) {
      const raw = typeof payload.raw === 'string' ? payload.raw : '';
      return { text: raw, json: wantJson ? extractJsonObject(raw) : null };
    }
    // Already-parsed JSON object (only produced when JSON was requested).
    let text = '';
    try {
      text = JSON.stringify(payload);
    } catch {
      text = '';
    }
    return { text, json: payload };
  }
  // A reasoning model reached through ANY mode narrates in the same body: WebLLM runs qwen3 as
  // readily as Ollama does. Strip here so the contract's text is the answer whatever served it.
  const text =
    typeof payload === 'string'
      ? stripThinking(payload)
      : payload === null || payload === undefined
        ? ''
        : String(payload);
  return { text, json: wantJson ? extractJsonObject(text) : null };
}

/**
 * Generate text using the current AI mode.
 *
 * Routes to the correct service-worker action based on modeInfo. Throws on
 * failure so callers can implement their own fallback / error display logic.
 *
 * CONTRACT: `text` is ALWAYS a string, in every mode. When `format:'json'` is requested, `json`
 * holds the parsed object (or null if it could not be parsed) — parsed centrally here, once, for
 * ALL modes. This is deliberate: providers differ (the local Ollama service worker pre-parses
 * `format:'json'` and returns an object, cloud/webllm/gemini return a raw string), and normalising
 * here means callers never have to type-check `text` per mode. When `format` is not 'json', `json`
 * is null. See the citation-analyser regression (2026-07-01) for why this matters.
 *
 * @param {string}        prompt
 * @param {AIMode}        modeInfo - Result of getAIMode()
 * @param {GenerateOptions} [options={}]
 * @returns {Promise<{text: string, json: Object|null, isCloud: boolean, isWebLLM: boolean, isGemini: boolean, isLocal: boolean}>}
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

  const wantJson = format === 'json';
  let response;

  if (modeInfo.isGemini) {
    response = await chrome.runtime.sendMessage({
      action: 'GEMINI_LLM_REQUEST',
      prompt,
      options: { temperature, topK: 40 },
    });
    if (response?.success) {
      const { text, json } = normalisePayload(response.text, wantJson);
      return { text, json, isCloud: false, isWebLLM: false, isGemini: true, isLocal: false };
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
      const { text, json } = normalisePayload(response.data, wantJson);
      return { text, json, isCloud: false, isWebLLM: true, isGemini: false, isLocal: false };
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
      const { text, json } = normalisePayload(response.data, wantJson);
      return { text, json, isCloud: true, isWebLLM: false, isGemini: false, isLocal: false };
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
      const { text, json } = normalisePayload(response.data, wantJson);
      return { text, json, isCloud: false, isWebLLM: false, isGemini: false, isLocal: true };
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
 * When `needsWebLLMInit` is true the message is offered as a control that opens the AI setup
 * wizard (OPEN_AI_SETUP): a `role="button"` element inside the status bar, focusable, and wired
 * with `attachAccessibleHandler` so Enter and Space work as well as the pointer. It lives inside
 * the bar rather than on it because the bar is the panel's `role="status"` live region, and giving
 * the bar itself a button role would stop its messages being announced. Anything that rewrites
 * the bar, this function included, removes the control; the handler's cleanup is kept on the bar
 * and run before the bar is redrawn. The control carries `data-assist-clickable`, and each panel
 * styles it:
 *
 *   .<baseClass> [data-assist-clickable]:hover { text-decoration: underline; }
 *   .<baseClass> [data-assist-clickable]:focus-visible { outline: ... }
 *
 * @param {HTMLElement}    statusBar    - The status-bar element to update
 * @param {AIAvailability} availability - Result of checkAIAvailable()
 * @param {string}         baseClass    - The element's base CSS class (e.g. 'assist-summary-status')
 */
export function setAIStatusBar(statusBar, availability, baseClass) {
  if (typeof statusBar._aiActionCleanup === 'function') {
    statusBar._aiActionCleanup();
  }
  statusBar._aiActionCleanup = null;

  statusBar.className = `${baseClass} visible`;
  const message = getUnavailableStatusMessage(availability);

  if (!availability.needsWebLLMInit) {
    statusBar.textContent = message;
    return;
  }

  const action = document.createElement('span');
  action.setAttribute('role', 'button');
  action.setAttribute('tabindex', '0');
  action.setAttribute('data-assist-clickable', '');
  action.title = 'Open AI settings';
  action.style.cursor = 'pointer';
  action.textContent = message;
  statusBar.replaceChildren(action);
  statusBar._aiActionCleanup = attachAccessibleHandler(action, 'Open AI settings', () =>
    chrome.runtime.sendMessage({ action: 'OPEN_AI_SETUP' })
  );
}

/**
 * The sentence to show the student when an AI request fails.
 *
 * The service worker rejects with a plain, actionable sentence — which model to install and
 * where — and that sentence is the whole reason for showing a failure instead of quietly
 * dropping to an on-device answer. Anything that is not a plain sentence (a DOMException, a
 * stack, an empty or missing message) is replaced with wording the student can act on.
 *
 * Lives here because all eight AI feature panels need exactly this, and all eight had a
 * byte-identical private copy of it.
 *
 * @param {unknown} error - Whatever the request threw.
 * @returns {string} One sentence, safe to show.
 */
export function getFailureMessage(error) {
  const message =
    error && typeof error.message === 'string' && !(error instanceof DOMException)
      ? error.message.split(/\r?\n/)[0].trim()
      : '';

  return message || 'The AI request did not finish. Check your AI settings and try again.';
}
