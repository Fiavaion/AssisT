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
// SCREENSHOT CAPTURE
// ============================================================================

/**
 * Captures a screenshot of the current visible tab
 *
 * @returns {Promise<string>} Data URL of the captured screenshot
 * @throws {Error} If screenshot capture fails
 */
async function ocr_captureVisibleTab() {
  try {
    console.log('[OCR] Capturing visible tab screenshot...');

    // Request screenshot from background script
    const response = await chrome.runtime.sendMessage({
      action: 'CAPTURE_SCREENSHOT',
      options: { format: 'png' },
    });

    if (response.error) {
      throw new Error(response.error);
    }

    console.log('[OCR] Screenshot captured successfully');
    return response.dataUrl;
  } catch (error) {
    console.error('[OCR] Screenshot capture failed:', error);
    throw new Error(`Failed to capture screenshot: ${error.message}`);
  }
}

/**
 * Captures a full-page screenshot by scrolling and stitching
 *
 * @returns {Promise<string>} Data URL of the full-page screenshot
 * @throws {Error} If full-page capture fails
 */
async function ocr_captureFullPage() {
  try {
    console.log('[OCR] Starting full-page capture...');

    const originalScrollY = window.scrollY;
    const originalScrollX = window.scrollX;

    // Get page dimensions
    const pageHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    const pageWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth
    );
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    console.log(
      `[OCR] Page dimensions: ${pageWidth}x${pageHeight}, Viewport: ${viewportWidth}x${viewportHeight}`
    );

    // Calculate number of screenshots needed
    const rows = Math.ceil(pageHeight / viewportHeight);
    const screenshots = [];

    // Capture screenshots by scrolling
    for (let i = 0; i < rows; i++) {
      const scrollY = i * viewportHeight;
      window.scrollTo(0, scrollY);

      // Wait for scroll to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Capture visible area
      const dataUrl = await ocr_captureVisibleTab();
      screenshots.push({
        dataUrl,
        offsetY: scrollY,
        height: Math.min(viewportHeight, pageHeight - scrollY),
      });

      console.log(`[OCR] Captured segment ${i + 1}/${rows}`);
    }

    // Restore original scroll position
    window.scrollTo(originalScrollX, originalScrollY);

    // If only one screenshot, return it directly
    if (screenshots.length === 1) {
      console.log('[OCR] Single screenshot, no stitching needed');
      return screenshots[0].dataUrl;
    }

    // Stitch screenshots together
    console.log('[OCR] Stitching screenshots...');
    const stitchedDataUrl = await ocr_stitchScreenshots(
      screenshots,
      viewportWidth,
      pageHeight
    );

    console.log('[OCR] Full-page capture complete');
    return stitchedDataUrl;
  } catch (error) {
    console.error('[OCR] Full-page capture failed:', error);
    throw new Error(`Failed to capture full page: ${error.message}`);
  }
}

/**
 * Stitches multiple screenshots into a single image
 *
 * @param {Array} screenshots - Array of screenshot objects
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {Promise<string>} Data URL of stitched image
 */
async function ocr_stitchScreenshots(screenshots, width, height) {
  return new Promise((resolve, reject) => {
    try {
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      let loadedCount = 0;
      const totalCount = screenshots.length;

      // Load and draw each screenshot
      screenshots.forEach((screenshot) => {
        const img = new Image();

        img.onload = () => {
          // Draw image at correct Y offset
          ctx.drawImage(img, 0, screenshot.offsetY);
          loadedCount++;

          // If all images loaded, resolve with final canvas
          if (loadedCount === totalCount) {
            const stitchedDataUrl = canvas.toDataURL('image/png');
            resolve(stitchedDataUrl);
          }
        };

        img.onerror = () => {
          reject(new Error('Failed to load screenshot for stitching'));
        };

        img.src = screenshot.dataUrl;
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Shows screenshot capture UI with options
 */
async function ocr_showScreenshotUI() {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'assist-ocr-screenshot-ui';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Create options panel
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-width: 400px;
  `;

  panel.innerHTML = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px;">Screenshot for OCR</h2>
    <p style="margin: 0 0 24px 0; color: #666;">Choose how to capture the screenshot:</p>
    <button id="assist-ocr-visible" style="
      width: 100%;
      padding: 12px;
      margin-bottom: 12px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
    ">Visible Area Only</button>
    <button id="assist-ocr-fullpage" style="
      width: 100%;
      padding: 12px;
      margin-bottom: 12px;
      background: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
    ">Full Page (Scroll & Stitch)</button>
    <button id="assist-ocr-cancel" style="
      width: 100%;
      padding: 12px;
      background: #6c757d;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
    ">Cancel</button>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Handle button clicks
  return new Promise((resolve) => {
    document.getElementById('assist-ocr-visible').onclick = async () => {
      overlay.remove();
      try {
        const dataUrl = await ocr_captureVisibleTab();
        resolve(dataUrl);
      } catch (error) {
        console.error('[OCR] Visible capture failed:', error);
        resolve(null);
      }
    };

    document.getElementById('assist-ocr-fullpage').onclick = async () => {
      overlay.remove();
      try {
        const dataUrl = await ocr_captureFullPage();
        resolve(dataUrl);
      } catch (error) {
        console.error('[OCR] Full-page capture failed:', error);
        resolve(null);
      }
    };

    document.getElementById('assist-ocr-cancel').onclick = () => {
      overlay.remove();
      resolve(null);
    };
  });
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
