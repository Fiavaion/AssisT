/**
 * AI Badge Utility for AssisT
 *
 * Provides a centralized, consistent way to display which AI model is being
 * used across all AssisT features. Reads cloudProvider + cloudModel from
 * storage so badges always reflect the user's actual settings.
 *
 * Usage:
 *   import { getAIBadgeInfo, renderAIBadge, injectAIBadgeStyles } from '../utils/ai-badge.js';
 *
 *   injectAIBadgeStyles(); // once per feature init
 *   const info = await getAIBadgeInfo();
 *   element.innerHTML = renderAIBadge(info.mode, info.label);
 *
 * @module utils/ai-badge
 */

// ============================================================================
// PROVIDER & MODEL DISPLAY NAMES
// ============================================================================

const PROVIDER_NAMES = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  perplexity: 'Perplexity',
};

// Map from full Anthropic model IDs and short keys → display names
const ANTHROPIC_MODEL_NAMES = {
  // Short keys (used internally)
  'haiku-4.5': 'Haiku',
  'sonnet-4.6': 'Sonnet',
  'opus-4.6': 'Opus',
  // Full API IDs (stored by popup when user selects from fetched list)
  'claude-haiku-4-5-20251001': 'Haiku',
  'claude-sonnet-4-6': 'Sonnet',
  'claude-opus-4-6': 'Opus',
};

/**
 * Get a human-readable display name for an Anthropic model ID or key.
 * Falls back to a cleaned-up version of the raw model string.
 *
 * @param {string} modelId - Full API ID (e.g. 'claude-sonnet-4-6') or short key (e.g. 'sonnet-4.6')
 * @returns {string}
 */
function getAnthropicModelName(modelId) {
  if (!modelId) {
    return 'Claude';
  }
  if (ANTHROPIC_MODEL_NAMES[modelId]) {
    return ANTHROPIC_MODEL_NAMES[modelId];
  }
  // Strip 'claude-' prefix and date suffix for a graceful fallback
  return modelId
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-/g, ' ');
}

/**
 * Get a short display name for any provider's model.
 * For non-Anthropic providers, uses the raw model ID since it's already user-readable
 * (e.g. 'gpt-4o', 'gemini-2.0-flash', 'sonar-pro').
 *
 * @param {string} provider - Provider key ('anthropic', 'openai', 'google', 'perplexity')
 * @param {string} modelId - Model ID from storage
 * @returns {string}
 */
function getModelDisplayName(provider, modelId) {
  if (provider === 'anthropic') {
    return getAnthropicModelName(modelId);
  }
  // For other providers: the model ID is already a readable string
  return modelId || 'Default';
}

/**
 * Get display name for WebLLM model
 * @param {string} modelKey - Model key (e.g., 'llama-3.2-1b')
 * @returns {string}
 */
function getWebLLMModelName(modelKey) {
  const names = {
    // Lightweight
    'llama-3.2-1b': 'Llama 3.2 1B',
    'gemma-2b': 'Gemma 2B',
    // Balanced
    'llama-3.2-3b': 'Llama 3.2 3B',
    'phi-3.5-mini': 'Phi-3.5 Mini',
    'qwen2.5-3b': 'Qwen 2.5 3B',
    // High-quality
    'mistral-7b': 'Mistral 7B',
    'llama-3.1-8b': 'Llama 3.1 8B',
    'gemma-7b': 'Gemma 7B',
  };
  return names[modelKey] || modelKey;
}

// ============================================================================
// BADGE INFO
// ============================================================================

/**
 * Read the current AI settings from storage and return badge display info.
 *
 * @returns {Promise<{mode: 'cloud'|'local'|'off', label: string, providerName?: string, modelName?: string}>}
 */
export async function getAIBadgeInfo() {
  try {
    const result = await chrome.storage.local.get([
      'aiMode',
      'cloudProvider',
      'cloudModel',
      'webllmModel',
    ]);
    const aiMode = result.aiMode || 'off';

    if (aiMode === 'local') {
      return { mode: 'local', label: 'Local AI' };
    }

    if (aiMode === 'cloud') {
      const provider = result.cloudProvider || 'anthropic';
      const providerName = PROVIDER_NAMES[provider] || provider;
      const modelName = getModelDisplayName(provider, result.cloudModel);
      const label = `${providerName}: ${modelName}`;
      return { mode: 'cloud', label, providerName, modelName };
    }

    if (aiMode === 'webllm') {
      const modelKey = result.webllmModel || 'llama-3.2-1b';
      const modelDisplayName = getWebLLMModelName(modelKey);
      return { mode: 'webllm', label: `Browser: ${modelDisplayName}` };
    }

    // AI is off or unknown
    return { mode: 'off', label: 'AI Off' };
  } catch (error) {
    console.warn('[AIBadge] Failed to read AI settings:', error);
    return { mode: 'off', label: 'AI Off' };
  }
}

// ============================================================================
// BADGE RENDERING
// ============================================================================

/**
 * Generate consistent badge HTML for the current AI mode.
 *
 * @param {'cloud'|'local'|'webllm'|'off'|'fallback'} mode - AI mode
 * @param {string} label - Display label (e.g. 'Anthropic: Sonnet 4.6', 'Local AI', 'Browser: Llama 3.2 1B')
 * @returns {string} HTML string (safe to inject via sanitizeHTML)
 */
export function renderAIBadge(mode, label) {
  switch (mode) {
    case 'cloud':
      return `<span class="assist-ai-badge assist-ai-badge--cloud" aria-label="Using cloud AI: ${label}">☁️ ${label}</span>`;
    case 'local':
      return `<span class="assist-ai-badge assist-ai-badge--local" aria-label="Using local AI">💻 ${label}</span>`;
    case 'webllm':
      return `<span class="assist-ai-badge assist-ai-badge--webllm" aria-label="Using browser AI: ${label}">🌐 ${label}</span>`;
    case 'fallback':
      return `<span class="assist-ai-badge assist-ai-badge--fallback" aria-label="Using basic analysis">⚠️ Basic</span>`;
    default:
      return '';
  }
}

/**
 * Convenience: get badge info AND render HTML in one call.
 * Use this in feature result displays.
 *
 * @returns {Promise<string>} Badge HTML string
 */
export async function getAndRenderAIBadge() {
  const info = await getAIBadgeInfo();
  return renderAIBadge(info.mode, info.label);
}

// ============================================================================
// STYLES
// ============================================================================

/**
 * Inject shared AI badge CSS into the document (idempotent — safe to call multiple times).
 */
export function injectAIBadgeStyles() {
  if (document.getElementById('assist-ai-badge-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'assist-ai-badge-styles';
  style.textContent = `
    .assist-ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      white-space: nowrap;
      vertical-align: middle;
      line-height: 1.4;
    }

    .assist-ai-badge--cloud {
      background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
      color: #fff;
    }

    .assist-ai-badge--local {
      background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
      color: #fff;
    }

    .assist-ai-badge--webllm {
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
      color: #fff;
    }

    .assist-ai-badge--fallback {
      background: #757575;
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}

export default { getAIBadgeInfo, renderAIBadge, getAndRenderAIBadge, injectAIBadgeStyles };
