/**
 * LLM Bridge for Content Scripts
 *
 * Provides a simple API for content scripts to communicate with the local LLM
 * via the service worker bridge. Content scripts cannot directly call localhost
 * due to CSP restrictions, so all requests go through the service worker.
 *
 * @module ai/llm-bridge
 */

/**
 * Check if local LLM is available
 * @returns {Promise<{available: boolean, models: string[], visionAvailable: boolean}>}
 */
export async function checkLLMAvailability() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_CHECK'
    });

    if (response.success) {
      return {
        available: response.available,
        models: response.models || [],
        visionAvailable: response.visionAvailable || false
      };
    }

    return { available: false, models: [], visionAvailable: false };
  } catch (error) {
    console.warn('[LLM Bridge] Availability check failed:', error);
    return { available: false, models: [], visionAvailable: false };
  }
}

/**
 * Generate text with the local LLM
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @returns {Promise<string|Object>}
 */
export async function generate(prompt, options = {}) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_GENERATE',
      prompt,
      options
    });

    if (response.success) {
      return response.data;
    }

    throw new Error(response.error || 'Generation failed');
  } catch (error) {
    console.error('[LLM Bridge] Generate failed:', error);
    throw error;
  }
}

/**
 * Generate with vision model (image understanding)
 * @param {string} imageBase64 - Base64 encoded image (without data URL prefix)
 * @param {string} prompt - Question about the image
 * @param {Object} options - Generation options
 * @returns {Promise<string>}
 */
export async function vision(imageBase64, prompt, options = {}) {
  try {
    // Remove data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_VISION',
      image: cleanBase64,
      prompt,
      options
    });

    if (response.success) {
      return response.data;
    }

    throw new Error(response.error || 'Vision request failed');
  } catch (error) {
    console.error('[LLM Bridge] Vision failed:', error);
    throw error;
  }
}

/**
 * Install a model via Ollama
 * @param {string} modelName - Model to install (e.g., 'llava', 'phi3:mini')
 * @returns {Promise<boolean>}
 */
export async function installModel(modelName) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_INSTALL_MODEL',
      modelName
    });

    if (response.success) {
      return true;
    }

    throw new Error(response.error || 'Installation failed');
  } catch (error) {
    console.error('[LLM Bridge] Install failed:', error);
    throw error;
  }
}

/**
 * Get list of available models
 * @returns {Promise<string[]>}
 */
export async function getModels() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_GET_MODELS'
    });

    if (response.success) {
      return response.models || [];
    }

    return [];
  } catch (error) {
    console.warn('[LLM Bridge] Get models failed:', error);
    return [];
  }
}

/**
 * Listen for model installation progress
 * @param {function} callback - Progress callback
 * @returns {function} Unsubscribe function
 */
export function onInstallProgress(callback) {
  const handler = (message) => {
    if (message.type === 'LLM_INSTALL_PROGRESS') {
      callback(message.modelName, message.progress);
    }
  };

  chrome.runtime.onMessage.addListener(handler);

  return () => {
    chrome.runtime.onMessage.removeListener(handler);
  };
}

// ========================================
// CONVENIENCE METHODS
// ========================================

/**
 * Summarize text with fallback
 * @param {string} text - Text to summarize
 * @param {Object} options - Options like level ('brief', 'moderate', 'detailed')
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
    maxTokens: level === 'detailed' ? 500 : 200,
    ...options
  });
}

/**
 * Simplify text for accessibility
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
    maxTokens: Math.max(text.length * 1.5, 300),
    ...options
  });
}

/**
 * Generate a Socratic question
 * @param {string} content - Content being studied
 * @param {string} studentQuestion - Optional student question to respond to
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

  return generate(prompt, { maxTokens: 150 });
}

/**
 * Analyze text for TTS prosody
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

  return generate(prompt, { format: 'json', maxTokens: 150 });
}

/**
 * Analyze assignment for task breakdown
 * @param {string} assignmentText - Assignment content
 * @returns {Promise<Object>}
 */
export async function analyzeAssignment(assignmentText) {
  const prompt = `Analyze this assignment and break it into actionable tasks.
Do NOT provide answers or solutions - only identify what needs to be done.

Assignment:
${assignmentText.slice(0, 2000)}

Return JSON with:
{
  "tasks": [
    {"task": "description", "estimatedMinutes": 30, "type": "research/writing/analysis/other"}
  ],
  "deliverables": ["list of what to submit"],
  "keyRequirements": ["important requirements"],
  "suggestedOrder": ["task order suggestion"]
}

JSON:`;

  return generate(prompt, { format: 'json', maxTokens: 800 });
}

/**
 * Describe an image for accessibility
 * @param {string} imageBase64 - Base64 image data
 * @param {string} context - Optional context about the image
 * @returns {Promise<string>}
 */
export async function describeImage(imageBase64, context = '') {
  const prompt = context
    ? `Describe this image in detail for someone who cannot see it. Context: ${context}\n\nProvide a clear, informative description:`
    : 'Describe this image in detail for someone who cannot see it. Include any text, charts, diagrams, or important visual elements. Be thorough but concise:';

  return vision(imageBase64, prompt);
}

/**
 * Evaluate source credibility
 * @param {Object} citation - Citation metadata
 * @returns {Promise<Object>}
 */
export async function evaluateSource(citation) {
  const prompt = `Evaluate this source for academic credibility:

Title: ${citation.title || 'Unknown'}
Author: ${citation.author || 'Unknown'}
Publication: ${citation.publication || 'Unknown'}
Date: ${citation.date || 'Unknown'}
URL: ${citation.url || 'Unknown'}

Return JSON with:
{
  "credibilityScore": 1-10,
  "strengths": ["list of strengths"],
  "concerns": ["potential concerns"],
  "suggestions": ["suggestions for improvement"],
  "sourceType": "academic/news/blog/government/other"
}

JSON:`;

  return generate(prompt, { format: 'json', maxTokens: 400 });
}

// Default export with all methods
export default {
  checkLLMAvailability,
  generate,
  vision,
  installModel,
  getModels,
  onInstallProgress,
  summarize,
  simplify,
  socraticQuestion,
  analyzeProsody,
  analyzeAssignment,
  describeImage,
  evaluateSource
};
