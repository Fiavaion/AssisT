/**
 * Cognitive Profile Feature
 *
 * Learns user preferences over time and adapts AI responses accordingly.
 * Tracks interactions to build a personalized learning profile.
 *
 * Features:
 * - Tracks preferred complexity levels
 * - Learns reading speed preferences
 * - Identifies subject strengths/weaknesses
 * - Adapts AI prompts based on profile
 * - Privacy-focused: all data stored locally
 *
 * @module features/cognitiveProfile
 */

import { showToast } from '../../core/ui/toast.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let profile_data = null;
let profile_panel = null;

const profile_settings = {
  enabled: true,
  trackInteractions: true,
  adaptResponses: true,
  showProfileBadge: true,
};

// Default profile structure
const DEFAULT_PROFILE = {
  // Complexity preferences (tracked per feature)
  complexity: {
    summarization: 'moderate', // 'simple' | 'moderate' | 'detailed'
    simplification: 'moderate',
    breakdown: 'moderate',
    tutor: 'moderate',
  },

  // Reading preferences
  reading: {
    preferredSpeed: 1.0,
    preferredVoice: null,
    emotionalTTSEnabled: true,
  },

  // Learning style indicators
  learningStyle: {
    visual: 0, // Preference for images/diagrams
    stepByStep: 0, // Preference for sequential instructions
    conceptual: 0, // Preference for big-picture explanations
    examples: 0, // Preference for concrete examples
  },

  // Subject confidence (self-reported and inferred)
  subjects: {
    math: 'neutral',
    science: 'neutral',
    english: 'neutral',
    history: 'neutral',
    programming: 'neutral',
  },

  // Interaction statistics
  stats: {
    totalInteractions: 0,
    summarizationsUsed: 0,
    simplificationsUsed: 0,
    breakdownsUsed: 0,
    tutorQuestionsAsked: 0,
    imagesDescribed: 0,
    wordsRead: 0,
    lastActiveDate: null,
    streakDays: 0,
  },

  // Feedback history (for learning)
  feedback: {
    positiveResponses: 0,
    negativeResponses: 0,
    regenerateRequests: 0,
    complexityIncreases: 0,
    complexityDecreases: 0,
  },

  // User preferences
  preferences: {
    autoReadSummaries: false,
    showHints: true,
    includeExamples: true,
    bulletPointFormat: true,
  },

  // Profile metadata
  meta: {
    version: 1,
    createdAt: null,
    lastUpdated: null,
  },
};

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'assist_cognitive_profile';

/**
 * Load profile from storage
 * @returns {Promise<Object>}
 */
async function profile_load() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);

    if (result[STORAGE_KEY]) {
      profile_data = { ...DEFAULT_PROFILE, ...result[STORAGE_KEY] };
    } else {
      profile_data = {
        ...DEFAULT_PROFILE,
        meta: {
          ...DEFAULT_PROFILE.meta,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        },
      };
      await profile_save();
    }

    console.log(
      '[CognitiveProfile] Profile loaded:',
      profile_data.stats.totalInteractions,
      'interactions'
    );
    return profile_data;
  } catch (error) {
    console.error('[CognitiveProfile] Failed to load profile:', error);
    profile_data = { ...DEFAULT_PROFILE };
    return profile_data;
  }
}

/**
 * Save profile to storage
 * @returns {Promise<void>}
 */
async function profile_save() {
  if (!profile_data) {
    return;
  }

  profile_data.meta.lastUpdated = new Date().toISOString();

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: profile_data });
    console.log('[CognitiveProfile] Profile saved');
  } catch (error) {
    console.error('[CognitiveProfile] Failed to save profile:', error);
  }
}

// ============================================================================
// INTERACTION TRACKING
// ============================================================================

/**
 * Track a feature interaction
 * @param {string} feature - Feature name
 * @param {Object} data - Interaction data
 */
async function profile_trackInteraction(feature, data = {}) {
  if (!profile_settings.trackInteractions || !profile_data) {
    return;
  }

  profile_data.stats.totalInteractions++;
  profile_data.stats.lastActiveDate = new Date().toISOString();

  // Update feature-specific stats
  switch (feature) {
    case 'summarization':
      profile_data.stats.summarizationsUsed++;
      if (data.level) {
        profile_data.complexity.summarization = data.level;
      }
      if (data.wordCount) {
        profile_data.stats.wordsRead += data.wordCount;
      }
      break;

    case 'simplification':
      profile_data.stats.simplificationsUsed++;
      if (data.level) {
        profile_data.complexity.simplification = data.level;
      }
      break;

    case 'breakdown':
      profile_data.stats.breakdownsUsed++;
      if (data.tasksCompleted) {
        // User completing tasks indicates good match
        profile_data.feedback.positiveResponses++;
      }
      break;

    case 'tutor':
      profile_data.stats.tutorQuestionsAsked++;
      if (data.hintsUsed) {
        profile_data.learningStyle.stepByStep += data.hintsUsed;
      }
      break;

    case 'imageDescription':
      profile_data.stats.imagesDescribed++;
      profile_data.learningStyle.visual++;
      break;

    case 'tts':
      if (data.speed) {
        // Track preferred speed (running average)
        const currentSpeed = profile_data.reading.preferredSpeed;
        profile_data.reading.preferredSpeed = currentSpeed * 0.8 + data.speed * 0.2;
      }
      break;
  }

  // Update streak
  profile_updateStreak();

  await profile_save();
}

/**
 * Track user feedback
 * @param {string} type - Feedback type: 'positive' | 'negative' | 'regenerate' | 'simpler' | 'detailed'
 */
async function profile_trackFeedback(type) {
  if (!profile_data) {
    return;
  }

  switch (type) {
    case 'positive':
      profile_data.feedback.positiveResponses++;
      break;
    case 'negative':
      profile_data.feedback.negativeResponses++;
      break;
    case 'regenerate':
      profile_data.feedback.regenerateRequests++;
      break;
    case 'simpler':
      profile_data.feedback.complexityDecreases++;
      break;
    case 'detailed':
      profile_data.feedback.complexityIncreases++;
      break;
  }

  await profile_save();
}

/**
 * Update streak tracking
 */
function profile_updateStreak() {
  if (!profile_data) {
    return;
  }

  const today = new Date().toDateString();
  const lastActive = profile_data.stats.lastActiveDate
    ? new Date(profile_data.stats.lastActiveDate).toDateString()
    : null;

  if (!lastActive) {
    profile_data.stats.streakDays = 1;
  } else if (lastActive === today) {
    // Same day, no change
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastActive === yesterday.toDateString()) {
      profile_data.stats.streakDays++;
    } else {
      profile_data.stats.streakDays = 1;
    }
  }
}

// ============================================================================
// PROFILE ANALYSIS
// ============================================================================

/**
 * Get the dominant learning style
 * @returns {string}
 */
function profile_getDominantStyle() {
  if (!profile_data) {
    return 'balanced';
  }

  const styles = profile_data.learningStyle;
  let maxStyle = 'balanced';
  let maxValue = 0;

  for (const [style, value] of Object.entries(styles)) {
    if (value > maxValue) {
      maxValue = value;
      maxStyle = style;
    }
  }

  // Only return style if significantly preferred
  return maxValue > 5 ? maxStyle : 'balanced';
}

/**
 * Get recommended complexity for a feature
 * @param {string} feature - Feature name
 * @returns {string}
 */
function profile_getRecommendedComplexity(feature) {
  if (!profile_data || !profile_settings.adaptResponses) {
    return 'moderate';
  }

  // Check if user has been requesting simpler/more detailed
  const { complexityIncreases, complexityDecreases } = profile_data.feedback;

  if (complexityDecreases > complexityIncreases + 3) {
    return 'simple';
  } else if (complexityIncreases > complexityDecreases + 3) {
    return 'detailed';
  }

  return profile_data.complexity[feature] || 'moderate';
}

/**
 * Get profile-adapted prompt modifiers
 * @returns {Object}
 */
function profile_getPromptModifiers() {
  if (!profile_data || !profile_settings.adaptResponses) {
    return {};
  }

  const modifiers = {};
  const style = profile_getDominantStyle();

  switch (style) {
    case 'visual':
      modifiers.includeVisualDescriptions = true;
      modifiers.style = 'Include visual analogies and spatial descriptions.';
      break;
    case 'stepByStep':
      modifiers.useNumberedSteps = true;
      modifiers.style = 'Use numbered steps and sequential instructions.';
      break;
    case 'conceptual':
      modifiers.includeBigPicture = true;
      modifiers.style = 'Start with the big picture before details.';
      break;
    case 'examples':
      modifiers.includeExamples = true;
      modifiers.style = 'Include concrete examples and real-world applications.';
      break;
  }

  // Add complexity preference
  const complexity = profile_getRecommendedComplexity('default');
  if (complexity === 'simple') {
    modifiers.complexity = 'Use simple vocabulary and short sentences.';
  } else if (complexity === 'detailed') {
    modifiers.complexity = 'Provide thorough explanations with nuance.';
  }

  return modifiers;
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the profile panel
 * @returns {HTMLElement}
 */
function profile_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-profile-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Cognitive Profile');

  panel.innerHTML = sanitizeHTML(`
    <style>
      #assist-profile-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        background: white;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .assist-profile-header {
        background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
        color: #333;
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .assist-profile-title {
        font-size: 18px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .assist-profile-close {
        background: rgba(0,0,0,0.1);
        border: none;
        color: #333;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
      }

      .assist-profile-close:hover {
        background: rgba(0,0,0,0.2);
      }

      .assist-profile-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      .assist-profile-section {
        margin-bottom: 20px;
      }

      .assist-profile-section-title {
        font-size: 14px;
        font-weight: 600;
        color: #666;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .assist-profile-stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }

      .assist-profile-stat {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 8px;
        text-align: center;
      }

      .assist-profile-stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #333;
      }

      .assist-profile-stat-label {
        font-size: 11px;
        color: #666;
        margin-top: 4px;
      }

      .assist-profile-style {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 16px;
        border-radius: 12px;
        text-align: center;
      }

      .assist-profile-style-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }

      .assist-profile-style-label {
        font-size: 14px;
        opacity: 0.9;
      }

      .assist-profile-style-name {
        font-size: 18px;
        font-weight: 600;
        margin-top: 4px;
      }

      .assist-profile-preferences {
        background: #f8f9fa;
        padding: 16px;
        border-radius: 12px;
      }

      .assist-profile-pref-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid #eee;
      }

      .assist-profile-pref-item:last-child {
        border-bottom: none;
      }

      .assist-profile-controls {
        padding: 12px 20px;
        border-top: 1px solid #eee;
        display: flex;
        gap: 8px;
      }

      .assist-profile-btn {
        flex: 1;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }

      .assist-profile-btn-danger {
        background: #ffebee;
        color: #c62828;
      }

      .assist-profile-btn-danger:hover {
        background: #ffcdd2;
      }

      .assist-profile-btn-primary {
        background: #667eea;
        color: white;
      }

      .assist-profile-btn-primary:hover {
        background: #5a6fd6;
      }

      .assist-profile-streak {
        background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
        color: #333;
        padding: 12px 16px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
      }

      .assist-profile-streak-icon {
        font-size: 28px;
      }

      .assist-profile-streak-info {
        flex: 1;
      }

      .assist-profile-streak-days {
        font-size: 20px;
        font-weight: 700;
      }

      .assist-profile-streak-label {
        font-size: 12px;
        opacity: 0.8;
      }
    </style>

    <div class="assist-profile-header">
      <div class="assist-profile-title">
        <span>🧠</span>
        <span>Your Learning Profile</span>
      </div>
      <button class="assist-profile-close" aria-label="Close">&times;</button>
    </div>

    <div class="assist-profile-content">
      <!-- Content will be rendered dynamically -->
    </div>

    <div class="assist-profile-controls">
      <button class="assist-profile-btn assist-profile-btn-danger" id="assist-profile-reset">
        🗑️ Reset Profile
      </button>
      <button class="assist-profile-btn assist-profile-btn-primary" id="assist-profile-close-btn">
        Done
      </button>
    </div>
  `);

  // Close button
  attachInteractiveHandler(
    panel.querySelector('.assist-profile-close'),
    'Cognitive Profile Close Button',
    () => profile_hide()
  );
  attachInteractiveHandler(
    panel.querySelector('#assist-profile-close-btn'),
    'Cognitive Profile Close Bottom Button',
    () => profile_hide()
  );

  // Reset button
  attachInteractiveHandler(
    panel.querySelector('#assist-profile-reset'),
    'Cognitive Profile Reset Button',
    async () => {
      if (confirm('Reset your learning profile? This cannot be undone.')) {
        await profile_reset();
        profile_renderContent();
        showToast?.('Profile reset') || alert('Profile reset');
      }
    }
  );

  return panel;
}

/**
 * Render profile content
 */
function profile_renderContent() {
  if (!profile_panel || !profile_data) {
    return;
  }

  const content = profile_panel.querySelector('.assist-profile-content');
  if (!content) {
    return;
  }

  const style = profile_getDominantStyle();
  const styleInfo = {
    visual: { icon: '👁️', name: 'Visual Learner' },
    stepByStep: { icon: '📋', name: 'Sequential Learner' },
    conceptual: { icon: '💭', name: 'Conceptual Thinker' },
    examples: { icon: '📚', name: 'Example-Based Learner' },
    balanced: { icon: '⚖️', name: 'Balanced Learner' },
  };

  const currentStyle = styleInfo[style] || styleInfo.balanced;

  content.innerHTML = sanitizeHTML(`
    ${
      profile_data.stats.streakDays > 0
        ? `
      <div class="assist-profile-streak">
        <div class="assist-profile-streak-icon">🔥</div>
        <div class="assist-profile-streak-info">
          <div class="assist-profile-streak-days">${profile_data.stats.streakDays} Day${profile_data.stats.streakDays > 1 ? 's' : ''}</div>
          <div class="assist-profile-streak-label">Learning Streak</div>
        </div>
      </div>
    `
        : ''
    }

    <div class="assist-profile-section">
      <div class="assist-profile-style">
        <div class="assist-profile-style-icon">${currentStyle.icon}</div>
        <div class="assist-profile-style-label">Your Learning Style</div>
        <div class="assist-profile-style-name">${currentStyle.name}</div>
      </div>
    </div>

    <div class="assist-profile-section">
      <div class="assist-profile-section-title">📊 Usage Statistics</div>
      <div class="assist-profile-stats">
        <div class="assist-profile-stat">
          <div class="assist-profile-stat-value">${profile_data.stats.totalInteractions}</div>
          <div class="assist-profile-stat-label">Total Interactions</div>
        </div>
        <div class="assist-profile-stat">
          <div class="assist-profile-stat-value">${profile_data.stats.summarizationsUsed}</div>
          <div class="assist-profile-stat-label">Summaries</div>
        </div>
        <div class="assist-profile-stat">
          <div class="assist-profile-stat-value">${profile_data.stats.simplificationsUsed}</div>
          <div class="assist-profile-stat-label">Simplifications</div>
        </div>
        <div class="assist-profile-stat">
          <div class="assist-profile-stat-value">${profile_data.stats.breakdownsUsed}</div>
          <div class="assist-profile-stat-label">Breakdowns</div>
        </div>
        <div class="assist-profile-stat">
          <div class="assist-profile-stat-value">${profile_data.stats.tutorQuestionsAsked}</div>
          <div class="assist-profile-stat-label">Tutor Sessions</div>
        </div>
        <div class="assist-profile-stat">
          <div class="assist-profile-stat-value">${Math.round(profile_data.stats.wordsRead / 1000)}K</div>
          <div class="assist-profile-stat-label">Words Processed</div>
        </div>
      </div>
    </div>

    <div class="assist-profile-section">
      <div class="assist-profile-section-title">🎯 Preferences</div>
      <div class="assist-profile-preferences">
        <div class="assist-profile-pref-item">
          <span>Complexity Level</span>
          <strong>${profile_getRecommendedComplexity('default')}</strong>
        </div>
        <div class="assist-profile-pref-item">
          <span>Reading Speed</span>
          <strong>${profile_data.reading.preferredSpeed.toFixed(1)}x</strong>
        </div>
        <div class="assist-profile-pref-item">
          <span>Emotional TTS</span>
          <strong>${profile_data.reading.emotionalTTSEnabled ? 'On' : 'Off'}</strong>
        </div>
      </div>
    </div>
  `);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the profile panel
 */
function profile_show() {
  if (!profile_panel) {
    profile_panel = profile_createPanel();
    document.body.appendChild(profile_panel);
  }
  profile_renderContent();
  profile_panel.style.display = 'flex';
}

/**
 * Hide the profile panel
 */
function profile_hide() {
  if (profile_panel) {
    profile_panel.style.display = 'none';
  }
}

/**
 * Reset profile to defaults
 */
async function profile_reset() {
  profile_data = {
    ...DEFAULT_PROFILE,
    meta: {
      ...DEFAULT_PROFILE.meta,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    },
  };
  await profile_save();
}

/**
 * Get current profile data
 * @returns {Object}
 */
function profile_get() {
  return profile_data;
}

/**
 * Update profile preference
 * @param {string} category - Category (e.g., 'complexity', 'preferences')
 * @param {string} key - Preference key
 * @param {any} value - New value
 */
async function profile_updatePreference(category, key, value) {
  if (!profile_data || !profile_data[category]) {
    return;
  }

  profile_data[category][key] = value;
  await profile_save();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function profile_init() {
  console.log('[CognitiveProfile] Initializing...');

  // Load profile from storage
  await profile_load();

  // Register to window
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.cognitiveProfile = {
    show: profile_show,
    hide: profile_hide,
    get: profile_get,
    track: profile_trackInteraction,
    trackFeedback: profile_trackFeedback,
    getRecommendedComplexity: profile_getRecommendedComplexity,
    getPromptModifiers: profile_getPromptModifiers,
    getDominantStyle: profile_getDominantStyle,
    updatePreference: profile_updatePreference,
    reset: profile_reset,
    settings: profile_settings,
  };

  console.log('[CognitiveProfile] Initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  profile_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  profile_show,
  profile_hide,
  profile_get,
  profile_trackInteraction,
  profile_trackFeedback,
  profile_getRecommendedComplexity,
  profile_getPromptModifiers,
  profile_settings,
};
