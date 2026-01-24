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

import { sanitizeHTML } from '../../utils/sanitize.js';

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
 * Detects if the current page is a PDF
 *
 * @returns {Object} PDF detection result
 */
function ocr_detectPDF() {
  const url = window.location.href;

  // Chrome's built-in PDF viewer
  const isChromePDFViewer = url.includes('chrome-extension://') && url.includes('.pdf');

  // Direct PDF URL
  const isDirectPDF = url.endsWith('.pdf') || url.includes('.pdf?') || url.includes('.pdf#');

  // Canvas LMS embedded PDF (in iframe)
  const isCanvasEmbedded =
    url.includes('instructure.com') &&
    (document.querySelector('iframe[src*=".pdf"]') ||
      document.querySelector('embed[type="application/pdf"]'));

  // PDF.js viewer
  const isPDFJS =
    document.querySelector('#viewer.pdfViewer') !== null ||
    window.PDFViewerApplication !== undefined;

  return {
    isPDF: isChromePDFViewer || isDirectPDF || isCanvasEmbedded || isPDFJS,
    type: isChromePDFViewer
      ? 'chrome-viewer'
      : isPDFJS
        ? 'pdfjs'
        : isCanvasEmbedded
          ? 'canvas-embedded'
          : isDirectPDF
            ? 'direct'
            : 'none',
    url,
  };
}

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
 * Fetches PDF data as ArrayBuffer (handles local files and URLs)
 *
 * @param {string} pdfUrl - PDF URL (can be file://, http://, or chrome-extension://)
 * @returns {Promise<ArrayBuffer>} PDF data as ArrayBuffer
 */
async function ocr_fetchPDFData(pdfUrl) {
  console.log(`[OCR] Fetching PDF data from: ${pdfUrl}`);

  // For file:// URLs (local files), use background script to fetch
  // Content scripts can't access file:// URLs due to CORS
  if (pdfUrl.startsWith('file://')) {
    console.log('[OCR] Local file detected, requesting PDF data from background script...');
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'FETCH_PDF',
        url: pdfUrl,
      });

      if (response && response.success && response.data) {
        // Convert Array back to ArrayBuffer (background script sends Array due to message passing limitations)
        const uint8Array = new Uint8Array(response.data);
        const arrayBuffer = uint8Array.buffer;
        console.log(`[OCR] Received PDF data from background: ${arrayBuffer.byteLength} bytes`);
        return arrayBuffer;
      } else {
        throw new Error(response?.error || 'Background script failed to fetch PDF');
      }
    } catch (error) {
      console.error('[OCR] Background fetch failed:', error);
      throw error;
    }
  }

  // For HTTP/HTTPS URLs, use fetch
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    console.log(`[OCR] Fetched PDF data: ${arrayBuffer.byteLength} bytes`);
    return arrayBuffer;
  } catch (error) {
    console.error('[OCR] fetch() failed:', error.message);
    throw error;
  }
}

/**
 * Captures a PDF using PDF.js headless rendering (all pages)
 *
 * @param {Object} pdfInfo - PDF detection information
 * @returns {Promise<Array<string>>} Array of data URLs for each PDF page
 */
async function ocr_capturePDFWithPDFJS(pdfInfo) {
  console.log(`[OCR] Using PDF.js headless rendering for full PDF capture...`);

  try {
    // Dynamically import PDF.js
    const pdfjsLib = await import('pdfjs-dist');

    // Set worker path
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
      'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
    );

    // Get the PDF URL
    let pdfUrl = pdfInfo.url;

    // For Chrome PDF viewer, extract the actual PDF URL from the chrome-extension:// URL
    if (pdfInfo.type === 'chrome-viewer') {
      // Chrome PDF viewer URL format: chrome-extension://[id]/[hash].pdf?[original-url]
      const urlParams = new URLSearchParams(window.location.search);
      pdfUrl = urlParams.get('url') || pdfInfo.url;
    }

    console.log(`[OCR] Loading PDF from: ${pdfUrl}`);

    // Fetch PDF data as ArrayBuffer (handles CORS issues with local files)
    const pdfData = await ocr_fetchPDFData(pdfUrl);

    // Load the PDF document from ArrayBuffer
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;

    console.log(`[OCR] PDF loaded: ${pdf.numPages} pages`);

    const pageImages = [];

    // Render each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`[OCR] Rendering page ${pageNum}/${pdf.numPages}...`);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better OCR quality

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');

      // Render page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/png');
      pageImages.push(dataUrl);

      console.log(`[OCR] Page ${pageNum} rendered (${viewport.width}x${viewport.height})`);
    }

    console.log(`[OCR] Successfully rendered all ${pdf.numPages} pages`);
    return pageImages;
  } catch (error) {
    console.error('[OCR] PDF.js rendering failed:', error);
    throw new Error(`PDF rendering failed: ${error.message}`);
  }
}

/**
 * Captures a PDF page using specialized PDF handling
 *
 * @param {Object} pdfInfo - PDF detection information
 * @returns {Promise<string|Array<string>>} Data URL of captured page, or array of data URLs for multi-page PDFs
 */
async function ocr_capturePDFPage(pdfInfo) {
  console.log(`[OCR] Capturing PDF page (type: ${pdfInfo.type})...`);

  // For Chrome PDF viewer, PDF.js, or direct PDFs
  // Use PDF.js headless rendering to capture ALL pages automatically
  if (pdfInfo.type === 'chrome-viewer' || pdfInfo.type === 'pdfjs' || pdfInfo.type === 'direct') {
    console.log('[OCR] Using PDF.js headless rendering for multi-page capture');

    try {
      // Render all PDF pages using PDF.js
      const pageImages = await ocr_capturePDFWithPDFJS(pdfInfo);

      // Return array of page images for multi-page OCR processing
      // Each page will be processed individually to avoid Tesseract's size limits
      console.log(`[OCR] Rendered ${pageImages.length} PDF page(s) for OCR processing`);
      return pageImages;
    } catch (error) {
      console.warn('[OCR] PDF.js rendering failed, falling back to visible capture:', error);
      // Fallback to visible page capture
      return await ocr_captureVisibleTab();
    }
  }

  // Canvas embedded PDF - try to find the embed/iframe
  if (pdfInfo.type === 'canvas-embedded') {
    console.log('[OCR] Canvas embedded PDF detected');

    const pdfEmbed =
      document.querySelector('iframe[src*=".pdf"]') ||
      document.querySelector('embed[type="application/pdf"]');

    if (pdfEmbed) {
      console.log('[OCR] Found PDF embed element, capturing visible area');
      // For embedded PDFs, just capture what's visible
      return await ocr_captureVisibleTab();
    }
  }

  // Fallback: just capture the visible area
  console.log('[OCR] Using fallback capture method for PDF');
  return await ocr_captureVisibleTab();
}

/**
 * Helper to load an image from a data URL
 * Reserved for future use
 */
/*
function _ocr_loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
*/

/**
 * Captures a full-page screenshot by scrolling and stitching
 *
 * @returns {Promise<string>} Data URL of the full-page screenshot
 * @throws {Error} If full-page capture fails
 */
async function ocr_captureFullPage() {
  try {
    console.log('[OCR] Starting full-page capture...');

    // Detect if this is a PDF
    const pdfInfo = ocr_detectPDF();
    if (pdfInfo.isPDF) {
      console.log(`[OCR] PDF detected (type: ${pdfInfo.type})`);
      return await ocr_capturePDFPage(pdfInfo);
    }

    // Check if reading mode is active
    const readingModeOverlay = document.getElementById('assist-reading-mode-overlay');
    const isReadingMode = readingModeOverlay && window.assistFeatures?.readingMode?.isActive();

    let scrollContainer, originalScrollY, originalScrollX, pageHeight, pageWidth;

    if (isReadingMode) {
      // Reading mode is active - scroll the overlay instead
      console.log('[OCR] Reading mode detected - capturing reading mode content');
      scrollContainer = readingModeOverlay;
      originalScrollY = scrollContainer.scrollTop;
      originalScrollX = scrollContainer.scrollLeft;
      pageHeight = scrollContainer.scrollHeight;
      pageWidth = scrollContainer.scrollWidth;
    } else {
      // Normal page scrolling
      scrollContainer = window;
      originalScrollY = window.scrollY;
      originalScrollX = window.scrollX;
      pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    }

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    console.log(
      `[OCR] ${isReadingMode ? 'Reading mode' : 'Page'} dimensions: ${pageWidth}x${pageHeight}, Viewport: ${viewportWidth}x${viewportHeight}`
    );

    // Calculate number of screenshots needed
    const rows = Math.ceil(pageHeight / viewportHeight);
    const screenshots = [];

    // Capture screenshots by scrolling
    for (let i = 0; i < rows; i++) {
      const scrollY = i * viewportHeight;

      if (isReadingMode) {
        // Scroll the reading mode overlay (it's an HTMLElement)
        readingModeOverlay.scrollTop = scrollY;
      } else {
        // Scroll the window
        window.scrollTo(0, scrollY);
      }

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
    if (isReadingMode) {
      readingModeOverlay.scrollTop = originalScrollY;
    } else {
      window.scrollTo(originalScrollX, originalScrollY);
    }

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
  console.log(`[OCR] Stitching ${screenshots.length} screenshots into ${width}x${height} canvas`);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fill with white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // Load and draw screenshots sequentially to avoid race conditions
  for (let i = 0; i < screenshots.length; i++) {
    const screenshot = screenshots[i];

    await new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        // Draw image at correct Y offset
        console.log(`[OCR] Drawing screenshot ${i + 1} at Y offset ${screenshot.offsetY}`);
        ctx.drawImage(img, 0, screenshot.offsetY);
        resolve();
      };

      img.onerror = () => {
        reject(new Error(`Failed to load screenshot ${i + 1} for stitching`));
      };

      img.src = screenshot.dataUrl;
    });
  }

  const stitchedDataUrl = canvas.toDataURL('image/png');
  console.log('[OCR] Stitching complete');
  return stitchedDataUrl;
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
 * Upscales an image for better OCR accuracy
 *
 * @param {string} imageDataUrl - Source image data URL
 * @param {number} scaleFactor - Scale multiplier (e.g., 1.5 for 150%, 2.0 for 200%)
 * @returns {Promise<string>} Upscaled image data URL
 */
async function ocr_upscaleImage(imageDataUrl, scaleFactor = 1.5) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scaledWidth = Math.floor(img.width * scaleFactor);
      const scaledHeight = Math.floor(img.height * scaleFactor);

      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      const ctx = canvas.getContext('2d');

      // Use high-quality image rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw upscaled image
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

      const upscaledDataUrl = canvas.toDataURL('image/png');
      console.log(
        `[OCR] Upscaled image from ${img.width}x${img.height} to ${scaledWidth}x${scaledHeight} (${scaleFactor}x)`
      );
      resolve(upscaledDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for upscaling'));
    };

    img.src = imageDataUrl;
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
  // Check reading mode status
  const isReadingMode = window.assistFeatures?.readingMode?.isActive() || false;

  // Check PDF status
  const pdfInfo = ocr_detectPDF();

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

  // Reading mode status message
  const readingModeStatus = isReadingMode
    ? '<div style="margin-bottom: 16px; padding: 12px; background: #e7f3ff; border-left: 4px solid #007bff; border-radius: 4px;"><strong>📖 Reading Mode Active</strong><br><span style="font-size: 13px; color: #555;">OCR will capture the clean reading view</span></div>'
    : '';

  // PDF status message
  const pdfStatus = pdfInfo.isPDF
    ? `<div style="margin-bottom: 16px; padding: 12px; background: #e7f9e7; border-left: 4px solid #28a745; border-radius: 4px;"><strong>📄 PDF Document Detected</strong><br><span style="font-size: 13px; color: #555;">Type: ${pdfInfo.type === 'chrome-viewer' ? 'Chrome PDF Viewer' : pdfInfo.type === 'pdfjs' ? 'PDF.js Viewer' : pdfInfo.type === 'canvas-embedded' ? 'Canvas Embedded PDF' : 'Direct PDF'}</span><br><span style="font-size: 12px; color: #28a745; font-weight: bold;">✓ Automatic multi-page capture enabled</span><br><span style="font-size: 12px; color: #666;">All pages will be rendered and captured automatically using PDF.js</span></div>`
    : '';

  panel.innerHTML = sanitizeHTML(`
    <h2 style="margin: 0 0 16px 0; font-size: 20px;">Screenshot for OCR</h2>
    ${readingModeStatus}
    ${pdfStatus}
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
  `);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Handle button clicks
  return new Promise(resolve => {
    document.getElementById('assist-ocr-visible').onclick = async () => {
      overlay.remove();
      // Wait for modal to be completely removed from DOM
      await new Promise(r => setTimeout(r, 100));
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
      // Wait for modal to be completely removed from DOM
      await new Promise(r => setTimeout(r, 100));
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
      // Wait for modal to be completely removed from DOM
      await new Promise(r => setTimeout(r, 100));
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
 * @param {number} options.confidenceThreshold - Minimum confidence (0-100, default: 50)
 * @param {boolean} options.filterNoise - Remove UI clutter (default: from settings)
 * @param {number} options.upscaleFactor - Image upscaling factor for better accuracy (default: 1.5)
 * @param {boolean} options.skipUpscaling - Skip upscaling (e.g., for PDF.js pre-rendered images)
 * @returns {Promise<Object>} OCR result with text and confidence
 */
async function ocr_recognizeText(imageDataUrl, options = {}) {
  const {
    lang = 'eng',
    confidenceThreshold = 50,
    upscaleFactor = 1.5,
    skipUpscaling = false,
  } = options;

  try {
    console.log(
      `[OCR] Starting text recognition (lang: ${lang}, threshold: ${confidenceThreshold}%, upscale: ${skipUpscaling ? 'skipped' : upscaleFactor + 'x'})`
    );

    // Upscale image for better OCR accuracy (unless it's already high-quality like PDF.js renders)
    let processedImage = imageDataUrl;
    if (!skipUpscaling && upscaleFactor > 1.0) {
      processedImage = await ocr_upscaleImage(imageDataUrl, upscaleFactor);
    } else if (skipUpscaling) {
      console.log('[OCR] Skipping upscaling (image already high-quality)');
    }

    // Lazy load Tesseract
    const Tesseract = await ocr_loadTesseract();

    // Create worker with improved settings
    console.log('[OCR] Creating Tesseract worker...');
    const worker = await Tesseract.createWorker(lang, 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    // Configure worker with parameters for better accuracy
    await worker.setParameters({
      // Use PSM (Page Segmentation Mode) 3: Fully automatic page segmentation (best for most documents)
      // PSM modes: 0=OSD only, 1=Auto OSD, 3=Fully auto, 6=Single block, 11=Sparse text, 13=Raw line
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,

      // OCR Engine Mode - Use LSTM neural net (mode 1) for better accuracy
      // 0=Legacy, 1=LSTM, 2=Legacy+LSTM, 3=Default
      tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,

      // Improve character recognition
      preserve_interword_spaces: '1', // Better word spacing detection
    });

    // Perform OCR on the upscaled image
    console.log('[OCR] Recognizing text...');
    const result = await worker.recognize(processedImage);

    // Terminate worker
    await worker.terminate();

    // Filter by confidence threshold
    let filteredText = ocr_filterByConfidence(result, confidenceThreshold);

    // Check if noise filtering is enabled (from settings or explicit option)
    let shouldFilterNoise = options.filterNoise;
    if (shouldFilterNoise === undefined) {
      // Load from settings if not explicitly provided
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const settingsResult = await chrome.storage.local.get('assist_settings');
        shouldFilterNoise = settingsResult.assist_settings?.ocr?.filterNoise ?? true;
      } else {
        shouldFilterNoise = true; // Default to true
      }
    }

    // Remove noise patterns (cookie notices, social embeds, etc.)
    if (shouldFilterNoise) {
      filteredText = ocr_removeNoisePatterns(filteredText);
    }

    console.log(`[OCR] Recognition complete. Confidence: ${result.data.confidence.toFixed(1)}%`);
    console.log(
      `[OCR] Extracted ${result.data.text.length} characters (cleaned: ${filteredText.length})`
    );

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
 * Removes common UI noise patterns from OCR text
 * Targets: cookie notices, social media embeds, permission prompts, ads, navigation
 *
 * @param {string} text - Raw OCR text
 * @returns {string} Cleaned text suitable for TTS reading
 */
function ocr_removeNoisePatterns(text) {
  // Patterns to remove (accessibility-focused - reduce cognitive load)
  const noisePatterns = [
    // Cookie and privacy notices
    /This content is loaded from [^.]+\.\s*We need your (consent|permission)[^.]+\./gi,
    /We (use|need) (cookies?|your consent|permission)[^.]+\./gi,
    /For more information visit[^.]+Privacy Policy[^.]*\./gi,
    /By continuing to use this site[^.]+cookies?[^.]*\./gi,
    /Accept (all )?cookies?/gi,
    /Cookie (Settings?|Preferences?|Policy)/gi,
    /Manage cookie (settings?|preferences?)/gi,

    // Social media embed notices
    /This content is (from|provided by|embedded from) (Twitter|Facebook|Instagram|YouTube|TikTok|LinkedIn)[^.]*\./gi,
    /(Twitter|Facebook|Instagram|YouTube|TikTok) content may use cookies[^.]*\./gi,
    /View (this )?post on (Instagram|Facebook|Twitter)/gi,
    /A post shared by[^.]+/gi,

    // GDPR and compliance
    /We and our partners (use|store|process) (data|information)[^.]+\./gi,
    /You can (change|manage) your preferences?[^.]+\./gi,
    /To learn more[^.]+privacy[^.]*\./gi,
    /Click here to (accept|manage|opt-out)[^.]*\./gi,

    // Advertisement indicators
    /Advertisement/gi,
    /Sponsored (content|post|by)/gi,
    /\[?Ad\]?(\s*-\s*|\s+)/gi,

    // Navigation and UI elements
    /Click to (expand|collapse|show|hide)/gi,
    /Skip to (main )?content/gi,
    /Back to top/gi,
    /Show (more|less)/gi,
    /Load more/gi,
    /Read (more|less)/gi,

    // Common UI buttons/links (often misread)
    /Share (this|on|via)/gi,
    /Follow us on/gi,
    /Subscribe (now|to)/gi,

    // Accessibility widgets (ironically cluttering for TTS users)
    /Accessibility (menu|options|settings)/gi,
    /Change text size/gi,
    /High contrast mode/gi,

    // Timestamps that add no value
    /Posted \d+\s+(second|minute|hour|day|week|month|year)s?\s+ago/gi,
    /Updated:?\s+\d+[/-]\d+[/-]\d+/gi,

    // Common filler phrases
    /Click here/gi,
    /Learn more\s*$/gim,
    /Find out more\s*$/gim,
  ];

  let cleaned = text;

  // Apply all noise removal patterns
  noisePatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // Remove excessive whitespace and normalize
  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .replace(/[ \t]+/g, ' ') // Normalize spaces
    .replace(/\n\s+\n/g, '\n\n') // Remove whitespace-only lines
    .trim();

  // Log what was filtered (for debugging and improvement)
  const removedLength = text.length - cleaned.length;
  if (removedLength > 0) {
    console.log(
      `[OCR] Removed ${removedLength} characters of noise (${((removedLength / text.length) * 100).toFixed(1)}%)`
    );
  }

  return cleaned;
}

/**
 * Shows a progress modal for multi-page OCR processing
 *
 * @param {number} totalPages - Total number of pages to process
 * @returns {HTMLElement} Progress modal element
 */
function ocr_showProgressModal(totalPages) {
  const overlay = document.createElement('div');
  overlay.id = 'assist-ocr-progress-modal';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    max-width: 500px;
    width: 90%;
    padding: 32px;
  `;

  modal.innerHTML = sanitizeHTML(`
    <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #333;">Processing OCR</h2>
    <p id="ocr-progress-text" style="margin: 0 0 20px 0; color: #666; font-size: 14px;">
      Processing page 0 of ${totalPages}...
    </p>
    <div style="background: #e0e0e0; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 12px;">
      <div id="ocr-progress-bar" style="background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
    </div>
    <p id="ocr-progress-eta" style="margin: 0; color: #999; font-size: 13px; text-align: center;">
      Estimating time remaining...
    </p>
  `);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  return overlay;
}

/**
 * Updates the progress modal
 *
 * @param {HTMLElement} modal - Progress modal element
 * @param {number} currentPage - Current page being processed
 * @param {number} totalPages - Total pages
 * @param {number} estimatedSeconds - Estimated seconds remaining
 */
function ocr_updateProgress(modal, currentPage, totalPages, estimatedSeconds) {
  const progressBar = modal.querySelector('#ocr-progress-bar');
  const progressText = modal.querySelector('#ocr-progress-text');
  const progressETA = modal.querySelector('#ocr-progress-eta');

  const percentage = (currentPage / totalPages) * 100;
  progressBar.style.width = `${percentage}%`;

  progressText.textContent = `Processing page ${currentPage} of ${totalPages}...`;

  // Format time remaining
  if (estimatedSeconds < 60) {
    progressETA.textContent = `Estimated time remaining: ${estimatedSeconds} seconds`;
  } else {
    const minutes = Math.floor(estimatedSeconds / 60);
    const seconds = estimatedSeconds % 60;
    progressETA.textContent = `Estimated time remaining: ${minutes}m ${seconds}s`;
  }
}

/**
 * Main OCR workflow - captures screenshot and performs OCR
 *
 * @param {Object} options - OCR options
 * @returns {Promise<Object>} OCR result
 */
async function ocr_performOCR(options = {}) {
  try {
    console.log('[OCR] Starting OCR workflow...');

    // Load OCR settings from storage
    let readingModeWasActivated = false;
    let shouldAutoActivateReadingMode = true; // Default to true
    let ocrLanguage = 'eng'; // Default language
    let ocrConfidenceThreshold = 60; // Default confidence threshold

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await chrome.storage.local.get('assist_settings');
      const ocrSettings = result.assist_settings?.ocr || {};

      // Load all OCR settings
      shouldAutoActivateReadingMode = ocrSettings.autoActivateReadingMode !== false;
      ocrLanguage = ocrSettings.language || 'eng';
      ocrConfidenceThreshold = ocrSettings.confidenceThreshold ?? 60;

      console.log(
        `[OCR] Settings loaded - Language: ${ocrLanguage}, Confidence: ${ocrConfidenceThreshold}%`
      );
    }

    // Merge settings into options (options parameter takes precedence)
    const mergedOptions = {
      lang: ocrLanguage,
      confidenceThreshold: ocrConfidenceThreshold,
      ...options, // User-provided options override settings
    };

    // Auto-activate reading mode BEFORE screenshot capture (if enabled and available)
    if (shouldAutoActivateReadingMode && window.assistFeatures?.readingMode) {
      const isReadingModeActive = window.assistFeatures.readingMode.isActive();

      if (!isReadingModeActive) {
        console.log('[OCR] Auto-activating reading mode before capture...');
        await window.assistFeatures.readingMode.enter();
        readingModeWasActivated = true;

        // Wait for reading mode to fully render
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Show screenshot UI (will capture reading mode if active)
    const imageDataUrl = await ocr_showScreenshotUI();

    if (!imageDataUrl) {
      console.log('[OCR] Screenshot canceled');

      // Exit reading mode if we activated it
      if (readingModeWasActivated && window.assistFeatures?.readingMode) {
        window.assistFeatures.readingMode.exit();
      }

      return null;
    }

    // Handle multi-page PDF (array of images) vs single image (string)
    let result;
    if (Array.isArray(imageDataUrl)) {
      console.log(`[OCR] Processing multi-page PDF with ${imageDataUrl.length} pages...`);

      // Show progress modal
      const progressModal = ocr_showProgressModal(imageDataUrl.length);

      // Process each page individually and concatenate results
      const pageResults = [];
      const startTime = Date.now();

      // PDF.js already renders at 2.0x scale, so skip upscaling for PDF pages
      const pdfOptions = { ...mergedOptions, skipUpscaling: true };

      for (let i = 0; i < imageDataUrl.length; i++) {
        console.log(`[OCR] Processing page ${i + 1}/${imageDataUrl.length}...`);

        // Update progress
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const avgTimePerPage = i > 0 ? elapsed / i : 15; // Estimate 15s for first page
        const remainingPages = imageDataUrl.length - i;
        const estimatedTimeRemaining = Math.ceil(avgTimePerPage * remainingPages);

        ocr_updateProgress(progressModal, i + 1, imageDataUrl.length, estimatedTimeRemaining);

        const pageResult = await ocr_recognizeText(imageDataUrl[i], pdfOptions);
        pageResults.push(pageResult);
      }

      // Close progress modal
      progressModal.remove();

      // Concatenate all page texts
      const combinedText = pageResults.map(r => r.text).join('\n\n--- Page Break ---\n\n');
      const avgConfidence =
        pageResults.reduce((sum, r) => sum + r.confidence, 0) / pageResults.length;

      result = {
        text: combinedText,
        originalText: pageResults.map(r => r.originalText).join('\n\n--- Page Break ---\n\n'),
        confidence: avgConfidence,
        pages: pageResults.length,
        pageResults: pageResults,
      };

      console.log(
        `[OCR] Multi-page processing complete. Total: ${result.text.length} characters, Avg confidence: ${avgConfidence.toFixed(1)}%`
      );
    } else {
      // Single image OCR
      result = await ocr_recognizeText(imageDataUrl, mergedOptions);
    }

    // Show result modal (use first page image for multi-page PDFs)
    const displayImage = Array.isArray(imageDataUrl) ? imageDataUrl[0] : imageDataUrl;
    await ocr_showResultModal(result, displayImage);

    // Exit reading mode if we activated it
    if (readingModeWasActivated && window.assistFeatures?.readingMode) {
      console.log('[OCR] Exiting auto-activated reading mode');
      window.assistFeatures.readingMode.exit();
    }

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

// ============================================================================
// MEDIA PLAYER STATE
// ============================================================================

const ocrMediaPlayer = {
  chunks: [],
  currentChunkIndex: 0,
  utterance: null,
  isPaused: false,
  isPlaying: false,
  rate: 1.0,
  fullText: '',
};

/**
 * Splits text into chunks suitable for speech synthesis
 * @param {string} text - Full text to split
 * @param {number} maxChunkSize - Maximum characters per chunk
 * @returns {Array<string>} Array of text chunks
 */
function ocr_splitTextIntoChunks(text, maxChunkSize = 3000) {
  const chunks = [];
  let startPos = 0;

  console.log(`[OCR] Splitting ${text.length} characters into chunks of max ${maxChunkSize}`);

  while (startPos < text.length) {
    // Calculate end position for this chunk
    let endPos = startPos + maxChunkSize;

    // If this would be the last chunk, just take everything remaining
    if (endPos >= text.length) {
      const finalChunk = text.substring(startPos).trim();
      if (finalChunk.length > 0) {
        chunks.push(finalChunk);
        console.log(
          `[OCR] Chunk ${chunks.length}: ${startPos} to end (${finalChunk.length} chars)`
        );
      }
      break;
    }

    // Try to find a sentence boundary (. followed by space or newline)
    const searchText = text.substring(startPos, endPos);
    let bestBreak = -1;

    // Look for ". " or ".\n" patterns
    for (let i = searchText.length - 1; i >= Math.floor(searchText.length * 0.7); i--) {
      const char = searchText[i];
      const nextChar = searchText[i + 1];
      if (char === '.' && (nextChar === ' ' || nextChar === '\n' || i === searchText.length - 1)) {
        bestBreak = i + 1; // Include the period
        break;
      }
    }

    // If we found a good break point, use it
    if (bestBreak > 0) {
      endPos = startPos + bestBreak;
    }

    // Extract chunk
    const chunk = text.substring(startPos, endPos).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
      console.log(`[OCR] Chunk ${chunks.length}: ${startPos} to ${endPos} (${chunk.length} chars)`);
    }

    // Move start position for next chunk
    startPos = endPos;

    // Skip any leading whitespace for the next chunk
    while (startPos < text.length && /\s/.test(text[startPos])) {
      startPos++;
    }
  }

  console.log(`[OCR] Successfully split into ${chunks.length} chunks`);

  // Verify no duplicates in first 50 chars of each chunk (for debugging)
  for (let i = 1; i < chunks.length; i++) {
    const prevEnd = chunks[i - 1].substring(Math.max(0, chunks[i - 1].length - 50));
    const currStart = chunks[i].substring(0, Math.min(50, chunks[i].length));
    if (
      prevEnd.includes(currStart.substring(0, 20)) ||
      currStart.includes(prevEnd.substring(prevEnd.length - 20))
    ) {
      console.warn(`[OCR] Possible overlap detected between chunks ${i} and ${i + 1}`);
    }
  }

  return chunks;
}

/**
 * Shows OCR result modal with extracted text and media player controls
 *
 * @param {Object} result - OCR result object
 * @param {string} imageDataUrl - Original image data URL
 */
async function ocr_showResultModal(result, imageDataUrl) {
  return new Promise(resolve => {
    // Initialize media player state
    ocrMediaPlayer.fullText = result.text;
    ocrMediaPlayer.chunks = ocr_splitTextIntoChunks(result.text);
    ocrMediaPlayer.currentChunkIndex = 0;
    ocrMediaPlayer.isPlaying = false;
    ocrMediaPlayer.isPaused = false;
    ocrMediaPlayer.rate = 1.0;
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'assist-ocr-result-modal';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      max-width: 900px;
      width: 90%;
      max-height: 90vh;
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px 12px 0 0;
    `;
    header.innerHTML = sanitizeHTML(`
      <div>
        <h2 style="margin: 0; font-size: 20px; font-weight: 600;">OCR Audio Player</h2>
        <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">
          Confidence: ${result.confidence.toFixed(1)}% |
          ${result.text.length.toLocaleString()} characters |
          ${ocrMediaPlayer.chunks.length} chunk${ocrMediaPlayer.chunks.length > 1 ? 's' : ''}${result.pages ? ` | ${result.pages} page${result.pages > 1 ? 's' : ''}` : ''}
        </p>
      </div>
      <button id="assist-ocr-close" style="
        background: rgba(255,255,255,0.2);
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(255,255,255,0.3)'"
         onmouseout="this.style.background='rgba(255,255,255,0.2)'">×</button>
    `);

    // Content area
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 24px;
      flex: 1;
      overflow-y: auto;
      background: #f8f9fa;
    `;

    // Image preview (collapsible)
    const imagePreview = document.createElement('details');
    imagePreview.style.cssText = `
      margin-bottom: 20px;
      background: white;
      border-radius: 8px;
      padding: 12px;
    `;
    imagePreview.innerHTML = sanitizeHTML(`
      <summary style="cursor: pointer; font-weight: 500; color: #667eea; margin-bottom: 12px;">
        📷 View Screenshot
      </summary>
    `);
    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.style.cssText = `
      max-width: 100%;
      max-height: 200px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      display: block;
      margin: 0 auto;
    `;
    imagePreview.appendChild(img);

    // Chunk info and navigation
    const chunkNavigation = document.createElement('div');
    chunkNavigation.style.cssText = `
      background: white;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    `;
    chunkNavigation.innerHTML = sanitizeHTML(`
      <div style="flex: 1;">
        <div style="font-weight: 500; color: #333; margin-bottom: 4px;">
          Chunk <span id="ocr-current-chunk">1</span> of <span id="ocr-total-chunks">${ocrMediaPlayer.chunks.length}</span>
        </div>
        <div style="font-size: 12px; color: #666;">
          <span id="ocr-chunk-length">${ocrMediaPlayer.chunks[0].length}</span> characters
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="ocr-prev-chunk" style="
          padding: 8px 16px;
          background: #e0e0e0;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        " ${ocrMediaPlayer.chunks.length <= 1 ? 'disabled' : ''}>⏮ Previous</button>
        <button id="ocr-next-chunk" style="
          padding: 8px 16px;
          background: #e0e0e0;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        " ${ocrMediaPlayer.chunks.length <= 1 ? 'disabled' : ''}>Next ⏭</button>
      </div>
    `);

    // Extracted text (current chunk)
    const textArea = document.createElement('textarea');
    textArea.id = 'ocr-text-display';
    textArea.value = ocrMediaPlayer.chunks[0];
    textArea.style.cssText = `
      width: 100%;
      min-height: 250px;
      padding: 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      resize: vertical;
      background: white;
      margin-bottom: 20px;
    `;

    content.appendChild(imagePreview);
    content.appendChild(chunkNavigation);
    content.appendChild(textArea);

    // Media Player Controls
    const playerControls = document.createElement('div');
    playerControls.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
    `;

    // Playback controls
    const playbackControls = document.createElement('div');
    playbackControls.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
    `;
    playbackControls.innerHTML = sanitizeHTML(`
      <button id="ocr-play-pause" style="
        width: 56px;
        height: 56px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 16px rgba(102, 126, 234, 0.5)'"
         onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)'">▶</button>
      <button id="ocr-stop" style="
        width: 44px;
        height: 44px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      " onmouseover="this.style.background='#c82333'"
         onmouseout="this.style.background='#dc3545'">⏹</button>
    `);

    // Speed control
    const speedControl = document.createElement('div');
    speedControl.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
    `;
    speedControl.innerHTML = sanitizeHTML(`
      <span style="font-size: 14px; color: #666; min-width: 80px;">Speed:</span>
      <button class="speed-btn" data-speed="0.5" style="
        padding: 6px 12px;
        background: #f0f0f0;
        border: 2px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      ">0.5x</button>
      <button class="speed-btn" data-speed="0.75" style="
        padding: 6px 12px;
        background: #f0f0f0;
        border: 2px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      ">0.75x</button>
      <button class="speed-btn" data-speed="1" style="
        padding: 6px 12px;
        background: #667eea;
        color: white;
        border: 2px solid #667eea;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      ">1x</button>
      <button class="speed-btn" data-speed="1.25" style="
        padding: 6px 12px;
        background: #f0f0f0;
        border: 2px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      ">1.25x</button>
      <button class="speed-btn" data-speed="1.5" style="
        padding: 6px 12px;
        background: #f0f0f0;
        border: 2px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      ">1.5x</button>
      <button class="speed-btn" data-speed="2" style="
        padding: 6px 12px;
        background: #f0f0f0;
        border: 2px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      ">2x</button>
    `);

    playerControls.appendChild(playbackControls);
    playerControls.appendChild(speedControl);
    content.appendChild(playerControls);

    // Footer with utility buttons
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      background: white;
      border-radius: 0 0 12px 12px;
    `;
    footer.innerHTML = sanitizeHTML(`
      <button id="assist-ocr-copy" style="
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
      " onmouseover="this.style.background='#0056b3'"
         onmouseout="this.style.background='#007bff'">📋 Copy All</button>
      <button id="assist-ocr-save" style="
        padding: 10px 20px;
        background: #28a745;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
      " onmouseover="this.style.background='#1e7e34'"
         onmouseout="this.style.background='#28a745'">💾 Save TXT</button>
    `);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Helper function to update chunk display
    const updateChunkDisplay = () => {
      textArea.value = ocrMediaPlayer.chunks[ocrMediaPlayer.currentChunkIndex];
      document.getElementById('ocr-current-chunk').textContent =
        ocrMediaPlayer.currentChunkIndex + 1;
      document.getElementById('ocr-chunk-length').textContent =
        ocrMediaPlayer.chunks[ocrMediaPlayer.currentChunkIndex].length;

      // Update button states
      const prevBtn = document.getElementById('ocr-prev-chunk');
      const nextBtn = document.getElementById('ocr-next-chunk');
      if (prevBtn) {
        prevBtn.disabled = ocrMediaPlayer.currentChunkIndex === 0;
      }
      if (nextBtn) {
        nextBtn.disabled = ocrMediaPlayer.currentChunkIndex === ocrMediaPlayer.chunks.length - 1;
      }
    };

    // Play/Pause button handler
    document.getElementById('ocr-play-pause').onclick = () => {
      const btn = document.getElementById('ocr-play-pause');
      if (ocrMediaPlayer.isPlaying) {
        // Pause
        if (ocrMediaPlayer.utterance) {
          window.speechSynthesis.pause();
          ocrMediaPlayer.isPaused = true;
          btn.textContent = '▶';
          console.log('[OCR] Paused playback');
        }
      } else if (ocrMediaPlayer.isPaused) {
        // Resume
        window.speechSynthesis.resume();
        ocrMediaPlayer.isPaused = false;
        btn.textContent = '⏸';
        console.log('[OCR] Resumed playback');
      } else {
        // Start playing current chunk
        ocr_playChunk(ocrMediaPlayer.currentChunkIndex, btn);
      }
    };

    // Stop button handler
    document.getElementById('ocr-stop').onclick = () => {
      ocr_stopPlayback();
      const btn = document.getElementById('ocr-play-pause');
      btn.textContent = '▶';
    };

    // Chunk navigation
    document.getElementById('ocr-prev-chunk')?.addEventListener('click', () => {
      if (ocrMediaPlayer.currentChunkIndex > 0) {
        ocr_stopPlayback();
        ocrMediaPlayer.currentChunkIndex--;
        updateChunkDisplay();
        console.log(`[OCR] Moved to chunk ${ocrMediaPlayer.currentChunkIndex + 1}`);
      }
    });

    document.getElementById('ocr-next-chunk')?.addEventListener('click', () => {
      if (ocrMediaPlayer.currentChunkIndex < ocrMediaPlayer.chunks.length - 1) {
        ocr_stopPlayback();
        ocrMediaPlayer.currentChunkIndex++;
        updateChunkDisplay();
        console.log(`[OCR] Moved to chunk ${ocrMediaPlayer.currentChunkIndex + 1}`);
      }
    });

    // Speed control buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.getAttribute('data-speed'));
        ocrMediaPlayer.rate = speed;

        // Update visual state
        document.querySelectorAll('.speed-btn').forEach(b => {
          b.style.background = '#f0f0f0';
          b.style.color = '#333';
          b.style.border = '2px solid transparent';
        });
        btn.style.background = '#667eea';
        btn.style.color = 'white';
        btn.style.border = '2px solid #667eea';

        // If currently playing, update the utterance rate
        if (ocrMediaPlayer.utterance && ocrMediaPlayer.isPlaying) {
          ocrMediaPlayer.utterance.rate = speed;
        }

        console.log(`[OCR] Speed set to ${speed}x`);
      });
    });

    // Utility buttons
    document.getElementById('assist-ocr-close').onclick = () => {
      ocr_stopPlayback();
      overlay.remove();
      resolve();
    };

    document.getElementById('assist-ocr-copy').onclick = () => {
      ocr_copyToClipboard(ocrMediaPlayer.fullText);
      alert('Full text copied to clipboard!');
    };

    document.getElementById('assist-ocr-save').onclick = () => {
      ocr_saveAsFile(ocrMediaPlayer.fullText);
    };

    // Close on overlay click
    overlay.onclick = e => {
      if (e.target === overlay) {
        ocr_stopPlayback();
        overlay.remove();
        resolve();
      }
    };

    // ESC key to close
    const handleEsc = e => {
      if (e.key === 'Escape') {
        ocr_stopPlayback();
        overlay.remove();
        document.removeEventListener('keydown', handleEsc);
        resolve();
      }
    };
    document.addEventListener('keydown', handleEsc);

    // Auto-play TTS if enabled in settings
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('assist_settings', result => {
        const autoTTS = result.assist_settings?.ocr?.autoTTS ?? true; // Default to true
        if (autoTTS && result.text) {
          // Auto-start playback after a brief delay to ensure modal is fully rendered
          setTimeout(() => {
            const playPauseBtn = document.getElementById('ocr-play-pause');
            if (playPauseBtn && !ocrMediaPlayer.isPlaying) {
              console.log('[OCR] Auto-starting TTS playback (auto-TTS enabled)');
              playPauseBtn.click(); // Simulate clicking the play button
            }
          }, 300);
        }
      });
    }
  });
}

/**
 * Plays a specific chunk with TTS
 * @param {number} chunkIndex - Index of chunk to play
 * @param {HTMLElement} playPauseBtn - Play/pause button element
 */
function ocr_playChunk(chunkIndex, playPauseBtn) {
  const text = ocrMediaPlayer.chunks[chunkIndex];
  console.log(`[OCR] Playing chunk ${chunkIndex + 1}/${ocrMediaPlayer.chunks.length}`);

  // Load user TTS settings
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('assist_settings', result => {
      const ttsSettings = result.assist_settings?.tts || {};
      const userVoiceName = ttsSettings.voice;
      const userPitch = ttsSettings.pitch || 1.0;
      const userVolume = ttsSettings.volume || 1.0;

      const voices = window.speechSynthesis.getVoices();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = ocrMediaPlayer.rate;
      utterance.pitch = userPitch;
      utterance.volume = userVolume;

      // Try to use user's preferred voice, or fallback to Google UK Female
      if (userVoiceName && userVoiceName !== 'default') {
        const selectedVoice = voices.find(v => v.name === userVoiceName);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      } else {
        // Default to Google UK Female voice (same as extension-level TTS)
        // Preference order: Google UK Female > UK Female > Any English Female
        const defaultVoice =
          voices.find(
            v => v.name.includes('Google') && v.name.includes('UK') && v.name.includes('Female')
          ) ||
          voices.find(v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female')) ||
          voices.find(v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('female'));

        if (defaultVoice) {
          utterance.voice = defaultVoice;
          console.log('[OCR] Using default voice:', defaultVoice.name);
        }
      }

      utterance.onstart = () => {
        ocrMediaPlayer.isPlaying = true;
        ocrMediaPlayer.isPaused = false;
        playPauseBtn.textContent = '⏸';
        console.log('[OCR] ✓ Chunk playback started');
      };

      utterance.onend = () => {
        console.log('[OCR] ✓ Chunk playback ended');

        // Auto-advance to next chunk if available
        if (ocrMediaPlayer.currentChunkIndex < ocrMediaPlayer.chunks.length - 1) {
          ocrMediaPlayer.currentChunkIndex++;
          document.getElementById('ocr-current-chunk').textContent =
            ocrMediaPlayer.currentChunkIndex + 1;
          document.getElementById('ocr-chunk-length').textContent =
            ocrMediaPlayer.chunks[ocrMediaPlayer.currentChunkIndex].length;
          document.getElementById('ocr-text-display').value =
            ocrMediaPlayer.chunks[ocrMediaPlayer.currentChunkIndex];

          // Update navigation buttons
          const prevBtn = document.getElementById('ocr-prev-chunk');
          const nextBtn = document.getElementById('ocr-next-chunk');
          if (prevBtn) {
            prevBtn.disabled = false;
          }
          if (nextBtn) {
            nextBtn.disabled =
              ocrMediaPlayer.currentChunkIndex === ocrMediaPlayer.chunks.length - 1;
          }

          // Continue playing
          ocr_playChunk(ocrMediaPlayer.currentChunkIndex, playPauseBtn);
        } else {
          // Reached end of all chunks
          ocrMediaPlayer.isPlaying = false;
          playPauseBtn.textContent = '▶';
          console.log('[OCR] ✓ Finished playing all chunks');
        }
      };

      utterance.onerror = e => {
        console.error('[OCR] ✗ Speech error:', e.error || 'unknown');
        ocrMediaPlayer.isPlaying = false;
        playPauseBtn.textContent = '▶';
      };

      ocrMediaPlayer.utterance = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }
}

/**
 * Stops playback and resets state
 */
function ocr_stopPlayback() {
  if (ocrMediaPlayer.utterance) {
    window.speechSynthesis.cancel();
    ocrMediaPlayer.isPlaying = false;
    ocrMediaPlayer.isPaused = false;
    ocrMediaPlayer.utterance = null;
    console.log('[OCR] Stopped playback');
  }
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

// Old ocr_readAloud and ocr_stopAudio functions removed - replaced by media player system

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
