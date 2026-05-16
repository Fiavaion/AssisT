/**
 * Pomodoro Timer Feature Module
 *
 * Provides customizable work/break intervals for focus management and time awareness.
 * Particularly beneficial for neurodivergent users who struggle with time blindness,
 * task transitions, or maintaining focus during extended work sessions.
 *
 * Features:
 * - Configurable work/short break/long break durations
 * - Visual circular progress indicator
 * - Session tracking (work vs. break)
 * - Automatic session transitions (optional)
 * - Audio notifications (optional, respects user preferences)
 * - Visual notifications via toast
 * - Draggable, repositionable widget
 * - Minimized state for reduced visual clutter
 * - Respects prefers-reduced-motion
 *
 * WCAG Compliance:
 * - WCAG 2.2 SC 1.4.12 (Text Spacing) - Adequate spacing in UI
 * - WCAG 2.2 SC 2.2.1 (Timing Adjustable) - User can pause/adjust timing
 * - WCAG 2.1 SC 1.4.3 (Contrast) - High contrast UI elements
 *
 * @module features/pomodoro
 * @version 1.0.0
 * @requires ../../core/ui/toast.js
 * @requires ../../content/utils/storage-utils.js
 */

import { showToast } from '../../core/ui/toast.js';
import { Z } from '../../utils/z-index.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/**
 * Whether Pomodoro Timer is currently enabled
 * @type {boolean}
 * @private
 */
let pomodoro_enabled = false;

/**
 * Interval ID for the countdown timer
 * @type {number|null}
 * @private
 */
let pomodoro_timerInterval = null;

/**
 * Current session type
 * @type {'work'|'shortBreak'|'longBreak'}
 * @private
 */
let pomodoro_currentSession = 'work';

/**
 * Time remaining in current session (seconds)
 * @type {number}
 * @private
 */
let pomodoro_timeRemaining = 0;

/**
 * Number of work sessions completed (resets after long break)
 * @type {number}
 * @private
 */
let pomodoro_sessionsCompleted = 0;

/**
 * Whether the timer is currently paused
 * @type {boolean}
 * @private
 */
let pomodoro_isPaused = false;

/**
 * Reference to the UI container element
 * @type {HTMLElement|null}
 * @private
 */
let pomodoro_uiElement = null;

/**
 * Reference to the injected style element
 * @type {HTMLStyleElement|null}
 * @private
 */
let pomodoro_styleElement = null;

/**
 * Whether the widget is currently minimized
 * @type {boolean}
 * @private
 */
let pomodoro_isMinimized = false;

/**
 * Audio element for notification sound
 * @type {HTMLAudioElement|null}
 * @private
 */
// eslint-disable-next-line no-unused-vars
const pomodoro_audioElement = null;

/**
 * Tracks if widget is being dragged
 * @type {boolean}
 * @private
 */
let pomodoro_isDragging = false;

/**
 * Drag offset coordinates
 * @type {{x: number, y: number}}
 * @private
 */
const pomodoro_dragOffset = { x: 0, y: 0 };

// ============================================================
// SETTINGS
// ============================================================

/**
 * Pomodoro Timer configuration settings
 * @type {Object}
 * @property {boolean} enabled - Whether feature is enabled
 * @property {number} workDuration - Work session duration in minutes
 * @property {number} shortBreakDuration - Short break duration in minutes
 * @property {number} longBreakDuration - Long break duration in minutes
 * @property {number} sessionsUntilLongBreak - Number of work sessions before long break
 * @property {boolean} autoStartBreaks - Auto-start break timer
 * @property {boolean} autoStartWork - Auto-start work timer after break
 * @property {boolean} showNotifications - Show toast notifications
 * @property {boolean} playSound - Play notification sound
 * @property {string} position - Widget position (top-left, top-right, bottom-left, bottom-right)
 * @private
 */
const pomodoro_settings = {
  enabled: false,
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsUntilLongBreak: 4,
  autoStartBreaks: false,
  autoStartWork: false,
  showNotifications: true,
  playSound: true,
  position: 'bottom-left',
};

/** @type {Object} Default settings for Pomodoro Timer */
const DEFAULT_SETTINGS = {
  enabled: false,
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsUntilLongBreak: 4,
  autoStartBreaks: false,
  autoStartWork: false,
  showNotifications: true,
  playSound: true,
  position: 'bottom-left',
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Inject CSS styles for the Pomodoro widget
 * @function pomodoro_injectStyles
 * @returns {void}
 * @private
 */
function pomodoro_injectStyles() {
  if (pomodoro_styleElement) {
    return;
  }

  pomodoro_styleElement = document.createElement('style');
  pomodoro_styleElement.id = 'assist-pomodoro-styles';
  pomodoro_styleElement.textContent = `
    /* Pomodoro Timer Widget - Accessible & Neurodivergent-Friendly */
    #assist-pomodoro-container {
      position: fixed;
      z-index: ${Z.FLOATING};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      user-select: none;
      transition: opacity 0.2s ease;
    }

    @media (prefers-reduced-motion: reduce) {
      #assist-pomodoro-container,
      #assist-pomodoro-container * {
        transition: none !important;
        animation: none !important;
      }
    }

    /* Widget Container */
    .assist-pomodoro-widget {
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      padding: 20px;
      min-width: 280px;
      border: 2px solid rgba(100, 100, 255, 0.3);
    }

    /* Minimized State */
    .assist-pomodoro-widget.minimized {
      padding: 10px 16px;
      min-width: auto;
      border-radius: 24px;
      cursor: pointer;
    }

    .assist-pomodoro-widget.minimized .pomodoro-main-content {
      display: none;
    }

    .assist-pomodoro-widget.minimized .pomodoro-minimized-view {
      display: flex !important;
    }

    /* Minimized View */
    .pomodoro-minimized-view {
      display: none;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .pomodoro-minimized-view .session-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #6366f1;
    }

    .pomodoro-minimized-view .session-dot.break {
      background: #10b981;
    }

    /* Header */
    .pomodoro-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      cursor: move;
    }

    .pomodoro-title {
      font-size: 16px;
      font-weight: 700;
      color: #333;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pomodoro-controls {
      display: flex;
      gap: 4px;
    }

    .pomodoro-icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 16px;
      line-height: 1;
      transition: background 0.15s;
      color: #666;
    }

    .pomodoro-icon-btn:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .pomodoro-icon-btn:active {
      transform: scale(0.95);
    }

    /* Progress Circle */
    .pomodoro-progress-container {
      position: relative;
      width: 200px;
      height: 200px;
      margin: 0 auto 20px;
    }

    .pomodoro-progress-svg {
      transform: rotate(-90deg);
      width: 100%;
      height: 100%;
    }

    .pomodoro-progress-bg {
      fill: none;
      stroke: #e5e7eb;
      stroke-width: 8;
    }

    .pomodoro-progress-ring {
      fill: none;
      stroke: #6366f1;
      stroke-width: 8;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.3s ease;
    }

    .pomodoro-progress-ring.break {
      stroke: #10b981;
    }

    .pomodoro-time-display {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }

    .pomodoro-time {
      font-size: 48px;
      font-weight: 700;
      color: #1f2937;
      line-height: 1;
      letter-spacing: -0.02em;
    }

    .pomodoro-session-label {
      font-size: 14px;
      color: #6b7280;
      margin-top: 8px;
      font-weight: 500;
    }

    /* Button Controls */
    .pomodoro-buttons {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .pomodoro-btn {
      flex: 1;
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      color: white;
    }

    .pomodoro-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .pomodoro-btn:active {
      transform: translateY(0);
    }

    .pomodoro-btn-primary {
      background: #6366f1;
    }

    .pomodoro-btn-primary:hover {
      background: #4f46e5;
    }

    .pomodoro-btn-secondary {
      background: #64748b;
    }

    .pomodoro-btn-secondary:hover {
      background: #475569;
    }

    .pomodoro-btn-success {
      background: #10b981;
    }

    .pomodoro-btn-success:hover {
      background: #059669;
    }

    /* Session Info */
    .pomodoro-session-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: rgba(99, 102, 241, 0.08);
      border-radius: 8px;
      font-size: 13px;
      color: #4b5563;
    }

    .pomodoro-sessions-count {
      font-weight: 600;
      color: #6366f1;
    }

    /* Position Classes */
    #assist-pomodoro-container.top-left {
      top: 20px;
      left: 20px;
    }

    #assist-pomodoro-container.top-right {
      top: 20px;
      right: 20px;
    }

    #assist-pomodoro-container.bottom-left {
      bottom: 20px;
      left: 20px;
    }

    #assist-pomodoro-container.bottom-right {
      bottom: 20px;
      right: 20px;
    }

    /* Dragging State */
    #assist-pomodoro-container.dragging {
      cursor: move;
      opacity: 0.9;
    }

    /* Accessibility - High Contrast Mode */
    @media (prefers-contrast: high) {
      .assist-pomodoro-widget {
        border: 3px solid #000;
        background: #fff;
      }

      .pomodoro-btn {
        border: 2px solid currentColor;
      }
    }
  `;

  document.head.appendChild(pomodoro_styleElement);
  console.log('[Pomodoro] Styles injected');
}

/**
 * Remove injected styles
 * @function pomodoro_removeStyles
 * @returns {void}
 * @private
 */
function pomodoro_removeStyles() {
  if (pomodoro_styleElement) {
    pomodoro_styleElement.remove();
    pomodoro_styleElement = null;
    console.log('[Pomodoro] Styles removed');
  }
}

/**
 * Create the Pomodoro UI widget
 * @function pomodoro_createUI
 * @returns {void}
 * @private
 */
function pomodoro_createUI() {
  if (pomodoro_uiElement) {
    return;
  }

  // Create container
  pomodoro_uiElement = document.createElement('div');
  pomodoro_uiElement.id = 'assist-pomodoro-container';
  pomodoro_uiElement.className = pomodoro_settings.position;

  // Create widget HTML
  pomodoro_uiElement.innerHTML = sanitizeHTML(`
    <div class="assist-pomodoro-widget">
      <!-- Minimized View -->
      <div class="pomodoro-minimized-view">
        <span class="session-dot ${pomodoro_currentSession === 'work' ? '' : 'break'}"></span>
        <span class="time-text">00:00</span>
      </div>

      <!-- Main Content -->
      <div class="pomodoro-main-content">
        <!-- Header -->
        <div class="pomodoro-header">
          <h3 class="pomodoro-title">
            <span>🍅</span>
            <span>Pomodoro Timer</span>
          </h3>
          <div class="pomodoro-controls">
            <button class="pomodoro-icon-btn" id="pomodoro-minimize-btn" aria-label="Minimize" title="Minimize">
              ➖
            </button>
            <button class="pomodoro-icon-btn" id="pomodoro-close-btn" aria-label="Close" title="Close">
              ✕
            </button>
          </div>
        </div>

        <!-- Progress Circle -->
        <div class="pomodoro-progress-container">
          <svg class="pomodoro-progress-svg" viewBox="0 0 200 200">
            <circle class="pomodoro-progress-bg" cx="100" cy="100" r="90"></circle>
            <circle
              class="pomodoro-progress-ring ${pomodoro_currentSession === 'work' ? '' : 'break'}"
              cx="100"
              cy="100"
              r="90"
              stroke-dasharray="565.48"
              stroke-dashoffset="0"
            ></circle>
          </svg>
          <div class="pomodoro-time-display">
            <div class="pomodoro-time" id="pomodoro-time-text">25:00</div>
            <div class="pomodoro-session-label" id="pomodoro-session-label">Work Session</div>
          </div>
        </div>

        <!-- Controls -->
        <div class="pomodoro-buttons">
          <button class="pomodoro-btn pomodoro-btn-primary" id="pomodoro-start-btn">Start</button>
          <button class="pomodoro-btn pomodoro-btn-secondary" id="pomodoro-reset-btn">Reset</button>
          <button class="pomodoro-btn pomodoro-btn-success" id="pomodoro-skip-btn">Skip</button>
        </div>

        <!-- Session Info -->
        <div class="pomodoro-session-info">
          <span>Sessions completed</span>
          <span class="pomodoro-sessions-count" id="pomodoro-sessions-count">0 / 4</span>
        </div>
      </div>
    </div>
  `);

  document.body.appendChild(pomodoro_uiElement);

  // Initialize timer display
  pomodoro_resetTimer();

  // Attach event listeners
  pomodoro_attachEventListeners();

  console.log('[Pomodoro] UI created');
}

/**
 * Remove the Pomodoro UI widget
 * @function pomodoro_removeUI
 * @returns {void}
 * @private
 */
function pomodoro_removeUI() {
  if (pomodoro_uiElement) {
    pomodoro_uiElement.remove();
    pomodoro_uiElement = null;
    console.log('[Pomodoro] UI removed');
  }
}

/**
 * Attach event listeners to UI controls
 * @function pomodoro_attachEventListeners
 * @returns {void}
 * @private
 */
function pomodoro_attachEventListeners() {
  if (!pomodoro_uiElement) {
    return;
  }

  // Start/Pause button
  const startBtn = pomodoro_uiElement.querySelector('#pomodoro-start-btn');
  if (startBtn) {
    attachInteractiveHandler(startBtn, 'Pomodoro Start/Pause Button', () => {
      if (pomodoro_timerInterval) {
        pomodoro_pauseTimer();
      } else {
        pomodoro_startTimer();
      }
    });
  }

  // Reset button
  const resetBtn = pomodoro_uiElement.querySelector('#pomodoro-reset-btn');
  if (resetBtn) {
    attachInteractiveHandler(resetBtn, 'Pomodoro Reset Button', pomodoro_resetTimer);
  }

  // Skip button
  const skipBtn = pomodoro_uiElement.querySelector('#pomodoro-skip-btn');
  if (skipBtn) {
    attachInteractiveHandler(skipBtn, 'Pomodoro Skip Button', pomodoro_skipSession);
  }

  // Minimize button
  const minimizeBtn = pomodoro_uiElement.querySelector('#pomodoro-minimize-btn');
  if (minimizeBtn) {
    attachInteractiveHandler(minimizeBtn, 'Pomodoro Minimize Button', pomodoro_toggleMinimize);
  }

  // Close button
  const closeBtn = pomodoro_uiElement.querySelector('#pomodoro-close-btn');
  if (closeBtn) {
    attachInteractiveHandler(closeBtn, 'Pomodoro Close Button', pomodoro_disable);
  }

  // Drag functionality
  const header = pomodoro_uiElement.querySelector('.pomodoro-header');
  if (header) {
    header.addEventListener('mousedown', pomodoro_handleDragStart);
  }

  // Click to expand when minimized
  const widget = pomodoro_uiElement.querySelector('.assist-pomodoro-widget');
  if (widget) {
    attachInteractiveHandler(widget, 'Pomodoro Widget Expand', e => {
      if (pomodoro_isMinimized && e.target === widget) {
        pomodoro_toggleMinimize();
      }
    });
  }
}

/**
 * Start the Pomodoro timer
 * @function pomodoro_startTimer
 * @returns {void}
 */
function pomodoro_startTimer() {
  if (pomodoro_timerInterval) {
    return; // Already running
  }

  console.log('[Pomodoro] Timer started');

  // Start interval (1 second)
  pomodoro_timerInterval = setInterval(() => {
    if (pomodoro_timeRemaining > 0) {
      pomodoro_timeRemaining--;
      pomodoro_updateDisplay();
    } else {
      // Session complete
      pomodoro_handleSessionComplete();
    }
  }, 1000);

  // Update UI
  pomodoro_isPaused = false;
  pomodoro_updateButtonStates();
}

/**
 * Pause the Pomodoro timer
 * @function pomodoro_pauseTimer
 * @returns {void}
 */
function pomodoro_pauseTimer() {
  if (pomodoro_timerInterval) {
    clearInterval(pomodoro_timerInterval);
    pomodoro_timerInterval = null;
    pomodoro_isPaused = true;
    console.log('[Pomodoro] Timer paused');
    pomodoro_updateButtonStates();
  }
}

/**
 * Reset the Pomodoro timer to current session duration
 * @function pomodoro_resetTimer
 * @returns {void}
 */
function pomodoro_resetTimer() {
  // Stop timer if running
  if (pomodoro_timerInterval) {
    clearInterval(pomodoro_timerInterval);
    pomodoro_timerInterval = null;
  }

  // Reset to current session duration
  const duration = pomodoro_getSessionDuration(pomodoro_currentSession);
  pomodoro_timeRemaining = duration * 60;
  pomodoro_isPaused = false;

  // Update display
  pomodoro_updateDisplay();
  pomodoro_updateButtonStates();

  console.log('[Pomodoro] Timer reset');
}

/**
 * Skip to next session
 * @function pomodoro_skipSession
 * @returns {void}
 */
function pomodoro_skipSession() {
  // Stop current timer
  if (pomodoro_timerInterval) {
    clearInterval(pomodoro_timerInterval);
    pomodoro_timerInterval = null;
  }

  // Determine next session
  if (pomodoro_currentSession === 'work') {
    pomodoro_sessionsCompleted++;

    // Check if it's time for long break
    if (pomodoro_sessionsCompleted >= pomodoro_settings.sessionsUntilLongBreak) {
      pomodoro_switchSession('longBreak');
      pomodoro_sessionsCompleted = 0; // Reset counter
    } else {
      pomodoro_switchSession('shortBreak');
    }
  } else {
    // After any break, go back to work
    pomodoro_switchSession('work');
  }

  console.log('[Pomodoro] Session skipped');
}

/**
 * Switch to a different session type
 * @function pomodoro_switchSession
 * @param {'work'|'shortBreak'|'longBreak'} sessionType - The session type to switch to
 * @returns {void}
 */
function pomodoro_switchSession(sessionType) {
  pomodoro_currentSession = sessionType;
  pomodoro_resetTimer();
  pomodoro_updateSessionUI();

  console.log(`[Pomodoro] Switched to ${sessionType} session`);

  // Auto-start if enabled
  const shouldAutoStart =
    (sessionType === 'work' && pomodoro_settings.autoStartWork) ||
    (sessionType !== 'work' && pomodoro_settings.autoStartBreaks);

  if (shouldAutoStart) {
    setTimeout(() => pomodoro_startTimer(), 500);
  }
}

/**
 * Get duration for a session type
 * @function pomodoro_getSessionDuration
 * @param {'work'|'shortBreak'|'longBreak'} sessionType - The session type
 * @returns {number} Duration in minutes
 * @private
 */
function pomodoro_getSessionDuration(sessionType) {
  switch (sessionType) {
    case 'work':
      return pomodoro_settings.workDuration;
    case 'shortBreak':
      return pomodoro_settings.shortBreakDuration;
    case 'longBreak':
      return pomodoro_settings.longBreakDuration;
    default:
      return 25;
  }
}

/**
 * Handle session completion
 * @function pomodoro_handleSessionComplete
 * @returns {void}
 * @private
 */
function pomodoro_handleSessionComplete() {
  // Stop timer
  if (pomodoro_timerInterval) {
    clearInterval(pomodoro_timerInterval);
    pomodoro_timerInterval = null;
  }

  // Determine message and next session
  let message = '';
  let nextSession = 'work';

  if (pomodoro_currentSession === 'work') {
    pomodoro_sessionsCompleted++;

    if (pomodoro_sessionsCompleted >= pomodoro_settings.sessionsUntilLongBreak) {
      message = '🎉 Work session complete! Time for a long break!';
      nextSession = 'longBreak';
      pomodoro_sessionsCompleted = 0;
    } else {
      message = '✅ Work session complete! Time for a short break!';
      nextSession = 'shortBreak';
    }
  } else if (pomodoro_currentSession === 'shortBreak') {
    message = '☕ Break over! Ready to work?';
    nextSession = 'work';
  } else {
    message = '🌟 Long break over! Ready to work?';
    nextSession = 'work';
  }

  // Notify user
  pomodoro_notifyUser(message);

  // Switch to next session
  pomodoro_switchSession(nextSession);
}

/**
 * Update the timer display
 * @function pomodoro_updateDisplay
 * @returns {void}
 * @private
 */
function pomodoro_updateDisplay() {
  if (!pomodoro_uiElement) {
    return;
  }

  // Calculate minutes and seconds
  const minutes = Math.floor(pomodoro_timeRemaining / 60);
  const seconds = pomodoro_timeRemaining % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Update time text (main and minimized)
  const timeText = pomodoro_uiElement.querySelector('#pomodoro-time-text');
  if (timeText) {
    timeText.textContent = timeString;
  }

  const minimizedTime = pomodoro_uiElement.querySelector('.pomodoro-minimized-view .time-text');
  if (minimizedTime) {
    minimizedTime.textContent = timeString;
  }

  // Update progress ring
  const totalDuration = pomodoro_getSessionDuration(pomodoro_currentSession) * 60;
  const progress = pomodoro_timeRemaining / totalDuration;
  const circumference = 2 * Math.PI * 90; // radius = 90
  const offset = circumference * (1 - progress);

  const progressRing = pomodoro_uiElement.querySelector('.pomodoro-progress-ring');
  if (progressRing) {
    progressRing.style.strokeDashoffset = offset;
  }

  // Update sessions count
  const sessionsCount = pomodoro_uiElement.querySelector('#pomodoro-sessions-count');
  if (sessionsCount) {
    sessionsCount.textContent = `${pomodoro_sessionsCompleted} / ${pomodoro_settings.sessionsUntilLongBreak}`;
  }
}

/**
 * Update session-related UI elements
 * @function pomodoro_updateSessionUI
 * @returns {void}
 * @private
 */
function pomodoro_updateSessionUI() {
  if (!pomodoro_uiElement) {
    return;
  }

  // Update session label
  const sessionLabel = pomodoro_uiElement.querySelector('#pomodoro-session-label');
  if (sessionLabel) {
    const labels = {
      work: 'Work Session',
      shortBreak: 'Short Break',
      longBreak: 'Long Break',
    };
    sessionLabel.textContent = labels[pomodoro_currentSession] || 'Session';
  }

  // Update progress ring color
  const progressRing = pomodoro_uiElement.querySelector('.pomodoro-progress-ring');
  if (progressRing) {
    if (pomodoro_currentSession === 'work') {
      progressRing.classList.remove('break');
    } else {
      progressRing.classList.add('break');
    }
  }

  // Update minimized dot color
  const sessionDot = pomodoro_uiElement.querySelector('.session-dot');
  if (sessionDot) {
    if (pomodoro_currentSession === 'work') {
      sessionDot.classList.remove('break');
    } else {
      sessionDot.classList.add('break');
    }
  }

  // Update sessions count
  const sessionsCount = pomodoro_uiElement.querySelector('#pomodoro-sessions-count');
  if (sessionsCount) {
    sessionsCount.textContent = `${pomodoro_sessionsCompleted} / ${pomodoro_settings.sessionsUntilLongBreak}`;
  }
}

/**
 * Update button states based on timer state
 * @function pomodoro_updateButtonStates
 * @returns {void}
 * @private
 */
function pomodoro_updateButtonStates() {
  if (!pomodoro_uiElement) {
    return;
  }

  const startBtn = pomodoro_uiElement.querySelector('#pomodoro-start-btn');
  if (startBtn) {
    if (pomodoro_timerInterval) {
      startBtn.textContent = 'Pause';
      startBtn.className = 'pomodoro-btn pomodoro-btn-secondary';
    } else {
      startBtn.textContent = pomodoro_isPaused ? 'Resume' : 'Start';
      startBtn.className = 'pomodoro-btn pomodoro-btn-primary';
    }
  }
}

/**
 * Notify user of session changes
 * @function pomodoro_notifyUser
 * @param {string} message - The notification message
 * @returns {void}
 * @private
 */
function pomodoro_notifyUser(message) {
  // Show toast notification
  if (pomodoro_settings.showNotifications) {
    showToast(message, 4000);
  }

  // Play notification sound
  if (pomodoro_settings.playSound) {
    pomodoro_playNotificationSound();
  }

  console.log('[Pomodoro] Notification:', message);
}

/**
 * Play notification sound
 * @function pomodoro_playNotificationSound
 * @returns {void}
 * @private
 */
function pomodoro_playNotificationSound() {
  // Use Web Audio API to generate a simple notification tone
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // 800 Hz tone
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.warn('[Pomodoro] Could not play notification sound:', error);
  }
}

/**
 * Toggle minimized state
 * @function pomodoro_toggleMinimize
 * @returns {void}
 * @private
 */
function pomodoro_toggleMinimize() {
  if (!pomodoro_uiElement) {
    return;
  }

  pomodoro_isMinimized = !pomodoro_isMinimized;
  const widget = pomodoro_uiElement.querySelector('.assist-pomodoro-widget');

  if (widget) {
    if (pomodoro_isMinimized) {
      widget.classList.add('minimized');
    } else {
      widget.classList.remove('minimized');
    }
  }

  console.log(`[Pomodoro] ${pomodoro_isMinimized ? 'Minimized' : 'Expanded'}`);
}

/**
 * Handle drag start
 * @function pomodoro_handleDragStart
 * @param {MouseEvent} e - Mouse event
 * @returns {void}
 * @private
 */
function pomodoro_handleDragStart(e) {
  if (pomodoro_isMinimized) {
    return;
  } // Don't drag when minimized (let click expand)

  pomodoro_isDragging = true;

  const rect = pomodoro_uiElement.getBoundingClientRect();
  pomodoro_dragOffset.x = e.clientX - rect.left;
  pomodoro_dragOffset.y = e.clientY - rect.top;

  pomodoro_uiElement.classList.add('dragging');

  // Add global listeners
  document.addEventListener('mousemove', pomodoro_handleDragMove);
  document.addEventListener('mouseup', pomodoro_handleDragEnd);

  e.preventDefault();
}

/**
 * Handle drag move
 * @function pomodoro_handleDragMove
 * @param {MouseEvent} e - Mouse event
 * @returns {void}
 * @private
 */
function pomodoro_handleDragMove(e) {
  if (!pomodoro_isDragging || !pomodoro_uiElement) {
    return;
  }

  // Remove position class
  pomodoro_uiElement.className = 'dragging';

  // Calculate new position
  const x = e.clientX - pomodoro_dragOffset.x;
  const y = e.clientY - pomodoro_dragOffset.y;

  // Constrain to viewport
  const maxX = window.innerWidth - pomodoro_uiElement.offsetWidth;
  const maxY = window.innerHeight - pomodoro_uiElement.offsetHeight;

  const constrainedX = Math.max(0, Math.min(x, maxX));
  const constrainedY = Math.max(0, Math.min(y, maxY));

  pomodoro_uiElement.style.left = `${constrainedX}px`;
  pomodoro_uiElement.style.top = `${constrainedY}px`;
  pomodoro_uiElement.style.right = 'auto';
  pomodoro_uiElement.style.bottom = 'auto';

  e.preventDefault();
}

/**
 * Handle drag end
 * @function pomodoro_handleDragEnd
 * @returns {void}
 * @private
 */
function pomodoro_handleDragEnd() {
  pomodoro_isDragging = false;

  if (pomodoro_uiElement) {
    pomodoro_uiElement.classList.remove('dragging');
  }

  // Remove global listeners
  document.removeEventListener('mousemove', pomodoro_handleDragMove);
  document.removeEventListener('mouseup', pomodoro_handleDragEnd);
}

/**
 * Enable the Pomodoro Timer
 * @function pomodoro_enable
 * @returns {void}
 */
function pomodoro_enable() {
  if (pomodoro_enabled) {
    return;
  }

  pomodoro_enabled = true;
  pomodoro_injectStyles();
  pomodoro_createUI();

  console.log('[Pomodoro] Enabled');
  showToast('🍅 Pomodoro Timer enabled');
}

/**
 * Disable the Pomodoro Timer
 * @function pomodoro_disable
 * @returns {void}
 */
function pomodoro_disable() {
  if (!pomodoro_enabled) {
    return;
  }

  // Stop timer
  if (pomodoro_timerInterval) {
    clearInterval(pomodoro_timerInterval);
    pomodoro_timerInterval = null;
  }

  // Clean up UI
  pomodoro_removeUI();
  pomodoro_removeStyles();

  // Reset state
  pomodoro_enabled = false;
  pomodoro_currentSession = 'work';
  pomodoro_sessionsCompleted = 0;
  pomodoro_isPaused = false;
  pomodoro_isMinimized = false;

  console.log('[Pomodoro] Disabled');
  showToast('Pomodoro Timer disabled');
}

/**
 * Get current Pomodoro state
 * @function pomodoro_getState
 * @returns {Object} Current state object
 */
function pomodoro_getState() {
  return {
    enabled: pomodoro_enabled,
    currentSession: pomodoro_currentSession,
    timeRemaining: pomodoro_timeRemaining,
    sessionsCompleted: pomodoro_sessionsCompleted,
    isPaused: pomodoro_isPaused,
    isRunning: pomodoro_timerInterval !== null,
    isMinimized: pomodoro_isMinimized,
  };
}

// ============================================================
// INITIALIZATION & STORAGE LISTENERS
// ============================================================

/**
 * Apply settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 * @private
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = pomodoro_enabled;
  const newEnabled = settings.enabled || false;

  // Update settings
  Object.assign(pomodoro_settings, settings);

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    pomodoro_enable();
  } else if (!newEnabled && wasEnabled) {
    pomodoro_disable();
  } else if (newEnabled && !isInit) {
    // Update UI if already enabled (settings changed)
    if (pomodoro_uiElement) {
      // Update position if changed
      if (pomodoro_settings.position && !pomodoro_isDragging) {
        pomodoro_uiElement.className = pomodoro_settings.position;
      }

      // Recalculate time if durations changed and timer is not running
      if (!pomodoro_timerInterval) {
        pomodoro_resetTimer();
      }
    }
  }

  console.log(
    `[Pomodoro] Settings ${isInit ? 'loaded' : 'updated'}:`,
    newEnabled,
    pomodoro_settings
  );
}

/**
 * Initialize Pomodoro Timer using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'pomodoro',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

// ============================================================
// EXPORTS
// ============================================================

/**
 * Public API for the Pomodoro Timer feature module
 */
export {
  pomodoro_enable,
  pomodoro_disable,
  pomodoro_startTimer,
  pomodoro_pauseTimer,
  pomodoro_resetTimer,
  pomodoro_getState,
};
