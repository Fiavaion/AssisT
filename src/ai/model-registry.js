/**
 * Model Registry — Single Source of Truth for All AI Model Configurations
 *
 * All AI providers and their model definitions live here.
 * Feature files, clients, and the popup import from this module.
 * Never hardcode model IDs elsewhere in the codebase.
 *
 * @module ai/model-registry
 */

// IDs and prices from platform.claude.com/docs/en/about-claude/models/overview (2026-10-07).
// Costs are dollars per thousand tokens. Every one of these rejects temperature, top_p and top_k.
const ANTHROPIC_MODELS = {
  'haiku-5.5': {
    id: 'claude-haiku-5-5',
    name: 'Haiku (Fast)',
    description: 'Fast and economical',
    avgCost: 0.0001,
    outputCost: 0.0005,
  },
  'sonnet-5.5': {
    id: 'claude-sonnet-5-5',
    name: 'Sonnet (Recommended)',
    description: 'Best for everyday tasks',
    avgCost: 0.002,
    outputCost: 0.01,
  },
  'opus-5.5': {
    id: 'claude-opus-5-5',
    name: 'Opus (Most Capable, costs about 2× Sonnet)',
    description: 'Most capable for complex work, at about twice the cost of Sonnet per use',
    avgCost: 0.004,
    outputCost: 0.02,
  },
};

const OPENAI_MODELS = {
  'gpt-5.5': {
    id: 'gpt-5.5',
    name: 'GPT-5.5 (Most Capable)',
    description: 'Latest flagship — complex tasks',
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o (Recommended)',
    description: 'Best for everyday tasks',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini (Fast)',
    description: 'Fast and economical',
  },
  'o3-mini': {
    id: 'o3-mini',
    name: 'o3 Mini (Reasoning)',
    description: 'Advanced reasoning',
  },
};

// The stable models ai.google.dev/gemini-api/docs/models recommends for new projects (2026-10-07).
// Both have a free tier (/pricing) and read images. Gemini 3.1 Pro is preview-only, so not offered.
const GOOGLE_MODELS = {
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Recommended — Free)',
    description: 'Free tier — most capable Flash model',
  },
  'gemini-3.5-flash-lite': {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite (Fast — Free)',
    description: 'Free tier — fastest and cheapest',
  },
};

/**
 * Saved model keys and IDs that are no longer offered, and the current key that replaces each.
 * Covers models Anthropic and Google have retired or are retiring (see their deprecation pages)
 * and the ones this registry offered before. Read through resolveModel, so a student whose
 * settings name one of these is moved to its replacement rather than left on a dead model.
 */
const REPLACED_MODELS = {
  anthropic: {
    'haiku-4.5': 'haiku-5.5',
    'claude-haiku-4-5': 'haiku-5.5',
    'claude-haiku-4-5-20251001': 'haiku-5.5',
    'claude-3-5-haiku-20241022': 'haiku-5.5',
    'claude-3-haiku-20240307': 'haiku-5.5',
    'sonnet-4.5': 'sonnet-5.5',
    'sonnet-4.6': 'sonnet-5.5',
    'claude-sonnet-4-6': 'sonnet-5.5',
    'claude-sonnet-4-5': 'sonnet-5.5',
    'claude-sonnet-4-5-20250929': 'sonnet-5.5',
    'claude-sonnet-4-20250514': 'sonnet-5.5',
    'claude-3-7-sonnet-20250219': 'sonnet-5.5',
    'claude-3-5-sonnet-20241022': 'sonnet-5.5',
    'claude-3-5-sonnet-20240620': 'sonnet-5.5',
    'opus-4.6': 'opus-5.5',
    'opus-4.7': 'opus-5.5',
    'claude-opus-4-7': 'opus-5.5',
    'claude-opus-4-6': 'opus-5.5',
    'claude-opus-4-1-20250805': 'opus-5.5',
    'claude-opus-4-20250514': 'opus-5.5',
    'claude-3-opus-20240229': 'opus-5.5',
  },
  google: {
    'gemini-2.5-flash': 'gemini-3.8-flash',
    'gemini-2.5-pro': 'gemini-3.8-flash',
    'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-2.0-flash': 'gemini-3.8-flash',
    'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-1.5-flash': 'gemini-3.8-flash',
    'gemini-1.5-pro': 'gemini-3.8-flash',
  },
};

const PERPLEXITY_MODELS = {
  sonar: {
    id: 'sonar',
    name: 'Sonar (Recommended)',
    description: 'Best for everyday tasks',
  },
  'sonar-pro': {
    id: 'sonar-pro',
    name: 'Sonar Pro (Most Capable)',
    description: 'Most capable with citations',
  },
  'sonar-reasoning': {
    id: 'sonar-reasoning',
    name: 'Sonar Reasoning',
    description: 'Advanced reasoning with chain-of-thought',
  },
  'sonar-reasoning-pro': {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    description: 'Best reasoning with citations',
  },
};

// The same three models the AI setup page offers (pages/ai-setup/ollama-catalog.js).
const OLLAMA_MODELS = {
  'qwen3:4b-instruct-2507-q4_K_M': {
    id: 'qwen3:4b-instruct-2507-q4_K_M',
    name: 'Qwen 3 Instruct (4B)',
    size: '4B',
    description: 'Small and quick; answers without a thinking step',
    bestFor: ['quick-responses', 'summaries', 'simple-queries'],
  },
  'qwen3.5:9b': {
    id: 'qwen3.5:9b',
    name: 'Qwen 3.5 (9B)',
    size: '9B',
    description: 'Recommended for an 8 GB graphics card; reads images too',
    bestFor: ['conversation', 'tutoring', 'analysis', 'image-description'],
    isVision: true,
  },
  'qwen3.5:27b': {
    id: 'qwen3.5:27b',
    name: 'Qwen 3.5 (27B)',
    size: '27B',
    description: 'Most capable; needs a graphics card with 20 GB or more',
    bestFor: ['complex-analysis', 'detailed-explanations', 'image-description'],
    isVision: true,
  },
};

const WEBLLM_MODELS = {
  // Lightweight (< 1GB)
  'llama-3.2-1b': {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    size: '650MB',
    vramRequired: '1.2GB',
    description: 'Fast responses, good for simple tasks',
    bestFor: ['summarization', 'quick-questions', 'text-simplification'],
    avgSpeed: 'Fast (15-25 tok/s)',
    quantization: 'q4f16_1',
    category: 'lightweight',
  },
  'gemma-2b': {
    id: 'gemma-2b-it-q4f16_1-MLC',
    name: 'Gemma 2B',
    size: '1.6GB',
    vramRequired: '2GB',
    description: "Google's efficient small model",
    bestFor: ['quick-tasks', 'chat', 'simple-reasoning'],
    avgSpeed: 'Fast (15-20 tok/s)',
    quantization: 'q4f16_1',
    category: 'lightweight',
  },
  // Balanced (1-3GB)
  'llama-3.2-3b': {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    size: '1.9GB',
    vramRequired: '2.5GB',
    description: 'Better quality than 1B, still fast',
    bestFor: ['general-purpose', 'writing', 'analysis'],
    avgSpeed: 'Moderate (12-18 tok/s)',
    quantization: 'q4f16_1',
    category: 'balanced',
  },
  'phi-3.5-mini': {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi-3.5 Mini',
    size: '2.3GB',
    vramRequired: '3GB',
    description: "Microsoft's efficient model, great for coding",
    bestFor: ['conversation', 'tutoring', 'analysis', 'coding'],
    avgSpeed: 'Moderate (10-18 tok/s)',
    quantization: 'q4f16_1',
    category: 'balanced',
  },
  'qwen2.5-3b': {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 3B',
    size: '1.9GB',
    vramRequired: '2.5GB',
    description: 'High quality reasoning and coding',
    bestFor: ['complex-analysis', 'detailed-explanations', 'code-generation'],
    avgSpeed: 'Moderate (12-20 tok/s)',
    quantization: 'q4f16_1',
    category: 'balanced',
  },
  // High-quality (4-6GB)
  'mistral-7b': {
    id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
    name: 'Mistral 7B',
    size: '4.4GB',
    vramRequired: '6GB',
    description: 'Powerful general-purpose model',
    bestFor: ['advanced-reasoning', 'creative-writing', 'complex-tasks'],
    avgSpeed: 'Slower (6-12 tok/s)',
    quantization: 'q4f16_1',
    category: 'high-quality',
  },
  'llama-3.1-8b': {
    id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.1 8B',
    size: '4.9GB',
    vramRequired: '6.5GB',
    description: "Meta's flagship model, excellent quality",
    bestFor: ['advanced-analysis', 'research', 'complex-coding'],
    avgSpeed: 'Slower (5-10 tok/s)',
    quantization: 'q4f16_1',
    category: 'high-quality',
  },
  'gemma-9b': {
    id: 'gemma-2-9b-it-q4f16_1-MLC',
    name: 'Gemma 2 9B',
    size: '5.4GB',
    vramRequired: '6.5GB',
    description: "Google's Gemma 2 9B — high performance",
    bestFor: ['detailed-analysis', 'tutoring', 'research'],
    avgSpeed: 'Slower (5-10 tok/s)',
    quantization: 'q4f16_1',
    category: 'high-quality',
  },
};

export const REGISTRY = {
  anthropic: {
    models: ANTHROPIC_MODELS,
    defaultModel: 'sonnet-5.5',
    featureDefaults: {
      summarization: 'haiku-5.5',
      textSimplification: 'sonnet-5.5',
      assignmentBreakdown: 'sonnet-5.5',
      citationAnalyzer: 'sonnet-5.5',
      socraticTutor: 'sonnet-5.5',
      imageUnderstanding: 'sonnet-5.5',
      studyPathGenerator: 'sonnet-5.5',
      multiDocCompare: 'opus-5.5',
      knowledgeGraph: 'sonnet-5.5',
    },
  },
  openai: {
    models: OPENAI_MODELS,
    defaultModel: 'gpt-4o',
    featureDefaults: {
      summarization: 'gpt-4o-mini',
      textSimplification: 'gpt-4o',
      assignmentBreakdown: 'gpt-4o',
      citationAnalyzer: 'gpt-5.5',
      socraticTutor: 'gpt-5.5',
      imageUnderstanding: 'gpt-4o',
      studyPathGenerator: 'gpt-5.5',
      multiDocCompare: 'gpt-5.5',
      knowledgeGraph: 'gpt-4o',
    },
  },
  google: {
    models: GOOGLE_MODELS,
    defaultModel: 'gemini-3.8-flash',
    featureDefaults: {
      summarization: 'gemini-3.8-flash',
      textSimplification: 'gemini-3.8-flash',
      assignmentBreakdown: 'gemini-3.8-flash',
      citationAnalyzer: 'gemini-3.8-flash',
      socraticTutor: 'gemini-3.8-flash',
      imageUnderstanding: 'gemini-3.8-flash',
      studyPathGenerator: 'gemini-3.8-flash',
      multiDocCompare: 'gemini-3.8-flash',
      knowledgeGraph: 'gemini-3.8-flash',
    },
  },
  perplexity: {
    models: PERPLEXITY_MODELS,
    defaultModel: 'sonar',
    featureDefaults: {
      summarization: 'sonar',
      textSimplification: 'sonar',
      assignmentBreakdown: 'sonar',
      citationAnalyzer: 'sonar-pro',
      socraticTutor: 'sonar-pro',
      imageUnderstanding: 'sonar',
      studyPathGenerator: 'sonar',
      multiDocCompare: 'sonar-pro',
      knowledgeGraph: 'sonar',
    },
  },
  ollama: {
    models: OLLAMA_MODELS,
    defaultModel: 'qwen3.5:9b',
    fastModel: 'qwen3:4b-instruct-2507-q4_K_M',
    visionModel: 'qwen3.5:9b',
  },
  webllm: {
    models: WEBLLM_MODELS,
    defaultModel: 'llama-3.2-1b',
  },
};

/**
 * Get the actual API model ID for a provider + model key.
 * @param {string} provider - e.g. 'anthropic', 'openai', 'google', 'ollama', 'webllm'
 * @param {string} modelKey - e.g. 'sonnet-4.6', 'gpt-4o', 'llama-3.2-1b'
 * @returns {string} The API model ID string, or modelKey as-is if not found
 */
export function getModelId(provider, modelKey) {
  const providerEntry = REGISTRY[provider];
  if (!providerEntry) {
    return modelKey;
  }
  const model = providerEntry.models[modelKey];
  return model ? model.id : modelKey;
}

/**
 * Get the recommended model key for a specific feature and provider.
 * @param {string} provider - Provider name
 * @param {string} feature - Feature name (e.g. 'summarization', 'socraticTutor')
 * @returns {string} Model key for this feature, or provider's defaultModel
 */
export function getFeatureDefault(provider, feature) {
  const providerEntry = REGISTRY[provider];
  if (!providerEntry) {
    return null;
  }
  return providerEntry.featureDefaults?.[feature] || providerEntry.defaultModel;
}

/**
 * Get full model config object for a provider + model key.
 * @param {string} provider - Provider name
 * @param {string} modelKey - Model key
 * @returns {Object|null} Full model config, or null if not found
 */
export function getModelInfo(provider, modelKey) {
  const providerEntry = REGISTRY[provider];
  if (!providerEntry) {
    return null;
  }
  return providerEntry.models[modelKey] || null;
}

/**
 * Get all models for a provider as an array (useful for UI dropdowns).
 * @param {string} provider - Provider name
 * @returns {Array<{key: string, id: string, name: string, description: string}>}
 */
export function getModelsForProvider(provider) {
  const providerEntry = REGISTRY[provider];
  if (!providerEntry) {
    return [];
  }
  return Object.entries(providerEntry.models).map(([key, config]) => ({
    key,
    ...config,
  }));
}

/**
 * Resolve either a model key ('sonnet-5.5') or a raw model ID ('claude-sonnet-5-5')
 * to the actual API ID. A key or ID that has been replaced (REPLACED_MODELS) resolves to its
 * replacement, which is how a saved setting naming a retired model is migrated on read.
 * @param {string} provider - Provider name
 * @param {string} keyOrId - Model key or raw model ID
 * @returns {string} The API model ID
 */
export function resolveModel(provider, keyOrId) {
  const providerEntry = REGISTRY[provider];
  if (!providerEntry) {
    return keyOrId;
  }

  const replacement = REPLACED_MODELS[provider]?.[keyOrId];
  if (replacement) {
    return providerEntry.models[replacement].id;
  }

  // Check if it's a known key first
  const byKey = providerEntry.models[keyOrId];
  if (byKey) {
    return byKey.id;
  }

  // Check if it matches a known model ID
  const byId = Object.values(providerEntry.models).find(m => m.id === keyOrId);
  if (byId) {
    return byId.id;
  }

  // Pass through as-is (may be a dynamic model ID from provider API)
  return keyOrId;
}

/**
 * Get hardcoded fallback models for a provider (matches what cloud-router.js needs).
 * Returns model list in { id, name, description } format for API compatibility.
 * @param {string} provider - Provider name
 * @returns {Array<{id: string, name: string, description: string}>}
 */
export function getHardcodedFallbackModels(provider) {
  const providerEntry = REGISTRY[provider];
  if (!providerEntry) {
    return [];
  }
  return Object.values(providerEntry.models).map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
}
