/**
 * WebLLM Client for AssisT - Browser-Native AI
 *
 * Provides zero-config AI processing using WebGPU and @mlc-ai/web-llm
 * Models run entirely in browser with hardware acceleration
 *
 * Requirements:
 * - Chrome 113+ with WebGPU support
 * - ~2-4GB available RAM
 * - Models download once, cached in IndexedDB
 *
 * @module ai/webllm-client
 */

import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { REGISTRY } from './model-registry.js';

// ========================================
// MODEL CONFIGURATIONS
// ========================================

/**
 * WebLLM model configs — sourced from model-registry.js (single source of truth).
 * Re-exported for backward compatibility with any code importing MODEL_CONFIGS directly.
 * @deprecated Import from model-registry.js instead.
 */
export const MODEL_CONFIGS = REGISTRY.webllm.models;

const DEFAULT_CONFIG = {
  defaultModel: 'llama-3.2-1b',
  temperature: 0.7,
  maxTokens: 1024,
  timeout: 120000, // 2 minutes for first load
  cacheTTL: 300000, // 5 minutes
};

// ========================================
// HARDWARE DETECTION
// ========================================

/**
 * Check WebGPU availability and hardware capability
 * @returns {Promise<{available: boolean, status: string, error?: string, gpu?: string}>}
 */
export async function checkWebGPUAvailability() {
  // Check if WebGPU API exists
  if (!navigator.gpu) {
    return {
      available: false,
      status: 'not-supported',
      error: 'WebGPU not available. Requires Chrome 113+ or Edge 113+',
    };
  }

  try {
    // Request GPU adapter
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return {
        available: false,
        status: 'no-adapter',
        error: 'No WebGPU adapter found. GPU may not support WebGPU.',
      };
    }

    // Get GPU info for user feedback (optional - method may not be available)
    let gpuName = 'WebGPU Adapter';
    try {
      const info = await adapter.requestAdapterInfo();
      gpuName = info?.description || info?.device || 'WebGPU Adapter';
    } catch {
      // requestAdapterInfo() not supported - continue without GPU name
      console.log('[WebLLM] requestAdapterInfo() not available, using generic name');
    }

    // Request device to verify full support
    const device = await adapter.requestDevice();
    device.destroy(); // Clean up test device

    console.log('[WebLLM] WebGPU available, GPU:', gpuName);

    return {
      available: true,
      status: 'ready',
      gpu: gpuName,
    };
  } catch (error) {
    console.error('[WebLLM] WebGPU check failed:', error);
    return {
      available: false,
      status: 'error',
      error: `WebGPU initialization failed: ${error.message}`,
    };
  }
}

/**
 * Estimate if user's hardware can run a specific model
 * @param {string} modelKey - Model key from MODEL_CONFIGS
 * @returns {Promise<{capable: boolean, reason?: string}>}
 */
export async function checkModelCompatibility(modelKey) {
  const model = MODEL_CONFIGS[modelKey];
  if (!model) {
    return { capable: false, reason: 'Unknown model' };
  }

  // Check WebGPU first
  const webgpuCheck = await checkWebGPUAvailability();
  if (!webgpuCheck.available) {
    return { capable: false, reason: webgpuCheck.error };
  }

  // Estimate available memory (rough heuristic)
  // navigator.deviceMemory is available on Chrome
  if (navigator.deviceMemory) {
    const deviceRAM = navigator.deviceMemory; // in GB
    const modelRAM = parseFloat(model.vramRequired); // "1.2GB" -> 1.2

    if (deviceRAM < modelRAM) {
      return {
        capable: false,
        reason: `Requires ${model.vramRequired} RAM, device has ~${deviceRAM}GB`,
      };
    }
  }

  return { capable: true };
}

// ========================================
// WEBLLM CLIENT CLASS
// ========================================

/**
 * WebLLM Client Class
 * Manages engine lifecycle, model loading, and generation
 */
export class WebLLMClient {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.engine = null;
    this.currentModel = null;
    this.isLoading = false;
    this.isReady = false;
    this.loadProgress = { loaded: 0, total: 0, percent: 0, status: '' };
    this.progressCallbacks = new Set();
  }

  /**
   * Initialize engine with a specific model
   * @param {string} modelKey - Model key from MODEL_CONFIGS
   * @param {function} onProgress - Progress callback (optional)
   * @returns {Promise<void>}
   */
  async initialize(modelKey, onProgress = null) {
    const modelConfig = MODEL_CONFIGS[modelKey];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelKey}`);
    }

    // Check if already initialized with this model
    if (this.engine && this.currentModel === modelKey && this.isReady) {
      console.log('[WebLLM] Engine already initialized with', modelKey);
      return;
    }

    // Prevent concurrent initialization of the same model
    if (this.isLoading && this.currentModel === modelKey) {
      console.log('[WebLLM] Already loading', modelKey, '— waiting for completion');
      // Poll until ready or failed (max 5 min)
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const check = setInterval(() => {
          if (this.isReady) {
            clearInterval(check);
            resolve();
          } else if (!this.isLoading) {
            clearInterval(check);
            reject(new Error('Initialization failed'));
          } else if (Date.now() - start > 300_000) {
            clearInterval(check);
            reject(new Error('Initialization timed out'));
          }
        }, 500);
      });
      return;
    }

    // Check hardware compatibility
    const compat = await checkModelCompatibility(modelKey);
    if (!compat.capable) {
      throw new Error(`Hardware incompatible: ${compat.reason}`);
    }

    console.log('[WebLLM] Initializing model:', modelConfig.name);
    this.isLoading = true;
    this.isReady = false;

    try {
      // Add progress callback if provided
      if (onProgress) {
        this.progressCallbacks.add(onProgress);
      }

      // Create MLC engine with progress tracking
      this.engine = await CreateMLCEngine(modelConfig.id, {
        initProgressCallback: progress => {
          // progress = { text: string, progress?: number }
          this.loadProgress = {
            loaded: progress.progress || 0,
            total: 100,
            percent: Math.round((progress.progress || 0) * 100),
            status: progress.text || 'Loading...',
          };

          console.log(`[WebLLM] ${this.loadProgress.status} (${this.loadProgress.percent}%)`);

          // Notify all progress callbacks
          this.progressCallbacks.forEach(cb => {
            try {
              cb(this.loadProgress);
            } catch (err) {
              console.error('[WebLLM] Progress callback error:', err);
            }
          });
        },
      });

      this.currentModel = modelKey;
      this.isReady = true;
      this.isLoading = false;

      console.log('[WebLLM] Model ready:', modelConfig.name);

      // Remove progress callback after completion
      if (onProgress) {
        this.progressCallbacks.delete(onProgress);
      }
    } catch (error) {
      this.isLoading = false;
      this.isReady = false;
      console.error('[WebLLM] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Generate text completion
   * @param {string} prompt - Text prompt
   * @param {Object} options - Generation options
   * @returns {Promise<string>}
   */
  async generate(prompt, options = {}) {
    if (!this.engine || !this.isReady) {
      throw new Error('WebLLM engine not initialized. Call initialize() first.');
    }

    const temperature = options.temperature ?? this.config.temperature;
    const maxTokens = options.maxTokens ?? this.config.maxTokens;

    console.log('[WebLLM] Generating response, temp:', temperature);

    try {
      // Use chat completion API (compatible with OpenAI format)
      const completion = await this.engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      });

      const response = completion.choices[0]?.message?.content || '';

      console.log('[WebLLM] Generation complete, length:', response.length);
      return response;
    } catch (error) {
      console.error('[WebLLM] Generation error:', error);
      throw new Error(`WebLLM generation failed: ${error.message}`);
    }
  }

  /**
   * Stream generation (for future use)
   * @param {string} prompt - Text prompt
   * @param {Object} options - Generation options
   * @param {function} onChunk - Callback for each token
   * @returns {Promise<void>}
   */
  async generateStream(prompt, options = {}, onChunk) {
    if (!this.engine || !this.isReady) {
      throw new Error('WebLLM engine not initialized');
    }

    const temperature = options.temperature ?? this.config.temperature;
    const maxTokens = options.maxTokens ?? this.config.maxTokens;

    try {
      const stream = await this.engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          onChunk(content);
        }
      }
    } catch (error) {
      console.error('[WebLLM] Stream error:', error);
      throw error;
    }
  }

  /**
   * Get current engine status
   */
  getStatus() {
    return {
      ready: this.isReady,
      loading: this.isLoading,
      model: this.currentModel,
      modelName: this.currentModel ? MODEL_CONFIGS[this.currentModel]?.name : null,
      progress: this.loadProgress,
    };
  }

  /**
   * Unload current model and free memory
   */
  async unload() {
    if (this.engine) {
      console.log('[WebLLM] Unloading model');
      this.engine = null;
      this.currentModel = null;
      this.isReady = false;
    }
  }
}

// ========================================
// SINGLETON AND EXPORTS
// ========================================

// Singleton instance (lives in service worker)
let clientInstance = null;

/**
 * Get WebLLM client singleton
 * @param {Object} config - Configuration options
 * @returns {WebLLMClient}
 */
export function getWebLLMClient(config = {}) {
  if (!clientInstance) {
    clientInstance = new WebLLMClient(config);
  }
  return clientInstance;
}

/**
 * Quick availability check (exported for popup UI)
 * @returns {Promise<{available: boolean, status: string, error?: string}>}
 */
export async function checkWebLLMAvailability() {
  const webgpuCheck = await checkWebGPUAvailability();

  if (!webgpuCheck.available) {
    return webgpuCheck;
  }

  // Additional checks (e.g., IndexedDB for model caching)
  // Use self.indexedDB for service worker compatibility (window is not defined in service workers)
  const idb =
    typeof indexedDB !== 'undefined'
      ? indexedDB
      : typeof self !== 'undefined'
        ? self.indexedDB
        : null;
  if (!idb) {
    return {
      available: false,
      status: 'no-indexeddb',
      error: 'IndexedDB not available (required for model caching)',
    };
  }

  return {
    available: true,
    status: 'ready',
    gpu: webgpuCheck.gpu,
  };
}

/**
 * Get list of available models with metadata
 * @returns {Array<{key: string, name: string, size: string, description: string}>}
 */
export function getAvailableModels() {
  return Object.entries(MODEL_CONFIGS).map(([key, config]) => ({
    key,
    name: config.name,
    size: config.size,
    description: config.description,
    vramRequired: config.vramRequired,
    bestFor: config.bestFor,
    category: config.category,
  }));
}

/**
 * Check which models are already cached in IndexedDB
 * @returns {Promise<Set<string>>} Set of cached model IDs
 */
export async function getCachedModels() {
  try {
    // WebLLM stores models in IndexedDB under database "webllm"
    const idb =
      typeof indexedDB !== 'undefined'
        ? indexedDB
        : typeof self !== 'undefined'
          ? self.indexedDB
          : null;
    if (!idb) {
      console.warn('[WebLLM] IndexedDB not available for cache check');
      return new Set();
    }

    return new Promise(resolve => {
      // Open the webllm database (readonly to avoid creating it if it doesn't exist)
      const request = idb.open('webllm');

      request.onerror = () => {
        console.log('[WebLLM] Cache database not found - no models cached yet');
        resolve(new Set());
      };

      request.onsuccess = event => {
        const db = event.target.result;
        const cachedModelIds = new Set();

        try {
          // WebLLM stores models in an object store (usually called 'models' or similar)
          if (!db.objectStoreNames.contains('models')) {
            db.close();
            resolve(new Set());
            return;
          }

          const transaction = db.transaction(['models'], 'readonly');
          const store = transaction.objectStore('models');
          const getAllRequest = store.getAllKeys();

          getAllRequest.onsuccess = () => {
            const keys = getAllRequest.result || [];

            // Match cached keys to our MODEL_CONFIGS
            Object.entries(MODEL_CONFIGS).forEach(([modelKey, config]) => {
              // Check if any cached key contains this model ID
              const isCached = keys.some(key => typeof key === 'string' && key.includes(config.id));
              if (isCached) {
                cachedModelIds.add(modelKey);
              }
            });

            console.log('[WebLLM] Cached models:', Array.from(cachedModelIds));
            db.close();
            resolve(cachedModelIds);
          };

          getAllRequest.onerror = () => {
            db.close();
            resolve(new Set());
          };
        } catch (error) {
          console.warn('[WebLLM] Error checking cache:', error);
          db.close();
          resolve(new Set());
        }
      };
    });
  } catch (error) {
    console.warn('[WebLLM] Cache check failed:', error);
    return new Set();
  }
}

// Export default object with all exports
export default {
  WebLLMClient,
  getWebLLMClient,
  checkWebLLMAvailability,
  checkWebGPUAvailability,
  checkModelCompatibility,
  getAvailableModels,
  getCachedModels,
  MODEL_CONFIGS,
};
