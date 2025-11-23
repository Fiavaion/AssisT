/**
 * Migration Manager for Annotations
 *
 * Handles seamless migration of annotations between storage modes:
 * - chrome.storage.local (LocalStorageAdapter)
 * - IndexedDB (DexieStorageAdapter)
 *
 * Migration process:
 * 1. Export all annotations from source adapter
 * 2. Import annotations into target adapter
 * 3. Verify migration success
 * 4. Clear source storage (optional)
 * 5. Update settings to new storage mode
 */

import { getStorageAdapter } from './storage-adapter.js';
import { settingsManager } from '../../core/storage/settings-manager.js';

/**
 * Migration progress callback
 * @callback ProgressCallback
 * @param {Object} progress - Progress information
 * @param {string} progress.status - Current status ('exporting', 'importing', 'verifying', 'complete', 'error')
 * @param {number} progress.current - Current item count
 * @param {number} progress.total - Total item count
 * @param {string} progress.message - Human-readable message
 */

/**
 * Migrate annotations between storage modes
 *
 * @param {string} fromMode - Source storage mode ('local' or 'indexeddb')
 * @param {string} toMode - Target storage mode ('local' or 'indexeddb')
 * @param {Object} options - Migration options
 * @param {boolean} [options.clearSource=true] - Clear source storage after migration
 * @param {ProgressCallback} [options.onProgress] - Progress callback function
 * @returns {Promise<Object>} Migration result { success, count, error }
 */
export async function migrateAnnotations(fromMode, toMode, options = {}) {
  const { clearSource = true, onProgress } = options;

  // Validation
  if (fromMode === toMode) {
    return {
      success: false,
      count: 0,
      error: 'Source and target storage modes are the same',
    };
  }

  if (!['local', 'indexeddb'].includes(fromMode) || !['local', 'indexeddb'].includes(toMode)) {
    return {
      success: false,
      count: 0,
      error: 'Invalid storage mode. Must be "local" or "indexeddb"',
    };
  }

  try {
    // Initialize adapters
    const sourceAdapter = getStorageAdapter(fromMode);
    const targetAdapter = getStorageAdapter(toMode);

    // Step 1: Export from source
    if (onProgress) {
      onProgress({
        status: 'exporting',
        current: 0,
        total: 0,
        message: `Exporting annotations from ${fromMode}...`,
      });
    }

    const annotations = await sourceAdapter.export();
    const totalCount = annotations.length;

    if (totalCount === 0) {
      // No annotations to migrate
      if (onProgress) {
        onProgress({
          status: 'complete',
          current: 0,
          total: 0,
          message: 'No annotations to migrate',
        });
      }

      // Update settings even if no data
      await settingsManager.updateSetting('annotations.storageMode', toMode);

      return {
        success: true,
        count: 0,
        error: null,
      };
    }

    // Step 2: Clear target storage (ensure clean slate)
    await targetAdapter.clear();

    // Step 3: Import to target
    if (onProgress) {
      onProgress({
        status: 'importing',
        current: 0,
        total: totalCount,
        message: `Importing ${totalCount} annotations to ${toMode}...`,
      });
    }

    // Strip IDs from annotations (let target adapter assign new ones)
    const annotationsWithoutIds = annotations.map(({ id: _id, ...rest }) => rest);

    await targetAdapter.import(annotationsWithoutIds);

    // Step 4: Verify migration
    if (onProgress) {
      onProgress({
        status: 'verifying',
        current: totalCount,
        total: totalCount,
        message: 'Verifying migration...',
      });
    }

    const verifyCount = await targetAdapter.count();

    if (verifyCount !== totalCount) {
      throw new Error(
        `Migration verification failed: Expected ${totalCount} annotations, found ${verifyCount}`
      );
    }

    // Step 5: Clear source storage (if enabled)
    if (clearSource) {
      await sourceAdapter.clear();
    }

    // Step 6: Update settings to new storage mode
    await settingsManager.updateSetting('annotations.storageMode', toMode);

    // Step 7: Complete
    if (onProgress) {
      onProgress({
        status: 'complete',
        current: totalCount,
        total: totalCount,
        message: `Successfully migrated ${totalCount} annotations to ${toMode}`,
      });
    }

    return {
      success: true,
      count: totalCount,
      error: null,
    };
  } catch (error) {
    console.error('[MigrationManager] Migration failed:', error);

    if (onProgress) {
      onProgress({
        status: 'error',
        current: 0,
        total: 0,
        message: `Migration failed: ${error.message}`,
      });
    }

    return {
      success: false,
      count: 0,
      error: error.message,
    };
  }
}

/**
 * Get migration recommendation based on annotation count
 *
 * @param {number} count - Current annotation count
 * @param {string} currentMode - Current storage mode
 * @returns {Object|null} Recommendation object or null if no migration needed
 */
export function getMigrationRecommendation(count, currentMode) {
  const MAX_LOCAL_RECOMMENDED = 100;
  const MAX_LOCAL_HARD_LIMIT = 200;

  if (currentMode === 'local' && count >= MAX_LOCAL_RECOMMENDED) {
    const severity = count >= MAX_LOCAL_HARD_LIMIT ? 'critical' : 'warning';

    return {
      severity,
      currentMode,
      recommendedMode: 'indexeddb',
      count,
      message:
        severity === 'critical'
          ? `You have ${count} annotations. Chrome storage limit may be exceeded soon. Switch to IndexedDB for unlimited storage.`
          : `You have ${count} annotations. Consider switching to IndexedDB for better performance with large collections.`,
    };
  }

  if (currentMode === 'indexeddb' && count < MAX_LOCAL_RECOMMENDED / 2) {
    return {
      severity: 'info',
      currentMode,
      recommendedMode: 'local',
      count,
      message: `You have ${count} annotations. Chrome local storage may be faster for small collections.`,
    };
  }

  return null;
}

/**
 * Estimate storage usage for annotations
 *
 * @param {Array} annotations - Array of annotation objects
 * @returns {Object} Storage estimate { bytes, kb, mb, formatted }
 */
export function estimateStorageSize(annotations) {
  const jsonString = JSON.stringify(annotations);
  const bytes = new Blob([jsonString]).size;
  const kb = bytes / 1024;
  const mb = kb / 1024;

  let formatted;
  if (mb >= 1) {
    formatted = `${mb.toFixed(2)} MB`;
  } else if (kb >= 1) {
    formatted = `${kb.toFixed(2)} KB`;
  } else {
    formatted = `${bytes} bytes`;
  }

  return {
    bytes,
    kb,
    mb,
    formatted,
  };
}
