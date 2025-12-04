/**
 * Stargardt Module - Eye Tracking Controller
 *
 * Manages WebGazer.js integration for real-time eye tracking.
 * Provides gaze position data to the content remapper for dynamic
 * scotoma position updates.
 *
 * Features:
 * - Lazy loading of WebGazer.js via webgazer-loader
 * - Calibration workflow with user guidance
 * - Smoothed gaze position output
 * - Integration with donut flow layout
 *
 * @module stargardt/eye-tracking-controller
 */

import * as webgazerLoader from './lib/webgazer-loader.js';
import { showToast } from '../../core/ui/toast.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let eyeTracking_enabled = false;
let eyeTracking_calibrated = false;
let eyeTracking_webgazer = null;
let eyeTracking_gazeCallback = null;
let eyeTracking_lastGaze = null;
let eyeTracking_smoothingBuffer = [];
let eyeTracking_settings = {};

// Smoothing configuration
const SMOOTHING_BUFFER_SIZE = 5;
const GAZE_UPDATE_THROTTLE_MS = 50; // 20 FPS for gaze updates
let lastGazeUpdateTime = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the eye tracking controller
 *
 * @param {Object} settings - Eye tracking settings
 * @param {Function} onGazeUpdate - Callback for gaze position updates
 */
export async function initialize(settings = {}, onGazeUpdate = null) {
  console.log('[EyeTracking] Initializing...');

  eyeTracking_settings = {
    smoothing: settings.smoothing ?? true,
    showVideo: settings.showVideo ?? false,
    showPrediction: settings.showPrediction ?? false,
    ...settings,
  };

  eyeTracking_gazeCallback = onGazeUpdate;

  console.log('[EyeTracking] Initialized with settings:', eyeTracking_settings);
}

/**
 * Enable eye tracking
 * Loads WebGazer and requests camera permission if needed
 *
 * @returns {Promise<boolean>} True if successfully enabled
 */
export async function enable() {
  if (eyeTracking_enabled) {
    console.log('[EyeTracking] Already enabled');
    return true;
  }

  console.log('[EyeTracking] Enabling...');

  try {
    // Check camera permission first
    const permission = await webgazerLoader.checkCameraPermission();
    console.log('[EyeTracking] Camera permission status:', permission);

    if (permission === 'denied') {
      showToast('Camera access denied. Please enable camera in browser settings.', 'error');
      return false;
    }

    if (permission === 'prompt') {
      // Show explanation modal
      const userAgreed = await webgazerLoader.showCameraExplanation();
      if (!userAgreed) {
        console.log('[EyeTracking] User cancelled camera permission');
        return false;
      }

      // Request permission
      const granted = await webgazerLoader.requestCameraPermission();
      if (!granted) {
        showToast('Camera access required for eye tracking', 'error');
        return false;
      }
    }

    // Load WebGazer
    showToast('Loading eye tracking library...', 'info');
    eyeTracking_webgazer = await webgazerLoader.loadWebGazer();

    if (!eyeTracking_webgazer) {
      throw new Error('Failed to load WebGazer');
    }

    // Configure WebGazer
    await configureWebGazer();

    // Start WebGazer
    await eyeTracking_webgazer
      .setRegression('ridge')
      .setTracker('TFFacemesh')
      .begin();

    eyeTracking_enabled = true;

    // Set up gaze listener
    eyeTracking_webgazer.setGazeListener(handleGazeData);

    // Hide video preview by default
    if (!eyeTracking_settings.showVideo) {
      hideVideoPreview();
    }

    // Hide prediction point by default
    if (!eyeTracking_settings.showPrediction) {
      hidePredictionPoint();
    }

    showToast('Eye tracking enabled. Calibration recommended for accuracy.', 'success');
    console.log('[EyeTracking] Enabled successfully');

    return true;
  } catch (error) {
    console.error('[EyeTracking] Failed to enable:', error);
    showToast('Failed to enable eye tracking: ' + error.message, 'error');
    return false;
  }
}

/**
 * Disable eye tracking
 */
export function disable() {
  if (!eyeTracking_enabled) return;

  console.log('[EyeTracking] Disabling...');

  try {
    if (eyeTracking_webgazer) {
      eyeTracking_webgazer.end();
    }

    webgazerLoader.cleanup();
  } catch (error) {
    console.warn('[EyeTracking] Cleanup warning:', error);
  }

  eyeTracking_enabled = false;
  eyeTracking_calibrated = false;
  eyeTracking_webgazer = null;
  eyeTracking_lastGaze = null;
  eyeTracking_smoothingBuffer = [];

  // Remove any UI elements
  removeCalibrationUI();

  console.log('[EyeTracking] Disabled');
}

// ============================================================================
// WEBGAZER CONFIGURATION
// ============================================================================

/**
 * Configure WebGazer settings
 */
async function configureWebGazer() {
  if (!eyeTracking_webgazer) return;

  // Store data locally (privacy-focused)
  eyeTracking_webgazer.saveDataAcrossSessions(true);

  // Use facemesh for better accuracy
  eyeTracking_webgazer.setTracker('TFFacemesh');

  // Use ridge regression (good balance of speed/accuracy)
  eyeTracking_webgazer.setRegression('ridge');
}

/**
 * Hide WebGazer video preview
 */
function hideVideoPreview() {
  const video = document.getElementById('webgazerVideoFeed');
  if (video) {
    video.style.display = 'none';
  }

  const videoContainer = document.getElementById('webgazerVideoContainer');
  if (videoContainer) {
    videoContainer.style.display = 'none';
  }

  const faceOverlay = document.getElementById('webgazerFaceOverlay');
  if (faceOverlay) {
    faceOverlay.style.display = 'none';
  }

  const faceFeedbackBox = document.getElementById('webgazerFaceFeedbackBox');
  if (faceFeedbackBox) {
    faceFeedbackBox.style.display = 'none';
  }
}

/**
 * Hide WebGazer prediction point
 */
function hidePredictionPoint() {
  const gazeDot = document.getElementById('webgazerGazeDot');
  if (gazeDot) {
    gazeDot.style.display = 'none';
  }
}

/**
 * Show WebGazer prediction point (for debugging)
 */
export function showPredictionPoint() {
  const gazeDot = document.getElementById('webgazerGazeDot');
  if (gazeDot) {
    gazeDot.style.display = 'block';
  }
}

// ============================================================================
// GAZE DATA HANDLING
// ============================================================================

/**
 * Handle incoming gaze data from WebGazer
 *
 * @param {Object} data - Gaze data from WebGazer
 * @param {number} elapsedTime - Time since tracking started
 */
function handleGazeData(data, elapsedTime) {
  if (!data) return;

  const now = Date.now();

  // Throttle updates
  if (now - lastGazeUpdateTime < GAZE_UPDATE_THROTTLE_MS) {
    return;
  }
  lastGazeUpdateTime = now;

  // Add to smoothing buffer
  if (eyeTracking_settings.smoothing) {
    eyeTracking_smoothingBuffer.push({ x: data.x, y: data.y });

    // Keep buffer size limited
    if (eyeTracking_smoothingBuffer.length > SMOOTHING_BUFFER_SIZE) {
      eyeTracking_smoothingBuffer.shift();
    }

    // Calculate smoothed position
    const smoothed = calculateSmoothedGaze();
    eyeTracking_lastGaze = smoothed;
  } else {
    eyeTracking_lastGaze = { x: data.x, y: data.y };
  }

  // Call the gaze callback if registered
  if (eyeTracking_gazeCallback) {
    eyeTracking_gazeCallback(eyeTracking_lastGaze);
  }
}

/**
 * Calculate smoothed gaze position from buffer
 *
 * @returns {Object} Smoothed {x, y} position
 */
function calculateSmoothedGaze() {
  if (eyeTracking_smoothingBuffer.length === 0) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  // Use weighted moving average (more recent = higher weight)
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;

  eyeTracking_smoothingBuffer.forEach((point, index) => {
    const weight = index + 1; // Higher weight for more recent points
    weightedX += point.x * weight;
    weightedY += point.y * weight;
    totalWeight += weight;
  });

  return {
    x: weightedX / totalWeight,
    y: weightedY / totalWeight,
  };
}

/**
 * Get the last recorded gaze position
 *
 * @returns {Object|null} Last gaze position {x, y} or null
 */
export function getLastGaze() {
  return eyeTracking_lastGaze;
}

// ============================================================================
// CALIBRATION
// ============================================================================

let calibrationOverlay = null;
let calibrationPoints = [];
let currentCalibrationPoint = 0;

/**
 * Start the calibration process
 *
 * @returns {Promise<boolean>} True if calibration completed successfully
 */
export async function startCalibration() {
  if (!eyeTracking_enabled) {
    console.warn('[EyeTracking] Cannot calibrate - eye tracking not enabled');
    return false;
  }

  console.log('[EyeTracking] Starting calibration...');

  // Define calibration points (9-point calibration)
  const padding = 50;
  const width = window.innerWidth;
  const height = window.innerHeight;

  calibrationPoints = [
    { x: padding, y: padding }, // Top-left
    { x: width / 2, y: padding }, // Top-center
    { x: width - padding, y: padding }, // Top-right
    { x: padding, y: height / 2 }, // Middle-left
    { x: width / 2, y: height / 2 }, // Center
    { x: width - padding, y: height / 2 }, // Middle-right
    { x: padding, y: height - padding }, // Bottom-left
    { x: width / 2, y: height - padding }, // Bottom-center
    { x: width - padding, y: height - padding }, // Bottom-right
  ];

  currentCalibrationPoint = 0;

  // Create calibration UI
  createCalibrationUI();

  // Show first point
  showCalibrationPoint(0);

  return new Promise(resolve => {
    // Store resolve function for when calibration completes
    calibrationOverlay.dataset.resolveCalibration = 'pending';
    calibrationOverlay._resolveCalibration = resolve;
  });
}

/**
 * Create calibration overlay UI
 */
function createCalibrationUI() {
  // Remove existing if present
  removeCalibrationUI();

  calibrationOverlay = document.createElement('div');
  calibrationOverlay.id = 'stargardt-calibration-overlay';
  calibrationOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Instructions
  const instructions = document.createElement('div');
  instructions.id = 'calibration-instructions';
  instructions.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 15px 25px;
    background: rgba(30, 30, 40, 0.95);
    color: #ffffff;
    border-radius: 10px;
    font-size: 16px;
    text-align: center;
    z-index: 10;
  `;
  instructions.innerHTML = `
    <strong>Eye Tracking Calibration</strong><br>
    <span style="color: #a0a0b0; font-size: 14px;">
      Click on each dot while looking at it. Point <span id="cal-current">1</span>/<span id="cal-total">${calibrationPoints.length}</span>
    </span>
  `;

  // Calibration point (the dot to click)
  const point = document.createElement('div');
  point.id = 'calibration-point';
  point.style.cssText = `
    position: fixed;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #6366f1;
    border: 3px solid #ffffff;
    cursor: pointer;
    transition: transform 0.3s ease, background 0.2s ease;
    z-index: 15;
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.5);
  `;

  point.addEventListener('click', handleCalibrationClick);
  point.addEventListener('mouseenter', () => {
    point.style.transform = 'translate(-50%, -50%) scale(1.2)';
    point.style.background = '#818cf8';
  });
  point.addEventListener('mouseleave', () => {
    point.style.transform = 'translate(-50%, -50%) scale(1)';
    point.style.background = '#6366f1';
  });

  // Skip button
  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip Calibration';
  skipBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 10px 20px;
    background: #404050;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    z-index: 10;
  `;
  skipBtn.onclick = () => {
    console.log('[EyeTracking] Calibration skipped');
    removeCalibrationUI();
    if (calibrationOverlay?._resolveCalibration) {
      calibrationOverlay._resolveCalibration(false);
    }
  };

  calibrationOverlay.appendChild(instructions);
  calibrationOverlay.appendChild(point);
  calibrationOverlay.appendChild(skipBtn);

  document.body.appendChild(calibrationOverlay);
}

/**
 * Show a calibration point at the specified index
 *
 * @param {number} index - Index of the calibration point
 */
function showCalibrationPoint(index) {
  const point = document.getElementById('calibration-point');
  const currentSpan = document.getElementById('cal-current');

  if (!point || !calibrationPoints[index]) return;

  const { x, y } = calibrationPoints[index];

  point.style.left = `${x}px`;
  point.style.top = `${y}px`;
  point.style.transform = 'translate(-50%, -50%) scale(1)';

  if (currentSpan) {
    currentSpan.textContent = index + 1;
  }
}

/**
 * Handle calibration point click
 *
 * @param {Event} e - Click event
 */
function handleCalibrationClick(e) {
  const point = e.target;
  const { x, y } = calibrationPoints[currentCalibrationPoint];

  // Record calibration data
  if (eyeTracking_webgazer) {
    eyeTracking_webgazer.recordScreenPosition(x, y);
  }

  // Visual feedback
  point.style.background = '#4ade80';
  point.style.transform = 'translate(-50%, -50%) scale(0.8)';

  currentCalibrationPoint++;

  if (currentCalibrationPoint < calibrationPoints.length) {
    // Show next point after brief delay
    setTimeout(() => {
      showCalibrationPoint(currentCalibrationPoint);
    }, 300);
  } else {
    // Calibration complete
    completeCalibration();
  }
}

/**
 * Complete the calibration process
 */
function completeCalibration() {
  console.log('[EyeTracking] Calibration complete');

  eyeTracking_calibrated = true;

  // Show completion message briefly
  const instructions = document.getElementById('calibration-instructions');
  if (instructions) {
    instructions.innerHTML = `
      <span style="color: #4ade80; font-size: 20px;">✓</span>
      <strong style="color: #4ade80;"> Calibration Complete!</strong>
    `;
  }

  const point = document.getElementById('calibration-point');
  if (point) {
    point.style.display = 'none';
  }

  // Remove overlay after delay
  setTimeout(() => {
    const resolveFunc = calibrationOverlay?._resolveCalibration;
    removeCalibrationUI();
    if (resolveFunc) {
      resolveFunc(true);
    }
    showToast('Eye tracking calibrated successfully', 'success');
  }, 1500);
}

/**
 * Remove calibration UI
 */
function removeCalibrationUI() {
  if (calibrationOverlay) {
    calibrationOverlay.remove();
    calibrationOverlay = null;
  }
}

// ============================================================================
// STATUS AND UTILITIES
// ============================================================================

/**
 * Check if eye tracking is enabled
 *
 * @returns {boolean} True if enabled
 */
export function isEnabled() {
  return eyeTracking_enabled;
}

/**
 * Check if eye tracking is calibrated
 *
 * @returns {boolean} True if calibrated
 */
export function isCalibrated() {
  return eyeTracking_calibrated;
}

/**
 * Get current status
 *
 * @returns {Object} Status object
 */
export function getStatus() {
  return {
    enabled: eyeTracking_enabled,
    calibrated: eyeTracking_calibrated,
    webgazerLoaded: webgazerLoader.isReady(),
    lastGaze: eyeTracking_lastGaze,
  };
}

/**
 * Update settings
 *
 * @param {Object} settings - New settings
 */
export function updateSettings(settings) {
  eyeTracking_settings = { ...eyeTracking_settings, ...settings };

  if (eyeTracking_enabled) {
    if (settings.showVideo !== undefined) {
      if (settings.showVideo) {
        const video = document.getElementById('webgazerVideoFeed');
        if (video) video.style.display = 'block';
      } else {
        hideVideoPreview();
      }
    }

    if (settings.showPrediction !== undefined) {
      if (settings.showPrediction) {
        showPredictionPoint();
      } else {
        hidePredictionPoint();
      }
    }
  }
}

/**
 * Set the callback for gaze updates
 *
 * @param {Function} callback - Function to call with gaze data
 */
export function setGazeCallback(callback) {
  eyeTracking_gazeCallback = callback;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initialize,
  enable,
  disable,
  startCalibration,
  getLastGaze,
  isEnabled,
  isCalibrated,
  getStatus,
  updateSettings,
  setGazeCallback,
  showPredictionPoint,
};
