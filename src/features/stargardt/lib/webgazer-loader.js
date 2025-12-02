/**
 * WebGazer.js Lazy Loader
 *
 * Provides lazy loading of WebGazer.js (~100KB) for eye tracking functionality.
 * Only loads the library when Advanced mode is activated to minimize initial bundle size.
 *
 * Based on the Tesseract.js lazy loading pattern from ocr.js
 *
 * @module stargardt/lib/webgazer-loader
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let webgazer_instance = null;
let webgazer_isInitialized = false;
let webgazer_isLoading = false;
let webgazer_loadingPromise = null;

// ============================================================================
// LAZY LOADING
// ============================================================================

// CDN URL for WebGazer.js - using jsDelivr for reliability
const WEBGAZER_CDN_URL = 'https://cdn.jsdelivr.net/npm/webgazer@3.0.1/dist/webgazer.min.js';

/**
 * Lazy loads WebGazer.js library from CDN via script tag
 * Only loads the library when eye tracking is first activated
 *
 * @returns {Promise<Object>} WebGazer.js library object
 * @throws {Error} If WebGazer.js fails to load
 */
export async function loadWebGazer() {
  // Return existing instance if already loaded
  if (webgazer_instance) {
    console.log('[WebGazer Loader] Returning cached instance');
    return webgazer_instance;
  }

  // Check if WebGazer is already available globally (loaded by another script)
  if (window.webgazer) {
    console.log('[WebGazer Loader] Found existing WebGazer instance');
    webgazer_instance = window.webgazer;
    webgazer_isInitialized = true;
    return webgazer_instance;
  }

  // Return existing promise if currently loading (prevent parallel loads)
  if (webgazer_isLoading && webgazer_loadingPromise) {
    console.log('[WebGazer Loader] Loading in progress, returning existing promise');
    return webgazer_loadingPromise;
  }

  // Start loading
  webgazer_isLoading = true;

  webgazer_loadingPromise = new Promise((resolve, reject) => {
    console.log('[WebGazer Loader] Lazy loading WebGazer.js from CDN...');

    // Create script element
    const script = document.createElement('script');
    script.src = WEBGAZER_CDN_URL;
    script.async = true;

    script.onload = () => {
      // WebGazer attaches itself to window.webgazer
      if (window.webgazer) {
        console.log('[WebGazer Loader] WebGazer.js loaded successfully from CDN');
        webgazer_instance = window.webgazer;
        webgazer_isInitialized = true;
        webgazer_isLoading = false;
        resolve(webgazer_instance);
      } else {
        webgazer_isLoading = false;
        webgazer_loadingPromise = null;
        reject(new Error('WebGazer loaded but not available on window'));
      }
    };

    script.onerror = error => {
      console.error('[WebGazer Loader] Failed to load WebGazer.js from CDN:', error);
      webgazer_isLoading = false;
      webgazer_loadingPromise = null;
      reject(new Error('Failed to load eye tracking library from CDN'));
    };

    // Append to document to start loading
    document.head.appendChild(script);
  });

  return webgazer_loadingPromise;
}

/**
 * Checks if WebGazer.js is currently loaded and ready
 *
 * @returns {boolean} True if WebGazer is loaded and ready
 */
export function isReady() {
  return webgazer_isInitialized && webgazer_instance !== null;
}

/**
 * Gets the current loading state
 *
 * @returns {Object} Loading state information
 */
export function getLoadingState() {
  return {
    isLoaded: webgazer_isInitialized,
    isLoading: webgazer_isLoading,
    hasInstance: webgazer_instance !== null,
  };
}

/**
 * Gets the loaded WebGazer instance (throws if not loaded)
 *
 * @returns {Object} WebGazer instance
 * @throws {Error} If WebGazer is not loaded
 */
export function getInstance() {
  if (!webgazer_instance) {
    throw new Error('WebGazer not loaded. Call loadWebGazer() first.');
  }
  return webgazer_instance;
}

/**
 * Cleanup function - terminates WebGazer and releases resources
 * Call this when disabling eye tracking or unloading the extension
 */
export function cleanup() {
  console.log('[WebGazer Loader] Cleaning up WebGazer resources');

  if (webgazer_instance) {
    try {
      // WebGazer cleanup methods
      if (typeof webgazer_instance.end === 'function') {
        webgazer_instance.end();
      }
      if (typeof webgazer_instance.pause === 'function') {
        webgazer_instance.pause();
      }
    } catch (error) {
      console.warn('[WebGazer Loader] Cleanup warning:', error);
    }
  }

  // Reset state
  webgazer_instance = null;
  webgazer_isInitialized = false;
  webgazer_isLoading = false;
  webgazer_loadingPromise = null;

  console.log('[WebGazer Loader] Cleanup complete');
}

// ============================================================================
// CAMERA PERMISSION HANDLING
// ============================================================================

/**
 * Checks if camera permission is granted
 *
 * @returns {Promise<string>} Permission state: 'granted', 'denied', or 'prompt'
 */
export async function checkCameraPermission() {
  try {
    // Use Permissions API if available
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({ name: 'camera' });
      return result.state;
    }

    // Fallback: Check if we can enumerate video devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    // If we get device labels, permission was likely granted before
    const hasLabels = videoDevices.some(d => d.label && d.label.length > 0);
    return hasLabels ? 'granted' : 'prompt';
  } catch (error) {
    console.error('[WebGazer Loader] Camera permission check failed:', error);
    return 'prompt';
  }
}

/**
 * Requests camera permission with user-friendly explanation
 *
 * @returns {Promise<boolean>} True if permission granted
 */
export async function requestCameraPermission() {
  try {
    console.log('[WebGazer Loader] Requesting camera permission...');

    // Request camera access
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
    });

    // Stop the stream immediately - we just wanted permission
    stream.getTracks().forEach(track => track.stop());

    console.log('[WebGazer Loader] Camera permission granted');
    return true;
  } catch (error) {
    console.error('[WebGazer Loader] Camera permission denied:', error);

    if (error.name === 'NotAllowedError') {
      console.log('[WebGazer Loader] User denied camera access');
    } else if (error.name === 'NotFoundError') {
      console.log('[WebGazer Loader] No camera device found');
    }

    return false;
  }
}

/**
 * Shows camera permission explanation modal
 *
 * @returns {Promise<boolean>} True if user agrees to proceed
 */
export function showCameraExplanation() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="
        background: #1a1a2e;
        border-radius: 16px;
        max-width: 500px;
        width: 90%;
        padding: 32px;
        color: #ffffff;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      ">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 64px;">📷</span>
        </div>
        <h2 style="margin: 0 0 16px 0; font-size: 24px; text-align: center;">
          Camera Access Required
        </h2>
        <p style="color: #a0a0b0; line-height: 1.6; margin-bottom: 16px;">
          Advanced Mode uses your webcam to track eye movements and provide
          scotoma-aware content remapping. This enables:
        </p>
        <ul style="color: #a0a0b0; line-height: 1.8; margin-bottom: 24px; padding-left: 20px;">
          <li>Automatic detection of your central blind spot</li>
          <li>Real-time content repositioning to your peripheral vision</li>
          <li>Accurate PRL (Preferred Retinal Locus) training</li>
        </ul>
        <div style="
          background: #252540;
          border-left: 4px solid #4ade80;
          padding: 12px 16px;
          border-radius: 0 8px 8px 0;
          margin-bottom: 24px;
        ">
          <p style="margin: 0; font-size: 14px; color: #d0d0e0;">
            <strong style="color: #4ade80;">Privacy:</strong>
            All eye tracking data is processed locally on your device.
            No video or gaze data is ever sent to external servers.
          </p>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="camera-cancel" style="
            padding: 12px 24px;
            background: #3a3a5a;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            cursor: pointer;
          ">Cancel</button>
          <button id="camera-proceed" style="
            padding: 12px 24px;
            background: #6366f1;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            cursor: pointer;
          ">Enable Camera</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#camera-cancel').onclick = () => {
      overlay.remove();
      resolve(false);
    };

    overlay.querySelector('#camera-proceed').onclick = () => {
      overlay.remove();
      resolve(true);
    };

    // ESC to cancel
    const handleEsc = e => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEsc);
        overlay.remove();
        resolve(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  loadWebGazer,
  isReady,
  getLoadingState,
  getInstance,
  cleanup,
  checkCameraPermission,
  requestCameraPermission,
  showCameraExplanation,
};
