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
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// ============================================================
// STATE MANAGEMENT (Synced from background service worker)
// ============================================================

/**
 * Local cache of Pomodoro state (synced from background)
 * @type {Object}
 * @private
 */
let pomodoro_state = {
  enabled: false,
  currentSession: 'work',
  timeRemaining: 25 * 60,
  sessionsCompleted: 0,
  isPaused: true,
  isRunning: false,
  isMinimized: false,
};

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

/**
 * Whether the message listener has been set up
 * @type {boolean}
 * @private
 */
let pomodoro_listenerSetup = false;

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
      z-index: 999999;
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
      cursor: pointer;
    }

    .pomodoro-minimized-view:hover {
      opacity: 0.8;
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

  // Start/Pause button - sends message to background
  const startBtn = pomodoro_uiElement.querySelector('#pomodoro-start-btn');
  if (startBtn) {
    attachInteractiveHandler(startBtn, 'Pomodoro Start/Pause Button', () => {
      if (pomodoro_state.isRunning) {
        chrome.runtime.sendMessage({ action: 'POMODORO_PAUSE' });
      } else {
        chrome.runtime.sendMessage({ action: 'POMODORO_START' });
      }
    });
  }

  // Reset button - sends message to background
  const resetBtn = pomodoro_uiElement.querySelector('#pomodoro-reset-btn');
  if (resetBtn) {
    attachInteractiveHandler(resetBtn, 'Pomodoro Reset Button', () => {
      chrome.runtime.sendMessage({ action: 'POMODORO_RESET' });
    });
  }

  // Skip button - sends message to background
  const skipBtn = pomodoro_uiElement.querySelector('#pomodoro-skip-btn');
  if (skipBtn) {
    attachInteractiveHandler(skipBtn, 'Pomodoro Skip Button', () => {
      chrome.runtime.sendMessage({ action: 'POMODORO_SKIP' });
    });
  }

  // Minimize button - sends message to background for sync
  const minimizeBtn = pomodoro_uiElement.querySelector('#pomodoro-minimize-btn');
  if (minimizeBtn) {
    attachInteractiveHandler(minimizeBtn, 'Pomodoro Minimize Button', () => {
      chrome.runtime.sendMessage({ action: 'POMODORO_TOGGLE_MINIMIZE' });
    });
  }

  // Close button - sends message to background
  const closeBtn = pomodoro_uiElement.querySelector('#pomodoro-close-btn');
  if (closeBtn) {
    attachInteractiveHandler(closeBtn, 'Pomodoro Close Button', () => {
      chrome.runtime.sendMessage({ action: 'POMODORO_DISABLE' });
    });
  }

  // Drag functionality
  const header = pomodoro_uiElement.querySelector('.pomodoro-header');
  if (header) {
    header.addEventListener('mousedown', pomodoro_handleDragStart);
  }

  // Click to expand when minimized - sends message to background for sync
  const minimizedView = pomodoro_uiElement.querySelector('.pomodoro-minimized-view');
  if (minimizedView) {
    attachInteractiveHandler(minimizedView, 'Pomodoro Widget Expand', () => {
      if (pomodoro_state.isMinimized) {
        chrome.runtime.sendMessage({ action: 'POMODORO_TOGGLE_MINIMIZE' });
      }
    });
  }
}

// ============================================================
// BACKGROUND COMMUNICATION & STATE SYNC
// ============================================================

/**
 * Set up message listener for state updates from background
 * @function pomodoro_setupMessageListener
 * @returns {void}
 * @private
 */
function pomodoro_setupMessageListener() {
  if (pomodoro_listenerSetup) {
    return;
  }
  pomodoro_listenerSetup = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle state updates from background
    if (message.type === 'POMODORO_STATE_UPDATE') {
      pomodoro_handleStateUpdate(message);
      sendResponse({ success: true });
      return false;
    }

    // Handle session complete notifications
    if (message.type === 'POMODORO_SESSION_COMPLETE') {
      if (message.showNotification) {
        showToast(message.message, 4000);
      }
      if (message.playSound) {
        pomodoro_playNotificationSound();
      }
      sendResponse({ success: true });
      return false;
    }

    return false;
  });

  console.log('[Pomodoro] Message listener set up');
}

/**
 * Handle state update from background
 * @function pomodoro_handleStateUpdate
 * @param {Object} state - The new state from background
 * @returns {void}
 * @private
 */
function pomodoro_handleStateUpdate(state) {
  const wasEnabled = pomodoro_state.enabled;
  const wasMinimized = pomodoro_state.isMinimized;

  // Update local state cache
  pomodoro_state = {
    enabled: state.enabled,
    currentSession: state.currentSession,
    timeRemaining: state.timeRemaining,
    sessionsCompleted: state.sessionsCompleted,
    isPaused: state.isPaused,
    isRunning: state.isRunning,
    isMinimized: state.isMinimized,
  };

  // Handle enable/disable
  if (state.enabled && !wasEnabled) {
    // Create UI if not exists
    if (!pomodoro_uiElement) {
      pomodoro_injectStyles();
      pomodoro_createUI();
    }
  } else if (!state.enabled && wasEnabled) {
    // Remove UI
    pomodoro_removeUI();
    pomodoro_removeStyles();
    return;
  }

  // Update UI if enabled
  if (state.enabled && pomodoro_uiElement) {
    pomodoro_updateDisplay();
    pomodoro_updateButtonStates();
    pomodoro_updateSessionUI();

    // Handle minimize state change
    if (state.isMinimized !== wasMinimized) {
      const widget = pomodoro_uiElement.querySelector('.assist-pomodoro-widget');
      if (widget) {
        if (state.isMinimized) {
          widget.classList.add('minimized');
        } else {
          widget.classList.remove('minimized');
        }
      }
    }
  }
}

/**
 * Request current state from background
 * @function pomodoro_requestState
 * @returns {Promise<void>}
 * @private
 */
async function pomodoro_requestState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'POMODORO_GET_STATE' });
    if (response && response.success) {
      pomodoro_handleStateUpdate(response);
    }
  } catch (error) {
    console.log('[Pomodoro] Could not get state from background:', error);
  }
}

// Legacy functions kept for API compatibility - now just send messages to background

/**
 * Start the Pomodoro timer
 * @function pomodoro_startTimer
 * @returns {void}
 */
function pomodoro_startTimer() {
  chrome.runtime.sendMessage({ action: 'POMODORO_START' });
}

/**
 * Pause the Pomodoro timer
 * @function pomodoro_pauseTimer
 * @returns {void}
 */
function pomodoro_pauseTimer() {
  chrome.runtime.sendMessage({ action: 'POMODORO_PAUSE' });
}

/**
 * Reset the Pomodoro timer to current session duration
 * @function pomodoro_resetTimer
 * @returns {void}
 */
function pomodoro_resetTimer() {
  chrome.runtime.sendMessage({ action: 'POMODORO_RESET' });
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
  const minutes = Math.floor(pomodoro_state.timeRemaining / 60);
  const seconds = pomodoro_state.timeRemaining % 60;
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
  const totalDuration = pomodoro_getSessionDuration(pomodoro_state.currentSession) * 60;
  const progress = pomodoro_state.timeRemaining / totalDuration;
  const circumference = 2 * Math.PI * 90; // radius = 90
  const offset = circumference * (1 - progress);

  const progressRing = pomodoro_uiElement.querySelector('.pomodoro-progress-ring');
  if (progressRing) {
    progressRing.style.strokeDashoffset = offset;
  }

  // Update sessions count
  const sessionsCount = pomodoro_uiElement.querySelector('#pomodoro-sessions-count');
  if (sessionsCount) {
    sessionsCount.textContent = `${pomodoro_state.sessionsCompleted} / ${pomodoro_settings.sessionsUntilLongBreak}`;
  }
}

/**
 * Get duration for a session type (uses local settings)
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
    sessionLabel.textContent = labels[pomodoro_state.currentSession] || 'Session';
  }

  // Update progress ring color
  const progressRing = pomodoro_uiElement.querySelector('.pomodoro-progress-ring');
  if (progressRing) {
    if (pomodoro_state.currentSession === 'work') {
      progressRing.classList.remove('break');
    } else {
      progressRing.classList.add('break');
    }
  }

  // Update minimized dot color
  const sessionDot = pomodoro_uiElement.querySelector('.session-dot');
  if (sessionDot) {
    if (pomodoro_state.currentSession === 'work') {
      sessionDot.classList.remove('break');
    } else {
      sessionDot.classList.add('break');
    }
  }

  // Update sessions count
  const sessionsCount = pomodoro_uiElement.querySelector('#pomodoro-sessions-count');
  if (sessionsCount) {
    sessionsCount.textContent = `${pomodoro_state.sessionsCompleted} / ${pomodoro_settings.sessionsUntilLongBreak}`;
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
    if (pomodoro_state.isRunning) {
      startBtn.textContent = 'Pause';
      startBtn.className = 'pomodoro-btn pomodoro-btn-secondary';
    } else {
      startBtn.textContent = pomodoro_state.isPaused ? 'Resume' : 'Start';
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
function _pomodoro_notifyUser(message) {
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
 * Toggle minimized state - sends message to background for cross-tab sync
 * @function pomodoro_toggleMinimize
 * @returns {void}
 * @private
 */
function _pomodoro_toggleMinimize() {
  chrome.runtime.sendMessage({ action: 'POMODORO_TOGGLE_MINIMIZE' });
}

/**
 * Handle drag start
 * @function pomodoro_handleDragStart
 * @param {MouseEvent} e - Mouse event
 * @returns {void}
 * @private
 */
function pomodoro_handleDragStart(e) {
  if (pomodoro_state.isMinimized) {
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
 * Enable the Pomodoro Timer - sends message to background for cross-tab sync
 * @function pomodoro_enable
 * @returns {void}
 */
function pomodoro_enable() {
  // Set up message listener first
  pomodoro_setupMessageListener();

  // Send enable message to background (will broadcast to all tabs)
  chrome.runtime.sendMessage({
    action: 'POMODORO_ENABLE',
    settings: pomodoro_settings,
  });

  console.log('[Pomodoro] Enable requested');
  showToast('🍅 Pomodoro Timer enabled');
}

/**
 * Disable the Pomodoro Timer - sends message to background for cross-tab sync
 * @function pomodoro_disable
 * @returns {void}
 */
function pomodoro_disable() {
  // Send disable message to background (will broadcast to all tabs)
  chrome.runtime.sendMessage({ action: 'POMODORO_DISABLE' });

  console.log('[Pomodoro] Disable requested');
  showToast('Pomodoro Timer disabled');
}

/**
 * Get current Pomodoro state
 * @function pomodoro_getState
 * @returns {Object} Current state object
 */
function pomodoro_getState() {
  return { ...pomodoro_state };
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
  const wasEnabled = pomodoro_state.enabled;
  const newEnabled = settings.enabled || false;

  // Update local settings
  Object.assign(pomodoro_settings, settings);

  // Set up message listener on first run
  pomodoro_setupMessageListener();

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    pomodoro_enable();
  } else if (!newEnabled && wasEnabled) {
    pomodoro_disable();
  } else if (newEnabled && !isInit) {
    // Settings changed - send update to background
    chrome.runtime.sendMessage({
      action: 'POMODORO_UPDATE_SETTINGS',
      settings: pomodoro_settings,
    });

    // Update UI position if changed
    if (pomodoro_uiElement && pomodoro_settings.position && !pomodoro_isDragging) {
      pomodoro_uiElement.className = pomodoro_settings.position;
    }
  }

  // On initialization, request current state from background
  // This allows timer to persist and show across tabs
  if (isInit) {
    pomodoro_requestState();
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
