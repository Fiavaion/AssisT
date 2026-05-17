/**
 * Model Registry — Single Source of Truth for All AI Model Configurations
 *
 * All AI providers and their model definitions live here.
 * Feature files, clients, and the popup import from this module.
 * Never hardcode model IDs elsewhere in the codebase.
 *
 * @module ai/model-registry
 */

// ============================================================================
// CLOUD PROVIDERS
// ============================================================================

const ANTHROPIC_MODELS = {
  'haiku-4.5': {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku (Fast)',
    description: 'Fast and economical',
    avgCost: 0.001,
    outputCost: 0.005,
  },
  'sonnet-4.6': {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet (Recommended)',
    description: 'Best for everyday tasks',
    avgCost: 0.003,
    outputCost: 0.015,
  },
  'opus-4.7': {
    id: 'claude-opus-4-7',
    name: 'Opus (Most Capable)',
    description: 'Most capable for complex work',
    avgCost: 0.015,
    outputCost: 0.075,
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

const GOOGLE_MODELS = {
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro (Most Capable)',
    description: 'Most capable — complex tasks',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Highly capable',
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (Recommended)',
    description: 'Best for everyday tasks',
  },
  'gemini-2.0-flash-lite': {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite (Fast)',
    description: 'Fastest, most economical',
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

// ============================================================================
// LOCAL PROVIDERS
// ============================================================================

const OLLAMA_MODELS = {
  'phi3:mini': {
    id: 'phi3:mini',
    name: 'Phi-3 Mini',
    size: '3.8B',
    description: 'Fast responses for real-time tasks',
    bestFor: ['state-detection', 'quick-responses', 'simple-queries'],
    avgResponseTime: 500,
  },
  'llama3.2': {
    id: 'llama3.2',
    name: 'Llama 3.2',
    size: '8B',
    description: 'Balanced performance for most tasks',
    bestFor: ['conversation', 'summaries', 'analysis', 'tutoring'],
    avgResponseTime: 1500,
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral 7B',
    size: '7B',
    description: 'Excellent instruction following',
    bestFor: ['complex-analysis', 'writing-help', 'detailed-explanations'],
    avgResponseTime: 1200,
  },
  llava: {
    id: 'llava',
    name: 'LLaVA',
    size: '7B',
    description: 'Vision + Language model',
    bestFor: ['image-description', 'page-analysis', 'visual-understanding'],
    avgResponseTime: 2000,
    isVision: true,
  },
};

// ============================================================================
// WEBLLM (BROWSER-NATIVE)
// ============================================================================

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
  'gemma-7b': {
    id: 'gemma-7b-it-q4f16_1-MLC',
    name: 'Gemma 7B',
    size: '4.3GB',
    vramRequired: '5.5GB',
    description: "Google's larger model, high performance",
    bestFor: ['detailed-analysis', 'tutoring', 'research'],
    avgSpeed: 'Slower (6-11 tok/s)',
    quantization: 'q4f16_1',
    category: 'high-quality',
  },
};

// ============================================================================
// FULL REGISTRY
// ============================================================================

export const REGISTRY = {
  anthropic: {
    models: ANTHROPIC_MODELS,
    defaultModel: 'sonnet-4.6',
    featureDefaults: {
      summarization: 'haiku-4.5',
      textSimplification: 'sonnet-4.6',
      assignmentBreakdown: 'sonnet-4.6',
      citationAnalyzer: 'sonnet-4.6',
      socraticTutor: 'sonnet-4.6',
      imageUnderstanding: 'sonnet-4.6',
      studyPathGenerator: 'sonnet-4.6',
      multiDocCompare: 'opus-4.7',
      knowledgeGraph: 'sonnet-4.6',
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
    defaultModel: 'gemini-2.0-flash',
    featureDefaults: {
      summarization: 'gemini-2.0-flash',
      textSimplification: 'gemini-2.0-flash',
      assignmentBreakdown: 'gemini-2.0-flash',
      citationAnalyzer: 'gemini-2.0-flash',
      socraticTutor: 'gemini-3.1-pro-preview',
      imageUnderstanding: 'gemini-2.0-flash',
      studyPathGenerator: 'gemini-3.1-pro-preview',
      multiDocCompare: 'gemini-3.1-pro-preview',
      knowledgeGraph: 'gemini-2.0-flash',
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
    defaultModel: 'llama3.2',
    fastModel: 'phi3:mini',
    visionModel: 'llava',
  },
  webllm: {
    models: WEBLLM_MODELS,
    defaultModel: 'llama-3.2-1b',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
 * Resolve either a model key ('sonnet-4.6') or a raw model ID ('claude-sonnet-4-6')
 * to the actual API ID. Handles both forms for backward compatibility.
 * @param {string} provider - Provider name
 * @param {string} keyOrId - Model key or raw model ID
 * @returns {string} The API model ID
 */
export function resolveModel(provider, keyOrId) {
  const providerEntry = REGISTRY[provider];
  if (!providerEntry) {
    return keyOrId;
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
