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
 *
 * CONSENT. This feature records how a student uses their supports — how many times they asked for
 * simpler text, how many words were read to them, how many days in a row they came back. That is a
 * record of somebody's difficulty reading, so it is off until the student switches it on in the
 * popup, and while it is off nothing is read from storage, nothing is written to it, and no
 * interaction is counted. It used to default to on and write `assist_cognitive_profile` on the
 * first page load, with no control anywhere to stop it.
 *
 * @module features/cognitiveProfile
 */

import { showToast } from '../../core/ui/toast.js';
import { Z } from '../../utils/z-index.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { trapFocus } from '../../utils/focus-trap.js';
import {
  PROFILE_KEY,
  PROFILE_SETTINGS_KEY,
  eraseProfileData,
  isProfileEnabled,
} from './profile-storage.js';

let profile_data = null;
let profile_panel = null;
/** Release the panel's focus trap; set while the panel is open, null while it is shut. */
let profile_releaseFocus = null;

const profile_settings = {
  // Off until the student asks for it. Nothing here is recorded on their behalf.
  enabled: false,
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

const STORAGE_KEY = PROFILE_KEY;

/**
 * Load profile from storage
 * @returns {Promise<Object>}
 */
async function profile_load() {
  if (!profile_settings.enabled) {
    return null;
  }

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);

    // Over a fresh copy, never over DEFAULT_PROFILE itself: the counters are incremented in place,
    // and spreading the shared object meant `DEFAULT_PROFILE.stats` climbed with every interaction,
    // so the next record started at somebody else's numbers.
    if (result[STORAGE_KEY]) {
      profile_data = { ...profile_freshRecord(), ...result[STORAGE_KEY] };
    } else {
      profile_data = profile_freshRecord();
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
    profile_data = profile_freshRecord();
    return profile_data;
  }
}

/**
 * Save profile to storage
 * @returns {Promise<void>}
 */
async function profile_save() {
  if (!profile_settings.enabled || !profile_data) {
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

/**
 * Track a feature interaction
 * @param {string} feature - Feature name
 * @param {Object} data - Interaction data
 */
async function profile_trackInteraction(feature, data = {}) {
  if (!profile_settings.enabled || !profile_settings.trackInteractions || !profile_data) {
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
  if (!profile_settings.enabled || !profile_data) {
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
  if (!profile_settings.enabled || !profile_data || !profile_settings.adaptResponses) {
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
  if (!profile_settings.enabled || !profile_data || !profile_settings.adaptResponses) {
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

/**
 * Create the profile panel
 * @returns {HTMLElement}
 */
function profile_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-profile-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'What AssisT has recorded about how you work');
  // Focus opens on the dialog itself so its name and its first sentence are announced before the
  // student is dropped on a control; Tab from there walks the panel's own buttons.
  panel.setAttribute('tabindex', '-1');

  // The panel's own CSS goes in as an element, not through the sanitiser: DOMPurify drops a
  // <style> that leads its markup, which left this panel as loose text at the foot of the page.
  const style = document.createElement('style');
  style.textContent = `
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
        z-index: ${Z.MODAL};
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
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
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

      .assist-profile-lead {
        margin: 0 0 16px;
        font-size: 14px;
        line-height: 1.6;
        color: #1f2933;
      }

      .assist-profile-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .assist-profile-list li {
        padding: 10px 0;
        border-bottom: 1px solid #eee;
        font-size: 14px;
        line-height: 1.5;
        color: #1f2933;
      }

      .assist-profile-list li:last-child {
        border-bottom: none;
      }

      .assist-profile-note {
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
        color: #3d4852;
        background: #f8f9fa;
        border-radius: 8px;
        padding: 12px 14px;
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

  `;

  panel.innerHTML = sanitizeHTML(`
    <div class="assist-profile-header">
      <div class="assist-profile-title">
        <span aria-hidden="true">📓</span>
        <span>What AssisT has recorded</span>
      </div>
      <button
        class="assist-profile-close"
        data-testid="profile-panel-close"
        aria-label="Close this record"
      >&times;</button>
    </div>

    <div class="assist-profile-content">
      <!-- Written afresh each time the panel opens. -->
    </div>

    <div class="assist-profile-controls">
      <button class="assist-profile-btn assist-profile-btn-danger" id="assist-profile-reset">
        🗑️ Start this record again
      </button>
      <button class="assist-profile-btn assist-profile-btn-primary" id="assist-profile-close-btn">
        Done
      </button>
    </div>
  `);
  panel.prepend(style);

  // Close button
  attachAccessibleHandler(
    panel.querySelector('.assist-profile-close'),
    'Cognitive Profile Close Button',
    () => profile_hide()
  );
  attachAccessibleHandler(
    panel.querySelector('#assist-profile-close-btn'),
    'Cognitive Profile Close Bottom Button',
    () => profile_hide()
  );

  // Reset button. Two presses rather than a native confirm(): this panel holds focus, and a
  // browser-level dialog opened from inside it freezes the page and takes the keyboard somewhere the
  // trap cannot follow. The annotations editor moved off confirm() for the same reason.
  const reset = panel.querySelector('#assist-profile-reset');
  const resetLabel = reset?.textContent || 'Start this record again';
  let resetArmed = false;

  function disarmReset() {
    resetArmed = false;
    if (reset) {
      reset.textContent = resetLabel;
      reset.removeAttribute('aria-describedby');
    }
  }

  attachAccessibleHandler(reset, 'Cognitive Profile Reset Button', async () => {
    if (!resetArmed) {
      resetArmed = true;
      reset.textContent = 'Press again to clear it for good';
      showToast?.(
        'This cannot be undone. Press again to clear the record, or move away to keep it.'
      );
      return;
    }
    disarmReset();
    await profile_reset();
    profile_renderContent();
    showToast?.('Cleared. AssisT starts noticing again from now on.');
  });

  // Moving away from the button is the way out: nothing is cleared unless the second press lands.
  reset?.addEventListener('blur', disarmReset);

  return panel;
}

/** 12400 -> "12,400". A student reads thousands with separators. */
function profile_plainNumber(value) {
  return String(Math.max(0, Math.round(Number(value) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * One line per thing that was counted, each saying what it counts.
 *
 * Only counts that actually happened are listed: a column of zeroes tells a student nothing and
 * reads as a form they failed to fill in. Every counter the record actually keeps has a line here,
 * though — the panel says this is everything, so leaving the feedback counts and the style tally out
 * of it, as an earlier version did, made that sentence untrue.
 *
 * @returns {string[]}
 */
function profile_recordLines() {
  const stats = profile_data.stats || {};
  const lines = [];
  const count = (value, singular, plural) => {
    const n = Number(value) || 0;
    if (n > 0) {
      lines.push(`${profile_plainNumber(n)} ${n === 1 ? singular : plural}`);
    }
  };

  count(stats.summarizationsUsed, 'time you asked for a summary', 'times you asked for a summary');
  count(
    stats.simplificationsUsed,
    'time you asked for simpler wording',
    'times you asked for simpler wording'
  );
  count(
    stats.breakdownsUsed,
    'time you asked for a task to be broken into steps',
    'times you asked for a task to be broken into steps'
  );
  count(
    stats.tutorQuestionsAsked,
    'question you worked through with the tutor',
    'questions you worked through with the tutor'
  );
  count(stats.imagesDescribed, 'picture was described to you', 'pictures were described to you');
  count(stats.wordsRead, 'word was read aloud to you', 'words were read aloud to you');

  const streak = Number(stats.streakDays) || 0;
  if (streak > 0) {
    lines.push(
      streak === 1 ? 'You have used AssisT today' : `You have used AssisT ${streak} days in a row`
    );
  }

  const speed = Number(profile_data.reading?.preferredSpeed);
  if (speed > 0 && speed !== 1) {
    lines.push(`You usually have things read to you at ${speed.toFixed(1)} times normal speed`);
  }

  // What you said about the answers you were given. These decide the length and shape of the next
  // one, so they are as much part of the record as the counts above.
  const feedback = profile_data.feedback || {};
  count(
    feedback.positiveResponses,
    'time you said an answer helped',
    'times you said an answer helped'
  );
  count(
    feedback.negativeResponses,
    'time you said an answer did not help',
    'times you said an answer did not help'
  );
  count(
    feedback.regenerateRequests,
    'time you asked for an answer to be written again',
    'times you asked for an answer to be written again'
  );
  count(
    feedback.complexityDecreases,
    'time you asked for something simpler',
    'times you asked for something simpler'
  );
  count(
    feedback.complexityIncreases,
    'time you asked for more detail',
    'times you asked for more detail'
  );

  // The tally AssisT reads as a learning style. The highest of these is what shapes an AI answer,
  // so it is shown as a count rather than as a label pinned on the student.
  const styles = profile_data.learningStyle || {};
  count(styles.visual, 'time a picture was the way in', 'times a picture was the way in');
  count(
    styles.stepByStep,
    'hint you took in a step-by-step walk-through',
    'hints you took in step-by-step walk-throughs'
  );
  count(styles.conceptual, 'time the big picture came first', 'times the big picture came first');
  count(styles.examples, 'worked example you asked for', 'worked examples you asked for');

  // The level last chosen per tool, which is what AssisT offers next time.
  const complexity = profile_data.complexity || {};
  const levelNames = {
    summarization: 'summaries',
    simplification: 'simpler wording',
    breakdown: 'task breakdowns',
    tutor: 'the tutor',
  };
  for (const [tool, level] of Object.entries(complexity)) {
    if (level && level !== 'moderate' && levelNames[tool]) {
      lines.push(`You last chose "${level}" for ${levelNames[tool]}`);
    }
  }

  return lines;
}

/**
 * What AssisT does with the record, in the same plain words as the record itself.
 * @returns {string}
 */
function profile_useSentence() {
  const complexity = profile_getRecommendedComplexity('default');
  const length =
    complexity === 'simple'
      ? 'shorter, simpler answers'
      : complexity === 'detailed'
        ? 'longer answers with more of the detail'
        : 'answers of about average length';

  const shape = {
    visual: ' It reaches for pictures and comparisons you can see.',
    stepByStep: ' It puts things in numbered steps.',
    conceptual: ' It gives you the big picture before the detail.',
    examples: ' It gives you a real example to go with the explanation.',
    balanced: '',
  }[profile_getDominantStyle()];

  return `Because of this, AssisT writes you ${length}.${shape || ''}`;
}

/**
 * Write the panel's contents: what was counted, what AssisT does with it, and where it is kept.
 *
 * Deliberately sentences rather than a grid of counters. The panel used to read as a developer's
 * dashboard — "Total Interactions", "Words Processed", "Learning Style: Conceptual Thinker" — which
 * is no use to a student deciding whether they are content to be recorded.
 */
function profile_renderContent() {
  if (!profile_panel || !profile_data) {
    return;
  }

  const content = profile_panel.querySelector('.assist-profile-content');
  if (!content) {
    return;
  }

  const lines = profile_recordLines();
  // "Never sent anywhere" was not true: with Personalised AI on, `profile-addendum.js` puts a
  // sentence about how this student likes things explained into every cloud AI prompt. The counts
  // themselves stay here; what they add up to does leave, and the panel now says so.
  const kept =
    'The counts above are kept on this device. One thing does leave it: while Personalised AI is ' +
    'on, a short line about how you like things explained — something like "prefers step-by-step, ' +
    'keep it short" — is sent with your question to whichever AI you have chosen. Nothing you read, ' +
    'typed or dictated, and none of these counts, is sent with it. Switch Personalised AI off in ' +
    'the AssisT popup and nothing about you leaves this device. You can delete the whole record at ' +
    'any time, from the popup or with the button below.';

  content.innerHTML = sanitizeHTML(`
    <p class="assist-profile-lead">
      ${
        lines.length === 0
          ? 'Nothing has been recorded yet. Once you start using the reading and writing tools, what you asked for will be listed here.'
          : 'This is everything AssisT has noticed about how you work.'
      }
    </p>

    ${
      lines.length > 0
        ? `<div class="assist-profile-section">
             <ul class="assist-profile-list">
               ${lines.map(line => `<li>${line}</li>`).join('')}
             </ul>
           </div>
           <div class="assist-profile-section">
             <p class="assist-profile-note">${profile_useSentence()}</p>
           </div>`
        : ''
    }

    <div class="assist-profile-section">
      <p class="assist-profile-note">${kept}</p>
    </div>
  `);
}

/**
 * Show the panel that says what has been recorded.
 *
 * Opened from the popup's "See what is recorded" button (over COGNITIVE_PROFILE_SHOW) and from the
 * window API. It is a modal dialog, so focus moves into it, Tab stays inside it, Escape shuts it
 * and focus goes back where it came from — `trapFocus` does all four.
 */
function profile_show() {
  if (!profile_settings.enabled || !profile_data) {
    // An empty panel would read as a broken feature. Say what is actually true instead.
    showToast?.(
      'Your record is switched off, so nothing is being kept about how you work. Turn it on in the ' +
        'AssisT popup to use it.'
    );
    return false;
  }

  if (!profile_panel) {
    profile_panel = profile_createPanel();
    document.body.appendChild(profile_panel);
  }
  profile_renderContent();
  profile_panel.style.display = 'flex';

  // A second open with the panel already up must not stack traps: the first is released before
  // the second is taken, so the "previously focused" element the student goes back to is theirs.
  profile_releaseFocus?.();
  profile_releaseFocus = trapFocus(profile_panel, {
    onEscape: profile_hide,
    initialFocus: profile_panel,
  });
  return true;
}

/**
 * Hide the profile panel
 */
function profile_hide() {
  if (profile_panel) {
    profile_panel.style.display = 'none';
  }
  // Releasing returns focus to whatever had it before the panel opened (SC 2.4.3).
  profile_releaseFocus?.();
  profile_releaseFocus = null;
}

/**
 * Take the panel out of the page altogether, releasing its focus trap first so focus lands
 * somewhere real rather than on a node that is no longer in the document.
 */
function profile_removePanel() {
  profile_releaseFocus?.();
  profile_releaseFocus = null;
  if (profile_panel) {
    profile_panel.remove();
    profile_panel = null;
  }
}

/**
 * An empty record, dated now.
 *
 * Deep-copied, because every counter on it is incremented in place: a shallow spread would have
 * `stats` and `feedback` pointing at DEFAULT_PROFILE, and the "defaults" would climb.
 *
 * @returns {Object}
 */
function profile_freshRecord() {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  fresh.meta.createdAt = new Date().toISOString();
  fresh.meta.lastUpdated = new Date().toISOString();
  return fresh;
}

/**
 * Reset profile to defaults
 */
async function profile_reset() {
  profile_data = profile_freshRecord();
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

/**
 * Forget the recorded profile, in storage and in memory.
 *
 * Called from the popup by message when the student asks for their record to be deleted, and
 * offered on the window API so the panel's own button and a test can reach the same path.
 *
 * @returns {Promise<string[]>} the storage keys that were removed
 */
async function profile_erase() {
  const removed = await eraseProfileData();
  profile_removePanel();
  // Deleting the record is not withdrawing consent. While the opt-in is still on, recording has to
  // carry on from empty: leaving this null stopped it until the page was reloaded, and made "See
  // what is recorded" answer that the record was switched off, which it was not.
  profile_data = profile_settings.enabled ? profile_freshRecord() : null;
  return removed;
}

/**
 * Apply a change to the opt-in, in a tab that is already open.
 *
 * Switching off has to take effect here and now — a student who withdraws consent and then keeps
 * reading must not have the rest of that page recorded — so the profile in memory goes with it.
 *
 * @param {Object} [next] - the stored settings object
 */
async function profile_applySettings(next) {
  const wasEnabled = profile_settings.enabled;
  Object.assign(profile_settings, next || {});
  profile_settings.enabled = next?.enabled === true;

  if (profile_settings.enabled && !wasEnabled) {
    await profile_load();
  } else if (!profile_settings.enabled && wasEnabled) {
    profile_data = null;
    // Taken out of the page rather than hidden: a panel of ours left in the student's document
    // after they switched the feature off is the thing "off" is supposed to mean.
    profile_removePanel();
  }
}

async function profile_initialize() {
  // The window API is registered whether or not the feature is on, so every consumer
  // (`profile-addendum.js`, the knowledge graph) keeps calling the same functions and simply gets
  // nothing back. An absent API would mean each of them needed its own fallback.
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
    erase: profile_erase,
    isEnabled: () => profile_settings.enabled,
    settings: profile_settings,
  };

  profile_settings.enabled = await isProfileEnabled();

  if (profile_settings.enabled) {
    await profile_load();
  }

  // Sent by the popup's "See what is recorded" button (profile-record-button.js). The panel belongs
  // to the page, not the popup: the popup closes itself once the page has answered, so focus can
  // move into the dialog.
  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'COGNITIVE_PROFILE_SHOW') {
      return false;
    }
    // Answered synchronously: nothing here awaits, and the popup needs the answer before it
    // closes itself.
    sendResponse(
      profile_show()
        ? { success: true }
        : {
            success: false,
            reason: 'Your record is switched off, so nothing is being kept about how you work.',
          }
    );
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }
    if (changes[PROFILE_SETTINGS_KEY]) {
      profile_applySettings(changes[PROFILE_SETTINGS_KEY].newValue);
    }
    // The popup deletes the record straight out of storage. Drop our copy of it, and — while the
    // opt-in is still on — start an empty one, so this tab keeps recording instead of going quiet
    // until it is reloaded.
    if (changes[STORAGE_KEY] && changes[STORAGE_KEY].newValue === undefined) {
      profile_data = profile_settings.enabled ? profile_freshRecord() : null;
      profile_removePanel();
    }
  });
}

// Auto-initialize
if (typeof window !== 'undefined') {
  profile_initialize();
}

export {
  profile_initialize,
  profile_erase,
  profile_getDominantStyle,
  profile_show,
  profile_hide,
  profile_get,
  profile_trackInteraction,
  profile_trackFeedback,
  profile_getRecommendedComplexity,
  profile_getPromptModifiers,
  profile_settings,
};
