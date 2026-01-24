/**
 * STT Engine Manager (Phase 2.8 - S.8)
 * Manages multiple STT engines with automatic fallback chain
 *
 * Fallback Chain: Whisper (offline) -> Web Speech (online) -> Azure (institutional)
 *
 * @module EngineManager
 * @version 1.0.0
 */

import { EngineStatus, EngineType } from './base-engine.js';

/**
 * Engine priority configuration
 */
const DEFAULT_PRIORITY = [EngineType.WHISPER, EngineType.WEB_SPEECH, EngineType.AZURE];

/**
 * Engine Manager class
 * Handles engine registration, selection, and automatic fallback
 */
export class EngineManager {
  constructor(options = {}) {
    this.engines = new Map();
    this.activeEngine = null;
    this.priority = options.priority || [...DEFAULT_PRIORITY];
    this.autoFallback = options.autoFallback !== undefined ? options.autoFallback : true;
    this.preferOffline = options.preferOffline !== undefined ? options.preferOffline : true;

    // Callbacks
    this.onEngineChange = options.onEngineChange || (() => {});
    this.onFallback = options.onFallback || (() => {});
    this.onError = options.onError || (() => {});
    this.onAllEnginesFailed = options.onAllEnginesFailed || (() => {});

    // Connection monitoring
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.setupConnectionMonitoring();

    console.log('[EngineManager] Initialized with priority:', this.priority);
  }

  /**
   * Setup network connection monitoring
   * @private
   */
  setupConnectionMonitoring() {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('online', () => {
      console.log('[EngineManager] Network online');
      this.isOnline = true;
      this.checkEngineAvailability();
    });

    window.addEventListener('offline', () => {
      console.log('[EngineManager] Network offline');
      this.isOnline = false;
      this.handleOfflineMode();
    });
  }

  /**
   * Register an engine
   * @param {string} type - Engine type (from EngineType enum)
   * @param {BaseSTTEngine} engine - Engine instance
   */
  registerEngine(type, engine) {
    this.engines.set(type, engine);
    console.log(`[EngineManager] Registered engine: ${type}`);
  }

  /**
   * Unregister an engine
   * @param {string} type - Engine type
   */
  unregisterEngine(type) {
    const engine = this.engines.get(type);
    if (engine) {
      if (this.activeEngine === engine) {
        this.activeEngine = null;
      }
      engine.destroy();
      this.engines.delete(type);
      console.log(`[EngineManager] Unregistered engine: ${type}`);
    }
  }

  /**
   * Get an engine by type
   * @param {string} type - Engine type
   * @returns {BaseSTTEngine|null}
   */
  getEngine(type) {
    return this.engines.get(type) || null;
  }

  /**
   * Get all registered engines
   * @returns {Map}
   */
  getAllEngines() {
    return new Map(this.engines);
  }

  /**
   * Initialize all registered engines
   * @returns {Promise<Object>} - Initialization results
   */
  async initializeAll() {
    const results = {};

    for (const [type, engine] of this.engines) {
      try {
        const startTime = Date.now();
        const available = await engine.isAvailable();

        if (available) {
          await engine.initialize();
          results[type] = {
            success: true,
            initTime: Date.now() - startTime,
          };
          console.log(`[EngineManager] ${type} initialized in ${results[type].initTime}ms`);
        } else {
          results[type] = {
            success: false,
            reason: 'unavailable',
          };
          console.log(`[EngineManager] ${type} is unavailable`);
        }
      } catch (error) {
        results[type] = {
          success: false,
          reason: error.message,
        };
        console.error(`[EngineManager] ${type} initialization failed:`, error);
      }
    }

    // Select best available engine
    await this.selectBestEngine();

    return results;
  }

  /**
   * Select the best available engine based on priority and availability
   * @returns {Promise<BaseSTTEngine|null>}
   */
  async selectBestEngine() {
    // If preferring offline and offline mode is available, prioritize Whisper
    const priorityOrder =
      this.preferOffline && !this.isOnline
        ? [EngineType.WHISPER, ...this.priority.filter(t => t !== EngineType.WHISPER)]
        : this.priority;

    for (const type of priorityOrder) {
      const engine = this.engines.get(type);
      if (engine && engine.getStatus() === EngineStatus.READY) {
        // Check if engine requires network and we're offline
        const capabilities = engine.getCapabilities();
        if (!this.isOnline && !capabilities.offline) {
          console.log(`[EngineManager] Skipping ${type} - requires network`);
          continue;
        }

        await this.setActiveEngine(type);
        return engine;
      }
    }

    console.warn('[EngineManager] No available engines');
    this.onAllEnginesFailed();
    return null;
  }

  /**
   * Set the active engine
   * @param {string} type - Engine type
   * @returns {Promise<boolean>}
   */
  async setActiveEngine(type) {
    const engine = this.engines.get(type);
    if (!engine) {
      console.error(`[EngineManager] Engine not found: ${type}`);
      return false;
    }

    // Stop current engine if listening
    if (this.activeEngine && this.activeEngine.getStatus() === EngineStatus.LISTENING) {
      await this.activeEngine.stopListening();
    }

    const previousType = this.activeEngine?.getEngineType();
    this.activeEngine = engine;

    if (previousType !== type) {
      this.onEngineChange(type, previousType);
      console.log(`[EngineManager] Active engine changed: ${previousType} -> ${type}`);
    }

    return true;
  }

  /**
   * Get the currently active engine
   * @returns {BaseSTTEngine|null}
   */
  getActiveEngine() {
    return this.activeEngine;
  }

  /**
   * Get active engine type
   * @returns {string|null}
   */
  getActiveEngineType() {
    return this.activeEngine?.getEngineType() || null;
  }

  /**
   * Start listening using the active engine
   * @returns {Promise<boolean>}
   */
  async startListening() {
    if (!this.activeEngine) {
      const selected = await this.selectBestEngine();
      if (!selected) {
        this.onError(new Error('No speech recognition engine available'));
        return false;
      }
    }

    try {
      return await this.activeEngine.startListening();
    } catch (error) {
      console.error('[EngineManager] Start listening failed:', error);
      if (this.autoFallback) {
        return await this.fallbackToNextEngine(error);
      }
      throw error;
    }
  }

  /**
   * Stop listening
   * @returns {Promise<boolean>}
   */
  async stopListening() {
    if (!this.activeEngine) {
      return false;
    }
    return await this.activeEngine.stopListening();
  }

  /**
   * Pause listening
   * @returns {Promise<boolean>}
   */
  async pauseListening() {
    if (!this.activeEngine) {
      return false;
    }
    return await this.activeEngine.pauseListening();
  }

  /**
   * Resume listening
   * @returns {Promise<boolean>}
   */
  async resumeListening() {
    if (!this.activeEngine) {
      return false;
    }
    return await this.activeEngine.resumeListening();
  }

  /**
   * Fallback to the next available engine
   * @param {Error} error - The error that triggered fallback
   * @returns {Promise<boolean>}
   * @private
   */
  async fallbackToNextEngine(error) {
    const currentType = this.activeEngine?.getEngineType();
    const currentIndex = this.priority.indexOf(currentType);

    console.log(`[EngineManager] Attempting fallback from ${currentType}`);

    // Try engines after current in priority
    for (let i = currentIndex + 1; i < this.priority.length; i++) {
      const nextType = this.priority[i];
      const engine = this.engines.get(nextType);

      if (engine && engine.getStatus() === EngineStatus.READY) {
        const capabilities = engine.getCapabilities();
        if (!this.isOnline && !capabilities.offline) {
          continue;
        }

        console.log(`[EngineManager] Falling back to ${nextType}`);
        this.onFallback(nextType, currentType, error);

        await this.setActiveEngine(nextType);

        try {
          return await this.activeEngine.startListening();
        } catch (fallbackError) {
          console.error(`[EngineManager] Fallback to ${nextType} failed:`, fallbackError);
          continue;
        }
      }
    }

    console.error('[EngineManager] All fallback engines failed');
    this.onAllEnginesFailed();
    return false;
  }

  /**
   * Handle offline mode - switch to offline-capable engine
   * @private
   */
  async handleOfflineMode() {
    if (!this.activeEngine) {
      return;
    }

    const capabilities = this.activeEngine.getCapabilities();
    if (!capabilities.offline) {
      console.log('[EngineManager] Current engine requires network, switching to offline engine');

      // Find an offline-capable engine
      for (const type of this.priority) {
        const engine = this.engines.get(type);
        if (engine) {
          const caps = engine.getCapabilities();
          if (caps.offline && engine.getStatus() === EngineStatus.READY) {
            await this.setActiveEngine(type);
            return;
          }
        }
      }

      console.warn('[EngineManager] No offline-capable engine available');
    }
  }

  /**
   * Check engine availability and re-select if needed
   * @private
   */
  async checkEngineAvailability() {
    // When coming online, check if we can use a better engine
    if (this.isOnline && this.activeEngine) {
      const currentType = this.activeEngine.getEngineType();
      const currentPriority = this.priority.indexOf(currentType);

      // Check if there's a higher priority engine now available
      for (let i = 0; i < currentPriority; i++) {
        const type = this.priority[i];
        const engine = this.engines.get(type);
        if (engine && engine.getStatus() === EngineStatus.READY) {
          console.log(`[EngineManager] Higher priority engine ${type} now available`);
          // Don't auto-switch while listening - just log
          break;
        }
      }
    }
  }

  /**
   * Update settings on all engines
   * @param {Object} settings - Settings to update
   */
  updateSettings(settings) {
    for (const [, engine] of this.engines) {
      engine.updateSettings(settings);
    }
  }

  /**
   * Get aggregated metrics from all engines
   * @returns {Object}
   */
  getMetrics() {
    const metrics = {};
    for (const [type, engine] of this.engines) {
      metrics[type] = engine.getMetrics();
    }
    return metrics;
  }

  /**
   * Get status of all engines
   * @returns {Object}
   */
  getStatus() {
    const status = {
      isOnline: this.isOnline,
      activeEngine: this.activeEngine?.getEngineType() || null,
      engines: {},
    };

    for (const [type, engine] of this.engines) {
      status.engines[type] = {
        status: engine.getStatus(),
        displayName: engine.getDisplayName(),
        capabilities: engine.getCapabilities(),
      };
    }

    return status;
  }

  /**
   * Set engine priority order
   * @param {Array<string>} priority - Priority order
   */
  setPriority(priority) {
    this.priority = [...priority];
    console.log('[EngineManager] Priority updated:', this.priority);
  }

  /**
   * Destroy all engines and clean up
   */
  async destroy() {
    for (const [type, engine] of this.engines) {
      await engine.destroy();
      console.log(`[EngineManager] Destroyed engine: ${type}`);
    }
    this.engines.clear();
    this.activeEngine = null;
  }
}

export default EngineManager;
export { EngineType, EngineStatus };
