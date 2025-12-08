/**
 * Usage Tracker for AssisT Cloud AI Mode
 *
 * Tracks all cloud API usage for focus group analysis including:
 * - Token counts (input/output) per request
 * - Usage breakdown by feature and model
 * - Response times and performance metrics
 * - Session-based tracking
 *
 * @module ai/usage-tracker
 */

// Storage key for usage data
const USAGE_STORAGE_KEY = 'assist_cloud_usage';
const SESSION_KEY = 'assist_session_id';
const MAX_ENTRIES = 1000; // Prevent storage bloat

/**
 * Get or create session ID for tracking
 * @returns {Promise<string>}
 */
async function getSessionId() {
  try {
    const result = await chrome.storage.local.get(SESSION_KEY);

    if (result[SESSION_KEY]) {
      return result[SESSION_KEY];
    }

    // Create new session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await chrome.storage.local.set({ [SESSION_KEY]: sessionId });
    return sessionId;
  } catch (error) {
    console.warn('[UsageTracker] Failed to get session ID:', error);
    return `fallback_${Date.now()}`;
  }
}

/**
 * Track a single API usage event
 *
 * @param {Object} usageData - Usage data to track
 * @param {string} usageData.model - Model ID used
 * @param {string} usageData.modelKey - Model key (e.g., 'sonnet-4.5')
 * @param {string} usageData.feature - Feature name
 * @param {number} usageData.inputTokens - Input token count
 * @param {number} usageData.outputTokens - Output token count
 * @param {number} usageData.responseTime - Response time in ms
 * @param {number} usageData.promptLength - Prompt character length
 * @param {number} usageData.timestamp - Unix timestamp
 */
export async function trackUsage(usageData) {
  try {
    const sessionId = await getSessionId();

    const result = await chrome.storage.local.get(USAGE_STORAGE_KEY);
    const usage = result[USAGE_STORAGE_KEY] || [];

    // Add new entry
    usage.push({
      ...usageData,
      sessionId,
      id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    });

    // Trim to max entries (keep most recent)
    const trimmed = usage.slice(-MAX_ENTRIES);

    await chrome.storage.local.set({ [USAGE_STORAGE_KEY]: trimmed });

    console.log(`[UsageTracker] Tracked: ${usageData.feature} - ${usageData.inputTokens + usageData.outputTokens} tokens`);
  } catch (error) {
    console.error('[UsageTracker] Failed to track usage:', error);
  }
}

/**
 * Get raw usage data
 * @returns {Promise<Array>}
 */
export async function getRawUsage() {
  try {
    const result = await chrome.storage.local.get(USAGE_STORAGE_KEY);
    return result[USAGE_STORAGE_KEY] || [];
  } catch (error) {
    console.error('[UsageTracker] Failed to get raw usage:', error);
    return [];
  }
}

/**
 * Get aggregated usage statistics
 * @returns {Promise<Object>}
 */
export async function getUsageStats() {
  const usage = await getRawUsage();

  if (usage.length === 0) {
    return {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      averageInputTokens: 0,
      averageOutputTokens: 0,
      averageResponseTime: 0,
      byFeature: {},
      byModel: {},
      bySession: {},
      firstRequest: null,
      lastRequest: null,
      rawData: []
    };
  }

  // Calculate aggregates
  const byFeature = {};
  const byModel = {};
  const bySession = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalResponseTime = 0;

  for (const entry of usage) {
    totalInput += entry.inputTokens || 0;
    totalOutput += entry.outputTokens || 0;
    totalResponseTime += entry.responseTime || 0;

    // By feature
    const feature = entry.feature || 'unknown';
    if (!byFeature[feature]) {
      byFeature[feature] = { input: 0, output: 0, count: 0, totalTime: 0 };
    }
    byFeature[feature].input += entry.inputTokens || 0;
    byFeature[feature].output += entry.outputTokens || 0;
    byFeature[feature].count++;
    byFeature[feature].totalTime += entry.responseTime || 0;

    // By model
    const modelKey = entry.modelKey || entry.model || 'unknown';
    if (!byModel[modelKey]) {
      byModel[modelKey] = { input: 0, output: 0, count: 0, totalTime: 0 };
    }
    byModel[modelKey].input += entry.inputTokens || 0;
    byModel[modelKey].output += entry.outputTokens || 0;
    byModel[modelKey].count++;
    byModel[modelKey].totalTime += entry.responseTime || 0;

    // By session
    const session = entry.sessionId || 'unknown';
    if (!bySession[session]) {
      bySession[session] = { input: 0, output: 0, count: 0, firstRequest: entry.timestamp };
    }
    bySession[session].input += entry.inputTokens || 0;
    bySession[session].output += entry.outputTokens || 0;
    bySession[session].count++;
    bySession[session].lastRequest = entry.timestamp;
  }

  // Calculate averages per category
  for (const key of Object.keys(byFeature)) {
    byFeature[key].avgInput = Math.round(byFeature[key].input / byFeature[key].count);
    byFeature[key].avgOutput = Math.round(byFeature[key].output / byFeature[key].count);
    byFeature[key].avgTime = Math.round(byFeature[key].totalTime / byFeature[key].count);
  }

  for (const key of Object.keys(byModel)) {
    byModel[key].avgInput = Math.round(byModel[key].input / byModel[key].count);
    byModel[key].avgOutput = Math.round(byModel[key].output / byModel[key].count);
    byModel[key].avgTime = Math.round(byModel[key].totalTime / byModel[key].count);
  }

  // Sort usage by timestamp
  const sorted = [...usage].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return {
    totalRequests: usage.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    averageInputTokens: Math.round(totalInput / usage.length),
    averageOutputTokens: Math.round(totalOutput / usage.length),
    averageResponseTime: Math.round(totalResponseTime / usage.length),
    byFeature,
    byModel,
    bySession,
    sessionCount: Object.keys(bySession).length,
    firstRequest: sorted[0]?.timestamp || null,
    lastRequest: sorted[sorted.length - 1]?.timestamp || null,
    rawData: usage
  };
}

/**
 * Export usage data as JSON string (for download)
 * @returns {Promise<string>}
 */
export async function exportUsageData() {
  const stats = await getUsageStats();

  const exportData = {
    exportedAt: new Date().toISOString(),
    summary: {
      totalRequests: stats.totalRequests,
      totalTokens: stats.totalTokens,
      totalInputTokens: stats.totalInputTokens,
      totalOutputTokens: stats.totalOutputTokens,
      averageInputTokens: stats.averageInputTokens,
      averageOutputTokens: stats.averageOutputTokens,
      averageResponseTime: stats.averageResponseTime,
      sessionCount: stats.sessionCount,
      dateRange: {
        first: stats.firstRequest ? new Date(stats.firstRequest).toISOString() : null,
        last: stats.lastRequest ? new Date(stats.lastRequest).toISOString() : null
      }
    },
    byFeature: stats.byFeature,
    byModel: stats.byModel,
    bySession: stats.bySession,
    rawData: stats.rawData
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export usage data as CSV string
 * @returns {Promise<string>}
 */
export async function exportUsageCSV() {
  const usage = await getRawUsage();

  const headers = [
    'timestamp',
    'datetime',
    'sessionId',
    'feature',
    'model',
    'modelKey',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'responseTime',
    'promptLength'
  ];

  const rows = usage.map(entry => [
    entry.timestamp || '',
    entry.timestamp ? new Date(entry.timestamp).toISOString() : '',
    entry.sessionId || '',
    entry.feature || '',
    entry.model || '',
    entry.modelKey || '',
    entry.inputTokens || 0,
    entry.outputTokens || 0,
    (entry.inputTokens || 0) + (entry.outputTokens || 0),
    entry.responseTime || '',
    entry.promptLength || ''
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell =>
      typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
    ).join(','))
  ].join('\n');

  return csv;
}

/**
 * Clear all usage data
 * @returns {Promise<void>}
 */
export async function clearUsageData() {
  try {
    await chrome.storage.local.remove([USAGE_STORAGE_KEY, SESSION_KEY]);
    console.log('[UsageTracker] Usage data cleared');
  } catch (error) {
    console.error('[UsageTracker] Failed to clear usage data:', error);
  }
}

/**
 * Get usage for current session only
 * @returns {Promise<Object>}
 */
export async function getCurrentSessionStats() {
  const sessionId = await getSessionId();
  const allStats = await getUsageStats();

  return allStats.bySession[sessionId] || {
    input: 0,
    output: 0,
    count: 0,
    firstRequest: null,
    lastRequest: null
  };
}

export default {
  trackUsage,
  getRawUsage,
  getUsageStats,
  exportUsageData,
  exportUsageCSV,
  clearUsageData,
  getCurrentSessionStats
};
