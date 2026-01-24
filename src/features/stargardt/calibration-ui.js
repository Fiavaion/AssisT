/**
 * Stargardt Module - Calibration UI
 *
 * Full-screen 9-point calibration wizard for eye tracking with
 * accessible instructions, keyboard navigation, and scotoma mapping.
 *
 * @module stargardt/calibration-ui
 */

import { sanitizeHTML } from '../../utils/sanitize.js';
import * as gazeTracker from './gaze-tracker.js';
import * as scotomaProfile from './scotoma-profile.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CALIBRATION_STYLES = `
  .stargardt-calibration-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #0a0a1a;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .stargardt-calibration-header {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    color: #ffffff;
    z-index: 10;
  }

  .stargardt-calibration-header h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px 0;
  }

  .stargardt-calibration-header p {
    font-size: 16px;
    color: #a0a0b0;
    margin: 0;
  }

  .stargardt-calibration-progress {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    color: #ffffff;
  }

  .stargardt-progress-bar {
    width: 300px;
    height: 8px;
    background: #2a2a4a;
    border-radius: 4px;
    margin: 12px auto;
    overflow: hidden;
  }

  .stargardt-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #a855f7);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .stargardt-calibration-point {
    position: absolute;
    width: 60px;
    height: 60px;
    transform: translate(-50%, -50%);
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .stargardt-calibration-point-outer {
    width: 100%;
    height: 100%;
    border: 3px solid #6366f1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .stargardt-calibration-point-inner {
    width: 20px;
    height: 20px;
    background: #6366f1;
    border-radius: 50%;
    transition: all 0.2s ease;
  }

  .stargardt-calibration-point.active .stargardt-calibration-point-outer {
    border-color: #4ade80;
    animation: pulse 1s ease-in-out infinite;
  }

  .stargardt-calibration-point.active .stargardt-calibration-point-inner {
    background: #4ade80;
  }

  .stargardt-calibration-point.completed .stargardt-calibration-point-outer {
    border-color: #22c55e;
  }

  .stargardt-calibration-point.completed .stargardt-calibration-point-inner {
    background: #22c55e;
  }

  .stargardt-calibration-point:focus {
    outline: 3px solid #a855f7;
    outline-offset: 4px;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }

  .stargardt-calibration-instructions {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: #ffffff;
    max-width: 600px;
    padding: 32px;
    background: rgba(30, 30, 50, 0.95);
    border-radius: 16px;
    border: 1px solid #3a3a5a;
  }

  .stargardt-calibration-instructions h2 {
    font-size: 28px;
    margin: 0 0 16px 0;
  }

  .stargardt-calibration-instructions p {
    font-size: 16px;
    line-height: 1.6;
    color: #c0c0d0;
    margin: 0 0 24px 0;
  }

  .stargardt-calibration-btn {
    padding: 14px 32px;
    font-size: 16px;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin: 0 8px;
    transition: all 0.2s ease;
  }

  .stargardt-calibration-btn-primary {
    background: #6366f1;
    color: #ffffff;
  }

  .stargardt-calibration-btn-primary:hover {
    background: #5558e3;
  }

  .stargardt-calibration-btn-secondary {
    background: #3a3a5a;
    color: #ffffff;
  }

  .stargardt-calibration-btn-secondary:hover {
    background: #4a4a6a;
  }

  .stargardt-calibration-btn:focus {
    outline: 3px solid #a855f7;
    outline-offset: 2px;
  }

  /* Scotoma mapping */
  .stargardt-scotoma-test {
    position: absolute;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stargardt-scotoma-stimulus {
    width: 30px;
    height: 30px;
    background: #ffffff;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .stargardt-scotoma-stimulus.visible {
    opacity: 1;
  }

  .stargardt-scotoma-fixation {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 16px;
    height: 16px;
    border: 2px solid #ff6b6b;
    border-radius: 50%;
  }

  .stargardt-scotoma-fixation::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 4px;
    background: #ff6b6b;
    border-radius: 50%;
  }

  /* Accessibility - reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .stargardt-calibration-point.active .stargardt-calibration-point-outer {
      animation: none;
    }
    .stargardt-progress-fill {
      transition: none;
    }
  }
`;

// 9-point calibration grid positions (percentage of screen)
const CALIBRATION_POSITIONS = [
  { id: 1, x: 10, y: 10, label: 'Top left' },
  { id: 2, x: 50, y: 10, label: 'Top center' },
  { id: 3, x: 90, y: 10, label: 'Top right' },
  { id: 4, x: 10, y: 50, label: 'Middle left' },
  { id: 5, x: 50, y: 50, label: 'Center' },
  { id: 6, x: 90, y: 50, label: 'Middle right' },
  { id: 7, x: 10, y: 90, label: 'Bottom left' },
  { id: 8, x: 50, y: 90, label: 'Bottom center' },
  { id: 9, x: 90, y: 90, label: 'Bottom right' },
];

// ============================================================================
// STATE
// ============================================================================

let calibrationOverlay = null;
let currentPhase = 'intro'; // 'intro', 'eyeTracking', 'scotoma', 'complete'
let currentPointIndex = 0;
let completedPoints = [];
let resolveCalibration = null;
let scotomaTestResults = [];

// ============================================================================
// MAIN CALIBRATION WIZARD
// ============================================================================

/**
 * Run the full calibration wizard
 *
 * @param {Object} gazeTrackerInstance - Optional gaze tracker instance
 * @returns {Promise<{success: boolean, profile: Object|null, skipped: boolean}>}
 */
export function runCalibrationWizard(_gazeTrackerInstance) {
  return new Promise(resolve => {
    resolveCalibration = resolve;

    // Inject styles
    injectStyles();

    // Create overlay
    calibrationOverlay = document.createElement('div');
    calibrationOverlay.className = 'stargardt-calibration-overlay';
    calibrationOverlay.setAttribute('role', 'dialog');
    calibrationOverlay.setAttribute('aria-modal', 'true');
    calibrationOverlay.setAttribute('aria-label', 'Eye tracking calibration wizard');
    document.body.appendChild(calibrationOverlay);

    // Start with introduction
    showIntroPhase();

    // Set up keyboard handling
    document.addEventListener('keydown', handleKeyDown);
  });
}

/**
 * Inject calibration styles
 */
function injectStyles() {
  if (document.getElementById('stargardt-calibration-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'stargardt-calibration-styles';
  style.textContent = CALIBRATION_STYLES;
  document.head.appendChild(style);
}

/**
 * Handle keyboard navigation
 */
function handleKeyDown(e) {
  if (e.key === 'Escape') {
    // Allow skip during calibration
    if (currentPhase === 'eyeTracking' || currentPhase === 'scotoma') {
      if (confirm('Skip calibration and use default settings?')) {
        closeCalibration({ success: false, profile: null, skipped: true });
      }
    } else {
      closeCalibration({ success: false, profile: null, skipped: true });
    }
  }

  if (e.key === ' ' || e.key === 'Enter') {
    if (currentPhase === 'eyeTracking') {
      // Click current calibration point
      handleCalibrationPointClick(currentPointIndex);
    }
  }

  // Arrow key navigation for calibration points
  if (currentPhase === 'eyeTracking') {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      navigateToPoint((currentPointIndex + 1) % 9);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigateToPoint((currentPointIndex - 1 + 9) % 9);
    }
  }
}

/**
 * Navigate to a specific calibration point
 */
function navigateToPoint(index) {
  currentPointIndex = index;
  updatePointHighlight();
  announceToScreenReader(
    `Calibration point ${index + 1} of 9: ${CALIBRATION_POSITIONS[index].label}`
  );
}

// ============================================================================
// PHASE: INTRODUCTION
// ============================================================================

/**
 * Show introduction phase
 */
function showIntroPhase() {
  currentPhase = 'intro';

  calibrationOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-calibration-instructions">
      <h2>Eye Tracking Calibration</h2>
      <p>
        This calibration will help us understand your gaze patterns and detect
        your central vision area. You'll be asked to look at 9 points on the screen.
      </p>
      <p style="font-size: 14px; color: #a0a0b0;">
        <strong>Instructions:</strong><br>
        • Look directly at each glowing point<br>
        • Click the point (or press Enter/Space) while looking at it<br>
        • Keep your head relatively still<br>
        • The process takes about 2-3 minutes
      </p>
      <div style="margin-top: 24px;">
        <button class="stargardt-calibration-btn stargardt-calibration-btn-secondary" id="cal-skip">
          Skip & Use Defaults
        </button>
        <button class="stargardt-calibration-btn stargardt-calibration-btn-primary" id="cal-start">
          Begin Calibration
        </button>
      </div>
    </div>
  `);

  // Bind buttons
  document.getElementById('cal-skip').onclick = () => {
    closeCalibration({ success: false, profile: null, skipped: true });
  };

  document.getElementById('cal-start').onclick = () => {
    startEyeTrackingCalibration();
  };

  // Focus the start button
  document.getElementById('cal-start').focus();
}

// ============================================================================
// PHASE: EYE TRACKING CALIBRATION
// ============================================================================

/**
 * Start the eye tracking calibration phase
 */
async function startEyeTrackingCalibration() {
  currentPhase = 'eyeTracking';
  currentPointIndex = 0;
  completedPoints = [];

  // Clear any existing calibration
  gazeTracker.clearCalibration();

  // Render calibration UI
  renderCalibrationUI();

  // Start gaze tracking if not already running
  if (!gazeTracker.isRunning()) {
    try {
      await gazeTracker.start();
    } catch (error) {
      console.error('[Calibration] Failed to start gaze tracker:', error);
      showError('Failed to start eye tracking. Please check camera permissions.');
      return;
    }
  }

  // Highlight first point
  updatePointHighlight();
  announceToScreenReader('Calibration started. Look at the glowing point and click it.');
}

/**
 * Render the calibration point grid
 */
function renderCalibrationUI() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  calibrationOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-calibration-header">
      <h1>Look at Each Point</h1>
      <p>Click or press Enter while looking at the glowing point</p>
    </div>

    <div class="stargardt-calibration-progress">
      <span id="cal-progress-text">Point 1 of 9</span>
      <div class="stargardt-progress-bar">
        <div class="stargardt-progress-fill" id="cal-progress-bar" style="width: 0%"></div>
      </div>
      <button class="stargardt-calibration-btn stargardt-calibration-btn-secondary" id="cal-skip-btn" style="margin-top: 16px; padding: 8px 16px; font-size: 13px;">
        Skip Calibration
      </button>
    </div>

    ${CALIBRATION_POSITIONS.map(
      (pos, i) => `
      <div
        class="stargardt-calibration-point ${i === 0 ? 'active' : ''}"
        id="cal-point-${i}"
        data-index="${i}"
        tabindex="0"
        role="button"
        aria-label="${pos.label}, calibration point ${i + 1} of 9"
        style="left: ${(pos.x / 100) * w}px; top: ${(pos.y / 100) * h}px;"
      >
        <div class="stargardt-calibration-point-outer">
          <div class="stargardt-calibration-point-inner"></div>
        </div>
      </div>
    `
    ).join('')}
  `);

  // Bind point click events
  CALIBRATION_POSITIONS.forEach((_, i) => {
    const point = document.getElementById(`cal-point-${i}`);
    point.onclick = () => handleCalibrationPointClick(i);
    point.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCalibrationPointClick(i);
      }
    };
  });

  // Skip button
  document.getElementById('cal-skip-btn').onclick = () => {
    closeCalibration({ success: false, profile: null, skipped: true });
  };
}

/**
 * Handle click on a calibration point
 */
function handleCalibrationPointClick(index) {
  if (completedPoints.includes(index)) {
    return; // Already completed
  }

  const pos = CALIBRATION_POSITIONS[index];
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Calculate actual screen coordinates
  const screenX = (pos.x / 100) * w;
  const screenY = (pos.y / 100) * h;

  // Add calibration point to gaze tracker
  gazeTracker.addCalibrationPoint(screenX, screenY);

  // Mark as completed
  completedPoints.push(index);
  const point = document.getElementById(`cal-point-${index}`);
  point.classList.remove('active');
  point.classList.add('completed');

  // Play feedback sound
  playFeedbackSound('success');

  // Update progress
  updateProgress();

  // Move to next point or complete
  if (completedPoints.length === 9) {
    // Calibration complete
    completeEyeTrackingCalibration();
  } else {
    // Find next uncompleted point
    const nextIndex = CALIBRATION_POSITIONS.findIndex((_, i) => !completedPoints.includes(i));
    currentPointIndex = nextIndex;
    updatePointHighlight();
    announceToScreenReader(
      `Point ${completedPoints.length + 1} of 9: ${CALIBRATION_POSITIONS[nextIndex].label}`
    );
  }
}

/**
 * Update which point is highlighted
 */
function updatePointHighlight() {
  CALIBRATION_POSITIONS.forEach((_, i) => {
    const point = document.getElementById(`cal-point-${i}`);
    if (!point) {
      return;
    }

    if (i === currentPointIndex && !completedPoints.includes(i)) {
      point.classList.add('active');
      point.focus();
    } else {
      point.classList.remove('active');
    }
  });
}

/**
 * Update progress display
 */
function updateProgress() {
  const progressText = document.getElementById('cal-progress-text');
  const progressBar = document.getElementById('cal-progress-bar');

  if (progressText) {
    progressText.textContent = `Point ${completedPoints.length} of 9`;
  }
  if (progressBar) {
    progressBar.style.width = `${(completedPoints.length / 9) * 100}%`;
  }
}

/**
 * Complete the eye tracking calibration phase
 */
function completeEyeTrackingCalibration() {
  gazeTracker.completeCalibration();
  playFeedbackSound('complete');

  // Move to scotoma mapping
  setTimeout(() => {
    startScotomaMapping();
  }, 1000);
}

// ============================================================================
// PHASE: SCOTOMA MAPPING
// ============================================================================

/**
 * Start scotoma boundary mapping
 */
function startScotomaMapping() {
  currentPhase = 'scotoma';
  scotomaTestResults = [];

  calibrationOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-calibration-instructions">
      <h2>Scotoma Mapping</h2>
      <p>
        Now we'll map your central vision area. Keep your eyes on the
        <span style="color: #ff6b6b;">red fixation point</span> in the center.
        Press <strong>Y</strong> when you can see the white dot, or <strong>N</strong> if you cannot.
      </p>
      <div style="margin-top: 24px;">
        <button class="stargardt-calibration-btn stargardt-calibration-btn-secondary" id="scotoma-skip">
          Skip & Estimate
        </button>
        <button class="stargardt-calibration-btn stargardt-calibration-btn-primary" id="scotoma-start">
          Begin Mapping
        </button>
      </div>
    </div>
  `);

  document.getElementById('scotoma-skip').onclick = () => {
    // Use estimated defaults
    completeScotomaMapping(true);
  };

  document.getElementById('scotoma-start').onclick = () => {
    runScotomaTest();
  };

  document.getElementById('scotoma-start').focus();
}

/**
 * Run the scotoma boundary test
 */
async function runScotomaTest() {
  const testPositions = generateTestPositions();
  let testIndex = 0;

  calibrationOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-scotoma-test">
      <div class="stargardt-scotoma-fixation" aria-label="Fixation point - keep looking here"></div>
      <div class="stargardt-scotoma-stimulus" id="scotoma-stimulus"></div>
    </div>
    <div class="stargardt-calibration-progress">
      <span id="scotoma-progress">Testing position 1 of ${testPositions.length}</span>
      <div class="stargardt-progress-bar">
        <div class="stargardt-progress-fill" id="scotoma-progress-bar" style="width: 0%"></div>
      </div>
      <p style="color: #a0a0b0; font-size: 14px; margin-top: 12px;">
        Press <strong>Y</strong> if you see the white dot, <strong>N</strong> if not
      </p>
    </div>
  `);

  const stimulus = document.getElementById('scotoma-stimulus');

  // Test each position
  const runNextTest = () => {
    if (testIndex >= testPositions.length) {
      completeScotomaMapping(false);
      return;
    }

    const pos = testPositions[testIndex];

    // Update progress
    document.getElementById('scotoma-progress').textContent =
      `Testing position ${testIndex + 1} of ${testPositions.length}`;
    document.getElementById('scotoma-progress-bar').style.width =
      `${((testIndex + 1) / testPositions.length) * 100}%`;

    // Position stimulus relative to center
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    stimulus.style.left = `${centerX + pos.x}px`;
    stimulus.style.top = `${centerY + pos.y}px`;
    stimulus.style.position = 'absolute';
    stimulus.style.transform = 'translate(-50%, -50%)';

    // Show stimulus briefly
    setTimeout(() => {
      stimulus.classList.add('visible');
    }, 500);

    // Wait for response
    const handleResponse = e => {
      if (e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'n') {
        stimulus.classList.remove('visible');
        document.removeEventListener('keydown', handleResponse);

        scotomaTestResults.push({
          position: pos,
          visible: e.key.toLowerCase() === 'y',
        });

        testIndex++;
        setTimeout(runNextTest, 300);
      }
    };

    document.addEventListener('keydown', handleResponse);
  };

  // Start testing
  runNextTest();
}

/**
 * Generate test positions for scotoma mapping
 * Returns positions relative to center in pixels
 */
function generateTestPositions() {
  const positions = [];
  const distances = [50, 100, 150, 200, 250]; // pixels from center
  const angles = [0, 45, 90, 135, 180, 225, 270, 315]; // degrees

  distances.forEach(dist => {
    angles.forEach(angle => {
      const radians = (angle * Math.PI) / 180;
      positions.push({
        x: Math.round(Math.cos(radians) * dist),
        y: Math.round(Math.sin(radians) * dist),
        distance: dist,
        angle,
      });
    });
  });

  // Shuffle for randomization
  return positions.sort(() => Math.random() - 0.5);
}

/**
 * Complete scotoma mapping and generate profile
 */
function completeScotomaMapping(useDefaults) {
  let profile;

  if (useDefaults) {
    // Create default profile
    profile = scotomaProfile.createDefault();
  } else {
    // Analyze test results to determine scotoma boundary
    profile = analyzeScotomaResults(scotomaTestResults);
  }

  // Show completion
  showCompletionPhase(profile);
}

/**
 * Analyze scotoma test results to create profile
 */
function analyzeScotomaResults(results) {
  // Find the boundary where visibility changes
  const invisiblePositions = results.filter(r => !r.visible);
  // const _visiblePositions = results.filter(r => r.visible); // Reserved for future use

  // Calculate approximate scotoma center and size
  let centerX = 50;
  let centerY = 50;
  let radiusX = 8;
  let radiusY = 8;

  if (invisiblePositions.length > 0) {
    // Average position of invisible stimuli (relative to screen center)
    const avgInvisX =
      invisiblePositions.reduce((sum, p) => sum + p.position.x, 0) / invisiblePositions.length;
    const avgInvisY =
      invisiblePositions.reduce((sum, p) => sum + p.position.y, 0) / invisiblePositions.length;

    // Convert to percentage of viewport
    centerX = 50 + (avgInvisX / window.innerWidth) * 100;
    centerY = 50 + (avgInvisY / window.innerHeight) * 100;

    // Estimate radius based on furthest invisible point
    const maxDist = Math.max(...invisiblePositions.map(p => p.position.distance));
    radiusX = (maxDist / window.innerWidth) * 100;
    radiusY = (maxDist / window.innerHeight) * 100;
  }

  // Create profile from calibration
  return scotomaProfile.createFromCalibration({
    shape: 'ellipse',
    centerX,
    centerY,
    radiusX: Math.max(radiusX, 5),
    radiusY: Math.max(radiusY, 5),
    confidence: Math.round((results.length / 40) * 100), // Based on number of tests
  });
}

// ============================================================================
// PHASE: COMPLETION
// ============================================================================

/**
 * Show completion phase
 */
function showCompletionPhase(profile) {
  currentPhase = 'complete';

  calibrationOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-calibration-instructions">
      <div style="font-size: 64px; margin-bottom: 16px;">✅</div>
      <h2>Calibration Complete!</h2>
      <p>
        Your eye tracking and scotoma profile have been saved.
        The extension will now adapt content to your peripheral vision.
      </p>
      <div style="
        background: #252540;
        padding: 16px;
        border-radius: 8px;
        margin: 20px 0;
        text-align: left;
      ">
        <p style="margin: 0 0 8px 0; font-size: 14px;">
          <strong>Profile Summary:</strong>
        </p>
        <ul style="margin: 0; padding-left: 20px; color: #a0a0b0; font-size: 13px;">
          <li>Scotoma position: ${Math.round(profile.boundary.centerX)}%, ${Math.round(profile.boundary.centerY)}%</li>
          <li>Estimated size: ${Math.round(profile.boundary.radiusX * 2)}% × ${Math.round(profile.boundary.radiusY * 2)}%</li>
          <li>Confidence: ${profile.metadata.confidenceScore || 'N/A'}%</li>
        </ul>
      </div>
      <button class="stargardt-calibration-btn stargardt-calibration-btn-primary" id="cal-finish">
        Finish Setup
      </button>
    </div>
  `);

  playFeedbackSound('complete');

  document.getElementById('cal-finish').onclick = () => {
    closeCalibration({ success: true, profile, skipped: false });
  };

  document.getElementById('cal-finish').focus();
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Close calibration and clean up
 */
function closeCalibration(result) {
  document.removeEventListener('keydown', handleKeyDown);

  if (calibrationOverlay) {
    calibrationOverlay.remove();
    calibrationOverlay = null;
  }

  if (resolveCalibration) {
    resolveCalibration(result);
    resolveCalibration = null;
  }
}

/**
 * Show error message
 */
function showError(message) {
  calibrationOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-calibration-instructions">
      <div style="font-size: 64px; margin-bottom: 16px;">⚠️</div>
      <h2>Calibration Error</h2>
      <p>${message}</p>
      <button class="stargardt-calibration-btn stargardt-calibration-btn-primary" id="cal-close">
        Close
      </button>
    </div>
  `);

  document.getElementById('cal-close').onclick = () => {
    closeCalibration({ success: false, profile: null, skipped: false });
  };
}

/**
 * Play feedback sound
 */
function playFeedbackSound(type) {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    if (type === 'success') {
      oscillator.frequency.value = 880; // A5
      gainNode.gain.value = 0.1;
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
    } else if (type === 'complete') {
      oscillator.frequency.value = 523; // C5
      gainNode.gain.value = 0.1;
      oscillator.start();

      setTimeout(() => {
        oscillator.frequency.value = 659; // E5
      }, 100);

      setTimeout(() => {
        oscillator.frequency.value = 784; // G5
      }, 200);

      oscillator.stop(context.currentTime + 0.3);
    }
  } catch {
    // Audio not supported
  }
}

/**
 * Announce message to screen readers
 */
function announceToScreenReader(message) {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.style.cssText =
    'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
  announcement.textContent = message;

  document.body.appendChild(announcement);
  setTimeout(() => announcement.remove(), 1000);
}

// ============================================================================
// MICRO-CALIBRATION (Quick weekly check)
// ============================================================================

// 3-point quick check positions (center + diagonal corners)
const MICRO_CHECK_POSITIONS = [
  { id: 1, x: 50, y: 50, label: 'Center' },
  { id: 2, x: 20, y: 20, label: 'Top left region' },
  { id: 3, x: 80, y: 80, label: 'Bottom right region' },
];

let microCheckOverlay = null;
let resolveMicroCheck = null;

/**
 * Run a quick micro-calibration check
 * Tests 3 key positions to detect if significant drift has occurred
 *
 * @returns {Promise<{completed: boolean, results: Object[], driftDetected: boolean}>}
 */
export function runMicroCheck() {
  return new Promise(resolve => {
    resolveMicroCheck = resolve;

    // Inject styles if not present
    injectStyles();

    // Create overlay
    microCheckOverlay = document.createElement('div');
    microCheckOverlay.className = 'stargardt-calibration-overlay';
    microCheckOverlay.setAttribute('role', 'dialog');
    microCheckOverlay.setAttribute('aria-modal', 'true');
    microCheckOverlay.setAttribute('aria-label', 'Quick vision check');
    document.body.appendChild(microCheckOverlay);

    // Show intro
    showMicroCheckIntro();
  });
}

/**
 * Show micro-check introduction
 */
function showMicroCheckIntro() {
  microCheckOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-calibration-instructions">
      <h2>Weekly Vision Check</h2>
      <p>
        This quick check takes about 30 seconds. We'll test 3 positions
        to ensure your settings are still optimal.
      </p>
      <p style="font-size: 14px; color: #a0a0b0;">
        Keep your eyes on the <span style="color: #ff6b6b;">red fixation point</span>
        and press <strong>Y</strong> when you see the white dot, <strong>N</strong> if you cannot.
      </p>
      <div style="margin-top: 24px;">
        <button class="stargardt-calibration-btn stargardt-calibration-btn-secondary" id="micro-skip">
          Skip This Time
        </button>
        <button class="stargardt-calibration-btn stargardt-calibration-btn-primary" id="micro-start">
          Start Check
        </button>
      </div>
    </div>
  `);

  document.getElementById('micro-skip').onclick = () => {
    closeMicroCheck({ completed: false, results: [], driftDetected: false, skipped: true });
  };

  document.getElementById('micro-start').onclick = () => {
    runMicroCheckTest();
  };

  document.getElementById('micro-start').focus();
}

/**
 * Run the micro-check test sequence
 */
async function runMicroCheckTest() {
  const results = [];
  const testPositions = [];

  // Generate 3 test positions per check location
  MICRO_CHECK_POSITIONS.forEach(pos => {
    const centerX = (pos.x / 100) * window.innerWidth;
    const centerY = (pos.y / 100) * window.innerHeight;

    // Test at varying distances from this position
    [50, 100, 150].forEach(dist => {
      const angle = Math.random() * 2 * Math.PI;
      testPositions.push({
        basePosition: pos,
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        distance: dist,
      });
    });
  });

  microCheckOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-scotoma-test">
      <div class="stargardt-scotoma-fixation" aria-label="Fixation point"></div>
      <div class="stargardt-scotoma-stimulus" id="micro-stimulus"></div>
    </div>
    <div class="stargardt-calibration-progress">
      <span id="micro-progress">Testing 1 of ${testPositions.length}</span>
      <div class="stargardt-progress-bar">
        <div class="stargardt-progress-fill" id="micro-progress-bar" style="width: 0%"></div>
      </div>
      <p style="color: #a0a0b0; font-size: 14px; margin-top: 12px;">
        Press <strong>Y</strong> if visible, <strong>N</strong> if not
      </p>
    </div>
  `);

  const stimulus = document.getElementById('micro-stimulus');
  let testIndex = 0;

  const runNextTest = () => {
    if (testIndex >= testPositions.length) {
      completeMicroCheck(results);
      return;
    }

    const pos = testPositions[testIndex];

    // Update progress
    document.getElementById('micro-progress').textContent =
      `Testing ${testIndex + 1} of ${testPositions.length}`;
    document.getElementById('micro-progress-bar').style.width =
      `${((testIndex + 1) / testPositions.length) * 100}%`;

    // Position stimulus
    stimulus.style.left = `${pos.x}px`;
    stimulus.style.top = `${pos.y}px`;
    stimulus.style.position = 'absolute';
    stimulus.style.transform = 'translate(-50%, -50%)';

    // Show stimulus briefly
    setTimeout(() => {
      stimulus.classList.add('visible');
    }, 300);

    // Wait for response
    const handleResponse = e => {
      if (e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'n') {
        stimulus.classList.remove('visible');
        document.removeEventListener('keydown', handleResponse);

        results.push({
          position: pos,
          visible: e.key.toLowerCase() === 'y',
          timestamp: Date.now(),
        });

        testIndex++;
        setTimeout(runNextTest, 200);
      }
    };

    document.addEventListener('keydown', handleResponse);
  };

  runNextTest();
}

/**
 * Complete micro-check and analyze results
 */
function completeMicroCheck(results) {
  // Analyze for drift
  const invisibleCount = results.filter(r => !r.visible).length;
  const driftDetected = invisibleCount > results.length * 0.5; // >50% invisible suggests change

  const driftDetails = {
    totalTests: results.length,
    invisibleCount,
    percentInvisible: Math.round((invisibleCount / results.length) * 100),
  };

  // Show result
  microCheckOverlay.innerHTML = sanitizeHTML(`
    <div class="stargardt-calibration-instructions">
      <div style="font-size: 64px; margin-bottom: 16px;">${driftDetected ? '⚠️' : '✅'}</div>
      <h2>${driftDetected ? 'Change Detected' : 'Check Complete'}</h2>
      <p>
        ${
          driftDetected
            ? 'Your vision may have changed since your last full calibration. We recommend running a full assessment.'
            : 'Your current settings appear to be working well. No adjustments needed.'
        }
      </p>
      <div style="margin-top: 24px;">
        ${
          driftDetected
            ? `
          <button class="stargardt-calibration-btn stargardt-calibration-btn-secondary" id="micro-later">
            Remind Me Later
          </button>
          <button class="stargardt-calibration-btn stargardt-calibration-btn-primary" id="micro-recalibrate">
            Run Full Calibration
          </button>
        `
            : `
          <button class="stargardt-calibration-btn stargardt-calibration-btn-primary" id="micro-done">
            Done
          </button>
        `
        }
      </div>
    </div>
  `);

  playFeedbackSound(driftDetected ? 'success' : 'complete');

  if (driftDetected) {
    document.getElementById('micro-later').onclick = () => {
      closeMicroCheck({
        completed: true,
        results,
        driftDetected,
        driftDetails,
        requestRecalibration: false,
      });
    };
    document.getElementById('micro-recalibrate').onclick = () => {
      closeMicroCheck({
        completed: true,
        results,
        driftDetected,
        driftDetails,
        requestRecalibration: true,
      });
    };
  } else {
    document.getElementById('micro-done').onclick = () => {
      closeMicroCheck({
        completed: true,
        results,
        driftDetected,
        driftDetails,
        requestRecalibration: false,
      });
    };
    document.getElementById('micro-done').focus();
  }
}

/**
 * Close micro-check and clean up
 */
function closeMicroCheck(result) {
  if (microCheckOverlay) {
    microCheckOverlay.remove();
    microCheckOverlay = null;
  }

  if (resolveMicroCheck) {
    resolveMicroCheck(result);
    resolveMicroCheck = null;
  }
}

// ============================================================================
// REASSESSMENT PROMPT
// ============================================================================

let reassessmentPromptOverlay = null;
let resolveReassessmentPrompt = null;

/**
 * Show a non-intrusive reassessment reminder prompt
 *
 * @param {Object} options - Prompt options
 * @param {string} options.action - 'full_assessment' or 'micro_check'
 * @param {string} options.reason - Reason for the prompt
 * @param {string} options.urgency - 'high', 'medium', or 'low'
 * @returns {Promise<{action: string|null, dismissed: boolean}>}
 */
export function showReassessmentPrompt(options) {
  return new Promise(resolve => {
    resolveReassessmentPrompt = resolve;

    // Inject styles if not present
    injectStyles();

    // Add prompt-specific styles
    const promptStyle = document.createElement('style');
    promptStyle.id = 'stargardt-reassessment-prompt-styles';
    promptStyle.textContent = `
      .stargardt-reassessment-prompt {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 360px;
        background: #1a1a2e;
        border: 1px solid #3a3a5a;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .stargardt-reassessment-prompt.urgency-high {
        border-color: #ef4444;
      }

      .stargardt-reassessment-prompt.urgency-medium {
        border-color: #f59e0b;
      }

      .stargardt-reassessment-prompt.urgency-low {
        border-color: #6366f1;
      }

      .stargardt-reassessment-prompt-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .stargardt-reassessment-prompt-icon {
        font-size: 24px;
      }

      .stargardt-reassessment-prompt-title {
        color: #ffffff;
        font-size: 16px;
        font-weight: 600;
        margin: 0;
      }

      .stargardt-reassessment-prompt-close {
        position: absolute;
        top: 12px;
        right: 12px;
        background: transparent;
        border: none;
        color: #a0a0b0;
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        line-height: 1;
      }

      .stargardt-reassessment-prompt-close:hover {
        color: #ffffff;
      }

      .stargardt-reassessment-prompt-body {
        color: #c0c0d0;
        font-size: 14px;
        line-height: 1.5;
        margin-bottom: 16px;
      }

      .stargardt-reassessment-prompt-actions {
        display: flex;
        gap: 8px;
      }

      .stargardt-reassessment-prompt-btn {
        flex: 1;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 500;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .stargardt-reassessment-prompt-btn-primary {
        background: #6366f1;
        color: #ffffff;
      }

      .stargardt-reassessment-prompt-btn-primary:hover {
        background: #5558e3;
      }

      .stargardt-reassessment-prompt-btn-secondary {
        background: #2a2a4a;
        color: #c0c0d0;
      }

      .stargardt-reassessment-prompt-btn-secondary:hover {
        background: #3a3a5a;
      }

      @media (prefers-reduced-motion: reduce) {
        .stargardt-reassessment-prompt {
          animation: none;
        }
      }
    `;

    if (!document.getElementById('stargardt-reassessment-prompt-styles')) {
      document.head.appendChild(promptStyle);
    }

    // Create prompt element
    reassessmentPromptOverlay = document.createElement('div');
    reassessmentPromptOverlay.className = `stargardt-reassessment-prompt urgency-${options.urgency}`;
    reassessmentPromptOverlay.setAttribute('role', 'alertdialog');
    reassessmentPromptOverlay.setAttribute('aria-label', 'Vision check reminder');

    const icon = options.urgency === 'high' ? '⚠️' : options.urgency === 'medium' ? '🔔' : '💡';
    const title =
      options.action === 'full_assessment' ? 'Vision Assessment Due' : 'Quick Vision Check';
    const actionLabel = options.action === 'full_assessment' ? 'Run Assessment' : 'Quick Check';

    reassessmentPromptOverlay.innerHTML = sanitizeHTML(`
      <button class="stargardt-reassessment-prompt-close" aria-label="Dismiss">&times;</button>
      <div class="stargardt-reassessment-prompt-header">
        <span class="stargardt-reassessment-prompt-icon">${icon}</span>
        <h3 class="stargardt-reassessment-prompt-title">${title}</h3>
      </div>
      <p class="stargardt-reassessment-prompt-body">${options.reason}</p>
      <div class="stargardt-reassessment-prompt-actions">
        <button class="stargardt-reassessment-prompt-btn stargardt-reassessment-prompt-btn-secondary" id="reassess-later">
          Later
        </button>
        <button class="stargardt-reassessment-prompt-btn stargardt-reassessment-prompt-btn-primary" id="reassess-now">
          ${actionLabel}
        </button>
      </div>
    `);

    document.body.appendChild(reassessmentPromptOverlay);

    // Bind events
    reassessmentPromptOverlay.querySelector('.stargardt-reassessment-prompt-close').onclick =
      () => {
        closeReassessmentPrompt({ action: null, dismissed: true });
      };

    document.getElementById('reassess-later').onclick = () => {
      closeReassessmentPrompt({ action: null, dismissed: true, remindLater: true });
    };

    document.getElementById('reassess-now').onclick = () => {
      closeReassessmentPrompt({ action: options.action, dismissed: false });
    };

    // Announce to screen readers
    announceToScreenReader(`${title}: ${options.reason}`);
  });
}

/**
 * Close reassessment prompt and clean up
 */
function closeReassessmentPrompt(result) {
  if (reassessmentPromptOverlay) {
    reassessmentPromptOverlay.remove();
    reassessmentPromptOverlay = null;
  }

  if (resolveReassessmentPrompt) {
    resolveReassessmentPrompt(result);
    resolveReassessmentPrompt = null;
  }
}

// ============================================================================
// VISION DIARY UI
// ============================================================================

let diaryOverlay = null;
let resolveDiary = null;

/**
 * Show vision diary entry form
 *
 * @returns {Promise<{completed: boolean, entry: Object|null}>}
 */
export function showDiaryEntry() {
  return new Promise(resolve => {
    resolveDiary = resolve;

    // Inject styles if not present
    injectStyles();

    // Create overlay
    diaryOverlay = document.createElement('div');
    diaryOverlay.className = 'stargardt-calibration-overlay';
    diaryOverlay.style.background = 'rgba(10, 10, 26, 0.95)';
    diaryOverlay.setAttribute('role', 'dialog');
    diaryOverlay.setAttribute('aria-modal', 'true');
    diaryOverlay.setAttribute('aria-label', 'Vision diary entry');
    document.body.appendChild(diaryOverlay);

    const symptoms = [
      'Blurriness',
      'Light sensitivity',
      'Eye strain',
      'Difficulty reading',
      'Color issues',
      'Floaters',
      'Headache',
    ];

    diaryOverlay.innerHTML = sanitizeHTML(`
      <div class="stargardt-calibration-instructions" style="max-width: 500px;">
        <h2>Vision Diary</h2>
        <p style="font-size: 14px; margin-bottom: 20px;">
          Recording your daily vision quality helps track changes over time.
        </p>

        <div style="text-align: left; margin-bottom: 20px;">
          <label style="display: block; color: #c0c0d0; margin-bottom: 8px; font-size: 14px;">
            How is your vision today? (1-5)
          </label>
          <div style="display: flex; gap: 8px;" id="diary-rating">
            ${[1, 2, 3, 4, 5]
              .map(
                n => `
              <button
                class="stargardt-calibration-btn"
                data-rating="${n}"
                style="flex: 1; padding: 12px 8px; background: ${n === 3 ? '#6366f1' : '#3a3a5a'};"
              >
                ${n}
              </button>
            `
              )
              .join('')}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #808090; margin-top: 4px;">
            <span>Poor</span>
            <span>Excellent</span>
          </div>
        </div>

        <div style="text-align: left; margin-bottom: 20px;">
          <label style="display: block; color: #c0c0d0; margin-bottom: 8px; font-size: 14px;">
            Any symptoms today? (select all that apply)
          </label>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;" id="diary-symptoms">
            ${symptoms
              .map(
                s => `
              <button
                class="stargardt-calibration-btn"
                data-symptom="${s}"
                style="padding: 8px 12px; background: #3a3a5a; font-size: 13px;"
              >
                ${s}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div style="text-align: left; margin-bottom: 20px;">
          <label style="display: block; color: #c0c0d0; margin-bottom: 8px; font-size: 14px;">
            Notes (optional)
          </label>
          <textarea
            id="diary-notes"
            style="width: 100%; height: 80px; background: #252540; border: 1px solid #3a3a5a; border-radius: 8px; color: #ffffff; padding: 12px; font-size: 14px; resize: none;"
            placeholder="Any additional observations..."
          ></textarea>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 24px;">
          <button class="stargardt-calibration-btn stargardt-calibration-btn-secondary" id="diary-cancel" style="flex: 1;">
            Cancel
          </button>
          <button class="stargardt-calibration-btn stargardt-calibration-btn-primary" id="diary-save" style="flex: 1;">
            Save Entry
          </button>
        </div>
      </div>
    `);

    let selectedRating = 3;
    const selectedSymptoms = new Set();

    // Rating buttons
    document.getElementById('diary-rating').addEventListener('click', e => {
      const btn = e.target.closest('[data-rating]');
      if (btn) {
        selectedRating = parseInt(btn.dataset.rating);
        document.querySelectorAll('#diary-rating button').forEach(b => {
          b.style.background = '#3a3a5a';
        });
        btn.style.background = '#6366f1';
      }
    });

    // Symptom buttons
    document.getElementById('diary-symptoms').addEventListener('click', e => {
      const btn = e.target.closest('[data-symptom]');
      if (btn) {
        const symptom = btn.dataset.symptom;
        if (selectedSymptoms.has(symptom)) {
          selectedSymptoms.delete(symptom);
          btn.style.background = '#3a3a5a';
        } else {
          selectedSymptoms.add(symptom);
          btn.style.background = '#6366f1';
        }
      }
    });

    // Cancel
    document.getElementById('diary-cancel').onclick = () => {
      closeDiary({ completed: false, entry: null });
    };

    // Save
    document.getElementById('diary-save').onclick = () => {
      const entry = {
        qualityRating: selectedRating,
        symptoms: Array.from(selectedSymptoms),
        notes: document.getElementById('diary-notes').value.trim(),
      };
      closeDiary({ completed: true, entry });
    };

    // Focus first rating
    document.querySelector('#diary-rating button').focus();
  });
}

/**
 * Close diary form and clean up
 */
function closeDiary(result) {
  if (diaryOverlay) {
    diaryOverlay.remove();
    diaryOverlay = null;
  }

  if (resolveDiary) {
    resolveDiary(result);
    resolveDiary = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runCalibrationWizard,
  runMicroCheck,
  showReassessmentPrompt,
  showDiaryEntry,
};
