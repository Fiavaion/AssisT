/**
 * Cognitive State Monitor Feature
 *
 * Monitors user interaction patterns to detect cognitive states like fatigue,
 * confusion, frustration, or engagement. Provides proactive suggestions.
 *
 * Features:
 * - Tracks reading speed, scroll patterns, selection frequency
 * - Detects signs of struggle or fatigue
 * - Offers contextual help suggestions
 * - Privacy-first: all processing local, no data transmitted
 *
 * @module features/cognitiveStateMonitor
 */

import { sanitizeHTML } from '../../utils/sanitize.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let csm_panel = null;
let csm_isMonitoring = false;
let csm_metrics = {
  sessionStart: null,
  readingSpeed: [],
  scrollEvents: [],
  selectionEvents: [],
  pauseDurations: [],
  backtrackCount: 0,
  rereadSections: new Set(),
  lastScrollPosition: 0,
  lastActivityTime: null,
  idleTime: 0,
};

const csm_settings = {
  enabled: true,
  sensitivityLevel: 'medium', // low, medium, high
  autoSuggest: true,
  trackingInterval: 5000, // 5 seconds
};

const CSM_STATES = {
  engaged: {
    icon: '🎯',
    label: 'Engaged',
    color: '#4CAF50',
    description: 'Actively reading and processing',
  },
  fatigued: { icon: '😴', label: 'Fatigued', color: '#FF9800', description: 'May need a break' },
  confused: {
    icon: '🤔',
    label: 'Confused',
    color: '#2196F3',
    description: 'Content may be unclear',
  },
  frustrated: {
    icon: '😤',
    label: 'Frustrated',
    color: '#f44336',
    description: 'Experiencing difficulty',
  },
  distracted: {
    icon: '🌙',
    label: 'Distracted',
    color: '#9C27B0',
    description: 'Attention may be wandering',
  },
  focused: { icon: '✨', label: 'Deep Focus', color: '#00BCD4', description: 'In the zone' },
};

// ============================================================================
// MONITORING FUNCTIONS
// ============================================================================

/**
 * Start monitoring cognitive state
 */
function csm_startMonitoring() {
  if (csm_isMonitoring) {
    return;
  }

  csm_isMonitoring = true;
  csm_metrics.sessionStart = Date.now();
  csm_metrics.lastActivityTime = Date.now();
  csm_metrics.lastScrollPosition = window.scrollY;

  // Add event listeners
  document.addEventListener('scroll', csm_handleScroll, { passive: true });
  document.addEventListener('mouseup', csm_handleSelection);
  document.addEventListener('mousemove', csm_handleActivity);
  document.addEventListener('keydown', csm_handleActivity);

  // Start periodic analysis
  csm_analysisInterval = setInterval(csm_analyzeState, csm_settings.trackingInterval);

  console.log('[CognitiveStateMonitor] Monitoring started');
}

let csm_analysisInterval = null;

/**
 * Stop monitoring
 */
function csm_stopMonitoring() {
  csm_isMonitoring = false;

  document.removeEventListener('scroll', csm_handleScroll);
  document.removeEventListener('mouseup', csm_handleSelection);
  document.removeEventListener('mousemove', csm_handleActivity);
  document.removeEventListener('keydown', csm_handleActivity);

  if (csm_analysisInterval) {
    clearInterval(csm_analysisInterval);
    csm_analysisInterval = null;
  }

  console.log('[CognitiveStateMonitor] Monitoring stopped');
}

/**
 * Handle scroll events
 */
function csm_handleScroll() {
  const now = Date.now();
  const currentPosition = window.scrollY;
  const delta = currentPosition - csm_metrics.lastScrollPosition;

  csm_metrics.scrollEvents.push({
    time: now,
    position: currentPosition,
    delta: delta,
    direction: delta > 0 ? 'down' : 'up',
  });

  // Detect backtracking (scrolling up significantly)
  if (delta < -100) {
    csm_metrics.backtrackCount++;
  }

  csm_metrics.lastScrollPosition = currentPosition;
  csm_metrics.lastActivityTime = now;

  // Keep only last 50 scroll events
  if (csm_metrics.scrollEvents.length > 50) {
    csm_metrics.scrollEvents.shift();
  }
}

/**
 * Handle text selection events
 */
function csm_handleSelection() {
  const selection = window.getSelection();
  const text = selection.toString().trim();

  if (text.length > 0) {
    const now = Date.now();
    csm_metrics.selectionEvents.push({
      time: now,
      length: text.length,
      text: text.substring(0, 100), // Store first 100 chars for pattern analysis
    });

    // Track if same area is being re-read
    const textHash = text.substring(0, 50);
    if (csm_metrics.rereadSections.has(textHash)) {
      csm_metrics.backtrackCount++;
    }
    csm_metrics.rereadSections.add(textHash);

    csm_metrics.lastActivityTime = now;

    // Keep only last 20 selections
    if (csm_metrics.selectionEvents.length > 20) {
      csm_metrics.selectionEvents.shift();
    }
  }
}

/**
 * Handle general activity
 */
function csm_handleActivity() {
  const now = Date.now();
  const timeSinceLastActivity = now - (csm_metrics.lastActivityTime || now);

  // Track pauses longer than 10 seconds
  if (timeSinceLastActivity > 10000) {
    csm_metrics.pauseDurations.push(timeSinceLastActivity);
    if (csm_metrics.pauseDurations.length > 20) {
      csm_metrics.pauseDurations.shift();
    }
  }

  csm_metrics.lastActivityTime = now;
}

// ============================================================================
// STATE ANALYSIS
// ============================================================================

/**
 * Analyze current cognitive state based on metrics
 * @returns {Object} State analysis result
 */
function csm_analyzeState() {
  const now = Date.now();
  const sessionDuration = (now - csm_metrics.sessionStart) / 1000 / 60; // minutes

  // Calculate metrics
  const recentScrolls = csm_metrics.scrollEvents.filter(e => now - e.time < 30000);
  const recentSelections = csm_metrics.selectionEvents.filter(e => now - e.time < 60000);
  const avgPauseDuration =
    csm_metrics.pauseDurations.length > 0
      ? csm_metrics.pauseDurations.reduce((a, b) => a + b, 0) / csm_metrics.pauseDurations.length
      : 0;

  // Calculate scroll speed variance
  const scrollSpeeds = [];
  for (let i = 1; i < recentScrolls.length; i++) {
    const timeDiff = recentScrolls[i].time - recentScrolls[i - 1].time;
    if (timeDiff > 0) {
      scrollSpeeds.push(Math.abs(recentScrolls[i].delta) / timeDiff);
    }
  }
  const avgScrollSpeed =
    scrollSpeeds.length > 0 ? scrollSpeeds.reduce((a, b) => a + b, 0) / scrollSpeeds.length : 0;

  // Count backtrack scrolls (scrolling up)
  const backtrackScrolls = recentScrolls.filter(e => e.direction === 'up').length;

  // Determine state based on heuristics
  let state = 'engaged';
  let confidence = 0.5;
  const indicators = [];

  // Fatigue indicators
  if (sessionDuration > 30 && avgScrollSpeed < 0.1) {
    state = 'fatigued';
    confidence = 0.7;
    indicators.push('Extended session with slowing activity');
  }

  // Confusion indicators
  if (backtrackScrolls > 3 || csm_metrics.backtrackCount > 5) {
    state = 'confused';
    confidence = 0.75;
    indicators.push('Frequent re-reading detected');
  }

  // Frustration indicators
  if (recentSelections.length > 5 && backtrackScrolls > 2) {
    state = 'frustrated';
    confidence = 0.7;
    indicators.push('High selection activity with backtracking');
  }

  // Distraction indicators
  if (avgPauseDuration > 30000) {
    state = 'distracted';
    confidence = 0.65;
    indicators.push('Long pauses between activities');
  }

  // Deep focus indicators
  if (
    avgScrollSpeed > 0.05 &&
    avgScrollSpeed < 0.3 &&
    backtrackScrolls < 2 &&
    sessionDuration > 5
  ) {
    state = 'focused';
    confidence = 0.8;
    indicators.push('Steady reading pace maintained');
  }

  const result = {
    state,
    confidence,
    indicators,
    metrics: {
      sessionDuration: Math.round(sessionDuration),
      scrollSpeed: avgScrollSpeed.toFixed(3),
      backtrackCount: csm_metrics.backtrackCount,
      selectionCount: recentSelections.length,
      avgPauseDuration: Math.round(avgPauseDuration / 1000),
    },
    suggestions: csm_getSuggestions(state),
  };

  // Update panel if visible
  if (csm_panel && csm_panel.style.display !== 'none') {
    csm_updatePanel(result);
  }

  return result;
}

/**
 * Get suggestions based on cognitive state
 * @param {string} state - Current state
 * @returns {Array} List of suggestions
 */
function csm_getSuggestions(state) {
  const suggestions = {
    engaged: ['Great focus! Keep going.', 'Consider taking notes on key points.'],
    fatigued: [
      'Consider taking a 5-minute break.',
      'Try the Pomodoro technique: 25 min work, 5 min rest.',
      'Stretch or get some water.',
    ],
    confused: [
      'Try using the Simplify tool on difficult passages.',
      'Use the Socratic Tutor for deeper understanding.',
      'Consider re-reading the previous section for context.',
    ],
    frustrated: [
      'Break down the content into smaller chunks.',
      'Use the Assignment Breakdown tool.',
      'Take a short break and return with fresh eyes.',
    ],
    distracted: [
      'Try minimizing other browser tabs.',
      'Use Speed Read (RSVP) for better focus.',
      'Set a specific goal for this reading session.',
    ],
    focused: [
      'Excellent focus! Maximize this productive time.',
      'Consider annotating key insights.',
      'Build a Knowledge Graph of concepts.',
    ],
  };

  return suggestions[state] || suggestions.engaged;
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the monitoring panel
 * @returns {HTMLElement} Panel element
 */
function csm_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-csm-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Cognitive State Monitor');
  panel.tabIndex = -1;

  const style = document.createElement('style');
  style.textContent = `
    #assist-csm-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 999998;
      overflow: hidden;
    }

    .csm-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .csm-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .csm-close {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .csm-close:hover {
      background: rgba(255,255,255,0.3);
    }

    .csm-content {
      padding: 16px;
    }

    .csm-state-display {
      text-align: center;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .csm-state-icon {
      font-size: 48px;
      margin-bottom: 8px;
    }

    .csm-state-label {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .csm-state-desc {
      font-size: 13px;
      opacity: 0.8;
    }

    .csm-confidence {
      font-size: 12px;
      color: #666;
      margin-top: 8px;
    }

    .csm-metrics {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .csm-metric-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 13px;
    }

    .csm-metric-label {
      color: #666;
    }

    .csm-metric-value {
      font-weight: 500;
    }

    .csm-suggestions {
      background: #e3f2fd;
      border-radius: 8px;
      padding: 12px;
    }

    .csm-suggestions h4 {
      margin: 0 0 8px 0;
      font-size: 13px;
      color: #1976D2;
    }

    .csm-suggestion-item {
      font-size: 13px;
      color: #333;
      padding: 6px 0;
      border-bottom: 1px solid rgba(0,0,0,0.05);
    }

    .csm-suggestion-item:last-child {
      border-bottom: none;
    }

    .csm-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }

    .csm-toggle-label {
      font-size: 13px;
      color: #666;
    }

    .csm-toggle-switch {
      position: relative;
      width: 44px;
      height: 24px;
      background: #ccc;
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .csm-toggle-switch.active {
      background: #4CAF50;
    }

    .csm-toggle-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }

    .csm-toggle-switch.active::after {
      transform: translateX(20px);
    }

    .csm-indicators {
      margin-top: 12px;
      padding: 8px;
      background: #fff3e0;
      border-radius: 6px;
      font-size: 12px;
      color: #e65100;
    }
  `;
  panel.appendChild(style);

  panel.innerHTML += `
    <div class="csm-header">
      <h3>🧠 Cognitive Monitor</h3>
      <button class="csm-close" aria-label="Close">&times;</button>
    </div>
    <div class="csm-content">
      <div class="csm-state-display" id="csm-state-display">
        <div class="csm-state-icon" id="csm-state-icon">🎯</div>
        <div class="csm-state-label" id="csm-state-label">Analyzing...</div>
        <div class="csm-state-desc" id="csm-state-desc">Starting monitoring</div>
        <div class="csm-confidence" id="csm-confidence"></div>
      </div>

      <div class="csm-metrics" id="csm-metrics">
        <div class="csm-metric-row">
          <span class="csm-metric-label">Session Duration</span>
          <span class="csm-metric-value" id="csm-duration">0 min</span>
        </div>
        <div class="csm-metric-row">
          <span class="csm-metric-label">Reading Pace</span>
          <span class="csm-metric-value" id="csm-pace">Calculating...</span>
        </div>
        <div class="csm-metric-row">
          <span class="csm-metric-label">Re-reads</span>
          <span class="csm-metric-value" id="csm-rereads">0</span>
        </div>
      </div>

      <div class="csm-suggestions" id="csm-suggestions">
        <h4>💡 Suggestions</h4>
        <div id="csm-suggestion-list"></div>
      </div>

      <div class="csm-indicators" id="csm-indicators" style="display: none;"></div>

      <div class="csm-toggle">
        <span class="csm-toggle-label">Auto-suggest help</span>
        <div class="csm-toggle-switch active" id="csm-auto-toggle"></div>
      </div>
    </div>
  `;

  return panel;
}

/**
 * Update panel with analysis results
 * @param {Object} result - Analysis result
 */
function csm_updatePanel(result) {
  const stateInfo = CSM_STATES[result.state] || CSM_STATES.engaged;

  // Update state display
  const stateDisplay = document.getElementById('csm-state-display');
  if (stateDisplay) {
    stateDisplay.style.background = `${stateInfo.color}20`;
    stateDisplay.style.color = stateInfo.color;
  }

  const stateIcon = document.getElementById('csm-state-icon');
  if (stateIcon) {
    stateIcon.textContent = stateInfo.icon;
  }

  const stateLabel = document.getElementById('csm-state-label');
  if (stateLabel) {
    stateLabel.textContent = stateInfo.label;
  }

  const stateDesc = document.getElementById('csm-state-desc');
  if (stateDesc) {
    stateDesc.textContent = stateInfo.description;
  }

  const confidence = document.getElementById('csm-confidence');
  if (confidence) {
    confidence.textContent = `Confidence: ${Math.round(result.confidence * 100)}%`;
  }

  // Update metrics
  const duration = document.getElementById('csm-duration');
  if (duration) {
    duration.textContent = `${result.metrics.sessionDuration} min`;
  }

  const pace = document.getElementById('csm-pace');
  if (pace) {
    const speed = parseFloat(result.metrics.scrollSpeed);
    pace.textContent = speed > 0.2 ? 'Fast' : speed > 0.05 ? 'Steady' : 'Slow';
  }

  const rereads = document.getElementById('csm-rereads');
  if (rereads) {
    rereads.textContent = result.metrics.backtrackCount;
  }

  // Update suggestions
  const suggestionList = document.getElementById('csm-suggestion-list');
  if (suggestionList) {
    suggestionList.innerHTML = sanitizeHTML(
      result.suggestions.map(s => `<div class="csm-suggestion-item">${s}</div>`).join('')
    );
  }

  // Update indicators
  const indicators = document.getElementById('csm-indicators');
  if (indicators && result.indicators.length > 0) {
    indicators.style.display = 'block';
    indicators.textContent = result.indicators.join(' • ');
  } else if (indicators) {
    indicators.style.display = 'none';
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the cognitive state monitor panel
 */
function csm_show() {
  if (csm_panel) {
    csm_panel.remove();
  }

  csm_panel = csm_createPanel();
  document.body.appendChild(csm_panel);

  // Start monitoring
  csm_startMonitoring();

  // Run initial analysis
  setTimeout(() => {
    const result = csm_analyzeState();
    csm_updatePanel(result);
  }, 1000);

  // Setup event handlers
  const closeBtn = csm_panel.querySelector('.csm-close');
  if (closeBtn) {
    closeBtn.onclick = csm_hide;
  }

  const autoToggle = document.getElementById('csm-auto-toggle');
  if (autoToggle) {
    autoToggle.onclick = () => {
      csm_settings.autoSuggest = !csm_settings.autoSuggest;
      autoToggle.classList.toggle('active', csm_settings.autoSuggest);
    };
  }

  // Escape key to close
  document.addEventListener('keydown', csm_handleKeydown);
}

/**
 * Hide the panel
 */
function csm_hide() {
  if (csm_panel) {
    csm_panel.remove();
    csm_panel = null;
  }
  csm_stopMonitoring();
  document.removeEventListener('keydown', csm_handleKeydown);
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} e
 */
function csm_handleKeydown(e) {
  if (e.key === 'Escape' && csm_panel) {
    csm_hide();
  }
}

/**
 * Get current state without showing panel
 * @returns {Object} Current state analysis
 */
function csm_getCurrentState() {
  if (!csm_isMonitoring) {
    csm_startMonitoring();
  }
  return csm_analyzeState();
}

/**
 * Reset metrics
 */
function csm_reset() {
  csm_metrics = {
    sessionStart: Date.now(),
    readingSpeed: [],
    scrollEvents: [],
    selectionEvents: [],
    pauseDurations: [],
    backtrackCount: 0,
    rereadSections: new Set(),
    lastScrollPosition: window.scrollY,
    lastActivityTime: Date.now(),
    idleTime: 0,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the cognitive state monitor
 */
function csm_init() {
  console.log('[CognitiveStateMonitor] Initializing...');

  // Register with global features
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.cognitiveStateMonitor = {
    show: csm_show,
    hide: csm_hide,
    getCurrentState: csm_getCurrentState,
    startMonitoring: csm_startMonitoring,
    stopMonitoring: csm_stopMonitoring,
    reset: csm_reset,
    settings: csm_settings,
  };

  console.log('[CognitiveStateMonitor] Initialized and registered');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  csm_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  csm_show,
  csm_hide,
  csm_getCurrentState,
  csm_startMonitoring,
  csm_stopMonitoring,
  csm_settings,
};
