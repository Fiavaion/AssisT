/**
 * Stargardt Module - Gaze Tracker
 *
 * WebGazer.js wrapper providing eye tracking with calibration,
 * continuous gaze monitoring, and accuracy assessment.
 *
 * @module stargardt/gaze-tracker
 */

import {
  loadWebGazer,
  isReady as webgazerIsReady,
  cleanup as webgazerCleanup,
  checkCameraPermission,
  requestCameraPermission,
  showCameraExplanation,
} from './lib/webgazer-loader.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let gazeTracker_webgazer = null;
let gazeTracker_isRunning = false;
let gazeTracker_isCalibrated = false;
let gazeTracker_gazeListeners = [];
let gazeTracker_lastGaze = null;
let gazeTracker_calibrationPoints = [];
let gazeTracker_accuracyHistory = [];

// Configuration
const GAZE_SMOOTHING_SAMPLES = 5;
const ACCURACY_THRESHOLD = 50; // pixels
const RECALIBRATION_PROMPT_THRESHOLD = 100; // pixels

// Gaze history for smoothing
let gazeHistory = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the gaze tracker
 * Loads WebGazer.js and sets up camera access
 *
 * @returns {Promise<boolean>} True if initialization successful
 */
export async function initialize() {
  console.log('[GazeTracker] Initializing...');

  try {
    // Check camera permission first
    const permissionState = await checkCameraPermission();
    console.log('[GazeTracker] Camera permission state:', permissionState);

    if (permissionState === 'denied') {
      throw new Error(
        'Camera access denied. Please enable camera permissions in browser settings.'
      );
    }

    if (permissionState === 'prompt') {
      // Show explanation and request permission
      const userAgreed = await showCameraExplanation();
      if (!userAgreed) {
        console.log('[GazeTracker] User declined camera access');
        return false;
      }

      const granted = await requestCameraPermission();
      if (!granted) {
        throw new Error('Camera permission not granted');
      }
    }

    // Load WebGazer
    gazeTracker_webgazer = await loadWebGazer();

    // Configure WebGazer
    configureWebGazer();

    console.log('[GazeTracker] Initialization complete');
    return true;
  } catch (error) {
    console.error('[GazeTracker] Initialization failed:', error);
    throw error;
  }
}

/**
 * Configure WebGazer settings
 */
function configureWebGazer() {
  if (!gazeTracker_webgazer) return;

  // Set the tracker algorithm (TFFacemesh is most accurate)
  gazeTracker_webgazer.setTracker('TFFacemesh');

  // Set regression algorithm
  gazeTracker_webgazer.setRegression('ridge');

  // Don't show video preview or face overlay by default
  gazeTracker_webgazer.showVideoPreview(false);
  gazeTracker_webgazer.showFaceOverlay(false);
  gazeTracker_webgazer.showFaceFeedbackBox(false);
  gazeTracker_webgazer.showPredictionPoints(false);

  // Save data to allow continuing calibration across sessions
  gazeTracker_webgazer.saveDataAcrossSessions(true);

  console.log('[GazeTracker] WebGazer configured');
}

// ============================================================================
// START / STOP
// ============================================================================

/**
 * Start gaze tracking
 *
 * @returns {Promise<void>}
 */
export async function start() {
  if (gazeTracker_isRunning) {
    console.log('[GazeTracker] Already running');
    return;
  }

  if (!gazeTracker_webgazer) {
    await initialize();
  }

  console.log('[GazeTracker] Starting gaze tracking...');

  try {
    // Begin WebGazer
    await gazeTracker_webgazer.begin();

    // Set up gaze listener
    gazeTracker_webgazer.setGazeListener((data, timestamp) => {
      if (data) {
        handleGazeData(data, timestamp);
      }
    });

    gazeTracker_isRunning = true;
    console.log('[GazeTracker] Gaze tracking started');
  } catch (error) {
    console.error('[GazeTracker] Failed to start:', error);
    throw error;
  }
}

/**
 * Stop gaze tracking
 */
export function stop() {
  if (!gazeTracker_isRunning) {
    return;
  }

  console.log('[GazeTracker] Stopping gaze tracking...');

  if (gazeTracker_webgazer) {
    gazeTracker_webgazer.pause();
  }

  gazeTracker_isRunning = false;
  gazeHistory = [];
  console.log('[GazeTracker] Gaze tracking stopped');
}

/**
 * Clean up all gaze tracker resources
 */
export function cleanup() {
  console.log('[GazeTracker] Cleaning up...');

  stop();

  if (gazeTracker_webgazer) {
    webgazerCleanup();
    gazeTracker_webgazer = null;
  }

  gazeTracker_isCalibrated = false;
  gazeTracker_gazeListeners = [];
  gazeTracker_lastGaze = null;
  gazeTracker_calibrationPoints = [];
  gazeTracker_accuracyHistory = [];
  gazeHistory = [];

  console.log('[GazeTracker] Cleanup complete');
}

// ============================================================================
// GAZE DATA HANDLING
// ============================================================================

/**
 * Handle incoming gaze data from WebGazer
 * Applies smoothing and notifies listeners
 *
 * @param {Object} data - Raw gaze data from WebGazer
 * @param {number} timestamp - Timestamp of the gaze reading
 */
function handleGazeData(data, timestamp) {
  // Add to history for smoothing
  gazeHistory.push({ x: data.x, y: data.y, timestamp });

  // Keep only recent samples
  if (gazeHistory.length > GAZE_SMOOTHING_SAMPLES) {
    gazeHistory.shift();
  }

  // Calculate smoothed gaze position
  const smoothedGaze = calculateSmoothedGaze();

  // Update last gaze
  gazeTracker_lastGaze = {
    x: smoothedGaze.x,
    y: smoothedGaze.y,
    rawX: data.x,
    rawY: data.y,
    timestamp,
    confidence: data.confidence || 1,
  };

  // Notify listeners
  notifyGazeListeners(gazeTracker_lastGaze);
}

/**
 * Calculate smoothed gaze position using moving average
 *
 * @returns {{x: number, y: number}}
 */
function calculateSmoothedGaze() {
  if (gazeHistory.length === 0) {
    return { x: 0, y: 0 };
  }

  // Simple moving average
  const sumX = gazeHistory.reduce((sum, g) => sum + g.x, 0);
  const sumY = gazeHistory.reduce((sum, g) => sum + g.y, 0);

  return {
    x: sumX / gazeHistory.length,
    y: sumY / gazeHistory.length,
  };
}

/**
 * Notify all registered gaze listeners
 *
 * @param {Object} gazeData - Processed gaze data
 */
function notifyGazeListeners(gazeData) {
  gazeTracker_gazeListeners.forEach(listener => {
    try {
      listener(gazeData);
    } catch (error) {
      console.error('[GazeTracker] Listener error:', error);
    }
  });
}

// ============================================================================
// GAZE LISTENER MANAGEMENT
// ============================================================================

/**
 * Register a gaze listener callback
 *
 * @param {Function} callback - Function to call with gaze data
 * @returns {Function} Unsubscribe function
 */
export function addGazeListener(callback) {
  gazeTracker_gazeListeners.push(callback);

  // Return unsubscribe function
  return () => {
    const index = gazeTracker_gazeListeners.indexOf(callback);
    if (index > -1) {
      gazeTracker_gazeListeners.splice(index, 1);
    }
  };
}

/**
 * Get the last recorded gaze position
 *
 * @returns {Object|null} Last gaze data or null
 */
export function getLastGaze() {
  return gazeTracker_lastGaze;
}

/**
 * Get current gaze position (promise-based)
 *
 * @returns {Promise<Object>} Current gaze position
 */
export function getCurrentGaze() {
  return new Promise(resolve => {
    if (gazeTracker_lastGaze) {
      resolve(gazeTracker_lastGaze);
      return;
    }

    // Wait for first gaze data
    const unsubscribe = addGazeListener(data => {
      unsubscribe();
      resolve(data);
    });

    // Timeout fallback
    setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 5000);
  });
}

// ============================================================================
// CALIBRATION
// ============================================================================

/**
 * Add a calibration point
 * Called when user clicks/focuses on a calibration target
 *
 * @param {number} x - Screen X coordinate
 * @param {number} y - Screen Y coordinate
 */
export function addCalibrationPoint(x, y) {
  if (!gazeTracker_webgazer) {
    console.warn('[GazeTracker] WebGazer not initialized');
    return;
  }

  // WebGazer's click-based calibration
  gazeTracker_webgazer.recordScreenPosition(x, y, 'click');

  gazeTracker_calibrationPoints.push({ x, y, timestamp: Date.now() });
  console.log(`[GazeTracker] Calibration point added: (${x}, ${y})`);
}

/**
 * Clear all calibration data
 */
export function clearCalibration() {
  if (gazeTracker_webgazer) {
    gazeTracker_webgazer.clearData();
  }

  gazeTracker_calibrationPoints = [];
  gazeTracker_isCalibrated = false;
  console.log('[GazeTracker] Calibration cleared');
}

/**
 * Mark calibration as complete
 */
export function completeCalibration() {
  if (gazeTracker_calibrationPoints.length < 5) {
    console.warn('[GazeTracker] Insufficient calibration points');
    return false;
  }

  gazeTracker_isCalibrated = true;
  console.log(
    `[GazeTracker] Calibration complete with ${gazeTracker_calibrationPoints.length} points`
  );
  return true;
}

/**
 * Check if gaze tracker is calibrated
 *
 * @returns {boolean}
 */
export function isCalibrated() {
  return gazeTracker_isCalibrated;
}

/**
 * Get calibration point count
 *
 * @returns {number}
 */
export function getCalibrationPointCount() {
  return gazeTracker_calibrationPoints.length;
}

// ============================================================================
// ACCURACY ASSESSMENT
// ============================================================================

/**
 * Test calibration accuracy at a specific point
 *
 * @param {number} targetX - Expected X position
 * @param {number} targetY - Expected Y position
 * @param {number} duration - Test duration in milliseconds
 * @returns {Promise<Object>} Accuracy results
 */
export async function testAccuracyAtPoint(targetX, targetY, duration = 2000) {
  return new Promise(resolve => {
    const gazeReadings = [];
    const startTime = Date.now();

    const unsubscribe = addGazeListener(gaze => {
      gazeReadings.push({
        x: gaze.x,
        y: gaze.y,
        timestamp: gaze.timestamp,
      });

      if (Date.now() - startTime >= duration) {
        unsubscribe();

        // Calculate accuracy metrics
        const accuracy = calculateAccuracyMetrics(
          gazeReadings,
          targetX,
          targetY
        );
        resolve(accuracy);
      }
    });

    // Timeout fallback
    setTimeout(() => {
      unsubscribe();
      if (gazeReadings.length > 0) {
        resolve(calculateAccuracyMetrics(gazeReadings, targetX, targetY));
      } else {
        resolve({ error: 'No gaze data collected' });
      }
    }, duration + 1000);
  });
}

/**
 * Calculate accuracy metrics from gaze readings
 *
 * @param {Array} readings - Gaze readings
 * @param {number} targetX - Target X position
 * @param {number} targetY - Target Y position
 * @returns {Object} Accuracy metrics
 */
function calculateAccuracyMetrics(readings, targetX, targetY) {
  if (readings.length === 0) {
    return { error: 'No readings', meanError: Infinity };
  }

  // Calculate errors
  const errors = readings.map(r => {
    const dx = r.x - targetX;
    const dy = r.y - targetY;
    return Math.sqrt(dx * dx + dy * dy);
  });

  // Calculate mean error
  const meanError = errors.reduce((sum, e) => sum + e, 0) / errors.length;

  // Calculate standard deviation
  const variance =
    errors.reduce((sum, e) => sum + Math.pow(e - meanError, 2), 0) /
    errors.length;
  const stdDev = Math.sqrt(variance);

  // Calculate mean position
  const meanX = readings.reduce((sum, r) => sum + r.x, 0) / readings.length;
  const meanY = readings.reduce((sum, r) => sum + r.y, 0) / readings.length;

  return {
    meanError: Math.round(meanError),
    stdDev: Math.round(stdDev),
    meanPosition: { x: Math.round(meanX), y: Math.round(meanY) },
    targetPosition: { x: targetX, y: targetY },
    sampleCount: readings.length,
    isAccurate: meanError < ACCURACY_THRESHOLD,
  };
}

/**
 * Get overall accuracy assessment
 *
 * @returns {Object} Overall accuracy state
 */
export function getAccuracyState() {
  if (gazeTracker_accuracyHistory.length === 0) {
    return { assessed: false };
  }

  const recentTests = gazeTracker_accuracyHistory.slice(-5);
  const avgError =
    recentTests.reduce((sum, t) => sum + (t.meanError || 0), 0) /
    recentTests.length;

  return {
    assessed: true,
    averageError: Math.round(avgError),
    isAccurate: avgError < ACCURACY_THRESHOLD,
    needsRecalibration: avgError > RECALIBRATION_PROMPT_THRESHOLD,
    testCount: gazeTracker_accuracyHistory.length,
  };
}

// ============================================================================
// DEBUG / VISUALIZATION
// ============================================================================

/**
 * Show gaze prediction point on screen (for debugging)
 *
 * @param {boolean} show - Whether to show the prediction point
 */
export function showPredictionPoint(show) {
  if (gazeTracker_webgazer) {
    gazeTracker_webgazer.showPredictionPoints(show);
  }
}

/**
 * Show video preview (for debugging)
 *
 * @param {boolean} show - Whether to show the video
 */
export function showVideoPreview(show) {
  if (gazeTracker_webgazer) {
    gazeTracker_webgazer.showVideoPreview(show);
  }
}

/**
 * Show face overlay (for debugging)
 *
 * @param {boolean} show - Whether to show the face mesh overlay
 */
export function showFaceOverlay(show) {
  if (gazeTracker_webgazer) {
    gazeTracker_webgazer.showFaceOverlay(show);
  }
}

// ============================================================================
// STATUS
// ============================================================================

/**
 * Get gaze tracker status
 *
 * @returns {Object} Status object
 */
export function getStatus() {
  return {
    isInitialized: gazeTracker_webgazer !== null,
    isRunning: gazeTracker_isRunning,
    isCalibrated: gazeTracker_isCalibrated,
    calibrationPoints: gazeTracker_calibrationPoints.length,
    hasGazeData: gazeTracker_lastGaze !== null,
    listenerCount: gazeTracker_gazeListeners.length,
    webgazerReady: webgazerIsReady(),
  };
}

/**
 * Check if gaze tracker is running
 *
 * @returns {boolean}
 */
export function isRunning() {
  return gazeTracker_isRunning;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  initialize,
  start,
  stop,
  cleanup,
  addGazeListener,
  getLastGaze,
  getCurrentGaze,
  addCalibrationPoint,
  clearCalibration,
  completeCalibration,
  isCalibrated,
  getCalibrationPointCount,
  testAccuracyAtPoint,
  getAccuracyState,
  showPredictionPoint,
  showVideoPreview,
  showFaceOverlay,
  getStatus,
  isRunning,
};
