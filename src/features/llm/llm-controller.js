/**
 * LLM Controller - Local LLM Integration for AssisT
 *
 * This module provides integration with local LLM services (Ollama, LM Studio, etc.)
 * Only included in the LLM build variant.
 *
 * @module llm-controller
 */

// Default configuration for local LLM services
const DEFAULT_CONFIG = {
  // Ollama default endpoint
  ollamaUrl: 'http://localhost:11434',
  // LM Studio default endpoint
  lmStudioUrl: 'http://localhost:1234',
  // Default model (can be changed in settings)
  defaultModel: 'llama3.2',
  // Request timeout in ms
  timeout: 30000,
};

/**
 * LLM Controller class for managing local LLM interactions
 */
export class LLMController {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isConnected = false;
    this.currentProvider = null;
  }

  /**
   * Check if a local LLM service is available
   * @returns {Promise<{available: boolean, provider: string|null}>}
   */
  async checkAvailability() {
    // Try Ollama first
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        this.isConnected = true;
        this.currentProvider = 'ollama';
        return { available: true, provider: 'ollama' };
      }
    } catch (e) {
      console.log('[LLM] Ollama not available:', e.message);
    }

    // Try LM Studio
    try {
      const response = await fetch(`${this.config.lmStudioUrl}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        this.isConnected = true;
        this.currentProvider = 'lm-studio';
        return { available: true, provider: 'lm-studio' };
      }
    } catch (e) {
      console.log('[LLM] LM Studio not available:', e.message);
    }

    this.isConnected = false;
    this.currentProvider = null;
    return { available: false, provider: null };
  }

  /**
   * Get list of available models from the connected provider
   * @returns {Promise<string[]>}
   */
  async getModels() {
    if (!this.isConnected) {
      await this.checkAvailability();
    }

    if (this.currentProvider === 'ollama') {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      return data.models?.map(m => m.name) || [];
    }

    if (this.currentProvider === 'lm-studio') {
      const response = await fetch(`${this.config.lmStudioUrl}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      return data.data?.map(m => m.id) || [];
    }

    return [];
  }

  /**
   * Send a completion request to the local LLM
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Additional options
   * @returns {Promise<string>}
   */
  async complete(prompt, options = {}) {
    if (!this.isConnected) {
      const status = await this.checkAvailability();
      if (!status.available) {
        throw new Error('No local LLM service available');
      }
    }

    const model = options.model || this.config.defaultModel;

    if (this.currentProvider === 'ollama') {
      return this._ollamaComplete(prompt, model, options);
    }

    if (this.currentProvider === 'lm-studio') {
      return this._lmStudioComplete(prompt, model, options);
    }

    throw new Error('No provider connected');
  }

  /**
   * Ollama-specific completion
   * @private
   */
  async _ollamaComplete(prompt, model, options) {
    const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        ...options,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  /**
   * LM Studio-specific completion (OpenAI-compatible API)
   * @private
   */
  async _lmStudioComplete(prompt, model, options) {
    const response = await fetch(`${this.config.lmStudioUrl}/v1/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        max_tokens: options.maxTokens || 500,
        temperature: options.temperature || 0.7,
        ...options,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.text || '';
  }

  /**
   * Summarize text using the local LLM
   * @param {string} text - Text to summarize
   * @param {Object} options - Summarization options
   * @returns {Promise<string>}
   */
  async summarize(text, options = {}) {
    const prompt = `Please provide a concise summary of the following text:\n\n${text}\n\nSummary:`;
    return this.complete(prompt, options);
  }

  /**
   * Simplify text for better accessibility
   * @param {string} text - Text to simplify
   * @param {string} level - Reading level ('elementary', 'middle', 'high', 'college')
   * @returns {Promise<string>}
   */
  async simplify(text, level = 'middle') {
    const levelDescriptions = {
      elementary: 'a 5th grade student',
      middle: 'a middle school student',
      high: 'a high school student',
      college: 'a college freshman',
    };

    const prompt = `Rewrite the following text so it can be easily understood by ${levelDescriptions[level] || levelDescriptions.middle}. Keep the meaning but use simpler words and shorter sentences:\n\n${text}\n\nSimplified version:`;
    return this.complete(prompt);
  }

  /**
   * Generate questions about text for comprehension
   * @param {string} text - Text to generate questions about
   * @param {number} count - Number of questions to generate
   * @returns {Promise<string[]>}
   */
  async generateQuestions(text, count = 3) {
    const prompt = `Generate ${count} comprehension questions about the following text. Return only the questions, one per line:\n\n${text}\n\nQuestions:`;
    const response = await this.complete(prompt);
    return response.split('\n').filter(q => q.trim().length > 0);
  }
}

// Singleton instance
let llmInstance = null;

/**
 * Get the LLM controller instance
 * @returns {LLMController}
 */
export function getLLMController() {
  if (!llmInstance) {
    llmInstance = new LLMController();
  }
  return llmInstance;
}

export default LLMController;
