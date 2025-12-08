/**
 * Citation Analyzer Feature
 *
 * Uses AI to analyze sources and citations for quality, bias, and credibility.
 * Integrates with the highlight menu for quick analysis of selected text/links.
 *
 * Features:
 * - AI-powered source credibility assessment
 * - Bias detection and indicators
 * - Key claims extraction
 * - Source type classification
 * - Reliability scoring
 * - Graceful fallback when LLM unavailable
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - Uses service worker bridge for LLM communication
 * - Registers to window.assistFeatures for integration
 *
 * @module features/citationAnalyzer
 */

import { showToast } from '../../core/ui/toast.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let citation_panel = null;
let citation_isLoading = false;
let citation_currentText = '';
let citation_currentAnalysis = null;
let citation_modelDropdown = null; // Cloud model dropdown reference

const citation_settings = {
  enabled: true,
  showInHighlightMenu: true,
  includeRecommendations: true,
  autoDetectLinks: true,
};

// Cloud model configurations
const CITATION_MODELS = {
  'local': { id: 'local', name: 'Local', isLocal: true },
  'haiku-4.5': { id: 'claude-haiku-4-5-20251101', name: 'Haiku 4.5' },
  'sonnet-4.5': { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5' },
  'opus-4.5': { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5' }
};

// Benchmark-optimized defaults (Academic Benchmark Report Dec 2025)
// Cloud: Opus 4.5 scored 8.8/10 (best for nuanced credibility assessment)
// Local: Gemma3:4b scored 7.7/10 (acceptable but cloud recommended)
const CITATION_DEFAULT_LOCAL_MODEL = 'local';
const CITATION_DEFAULT_CLOUD_MODEL = 'opus-4.5';

// ============================================================================
// LLM BRIDGE COMMUNICATION
// ============================================================================

/**
 * Check if cloud mode is enabled
 * @returns {Promise<boolean>}
 */
async function citation_isCloudEnabled() {
  try {
    const result = await chrome.storage.local.get(['cloudModeEnabled']);
    return result.cloudModeEnabled === true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if local LLM is available
 * @returns {Promise<{available: boolean, models: string[]}>}
 */
async function citation_checkLLM() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_CHECK',
    });

    if (response && response.success) {
      return {
        available: response.available || false,
        models: response.models || [],
      };
    }
    return { available: false, models: [] };
  } catch (error) {
    console.warn('[CitationAnalyzer] LLM check failed:', error);
    return { available: false, models: [] };
  }
}

/**
 * Analyze citation/source using LLM (local or cloud)
 * @param {string} text - Text or URL to analyze
 * @param {Object} context - Additional context (url, title, etc.)
 * @param {string} modelKey - Model key to use ('local', 'haiku-4.5', 'sonnet-4.5', 'opus-4.5')
 * @returns {Promise<{analysis: Object, isCloud: boolean}>} Analysis results
 */
async function citation_analyze(text, context = {}, modelKey = 'local') {
  // Truncate input to avoid token overflow
  const truncatedText = text.length > 2000 ? text.substring(0, 2000) + '...' : text;

  // Model-specific token limits
  const modelTokenLimits = {
    'local': 600,
    'haiku-4.5': 500,
    'sonnet-4.5': 700,
    'opus-4.5': 900
  };

  const maxTokens = modelTokenLimits[modelKey] || 600;

  // Strict, concise prompt
  const prompt = `TASK: Evaluate source credibility. Return ONLY valid JSON.

SOURCE: ${truncatedText}
${context.url ? `URL: ${context.url}` : ''}

OUTPUT FORMAT (no markdown, no explanation):
{"sourceType":"academic|news|blog|social|government|organization|unknown","credibilityScore":0-100,"credibilityRating":"High|Medium|Low","biasIndicators":{"detected":true|false,"type":"none|commercial|political|ideological","severity":"none|mild|moderate|strong","explanation":"10 words max"},"keyClaims":["max 2 claims, 8 words each"],"strengths":["max 2, 8 words each"],"weaknesses":["max 2, 8 words each"],"recommendations":"15 words max","summary":"20 words max"}

SCORING: blogs 20-50, news 40-70, academic 60-90. Be critical.
Start with { end with }`;

  const isCloud = modelKey !== 'local';

  try {
    let response;

    if (isCloud) {
      // Use cloud model (Claude API)
      response = await chrome.runtime.sendMessage({
        action: 'CLOUD_LLM_GENERATE',
        prompt,
        options: {
          model: modelKey,
          maxTokens,
          temperature: 0.2,
          feature: 'citationAnalyzer'
        },
      });
    } else {
      // Use local model (Ollama)
      response = await chrome.runtime.sendMessage({
        action: 'LOCAL_LLM_GENERATE',
        prompt,
        options: {
          maxTokens,
          temperature: 0.2,
        },
      });
    }

    if (response && response.success) {
      console.log('[CitationAnalyzer] Raw LLM response:', response.data);

      // Parse JSON response
      try {
        // Clean response: remove markdown code blocks
        let cleanedResponse = response.data
          .replace(/```json\s*/gi, '')
          .replace(/```JSON\s*/g, '')
          .replace(/```\s*/g, '')
          .replace(/^\s*json\s*/i, '')
          .trim();

        // Try to find JSON object in response
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          // Clean up common JSON issues
          let jsonStr = jsonMatch[0]
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']');

          const parsed = JSON.parse(jsonStr);
          console.log('[CitationAnalyzer] Parsed JSON:', parsed);

          // Validate required fields exist
          if (parsed.credibilityScore !== undefined || parsed.sourceType) {
            // Blend AI result with heuristic analysis for better accuracy
            const heuristic = citation_fallback(text, context);
            console.log('[CitationAnalyzer] Heuristic score:', heuristic.credibilityScore);

            // If heuristic found strong indicators AI missed, boost the score
            if (heuristic.credibilityScore > parsed.credibilityScore + 20) {
              console.log('[CitationAnalyzer] Boosting AI score with heuristic indicators');
              // Use weighted average: 40% AI, 60% heuristic when AI underestimates
              parsed.credibilityScore = Math.round(parsed.credibilityScore * 0.4 + heuristic.credibilityScore * 0.6);

              // Merge strengths from heuristic
              if (!parsed.strengths) parsed.strengths = [];
              heuristic.strengths.forEach(s => {
                if (!parsed.strengths.includes(s)) parsed.strengths.push(s);
              });

              // Update source type if heuristic found a better match
              if (heuristic.sourceType !== 'unknown' && parsed.sourceType === 'unknown') {
                parsed.sourceType = heuristic.sourceType;
              }
            }

            // Recalculate rating based on final score
            if (parsed.credibilityScore >= 70) {
              parsed.credibilityRating = 'High';
            } else if (parsed.credibilityScore >= 50) {
              parsed.credibilityRating = 'Medium';
            } else {
              parsed.credibilityRating = 'Low';
            }

            return { analysis: parsed, isCloud };
          }
        }
      } catch (parseError) {
        console.warn('[CitationAnalyzer] JSON parse error:', parseError.message);
        console.log('[CitationAnalyzer] Failed to parse:', response.data);
      }

      // If JSON parsing failed, use the heuristic fallback with the original text
      console.log('[CitationAnalyzer] Using heuristic fallback due to parse failure');
      const fallbackResult = citation_fallback(text, context);
      fallbackResult.aiAttempted = true;
      fallbackResult.rawResponse = response.data;
      return { analysis: fallbackResult, isCloud };
    }

    throw new Error(response?.error || 'Analysis failed');
  } catch (error) {
    console.error('[CitationAnalyzer] Analysis failed:', error);
    throw error;
  }
}

// ============================================================================
// FALLBACK ANALYSIS (No LLM)
// ============================================================================

/**
 * Basic source analysis when LLM is unavailable
 * Uses heuristics and pattern matching
 * @param {string} text - Text to analyze
 * @param {Object} context - Additional context
 * @returns {Object} Basic analysis results
 */
function citation_fallback(text, context = {}) {
  const lowerText = text.toLowerCase();
  const url = context.url || '';
  const lowerUrl = url.toLowerCase();

  // Detect source type - check text content first, then URL
  let sourceType = 'unknown';

  // Check text for institutional/academic indicators
  const academicKeywords = ['journal', 'university', 'press', 'doi:', 'vol.', 'pp.', 'et al', 'proceedings'];
  const institutionalKeywords = ['museum', 'gallery', 'institute', 'library', 'archive', 'foundation', 'society', 'association', 'publications'];
  const newsKeywords = ['newspaper', 'times', 'post', 'herald', 'tribune', 'reuters', 'associated press'];
  const blogKeywords = ['blog', 'retrieved from', 'accessed', 'wordpress', 'medium.com', 'top 10', 'best of'];

  const hasAcademicIndicators = academicKeywords.some(k => lowerText.includes(k));
  const hasInstitutionalIndicators = institutionalKeywords.some(k => lowerText.includes(k));
  const hasNewsIndicators = newsKeywords.some(k => lowerText.includes(k));
  const hasBlogIndicators = blogKeywords.some(k => lowerText.includes(k));

  // Prioritize text-based detection
  if (hasAcademicIndicators && !hasBlogIndicators) {
    sourceType = 'academic';
  } else if (hasInstitutionalIndicators && !hasBlogIndicators) {
    sourceType = 'organization';
  } else if (hasNewsIndicators) {
    sourceType = 'news';
  } else if (hasBlogIndicators) {
    sourceType = 'blog';
  } else if (lowerUrl.includes('.edu') || lowerUrl.includes('.ac.')) {
    sourceType = 'academic';
  } else if (lowerUrl.includes('.gov')) {
    sourceType = 'government';
  } else if (lowerUrl.includes('.org')) {
    sourceType = 'organization';
  } else if (lowerUrl.includes('blog') || lowerUrl.includes('medium.com') || lowerUrl.includes('wordpress')) {
    sourceType = 'blog';
  } else if (lowerUrl.includes('twitter') || lowerUrl.includes('facebook') || lowerUrl.includes('instagram')) {
    sourceType = 'social';
  }

  // Calculate basic credibility score
  let score = 50;
  const strengths = [];
  const weaknesses = [];

  // Source type scoring
  if (sourceType === 'academic') {
    score += 25;
    strengths.push('Academic source (journal/university)');
  } else if (sourceType === 'government') {
    score += 20;
    strengths.push('Government source');
  } else if (sourceType === 'organization') {
    score += 15;
    strengths.push('Institutional/organizational source');
  } else if (sourceType === 'news') {
    score += 5;
    strengths.push('News publication');
  } else if (sourceType === 'social') {
    score -= 20;
    weaknesses.push('Social media source - verify independently');
  } else if (sourceType === 'blog') {
    score -= 10;
    weaknesses.push('Blog post - may reflect personal opinion');
  }

  // Bonus for specific institutional indicators in text
  if (hasInstitutionalIndicators) {
    score += 10;
    strengths.push('Institutional publisher (museum/gallery/institute)');
  }

  // Check for formal citation format (Author. (Year). Title.)
  const hasCitationFormat = /\(\d{4}\)/.test(text) && (text.includes('.') && text.includes(':'));
  if (hasCitationFormat) {
    score += 10;
    strengths.push('Proper citation format');
  }

  // Check for reputable publishers
  const reputablePublishers = ['mit press', 'oxford', 'cambridge', 'springer', 'wiley', 'elsevier', 'sage', 'taylor & francis', 'routledge', 'penguin', 'harper'];
  const hasReputablePublisher = reputablePublishers.some(p => lowerText.includes(p));
  if (hasReputablePublisher) {
    score += 15;
    strengths.push('Reputable publisher');
  }

  // Content indicators
  if (lowerText.includes('peer-reviewed') || lowerText.includes('peer reviewed')) {
    score += 15;
    strengths.push('Mentions peer review');
  }
  if (lowerText.includes('doi:') || lowerText.includes('doi.org') || lowerText.includes('10.')) {
    score += 10;
    strengths.push('Has DOI identifier');
  }
  if (lowerText.includes('references') || lowerText.includes('bibliography')) {
    score += 5;
    strengths.push('Contains references');
  }

  // Expert contributors mentioned
  if (lowerText.includes('expert') || lowerText.includes('professor') || lowerText.includes('dr.') || lowerText.includes('ph.d')) {
    score += 5;
    strengths.push('Expert contributors');
  }

  // Bias indicators
  const biasWords = ['obviously', 'clearly wrong', 'everyone knows', 'the truth is', 'fake news', 'mainstream media'];
  const hasBiasLanguage = biasWords.some(word => lowerText.includes(word));

  const commercialWords = ['buy now', 'click here', 'limited time', 'special offer', 'subscribe'];
  const hasCommercialLanguage = commercialWords.some(word => lowerText.includes(word));

  if (hasBiasLanguage) {
    score -= 15;
    weaknesses.push('Contains potentially biased language');
  }
  if (hasCommercialLanguage) {
    score -= 10;
    weaknesses.push('Contains commercial/promotional language');
  }

  // Date check
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const currentYear = new Date().getFullYear();
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    if (currentYear - year > 10) {
      weaknesses.push(`Source may be outdated (${yearMatch[0]})`);
      score -= 5;
    } else if (currentYear - year <= 2) {
      strengths.push('Recent publication');
      score += 5;
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine rating
  let rating = 'Unknown';
  if (score >= 70) rating = 'High';
  else if (score >= 50) rating = 'Medium';
  else if (score >= 0) rating = 'Low';

  return {
    sourceType,
    credibilityScore: score,
    credibilityRating: rating,
    biasIndicators: {
      detected: hasBiasLanguage || hasCommercialLanguage,
      type: hasCommercialLanguage ? 'commercial' : (hasBiasLanguage ? 'ideological' : 'none'),
      severity: (hasBiasLanguage || hasCommercialLanguage) ? 'mild' : 'none',
      explanation: hasBiasLanguage ? 'Some potentially biased language detected' :
                   hasCommercialLanguage ? 'Commercial/promotional content detected' :
                   'No obvious bias detected',
    },
    keyClaims: ['Unable to extract claims without AI'],
    strengths: strengths.length > 0 ? strengths : ['Basic analysis only'],
    weaknesses: weaknesses.length > 0 ? weaknesses : ['Requires AI for deeper analysis'],
    recommendations: 'For a more thorough analysis, ensure Ollama is running with a language model.',
    summary: `Basic analysis suggests this is a ${sourceType} source with ${rating.toLowerCase()} credibility. Score: ${score}/100.`,
    isFallback: true,
  };
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the analysis panel UI
 * @returns {HTMLElement} Panel element
 */
async function citation_createPanel() {
  citation_injectStyles();

  // Check if cloud mode is enabled
  const cloudEnabled = await citation_isCloudEnabled();

  const panel = document.createElement('div');
  panel.id = 'assist-citation-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Citation Analysis');
  panel.setAttribute('tabindex', '-1');

  panel.innerHTML = `
    <div class="assist-citation-header">
      <div class="assist-citation-title">
        <span class="assist-citation-icon">🔍</span>
        <span>Citation Analyzer</span>
      </div>
      <div class="assist-citation-controls">
        <button class="assist-citation-close" aria-label="Close" title="Close (Esc)">×</button>
      </div>
    </div>
    <div class="assist-citation-status"></div>
    <div class="assist-citation-content">
      <div class="assist-citation-placeholder">
        Select text or paste a URL to analyze...
      </div>
    </div>
    <div class="assist-citation-actions">
      <div class="assist-citation-model-selector ${cloudEnabled ? '' : 'hidden'}">
        <span class="assist-model-icon" title="AI Model">🤖</span>
        <select class="assist-citation-model" aria-label="Select AI model">
          <option value="local">Local</option>
          <option value="haiku-4.5">Haiku 4.5</option>
          <option value="sonnet-4.5">Sonnet 4.5</option>
          <option value="opus-4.5">Opus 4.5</option>
        </select>
      </div>
      <button class="assist-citation-btn" data-action="copy" disabled>
        <span class="assist-citation-btn-icon">📋</span>
        Copy Report
      </button>
      <button class="assist-citation-btn" data-action="speak" disabled>
        <span class="assist-citation-btn-icon">🔊</span>
        Read Aloud
      </button>
      <button class="assist-citation-btn" data-action="reanalyze" disabled>
        <span class="assist-citation-btn-icon">🔄</span>
        Reanalyze
      </button>
    </div>
  `;

  // Event handlers
  panel.querySelector('.assist-citation-close').addEventListener('click', citation_hide);

  // Model dropdown event listener
  const modelSelect = panel.querySelector('.assist-citation-model');
  if (modelSelect) {
    // Set default based on cloud mode (benchmark-optimized)
    modelSelect.value = cloudEnabled ? CITATION_DEFAULT_CLOUD_MODEL : CITATION_DEFAULT_LOCAL_MODEL;
    citation_modelDropdown = modelSelect;

    // Model change triggers regeneration
    modelSelect.addEventListener('change', () => {
      if (citation_currentText) {
        citation_runAnalysis(citation_currentText, {}, modelSelect.value);
      }
    });
  }

  panel.querySelector('[data-action="copy"]').addEventListener('click', citation_copy);
  panel.querySelector('[data-action="speak"]').addEventListener('click', citation_speak);
  panel.querySelector('[data-action="reanalyze"]').addEventListener('click', () => {
    if (citation_currentText) {
      const modelKey = citation_modelDropdown?.value || 'local';
      citation_runAnalysis(citation_currentText, {}, modelKey);
    }
  });

  // Make draggable
  citation_makeDraggable(panel);

  return panel;
}

/**
 * Inject CSS styles
 */
function citation_injectStyles() {
  if (document.getElementById('assist-citation-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'assist-citation-styles';
  style.textContent = `
    #assist-citation-panel {
      position: fixed;
      top: 100px;
      right: 20px;
      width: 420px;
      max-height: 80vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e0e0e0;
    }

    .assist-citation-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
      color: white;
      cursor: move;
      user-select: none;
    }

    .assist-citation-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 15px;
    }

    .assist-citation-icon {
      font-size: 18px;
    }

    .assist-citation-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .assist-citation-close {
      width: 28px;
      height: 28px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 50%;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .assist-citation-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .assist-citation-status {
      padding: 8px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      display: none;
    }

    .assist-citation-status.visible {
      display: block;
    }

    .assist-citation-status.error {
      background: #fff3e0;
      color: #e65100;
    }

    .assist-citation-status.success {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .assist-citation-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      line-height: 1.6;
      color: #333;
    }

    .assist-citation-placeholder {
      color: #999;
      font-style: italic;
      text-align: center;
      margin: 20px 0;
    }

    .assist-citation-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 20px;
      color: #666;
    }

    .assist-citation-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e0e0e0;
      border-top-color: #2e7d32;
      border-radius: 50%;
      animation: assist-citation-spin 0.8s linear infinite;
    }

    @keyframes assist-citation-spin {
      to { transform: rotate(360deg); }
    }

    /* Score display */
    .assist-citation-score {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .assist-citation-score-circle {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
      color: white;
    }

    .assist-citation-score-circle.high {
      background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
    }

    .assist-citation-score-circle.medium {
      background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
    }

    .assist-citation-score-circle.low {
      background: linear-gradient(135deg, #f44336 0%, #c62828 100%);
    }

    .assist-citation-score-info {
      flex: 1;
    }

    .assist-citation-score-rating {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .assist-citation-score-type {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Sections */
    .assist-citation-section {
      margin-bottom: 16px;
    }

    .assist-citation-section-title {
      font-weight: 600;
      font-size: 13px;
      color: #333;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .assist-citation-section-icon {
      font-size: 14px;
    }

    /* Lists */
    .assist-citation-list {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
    }

    .assist-citation-list li {
      margin-bottom: 4px;
      color: #555;
    }

    .assist-citation-list.strengths li::marker {
      color: #4caf50;
    }

    .assist-citation-list.weaknesses li::marker {
      color: #f44336;
    }

    /* Bias indicator */
    .assist-citation-bias {
      padding: 12px;
      border-radius: 6px;
      font-size: 13px;
      color: #333;
    }

    .assist-citation-bias.none {
      background: #e8f5e9;
      border: 1px solid #c8e6c9;
      color: #1b5e20;
    }

    .assist-citation-bias.mild {
      background: #fff3e0;
      border: 1px solid #ffe0b2;
      color: #e65100;
    }

    .assist-citation-bias.moderate {
      background: #ffebee;
      border: 1px solid #ffcdd2;
      color: #c62828;
    }

    .assist-citation-bias.strong {
      background: #f44336;
      color: white;
    }

    /* Summary box */
    .assist-citation-summary {
      padding: 12px;
      background: #e3f2fd;
      border-radius: 6px;
      font-size: 13px;
      color: #1565c0;
      border-left: 3px solid #2196f3;
    }

    /* Recommendations */
    .assist-citation-recommendations {
      padding: 12px;
      background: #f3e5f5;
      border-radius: 6px;
      font-size: 13px;
      color: #7b1fa2;
      border-left: 3px solid #9c27b0;
    }

    /* Model selector in actions bar */
    .assist-citation-model-selector {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      margin-right: auto;
    }

    .assist-citation-model-selector.hidden {
      display: none !important;
    }

    .assist-model-icon {
      font-size: 14px;
    }

    .assist-citation-model {
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      background: white;
      cursor: pointer;
      min-width: 100px;
    }

    .assist-citation-model:focus {
      outline: none;
      border-color: #2e7d32;
      box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.2);
    }

    /* Badges */
    .assist-citation-ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    .assist-citation-cloud-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    .assist-citation-fallback-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: #ff9800;
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    /* Actions */
    .assist-citation-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #f8f9fa;
      border-top: 1px solid #e0e0e0;
    }

    .assist-citation-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: white;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .assist-citation-btn:hover {
      background: #f0f0f0;
      border-color: #ccc;
    }

    .assist-citation-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .assist-citation-btn-icon {
      font-size: 14px;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      #assist-citation-panel {
        background: #1e1e1e;
        border-color: #333;
        color: #e0e0e0;
      }

      .assist-citation-content {
        color: #e0e0e0;
      }

      .assist-citation-status {
        background: #2d2d2d;
        border-color: #333;
        color: #aaa;
      }

      .assist-citation-score {
        background: #2d2d2d;
      }

      .assist-citation-section-title {
        color: #e0e0e0;
      }

      .assist-citation-list li {
        color: #bbb;
      }

      .assist-citation-actions {
        background: #252525;
        border-color: #333;
      }

      .assist-citation-btn {
        background: #2d2d2d;
        border-color: #444;
        color: #e0e0e0;
      }

      .assist-citation-btn:hover {
        background: #3d3d3d;
      }

      .assist-citation-model-selector {
        background: rgba(255, 255, 255, 0.1);
      }

      .assist-citation-model {
        background: #2a2a2a;
        color: #e0e0e0;
        border-color: #444;
      }

      .assist-citation-model:focus {
        border-color: #4caf50;
        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Make the panel draggable
 * @param {HTMLElement} panel - Panel element
 */
function citation_makeDraggable(panel) {
  const header = panel.querySelector('.assist-citation-header');
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  header.addEventListener('mousedown', e => {
    if (e.target.closest('.assist-citation-controls')) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = panel.offsetLeft;
    startTop = panel.offsetTop;

    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + deltaX));
    const newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, startTop + deltaY));

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

/**
 * Render analysis results in the panel
 * @param {Object} analysis - Analysis results
 * @param {boolean} isAI - Whether AI was used
 * @param {boolean} isCloud - Whether cloud model was used
 * @param {string} modelName - Name of the model used
 */
function citation_renderResults(analysis, isAI, isCloud = false, modelName = '') {
  const contentArea = citation_panel?.querySelector('.assist-citation-content');
  if (!contentArea) return;

  const scoreClass = analysis.credibilityRating?.toLowerCase() || 'medium';
  const biasClass = analysis.biasIndicators?.severity || 'none';

  const keyClaims = analysis.keyClaims && analysis.keyClaims.length > 0
    ? analysis.keyClaims.map(c => `<li>${escapeHtml(c)}</li>`).join('')
    : '<li>No specific claims extracted</li>';

  const strengths = analysis.strengths && analysis.strengths.length > 0
    ? analysis.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')
    : '<li>None identified</li>';

  const weaknesses = analysis.weaknesses && analysis.weaknesses.length > 0
    ? analysis.weaknesses.map(w => `<li>${escapeHtml(w)}</li>`).join('')
    : '<li>None identified</li>';

  let badge;
  if (isCloud) {
    badge = `<span class="assist-citation-cloud-badge">☁️ ${modelName}</span>`;
  } else if (isAI) {
    badge = '<span class="assist-citation-ai-badge">💻 Local AI</span>';
  } else {
    badge = '<span class="assist-citation-fallback-badge">Basic</span>';
  }

  contentArea.innerHTML = `
    <div class="assist-citation-score">
      <div class="assist-citation-score-circle ${scoreClass}">
        ${analysis.credibilityScore || '?'}
      </div>
      <div class="assist-citation-score-info">
        <div class="assist-citation-score-rating">
          ${analysis.credibilityRating || 'Unknown'} Credibility
          ${badge}
        </div>
        <div class="assist-citation-score-type">
          Source Type: ${analysis.sourceType || 'Unknown'}
        </div>
      </div>
    </div>

    <div class="assist-citation-section">
      <div class="assist-citation-section-title">
        <span class="assist-citation-section-icon">⚠️</span>
        Bias Assessment
      </div>
      <div class="assist-citation-bias ${biasClass}">
        ${analysis.biasIndicators?.explanation || 'No bias information available'}
        ${analysis.biasIndicators?.type && analysis.biasIndicators.type !== 'none'
          ? ` (Type: ${analysis.biasIndicators.type})`
          : ''}
      </div>
    </div>

    <div class="assist-citation-section">
      <div class="assist-citation-section-title">
        <span class="assist-citation-section-icon">📌</span>
        Key Claims
      </div>
      <ul class="assist-citation-list">${keyClaims}</ul>
    </div>

    <div class="assist-citation-section">
      <div class="assist-citation-section-title">
        <span class="assist-citation-section-icon">✅</span>
        Strengths
      </div>
      <ul class="assist-citation-list strengths">${strengths}</ul>
    </div>

    <div class="assist-citation-section">
      <div class="assist-citation-section-title">
        <span class="assist-citation-section-icon">⚡</span>
        Weaknesses
      </div>
      <ul class="assist-citation-list weaknesses">${weaknesses}</ul>
    </div>

    ${analysis.summary ? `
      <div class="assist-citation-section">
        <div class="assist-citation-section-title">
          <span class="assist-citation-section-icon">📝</span>
          Summary
        </div>
        <div class="assist-citation-summary">${escapeHtml(analysis.summary)}</div>
      </div>
    ` : ''}

    ${analysis.recommendations ? `
      <div class="assist-citation-section">
        <div class="assist-citation-section-title">
          <span class="assist-citation-section-icon">💡</span>
          Recommendations
        </div>
        <div class="assist-citation-recommendations">${escapeHtml(analysis.recommendations)}</div>
      </div>
    ` : ''}
  `;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Show the citation analysis panel
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
async function citation_show(selectionRect = null) {
  if (citation_panel) {
    citation_panel.remove();
  }

  citation_panel = await citation_createPanel();
  document.body.appendChild(citation_panel);

  // Position near selection if available
  if (selectionRect) {
    const panelRect = citation_panel.getBoundingClientRect();
    let left = selectionRect.right + 10;
    let top = selectionRect.top;

    // Horizontal bounds: prefer right of selection, fallback to left
    if (left + panelRect.width > window.innerWidth - 20) {
      left = Math.max(20, selectionRect.left - panelRect.width - 10);
    }

    // Vertical bounds: ensure panel stays within viewport
    // Check bottom edge
    if (top + panelRect.height > window.innerHeight - 20) {
      top = window.innerHeight - panelRect.height - 20;
    }

    // Check top edge (ensure not cut off at top)
    if (top < 20) {
      top = 20;
    }

    citation_panel.style.left = `${left}px`;
    citation_panel.style.top = `${top}px`;
    citation_panel.style.right = 'auto';
  }

  document.addEventListener('keydown', citation_handleKeydown);
  citation_panel.focus();
}

/**
 * Hide the citation analysis panel
 */
function citation_hide() {
  if (citation_panel) {
    citation_panel.remove();
    citation_panel = null;
  }

  document.removeEventListener('keydown', citation_handleKeydown);
  citation_isLoading = false;
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} e - Keyboard event
 */
function citation_handleKeydown(e) {
  if (e.key === 'Escape') {
    citation_hide();
  }
}

/**
 * Run analysis on text
 * @param {string} text - Text to analyze
 * @param {Object} context - Additional context
 * @param {string} modelKey - Model key to use ('local', 'haiku-4.5', 'sonnet-4.5', 'opus-4.5')
 */
async function citation_runAnalysis(text, context = {}, modelKey = null) {
  if (citation_isLoading || !text || text.trim().length === 0) {
    return;
  }

  // Get model from dropdown if not specified
  if (!modelKey) {
    modelKey = citation_modelDropdown?.value || 'local';
  }

  citation_currentText = text;
  citation_isLoading = true;

  const contentArea = citation_panel?.querySelector('.assist-citation-content');
  const statusBar = citation_panel?.querySelector('.assist-citation-status');
  const actionBtns = citation_panel?.querySelectorAll('.assist-citation-btn');

  const isCloud = modelKey !== 'local';
  const modelName = CITATION_MODELS[modelKey]?.name || modelKey;

  if (contentArea) {
    contentArea.innerHTML = `
      <div class="assist-citation-loading">
        <div class="assist-citation-spinner"></div>
        <span>Analyzing source${isCloud ? ` with ${modelName}` : ''}...</span>
      </div>
    `;
  }

  actionBtns?.forEach(btn => {
    btn.disabled = true;
  });

  try {
    let analysis;
    let isAI = false;
    let usedCloud = false;

    if (isCloud) {
      // Use cloud model (Claude API)
      const response = await citation_analyze(text, context, modelKey);
      analysis = response.analysis;
      isAI = !analysis.isFallback;
      usedCloud = true;

      if (statusBar) {
        statusBar.textContent = `☁️ Analyzed with ${modelName}`;
        statusBar.className = 'assist-citation-status visible success';
      }
    } else {
      // Check local LLM availability
      const llmStatus = await citation_checkLLM();

      if (llmStatus.available) {
        const response = await citation_analyze(text, context, 'local');
        analysis = response.analysis;
        isAI = !analysis.isFallback;

        if (statusBar) {
          statusBar.textContent = '💻 AI-powered analysis complete (Local)';
          statusBar.className = 'assist-citation-status visible success';
        }
      } else {
        analysis = citation_fallback(text, context);

        if (statusBar) {
          statusBar.textContent = '⚠️ Using basic analysis (Ollama not available)';
          statusBar.className = 'assist-citation-status visible';
        }
      }
    }

    citation_currentAnalysis = analysis;
    citation_renderResults(analysis, isAI, usedCloud, modelName);

  } catch (error) {
    console.error('[CitationAnalyzer] Error:', error);

    const fallbackAnalysis = citation_fallback(text, context);
    citation_currentAnalysis = fallbackAnalysis;
    citation_renderResults(fallbackAnalysis, false, false, '');

    if (statusBar) {
      statusBar.textContent = `⚠️ AI unavailable: ${error.message}`;
      statusBar.className = 'assist-citation-status visible error';
    }
  } finally {
    citation_isLoading = false;

    actionBtns?.forEach(btn => {
      btn.disabled = false;
    });
  }
}

/**
 * Copy analysis report to clipboard
 */
async function citation_copy() {
  if (!citation_currentAnalysis) {
    showToast('No analysis to copy');
    return;
  }

  const a = citation_currentAnalysis;
  const report = `CITATION ANALYSIS REPORT
========================
Credibility Score: ${a.credibilityScore}/100 (${a.credibilityRating})
Source Type: ${a.sourceType}

BIAS ASSESSMENT
${a.biasIndicators?.explanation || 'N/A'}
Type: ${a.biasIndicators?.type || 'None'}
Severity: ${a.biasIndicators?.severity || 'None'}

KEY CLAIMS
${a.keyClaims?.map(c => `• ${c}`).join('\n') || 'None extracted'}

STRENGTHS
${a.strengths?.map(s => `✓ ${s}`).join('\n') || 'None identified'}

WEAKNESSES
${a.weaknesses?.map(w => `✗ ${w}`).join('\n') || 'None identified'}

SUMMARY
${a.summary || 'N/A'}

RECOMMENDATIONS
${a.recommendations || 'N/A'}

---
Generated by AssisT Citation Analyzer`;

  try {
    await navigator.clipboard.writeText(report);
    showToast('Report copied to clipboard');
  } catch (error) {
    console.error('[CitationAnalyzer] Copy failed:', error);
    showToast('Failed to copy report');
  }
}

/**
 * Read analysis using TTS
 */
function citation_speak() {
  if (!citation_currentAnalysis) {
    showToast('No analysis to read');
    return;
  }

  const a = citation_currentAnalysis;
  const text = `Citation Analysis. Credibility score: ${a.credibilityScore} out of 100, rated ${a.credibilityRating}.
Source type: ${a.sourceType}.
${a.biasIndicators?.explanation || ''}.
Summary: ${a.summary || 'No summary available'}.`;

  if (typeof window.readText === 'function') {
    const contentArea = citation_panel?.querySelector('.assist-citation-content');
    window.readText(text, contentArea || document.body);
  } else {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Main entry point for citation analysis
 * @param {string} text - Text to analyze
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
async function citation_start(text, selectionRect = null) {
  if (!text || text.trim().length === 0) {
    showToast('No text to analyze');
    return;
  }

  // Extract URL if present in text
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const context = {
    url: urlMatch ? urlMatch[0] : window.location.href,
    title: document.title,
  };

  await citation_show(selectionRect);

  // Get model from dropdown (defaults to feature default when first shown)
  const modelKey = citation_modelDropdown?.value || CITATION_DEFAULT_MODEL;

  citation_runAnalysis(text, context, modelKey);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the citation analyzer feature
 */
function citation_init() {
  console.log('[CitationAnalyzer] Initializing...');

  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.citationAnalyzer = {
    start: citation_start,
    show: citation_show,
    hide: citation_hide,
    analyze: citation_runAnalysis,
    settings: citation_settings,
  };

  // Load settings from storage
  chrome.storage.local.get(['citationAnalyzerSettings'], result => {
    if (result.citationAnalyzerSettings) {
      Object.assign(citation_settings, result.citationAnalyzerSettings);
      console.log('[CitationAnalyzer] Settings loaded:', citation_settings);
    }
  });

  // Listen for settings updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.citationAnalyzerSettings) {
      Object.assign(citation_settings, changes.citationAnalyzerSettings.newValue);
      console.log('[CitationAnalyzer] Settings updated:', citation_settings);
    }
  });

  console.log('[CitationAnalyzer] Feature initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  citation_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  citation_start,
  citation_show,
  citation_hide,
  citation_runAnalysis,
  citation_settings,
};
