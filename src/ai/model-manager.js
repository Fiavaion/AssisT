/**
 * Model Manager for AssisT LLM Edition
 *
 * Handles:
 * - Model installation with one-click UI
 * - Model switching based on task requirements
 * - Download progress tracking
 * - Model recommendation based on device capabilities
 *
 * @module ai/model-manager
 */

import { getOllamaClient, MODEL_CONFIGS } from './ollama-client.js';

// Recommended model sets for different user preferences
const MODEL_SETS = {
  minimal: {
    name: 'Minimal',
    description: 'Fast responses, lower resource usage (~2GB)',
    models: ['phi3:mini'],
    totalSize: '2GB'
  },
  balanced: {
    name: 'Balanced',
    description: 'Good performance for most tasks (~5GB)',
    models: ['phi3:mini', 'llama3.2'],
    totalSize: '5GB'
  },
  full: {
    name: 'Full',
    description: 'All features including vision (~10GB)',
    models: ['phi3:mini', 'llama3.2', 'mistral', 'llava'],
    totalSize: '10GB'
  },
  visionOnly: {
    name: 'Vision Add-on',
    description: 'Add image understanding capability (~4GB)',
    models: ['llava'],
    totalSize: '4GB'
  }
};

/**
 * Model Manager class
 */
export class ModelManager {
  constructor() {
    this.client = getOllamaClient();
    this.installProgress = new Map();
    this.listeners = new Set();
  }

  /**
   * Get status of all known models
   * @returns {Promise<Array>}
   */
  async getModelStatus() {
    const status = await this.client.checkAvailability();
    const installedModels = status.models || [];

    return Object.entries(MODEL_CONFIGS).map(([key, config]) => {
      const isInstalled = installedModels.some(m =>
        m === key || m.startsWith(key.split(':')[0])
      );

      const installedVersion = isInstalled
        ? installedModels.find(m => m.startsWith(key.split(':')[0]))
        : null;

      return {
        id: key,
        ...config,
        installed: isInstalled,
        installedVersion,
        installing: this.installProgress.has(key),
        progress: this.installProgress.get(key) || null
      };
    });
  }

  /**
   * Check if a specific model is installed
   * @param {string} modelId - Model identifier
   * @returns {Promise<boolean>}
   */
  async isModelInstalled(modelId) {
    const status = await this.client.checkAvailability();
    return status.models.some(m =>
      m === modelId || m.startsWith(modelId.split(':')[0])
    );
  }

  /**
   * Install a model with progress tracking
   * @param {string} modelId - Model to install
   * @returns {Promise<boolean>}
   */
  async installModel(modelId) {
    if (this.installProgress.has(modelId)) {
      console.log(`[ModelManager] ${modelId} already installing`);
      return false;
    }

    this.installProgress.set(modelId, { status: 'starting', percent: 0 });
    this._notifyListeners('install-start', { modelId });

    try {
      await this.client.installModel(modelId, (progress) => {
        this.installProgress.set(modelId, progress);
        this._notifyListeners('install-progress', { modelId, progress });
      });

      this.installProgress.delete(modelId);
      this._notifyListeners('install-complete', { modelId });
      return true;

    } catch (error) {
      this.installProgress.delete(modelId);
      this._notifyListeners('install-error', { modelId, error: error.message });
      throw error;
    }
  }

  /**
   * Install a model set (multiple models)
   * @param {string} setName - Name of model set (minimal, balanced, full)
   * @returns {Promise<boolean>}
   */
  async installModelSet(setName) {
    const modelSet = MODEL_SETS[setName];
    if (!modelSet) {
      throw new Error(`Unknown model set: ${setName}`);
    }

    console.log(`[ModelManager] Installing model set: ${setName}`);

    for (const modelId of modelSet.models) {
      if (!(await this.isModelInstalled(modelId))) {
        await this.installModel(modelId);
      }
    }

    return true;
  }

  /**
   * Get the best model for a specific task
   * @param {string} taskType - Type of task
   * @returns {Promise<string|null>}
   */
  async getBestModelForTask(taskType) {
    const status = await this.client.checkAvailability();
    if (!status.available) return null;

    return this.client.getBestModelForTask(taskType);
  }

  /**
   * Get model sets information
   * @returns {Object}
   */
  getModelSets() {
    return MODEL_SETS;
  }

  /**
   * Get recommended model set based on available resources
   * This is a simple heuristic - could be enhanced with actual memory detection
   * @returns {string}
   */
  getRecommendedSet() {
    // Default to balanced for most users
    // Could enhance with navigator.deviceMemory if available
    if (navigator.deviceMemory) {
      if (navigator.deviceMemory >= 16) return 'full';
      if (navigator.deviceMemory >= 8) return 'balanced';
      return 'minimal';
    }
    return 'balanced';
  }

  /**
   * Add listener for model events
   * @param {function} callback
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   * @private
   */
  _notifyListeners(event, data) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (e) {
        console.error('[ModelManager] Listener error:', e);
      }
    }
  }

  /**
   * Check if vision features should be available
   * @returns {Promise<boolean>}
   */
  async isVisionAvailable() {
    const status = await this.client.checkAvailability();
    return status.visionAvailable;
  }

  /**
   * Quick install vision model (one-click)
   * @returns {Promise<boolean>}
   */
  async installVision() {
    return this.installModel('llava');
  }
}

// Singleton instance
let managerInstance = null;

/**
 * Get the model manager singleton
 * @returns {ModelManager}
 */
export function getModelManager() {
  if (!managerInstance) {
    managerInstance = new ModelManager();
  }
  return managerInstance;
}

export { MODEL_SETS };
export default ModelManager;
