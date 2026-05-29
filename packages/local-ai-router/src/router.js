/**
 * LocalAIRouter — four-mode local AI routing with graceful degradation.
 *
 * Degradation order (in 'auto' mode):
 *   Ollama → WebLLM → Chrome Prompt API → cloud
 *
 * Each mode is checked for availability before use. If a mode is unavailable
 * the router tries the next one. If all modes fail a RouterError is thrown.
 *
 * Extraction status (May 2026): availability checks and routing logic are
 * complete; WebLLM engine lifecycle (model download, initialisation) is
 * retained in AssisT's service worker and will be extracted in the full
 * NLnet-funded library release.
 *
 * @module local-ai-router/router
 */

import { checkOllamaAvailability, ollamaGenerate } from './providers/ollama.js';
import { checkWebLLMAvailability, webllmGenerate } from './providers/webllm.js';
import { checkPromptAPIAvailability, promptAPIGenerate } from './providers/promptapi.js';
import { checkCloudAvailability, cloudGenerate } from './providers/cloud.js';

/** @import { RouterConfig, GenerateOptions, GenerateResult, AvailabilityMap, UsedMode } from '../types/index.d.ts' */

const DEGRADATION_ORDER = ['ollama', 'webllm', 'promptapi', 'cloud'];

export class RouterError extends Error {
  /**
   * @param {string} message
   * @param {{ mode?: string, retryable?: boolean, statusCode?: number }} [meta]
   */
  constructor(message, { mode = 'unknown', retryable = false, statusCode = null } = {}) {
    super(message);
    this.name = 'RouterError';
    this.mode = mode;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

export class LocalAIRouter {
  /** @param {RouterConfig} config */
  constructor(config = {}) {
    this._config = {
      preferredMode: 'auto',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
      webllmModel: 'llama-3.2-1b-instruct-q4f32_1-MLC',
      cloudProvider: 'anthropic',
      cloudApiKey: null,
      timeout: 30000,
      ...config,
    };
    this._webllmEngine = null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Generate text using the best available inference mode.
   *
   * @param {string} prompt
   * @param {GenerateOptions} [options]
   * @returns {Promise<GenerateResult>}
   */
  async generate(prompt, options = {}) {
    const requestedMode = options.mode ?? this._config.preferredMode;

    if (requestedMode !== 'auto') {
      return this._generateWithMode(prompt, requestedMode, options);
    }

    const errors = [];
    for (const mode of DEGRADATION_ORDER) {
      try {
        const avail = await this._checkMode(mode);
        if (!avail.available) {
          errors.push(`${mode}: ${avail.reason}`);
          continue;
        }
        return await this._generateWithMode(prompt, mode, options);
      } catch (err) {
        errors.push(`${mode}: ${err.message}`);
      }
    }

    throw new RouterError(
      `All inference modes failed:\n${errors.map(e => `  - ${e}`).join('\n')}`,
      { mode: 'auto', retryable: false }
    );
  }

  /**
   * Check availability of all inference modes.
   *
   * @returns {Promise<AvailabilityMap>}
   */
  async checkAvailability() {
    const [ollama, webllm, promptapi, cloud] = await Promise.all([
      this._checkMode('ollama'),
      this._checkMode('webllm'),
      this._checkMode('promptapi'),
      this._checkMode('cloud'),
    ]);

    return { ollama, webllm, promptapi, cloud };
  }

  /**
   * Return which mode would be used for the next generate() call.
   *
   * @returns {Promise<UsedMode | null>}
   */
  async getActiveMode() {
    const preferred = this._config.preferredMode;
    if (preferred !== 'auto') {
      const avail = await this._checkMode(preferred);
      return avail.available ? preferred : null;
    }

    for (const mode of DEGRADATION_ORDER) {
      const avail = await this._checkMode(mode);
      if (avail.available) return mode;
    }
    return null;
  }

  /** @param {Partial<RouterConfig>} updates */
  configure(updates) {
    Object.assign(this._config, updates);
  }

  destroy() {
    this._webllmEngine?.unload?.();
    this._webllmEngine = null;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  async _checkMode(mode) {
    const base = { needsApiKey: false, needsOllama: false, needsWebLLMInit: false };

    if (mode === 'ollama') {
      const result = await checkOllamaAvailability({ baseUrl: this._config.ollamaBaseUrl });
      return { ...base, ...result, needsOllama: !result.available };
    }

    if (mode === 'webllm') {
      const result = await checkWebLLMAvailability();
      return { ...base, ...result, needsWebLLMInit: result.available && !this._webllmEngine };
    }

    if (mode === 'promptapi') {
      const result = await checkPromptAPIAvailability();
      return { ...base, ...result };
    }

    if (mode === 'cloud') {
      const result = checkCloudAvailability({
        provider: this._config.cloudProvider,
        apiKey: this._config.cloudApiKey,
      });
      return { ...base, ...result, needsApiKey: !result.available };
    }

    return { available: false, reason: `Unknown mode: ${mode}`, ...base };
  }

  /**
   * @param {string} prompt
   * @param {string} mode
   * @param {GenerateOptions} options
   * @returns {Promise<GenerateResult>}
   */
  async _generateWithMode(prompt, mode, options) {
    const { maxTokens = 1024, temperature = 0.7, systemPrompt } = options;
    const cfg = this._config;

    if (mode === 'ollama') {
      const result = await ollamaGenerate(prompt, {
        baseUrl: cfg.ollamaBaseUrl,
        model: cfg.ollamaModel,
        maxTokens, temperature, systemPrompt,
        timeout: cfg.timeout,
      });
      return { ...result, mode: 'ollama', cached: false };
    }

    if (mode === 'webllm') {
      if (!this._webllmEngine) {
        throw new RouterError('WebLLM engine not initialised — call initWebLLM() first', { mode: 'webllm', retryable: false });
      }
      const result = await webllmGenerate(prompt, this._webllmEngine, { maxTokens, temperature, systemPrompt });
      return { ...result, mode: 'webllm', cached: false };
    }

    if (mode === 'promptapi') {
      const result = await promptAPIGenerate(prompt, { maxTokens, temperature, systemPrompt });
      return { ...result, mode: 'promptapi', cached: false };
    }

    if (mode === 'cloud') {
      const result = await cloudGenerate(prompt, {
        provider: cfg.cloudProvider,
        apiKey: cfg.cloudApiKey,
        maxTokens, temperature, systemPrompt,
        timeout: cfg.timeout,
      });
      return { ...result, mode: 'cloud', cached: false };
    }

    throw new RouterError(`Unknown mode: ${mode}`, { mode, retryable: false });
  }
}
