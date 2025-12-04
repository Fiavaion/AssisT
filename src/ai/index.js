/**
 * AssisT AI Module - Entry Point
 *
 * Provides local LLM integration for AI-powered accessibility features.
 * All processing happens locally via Ollama - no cloud services, FERPA compliant.
 *
 * @module ai
 */

// Core infrastructure
export { OllamaClient, getOllamaClient, MODEL_CONFIGS } from './ollama-client.js';
export { ModelManager, getModelManager, MODEL_SETS } from './model-manager.js';
export { ContextManager, getContextManager, ContextWindow, CONTEXT_LIMITS } from './context-manager.js';
export { FallbackManager, getFallbackManager, FALLBACK_BEHAVIORS } from './fallback-manager.js';

/**
 * Initialize AI subsystem
 * Call this once when extension loads
 * @returns {Promise<Object>} Initialization status
 */
export async function initializeAI() {
  const { getOllamaClient } = await import('./ollama-client.js');
  const { getModelManager } = await import('./model-manager.js');

  const client = getOllamaClient();
  const modelManager = getModelManager();

  // Check availability
  const status = await client.checkAvailability();

  console.log('[AI] Initialization complete:', {
    available: status.available,
    models: status.models.length,
    visionAvailable: status.visionAvailable
  });

  return {
    available: status.available,
    models: status.models,
    visionAvailable: status.visionAvailable,
    client,
    modelManager
  };
}

/**
 * Quick check if AI is available
 * @returns {Promise<boolean>}
 */
export async function isAIAvailable() {
  const { getOllamaClient } = await import('./ollama-client.js');
  const client = getOllamaClient();
  const status = await client.checkAvailability();
  return status.available;
}

/**
 * Quick AI generation with automatic model selection
 * @param {string} prompt - The prompt
 * @param {Object} options - Options including taskType
 * @returns {Promise<string|Object>}
 */
export async function generate(prompt, options = {}) {
  const { getOllamaClient } = await import('./ollama-client.js');
  const { getFallbackManager } = await import('./fallback-manager.js');

  const client = getOllamaClient();
  const status = await client.checkAvailability();

  if (!status.available) {
    const fallback = getFallbackManager();
    return fallback.getFallback(options.featureId || 'general', prompt);
  }

  // Auto-select model based on task type
  if (options.taskType && !options.model) {
    options.model = client.getBestModelForTask(options.taskType);
  }

  return client.generate(prompt, options);
}

/**
 * Vision AI generation
 * @param {string} imageBase64 - Base64 image data
 * @param {string} prompt - Question about the image
 * @param {Object} options - Options
 * @returns {Promise<string|Object>}
 */
export async function vision(imageBase64, prompt, options = {}) {
  const { getOllamaClient } = await import('./ollama-client.js');
  const { getFallbackManager } = await import('./fallback-manager.js');

  const client = getOllamaClient();
  const status = await client.checkAvailability();

  if (!status.visionAvailable) {
    const fallback = getFallbackManager();
    return fallback.getFallback('image-describe', null);
  }

  return client.vision(imageBase64, prompt, options);
}

/**
 * Convenience method: Summarize text
 * @param {string} text - Text to summarize
 * @param {Object} options - Options like length, style
 * @returns {Promise<string>}
 */
export async function summarize(text, options = {}) {
  const { level = 'brief' } = options;

  const levelPrompts = {
    brief: 'Summarize in 1-2 sentences:',
    moderate: 'Summarize the key points in a short paragraph:',
    detailed: 'Provide a comprehensive summary with main points:'
  };

  const prompt = `${levelPrompts[level] || levelPrompts.brief}\n\n${text}`;

  return generate(prompt, {
    taskType: 'balanced',
    featureId: 'summarize',
    maxTokens: level === 'detailed' ? 500 : 200
  });
}

/**
 * Convenience method: Simplify text
 * @param {string} text - Text to simplify
 * @param {Object} options - Options like readingLevel
 * @returns {Promise<string>}
 */
export async function simplify(text, options = {}) {
  const { readingLevel = 'grade8', preserveTerms = true } = options;

  const prompt = `Simplify this text for a ${readingLevel} reading level.
${preserveTerms ? 'Keep technical terms but explain them briefly.' : 'Replace jargon with simpler words.'}
Maintain accuracy and meaning.

Text: ${text}

Simplified version:`;

  return generate(prompt, {
    taskType: 'balanced',
    featureId: 'simplify',
    maxTokens: Math.max(text.length * 1.5, 300)
  });
}

/**
 * Convenience method: Generate Socratic question
 * @param {string} content - Content being studied
 * @param {string} studentQuestion - What the student asked
 * @returns {Promise<string>}
 */
export async function socraticQuestion(content, studentQuestion = null) {
  let prompt;

  if (studentQuestion) {
    prompt = `A student is reading this content:
"${content.slice(0, 1000)}"

They asked: "${studentQuestion}"

Respond with a Socratic question that guides them to discover the answer themselves.
Do NOT give the answer directly. Ask a thought-provoking question instead.

Socratic question:`;
  } else {
    prompt = `Based on this educational content:
"${content.slice(0, 1000)}"

Generate ONE thought-provoking comprehension question that:
- Tests understanding, not memorization
- Encourages deeper thinking
- Can be answered from the text

Question:`;
  }

  return generate(prompt, {
    taskType: 'balanced',
    featureId: 'socratic-question',
    maxTokens: 150
  });
}

/**
 * Convenience method: Analyze emotional tone for TTS prosody
 * @param {string} text - Text to analyze
 * @returns {Promise<Object>}
 */
export async function analyzeProsody(text) {
  const prompt = `Analyze the emotional tone of this text for text-to-speech:
"${text.slice(0, 500)}"

Return JSON with:
{
  "emotion": "encouraging/neutral/serious/exciting/calming",
  "rate": 0.8-1.2 (speech rate multiplier),
  "pitch": 0.9-1.1 (pitch multiplier),
  "emphasisWords": ["word1", "word2"] (words to emphasize)
}

JSON:`;

  return generate(prompt, {
    taskType: 'fast',
    featureId: 'prosody-analyze',
    format: 'json',
    maxTokens: 150
  });
}

// Default export with all main functions
export default {
  initializeAI,
  isAIAvailable,
  generate,
  vision,
  summarize,
  simplify,
  socraticQuestion,
  analyzeProsody
};
