/**
 * Confidence & Quality Feedback Module (Phase 2.7 - S.4)
 * Provides visual feedback for speech recognition confidence
 *
 * Features:
 * - Display confidence score (0-100%) for each phrase
 * - Color-coded confidence (green/yellow/red)
 * - Minimum confidence threshold filtering
 * - Low-confidence word highlighting
 * - Alternative suggestions for low-confidence words
 * - Recognition accuracy statistics tracking
 * - Session statistics (words/minute, accuracy %)
 *
 * @module ConfidenceFeedback
 * @version 1.0.0
 */

/**
 * Confidence level thresholds
 */
export const ConfidenceLevel = {
  HIGH: 'high', // >= 85% - green
  MEDIUM: 'medium', // >= 60% - yellow
  LOW: 'low', // < 60% - red
};

/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  // Enable/disable confidence display
  enabled: true,

  // Minimum confidence threshold (0-1)
  // Results below this are flagged for review
  minThreshold: 0.6,

  // Show confidence badge inline with text
  showInlineBadge: true,

  // Highlight low-confidence words
  highlightLowConfidence: true,

  // Show alternative suggestions
  showAlternatives: true,

  // Maximum alternatives to show
  maxAlternatives: 3,

  // Color scheme for confidence levels
  colors: {
    high: '#22c55e', // green-500
    medium: '#eab308', // yellow-500
    low: '#ef4444', // red-500
    background: {
      high: 'rgba(34, 197, 94, 0.1)',
      medium: 'rgba(234, 179, 8, 0.1)',
      low: 'rgba(239, 68, 68, 0.1)',
    },
  },

  // Thresholds for confidence levels
  thresholds: {
    high: 0.85, // >= 85%
    medium: 0.6, // >= 60%
    // Below medium = low
  },

  // Session tracking settings
  sessionTracking: true,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes of inactivity resets session
};

/**
 * Result entry for tracking
 */
export class RecognitionResult {
  constructor(data = {}) {
    this.id = data.id || Date.now().toString(36) + Math.random().toString(36).slice(2);
    this.transcript = data.transcript || '';
    this.confidence = data.confidence || 0;
    this.alternatives = data.alternatives || [];
    this.timestamp = data.timestamp || Date.now();
    this.isFinal = data.isFinal !== false;
    this.wordConfidences = data.wordConfidences || [];
    this.wasAccepted = data.wasAccepted !== false;
    this.wasCorrected = data.wasCorrected || false;
    this.correctedText = data.correctedText || null;
  }

  /**
   * Get confidence level
   * @param {Object} thresholds - Threshold configuration
   * @returns {string} Confidence level
   */
  getLevel(thresholds = DEFAULT_CONFIG.thresholds) {
    if (this.confidence >= thresholds.high) {
      return ConfidenceLevel.HIGH;
    } else if (this.confidence >= thresholds.medium) {
      return ConfidenceLevel.MEDIUM;
    }
    return ConfidenceLevel.LOW;
  }

  /**
   * Get confidence as percentage
   * @returns {number} Confidence percentage (0-100)
   */
  getPercentage() {
    return Math.round(this.confidence * 100);
  }

  /**
   * Check if confidence meets threshold
   * @param {number} threshold - Minimum threshold (0-1)
   * @returns {boolean}
   */
  meetsThreshold(threshold) {
    return this.confidence >= threshold;
  }

  /**
   * Get low confidence words
   * @param {number} threshold - Word confidence threshold
   * @returns {Array} Words with confidence below threshold
   */
  getLowConfidenceWords(threshold = 0.6) {
    return this.wordConfidences.filter(w => w.confidence < threshold);
  }
}

/**
 * Session statistics tracker
 */
export class SessionStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    this.totalWords = 0;
    this.totalResults = 0;
    this.acceptedResults = 0;
    this.correctedResults = 0;
    this.rejectedResults = 0;
    this.totalConfidence = 0;
    this.confidenceCounts = {
      high: 0,
      medium: 0,
      low: 0,
    };
    this.wordsByMinute = [];
    this.corrections = [];
  }

  /**
   * Add a recognition result to stats
   * @param {RecognitionResult} result
   */
  addResult(result) {
    this.lastActivityTime = Date.now();
    this.totalResults++;
    this.totalConfidence += result.confidence;

    // Count words
    const words = result.transcript.trim().split(/\s+/).filter(w => w.length > 0);
    this.totalWords += words.length;

    // Track words per minute
    this.wordsByMinute.push({
      timestamp: Date.now(),
      count: words.length,
    });

    // Track confidence distribution
    const level = result.getLevel();
    this.confidenceCounts[level]++;

    // Track acceptance
    if (result.wasAccepted) {
      this.acceptedResults++;
    } else {
      this.rejectedResults++;
    }

    if (result.wasCorrected) {
      this.correctedResults++;
      this.corrections.push({
        original: result.transcript,
        corrected: result.correctedText,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get average confidence
   * @returns {number} Average confidence (0-1)
   */
  getAverageConfidence() {
    if (this.totalResults === 0) return 0;
    return this.totalConfidence / this.totalResults;
  }

  /**
   * Get acceptance rate
   * @returns {number} Acceptance rate (0-1)
   */
  getAcceptanceRate() {
    if (this.totalResults === 0) return 0;
    return this.acceptedResults / this.totalResults;
  }

  /**
   * Get correction rate
   * @returns {number} Correction rate (0-1)
   */
  getCorrectionRate() {
    if (this.acceptedResults === 0) return 0;
    return this.correctedResults / this.acceptedResults;
  }

  /**
   * Get words per minute
   * @returns {number} Average words per minute
   */
  getWordsPerMinute() {
    const sessionMinutes = (Date.now() - this.startTime) / 60000;
    if (sessionMinutes < 0.1) return 0;
    return Math.round(this.totalWords / sessionMinutes);
  }

  /**
   * Get recent words per minute (last 60 seconds)
   * @returns {number}
   */
  getRecentWordsPerMinute() {
    const oneMinuteAgo = Date.now() - 60000;
    const recentWords = this.wordsByMinute
      .filter(w => w.timestamp >= oneMinuteAgo)
      .reduce((sum, w) => sum + w.count, 0);
    return recentWords;
  }

  /**
   * Get session duration in minutes
   * @returns {number}
   */
  getDurationMinutes() {
    return Math.round((Date.now() - this.startTime) / 60000);
  }

  /**
   * Get full statistics summary
   * @returns {Object}
   */
  getSummary() {
    return {
      duration: this.getDurationMinutes(),
      totalWords: this.totalWords,
      totalResults: this.totalResults,
      wordsPerMinute: this.getWordsPerMinute(),
      recentWPM: this.getRecentWordsPerMinute(),
      averageConfidence: Math.round(this.getAverageConfidence() * 100),
      acceptanceRate: Math.round(this.getAcceptanceRate() * 100),
      correctionRate: Math.round(this.getCorrectionRate() * 100),
      confidenceDistribution: {
        high: this.confidenceCounts.high,
        medium: this.confidenceCounts.medium,
        low: this.confidenceCounts.low,
      },
      corrections: this.corrections.slice(-10), // Last 10 corrections
    };
  }
}

/**
 * Main Confidence Feedback class
 */
export class ConfidenceFeedback {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.results = [];
    this.maxResults = 100; // Keep last 100 results in memory
    this.sessionStats = new SessionStats();

    // Callbacks
    this.onConfidenceUpdate = options.onConfidenceUpdate || (() => {});
    this.onLowConfidence = options.onLowConfidence || (() => {});
    this.onStatsUpdate = options.onStatsUpdate || (() => {});

    // UI elements (created when needed)
    this.badgeElement = null;
    this.statsPanel = null;

    console.log('[ConfidenceFeedback] Initialized');
  }

  /**
   * Process a recognition event and extract confidence data
   * @param {SpeechRecognitionEvent} event - Raw speech recognition event
   * @returns {RecognitionResult}
   */
  processEvent(event) {
    if (!event || !event.results) return null;

    const results = [];

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const isFinal = result.isFinal;

      // Get primary result
      const primary = result[0];
      if (!primary) continue;

      // Get alternatives
      const alternatives = [];
      for (let j = 1; j < result.length && j <= this.config.maxAlternatives; j++) {
        if (result[j]) {
          alternatives.push({
            transcript: result[j].transcript,
            confidence: result[j].confidence || 0,
          });
        }
      }

      // Create result entry
      const entry = new RecognitionResult({
        transcript: primary.transcript,
        confidence: primary.confidence || 0,
        alternatives,
        isFinal,
        timestamp: Date.now(),
      });

      // Analyze word-level confidence if available
      // Note: Web Speech API doesn't provide word-level confidence,
      // so we estimate based on phrase confidence
      entry.wordConfidences = this.estimateWordConfidences(entry.transcript, entry.confidence);

      results.push(entry);

      // Track in session stats if final
      if (isFinal) {
        this.addResult(entry);
      }
    }

    return results.length > 0 ? results[results.length - 1] : null;
  }

  /**
   * Add a result manually (for non-event based processing)
   * @param {Object} data - Result data
   * @returns {RecognitionResult}
   */
  addResult(data) {
    const result = data instanceof RecognitionResult ? data : new RecognitionResult(data);

    // Add to results array
    this.results.push(result);

    // Trim if over limit
    if (this.results.length > this.maxResults) {
      this.results = this.results.slice(-this.maxResults);
    }

    // Update session stats
    if (this.config.sessionTracking) {
      this.sessionStats.addResult(result);
      this.onStatsUpdate(this.sessionStats.getSummary());
    }

    // Fire callbacks
    this.onConfidenceUpdate(result);

    // Check for low confidence
    if (!result.meetsThreshold(this.config.minThreshold)) {
      this.onLowConfidence(result);
    }

    return result;
  }

  /**
   * Estimate word-level confidences from phrase confidence
   * Since Web Speech API doesn't provide word-level data, we estimate
   * @param {string} transcript
   * @param {number} phraseConfidence
   * @returns {Array}
   */
  estimateWordConfidences(transcript, phraseConfidence) {
    const words = transcript.trim().split(/\s+/).filter(w => w.length > 0);

    // Simple estimation: shorter/common words get higher confidence
    // This is a heuristic since we don't have actual word-level data
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'ought',
      'used',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'and',
      'but',
      'if',
      'or',
      'because',
      'until',
      'while',
      'although',
      'though',
      'i',
      'me',
      'my',
      'myself',
      'we',
      'our',
      'ours',
      'ourselves',
      'you',
      'your',
      'yours',
      'yourself',
      'yourselves',
      'he',
      'him',
      'his',
      'himself',
      'she',
      'her',
      'hers',
      'herself',
      'it',
      'its',
      'itself',
      'they',
      'them',
      'their',
      'theirs',
      'themselves',
      'what',
      'which',
      'who',
      'whom',
      'this',
      'that',
      'these',
      'those',
      'am',
    ]);

    return words.map((word, index) => {
      const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
      let wordConfidence = phraseConfidence;

      // Adjust confidence based on word characteristics
      if (commonWords.has(cleanWord)) {
        // Common words tend to be recognized better
        wordConfidence = Math.min(1, phraseConfidence + 0.1);
      } else if (cleanWord.length > 10) {
        // Long words may have lower confidence
        wordConfidence = Math.max(0, phraseConfidence - 0.1);
      } else if (cleanWord.length <= 2) {
        // Very short words can be ambiguous
        wordConfidence = Math.max(0, phraseConfidence - 0.05);
      }

      // Add slight variance
      wordConfidence += (Math.random() - 0.5) * 0.1;
      wordConfidence = Math.max(0, Math.min(1, wordConfidence));

      return {
        word,
        confidence: wordConfidence,
        index,
        level: this.getConfidenceLevel(wordConfidence),
      };
    });
  }

  /**
   * Get confidence level for a value
   * @param {number} confidence - Confidence value (0-1)
   * @returns {string}
   */
  getConfidenceLevel(confidence) {
    if (confidence >= this.config.thresholds.high) {
      return ConfidenceLevel.HIGH;
    } else if (confidence >= this.config.thresholds.medium) {
      return ConfidenceLevel.MEDIUM;
    }
    return ConfidenceLevel.LOW;
  }

  /**
   * Get color for confidence level
   * @param {string|number} levelOrConfidence
   * @returns {string}
   */
  getColor(levelOrConfidence) {
    const level =
      typeof levelOrConfidence === 'number'
        ? this.getConfidenceLevel(levelOrConfidence)
        : levelOrConfidence;
    return this.config.colors[level] || this.config.colors.medium;
  }

  /**
   * Get background color for confidence level
   * @param {string|number} levelOrConfidence
   * @returns {string}
   */
  getBackgroundColor(levelOrConfidence) {
    const level =
      typeof levelOrConfidence === 'number'
        ? this.getConfidenceLevel(levelOrConfidence)
        : levelOrConfidence;
    return this.config.colors.background[level] || this.config.colors.background.medium;
  }

  /**
   * Mark a result as corrected
   * @param {string} resultId - Result ID
   * @param {string} correctedText - Corrected text
   */
  markCorrected(resultId, correctedText) {
    const result = this.results.find(r => r.id === resultId);
    if (result) {
      result.wasCorrected = true;
      result.correctedText = correctedText;
      this.sessionStats.correctedResults++;
      this.sessionStats.corrections.push({
        original: result.transcript,
        corrected: correctedText,
        timestamp: Date.now(),
      });
      this.onStatsUpdate(this.sessionStats.getSummary());
    }
  }

  /**
   * Mark a result as rejected
   * @param {string} resultId - Result ID
   */
  markRejected(resultId) {
    const result = this.results.find(r => r.id === resultId);
    if (result) {
      result.wasAccepted = false;
      // Adjust stats
      this.sessionStats.acceptedResults--;
      this.sessionStats.rejectedResults++;
      this.onStatsUpdate(this.sessionStats.getSummary());
    }
  }

  /**
   * Create confidence badge HTML
   * @param {RecognitionResult} result
   * @returns {string}
   */
  createBadgeHTML(result) {
    const level = result.getLevel(this.config.thresholds);
    const percentage = result.getPercentage();
    const color = this.getColor(level);
    const bgColor = this.getBackgroundColor(level);

    return `
      <span class="assist-confidence-badge"
            style="display: inline-flex; align-items: center; gap: 4px;
                   padding: 2px 8px; border-radius: 12px; font-size: 12px;
                   background: ${bgColor}; color: ${color}; font-weight: 600;
                   font-family: system-ui, -apple-system, sans-serif;"
            title="Recognition confidence: ${percentage}%"
            aria-label="Recognition confidence ${percentage} percent">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${
            level === ConfidenceLevel.HIGH
              ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
              : level === ConfidenceLevel.MEDIUM
                ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
                : '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
          }
        </svg>
        ${percentage}%
      </span>
    `;
  }

  /**
   * Create highlighted text with confidence colors
   * @param {RecognitionResult} result
   * @returns {string}
   */
  createHighlightedHTML(result) {
    if (!this.config.highlightLowConfidence || !result.wordConfidences.length) {
      return this.escapeHTML(result.transcript);
    }

    return result.wordConfidences
      .map(wc => {
        if (wc.confidence < this.config.minThreshold) {
          const color = this.getColor(wc.level);
          const bgColor = this.getBackgroundColor(wc.level);
          return `<span class="assist-low-confidence-word"
                        style="background: ${bgColor}; border-bottom: 2px solid ${color};
                               cursor: help; padding: 1px 2px; border-radius: 2px;"
                        title="Low confidence: ${Math.round(wc.confidence * 100)}%"
                        data-word="${this.escapeHTML(wc.word)}"
                        data-confidence="${wc.confidence}">${this.escapeHTML(wc.word)}</span>`;
        }
        return this.escapeHTML(wc.word);
      })
      .join(' ');
  }

  /**
   * Create alternatives dropdown HTML
   * @param {RecognitionResult} result
   * @returns {string}
   */
  createAlternativesHTML(result) {
    if (!this.config.showAlternatives || !result.alternatives.length) {
      return '';
    }

    const items = result.alternatives
      .map(
        (alt, i) => `
        <button class="assist-alternative-item"
                style="display: flex; justify-content: space-between; align-items: center;
                       width: 100%; padding: 8px 12px; border: none; background: none;
                       cursor: pointer; text-align: left; font-size: 13px;
                       transition: background 0.15s;"
                data-alternative-index="${i}"
                data-alternative-text="${this.escapeHTML(alt.transcript)}">
          <span>${this.escapeHTML(alt.transcript)}</span>
          <span style="color: ${this.getColor(alt.confidence)}; font-size: 11px;">
            ${Math.round(alt.confidence * 100)}%
          </span>
        </button>
      `
      )
      .join('');

    return `
      <div class="assist-alternatives-container" style="margin-top: 8px;">
        <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Did you mean:</div>
        <div class="assist-alternatives-list"
             style="background: #f5f5f5; border-radius: 8px; overflow: hidden;">
          ${items}
        </div>
      </div>
    `;
  }

  /**
   * Create stats panel HTML
   * @returns {string}
   */
  createStatsPanelHTML() {
    const stats = this.sessionStats.getSummary();

    return `
      <div class="assist-stats-panel"
           style="position: fixed; bottom: 20px; right: 20px;
                  background: white; border-radius: 12px;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                  padding: 16px; min-width: 280px; z-index: 10001;
                  font-family: system-ui, -apple-system, sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 14px; font-weight: 600;">Session Statistics</h3>
          <button class="assist-stats-close"
                  style="background: none; border: none; cursor: pointer; padding: 4px; opacity: 0.6;"
                  aria-label="Close statistics panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="assist-stat-item">
            <div style="font-size: 24px; font-weight: 700; color: #2563eb;">${stats.wordsPerMinute}</div>
            <div style="font-size: 11px; color: #666;">Words/min</div>
          </div>
          <div class="assist-stat-item">
            <div style="font-size: 24px; font-weight: 700; color: ${this.getColor(stats.averageConfidence / 100)}">
              ${stats.averageConfidence}%
            </div>
            <div style="font-size: 11px; color: #666;">Avg. Confidence</div>
          </div>
          <div class="assist-stat-item">
            <div style="font-size: 24px; font-weight: 700; color: #16a34a;">${stats.totalWords}</div>
            <div style="font-size: 11px; color: #666;">Total Words</div>
          </div>
          <div class="assist-stat-item">
            <div style="font-size: 24px; font-weight: 700; color: #9333ea;">${stats.duration}m</div>
            <div style="font-size: 11px; color: #666;">Duration</div>
          </div>
        </div>

        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
          <div style="font-size: 11px; color: #666; margin-bottom: 8px;">Confidence Distribution</div>
          <div style="display: flex; gap: 4px; height: 8px; border-radius: 4px; overflow: hidden;">
            ${this.createDistributionBarHTML(stats.confidenceDistribution)}
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 10px;">
            <span style="color: ${this.config.colors.high};">High: ${stats.confidenceDistribution.high}</span>
            <span style="color: ${this.config.colors.medium};">Medium: ${stats.confidenceDistribution.medium}</span>
            <span style="color: ${this.config.colors.low};">Low: ${stats.confidenceDistribution.low}</span>
          </div>
        </div>

        <div style="margin-top: 12px; display: flex; gap: 8px; font-size: 11px; color: #666;">
          <span>Accepted: ${stats.acceptanceRate}%</span>
          <span>•</span>
          <span>Corrected: ${stats.correctionRate}%</span>
        </div>
      </div>
    `;
  }

  /**
   * Create distribution bar HTML
   * @param {Object} distribution
   * @returns {string}
   */
  createDistributionBarHTML(distribution) {
    const total = distribution.high + distribution.medium + distribution.low;
    if (total === 0) {
      return `<div style="flex: 1; background: #e5e7eb;"></div>`;
    }

    const highPct = (distribution.high / total) * 100;
    const mediumPct = (distribution.medium / total) * 100;
    const lowPct = (distribution.low / total) * 100;

    return `
      <div style="flex: ${highPct}; background: ${this.config.colors.high};"></div>
      <div style="flex: ${mediumPct}; background: ${this.config.colors.medium};"></div>
      <div style="flex: ${lowPct}; background: ${this.config.colors.low};"></div>
    `;
  }

  /**
   * Show confidence badge near target element
   * @param {HTMLElement} targetElement
   * @param {RecognitionResult} result
   */
  showBadge(targetElement, result) {
    if (!this.config.showInlineBadge || !targetElement) return;

    // Remove existing badge
    this.hideBadge();

    // Create badge element
    const badge = document.createElement('div');
    badge.className = 'assist-confidence-badge-container';
    badge.innerHTML = this.createBadgeHTML(result);

    // Position near target
    const rect = targetElement.getBoundingClientRect();
    badge.style.cssText = `
      position: fixed;
      top: ${rect.top - 30}px;
      right: ${window.innerWidth - rect.right}px;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    `;

    document.body.appendChild(badge);
    this.badgeElement = badge;

    // Auto-hide after 3 seconds
    setTimeout(() => this.hideBadge(), 3000);
  }

  /**
   * Hide confidence badge
   */
  hideBadge() {
    if (this.badgeElement) {
      this.badgeElement.remove();
      this.badgeElement = null;
    }
  }

  /**
   * Show stats panel
   */
  showStatsPanel() {
    // Remove existing
    this.hideStatsPanel();

    const panel = document.createElement('div');
    panel.className = 'assist-stats-panel-container';
    panel.innerHTML = this.createStatsPanelHTML();

    // Add close handler
    panel.querySelector('.assist-stats-close')?.addEventListener('click', () => {
      this.hideStatsPanel();
    });

    document.body.appendChild(panel);
    this.statsPanel = panel;
  }

  /**
   * Hide stats panel
   */
  hideStatsPanel() {
    if (this.statsPanel) {
      this.statsPanel.remove();
      this.statsPanel = null;
    }
  }

  /**
   * Toggle stats panel visibility
   */
  toggleStatsPanel() {
    if (this.statsPanel) {
      this.hideStatsPanel();
    } else {
      this.showStatsPanel();
    }
  }

  /**
   * Update stats panel in place
   */
  updateStatsPanel() {
    if (this.statsPanel) {
      const stats = this.sessionStats.getSummary();
      // Update values in existing panel
      const container = this.statsPanel.querySelector('.assist-stats-panel');
      if (container) {
        container.innerHTML = this.createStatsPanelHTML()
          .replace('<div class="assist-stats-panel"', '<div')
          .replace(/style="[^"]*"/, '');
      }
    }
  }

  /**
   * Get session statistics
   * @returns {Object}
   */
  getStats() {
    return this.sessionStats.getSummary();
  }

  /**
   * Reset session statistics
   */
  resetSession() {
    this.sessionStats.reset();
    this.results = [];
    this.onStatsUpdate(this.sessionStats.getSummary());
    console.log('[ConfidenceFeedback] Session reset');
  }

  /**
   * Check if session has timed out
   * @returns {boolean}
   */
  hasSessionTimedOut() {
    const timeSinceActivity = Date.now() - this.sessionStats.lastActivityTime;
    return timeSinceActivity > this.config.sessionTimeout;
  }

  /**
   * Update configuration
   * @param {Object} newConfig
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('[ConfidenceFeedback] Config updated:', newConfig);
  }

  /**
   * Get current configuration
   * @returns {Object}
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Check if enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.config.enabled;
  }

  /**
   * Enable/disable confidence feedback
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.config.enabled = enabled;
    if (!enabled) {
      this.hideBadge();
      this.hideStatsPanel();
    }
  }

  /**
   * Get minimum threshold
   * @returns {number}
   */
  getMinThreshold() {
    return this.config.minThreshold;
  }

  /**
   * Set minimum threshold
   * @param {number} threshold
   */
  setMinThreshold(threshold) {
    this.config.minThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text
   * @returns {string}
   */
  escapeHTML(text) {
    // Handle Node.js test environment where document is not available
    if (typeof document === 'undefined') {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.hideBadge();
    this.hideStatsPanel();
    this.results = [];
    this.sessionStats.reset();
    console.log('[ConfidenceFeedback] Destroyed');
  }
}

export default ConfidenceFeedback;
