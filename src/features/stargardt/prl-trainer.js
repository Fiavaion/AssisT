/**
 * Stargardt Module - PRL Training System
 *
 * Gamified exercises to strengthen Preferred Retinal Locus (PRL)
 * for improved peripheral vision utilization.
 *
 * Exercise Types:
 * 1. Fixation Trainer - Hold gaze on peripheral targets
 * 2. Saccade Practice - Quick eye movements to targets
 * 3. Letter Recognition - Identify letters in peripheral vision
 * 4. Crowding Reduction - Distinguish targets among distractors
 * 5. Reading Speed - Timed reading exercises
 *
 * @module stargardt/prl-trainer
 */

import * as scotomaProfile from './scotoma-profile.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'stargardt_prl_training';

const EXERCISE_TYPES = {
  FIXATION: 'fixation',
  SACCADE: 'saccade',
  LETTER: 'letter',
  CROWDING: 'crowding',
  READING: 'reading',
};

const DIFFICULTY_LEVELS = {
  1: { name: 'Beginner', distance: 100, duration: 3000, targetSize: 40 },
  2: { name: 'Easy', distance: 150, duration: 2500, targetSize: 35 },
  3: { name: 'Medium', distance: 200, duration: 2000, targetSize: 30 },
  4: { name: 'Hard', distance: 250, duration: 1500, targetSize: 25 },
  5: { name: 'Expert', distance: 300, duration: 1000, targetSize: 20 },
};

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I and O (too similar to 1 and 0)

// ============================================================================
// STATE
// ============================================================================

// let _trainer_profile = null; // Reserved for future use
let trainer_currentSession = null;
let trainer_sessionHistory = [];
let trainer_currentLevel = 1;
let trainer_prlPosition = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the PRL trainer
 *
 * @param {Object} profile - Scotoma profile
 */
export async function initialize(profile) {
  console.log('[PRLTrainer] Initializing...');

  trainer_profile = profile;

  // Calculate PRL position
  if (profile) {
    trainer_prlPosition = scotomaProfile.calculatePRLPosition(profile);
  } else {
    // Default PRL to right of center
    trainer_prlPosition = { x: 70, y: 50, direction: 'right' };
  }

  // Load training history
  await loadTrainingHistory();

  console.log('[PRLTrainer] Initialized at level', trainer_currentLevel);
}

/**
 * Load training history from storage
 */
async function loadTrainingHistory() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const data = result[STORAGE_KEY] || {};

    trainer_sessionHistory = data.sessions || [];
    trainer_currentLevel = data.currentLevel || 1;

    console.log(
      `[PRLTrainer] Loaded ${trainer_sessionHistory.length} sessions, level ${trainer_currentLevel}`
    );
  } catch (error) {
    console.error('[PRLTrainer] Failed to load history:', error);
  }
}

/**
 * Save training history to storage
 */
async function saveTrainingHistory() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        sessions: trainer_sessionHistory,
        currentLevel: trainer_currentLevel,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[PRLTrainer] Failed to save history:', error);
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Start a new training session
 *
 * @param {string} exerciseType - Type of exercise
 * @param {number} duration - Session duration in minutes
 * @returns {Object} Session object
 */
export function startSession(exerciseType, duration = 15) {
  trainer_currentSession = {
    id: generateSessionId(),
    type: exerciseType,
    level: trainer_currentLevel,
    startTime: Date.now(),
    duration: duration * 60 * 1000, // Convert to ms
    trials: [],
    correct: 0,
    incorrect: 0,
    totalReactionTime: 0,
    completed: false,
  };

  console.log(`[PRLTrainer] Started ${exerciseType} session at level ${trainer_currentLevel}`);
  return trainer_currentSession;
}

/**
 * Record a trial result
 *
 * @param {boolean} correct - Whether the response was correct
 * @param {number} reactionTime - Response time in ms
 * @param {Object} metadata - Additional trial data
 */
export function recordTrial(correct, reactionTime, metadata = {}) {
  if (!trainer_currentSession) {
    console.warn('[PRLTrainer] No active session');
    return;
  }

  trainer_currentSession.trials.push({
    timestamp: Date.now(),
    correct,
    reactionTime,
    ...metadata,
  });

  if (correct) {
    trainer_currentSession.correct++;
  } else {
    trainer_currentSession.incorrect++;
  }

  trainer_currentSession.totalReactionTime += reactionTime;
}

/**
 * End the current session
 *
 * @returns {Object} Session summary
 */
export async function endSession() {
  if (!trainer_currentSession) {
    return null;
  }

  trainer_currentSession.completed = true;
  trainer_currentSession.endTime = Date.now();

  // Calculate metrics
  const summary = calculateSessionSummary(trainer_currentSession);

  // Add to history
  trainer_sessionHistory.push({
    ...trainer_currentSession,
    summary,
  });

  // Check for level progression
  checkLevelProgression(summary);

  // Save history
  await saveTrainingHistory();

  const result = { ...trainer_currentSession, summary };
  trainer_currentSession = null;

  console.log('[PRLTrainer] Session ended:', summary);
  return result;
}

/**
 * Calculate session summary metrics
 */
function calculateSessionSummary(session) {
  const totalTrials = session.trials.length;
  const accuracy = totalTrials > 0 ? (session.correct / totalTrials) * 100 : 0;
  const avgReactionTime = totalTrials > 0 ? session.totalReactionTime / totalTrials : 0;

  // Calculate BCEA (Bivariate Contour Ellipse Area) estimate for fixation stability
  // In a real implementation, this would use actual gaze data
  const stabilityScore = calculateStabilityScore(session.trials);

  return {
    totalTrials,
    correct: session.correct,
    incorrect: session.incorrect,
    accuracy: Math.round(accuracy * 10) / 10,
    avgReactionTime: Math.round(avgReactionTime),
    stabilityScore,
    duration: session.endTime - session.startTime,
    level: session.level,
  };
}

/**
 * Calculate stability score from trials
 */
function calculateStabilityScore(trials) {
  if (trials.length < 5) {
    return 0;
  }

  // Use reaction time consistency as proxy for stability
  const reactionTimes = trials.map(t => t.reactionTime);
  const mean = reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length;
  const variance =
    reactionTimes.reduce((sum, rt) => sum + Math.pow(rt - mean, 2), 0) / reactionTimes.length;
  const stdDev = Math.sqrt(variance);

  // Convert to 0-100 score (lower stdDev = higher stability)
  const maxStdDev = 500; // ms
  const stability = Math.max(0, 100 - (stdDev / maxStdDev) * 100);

  return Math.round(stability);
}

/**
 * Check if user should level up
 */
function checkLevelProgression(summary) {
  // Level up criteria: 80%+ accuracy and stability score > 70
  if (summary.accuracy >= 80 && summary.stabilityScore >= 70) {
    if (trainer_currentLevel < 5) {
      trainer_currentLevel++;
      console.log(`[PRLTrainer] Level up! Now at level ${trainer_currentLevel}`);
      return true;
    }
  }

  // Level down if performance is poor
  if (summary.accuracy < 50 && trainer_currentLevel > 1) {
    trainer_currentLevel--;
    console.log(`[PRLTrainer] Level adjusted to ${trainer_currentLevel}`);
  }

  return false;
}

// ============================================================================
// EXERCISE GENERATORS
// ============================================================================

/**
 * Generate a fixation exercise trial
 *
 * @returns {Object} Trial configuration
 */
export function generateFixationTrial() {
  const level = DIFFICULTY_LEVELS[trainer_currentLevel];
  const prl = trainer_prlPosition;

  // Random position near PRL
  const angle = Math.random() * Math.PI * 2;
  const distance = (Math.random() * 0.5 + 0.5) * level.distance;

  return {
    type: EXERCISE_TYPES.FIXATION,
    targetX: prl.x + Math.cos(angle) * (distance / window.innerWidth) * 100,
    targetY: prl.y + Math.sin(angle) * (distance / window.innerHeight) * 100,
    targetSize: level.targetSize,
    holdDuration: level.duration,
    level: trainer_currentLevel,
  };
}

/**
 * Generate a saccade exercise trial
 *
 * @returns {Object} Trial configuration
 */
export function generateSaccadeTrial() {
  const level = DIFFICULTY_LEVELS[trainer_currentLevel];
  const prl = trainer_prlPosition;

  // Generate start and end positions
  const startAngle = Math.random() * Math.PI * 2;
  const endAngle = startAngle + Math.PI * (0.5 + Math.random()); // At least 90 degrees apart

  const startDistance = level.distance * 0.5;
  const endDistance = level.distance;

  return {
    type: EXERCISE_TYPES.SACCADE,
    startX: prl.x + Math.cos(startAngle) * (startDistance / window.innerWidth) * 100,
    startY: prl.y + Math.sin(startAngle) * (startDistance / window.innerHeight) * 100,
    endX: prl.x + Math.cos(endAngle) * (endDistance / window.innerWidth) * 100,
    endY: prl.y + Math.sin(endAngle) * (endDistance / window.innerHeight) * 100,
    targetSize: level.targetSize,
    timeLimit: level.duration,
    level: trainer_currentLevel,
  };
}

/**
 * Generate a letter recognition trial
 *
 * @returns {Object} Trial configuration
 */
export function generateLetterTrial() {
  const level = DIFFICULTY_LEVELS[trainer_currentLevel];
  const prl = trainer_prlPosition;

  // Random letter
  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];

  // Random position in PRL zone
  const angle = Math.random() * Math.PI * 2;
  const distance = level.distance * (0.5 + Math.random() * 0.5);

  // Generate distractors for higher levels
  const distractors = [];
  if (trainer_currentLevel >= 3) {
    const numDistractors = trainer_currentLevel - 2;
    for (let i = 0; i < numDistractors; i++) {
      distractors.push(LETTERS[Math.floor(Math.random() * LETTERS.length)]);
    }
  }

  return {
    type: EXERCISE_TYPES.LETTER,
    letter,
    x: prl.x + Math.cos(angle) * (distance / window.innerWidth) * 100,
    y: prl.y + Math.sin(angle) * (distance / window.innerHeight) * 100,
    fontSize: level.targetSize + 10,
    displayDuration: level.duration,
    distractors,
    level: trainer_currentLevel,
  };
}

/**
 * Generate a crowding reduction trial
 *
 * @returns {Object} Trial configuration
 */
export function generateCrowdingTrial() {
  const level = DIFFICULTY_LEVELS[trainer_currentLevel];
  const prl = trainer_prlPosition;

  // Target letter
  const targetLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];

  // Flanking letters (crowders)
  const numFlankers = 2 + trainer_currentLevel;
  const flankers = [];
  for (let i = 0; i < numFlankers; i++) {
    let flanker;
    do {
      flanker = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    } while (flanker === targetLetter);
    flankers.push(flanker);
  }

  // Position
  const angle = Math.random() * Math.PI * 2;
  const distance = level.distance;

  // Spacing between letters (decreases with level)
  const spacing = 40 - trainer_currentLevel * 5;

  return {
    type: EXERCISE_TYPES.CROWDING,
    targetLetter,
    flankers,
    x: prl.x + Math.cos(angle) * (distance / window.innerWidth) * 100,
    y: prl.y + Math.sin(angle) * (distance / window.innerHeight) * 100,
    fontSize: level.targetSize + 5,
    spacing,
    displayDuration: level.duration + 500, // Extra time for crowded display
    level: trainer_currentLevel,
  };
}

/**
 * Generate a reading speed trial
 *
 * @returns {Object} Trial configuration
 */
export function generateReadingTrial() {
  // const _level = DIFFICULTY_LEVELS[trainer_currentLevel]; // Reserved for future use

  // Sample sentences of varying difficulty
  const sentences = [
    ['The cat sat on the mat.', 'Quick brown fox jumps.'],
    ['Reading helps improve focus and concentration skills.', 'Practice makes progress over time.'],
    [
      'Peripheral vision can be trained through consistent daily exercises.',
      'Visual rehabilitation requires patience and dedication.',
    ],
    [
      'Research shows that perceptual learning significantly improves eccentric reading abilities.',
      'Systematic training protocols demonstrate measurable functional vision improvements.',
    ],
    [
      'The neuroplasticity of the visual cortex enables remarkable adaptation to central vision loss through targeted rehabilitation.',
      'Evidence-based interventions combining oculomotor and perceptual training optimize preferred retinal locus development.',
    ],
  ];

  const levelSentences = sentences[Math.min(trainer_currentLevel - 1, sentences.length - 1)];
  const sentence = levelSentences[Math.floor(Math.random() * levelSentences.length)];

  return {
    type: EXERCISE_TYPES.READING,
    sentence,
    prlPosition: trainer_prlPosition,
    fontSize: 24 - trainer_currentLevel * 2,
    timeLimit: sentence.length * (200 - trainer_currentLevel * 20), // ms per character
    level: trainer_currentLevel,
  };
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get training statistics
 *
 * @returns {Object} Training statistics
 */
export function getStatistics() {
  const totalSessions = trainer_sessionHistory.length;

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      totalTime: 0,
      currentLevel: trainer_currentLevel,
      averageAccuracy: 0,
      averageStability: 0,
      streak: 0,
      lastSession: null,
    };
  }

  // Calculate aggregates
  let totalTime = 0;
  let totalAccuracy = 0;
  let totalStability = 0;
  let streak = 0;

  // Calculate streak (consecutive days)
  const sessionDates = trainer_sessionHistory.map(s => new Date(s.startTime).toDateString());
  const uniqueDates = [...new Set(sessionDates)].sort().reverse();
  const today = new Date().toDateString();

  if (
    uniqueDates[0] === today ||
    uniqueDates[0] === new Date(Date.now() - 86400000).toDateString()
  ) {
    streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(uniqueDates[i - 1]);
      const currDate = new Date(uniqueDates[i]);
      const diffDays = Math.round((prevDate - currDate) / 86400000);
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
  }

  trainer_sessionHistory.forEach(session => {
    if (session.summary) {
      totalTime += session.summary.duration || 0;
      totalAccuracy += session.summary.accuracy || 0;
      totalStability += session.summary.stabilityScore || 0;
    }
  });

  return {
    totalSessions,
    totalTime: Math.round(totalTime / 60000), // Convert to minutes
    currentLevel: trainer_currentLevel,
    averageAccuracy: Math.round(totalAccuracy / totalSessions),
    averageStability: Math.round(totalStability / totalSessions),
    streak,
    lastSession: trainer_sessionHistory[trainer_sessionHistory.length - 1],
    byExerciseType: getStatsByExerciseType(),
  };
}

/**
 * Get statistics grouped by exercise type
 */
function getStatsByExerciseType() {
  const byType = {};

  Object.values(EXERCISE_TYPES).forEach(type => {
    const sessions = trainer_sessionHistory.filter(s => s.type === type);
    if (sessions.length > 0) {
      byType[type] = {
        sessions: sessions.length,
        avgAccuracy: Math.round(
          sessions.reduce((sum, s) => sum + (s.summary?.accuracy || 0), 0) / sessions.length
        ),
        bestAccuracy: Math.max(...sessions.map(s => s.summary?.accuracy || 0)),
      };
    }
  });

  return byType;
}

/**
 * Get progress over time
 *
 * @param {number} days - Number of days to look back
 * @returns {Array} Progress data points
 */
export function getProgressOverTime(days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recentSessions = trainer_sessionHistory.filter(s => s.startTime > cutoff);

  // Group by date
  const byDate = {};
  recentSessions.forEach(session => {
    const date = new Date(session.startTime).toISOString().split('T')[0];
    if (!byDate[date]) {
      byDate[date] = { accuracy: [], stability: [], sessions: 0 };
    }
    if (session.summary) {
      byDate[date].accuracy.push(session.summary.accuracy);
      byDate[date].stability.push(session.summary.stabilityScore);
      byDate[date].sessions++;
    }
  });

  // Calculate daily averages
  return Object.entries(byDate).map(([date, data]) => ({
    date,
    avgAccuracy: Math.round(data.accuracy.reduce((a, b) => a + b, 0) / data.accuracy.length),
    avgStability: Math.round(data.stability.reduce((a, b) => a + b, 0) / data.stability.length),
    sessions: data.sessions,
  }));
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generate unique session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current level
 */
export function getCurrentLevel() {
  return trainer_currentLevel;
}

/**
 * Get level info
 */
export function getLevelInfo(level = trainer_currentLevel) {
  return DIFFICULTY_LEVELS[level] || DIFFICULTY_LEVELS[1];
}

/**
 * Get all exercise types
 */
export function getExerciseTypes() {
  return EXERCISE_TYPES;
}

/**
 * Get PRL position
 */
export function getPRLPosition() {
  return trainer_prlPosition;
}

/**
 * Check if there's an active session
 */
export function hasActiveSession() {
  return trainer_currentSession !== null;
}

/**
 * Get active session info
 */
export function getActiveSession() {
  return trainer_currentSession;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initialize,
  startSession,
  recordTrial,
  endSession,
  generateFixationTrial,
  generateSaccadeTrial,
  generateLetterTrial,
  generateCrowdingTrial,
  generateReadingTrial,
  getStatistics,
  getProgressOverTime,
  getCurrentLevel,
  getLevelInfo,
  getExerciseTypes,
  getPRLPosition,
  hasActiveSession,
  getActiveSession,
  EXERCISE_TYPES,
  DIFFICULTY_LEVELS,
};
