/**
 * Struggle Detection Feature
 *
 * Monitors user behavior to detect when they may be struggling with
 * content and offers proactive assistance.
 *
 * Detection Signals:
 * - Re-reading patterns (scrolling back to same content)
 * - Long pauses on single elements
 * - Frequent use of simplification/definition lookups
 * - Low reading progress over time
 * - Erratic scroll patterns
 * - Multiple TTS plays of same content
 *
 * Actions:
 * - Offer to simplify text
 * - Suggest breaking content into smaller pieces
 * - Offer to read aloud
 * - Show contextual help
 * - Track difficult concepts for review
 *
 * @module features/struggleDetection
 */

import { showToast } from '../../core/ui/toast.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { sanitizeHTML } from '../../utils/sanitize.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let struggle_isTracking = false;
let struggle_panel = null;
let struggle_currentStruggleScore = 0;
let struggle_lastAssistanceTime = 0;
let struggle_difficultConcepts = [];

const struggle_settings = {
  enabled: true,
  sensitivity: 'medium', // 'low' | 'medium' | 'high'
  showNotifications: true,
  assistanceDelay: 30000, // Min time between assistance offers (ms)
  trackDifficultConcepts: true,
  autoSimplify: false,
};

// Tracking state
const struggle_tracking = {
  // Scroll tracking
  scrollHistory: [], // {y, timestamp, direction}
  lastScrollY: 0,
  scrollBackCount: 0,

  // View time tracking
  elementViewTimes: new Map(), // element -> {startTime, totalTime}
  currentElement: null,

  // Interaction tracking
  simplificationRequests: 0,
  dictionaryLookups: 0,
  ttsPlays: new Map(), // element -> playCount

  // Reading progress
  startTime: null,
  contentLength: 0,
  progressCheckpoints: [],

  // Session stats
  sessionStart: Date.now(),
  totalPauses: 0,
  avgScrollSpeed: 0,
};

// Sensitivity thresholds
const SENSITIVITY_THRESHOLDS = {
  low: {
    scrollBackThreshold: 5,
    pauseThreshold: 15000,
    rereadThreshold: 3,
    progressThreshold: 0.1,
  },
  medium: {
    scrollBackThreshold: 3,
    pauseThreshold: 10000,
    rereadThreshold: 2,
    progressThreshold: 0.15,
  },
  high: {
    scrollBackThreshold: 2,
    pauseThreshold: 7000,
    rereadThreshold: 2,
    progressThreshold: 0.2,
  },
};

// ============================================================================
// DETECTION ALGORITHMS
// ============================================================================

/**
 * Calculate struggle score based on all signals
 * @returns {number} Score 0-100 (higher = more struggle)
 */
function struggle_calculateScore() {
  const thresholds = SENSITIVITY_THRESHOLDS[struggle_settings.sensitivity];
  let score = 0;

  // Scroll-back patterns (0-25 points)
  const scrollBackScore = Math.min(
    25,
    (struggle_tracking.scrollBackCount / thresholds.scrollBackThreshold) * 25
  );
  score += scrollBackScore;

  // Long pause detection (0-25 points)
  const currentPauseTime = struggle_getCurrentPauseTime();
  const pauseScore = Math.min(25, (currentPauseTime / thresholds.pauseThreshold) * 25);
  score += pauseScore;

  // Re-reading same content (0-20 points)
  const maxReread = struggle_getMaxRereadCount();
  const rereadScore = Math.min(20, (maxReread / thresholds.rereadThreshold) * 20);
  score += rereadScore;

  // Tool usage frequency (0-15 points)
  const toolUsageScore = Math.min(
    15,
    (struggle_tracking.simplificationRequests + struggle_tracking.dictionaryLookups) * 5
  );
  score += toolUsageScore;

  // Reading progress stall (0-15 points)
  const progressStall = struggle_detectProgressStall();
  score += progressStall;

  return Math.round(score);
}

/**
 * Get current pause time on element
 * @returns {number} Pause time in ms
 */
function struggle_getCurrentPauseTime() {
  if (!struggle_tracking.currentElement) {
    return 0;
  }

  const viewData = struggle_tracking.elementViewTimes.get(struggle_tracking.currentElement);
  if (!viewData) {
    return 0;
  }

  return Date.now() - viewData.startTime;
}

/**
 * Get maximum re-read count for any element
 * @returns {number} Max TTS play count
 */
function struggle_getMaxRereadCount() {
  let max = 0;
  for (const count of struggle_tracking.ttsPlays.values()) {
    max = Math.max(max, count);
  }
  return max;
}

/**
 * Detect if reading progress has stalled
 * @returns {number} Stall score (0-15)
 */
function struggle_detectProgressStall() {
  if (!struggle_tracking.startTime) {
    return 0;
  }

  const elapsed = Date.now() - struggle_tracking.startTime;
  if (elapsed < 60000) {
    return 0;
  } // Need at least 1 minute

  // Check scroll progress vs time
  const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollRange <= 0) {
    return 0;
  }

  const scrollProgress = window.scrollY / scrollRange;
  const expectedProgress = Math.min(1, elapsed / 300000); // Expect full read in 5 min

  const progressRatio = scrollProgress / expectedProgress;

  if (progressRatio < 0.3) {
    return 15;
  }
  if (progressRatio < 0.5) {
    return 10;
  }
  if (progressRatio < 0.7) {
    return 5;
  }

  return 0;
}

/**
 * Detect scroll-back patterns
 * @param {number} scrollY - Current scroll position
 */
function struggle_trackScroll(scrollY) {
  const lastY = struggle_tracking.lastScrollY;
  const direction = scrollY > lastY ? 'down' : scrollY < lastY ? 'up' : 'none';

  struggle_tracking.scrollHistory.push({
    y: scrollY,
    timestamp: Date.now(),
    direction,
  });

  // Keep only last 50 scroll events
  if (struggle_tracking.scrollHistory.length > 50) {
    struggle_tracking.scrollHistory.shift();
  }

  // Detect scroll-back (scrolling up to previously viewed content)
  if (direction === 'up') {
    // Check if scrolling back more than 200px
    if (lastY - scrollY > 200) {
      struggle_tracking.scrollBackCount++;
    }
  }

  struggle_tracking.lastScrollY = scrollY;

  // Update struggle score
  struggle_updateScore();
}

/**
 * Track element view time
 * @param {HTMLElement} element - Element being viewed
 */
function struggle_trackElementView(element) {
  // End tracking on previous element
  if (struggle_tracking.currentElement && struggle_tracking.currentElement !== element) {
    const viewData = struggle_tracking.elementViewTimes.get(struggle_tracking.currentElement);
    if (viewData) {
      viewData.totalTime += Date.now() - viewData.startTime;
    }
  }

  // Start tracking new element
  if (!struggle_tracking.elementViewTimes.has(element)) {
    struggle_tracking.elementViewTimes.set(element, {
      startTime: Date.now(),
      totalTime: 0,
    });
  } else {
    const viewData = struggle_tracking.elementViewTimes.get(element);
    viewData.startTime = Date.now();
  }

  struggle_tracking.currentElement = element;
}

/**
 * Track tool usage
 * @param {string} tool - Tool name
 * @param {HTMLElement} [element] - Related element
 */
function struggle_trackToolUsage(tool, element = null) {
  switch (tool) {
    case 'simplify':
      struggle_tracking.simplificationRequests++;
      if (element) {
        struggle_addDifficultConcept(element);
      }
      break;
    case 'dictionary':
      struggle_tracking.dictionaryLookups++;
      break;
    case 'tts':
      if (element) {
        const count = struggle_tracking.ttsPlays.get(element) || 0;
        struggle_tracking.ttsPlays.set(element, count + 1);
      }
      break;
  }

  struggle_updateScore();
}

/**
 * Add a concept to difficult concepts list
 * @param {HTMLElement} element - Element containing difficult concept
 */
function struggle_addDifficultConcept(element) {
  if (!struggle_settings.trackDifficultConcepts) {
    return;
  }

  const text = element.textContent?.substring(0, 200) || '';
  if (!text) {
    return;
  }

  // Extract key terms (capitalized words, longer words)
  const keyTerms = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

  for (const term of keyTerms.slice(0, 3)) {
    if (!struggle_difficultConcepts.includes(term)) {
      struggle_difficultConcepts.push(term);
    }
  }

  // Keep only last 20 concepts
  if (struggle_difficultConcepts.length > 20) {
    struggle_difficultConcepts = struggle_difficultConcepts.slice(-20);
  }
}

// ============================================================================
// SCORE MONITORING
// ============================================================================

/**
 * Update struggle score and check for intervention
 */
function struggle_updateScore() {
  const newScore = struggle_calculateScore();
  struggle_currentStruggleScore = newScore;

  // Check if we should offer assistance
  if (struggle_settings.showNotifications && newScore >= 50) {
    const timeSinceLastAssist = Date.now() - struggle_lastAssistanceTime;

    if (timeSinceLastAssist >= struggle_settings.assistanceDelay) {
      struggle_offerAssistance(newScore);
    }
  }

  // Update any visible UI
  struggle_updateUI();
}

/**
 * Offer assistance to the user
 * @param {number} _score - Current struggle score
 */
function struggle_offerAssistance(_score) {
  struggle_lastAssistanceTime = Date.now();

  // Determine what kind of help to offer based on signals
  let message = '';
  let action = null;

  if (struggle_tracking.scrollBackCount > 3) {
    message = 'Having trouble following along? Would you like me to simplify this section?';
    action = 'simplify';
  } else if (struggle_getCurrentPauseTime() > 10000) {
    message = 'Taking your time with this content? Would you like me to read it aloud?';
    action = 'tts';
  } else if (struggle_getMaxRereadCount() > 2) {
    message = 'This seems tricky. Want me to break it down into smaller pieces?';
    action = 'breakdown';
  } else {
    message = 'Need some help with this content?';
    action = 'help';
  }

  struggle_showAssistancePanel(message, action);
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create assistance panel
 * @param {string} message - Message to show
 * @param {string} action - Suggested action
 */
function struggle_showAssistancePanel(message, action) {
  // Remove existing panel
  if (struggle_panel) {
    struggle_panel.remove();
  }

  struggle_panel = document.createElement('div');
  struggle_panel.id = 'assist-struggle-panel';

  struggle_panel.innerHTML = sanitizeHTML(`
    <style>
      #assist-struggle-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        z-index: 999995;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: struggle-slide-in 0.3s ease-out;
        overflow: hidden;
      }

      @keyframes struggle-slide-in {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .struggle-header {
        padding: 12px 16px;
        background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .struggle-title {
        font-weight: 600;
        font-size: 14px;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .struggle-close {
        background: rgba(0,0,0,0.1);
        border: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        color: #333;
        font-size: 14px;
      }

      .struggle-content {
        padding: 16px;
      }

      .struggle-message {
        font-size: 14px;
        color: #333;
        line-height: 1.5;
        margin-bottom: 16px;
      }

      .struggle-actions {
        display: flex;
        gap: 8px;
      }

      .struggle-btn {
        flex: 1;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }

      .struggle-btn-primary {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
      }

      .struggle-btn-primary:hover {
        transform: scale(1.02);
      }

      .struggle-btn-secondary {
        background: #f0f0f0;
        color: #333;
      }

      .struggle-btn-secondary:hover {
        background: #e0e0e0;
      }

      .struggle-indicator {
        position: fixed;
        top: 10px;
        right: 10px;
        background: white;
        padding: 8px 12px;
        border-radius: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        font-size: 12px;
        z-index: 999990;
        display: none;
      }

      .struggle-indicator.visible {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .struggle-score-bar {
        width: 60px;
        height: 6px;
        background: #e0e0e0;
        border-radius: 3px;
        overflow: hidden;
      }

      .struggle-score-fill {
        height: 100%;
        transition: width 0.3s, background 0.3s;
      }
    </style>

    <div class="struggle-header">
      <div class="struggle-title">
        <span>🤔</span>
        <span>Need Help?</span>
      </div>
      <button class="struggle-close" aria-label="Dismiss">&times;</button>
    </div>

    <div class="struggle-content">
      <div class="struggle-message">${message}</div>
      <div class="struggle-actions">
        <button class="struggle-btn struggle-btn-secondary" id="struggle-dismiss">
          I'm OK
        </button>
        <button class="struggle-btn struggle-btn-primary" id="struggle-accept">
          Yes, Help Me
        </button>
      </div>
    </div>
  `);

  document.body.appendChild(struggle_panel);

  // Event listeners
  attachInteractiveHandler(
    struggle_panel.querySelector('.struggle-close'),
    'Struggle Detection Close Button',
    () => struggle_dismissPanel()
  );
  attachInteractiveHandler(
    struggle_panel.querySelector('#struggle-dismiss'),
    'Struggle Detection Dismiss Button',
    () => struggle_dismissPanel()
  );
  attachInteractiveHandler(
    struggle_panel.querySelector('#struggle-accept'),
    'Struggle Detection Accept Button',
    () => struggle_acceptHelp(action)
  );

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (struggle_panel) {
      struggle_dismissPanel();
    }
  }, 15000);
}

/**
 * Dismiss the assistance panel
 */
function struggle_dismissPanel() {
  if (struggle_panel) {
    struggle_panel.style.animation = 'struggle-slide-in 0.2s ease-in reverse';
    setTimeout(() => {
      struggle_panel?.remove();
      struggle_panel = null;
    }, 200);
  }
}

/**
 * Accept help and trigger action
 * @param {string} action - Action to take
 */
function struggle_acceptHelp(action) {
  struggle_dismissPanel();

  const selection = window.getSelection();
  let text = '';

  // Try to get selected text or current paragraph
  if (selection && selection.toString().trim()) {
    text = selection.toString();
  } else if (struggle_tracking.currentElement) {
    text = struggle_tracking.currentElement.textContent;
  }

  switch (action) {
    case 'simplify':
      if (window.assistFeatures?.textSimplification && text) {
        window.assistFeatures.textSimplification.start(text);
      }
      break;
    case 'tts':
      if (typeof window.readText === 'function' && text) {
        window.readText(text, struggle_tracking.currentElement || document.body);
      }
      break;
    case 'breakdown':
      if (window.assistFeatures?.assignmentBreakdown && text) {
        window.assistFeatures.assignmentBreakdown.start(text);
      }
      break;
    case 'help':
      // Show general help
      showToast?.('Select text and use the highlight menu for assistance options');
      break;
  }

  // Track that we provided help
  window.assistFeatures?.cognitiveProfile?.track('struggleHelp', {
    action,
    score: struggle_currentStruggleScore,
  });
}

/**
 * Update struggle indicator UI
 */
function struggle_updateUI() {
  // Could show a subtle indicator of current struggle level
  // For now, this is handled by the assistance panel
}

/**
 * Show difficult concepts review
 */
function struggle_showReview() {
  if (struggle_difficultConcepts.length === 0) {
    showToast?.('No difficult concepts tracked yet');
    return;
  }

  const concepts = struggle_difficultConcepts.join(', ');
  showToast?.(`Concepts to review: ${concepts}`);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function struggle_setupListeners() {
  // Scroll tracking
  let scrollTimeout = null;
  window.addEventListener(
    'scroll',
    () => {
      if (!struggle_isTracking) {
        return;
      }

      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = setTimeout(() => {
        struggle_trackScroll(window.scrollY);
      }, 100);
    },
    { passive: true }
  );

  // Element view tracking (via intersection observer)
  const observer = new IntersectionObserver(
    entries => {
      if (!struggle_isTracking) {
        return;
      }

      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          struggle_trackElementView(entry.target);
        }
      }
    },
    {
      threshold: [0.5],
    }
  );

  // Observe main content elements
  document.querySelectorAll('p, article, section, .content, main').forEach(el => {
    observer.observe(el);
  });

  // Track TTS usage
  const originalReadText = window.readText;
  if (originalReadText) {
    window.readText = (text, element) => {
      struggle_trackToolUsage('tts', element);
      return originalReadText(text, element);
    };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start struggle detection tracking
 */
function struggle_startTracking() {
  if (struggle_isTracking) {
    return;
  }

  struggle_isTracking = true;
  struggle_tracking.startTime = Date.now();
  struggle_tracking.sessionStart = Date.now();

  struggle_setupListeners();

  console.log('[StruggleDetection] Tracking started');
}

/**
 * Stop struggle detection tracking
 */
function struggle_stopTracking() {
  struggle_isTracking = false;
  struggle_dismissPanel();

  console.log('[StruggleDetection] Tracking stopped');
}

/**
 * Get current struggle metrics
 * @returns {Object} Struggle metrics
 */
function struggle_getMetrics() {
  return {
    score: struggle_currentStruggleScore,
    scrollBacks: struggle_tracking.scrollBackCount,
    simplificationRequests: struggle_tracking.simplificationRequests,
    dictionaryLookups: struggle_tracking.dictionaryLookups,
    difficultConcepts: [...struggle_difficultConcepts],
    sessionDuration: Date.now() - struggle_tracking.sessionStart,
  };
}

/**
 * Reset tracking data
 */
function struggle_reset() {
  struggle_tracking.scrollHistory = [];
  struggle_tracking.scrollBackCount = 0;
  struggle_tracking.elementViewTimes.clear();
  struggle_tracking.simplificationRequests = 0;
  struggle_tracking.dictionaryLookups = 0;
  struggle_tracking.ttsPlays.clear();
  struggle_tracking.startTime = null;
  struggle_difficultConcepts = [];
  struggle_currentStruggleScore = 0;

  console.log('[StruggleDetection] Tracking reset');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function struggle_init() {
  console.log('[StruggleDetection] Initializing...');

  // Register to window
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.struggleDetection = {
    start: struggle_startTracking,
    stop: struggle_stopTracking,
    getMetrics: struggle_getMetrics,
    showReview: struggle_showReview,
    reset: struggle_reset,
    trackToolUsage: struggle_trackToolUsage,
    settings: struggle_settings,
  };

  // Load settings
  chrome.storage.local.get(['struggleDetectionSettings'], result => {
    if (result.struggleDetectionSettings) {
      Object.assign(struggle_settings, result.struggleDetectionSettings);
    }

    // Auto-start if enabled
    if (struggle_settings.enabled) {
      struggle_startTracking();
    }
  });

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.struggleDetectionSettings) {
      Object.assign(struggle_settings, changes.struggleDetectionSettings.newValue);

      if (struggle_settings.enabled && !struggle_isTracking) {
        struggle_startTracking();
      } else if (!struggle_settings.enabled && struggle_isTracking) {
        struggle_stopTracking();
      }
    }
  });

  console.log('[StruggleDetection] Initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  struggle_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  struggle_startTracking,
  struggle_stopTracking,
  struggle_getMetrics,
  struggle_trackToolUsage,
  struggle_settings,
};
