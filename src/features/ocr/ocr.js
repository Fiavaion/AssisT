/**
 * OCR (Optical Character Recognition) Feature
 *
 * Provides text extraction from images, screenshots, and PDFs using Tesseract.js
 *
 * Features:
 * - Lazy loading of Tesseract.js (only loads when OCR is first used)
 * - Screenshot capture (full page and region selection)
 * - PDF text extraction
 * - Multi-language support
 * - Confidence threshold filtering
 * - TTS integration for extracted text
 * - Export to clipboard and TXT file
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern (DEC-202510-010)
 * - All functions prefixed with 'ocr_' to avoid naming conflicts
 * - Lazy loads 2.5MB Tesseract.js library on first use
 *
 * @module features/ocr
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let ocr_tesseractInstance = null;
let ocr_isInitialized = false;
let ocr_isLoading = false;
let ocr_loadingPromise = null;

// ============================================================================
// LAZY LOADING
// ============================================================================

/**
 * Lazy loads Tesseract.js library
 * Only loads the library when OCR is first used to minimize initial bundle size
 *
 * @returns {Promise<Object>} Tesseract.js library object
 * @throws {Error} If Tesseract.js fails to load
 */
async function ocr_loadTesseract() {
  // Return existing instance if already loaded
  if (ocr_tesseractInstance) {
    return ocr_tesseractInstance;
  }

  // Return existing promise if currently loading (prevent parallel loads)
  if (ocr_isLoading && ocr_loadingPromise) {
    return ocr_loadingPromise;
  }

  // Start loading
  ocr_isLoading = true;

  ocr_loadingPromise = (async () => {
    try {
      console.log('[OCR] Lazy loading Tesseract.js...');

      // Dynamically import Tesseract.js from node_modules
      const Tesseract = await import('../../node_modules/tesseract.js/dist/tesseract.min.js');

      console.log('[OCR] Tesseract.js loaded successfully');
      ocr_tesseractInstance = Tesseract;
      ocr_isInitialized = true;
      ocr_isLoading = false;

      return Tesseract;
    } catch (error) {
      console.error('[OCR] Failed to load Tesseract.js:', error);
      ocr_isLoading = false;
      ocr_loadingPromise = null;
      throw new Error(`Failed to load OCR library: ${error.message}`);
    }
  })();

  return ocr_loadingPromise;
}

/**
 * Checks if Tesseract.js is currently loaded
 *
 * @returns {boolean} True if Tesseract is loaded and ready
 */
function ocr_isReady() {
  return ocr_isInitialized && ocr_tesseractInstance !== null;
}

/**
 * Gets the current loading state
 *
 * @returns {Object} Loading state information
 */
function ocr_getLoadingState() {
  return {
    isLoaded: ocr_isInitialized,
    isLoading: ocr_isLoading,
    hasInstance: ocr_tesseractInstance !== null,
  };
}

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

/**
 * Initializes the OCR feature
 * Called when the extension loads to set up event listeners
 * Does NOT load Tesseract.js (lazy loaded on first use)
 */
function ocr_init() {
  console.log('[OCR] Feature initialized (Tesseract.js will lazy load on first use)');

  // Add event listeners for OCR triggers
  // This will be expanded in later tasks (screenshot button, context menu, etc.)

  // For now, just register the feature as available
  if (window.assistFeatures) {
    window.assistFeatures.ocr = {
      isReady: ocr_isReady,
      getLoadingState: ocr_getLoadingState,
      loadTesseract: ocr_loadTesseract,
    };
  }
}

/**
 * Cleanup function called when extension is disabled/unloaded
 */
function ocr_cleanup() {
  console.log('[OCR] Cleaning up OCR feature');

  // Terminate any active Tesseract workers
  if (ocr_tesseractInstance && ocr_tesseractInstance.terminate) {
    ocr_tesseractInstance.terminate();
  }

  // Reset state
  ocr_tesseractInstance = null;
  ocr_isInitialized = false;
  ocr_isLoading = false;
  ocr_loadingPromise = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  // Ensure assistFeatures namespace exists
  window.assistFeatures = window.assistFeatures || {};

  // Initialize OCR feature
  ocr_init();
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ocr_loadTesseract,
    ocr_isReady,
    ocr_getLoadingState,
    ocr_init,
    ocr_cleanup,
  };
}
