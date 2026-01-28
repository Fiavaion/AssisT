/**
 * Recommendation Engine
 * Calculates feature scores based on quiz responses
 * and generates personalized recommendations
 */

import { QUESTIONS, FEATURES, CATEGORIES } from './questions.js';

/**
 * Score thresholds for recommendation tiers
 */
const THRESHOLDS = {
  STRONG_MATCH: 70,
  GOOD_MATCH: 40,
  POSSIBLE_MATCH: 20,
};

/**
 * Preset profiles that match Quick Start presets in popup
 * Each preset maps to specific features and has scoring criteria
 */
export const PRESETS = {
  'ADHD Focus': {
    id: 'adhd-focus',
    name: 'ADHD Focus',
    icon: '🎯',
    description: 'Enables features to help with focus, attention, and working in timed bursts.',
    features: [
      'focusModeEnabled',
      'pomodoroEnabled',
      'reducedMotionEnabled',
      'mediaControlEnabled',
      'readingProgressEnabled',
    ],
    // Score weights: which question categories contribute to this preset
    scoreWeights: {
      focus: 3, // Primary - highest weight
      reading: 1,
      visual: 1,
    },
  },
  'Dyslexia Support': {
    id: 'dyslexia-support',
    name: 'Dyslexia Support',
    icon: '📖',
    description:
      'Enables text-to-speech, dyslexia-friendly fonts, reading guides, and visual aids.',
    features: [
      'ttsEnabled',
      'dyslexiaEnabled',
      'readingGuideEnabled',
      'readingModeEnabled',
      'textCustomizationEnabled',
    ],
    scoreWeights: {
      reading: 3, // Primary
      visual: 2,
      language: 1,
    },
  },
  'Sensory Sensitive': {
    id: 'sensory-sensitive',
    name: 'Sensory Sensitive',
    icon: '🌙',
    description: 'Reduces visual strain with dark mode, color overlays, and motion reduction.',
    features: [
      'darkModeEnabled',
      'screenOverlayEnabled',
      'reducedMotionEnabled',
      'mediaControlEnabled',
      'focusModeEnabled',
    ],
    scoreWeights: {
      visual: 3, // Primary
      focus: 2,
    },
  },
};

/**
 * Calculate which preset best matches the user's quiz responses
 * @param {Object} responses - Quiz responses { primary: {}, sub: {} }
 * @returns {Object|null} Best matching preset or null if no strong match
 */
export function calculateBestPreset(responses) {
  const presetScores = {};

  // Calculate score for each preset based on question responses
  Object.entries(PRESETS).forEach(([presetName, preset]) => {
    let score = 0;
    let maxPossible = 0;

    Object.entries(preset.scoreWeights).forEach(([questionId, weight]) => {
      const answer = responses.primary[questionId] || 0;
      score += answer * weight;
      maxPossible += 3 * weight; // Max answer is 3
    });

    // Normalize to 0-100
    presetScores[presetName] = maxPossible > 0 ? Math.round((score / maxPossible) * 100) : 0;
  });

  // Find the best matching preset (must be above threshold)
  const threshold = 40; // At least 40% match to recommend
  let bestPreset = null;
  let bestScore = 0;

  Object.entries(presetScores).forEach(([presetName, score]) => {
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestPreset = {
        ...PRESETS[presetName],
        matchScore: score,
      };
    }
  });

  return bestPreset;
}

/**
 * Calculate feature scores from quiz responses
 * @param {Object} responses - User's quiz responses
 * @param {Object} responses.primary - Primary question answers { questionId: answerValue }
 * @param {Object} responses.sub - Sub-question answers { subQuestionId: boolean }
 * @returns {Object} Feature scores { featureId: score (0-100) }
 */
export function calculateScores(responses) {
  const scores = {};

  // Initialize all features with 0
  Object.keys(FEATURES).forEach(featureId => {
    scores[featureId] = 0;
  });

  // Process each question's responses
  QUESTIONS.forEach(question => {
    const primaryAnswer = responses.primary[question.id] || 0;

    // Apply primary question scores
    // Score multiplier based on answer: 0=0, 1=1, 2=2, 3=3
    Object.entries(question.featureMapping).forEach(([featureId, weight]) => {
      scores[featureId] += primaryAnswer * weight;
    });

    // Apply sub-question bonuses
    if (question.subQuestions && responses.sub) {
      question.subQuestions.forEach(subQ => {
        if (responses.sub[subQ.id]) {
          Object.entries(subQ.featureBoost).forEach(([featureId, boost]) => {
            scores[featureId] += boost;
          });
        }
      });
    }
  });

  // Normalize scores to 0-100 scale
  // Max possible score calculation: 3 (max answer) * sum of all weights + all sub-question boosts
  const normalizedScores = {};
  const maxPossibleBase = 9; // 3 * 3 for primary weight
  const maxPossibleBoost = 9; // roughly max sub-question boosts per feature

  Object.entries(scores).forEach(([featureId, rawScore]) => {
    // Normalize to 0-100, capping at 100
    const normalized = Math.min(
      100,
      Math.round((rawScore / (maxPossibleBase + maxPossibleBoost)) * 100)
    );
    normalizedScores[featureId] = normalized;
  });

  return normalizedScores;
}

/**
 * Generate recommendations from scores
 * @param {Object} scores - Normalized feature scores
 * @returns {Array} Sorted recommendations with tier classifications
 */
export function generateRecommendations(scores) {
  const recommendations = [];

  Object.entries(scores).forEach(([featureId, score]) => {
    if (score >= THRESHOLDS.POSSIBLE_MATCH) {
      const feature = FEATURES[featureId];
      if (!feature) {
        return;
      }

      let tier, tierLabel;
      if (score >= THRESHOLDS.STRONG_MATCH) {
        tier = 'strong';
        tierLabel = 'Highly Recommended';
      } else if (score >= THRESHOLDS.GOOD_MATCH) {
        tier = 'good';
        tierLabel = 'Recommended';
      } else {
        tier = 'possible';
        tierLabel = 'You might like';
      }

      recommendations.push({
        ...feature,
        score,
        tier,
        tierLabel,
        category: CATEGORIES[feature.category],
      });
    }
  });

  // Sort by score descending, then by tier
  return recommendations.sort((a, b) => {
    if (a.tier !== b.tier) {
      const tierOrder = { strong: 0, good: 1, possible: 2 };
      return tierOrder[a.tier] - tierOrder[b.tier];
    }
    return b.score - a.score;
  });
}

/**
 * Get top recommendations limited by count
 * @param {Object} scores - Feature scores
 * @param {number} maxCount - Maximum recommendations to return
 * @returns {Array} Top recommendations
 */
export function getTopRecommendations(scores, maxCount = 6) {
  const all = generateRecommendations(scores);
  return all.slice(0, maxCount);
}

/**
 * Group recommendations by category
 * @param {Array} recommendations - List of recommendations
 * @returns {Object} Recommendations grouped by category
 */
export function groupByCategory(recommendations) {
  const grouped = {};

  recommendations.forEach(rec => {
    const categoryId = rec.category?.name || 'Other';
    if (!grouped[categoryId]) {
      grouped[categoryId] = [];
    }
    grouped[categoryId].push(rec);
  });

  return grouped;
}

/**
 * Create a feature profile from quiz results
 * @param {Object} scores - Feature scores
 * @returns {Object} Profile object for storage
 */
export function createProfile(scores) {
  const recommendations = generateRecommendations(scores);

  // Features to enable (strong + good matches)
  const enabledFeatures = recommendations
    .filter(r => r.tier === 'strong' || r.tier === 'good')
    .map(r => r.settingKey);

  return {
    createdAt: new Date().toISOString(),
    scores,
    recommendations: recommendations.map(r => ({
      id: r.id,
      score: r.score,
      tier: r.tier,
    })),
    enabledFeatures,
  };
}

/**
 * Apply profile settings to Chrome storage
 * @param {Object} profile - Profile from createProfile()
 * @returns {Promise<void>}
 */
export async function applyProfile(profile) {
  const settings = {};

  profile.enabledFeatures.forEach(settingKey => {
    settings[settingKey] = true;
  });

  // Save to Chrome storage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await chrome.storage.local.set({
      discoveryProfile: profile,
      ...settings,
    });
  }
}

/**
 * Check if user has completed discovery quiz
 * @returns {Promise<boolean>}
 */
export async function hasCompletedDiscovery() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    const result = await chrome.storage.local.get('discoveryProfile');
    return !!result.discoveryProfile;
  }
  return false;
}

/**
 * Get existing discovery profile
 * @returns {Promise<Object|null>}
 */
export async function getExistingProfile() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    const result = await chrome.storage.local.get('discoveryProfile');
    return result.discoveryProfile || null;
  }
  return null;
}

/**
 * Clear discovery profile
 * @returns {Promise<void>}
 */
export async function clearProfile() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await chrome.storage.local.remove('discoveryProfile');
  }
}

/**
 * Apply a preset profile to Chrome storage
 * @param {Object} preset - Preset from PRESETS or calculateBestPreset()
 * @returns {Promise<void>}
 */
export async function applyPreset(preset) {
  const settings = {};

  // Enable all features in the preset
  preset.features.forEach(settingKey => {
    settings[settingKey] = true;
  });

  // Save to Chrome storage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await chrome.storage.local.set({
      discoveryPreset: preset.name,
      ...settings,
    });
  }
}
