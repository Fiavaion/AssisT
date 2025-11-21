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
      const Tesseract = await import('tesseract.js');

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

  // Register the feature as available
  // Ensure namespace exists (defensive check)
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.ocr = {
    isReady: ocr_isReady,
    getLoadingState: ocr_getLoadingState,
    loadTesseract: ocr_loadTesseract,
    performOCR: ocr_performOCR,
    recognizeText: ocr_recognizeText,
    captureScreenshot: ocr_showScreenshotUI,
  };

  console.log('[OCR] Feature ready. Use window.assistFeatures.ocr.performOCR() to start');
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
    const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
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
      await new Promise(resolve => setTimeout(resolve, 100));

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
    const stitchedDataUrl = await ocr_stitchScreenshots(screenshots, viewportWidth, pageHeight);

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
      screenshots.forEach(screenshot => {
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
 * Captures a region of the screen selected by the user
 *
 * @returns {Promise<string>} Data URL of the selected region
 */
async function ocr_captureRegion() {
  return new Promise(resolve => {
    console.log('[OCR] Starting region selection...');

    // Create overlay for region selection
    const overlay = document.createElement('div');
    overlay.id = 'assist-ocr-region-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999998;
      cursor: crosshair;
    `;

    // Create selection box
    const selectionBox = document.createElement('div');
    selectionBox.id = 'assist-ocr-selection-box';
    selectionBox.style.cssText = `
      position: fixed;
      border: 2px dashed #007bff;
      background: rgba(0, 123, 255, 0.1);
      display: none;
      z-index: 999999;
      pointer-events: none;
    `;

    // Create instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      padding: 12px 24px;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000000;
      font-size: 14px;
    `;
    instructions.textContent = 'Click and drag to select region. Press ESC to cancel.';

    document.body.appendChild(overlay);
    document.body.appendChild(selectionBox);
    document.body.appendChild(instructions);

    let startX,
      startY,
      isSelecting = false;

    // Mouse down - start selection
    overlay.onmousedown = e => {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      selectionBox.style.left = startX + 'px';
      selectionBox.style.top = startY + 'px';
      selectionBox.style.width = '0';
      selectionBox.style.height = '0';
      selectionBox.style.display = 'block';
    };

    // Mouse move - update selection
    overlay.onmousemove = e => {
      if (!isSelecting) {
        return;
      }

      const currentX = e.clientX;
      const currentY = e.clientY;

      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);

      selectionBox.style.left = left + 'px';
      selectionBox.style.top = top + 'px';
      selectionBox.style.width = width + 'px';
      selectionBox.style.height = height + 'px';
    };

    // Mouse up - capture region
    overlay.onmouseup = async e => {
      if (!isSelecting) {
        return;
      }
      isSelecting = false;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);

      // Minimum selection size
      if (width < 10 || height < 10) {
        console.warn('[OCR] Selection too small, canceling');
        cleanup();
        resolve(null);
        return;
      }

      console.log(`[OCR] Region selected: ${width}x${height} at (${left},${top})`);

      // Capture full page screenshot
      try {
        const fullScreenshot = await ocr_captureVisibleTab();

        // Crop to selected region using canvas
        const croppedDataUrl = await ocr_cropImage(fullScreenshot, left, top, width, height);

        cleanup();
        resolve(croppedDataUrl);
      } catch (error) {
        console.error('[OCR] Region capture failed:', error);
        cleanup();
        resolve(null);
      }
    };

    // ESC key - cancel
    const handleEsc = e => {
      if (e.key === 'Escape') {
        console.log('[OCR] Region selection canceled');
        cleanup();
        resolve(null);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // Cleanup function
    function cleanup() {
      overlay.remove();
      selectionBox.remove();
      instructions.remove();
      document.removeEventListener('keydown', handleEsc);
    }
  });
}

/**
 * Crops an image to a specific region
 *
 * @param {string} imageDataUrl - Source image data URL
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} width - Width of crop area
 * @param {number} height - Height of crop area
 * @returns {Promise<string>} Cropped image data URL
 */
async function ocr_cropImage(imageDataUrl, x, y, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Draw cropped region
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

      const croppedDataUrl = canvas.toDataURL('image/png');
      resolve(croppedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for cropping'));
    };

    img.src = imageDataUrl;
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
    <button id="assist-ocr-region" style="
      width: 100%;
      padding: 12px;
      margin-bottom: 12px;
      background: #ffc107;
      color: #000;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
    ">Select Region</button>
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
  return new Promise(resolve => {
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

    document.getElementById('assist-ocr-region').onclick = async () => {
      overlay.remove();
      try {
        const dataUrl = await ocr_captureRegion();
        resolve(dataUrl);
      } catch (error) {
        console.error('[OCR] Region capture failed:', error);
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
// OCR ENGINE INTEGRATION
// ============================================================================

/**
 * Performs OCR on an image
 *
 * @param {string} imageDataUrl - Image data URL to process
 * @param {Object} options - OCR options
 * @param {string} options.lang - Language code (default: 'eng')
 * @param {number} options.confidenceThreshold - Minimum confidence (0-100, default: 60)
 * @returns {Promise<Object>} OCR result with text and confidence
 */
async function ocr_recognizeText(imageDataUrl, options = {}) {
  const { lang = 'eng', confidenceThreshold = 60 } = options;

  try {
    console.log(
      `[OCR] Starting text recognition (lang: ${lang}, threshold: ${confidenceThreshold}%)`
    );

    // Lazy load Tesseract
    const Tesseract = await ocr_loadTesseract();

    // Create worker
    console.log('[OCR] Creating Tesseract worker...');
    const worker = await Tesseract.createWorker(lang, 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    // Perform OCR
    console.log('[OCR] Recognizing text...');
    const result = await worker.recognize(imageDataUrl);

    // Terminate worker
    await worker.terminate();

    // Filter by confidence threshold
    const filteredText = ocr_filterByConfidence(result, confidenceThreshold);

    console.log(`[OCR] Recognition complete. Confidence: ${result.data.confidence.toFixed(1)}%`);
    console.log(`[OCR] Extracted ${result.data.text.length} characters`);

    return {
      text: filteredText,
      originalText: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words,
      lines: result.data.lines,
      paragraphs: result.data.paragraphs,
    };
  } catch (error) {
    console.error('[OCR] Text recognition failed:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

/**
 * Filters OCR result by confidence threshold
 *
 * @param {Object} result - Tesseract result object
 * @param {number} threshold - Confidence threshold (0-100)
 * @returns {string} Filtered text
 */
function ocr_filterByConfidence(result, threshold) {
  if (threshold === 0) {
    return result.data.text;
  }

  const filteredWords = result.data.words
    .filter(word => word.confidence >= threshold)
    .map(word => word.text);

  return filteredWords.join(' ');
}

/**
 * Main OCR workflow - captures screenshot and performs OCR
 *
 * @param {Object} options - OCR options
 * @returns {Promise<Object>} OCR result
 */
async function ocr_performOCR(options = {}) {
  try {
    // Show screenshot UI
    console.log('[OCR] Starting OCR workflow...');
    const imageDataUrl = await ocr_showScreenshotUI();

    if (!imageDataUrl) {
      console.log('[OCR] Screenshot canceled');
      return null;
    }

    // Perform OCR
    const result = await ocr_recognizeText(imageDataUrl, options);

    // Show result modal
    await ocr_showResultModal(result, imageDataUrl);

    return result;
  } catch (error) {
    console.error('[OCR] OCR workflow failed:', error);
    alert(`OCR failed: ${error.message}`);
    return null;
  }
}

// ============================================================================
// RESULT MODAL UI
// ============================================================================

/**
 * Shows OCR result modal with extracted text
 *
 * @param {Object} result - OCR result object
 * @param {string} imageDataUrl - Original image data URL
 */
async function ocr_showResultModal(result, imageDataUrl) {
  return new Promise(resolve => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'assist-ocr-result-modal';
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

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 800px;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.innerHTML = `
      <div>
        <h2 style="margin: 0; font-size: 20px;">OCR Results</h2>
        <p style="margin: 4px 0 0 0; color: #666; font-size: 14px;">
          Confidence: ${result.confidence.toFixed(1)}% |
          ${result.text.length} characters
        </p>
      </div>
      <button id="assist-ocr-close" style="
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
      ">×</button>
    `;

    // Content area
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 24px;
      flex: 1;
      overflow-y: auto;
    `;

    // Image preview
    const imagePreview = document.createElement('div');
    imagePreview.style.cssText = `
      margin-bottom: 20px;
      text-align: center;
    `;
    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.style.cssText = `
      max-width: 100%;
      max-height: 200px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    `;
    imagePreview.appendChild(img);

    // Extracted text
    const textArea = document.createElement('textarea');
    textArea.value = result.text;
    textArea.style.cssText = `
      width: 100%;
      min-height: 200px;
      padding: 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-family: monospace;
      font-size: 14px;
      resize: vertical;
    `;

    content.appendChild(imagePreview);
    content.appendChild(textArea);

    // Footer with action buttons
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;
    footer.innerHTML = `
      <button id="assist-ocr-tts" style="
        padding: 10px 20px;
        background: #17a2b8;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">Read Aloud (TTS)</button>
      <button id="assist-ocr-copy" style="
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">Copy to Clipboard</button>
      <button id="assist-ocr-save" style="
        padding: 10px 20px;
        background: #28a745;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">Save as TXT</button>
    `;

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Event handlers
    document.getElementById('assist-ocr-close').onclick = () => {
      overlay.remove();
      resolve();
    };

    document.getElementById('assist-ocr-copy').onclick = () => {
      ocr_copyToClipboard(textArea.value);
      alert('Text copied to clipboard!');
    };

    document.getElementById('assist-ocr-save').onclick = () => {
      ocr_saveAsFile(textArea.value);
    };

    document.getElementById('assist-ocr-tts').onclick = () => {
      ocr_readAloud(textArea.value);
    };

    // Close on overlay click
    overlay.onclick = e => {
      if (e.target === overlay) {
        overlay.remove();
        resolve();
      }
    };

    // ESC key to close
    const handleEsc = e => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleEsc);
        resolve();
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

/**
 * Copies text to clipboard
 *
 * @param {string} text - Text to copy
 */
async function ocr_copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    console.log('[OCR] Text copied to clipboard');
  } catch (error) {
    console.error('[OCR] Clipboard copy failed:', error);
    // Fallback method
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Saves text as a .txt file
 *
 * @param {string} text - Text to save
 */
function ocr_saveAsFile(text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `ocr-extract-${timestamp}.txt`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
  console.log(`[OCR] Text saved as ${filename}`);
}

/**
 * Reads text aloud using TTS (integrates with existing TTS feature)
 *
 * @param {string} text - Text to read
 */
function ocr_readAloud(text) {
  // Check if TTS feature is available
  if (window.assistFeatures && window.assistFeatures.tts) {
    console.log('[OCR] Triggering TTS for extracted text');
    // Integration with existing TTS will be added in Task 1.7
    alert('TTS integration will be added in the next task');
  } else {
    // Fallback to browser speech synthesis
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
    console.log('[OCR] Using browser speech synthesis');
  }
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
    ocr_performOCR,
    ocr_recognizeText,
    ocr_captureVisibleTab,
    ocr_captureFullPage,
    ocr_captureRegion,
  };
}
