/**
 * OCR (Optical Character Recognition) Feature
 *
 * Provides text extraction from images, screenshots, and PDFs using Tesseract.js
 *
 * Features:
 * - Lazy loading of Tesseract.js (only loads when OCR is first used)
 * - Screenshot capture (full page and region selection)
 * - PDF text extraction
 * - Engine and English ship in the package; other languages download once on request (ADR 0008)
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
import { Z } from '../../utils/z-index.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { debugLog } from '../../utils/debug-log.js';
import { createSavedUtterance } from '../../utils/speech-voice.js';
import { VISION_MODEL } from '../../utils/ollama-models.js';
import { reconstructLayout, linesFromTesseract } from './ocr-layout.js';
import { renderMarkdownToHtml, stripMarkdownForSpeech } from './ocr-markdown.js';
import {
  toGrayscale,
  normalizeContrast,
  otsuThreshold,
  binarize,
  computeUpscaleFactor,
} from './ocr-preprocess.js';
import {
  splitIntoUnits,
  takeChunk,
  adaptChunkChars,
  combineChunks,
  dedupeRepeatedLines,
  stripAiCommentary,
} from './ocr-chunk.js';
import { trapFocus } from '../../utils/focus-trap.js';
import {
  getAIMode,
  checkAIAvailable,
  generateWithAI,
  getUnavailableStatusMessage,
} from '../shared/ai-feature-client.js';
import { getPrompt } from '../../ai/prompts/registry.js';
import { REGISTRY } from '../../ai/model-registry.js';
import { bundledLanguagePath, ocrWorkerOptions } from './ocr-engine-files.js';
import { prepareOcrLanguage } from './ocr-language-data.js';
import { createDeclinedNotice } from '../../utils/consent-panel.js';

let ocr_tesseractInstance = null;
let ocr_isInitialized = false;
let ocr_isLoading = false;
let ocr_loadingPromise = null;

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
    cleanup: ocr_cleanup,
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
  debugLog(`[OCR] Fetching PDF data from: ${pdfUrl}`);

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
    const response = await fetch(pdfUrl, { signal: AbortSignal.timeout(60000) });
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

    debugLog(`[OCR] Loading PDF from: ${pdfUrl}`);

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
      z-index: ${Z.MODAL};
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
    z-index: ${Z.MODAL};
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

  // Handle button clicks using shared event handler utility
  return new Promise(resolve => {
    attachAccessibleHandler(
      document.getElementById('assist-ocr-visible'),
      'OCR Capture Visible',
      async () => {
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
      }
    );

    attachAccessibleHandler(
      document.getElementById('assist-ocr-fullpage'),
      'OCR Capture Full Page',
      async () => {
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
      }
    );

    attachAccessibleHandler(
      document.getElementById('assist-ocr-region'),
      'OCR Capture Region',
      async () => {
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
      }
    );

    attachAccessibleHandler(document.getElementById('assist-ocr-cancel'), 'OCR Cancel', () => {
      overlay.remove();
      resolve(null);
    });
  });
}

/**
 * Reads the offline-accuracy preprocessing toggle. Default OFF (unset/false) — recognition output
 * only changes when a user explicitly opts in (per the ADR).
 *
 * @returns {Promise<boolean>}
 */
async function ocr_offlineAccuracyEnabled() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return false;
  }
  const result = await chrome.storage.local.get('assist_settings');
  return result.assist_settings?.ocr?.offlineAccuracy === true;
}

/**
 * Loads a data URL into an Image element.
 *
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
function ocr_loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
    img.src = dataUrl;
  });
}

/**
 * Single shared preprocessing gate, called from ocr_recognizeText — the one function every capture
 * path (region, full-page, and each page of a multi-page PDF) funnels through before Tesseract runs.
 * Routing preprocessing through this one call site means there is exactly one preprocessing path, not
 * one per capture mode.
 *
 * Off/unset (the default) is a byte-identical passthrough: the ocr-preprocess.js pure transforms are
 * never invoked, so recognition output is unchanged from today. When
 * `assist_settings.ocr.offlineAccuracy` is explicitly `true`, runs grayscale → contrast normalize →
 * Otsu binarize → adaptive upscale on the image before Tesseract sees it.
 *
 * Any failure anywhere in this chain (settings read, image decode, canvas unavailable, a transform
 * throwing) falls back to the original, unmodified image — preprocessing must never be able to break
 * OCR.
 *
 * @param {string} imageDataUrl
 * @returns {Promise<string>}
 */
async function ocr_prepareCanvas(imageDataUrl) {
  let enabled = false;
  try {
    enabled = await ocr_offlineAccuracyEnabled();
  } catch (error) {
    console.warn('[OCR] Could not read offline-accuracy setting, skipping preprocessing:', error);
    return imageDataUrl;
  }
  if (!enabled) {
    return imageDataUrl;
  }

  try {
    const img = await ocr_loadImageElement(imageDataUrl);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = img.width;
    sourceCanvas.height = img.height;
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx.drawImage(img, 0, 0);
    let imageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    imageData = toGrayscale(imageData);
    imageData = normalizeContrast(imageData);
    const threshold = otsuThreshold(imageData);
    imageData = binarize(imageData, threshold);

    const processedCanvas = document.createElement('canvas');
    processedCanvas.width = imageData.width;
    processedCanvas.height = imageData.height;
    processedCanvas.getContext('2d').putImageData(imageData, 0, 0);

    const scale = computeUpscaleFactor(imageData.width, imageData.height);
    if (scale <= 1) {
      return processedCanvas.toDataURL('image/png');
    }

    const upscaledCanvas = document.createElement('canvas');
    upscaledCanvas.width = imageData.width * scale;
    upscaledCanvas.height = imageData.height * scale;
    const upscaledCtx = upscaledCanvas.getContext('2d');
    upscaledCtx.imageSmoothingEnabled = true;
    upscaledCtx.imageSmoothingQuality = 'high';
    upscaledCtx.drawImage(processedCanvas, 0, 0, upscaledCanvas.width, upscaledCanvas.height);
    return upscaledCanvas.toDataURL('image/png');
  } catch (error) {
    console.warn('[OCR] Preprocessing failed, falling back to unprocessed image:', error);
    return imageDataUrl;
  }
}

/**
 * Performs OCR on an image
 *
 * @param {string} imageDataUrl - Image data URL to process
 * @param {Object} options - OCR options
 * @param {{code: string, langPath: string}} [options.language] - the language to read in, as
 *   `prepareOcrLanguage` gives it (default: English, from the package)
 * @param {number} options.confidenceThreshold - Minimum confidence (0-100, default: 50)
 * @param {boolean} options.filterNoise - Remove UI clutter (default: from settings)
 * @param {number} options.upscaleFactor - Image upscaling factor for better accuracy (default: 1.5)
 * @param {boolean} options.skipUpscaling - Skip upscaling (e.g., for PDF.js pre-rendered images)
 * @returns {Promise<Object>} OCR result with text and confidence
 */
async function ocr_recognizeText(imageDataUrl, options = {}) {
  const {
    language = { code: 'eng', langPath: bundledLanguagePath('eng') },
    confidenceThreshold = 50,
    upscaleFactor = 1.5,
    skipUpscaling = false,
    onProgress,
    onStage,
  } = options;

  try {
    console.log(
      `[OCR] Starting text recognition (lang: ${language.code}, threshold: ${confidenceThreshold}%, upscale: ${skipUpscaling ? 'skipped' : upscaleFactor + 'x'})`
    );

    // Upscale image for better OCR accuracy (unless it's already high-quality like PDF.js renders)
    let processedImage = imageDataUrl;
    if (!skipUpscaling && upscaleFactor > 1.0) {
      processedImage = await ocr_upscaleImage(imageDataUrl, upscaleFactor);
    } else if (skipUpscaling) {
      console.log('[OCR] Skipping upscaling (image already high-quality)');
    }

    // Offline-accuracy preprocessing (grayscale/contrast/Otsu binarize/adaptive upscale), opt-in via
    // assist_settings.ocr.offlineAccuracy. No-op (byte-identical passthrough) when off/unset.
    processedImage = await ocr_prepareCanvas(processedImage);

    // Lazy load Tesseract
    const Tesseract = await ocr_loadTesseract();

    // Every file the worker loads comes from the extension or the prepared language (ADR 0008).
    console.log('[OCR] Creating Tesseract worker...');
    const worker = await Tesseract.createWorker(language.code, 1, {
      ...ocrWorkerOptions(language.langPath),
      logger: m => {
        if (m.status === 'recognizing text') {
          if (typeof onProgress === 'function') {
            onProgress(m.progress);
          }
          console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
        } else if (m.status && typeof onStage === 'function') {
          onStage(ocr_stageLabel(m.status));
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

    // Perform OCR on the upscaled image. Request blocks so per-line/word bbox geometry is populated
    // (Tesseract.js v5 omits it otherwise) — the layout reconstruction needs it.
    console.log('[OCR] Recognizing text...');
    const result = await worker.recognize(processedImage, {}, { blocks: true });

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

    // Reconstruct format-preserving Markdown from the line geometry (additive — `text` is unchanged).
    // Drop page furniture a stitched full-page capture repeats many times (sticky sidebars, repeated
    // tables of contents) so even the default view is cleaner; genuine content rarely repeats 3+ times.
    const layout = reconstructLayout({ lines: linesFromTesseract(result.data) });
    const layoutMarkdown = dedupeRepeatedLines(layout.markdown);

    return {
      text: filteredText,
      originalText: result.data.text,
      layoutMarkdown,
      layoutBlocks: layout.blocks,
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
    z-index: ${Z.MODAL};
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
 * Map a Tesseract worker status to a friendly stage label.
 * @param {string} status
 * @returns {string}
 */
function ocr_stageLabel(status) {
  const labels = {
    'loading tesseract core': 'Loading the OCR engine…',
    'initializing tesseract': 'Starting up…',
    'initializing api': 'Starting up…',
    'loading language traineddata': 'Loading language data…',
    'recognizing text': 'Recognising text…',
  };
  return labels[status] || 'Preparing…';
}

/**
 * Shows an accessible recognition-progress overlay for single-image OCR. Long pages can take a
 * while, so this gives a live progress bar plus a rough time-remaining estimate. Returns handles to
 * update it and close it; degrades to a no-op shape where there is no DOM (tests).
 *
 * @returns {{ update: (progress: number) => void, stage: (label: string) => void, close: () => void }}
 */
function ocr_showRecognitionProgress() {
  if (typeof document === 'undefined' || !document.body) {
    return { update() {}, stage() {}, close() {} };
  }

  const startTime = Date.now();
  const overlay = document.createElement('div');
  overlay.id = 'assist-ocr-recognition-progress';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:${Z.MODAL};display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;
  const modal = document.createElement('div');
  modal.style.cssText =
    'background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:460px;width:90%;padding:28px;';
  modal.innerHTML = sanitizeHTML(`
    <h2 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#1a1a1a;">Reading text…</h2>
    <p id="assist-ocr-rec-stage" role="status" aria-live="polite" style="margin:0 0 16px 0;color:#475569;font-size:13px;">Preparing…</p>
    <div role="progressbar" aria-label="OCR progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="assist-ocr-rec-track" style="background:#e2e8f0;border-radius:8px;height:10px;overflow:hidden;margin-bottom:10px;">
      <div id="assist-ocr-rec-bar" style="background:#2c5d8a;height:100%;width:0%;transition:width 0.3s ease;"></div>
    </div>
    <p id="assist-ocr-rec-eta" style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Pages with a lot of text take a little longer.</p>
  `);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const bar = overlay.querySelector('#assist-ocr-rec-bar');
  const track = overlay.querySelector('#assist-ocr-rec-track');
  const stageEl = overlay.querySelector('#assist-ocr-rec-stage');
  const etaEl = overlay.querySelector('#assist-ocr-rec-eta');

  return {
    update(progress) {
      const pct = Math.max(0, Math.min(100, Math.round((progress || 0) * 100)));
      if (bar) {
        bar.style.width = `${pct}%`;
      }
      if (track) {
        track.setAttribute('aria-valuenow', String(pct));
      }
      if (stageEl) {
        stageEl.textContent = `Recognising text… ${pct}%`;
      }
      if (etaEl && progress > 0.05 && progress < 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.ceil((elapsed * (1 - progress)) / progress);
        etaEl.textContent =
          remaining > 60
            ? `About ${Math.floor(remaining / 60)}m ${remaining % 60}s remaining`
            : `About ${remaining}s remaining`;
      }
    },
    stage(label) {
      if (stageEl) {
        stageEl.textContent = label;
      }
    },
    close() {
      overlay.remove();
    },
  };
}

/**
 * Main OCR workflow - captures screenshot and performs OCR
 *
 * @param {Object} options - OCR options
 * @returns {Promise<Object>} OCR result
 */
async function ocr_performOCR(options = {}) {
  // Lets the page's copy of a downloaded language file go once the capture is over (ADR 0008).
  let releaseLanguage = () => {};
  try {
    console.log('[OCR] Starting OCR workflow...');

    // Load OCR settings from storage
    let readingModeWasActivated = false;
    let shouldAutoActivateReadingMode = true; // Default to true
    let ocrLanguage = 'eng'; // Default language
    let ocrConfidenceThreshold = 60; // Default confidence threshold
    let ocrUpscaleFactor = 1.5; // Default zoom/upscale for capture
    // Off unless the student chose it: a voice starting unprompted can talk over a screen reader.
    let shouldAutoPlay = false;
    let savedRate;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await chrome.storage.local.get('assist_settings');
      const ocrSettings = result.assist_settings?.ocr || {};

      // Load all OCR settings
      shouldAutoActivateReadingMode = ocrSettings.autoActivateReadingMode !== false;
      ocrLanguage = ocrSettings.language || 'eng';
      ocrConfidenceThreshold = ocrSettings.confidenceThreshold ?? 60;
      ocrUpscaleFactor = ocrSettings.upscaleFactor ?? 1.5;
      shouldAutoPlay = ocrSettings.autoTTS === true;
      savedRate = result.assist_settings?.tts?.rate;

      console.log(
        `[OCR] Settings loaded - Language: ${ocrLanguage}, Confidence: ${ocrConfidenceThreshold}%, Zoom: ${ocrUpscaleFactor}x`
      );
    }

    // Merge settings into options (options parameter takes precedence)
    const mergedOptions = {
      lang: ocrLanguage,
      confidenceThreshold: ocrConfidenceThreshold,
      upscaleFactor: ocrUpscaleFactor,
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

    // The language is ready before recognition starts: English from the package, another language
    // downloaded once on request, or English with a note saying why (ADR 0008).
    const prepared = await prepareOcrLanguage(mergedOptions.lang);
    releaseLanguage = prepared.release;
    const recognitionOptions = { ...mergedOptions, language: prepared.language };

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
      const pdfOptions = { ...recognitionOptions, skipUpscaling: true };

      try {
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
      } finally {
        // Always remove the progress modal — a page failure must not orphan it on the page.
        progressModal.remove();
      }

      // Concatenate all page texts
      const combinedText = pageResults.map(r => r.text).join('\n\n--- Page Break ---\n\n');
      const avgConfidence =
        pageResults.reduce((sum, r) => sum + r.confidence, 0) / pageResults.length;

      result = {
        text: combinedText,
        originalText: pageResults.map(r => r.originalText).join('\n\n--- Page Break ---\n\n'),
        layoutMarkdown: pageResults
          .map(r => r.layoutMarkdown || '')
          .join('\n\n--- Page Break ---\n\n'),
        confidence: avgConfidence,
        pages: pageResults.length,
        pageResults: pageResults,
      };

      console.log(
        `[OCR] Multi-page processing complete. Total: ${result.text.length} characters, Avg confidence: ${avgConfidence.toFixed(1)}%`
      );
    } else {
      // Single image OCR — show a live progress overlay (long pages can take a while).
      const progressUI = ocr_showRecognitionProgress();
      try {
        result = await ocr_recognizeText(imageDataUrl, {
          ...recognitionOptions,
          onStage: label => progressUI.stage(label),
          onProgress: progress => progressUI.update(progress),
        });
      } finally {
        progressUI.close();
      }
    }

    if (prepared.notice) {
      result.languageNotice = prepared.notice;
    }

    // Show result modal (use first page image for multi-page PDFs). Auto-play reads through the
    // dialog's own player, so its pause, stop and close control it; closing stops the voice before
    // reading mode (if it was entered for the capture) is left below. After a no to the language
    // file, the dialog offers Allow in place, and a yes starts a new capture in that language.
    const displayImage = Array.isArray(imageDataUrl) ? imageDataUrl[0] : imageDataUrl;
    await ocr_showLayoutResultModal(result, displayImage, {
      autoPlay: shouldAutoPlay,
      rate: savedRate,
      onLanguageAllowed: prepared.declined ? () => ocr_performOCR(options) : null,
    });

    // Exit reading mode if we activated it
    if (readingModeWasActivated && window.assistFeatures?.readingMode) {
      console.log('[OCR] Exiting auto-activated reading mode');
      window.assistFeatures.readingMode.exit();
    }

    return result;
  } catch (error) {
    console.error('[OCR] OCR workflow failed:', error);
    ocr_notify(`OCR failed: ${error.message}`, true);
    return null;
  } finally {
    releaseLanguage();
  }
}

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
 * Map a confidence score to an accessible badge (word + icon + colour, never colour alone — SC 1.4.1).
 * @param {number} confidence - 0–100
 * @returns {{label: string, color: string, bg: string, icon: string}}
 */
function ocr_confidenceMeta(confidence) {
  if (confidence >= 85) {
    return { label: 'High confidence', color: '#0f5132', bg: '#d1e7dd', icon: '✓' };
  }
  if (confidence >= 60) {
    return { label: 'Medium confidence', color: '#664d03', bg: '#fff3cd', icon: '◐' };
  }
  return { label: 'Low confidence', color: '#842029', bg: '#f8d7da', icon: '!' };
}

/** Detect image media type from base64 magic bytes (vision APIs need an accurate type). */
function ocr_visionMediaType(base64) {
  if (base64.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }
  if (base64.startsWith('/9j/')) {
    return 'image/jpeg';
  }
  if (base64.startsWith('R0lGOD')) {
    return 'image/gif';
  }
  if (base64.startsWith('UklGR')) {
    return 'image/webp';
  }
  return 'image/png';
}

/**
 * High-fidelity OCR via a cloud/local vision model. Sends the captured image (not the
 * Tesseract text) to the configured vision model with the structure-preserving `ocrLayout` prompt and
 * returns format-preserving Markdown. Routes by the user's AI mode: cloud → Claude vision, local →
 * a local Ollama vision model. Reuses the existing vision pipeline — no new endpoint or permission.
 *
 * @param {string} imageDataUrl - the captured image as a data URL
 * @returns {Promise<string>} format-preserving Markdown
 */
async function ocr_visionLayout(imageDataUrl) {
  const base64 = String(imageDataUrl || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) {
    throw new Error('No image to read.');
  }

  let mode = 'off';
  let cloudModel = REGISTRY.anthropic.defaultModel;
  try {
    const stored = await chrome.storage.local.get(['aiMode', 'cloudModel']);
    mode = stored.aiMode || 'off';
    cloudModel = stored.cloudModel || REGISTRY.anthropic.defaultModel;
  } catch {
    // fall through to the unsupported-mode error below
  }

  const prompt =
    getPrompt('ocrLayout') ||
    'Transcribe the text in this image as clean Markdown, preserving headings, paragraphs and tables. Return only the Markdown.';

  if (mode === 'cloud') {
    const response = await chrome.runtime.sendMessage({
      action: 'CLOUD_LLM_VISION',
      image: base64,
      imageMediaType: ocr_visionMediaType(base64),
      prompt,
      options: {
        model: cloudModel,
        maxTokens: 4000,
        temperature: 0.1,
        feature: 'ocr',
        noCache: true,
      },
    });
    if (response?.success) {
      return response.data;
    }
    throw new Error(response?.error || 'Cloud vision request failed.');
  }

  if (mode === 'local') {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_VISION',
      image: base64,
      prompt,
      options: { maxTokens: 1500, temperature: 0.1 },
    });
    if (response?.success) {
      return response.data;
    }
    throw new Error(
      response?.error || `Local vision model unavailable — run: ollama pull ${VISION_MODEL}`
    );
  }

  throw new Error(
    'AI vision needs Cloud (Claude) or Local (Ollama) mode — choose one in AI setup.'
  );
}

/**
 * New-experience OCR result modal: renders the format-preserving Markdown (B1) with a sanitized
 * preview, an editable view, a confidence indicator, and copy/save — fully accessible (role=dialog,
 * aria-modal, focus trap, Escape/backdrop close, keyboard-operable controls, status live region).
 *
 * @param {Object} result - OCR result (uses layoutMarkdown, text, confidence)
 * @param {string} imageDataUrl - original image data URL (collapsible preview)
 * @param {Object} [player] - read-aloud options
 * @param {boolean} [player.autoPlay=false] - start reading the text as soon as the dialog opens
 * @param {number} [player.rate] - the student's saved speaking rate; 1 when absent or invalid
 * @param {Function|null} [player.onLanguageAllowed] - set when the chosen language was declined:
 *   the dialog shows the declined notice, and a yes closes it and runs this
 * @returns {Promise<void>} resolves when the modal closes
 */
async function ocr_showLayoutResultModal(
  result,
  imageDataUrl,
  { autoPlay = false, rate, onLanguageAllowed = null } = {}
) {
  const initialRate = Number.isFinite(rate) && rate > 0 ? rate : 1.0;
  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    let releaseTrap = null;

    const onKeydown = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    const close = () => {
      ocr_stopPlayback();
      if (releaseTrap) {
        releaseTrap();
      }
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      resolve();
    };

    const overlay = document.createElement('div');
    overlay.id = 'assist-ocr-layout-modal';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:${Z.MODAL};display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;

    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'assist-ocr-layout-title');
    modal.style.cssText = `background:#fff;color:#1a1a1a;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:820px;width:92%;max-height:90vh;display:flex;flex-direction:column;`;

    // Header: title + confidence badge + close. This is now the only OCR result surface, so a
    // result with no confidence score (an empty or failed recognition) drops the badge rather
    // than claiming a made-up one.
    const meta = ocr_confidenceMeta(result.confidence);
    const confidenceBadge = Number.isFinite(result.confidence)
      ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:3px 10px;border-radius:999px;color:${meta.color};background:${meta.bg};">
          <span aria-hidden="true">${meta.icon}</span>${meta.label} (${result.confidence.toFixed(0)}%)
        </span>`
      : '';
    const header = document.createElement('div');
    header.style.cssText =
      'padding:16px 20px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center;gap:12px;';
    header.innerHTML = sanitizeHTML(`
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <h2 id="assist-ocr-layout-title" style="margin:0;font-size:18px;font-weight:600;">Extracted text</h2>
        ${confidenceBadge}
      </div>
    `);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.style.cssText =
      'background:#eee;border:none;width:36px;height:36px;border-radius:8px;font-size:22px;line-height:1;cursor:pointer;color:#333;flex-shrink:0;';
    header.appendChild(closeBtn);

    // Toolbar: view toggle + actions.
    const toolbar = document.createElement('div');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Result actions');
    toolbar.style.cssText =
      'display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;';
    const makeButton = label => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText =
        'padding:8px 14px;min-height:40px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#1a1a1a;font-size:13px;font-weight:600;cursor:pointer;';
      return b;
    };
    const previewBtn = makeButton('Preview');
    const editBtn = makeButton('Edit');
    const copyBtn = makeButton('Copy');
    const saveBtn = makeButton('Save');
    const studyPathBtn = makeButton('📚 Study Path');
    const visionBtn = makeButton('🔍 AI vision');
    visionBtn.style.display = 'none'; // shown only for cloud/local AI modes (set below)
    const aiBtn = makeButton('✨ AI clean-up');
    const undoBtn = makeButton('Undo AI');
    undoBtn.style.display = 'none';
    previewBtn.setAttribute('aria-pressed', 'true');
    editBtn.setAttribute('aria-pressed', 'false');

    // Summarize toggle — OFF (default) keeps the text verbatim (OCR fidelity); ON lets the AI
    // condense the page. Per-capture so the choice can be made after seeing the text.
    const summarizeLabel = document.createElement('label');
    summarizeLabel.style.cssText =
      'display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#1a1a1a;cursor:pointer;margin-left:4px;';
    const summarizeCheck = document.createElement('input');
    summarizeCheck.type = 'checkbox';
    summarizeCheck.id = 'assist-ocr-summarize';
    summarizeLabel.append(summarizeCheck, document.createTextNode('Summarize'));

    toolbar.append(
      previewBtn,
      editBtn,
      copyBtn,
      saveBtn,
      studyPathBtn,
      visionBtn,
      aiBtn,
      undoBtn,
      summarizeLabel
    );

    // Body: collapsible screenshot, rendered preview, editable source.
    const body = document.createElement('div');
    body.style.cssText = 'padding:20px;flex:1;overflow-y:auto;background:#fff;';

    // Why this was read as English, when the chosen language's file could not be used (ADR 0008).
    if (result.languageNotice) {
      const note = document.createElement('p');
      note.textContent = result.languageNotice;
      note.style.cssText =
        'margin:0 0 16px;padding:10px 12px;border-left:4px solid #1a56db;background:#eff6ff;color:#1a1a1a;font-size:14px;line-height:1.5;';
      body.appendChild(note);
    }
    if (typeof onLanguageAllowed === 'function') {
      const declined = createDeclinedNotice('ocrLanguages', {
        onAllowed: () => {
          // The yes can come long after the student closed this dialog; a capture starting then
          // would come out of nowhere.
          if (!overlay.isConnected) {
            return;
          }
          close();
          onLanguageAllowed();
        },
      });
      declined.style.cssText = 'margin:0 0 16px;';
      body.appendChild(declined);
    }

    if (imageDataUrl) {
      const details = document.createElement('details');
      details.style.cssText = 'margin-bottom:16px;';
      const summary = document.createElement('summary');
      summary.textContent = '📷 View screenshot';
      summary.style.cssText = 'cursor:pointer;font-weight:600;font-size:13px;color:#475569;';
      const shot = document.createElement('img');
      shot.src = imageDataUrl;
      shot.alt = 'Captured image';
      shot.style.cssText =
        'display:block;margin-top:12px;max-width:100%;max-height:240px;border:1px solid #e0e0e0;border-radius:8px;';
      details.append(summary, shot);
      body.appendChild(details);
    }

    const preview = document.createElement('div');
    preview.setAttribute('aria-label', 'Formatted preview');
    preview.style.cssText = 'line-height:1.6;font-size:15px;';
    const sourceText = result.layoutMarkdown || result.text || '';
    preview.innerHTML = sanitizeHTML(renderMarkdownToHtml(sourceText));

    const editor = document.createElement('textarea');
    editor.setAttribute('aria-label', 'Editable extracted text (Markdown)');
    editor.value = sourceText;
    editor.style.cssText =
      'width:100%;min-height:340px;box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;padding:12px;border:1px solid #cbd5e1;border-radius:8px;resize:vertical;display:none;';

    body.append(preview, editor);

    // Read-aloud player: play/pause, stop, and speed (reuses the shared speech engine).
    const playerBar = document.createElement('div');
    playerBar.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid #f0f0f0;';
    const transport = document.createElement('div');
    transport.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Read aloud');
    playBtn.style.cssText =
      'width:48px;height:48px;border-radius:50%;border:none;background:#2c5d8a;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.textContent = '■';
    stopBtn.setAttribute('aria-label', 'Stop reading');
    stopBtn.style.cssText =
      'width:44px;height:44px;border-radius:50%;border:none;background:#c0392b;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    transport.append(playBtn, stopBtn);
    const speedRow = document.createElement('div');
    speedRow.setAttribute('role', 'group');
    speedRow.setAttribute('aria-label', 'Reading speed');
    speedRow.style.cssText =
      'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;';
    const speedLabel = document.createElement('span');
    speedLabel.textContent = 'Speed:';
    speedLabel.style.cssText = 'font-size:13px;color:#475569;margin-right:4px;';
    speedRow.appendChild(speedLabel);
    const speedButtons = [0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${speed}x`;
      b.dataset.speed = String(speed);
      // A saved rate between two buttons leaves none pressed rather than claiming the wrong one.
      const active = speed === initialRate;
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      b.style.cssText = `padding:6px 12px;min-height:36px;border-radius:8px;border:1px solid #cbd5e1;cursor:pointer;font-size:13px;font-weight:600;background:${active ? '#2c5d8a' : '#f8fafc'};color:${active ? '#fff' : '#1a1a1a'};`;
      speedRow.appendChild(b);
      return b;
    });
    playerBar.append(transport, speedRow);

    // Status live region.
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'padding:8px 20px;font-size:13px;color:#475569;min-height:20px;';

    const showPreview = () => {
      preview.innerHTML = sanitizeHTML(renderMarkdownToHtml(editor.value));
      preview.style.display = '';
      editor.style.display = 'none';
      previewBtn.setAttribute('aria-pressed', 'true');
      editBtn.setAttribute('aria-pressed', 'false');
    };
    const showEdit = () => {
      preview.style.display = 'none';
      editor.style.display = '';
      previewBtn.setAttribute('aria-pressed', 'false');
      editBtn.setAttribute('aria-pressed', 'true');
      editor.focus();
    };

    attachAccessibleHandler(previewBtn, 'OCR Preview View', showPreview);
    attachAccessibleHandler(editBtn, 'OCR Edit View', showEdit);
    attachAccessibleHandler(copyBtn, 'OCR Copy Text', async () => {
      try {
        await navigator.clipboard.writeText(editor.value);
        status.textContent = 'Copied to clipboard.';
      } catch {
        status.textContent = 'Copy failed — select the text and copy manually.';
      }
    });
    attachAccessibleHandler(saveBtn, 'OCR Save Text', () => {
      ocr_saveAsFile(editor.value);
      status.textContent = 'Saved.';
    });
    attachAccessibleHandler(studyPathBtn, 'OCR Study Path', () => {
      // Hand the current text (AI-corrected edits included) to the Study Path Generator.
      const text = editor.value;
      if (!window.assistFeatures?.studyPathGenerator) {
        status.textContent = 'Study Path Generator is not available — enable it in settings.';
        return;
      }
      close();
      window.assistFeatures.studyPathGenerator.show(text);
    });
    attachAccessibleHandler(closeBtn, 'OCR Close', close);

    // Read-aloud player wiring.
    ocrMediaPlayer.rate = initialRate;
    ocrMediaPlayer.isPlaying = false;
    ocrMediaPlayer.isPaused = false;
    const setPlayGlyph = playing => {
      playBtn.textContent = playing ? '⏸' : '▶';
      playBtn.setAttribute('aria-label', playing ? 'Pause reading' : 'Read aloud');
    };
    // Speak plain prose — strip Markdown so the reader never voices "hash hash hash".
    const readingText = () => stripMarkdownForSpeech(editor.value);
    const startReading = text => {
      ocrMediaPlayer.fullText = text;
      ocrMediaPlayer.chunks = ocr_splitTextIntoChunks(text);
      ocrMediaPlayer.currentChunkIndex = 0;
      ocr_playChunk(0, playBtn);
      setPlayGlyph(true);
      status.textContent = 'Reading…';
    };
    attachAccessibleHandler(playBtn, 'OCR Read Aloud', () => {
      if (ocrMediaPlayer.isPlaying && !ocrMediaPlayer.isPaused) {
        window.speechSynthesis.pause();
        ocrMediaPlayer.isPaused = true;
        setPlayGlyph(false);
        status.textContent = 'Paused.';
      } else if (ocrMediaPlayer.isPaused) {
        window.speechSynthesis.resume();
        ocrMediaPlayer.isPaused = false;
        setPlayGlyph(true);
        status.textContent = 'Reading…';
      } else {
        const text = readingText();
        if (!text) {
          status.textContent = 'Nothing to read.';
          return;
        }
        startReading(text);
      }
    });
    attachAccessibleHandler(stopBtn, 'OCR Stop Reading', () => {
      ocr_stopPlayback();
      setPlayGlyph(false);
      status.textContent = 'Stopped.';
    });
    speedButtons.forEach(b => {
      const speed = parseFloat(b.dataset.speed);
      attachAccessibleHandler(b, `OCR speed ${speed}x`, () => {
        ocrMediaPlayer.rate = speed;
        speedButtons.forEach(other => {
          const active = other === b;
          other.setAttribute('aria-pressed', active ? 'true' : 'false');
          other.style.background = active ? '#2c5d8a' : '#f8fafc';
          other.style.color = active ? '#fff' : '#1a1a1a';
        });
        if (ocrMediaPlayer.utterance && ocrMediaPlayer.isPlaying) {
          ocrMediaPlayer.utterance.rate = speed;
        }
        status.textContent = `Speed ${speed}×`;
      });
    });

    // AI proofread: a second pass over the text using the AI configured in the extension. Optional;
    // additive; reverts cleanly. Reuses the shared AI client (no new endpoint/permission).
    let preAiMarkdown = null;
    attachAccessibleHandler(aiBtn, 'OCR AI Proofread', async () => {
      const original = editor.value;
      if (!original.trim()) {
        status.textContent = 'Nothing to proofread.';
        return;
      }
      const summarize = summarizeCheck.checked;
      const previousLabel = aiBtn.textContent;
      aiBtn.disabled = true;
      aiBtn.textContent = summarize ? 'Summarizing…' : 'Cleaning up…';
      status.textContent = summarize ? 'Summarizing with AI…' : 'Cleaning up the text with AI…';
      try {
        const modeInfo = await getAIMode('summarization');
        if (modeInfo.isOff) {
          status.textContent = 'AI is off — turn it on in AI setup to use this.';
          return;
        }
        const availability = await checkAIAvailable(modeInfo);
        if (!availability.available) {
          status.textContent = getUnavailableStatusMessage(availability);
          return;
        }
        // Strict (default): aggressively drop non-article chrome and restore reading order, but keep
        // the article's own sentences verbatim (no summarizing/rewording). Summarize (opt-in): condense.
        const proofreadPromptFor =
          part => `You are cleaning up a SECTION of text captured by OCR of a web page so it can be read aloud. The capture mixes the real content with interface text and may be jumbled.

1. REMOVE everything that is not the main reading content: site name, menus, breadcrumbs, table of contents / section lists, tabs like "Article", "Talk", "Read", "View source", "View history", search, donate, "create account", "log in", language lists, edit links, appearance / text-size / colour controls and their options (e.g. "Small", "Standard", "Large", "Wide", "Automatic", "Light", "Dark"), sidebars, info-box labels, adverts, cookie or consent notices, headers and footers.
2. ALSO REMOVE reference apparatus, which is not readable prose: numbered or bulleted citation/reference lists, footnotes, bibliographies, "doi:", "ISBN", "PMID", "PMC", "Archived from the original" and "Retrieved <date>" entries, and the "References", "Notes", "Citations", "Further reading", "External links" and "See also" sections in their entirety.
3. KEEP the actual prose content. You MAY fix OCR errors, rejoin lines split mid-sentence, and restore reading order WITHIN this section, but do NOT summarize, shorten, paraphrase, reword, or change the meaning — keep the sentences as written.
4. Only mark a line as a heading (with #) if it is a genuine section heading. Do NOT turn stray words or interface labels into headings.

This is one section of a larger page; do not add an intro or conclusion, and do not describe what you removed. Output ONLY the cleaned content as Markdown — no preamble, no "Here is", no notes, no code fences.\n\nSection:\n${part}`;
        const summarizePromptFor = part =>
          `Summarize the main reading content in this SECTION of a page so it can be read aloud. Keep the key points and a logical structure (headings with #, short paragraphs). Ignore navigation and interface text (site names, menus, search, donate, log in, cookie notices, sidebars, adverts, headers, footers) AND reference apparatus (citation/reference lists, footnotes, bibliographies, "References", "Further reading", "External links", "See also"). This is one section of a larger page; do not add an intro or conclusion, and do not describe what you did. Output ONLY the Markdown — no preamble or commentary.\n\nSection:\n${part}`;

        // Chunk for "Read entire page": a full page can exceed what a local model handles inside the
        // 30s message timeout. Process model-sized pieces sequentially, sizing each from the last
        // piece's latency, then recombine. Small captures stay a single piece.
        const units = splitIntoUnits(original);
        const isLocal = modeInfo.isLocal;
        const perChunkTokens = isLocal ? 800 : 4000;
        const adaptOpts = isLocal
          ? { min: 600, max: 3000, targetMs: 20000 }
          : { min: 3000, max: 8000, targetMs: 20000 };
        let chunkChars = isLocal ? 1200 : 6000;

        const cleanedParts = [];
        let unitIndex = 0;
        let failedChunks = 0;
        while (unitIndex < units.length) {
          const { chunk, next } = takeChunk(units, unitIndex, chunkChars);
          unitIndex = next;
          const pct = Math.round((unitIndex / units.length) * 100);
          const verb = summarize ? 'Summarizing' : 'Cleaning up';
          status.textContent = units.length > 0 ? `${verb} with AI… ${pct}%` : `${verb} with AI…`;

          const startedAt = Date.now();
          try {
            const { text } = await generateWithAI(
              summarize ? summarizePromptFor(chunk) : proofreadPromptFor(chunk),
              modeInfo,
              { feature: 'ocr', maxTokens: perChunkTokens, temperature: summarize ? 0.4 : 0.1 }
            );
            const cleaned = stripAiCommentary((text || '').trim());
            cleanedParts.push(cleaned || chunk); // empty reply → keep the raw section
          } catch (chunkError) {
            failedChunks++;
            cleanedParts.push(chunk); // keep the raw section so no content is lost
            console.warn('[OCR] AI cleanup chunk failed, kept raw:', chunkError);
          }
          chunkChars = adaptChunkChars(Date.now() - startedAt, chunkChars, adaptOpts);
        }

        const combined = combineChunks(cleanedParts);
        if (!combined) {
          status.textContent = 'AI returned nothing — keeping the original text.';
          return;
        }
        if (preAiMarkdown === null) {
          preAiMarkdown = original; // stash the original scan so Undo always returns to it
        }
        editor.value = combined;
        showPreview();
        undoBtn.style.display = '';
        const action = summarize ? 'AI summary' : 'AI clean-up';
        const note =
          failedChunks > 0
            ? ` (${failedChunks} section${failedChunks > 1 ? 's' : ''} kept as-is)`
            : '';
        status.textContent = `${action} applied (${modeInfo.displayLabel || 'AI'})${note}. Review it; use Undo AI to revert.`;
      } catch (error) {
        status.textContent = `AI ${summarize ? 'summary' : 'clean-up'} failed: ${error.message || 'unknown error'}`;
      } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = previousLabel;
      }
    });
    attachAccessibleHandler(undoBtn, 'OCR Undo AI Proofread', () => {
      if (preAiMarkdown === null) {
        return;
      }
      editor.value = preAiMarkdown;
      preAiMarkdown = null;
      showPreview();
      undoBtn.style.display = 'none';
      status.textContent = 'Reverted to the original text.';
    });

    // AI vision (B3): re-read the captured IMAGE with a vision model for high-fidelity layout —
    // far better than text clean-up on busy pages, since it never sees the jumbled Tesseract output.
    attachAccessibleHandler(visionBtn, 'OCR AI Vision', async () => {
      const previousLabel = visionBtn.textContent;
      visionBtn.disabled = true;
      visionBtn.textContent = 'Reading image…';
      status.textContent = 'Re-reading the image with AI vision…';
      try {
        const markdown = (await ocr_visionLayout(imageDataUrl)).trim();
        if (!markdown) {
          status.textContent = 'AI vision returned nothing — keeping the original text.';
          return;
        }
        if (preAiMarkdown === null) {
          preAiMarkdown = editor.value; // stash so Undo returns to the Tesseract result
        }
        editor.value = markdown;
        showPreview();
        undoBtn.style.display = '';
        status.textContent =
          'AI vision result applied. Compare with the original; use Undo AI to revert.';
      } catch (error) {
        status.textContent = `AI vision failed: ${error.message || 'unknown error'}`;
      } finally {
        visionBtn.disabled = false;
        visionBtn.textContent = previousLabel;
      }
    });

    // Gate the AI affordances on the current AI mode (ADR: absent when AI off). Text clean-up works
    // on any AI provider; vision needs cloud (Claude) or local (Ollama).
    chrome.storage.local
      .get('aiMode')
      .then(({ aiMode }) => {
        const mode = aiMode || 'off';
        if (mode === 'off') {
          aiBtn.style.display = 'none';
          summarizeLabel.style.display = 'none';
        }
        if (mode === 'cloud' || mode === 'local') {
          visionBtn.style.display = '';
        }
      })
      .catch(() => {});

    // Backdrop click (only when the backdrop itself is clicked, not the modal contents).
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) {
        close();
      }
    });

    modal.append(header, toolbar, playerBar, body, status);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.addEventListener('keydown', onKeydown);
    releaseTrap = trapFocus(modal);
    closeBtn.focus();

    // Auto-play starts the same reading the play button does, and only when there is text to read.
    if (autoPlay) {
      const text = readingText();
      if (text) {
        startReading(text);
      }
    }
  });
}

/**
 * Shows OCR result modal with extracted text and media player controls
 *
 * @param {Object} result - OCR result object
 * @param {string} imageDataUrl - Original image data URL
 */
/**
 * Show a brief, accessible notification (replaces blocking alert() in OCR flows).
 * Uses an ARIA live region so screen readers announce it; auto-dismisses.
 * @param {string} message
 * @param {boolean} [assertive=false] - true for errors (role=alert), false for status
 */
function ocr_notify(message, assertive = false) {
  const el = document.createElement('div');
  el.setAttribute('role', assertive ? 'alert' : 'status');
  el.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  el.textContent = message;
  el.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: ${assertive ? '#7f1d1d' : '#1e293b'};
    color: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 90%;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: ${Z.TOAST};
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

/**
 * Plays a specific chunk with TTS
 * @param {number} chunkIndex - Index of chunk to play
 * @param {HTMLElement} playPauseBtn - Play/pause button element
 */
function ocr_playChunk(chunkIndex, playPauseBtn) {
  const text = ocrMediaPlayer.chunks[chunkIndex];
  console.log(`[OCR] Playing chunk ${chunkIndex + 1}/${ocrMediaPlayer.chunks.length}`);

  // The saved voice, pitch and volume, read fresh for each chunk; the rate is the player's own,
  // which starts at the saved rate and follows the player's speed control.
  createSavedUtterance(text).then(utterance => {
    utterance.rate = ocrMediaPlayer.rate;

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
  console.log('[OCR] Text saved');
}

// Old ocr_readAloud and ocr_stopAudio functions removed - replaced by media player system

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  // Ensure assistFeatures namespace exists
  window.assistFeatures = window.assistFeatures || {};

  // Initialize OCR feature
  ocr_init();
}

// Named exports for the unit suite. This is a self-initializing content-script module —
// nothing imports these bindings at runtime, so the bundler drops them.
export {
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
  ocr_prepareCanvas,
};
