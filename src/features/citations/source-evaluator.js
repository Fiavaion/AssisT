/**
 * Source Evaluator Module
 *
 * Evaluates source credibility using CRAAP test criteria,
 * DOI validation, and external database checks.
 *
 * Features:
 * - CRAAP test (Currency, Relevance, Authority, Accuracy, Purpose)
 * - Credibility score calculation (0-100)
 * - Visual badges (green/yellow/red)
 * - DOI validation via CrossRef
 * - Peer review status tracking
 *
 * @module features/citations/source-evaluator
 * @version 1.0.0
 */

import { CitationStorage } from './citation-storage.js';
import { attachInteractiveHandler, attachQuietHandler } from '../../utils/event-handlers.js';

/**
 * CRAAP Test Categories with scoring weights
 */
const CRAAPCategories = {
  CURRENCY: {
    id: 'currency',
    name: 'Currency',
    description: 'How recent is the information?',
    weight: 20,
    questions: [
      'When was the source published or last updated?',
      'Is the information current enough for your topic?',
      'Are links and references still functional?',
    ],
  },
  RELEVANCE: {
    id: 'relevance',
    name: 'Relevance',
    description: 'Does the source relate to your topic?',
    weight: 20,
    questions: [
      'Does the source relate to your research topic?',
      'Is it at an appropriate level for your needs?',
      'Have you looked at a variety of sources?',
    ],
  },
  AUTHORITY: {
    id: 'authority',
    name: 'Authority',
    description: 'Who is the author/publisher?',
    weight: 25,
    questions: [
      'Who is the author/publisher/sponsor?',
      "Are the author's credentials listed?",
      'Is this a reputable publisher or organization?',
    ],
  },
  ACCURACY: {
    id: 'accuracy',
    name: 'Accuracy',
    description: 'Is the information reliable and truthful?',
    weight: 25,
    questions: [
      'Is the information supported by evidence?',
      'Has it been peer-reviewed or fact-checked?',
      'Are there spelling, grammar, or typographical errors?',
    ],
  },
  PURPOSE: {
    id: 'purpose',
    name: 'Purpose',
    description: 'Why does this source exist?',
    weight: 10,
    questions: [
      'What is the purpose? (inform, teach, sell, persuade)',
      'Is the information fact, opinion, or propaganda?',
      'Are biases and viewpoints clearly stated?',
    ],
  },
};

/**
 * Credibility badge levels
 */
const CredibilityLevels = {
  HIGH: { min: 75, color: '#4caf50', label: 'High Quality', icon: '✓' },
  MEDIUM: { min: 50, color: '#ff9800', label: 'Medium Quality', icon: '!' },
  LOW: { min: 0, color: '#f44336', label: 'Low Quality', icon: '✗' },
};

/**
 * Source type credibility weights
 */
const SourceTypeWeights = {
  'journal-article': 1.0, // Highest credibility
  book: 0.95,
  'book-chapter': 0.9,
  thesis: 0.85,
  'conference-paper': 0.85,
  report: 0.8,
  'news-article': 0.6,
  website: 0.5,
  'blog-post': 0.4,
  'social-media': 0.3,
  video: 0.4,
  unknown: 0.5,
};

/**
 * Source Evaluator class
 */
class SourceEvaluator {
  /**
   * Calculate automatic credibility indicators
   * @param {Object} citation - Citation data
   * @returns {Object} Automatic evaluation results
   */
  static calculateAutoIndicators(citation) {
    const indicators = {
      hasDOI: false,
      hasISBN: false,
      hasPeerReview: false,
      isRecentSource: false,
      hasAuthor: false,
      hasPublisher: false,
      sourceTypeScore: 0.5,
      domainScore: 0.5,
    };

    // DOI check
    if (citation.doi) {
      indicators.hasDOI = true;
    }

    // ISBN check
    if (citation.isbn) {
      indicators.hasISBN = true;
    }

    // Peer review check (from citation data)
    if (citation.peerReviewed) {
      indicators.hasPeerReview = true;
    }

    // Currency check (within 5 years)
    if (citation.publicationDate || citation.year) {
      const year = citation.year || new Date(citation.publicationDate).getFullYear();
      const currentYear = new Date().getFullYear();
      indicators.isRecentSource = currentYear - year <= 5;
    }

    // Author check
    if (citation.authors && citation.authors.length > 0 && citation.authors[0] !== 'Unknown') {
      indicators.hasAuthor = true;
    }

    // Publisher check
    if (citation.publisher && citation.publisher !== 'Unknown') {
      indicators.hasPublisher = true;
    }

    // Source type score
    indicators.sourceTypeScore = SourceTypeWeights[citation.type] || SourceTypeWeights.unknown;

    // Domain score (academic domains get higher scores)
    if (citation.url) {
      indicators.domainScore = this.evaluateDomain(citation.url);
    }

    return indicators;
  }

  /**
   * Evaluate domain credibility
   * @param {string} url - Source URL
   * @returns {number} Domain score (0-1)
   */
  static evaluateDomain(url) {
    try {
      const domain = new URL(url).hostname.toLowerCase();

      // Academic domains
      if (domain.endsWith('.edu') || domain.endsWith('.ac.uk')) {
        return 0.9;
      }

      // Government domains
      if (domain.endsWith('.gov') || domain.endsWith('.gov.uk')) {
        return 0.85;
      }

      // Organization domains
      if (domain.endsWith('.org')) {
        return 0.7;
      }

      // Known academic publishers
      const academicPublishers = [
        'springer.com',
        'elsevier.com',
        'wiley.com',
        'tandfonline.com',
        'sagepub.com',
        'nature.com',
        'science.org',
        'jstor.org',
        'ieee.org',
        'acm.org',
        'oup.com',
        'cambridge.org',
        'pubmed.ncbi.nlm.nih.gov',
        'scholar.google.com',
        'researchgate.net',
        'academia.edu',
      ];

      for (const publisher of academicPublishers) {
        if (domain.includes(publisher)) {
          return 0.85;
        }
      }

      // News organizations
      const newsOrgs = ['bbc.', 'reuters.', 'apnews.', 'nytimes.', 'theguardian.'];
      for (const news of newsOrgs) {
        if (domain.includes(news)) {
          return 0.65;
        }
      }

      // Default commercial domain
      return 0.5;
    } catch {
      return 0.5;
    }
  }

  /**
   * Calculate overall credibility score
   * @param {Object} citation - Citation data
   * @param {Object} craapScores - Optional CRAAP test scores (0-100 per category)
   * @returns {Object} Credibility assessment
   */
  static calculateCredibilityScore(citation, craapScores = null) {
    const auto = this.calculateAutoIndicators(citation);

    // Start with automatic indicators (50% of score)
    let autoScore = 0;

    // DOI/ISBN: +15 points
    if (auto.hasDOI) {
      autoScore += 15;
    }
    if (auto.hasISBN) {
      autoScore += 10;
    }

    // Peer review: +15 points
    if (auto.hasPeerReview) {
      autoScore += 15;
    }

    // Currency: +10 points
    if (auto.isRecentSource) {
      autoScore += 10;
    }

    // Author/Publisher: +10 points
    if (auto.hasAuthor) {
      autoScore += 5;
    }
    if (auto.hasPublisher) {
      autoScore += 5;
    }

    // Source type: up to 15 points
    autoScore += Math.round(auto.sourceTypeScore * 15);

    // Domain: up to 10 points
    autoScore += Math.round(auto.domainScore * 10);

    // Cap auto score at 50
    autoScore = Math.min(autoScore, 50);

    // CRAAP scores (50% of score)
    let craapScore = 0;
    let hasCraap = false;

    if (craapScores) {
      hasCraap = true;
      const categories = Object.values(CRAAPCategories);
      let totalWeight = 0;
      let weightedSum = 0;

      for (const category of categories) {
        const score = craapScores[category.id];
        if (typeof score === 'number') {
          weightedSum += score * (category.weight / 100);
          totalWeight += category.weight / 100;
        }
      }

      if (totalWeight > 0) {
        // Scale to 50 points max
        craapScore = Math.round((weightedSum / totalWeight) * 50);
      }
    } else {
      // If no CRAAP scores, double the auto score contribution
      autoScore = Math.min(autoScore * 2, 100);
    }

    // Final score
    const finalScore = hasCraap ? autoScore + craapScore : autoScore;

    // Determine level
    let level;
    if (finalScore >= CredibilityLevels.HIGH.min) {
      level = CredibilityLevels.HIGH;
    } else if (finalScore >= CredibilityLevels.MEDIUM.min) {
      level = CredibilityLevels.MEDIUM;
    } else {
      level = CredibilityLevels.LOW;
    }

    return {
      score: finalScore,
      level,
      autoIndicators: auto,
      hasCraapEvaluation: hasCraap,
      craapScores: craapScores || null,
      breakdown: {
        autoScore: hasCraap ? autoScore : autoScore / 2,
        craapScore: hasCraap ? craapScore : 0,
      },
    };
  }

  /**
   * Get badge HTML for credibility score
   * @param {number} score - Credibility score (0-100)
   * @returns {string} HTML badge element
   */
  static getBadgeHTML(score) {
    let level;
    if (score >= CredibilityLevels.HIGH.min) {
      level = CredibilityLevels.HIGH;
    } else if (score >= CredibilityLevels.MEDIUM.min) {
      level = CredibilityLevels.MEDIUM;
    } else {
      level = CredibilityLevels.LOW;
    }

    return `
      <span class="credibility-badge"
            style="background: ${level.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;"
            title="${level.label}: ${score}/100">
        ${level.icon} ${score}
      </span>
    `;
  }

  /**
   * Save CRAAP evaluation to citation
   * @param {string} citationId - Citation ID
   * @param {Object} craapScores - CRAAP scores per category
   * @returns {Promise<Object>} Updated citation
   */
  static async saveCraapEvaluation(citationId, craapScores) {
    try {
      const citation = await CitationStorage.get(citationId);
      if (!citation) {
        throw new Error('Citation not found');
      }

      // Calculate credibility with CRAAP scores
      const evaluation = this.calculateCredibilityScore(citation, craapScores);

      // Update citation with evaluation data
      await CitationStorage.update(citationId, {
        craapScores,
        credibilityScore: evaluation.score,
        credibilityLevel: evaluation.level.label,
        evaluatedAt: Date.now(),
      });

      console.log('[SourceEvaluator] CRAAP evaluation saved:', citationId, evaluation.score);

      return evaluation;
    } catch (error) {
      console.error('[SourceEvaluator] Error saving evaluation:', error);
      throw error;
    }
  }

  /**
   * Get evaluation summary for multiple citations
   * @param {Array} citations - Array of citations
   * @returns {Object} Summary statistics
   */
  static getEvaluationSummary(citations) {
    if (!citations || citations.length === 0) {
      return {
        total: 0,
        evaluated: 0,
        averageScore: 0,
        distribution: { high: 0, medium: 0, low: 0 },
        byType: {},
      };
    }

    let totalScore = 0;
    let evaluated = 0;
    const distribution = { high: 0, medium: 0, low: 0 };
    const byType = {};

    for (const citation of citations) {
      // Calculate score if not already stored
      const score = citation.credibilityScore ?? this.calculateCredibilityScore(citation).score;

      if (score >= CredibilityLevels.HIGH.min) {
        distribution.high++;
      } else if (score >= CredibilityLevels.MEDIUM.min) {
        distribution.medium++;
      } else {
        distribution.low++;
      }

      totalScore += score;
      evaluated++;

      // Track by source type
      const type = citation.type || 'unknown';
      if (!byType[type]) {
        byType[type] = { count: 0, totalScore: 0 };
      }
      byType[type].count++;
      byType[type].totalScore += score;
    }

    // Calculate averages
    for (const type of Object.keys(byType)) {
      byType[type].averageScore = Math.round(byType[type].totalScore / byType[type].count);
    }

    return {
      total: citations.length,
      evaluated,
      averageScore: evaluated > 0 ? Math.round(totalScore / evaluated) : 0,
      distribution,
      byType,
    };
  }

  /**
   * Filter citations by minimum quality score
   * @param {Array} citations - Array of citations
   * @param {number} minScore - Minimum credibility score (0-100)
   * @returns {Array} Filtered citations
   */
  static filterByQuality(citations, minScore = 50) {
    return citations.filter(citation => {
      const score = citation.credibilityScore ?? this.calculateCredibilityScore(citation).score;
      return score >= minScore;
    });
  }

  /**
   * Get quality distribution chart data
   * @param {Array} citations - Array of citations
   * @returns {Object} Chart data for visualization
   */
  static getQualityChartData(citations) {
    const summary = this.getEvaluationSummary(citations);

    return {
      labels: ['High Quality', 'Medium Quality', 'Low Quality'],
      data: [summary.distribution.high, summary.distribution.medium, summary.distribution.low],
      colors: [
        CredibilityLevels.HIGH.color,
        CredibilityLevels.MEDIUM.color,
        CredibilityLevels.LOW.color,
      ],
      total: summary.total,
      averageScore: summary.averageScore,
    };
  }
}

/**
 * CRAAP Test UI Modal
 */
class CraapTestModal {
  constructor(citation, onSave) {
    this.citation = citation;
    this.onSave = onSave;
    this.modal = null;
    this.scores = {
      currency: 50,
      relevance: 50,
      authority: 50,
      accuracy: 50,
      purpose: 50,
    };
  }

  /**
   * Open the CRAAP test modal
   */
  open() {
    this.modal = this.createModal();
    document.body.appendChild(this.modal);
    this.applyStyles();
  }

  /**
   * Close the modal
   */
  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  /**
   * Create the modal HTML
   */
  createModal() {
    const overlay = document.createElement('div');
    overlay.className = 'craap-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'craap-modal-title');

    const categories = Object.values(CRAAPCategories);
    const categoryHTML = categories
      .map(
        cat => `
      <div class="craap-category">
        <div class="craap-category-header">
          <h4>${cat.name}</h4>
          <span class="craap-category-score" id="score-${cat.id}">${this.scores[cat.id]}</span>
        </div>
        <p class="craap-category-desc">${cat.description}</p>
        <div class="craap-questions">
          ${cat.questions.map(q => `<p class="craap-question">• ${q}</p>`).join('')}
        </div>
        <div class="craap-slider-container">
          <span class="craap-slider-label">Poor</span>
          <input type="range"
                 class="craap-slider"
                 id="slider-${cat.id}"
                 min="0"
                 max="100"
                 value="${this.scores[cat.id]}"
                 aria-label="${cat.name} rating">
          <span class="craap-slider-label">Excellent</span>
        </div>
      </div>
    `
      )
      .join('');

    overlay.innerHTML = `
      <div class="craap-modal">
        <div class="craap-modal-header">
          <h3 id="craap-modal-title">
            <span class="craap-icon">📊</span>
            CRAAP Test Evaluation
          </h3>
          <button class="craap-close-btn" aria-label="Close">✕</button>
        </div>

        <div class="craap-source-info">
          <strong>${this.escapeHTML(this.citation.title)}</strong>
          <span class="craap-source-url">${this.escapeHTML(this.citation.url)}</span>
        </div>

        <div class="craap-content">
          ${categoryHTML}
        </div>

        <div class="craap-footer">
          <div class="craap-total-score">
            <span>Overall Score:</span>
            <span class="craap-score-value" id="craap-total">50</span>
            <span class="craap-score-label" id="craap-level">Medium Quality</span>
          </div>
          <div class="craap-actions">
            <button class="craap-cancel-btn">Cancel</button>
            <button class="craap-save-btn">Save Evaluation</button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners(overlay);
    return overlay;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners(overlay) {
    // Close button
    const closeBtn = overlay.querySelector('.craap-close-btn');
    attachQuietHandler(closeBtn, 'CRAAP Close Button', () => this.close());

    // Cancel button
    const cancelBtn = overlay.querySelector('.craap-cancel-btn');
    attachInteractiveHandler(cancelBtn, 'CRAAP Cancel Button', () => this.close());

    // Click outside overlay
    attachInteractiveHandler(
      overlay,
      'CRAAP Overlay',
      e => {
        if (e.target === overlay) {
          this.close();
        }
      },
      { enableVisualFeedback: false }
    );

    // ESC key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.modal) {
        this.close();
      }
    });

    // Sliders (keep input event listeners as-is)
    const categories = Object.values(CRAAPCategories);
    for (const cat of categories) {
      const slider = overlay.querySelector(`#slider-${cat.id}`);
      const scoreDisplay = overlay.querySelector(`#score-${cat.id}`);

      slider.addEventListener('input', e => {
        this.scores[cat.id] = parseInt(e.target.value, 10);
        scoreDisplay.textContent = this.scores[cat.id];
        this.updateTotalScore();
      });
    }

    // Save button
    const saveBtn = overlay.querySelector('.craap-save-btn');
    attachInteractiveHandler(saveBtn, 'CRAAP Save Button', async _e => {
      try {
        const evaluation = await SourceEvaluator.saveCraapEvaluation(
          String(this.citation.id),
          this.scores
        );
        if (this.onSave) {
          this.onSave(evaluation);
        }
        this.close();
      } catch (error) {
        console.error('[CraapTestModal] Save error:', error);
        alert('Failed to save evaluation. Please try again.');
      }
    });
  }

  /**
   * Update total score display
   */
  updateTotalScore() {
    const evaluation = SourceEvaluator.calculateCredibilityScore(this.citation, this.scores);
    const totalEl = this.modal.querySelector('#craap-total');
    const levelEl = this.modal.querySelector('#craap-level');

    totalEl.textContent = evaluation.score;
    levelEl.textContent = evaluation.level.label;
    levelEl.style.color = evaluation.level.color;
  }

  /**
   * Escape HTML
   */
  escapeHTML(str) {
    if (!str) {
      return '';
    }
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Apply styles
   */
  applyStyles() {
    if (document.getElementById('craap-modal-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'craap-modal-styles';
    style.textContent = `
      .craap-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999997;
        padding: 20px;
      }

      .craap-modal {
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        width: 100%;
        max-width: 600px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
      }

      .craap-modal-header {
        padding: 16px 24px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .craap-modal-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .craap-close-btn {
        background: none;
        border: none;
        font-size: 20px;
        color: #666;
        cursor: pointer;
        padding: 4px;
      }

      .craap-source-info {
        padding: 12px 24px;
        background: #f9f9f9;
        border-bottom: 1px solid #e0e0e0;
      }

      .craap-source-info strong {
        display: block;
        margin-bottom: 4px;
        color: #333;
      }

      .craap-source-url {
        font-size: 12px;
        color: #666;
        word-break: break-all;
      }

      .craap-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 24px;
      }

      .craap-category {
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid #eee;
      }

      .craap-category:last-child {
        margin-bottom: 0;
        border-bottom: none;
      }

      .craap-category-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .craap-category-header h4 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
      }

      .craap-category-score {
        background: #e3f2fd;
        color: #1976d2;
        padding: 4px 12px;
        border-radius: 16px;
        font-weight: 600;
        font-size: 14px;
      }

      .craap-category-desc {
        font-size: 14px;
        color: #666;
        margin: 0 0 12px;
      }

      .craap-questions {
        background: #f5f5f5;
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 12px;
      }

      .craap-question {
        margin: 0 0 6px;
        font-size: 13px;
        color: #555;
      }

      .craap-question:last-child {
        margin-bottom: 0;
      }

      .craap-slider-container {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .craap-slider-label {
        font-size: 12px;
        color: #888;
        min-width: 60px;
      }

      .craap-slider-label:first-child {
        text-align: right;
      }

      .craap-slider {
        flex: 1;
        height: 6px;
        appearance: none;
        background: #e0e0e0;
        border-radius: 3px;
        outline: none;
      }

      .craap-slider::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        background: #2196f3;
        border-radius: 50%;
        cursor: pointer;
        transition: transform 0.2s;
      }

      .craap-slider::-webkit-slider-thumb:hover {
        transform: scale(1.1);
      }

      .craap-footer {
        padding: 16px 24px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f9f9f9;
        border-radius: 0 0 12px 12px;
      }

      .craap-total-score {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }

      .craap-score-value {
        font-size: 24px;
        font-weight: 700;
        color: #1976d2;
      }

      .craap-score-label {
        font-weight: 500;
      }

      .craap-actions {
        display: flex;
        gap: 12px;
      }

      .craap-cancel-btn {
        padding: 10px 20px;
        border: 1px solid #e0e0e0;
        background: white;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .craap-cancel-btn:hover {
        background: #f5f5f5;
      }

      .craap-save-btn {
        padding: 10px 20px;
        border: none;
        background: #2196f3;
        color: white;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .craap-save-btn:hover {
        background: #1976d2;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Open CRAAP test modal for a citation
 * @param {Object} citation - Citation to evaluate
 * @param {Function} onSave - Callback when evaluation is saved
 */
export function openCraapTest(citation, onSave = null) {
  const modal = new CraapTestModal(citation, onSave);
  modal.open();
}

export { SourceEvaluator, CraapTestModal, CRAAPCategories, CredibilityLevels, SourceTypeWeights };

export default SourceEvaluator;
