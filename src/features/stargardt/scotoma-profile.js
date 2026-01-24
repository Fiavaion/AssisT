/**
 * Stargardt Module - Scotoma Profile Manager
 *
 * Manages scotoma shape, size, position data and profile versioning
 * for tracking disease progression over time.
 *
 * @module stargardt/scotoma-profile
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'stargardt_scotoma_profiles';
const CURRENT_PROFILE_KEY = 'stargardt_current_profile';
const REASSESSMENT_KEY = 'stargardt_reassessment_state';
const VISION_DIARY_KEY = 'stargardt_vision_diary';
const PROFILE_VERSION = 1;

// Reassessment configuration
const REASSESSMENT_INTERVAL_DAYS = 30; // Monthly reassessment
const DRIFT_THRESHOLD_PERCENT = 5; // Significant change threshold
const MICRO_CALIBRATION_INTERVAL_DAYS = 7; // Weekly micro-checks

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * @typedef {Object} ScotomaPoint
 * @property {number} x - X coordinate (0-100 percentage)
 * @property {number} y - Y coordinate (0-100 percentage)
 */

/**
 * @typedef {Object} ScotomaBoundary
 * @property {string} shape - 'ellipse', 'circle', 'irregular'
 * @property {number} centerX - Center X position (0-100 percentage)
 * @property {number} centerY - Center Y position (0-100 percentage)
 * @property {number} radiusX - Horizontal radius (percentage of viewport)
 * @property {number} radiusY - Vertical radius (percentage of viewport)
 * @property {ScotomaPoint[]} [irregularPoints] - Points for irregular shapes
 */

/**
 * @typedef {Object} ScotomaProfile
 * @property {string} id - Unique profile identifier
 * @property {number} version - Profile schema version
 * @property {string} createdAt - ISO date string
 * @property {string} updatedAt - ISO date string
 * @property {string} source - 'manual', 'calibrated', 'imported'
 * @property {ScotomaBoundary} boundary - Scotoma boundary definition
 * @property {Object} metadata - Additional profile metadata
 * @property {string} [metadata.notes] - User notes
 * @property {number} [metadata.confidenceScore] - Calibration confidence (0-100)
 * @property {string} [metadata.eye] - 'left', 'right', 'both'
 */

// ============================================================================
// PROFILE CREATION
// ============================================================================

/**
 * Create a new scotoma profile from manual settings
 * @param {Object} settings - Manual scotoma settings from user
 * @returns {ScotomaProfile}
 */
export function createFromSettings(settings) {
  const now = new Date().toISOString();

  return {
    id: generateProfileId(),
    version: PROFILE_VERSION,
    createdAt: now,
    updatedAt: now,
    source: 'manual',
    boundary: {
      shape: settings.shape || 'ellipse',
      centerX: settings.centerX ?? 50,
      centerY: settings.centerY ?? 50,
      radiusX: settings.radiusX ?? 10,
      radiusY: settings.radiusY ?? 10,
      irregularPoints: settings.irregularPoints || null,
    },
    metadata: {
      notes: settings.notes || '',
      confidenceScore: null,
      eye: settings.eye || 'both',
    },
  };
}

/**
 * Create a new scotoma profile from calibration data
 * @param {Object} calibrationResult - Result from calibration process
 * @returns {ScotomaProfile}
 */
export function createFromCalibration(calibrationResult) {
  const now = new Date().toISOString();

  return {
    id: generateProfileId(),
    version: PROFILE_VERSION,
    createdAt: now,
    updatedAt: now,
    source: 'calibrated',
    boundary: {
      shape: calibrationResult.shape || 'ellipse',
      centerX: calibrationResult.centerX,
      centerY: calibrationResult.centerY,
      radiusX: calibrationResult.radiusX,
      radiusY: calibrationResult.radiusY,
      irregularPoints: calibrationResult.irregularPoints || null,
    },
    metadata: {
      notes: '',
      confidenceScore: calibrationResult.confidence || 0,
      eye: calibrationResult.eye || 'both',
    },
  };
}

/**
 * Create default profile for users who skip calibration
 * @returns {ScotomaProfile}
 */
export function createDefault() {
  const now = new Date().toISOString();

  return {
    id: generateProfileId(),
    version: PROFILE_VERSION,
    createdAt: now,
    updatedAt: now,
    source: 'manual',
    boundary: {
      shape: 'ellipse',
      centerX: 50,
      centerY: 50,
      radiusX: 8,
      radiusY: 8,
      irregularPoints: null,
    },
    metadata: {
      notes: 'Default profile - adjust settings for your needs',
      confidenceScore: null,
      eye: 'both',
    },
  };
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

/**
 * Save a scotoma profile to storage
 * @param {ScotomaProfile} profile
 * @returns {Promise<void>}
 */
export async function save(profile) {
  try {
    // Update timestamp
    profile.updatedAt = new Date().toISOString();

    // Get existing profiles
    const profiles = await getAllProfiles();

    // Check if this is an update or new profile
    const existingIndex = profiles.findIndex(p => p.id === profile.id);
    if (existingIndex >= 0) {
      profiles[existingIndex] = profile;
    } else {
      profiles.push(profile);
    }

    // Save profiles
    await chrome.storage.local.set({
      [STORAGE_KEY]: profiles,
      [CURRENT_PROFILE_KEY]: profile.id,
    });

    console.log('[ScotomaProfile] Saved profile:', profile.id);
  } catch (error) {
    console.error('[ScotomaProfile] Error saving profile:', error);
    throw error;
  }
}

/**
 * Load the current active scotoma profile
 * @returns {Promise<ScotomaProfile|null>}
 */
export async function loadSaved() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, CURRENT_PROFILE_KEY]);

    const profiles = result[STORAGE_KEY] || [];
    const currentId = result[CURRENT_PROFILE_KEY];

    if (!currentId || profiles.length === 0) {
      return null;
    }

    const profile = profiles.find(p => p.id === currentId);
    return profile || null;
  } catch (error) {
    console.error('[ScotomaProfile] Error loading profile:', error);
    return null;
  }
}

/**
 * Get all saved profiles (for progression tracking)
 * @returns {Promise<ScotomaProfile[]>}
 */
export async function getAllProfiles() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  } catch (error) {
    console.error('[ScotomaProfile] Error getting profiles:', error);
    return [];
  }
}

/**
 * Delete a profile by ID
 * @param {string} profileId
 * @returns {Promise<void>}
 */
export async function deleteProfile(profileId) {
  try {
    const profiles = await getAllProfiles();
    const filtered = profiles.filter(p => p.id !== profileId);

    await chrome.storage.local.set({
      [STORAGE_KEY]: filtered,
    });

    console.log('[ScotomaProfile] Deleted profile:', profileId);
  } catch (error) {
    console.error('[ScotomaProfile] Error deleting profile:', error);
    throw error;
  }
}

/**
 * Set the active profile by ID
 * @param {string} profileId
 * @returns {Promise<void>}
 */
export async function setActiveProfile(profileId) {
  await chrome.storage.local.set({
    [CURRENT_PROFILE_KEY]: profileId,
  });
  console.log('[ScotomaProfile] Set active profile:', profileId);
}

// ============================================================================
// PROFILE ANALYSIS
// ============================================================================

/**
 * Check if a point is within the scotoma region
 * @param {ScotomaProfile} profile
 * @param {number} x - X coordinate (0-100 percentage)
 * @param {number} y - Y coordinate (0-100 percentage)
 * @returns {boolean}
 */
export function isPointInScotoma(profile, x, y) {
  const { boundary } = profile;

  if (boundary.shape === 'circle' || boundary.shape === 'ellipse') {
    // Ellipse equation: ((x-cx)/rx)^2 + ((y-cy)/ry)^2 <= 1
    const dx = (x - boundary.centerX) / boundary.radiusX;
    const dy = (y - boundary.centerY) / boundary.radiusY;
    return dx * dx + dy * dy <= 1;
  }

  if (boundary.shape === 'irregular' && boundary.irregularPoints) {
    return isPointInPolygon(x, y, boundary.irregularPoints);
  }

  return false;
}

/**
 * Get the safe zone (area outside scotoma) for content placement
 * @param {ScotomaProfile} profile
 * @param {string} preferredSide - 'left', 'right', 'above', 'below'
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function getSafeZone(profile, preferredSide = 'right') {
  const { boundary } = profile;
  const margin = 2; // Buffer margin in percentage

  switch (preferredSide) {
    case 'left':
      return {
        x: 0,
        y: 0,
        width: boundary.centerX - boundary.radiusX - margin,
        height: 100,
      };
    case 'right':
      return {
        x: boundary.centerX + boundary.radiusX + margin,
        y: 0,
        width: 100 - (boundary.centerX + boundary.radiusX + margin),
        height: 100,
      };
    case 'above':
      return {
        x: 0,
        y: 0,
        width: 100,
        height: boundary.centerY - boundary.radiusY - margin,
      };
    case 'below':
      return {
        x: 0,
        y: boundary.centerY + boundary.radiusY + margin,
        width: 100,
        height: 100 - (boundary.centerY + boundary.radiusY + margin),
      };
    default:
      return { x: 0, y: 0, width: 100, height: 100 };
  }
}

/**
 * Calculate the optimal PRL (Preferred Retinal Locus) position
 * @param {ScotomaProfile} profile
 * @returns {{x: number, y: number, direction: string}}
 */
export function calculatePRLPosition(profile) {
  const { boundary } = profile;

  // Determine best direction based on scotoma position
  // If scotoma is left of center, PRL is right, etc.
  let direction = 'right';
  let x = boundary.centerX + boundary.radiusX + 5;
  let y = boundary.centerY;

  if (boundary.centerX > 60) {
    direction = 'left';
    x = boundary.centerX - boundary.radiusX - 5;
  } else if (boundary.centerY > 60) {
    direction = 'above';
    x = boundary.centerX;
    y = boundary.centerY - boundary.radiusY - 5;
  } else if (boundary.centerY < 40) {
    direction = 'below';
    x = boundary.centerX;
    y = boundary.centerY + boundary.radiusY + 5;
  }

  return { x, y, direction };
}

// ============================================================================
// PROGRESSION TRACKING
// ============================================================================

/**
 * Compare two profiles to detect progression
 * @param {ScotomaProfile} oldProfile
 * @param {ScotomaProfile} newProfile
 * @returns {Object} Comparison results
 */
export function compareProfiles(oldProfile, newProfile) {
  const oldBoundary = oldProfile.boundary;
  const newBoundary = newProfile.boundary;

  // Calculate area change
  const oldArea = Math.PI * oldBoundary.radiusX * oldBoundary.radiusY;
  const newArea = Math.PI * newBoundary.radiusX * newBoundary.radiusY;
  const areaChange = ((newArea - oldArea) / oldArea) * 100;

  // Calculate position shift
  const positionShift = Math.sqrt(
    Math.pow(newBoundary.centerX - oldBoundary.centerX, 2) +
      Math.pow(newBoundary.centerY - oldBoundary.centerY, 2)
  );

  // Time between profiles
  const daysBetween = Math.floor(
    (new Date(newProfile.createdAt) - new Date(oldProfile.createdAt)) / (1000 * 60 * 60 * 24)
  );

  return {
    areaChangePercent: areaChange.toFixed(1),
    positionShiftPercent: positionShift.toFixed(1),
    daysBetween,
    increased: areaChange > 5,
    decreased: areaChange < -5,
    stable: Math.abs(areaChange) <= 5,
    significantShift: positionShift > 3,
  };
}

/**
 * Get progression history
 * @returns {Promise<Object[]>} Array of profile comparisons
 */
export async function getProgressionHistory() {
  const profiles = await getAllProfiles();

  if (profiles.length < 2) {
    return [];
  }

  // Sort by creation date
  const sorted = profiles.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Compare consecutive profiles
  const history = [];
  for (let i = 1; i < sorted.length; i++) {
    history.push({
      fromDate: sorted[i - 1].createdAt,
      toDate: sorted[i].createdAt,
      comparison: compareProfiles(sorted[i - 1], sorted[i]),
    });
  }

  return history;
}

// ============================================================================
// EXPORT / IMPORT
// ============================================================================

/**
 * Export profile data for medical professionals
 * @param {ScotomaProfile} profile
 * @returns {string} JSON string
 */
export function exportProfile(profile) {
  const exportData = {
    exportVersion: 1,
    exportDate: new Date().toISOString(),
    profile: profile,
    application: 'AssisT Browser Extension',
    type: 'scotoma_profile',
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import profile from exported data
 * @param {string} jsonString
 * @returns {ScotomaProfile|null}
 */
export function importProfile(jsonString) {
  try {
    const data = JSON.parse(jsonString);

    if (data.type !== 'scotoma_profile') {
      console.error('[ScotomaProfile] Invalid profile type');
      return null;
    }

    // Create new profile with imported data but new ID
    const profile = {
      ...data.profile,
      id: generateProfileId(),
      source: 'imported',
      updatedAt: new Date().toISOString(),
    };

    return profile;
  } catch (error) {
    console.error('[ScotomaProfile] Import error:', error);
    return null;
  }
}

// ============================================================================
// REASSESSMENT & DRIFT DETECTION
// ============================================================================

/**
 * @typedef {Object} ReassessmentState
 * @property {string} lastFullAssessment - ISO date of last full calibration
 * @property {string} lastMicroCheck - ISO date of last micro-calibration
 * @property {string} baselineProfileId - ID of baseline profile for comparison
 * @property {number} microChecksDone - Number of micro-checks since full assessment
 * @property {boolean} driftDetected - Whether significant drift has been detected
 * @property {Object} driftDetails - Details of detected drift
 */

/**
 * Get the current reassessment state
 * @returns {Promise<ReassessmentState|null>}
 */
export async function getReassessmentState() {
  try {
    const result = await chrome.storage.local.get(REASSESSMENT_KEY);
    return result[REASSESSMENT_KEY] || null;
  } catch (error) {
    console.error('[ScotomaProfile] Error getting reassessment state:', error);
    return null;
  }
}

/**
 * Update the reassessment state
 * @param {Partial<ReassessmentState>} updates
 * @returns {Promise<void>}
 */
export async function updateReassessmentState(updates) {
  try {
    const current = (await getReassessmentState()) || {
      lastFullAssessment: null,
      lastMicroCheck: null,
      baselineProfileId: null,
      microChecksDone: 0,
      driftDetected: false,
      driftDetails: null,
    };

    const updated = { ...current, ...updates };
    await chrome.storage.local.set({ [REASSESSMENT_KEY]: updated });
    console.log('[ScotomaProfile] Updated reassessment state');
  } catch (error) {
    console.error('[ScotomaProfile] Error updating reassessment state:', error);
    throw error;
  }
}

/**
 * Mark a full assessment as complete
 * @param {string} profileId - The new profile ID from assessment
 * @returns {Promise<void>}
 */
export async function recordFullAssessment(profileId) {
  const now = new Date().toISOString();
  await updateReassessmentState({
    lastFullAssessment: now,
    lastMicroCheck: now,
    baselineProfileId: profileId,
    microChecksDone: 0,
    driftDetected: false,
    driftDetails: null,
  });
}

/**
 * Record a micro-calibration check
 * @param {Object} _checkResult - Result from micro-calibration
 * @returns {Promise<{driftDetected: boolean, driftDetails: Object|null}>}
 */
export async function recordMicroCheck(_checkResult) {
  const state = await getReassessmentState();
  const currentProfile = await loadSaved();
  const baselineProfile = state?.baselineProfileId
    ? (await getAllProfiles()).find(p => p.id === state.baselineProfileId)
    : null;

  let driftDetected = false;
  let driftDetails = null;

  if (baselineProfile && currentProfile) {
    const comparison = compareProfiles(baselineProfile, currentProfile);

    // Check for significant drift
    if (
      Math.abs(parseFloat(comparison.areaChangePercent)) > DRIFT_THRESHOLD_PERCENT ||
      comparison.significantShift
    ) {
      driftDetected = true;
      driftDetails = {
        areaChange: comparison.areaChangePercent,
        positionShift: comparison.positionShiftPercent,
        daysSinceBaseline: comparison.daysBetween,
        detectedAt: new Date().toISOString(),
      };
    }
  }

  await updateReassessmentState({
    lastMicroCheck: new Date().toISOString(),
    microChecksDone: (state?.microChecksDone || 0) + 1,
    driftDetected,
    driftDetails,
  });

  return { driftDetected, driftDetails };
}

/**
 * Check if reassessment is due
 * @returns {Promise<{fullAssessmentDue: boolean, microCheckDue: boolean, daysSinceFullAssessment: number, daysSinceMicroCheck: number}>}
 */
export async function checkReassessmentDue() {
  const state = await getReassessmentState();
  const now = new Date();

  let daysSinceFullAssessment = Infinity;
  let daysSinceMicroCheck = Infinity;

  if (state?.lastFullAssessment) {
    daysSinceFullAssessment = Math.floor(
      (now - new Date(state.lastFullAssessment)) / (1000 * 60 * 60 * 24)
    );
  }

  if (state?.lastMicroCheck) {
    daysSinceMicroCheck = Math.floor(
      (now - new Date(state.lastMicroCheck)) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    fullAssessmentDue: daysSinceFullAssessment >= REASSESSMENT_INTERVAL_DAYS,
    microCheckDue: daysSinceMicroCheck >= MICRO_CALIBRATION_INTERVAL_DAYS,
    daysSinceFullAssessment,
    daysSinceMicroCheck,
  };
}

/**
 * Get recommended action based on current state
 * @returns {Promise<{action: string, reason: string, urgency: string}>}
 */
export async function getRecommendedAction() {
  const state = await getReassessmentState();
  const reassessmentStatus = await checkReassessmentDue();

  // Check for drift first (highest priority)
  if (state?.driftDetected) {
    return {
      action: 'full_assessment',
      reason: `Significant change detected in your scotoma profile (${state.driftDetails?.areaChange}% area change)`,
      urgency: 'high',
    };
  }

  // Full assessment due
  if (reassessmentStatus.fullAssessmentDue) {
    return {
      action: 'full_assessment',
      reason: `It's been ${reassessmentStatus.daysSinceFullAssessment} days since your last full assessment`,
      urgency: 'medium',
    };
  }

  // Micro-check due
  if (reassessmentStatus.microCheckDue) {
    return {
      action: 'micro_check',
      reason: `Weekly vision check is due (${reassessmentStatus.daysSinceMicroCheck} days since last check)`,
      urgency: 'low',
    };
  }

  return {
    action: 'none',
    reason: 'Your profile is up to date',
    urgency: 'none',
  };
}

// ============================================================================
// VISION DIARY
// ============================================================================

/**
 * @typedef {Object} VisionDiaryEntry
 * @property {string} id - Unique entry ID
 * @property {string} timestamp - ISO date string
 * @property {number} qualityRating - Subjective quality 1-5
 * @property {string[]} symptoms - List of symptoms experienced
 * @property {string} notes - Free-form notes
 * @property {Object} context - Environmental context
 * @property {string} context.lighting - 'dim', 'normal', 'bright'
 * @property {string} context.activity - What user was doing
 * @property {number} context.screenTime - Minutes of screen time before entry
 */

/**
 * Add a vision diary entry
 * @param {Object} entry - Diary entry data
 * @returns {Promise<VisionDiaryEntry>}
 */
export async function addDiaryEntry(entry) {
  try {
    const entries = await getDiaryEntries();

    const newEntry = {
      id: `diary_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      qualityRating: entry.qualityRating || 3,
      symptoms: entry.symptoms || [],
      notes: entry.notes || '',
      context: {
        lighting: entry.lighting || 'normal',
        activity: entry.activity || '',
        screenTime: entry.screenTime || 0,
      },
    };

    entries.push(newEntry);

    // Keep last 365 entries (1 year)
    const trimmedEntries = entries.slice(-365);

    await chrome.storage.local.set({ [VISION_DIARY_KEY]: trimmedEntries });
    console.log('[ScotomaProfile] Added diary entry:', newEntry.id);

    return newEntry;
  } catch (error) {
    console.error('[ScotomaProfile] Error adding diary entry:', error);
    throw error;
  }
}

/**
 * Get all vision diary entries
 * @param {Object} options - Filter options
 * @param {number} options.days - Get entries from last N days
 * @returns {Promise<VisionDiaryEntry[]>}
 */
export async function getDiaryEntries(options = {}) {
  try {
    const result = await chrome.storage.local.get(VISION_DIARY_KEY);
    let entries = result[VISION_DIARY_KEY] || [];

    if (options.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - options.days);
      entries = entries.filter(e => new Date(e.timestamp) >= cutoff);
    }

    return entries;
  } catch (error) {
    console.error('[ScotomaProfile] Error getting diary entries:', error);
    return [];
  }
}

/**
 * Get diary statistics for a time period
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>}
 */
export async function getDiaryStats(days = 30) {
  const entries = await getDiaryEntries({ days });

  if (entries.length === 0) {
    return {
      averageQuality: null,
      entryCount: 0,
      symptomFrequency: {},
      qualityTrend: 'unknown',
    };
  }

  // Average quality
  const avgQuality = entries.reduce((sum, e) => sum + e.qualityRating, 0) / entries.length;

  // Symptom frequency
  const symptomFrequency = {};
  entries.forEach(e => {
    (e.symptoms || []).forEach(symptom => {
      symptomFrequency[symptom] = (symptomFrequency[symptom] || 0) + 1;
    });
  });

  // Quality trend (compare first half to second half)
  let trend = 'stable';
  if (entries.length >= 4) {
    const midpoint = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(0, midpoint);
    const secondHalf = entries.slice(midpoint);

    const firstAvg = firstHalf.reduce((sum, e) => sum + e.qualityRating, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, e) => sum + e.qualityRating, 0) / secondHalf.length;

    if (secondAvg - firstAvg > 0.5) {
      trend = 'improving';
    } else if (firstAvg - secondAvg > 0.5) {
      trend = 'declining';
    }
  }

  return {
    averageQuality: Math.round(avgQuality * 10) / 10,
    entryCount: entries.length,
    symptomFrequency,
    qualityTrend: trend,
  };
}

// ============================================================================
// PROGRESSION VISUALIZATION DATA
// ============================================================================

/**
 * Get data formatted for progression chart
 * @returns {Promise<Object>}
 */
export async function getProgressionChartData() {
  const profiles = await getAllProfiles();
  const diaryEntries = await getDiaryEntries({ days: 365 });

  // Sort profiles by date
  const sortedProfiles = profiles.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Profile data points
  const scotomaData = sortedProfiles.map(p => ({
    date: p.createdAt,
    area: Math.PI * p.boundary.radiusX * p.boundary.radiusY,
    radiusX: p.boundary.radiusX,
    radiusY: p.boundary.radiusY,
    centerX: p.boundary.centerX,
    centerY: p.boundary.centerY,
    confidence: p.metadata.confidenceScore,
    source: p.source,
  }));

  // Diary quality data points
  const qualityData = diaryEntries.map(e => ({
    date: e.timestamp,
    quality: e.qualityRating,
    symptoms: e.symptoms.length,
  }));

  // Calculate overall progression summary
  const progressionSummary = {
    scotomaChange: 'stable',
    qualityChange: 'stable',
    recommendation: '',
  };

  if (scotomaData.length >= 2) {
    const first = scotomaData[0];
    const last = scotomaData[scotomaData.length - 1];
    const areaChange = ((last.area - first.area) / first.area) * 100;

    if (areaChange > 10) {
      progressionSummary.scotomaChange = 'increased';
    } else if (areaChange < -10) {
      progressionSummary.scotomaChange = 'decreased';
    }
  }

  const diaryStats = await getDiaryStats(30);
  progressionSummary.qualityChange = diaryStats.qualityTrend;

  if (
    progressionSummary.scotomaChange === 'increased' ||
    progressionSummary.qualityChange === 'declining'
  ) {
    progressionSummary.recommendation =
      'Consider consulting your eye care professional for a comprehensive evaluation.';
  }

  return {
    scotomaData,
    qualityData,
    progressionSummary,
    dateRange: {
      start: sortedProfiles[0]?.createdAt || null,
      end: sortedProfiles[sortedProfiles.length - 1]?.createdAt || null,
    },
  };
}

/**
 * Export comprehensive report for medical professionals
 * @returns {Promise<string>}
 */
export async function exportMedicalReport() {
  const profiles = await getAllProfiles();
  const chartData = await getProgressionChartData();
  const diaryStats = await getDiaryStats(90); // 3 months
  const state = await getReassessmentState();

  const report = {
    exportVersion: 1,
    exportDate: new Date().toISOString(),
    application: 'AssisT Browser Extension - Stargardt Module',
    patient: {
      note: 'Patient identifying information not stored for privacy',
    },
    summary: {
      totalProfiles: profiles.length,
      firstAssessment: profiles[0]?.createdAt || null,
      latestAssessment: profiles[profiles.length - 1]?.createdAt || null,
      progressionSummary: chartData.progressionSummary,
    },
    scotomaHistory: profiles.map(p => ({
      date: p.createdAt,
      source: p.source,
      boundary: p.boundary,
      confidence: p.metadata.confidenceScore,
    })),
    visionDiary: {
      period: '90 days',
      stats: diaryStats,
    },
    reassessmentState: state,
    chartData: chartData,
  };

  return JSON.stringify(report, null, 2);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique profile ID
 * @returns {string}
 */
function generateProfileId() {
  return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if a point is inside a polygon (ray casting algorithm)
 * @param {number} x
 * @param {number} y
 * @param {ScotomaPoint[]} polygon
 * @returns {boolean}
 */
function isPointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Profile creation
  createFromSettings,
  createFromCalibration,
  createDefault,
  // Storage operations
  save,
  loadSaved,
  getAllProfiles,
  deleteProfile,
  setActiveProfile,
  // Profile analysis
  isPointInScotoma,
  getSafeZone,
  calculatePRLPosition,
  // Progression tracking
  compareProfiles,
  getProgressionHistory,
  // Export/import
  exportProfile,
  importProfile,
  // Reassessment & drift detection
  getReassessmentState,
  updateReassessmentState,
  recordFullAssessment,
  recordMicroCheck,
  checkReassessmentDue,
  getRecommendedAction,
  // Vision diary
  addDiaryEntry,
  getDiaryEntries,
  getDiaryStats,
  // Progression visualization
  getProgressionChartData,
  exportMedicalReport,
};
