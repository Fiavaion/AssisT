/**
 * Multi-Document Comparison Feature
 *
 * Compare multiple text selections or documents to identify similarities,
 * differences, themes, and synthesize information across sources.
 *
 * Features:
 * - Store multiple text selections for comparison
 * - AI-powered comparison and synthesis
 * - Identify common themes and contradictions
 * - Generate comparative summaries
 *
 * @module features/multiDocCompare
 */

import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { injectAIBadgeStyles } from '../../utils/ai-badge.js';
import {
  getAIMode,
  checkAIAvailable,
  generateWithAI,
  getSuccessStatusMessage,
  setAIStatusBar,
} from '../shared/ai-feature-client.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let mdc_panel = null;
let mdc_documents = [];
let mdc_dragCleanup = null; // Cleanup fn for drag listeners when panel is closed
let mdc_isLoading = false; // eslint-disable-line no-unused-vars
let mdc_comparisonResult = null; // eslint-disable-line no-unused-vars

const mdc_settings = {
  maxDocuments: 5,
  minTextLength: 50,
};

// ============================================================================
// CSS STYLES (Injected to document.head to avoid innerHTML stripping)
// ============================================================================

const MDC_PANEL_CSS = `
  #assist-mdc-panel {
    position: fixed;
    top: 70px;
    right: 20px;
    left: auto;
    width: 600px;
    max-width: 90vw;
    max-height: 85vh;
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    z-index: 999998;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    color: #333;
  }

  .mdc-header {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    color: white;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    cursor: move;
    user-select: none;
  }

  .mdc-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .mdc-close {
    background: rgba(255,255,255,0.2);
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .mdc-close:hover {
    background: rgba(255,255,255,0.3);
  }

  .mdc-content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .mdc-doc-list {
    margin-bottom: 20px;
  }

  .mdc-doc-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .mdc-doc-icon {
    font-size: 24px;
  }

  .mdc-doc-info {
    flex: 1;
  }

  .mdc-doc-title {
    font-weight: 600;
    font-size: 14px;
  }

  .mdc-doc-meta {
    font-size: 12px;
    color: #666;
  }

  .mdc-doc-remove {
    background: #ffebee;
    border: none;
    color: #f44336;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
  }

  .mdc-doc-remove:hover {
    background: #ffcdd2;
  }

  .mdc-empty {
    text-align: center;
    padding: 40px;
    color: #666;
  }

  .mdc-empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .mdc-actions {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
  }

  .mdc-btn {
    flex: 1;
    padding: 12px 16px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .mdc-btn-primary {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    color: white;
  }

  .mdc-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(17, 153, 142, 0.3);
  }

  .mdc-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .mdc-btn-secondary {
    background: #f0f0f0;
    color: #333;
  }

  .mdc-btn-secondary:hover {
    background: #e0e0e0;
  }

  .mdc-results {
    display: none;
  }

  .mdc-results.visible {
    display: block;
  }

  .mdc-result-section {
    margin-bottom: 16px;
  }

  .mdc-result-section h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #333 !important;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mdc-result-list {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 12px;
    color: #333;
  }

  .mdc-result-item {
    padding: 6px 0;
    font-size: 13px;
    color: #333;
    border-bottom: 1px solid #eee;
  }

  .mdc-result-item:last-child {
    border-bottom: none;
  }

  .mdc-synthesis {
    background: linear-gradient(135deg, #e8f5e9 0%, #e3f2fd 100%);
    border-radius: 8px;
    padding: 16px;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
  }

  .mdc-agreement {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    margin-left: 8px;
  }

  .mdc-agreement.high {
    background: #c8e6c9;
    color: #2e7d32;
  }

  .mdc-agreement.medium {
    background: #fff3e0;
    color: #ef6c00;
  }

  .mdc-agreement.low {
    background: #ffcdd2;
    color: #c62828;
  }

  .mdc-loading {
    text-align: center;
    padding: 40px;
  }

  .mdc-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #f0f0f0;
    border-top-color: #11998e;
    border-radius: 50%;
    animation: mdc-spin 1s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes mdc-spin {
    to { transform: rotate(360deg); }
  }

  .mdc-tip {
    background: #fff8e1;
    border-radius: 8px;
    padding: 12px;
    font-size: 13px;
    color: #f57f17;
    margin-top: 16px;
  }

  .mdc-status {
    padding: 8px 20px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    font-size: 12px;
    color: #666;
    display: none;
    flex-shrink: 0;
  }

  .mdc-status.visible {
    display: block;
  }

  .mdc-status.error {
    background: #fff3e0;
    color: #e65100;
  }

  .mdc-status[data-assist-clickable]:hover {
    text-decoration: underline;
  }

  .mdc-status.success {
    background: #e8f5e9;
    color: #2e7d32;
  }
`;

/**
 * Inject CSS styles into document head
 */
function mdc_injectStyles() {
  if (document.getElementById('assist-mdc-styles')) {
    return; // Already injected
  }

  const styleEl = document.createElement('style');
  styleEl.id = 'assist-mdc-styles';
  styleEl.textContent = MDC_PANEL_CSS;
  document.head.appendChild(styleEl);
}

// ============================================================================
// DOCUMENT MANAGEMENT
// ============================================================================

/**
 * Add a document/text selection for comparison
 * @param {string} text - Text content
 * @param {string} title - Optional title/source
 * @returns {boolean} Success status
 */
function mdc_addDocument(text, title = null) {
  if (!text || text.trim().length < mdc_settings.minTextLength) {
    console.warn('[MultiDocCompare] Text too short');
    return false;
  }

  if (mdc_documents.length >= mdc_settings.maxDocuments) {
    console.warn('[MultiDocCompare] Maximum documents reached');
    return false;
  }

  const doc = {
    id: Date.now(),
    text: text.trim(),
    title: title || `Source ${mdc_documents.length + 1}`,
    addedAt: new Date().toISOString(),
    wordCount: text.trim().split(/\s+/).length,
  };

  mdc_documents.push(doc);
  console.log(`[MultiDocCompare] Added document: ${doc.title} (${doc.wordCount} words)`);

  // Update panel if visible
  if (mdc_panel) {
    mdc_updateDocumentList();
  }

  return true;
}

/**
 * Remove a document
 * @param {number} id - Document ID
 */
function mdc_removeDocument(id) {
  mdc_documents = mdc_documents.filter(d => d.id !== id);
  if (mdc_panel) {
    mdc_updateDocumentList();
  }
}

/**
 * Clear all documents
 */
function mdc_clearDocuments() {
  mdc_documents = [];
  mdc_comparisonResult = null;
  if (mdc_panel) {
    mdc_updateDocumentList();
    mdc_clearResults();
  }
}

// ============================================================================
// AI COMPARISON
// ============================================================================

/**
 * Compare documents using AI
 * @returns {Promise<Object>} Comparison result
 */
async function mdc_compareDocuments() {
  console.log('[MDC] mdc_compareDocuments() called');
  console.log('[MDC] documents count:', mdc_documents.length);

  if (mdc_documents.length < 2) {
    console.warn('[MDC] Not enough documents — need at least 2, have:', mdc_documents.length);
    throw new Error('Need at least 2 documents to compare');
  }

  // Get current AI mode
  console.log('[MDC] Getting AI mode...');
  const modeInfo = await getAIMode('multiDocCompare');
  console.log('[MDC] AI mode:', modeInfo);
  const availability = await checkAIAvailable(modeInfo);
  console.log('[MDC] AI availability:', availability);

  if (!availability.available) {
    if (availability.needsApiKey) {
      mdc_showApiKeyWarning();
      return null;
    }
    // AI unavailable — show status bar and fall back to heuristic
    const statusBar = mdc_panel?.querySelector('#mdc-status');
    if (statusBar) {
      setAIStatusBar(statusBar, availability, 'mdc-status');
    }
    const fallback = mdc_heuristicCompare();
    mdc_comparisonResult = fallback;
    mdc_displayResults(fallback);
    return fallback;
  }

  mdc_isLoading = true;
  mdc_updateLoadingState(true);

  // Prepare documents for comparison
  const docSummaries = mdc_documents
    .map((d, i) => `[Source ${i + 1}: ${d.title}]\n${d.text.substring(0, 1500)}`)
    .join('\n\n---\n\n');

  const prompt = `You are an expert at comparative analysis. Compare the following ${mdc_documents.length} sources and provide a structured analysis.

${docSummaries}

Analyze these sources and provide a comparison in the following JSON format:
{
  "commonThemes": ["theme 1", "theme 2"],
  "keyDifferences": ["difference 1", "difference 2"],
  "contradictions": ["contradiction 1 if any"],
  "uniqueInsights": [
    {"source": 1, "insight": "unique point from source 1"},
    {"source": 2, "insight": "unique point from source 2"}
  ],
  "synthesis": "A 2-3 sentence synthesis combining insights from all sources",
  "recommendations": "Which source(s) to prioritize and why",
  "agreement_level": "high/medium/low"
}

Rules:
- Be specific about what each source says
- Identify actual contradictions, not just different focus areas
- The synthesis should integrate information, not just summarize
- Respond with ONLY valid JSON`;

  try {
    const aiResult = await generateWithAI(prompt, modeInfo, {
      maxTokens: 1200,
      temperature: 0.3,
      feature: 'multiDocCompare',
    });

    console.log(`[MultiDocCompare] AI response (${modeInfo.displayLabel}):`, aiResult?.text);

    if (aiResult && aiResult.text) {
      // Parse JSON response
      const jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        mdc_comparisonResult = parsed;
        mdc_displayResults(parsed);
        const statusBar = mdc_panel?.querySelector('#mdc-status');
        if (statusBar) {
          statusBar.className = 'mdc-status visible success';
          statusBar.textContent = getSuccessStatusMessage(modeInfo, 'compared');
        }
        return parsed;
      }
    }

    // Fallback to heuristic comparison
    console.log('[MultiDocCompare] Using heuristic comparison');
    const fallback = mdc_heuristicCompare();
    mdc_comparisonResult = fallback;
    mdc_displayResults(fallback);
    return fallback;
  } catch (error) {
    console.error('[MultiDocCompare] Comparison failed:', error);
    const fallback = mdc_heuristicCompare();
    mdc_comparisonResult = fallback;
    mdc_displayResults(fallback);
    return fallback;
  } finally {
    mdc_isLoading = false;
    mdc_updateLoadingState(false);
  }
}

/**
 * Heuristic comparison fallback
 * @returns {Object} Comparison result
 */
function mdc_heuristicCompare() {
  // Extract keywords from each document
  const docKeywords = mdc_documents.map(doc => {
    const words = doc.text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 4);

    const freq = {};
    words.forEach(w => (freq[w] = (freq[w] || 0) + 1));

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  });

  // Find common keywords
  const allKeywords = docKeywords.flat();
  const keywordCounts = {};
  allKeywords.forEach(k => (keywordCounts[k] = (keywordCounts[k] || 0) + 1));

  const commonKeywords = Object.entries(keywordCounts)
    .filter(([_, count]) => count >= 2)
    .map(([word]) => word)
    .slice(0, 5);

  // Find unique keywords per document
  const uniqueInsights = mdc_documents.map((doc, i) => {
    const unique = docKeywords[i].filter(k => keywordCounts[k] === 1).slice(0, 2);
    return {
      source: i + 1,
      insight:
        unique.length > 0 ? `Focuses on: ${unique.join(', ')}` : 'Similar focus to other sources',
    };
  });

  // Calculate word count differences
  const wordCounts = mdc_documents.map(d => d.wordCount);
  // const _avgWords = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length; // Reserved for future use

  return {
    commonThemes:
      commonKeywords.length > 0
        ? commonKeywords.map(k => `Both discuss "${k}"`)
        : ['Sources cover related topics'],
    keyDifferences: [
      `Word counts vary: ${Math.min(...wordCounts)} to ${Math.max(...wordCounts)} words`,
      uniqueInsights.some(u => u.insight.includes('Focuses'))
        ? 'Different emphasis areas detected'
        : 'Similar coverage scope',
    ],
    contradictions: [],
    uniqueInsights,
    synthesis: `These ${mdc_documents.length} sources share common ground around ${commonKeywords.slice(0, 2).join(' and ') || 'related themes'}, while each brings unique perspectives.`,
    recommendations:
      wordCounts.indexOf(Math.max(...wordCounts)) !== -1
        ? `Source ${wordCounts.indexOf(Math.max(...wordCounts)) + 1} provides the most detailed coverage.`
        : 'All sources provide comparable depth.',
    agreement_level:
      commonKeywords.length > 3 ? 'high' : commonKeywords.length > 1 ? 'medium' : 'low',
    isHeuristic: true,
  };
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the comparison panel
 * @returns {HTMLElement}
 */
function mdc_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-mdc-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Multi-Document Comparison');
  panel.tabIndex = -1;

  // CSS is now injected into document.head via mdc_injectStyles()

  panel.innerHTML = `
    <div class="mdc-header">
      <h3>📊 Compare Documents</h3>
      <button class="mdc-close" aria-label="Close">&times;</button>
    </div>
    <div class="mdc-status" id="mdc-status"></div>
    <div class="mdc-content">
      <div class="mdc-doc-list" id="mdc-doc-list">
        <div class="mdc-empty" id="mdc-empty">
          <div class="mdc-empty-icon">📄</div>
          <div>No documents added yet</div>
          <div style="font-size: 13px; margin-top: 8px;">Select text and click "Add to Compare" to begin</div>
        </div>
      </div>

      <div class="mdc-actions">
        <button class="mdc-btn mdc-btn-secondary" id="mdc-add-btn">+ Add Selection</button>
        <button class="mdc-btn mdc-btn-primary" id="mdc-compare-btn" disabled>Compare Documents</button>
      </div>

      <div class="mdc-loading" id="mdc-loading" style="display: none;">
        <div class="mdc-spinner"></div>
        <div>Analyzing and comparing documents...</div>
      </div>

      <div class="mdc-results" id="mdc-results">
        <div class="mdc-result-section" id="mdc-themes-section">
          <h4>🎯 Common Themes <span class="mdc-agreement" id="mdc-agreement"></span></h4>
          <div class="mdc-result-list" id="mdc-themes"></div>
        </div>

        <div class="mdc-result-section" id="mdc-differences-section">
          <h4>⚡ Key Differences</h4>
          <div class="mdc-result-list" id="mdc-differences"></div>
        </div>

        <div class="mdc-result-section" id="mdc-contradictions-section" style="display: none;">
          <h4>⚠️ Contradictions</h4>
          <div class="mdc-result-list" id="mdc-contradictions"></div>
        </div>

        <div class="mdc-result-section" id="mdc-insights-section">
          <h4>💡 Unique Insights</h4>
          <div class="mdc-result-list" id="mdc-insights"></div>
        </div>

        <div class="mdc-result-section" id="mdc-synthesis-section">
          <h4>📝 Synthesis</h4>
          <div class="mdc-synthesis" id="mdc-synthesis"></div>
        </div>
      </div>

      <div class="mdc-tip" id="mdc-tip">
        💡 Tip: Select text from different sources and add them to compare perspectives.
      </div>
    </div>
  `;

  return panel;
}

/**
 * Update the document list display
 */
function mdc_updateDocumentList() {
  const listEl = document.getElementById('mdc-doc-list');
  const emptyEl = document.getElementById('mdc-empty');
  const compareBtn = document.getElementById('mdc-compare-btn');

  if (!listEl) {
    return;
  }

  if (mdc_documents.length === 0) {
    emptyEl.style.display = 'block';
    listEl.querySelectorAll('.mdc-doc-item').forEach(el => el.remove());
    if (compareBtn) {
      compareBtn.disabled = true;
    }
    return;
  }

  emptyEl.style.display = 'none';

  // Clear existing items (except empty state)
  listEl.querySelectorAll('.mdc-doc-item').forEach(el => el.remove());

  // Add document items
  mdc_documents.forEach((doc, _index) => {
    const item = document.createElement('div');
    item.className = 'mdc-doc-item';
    item.innerHTML = sanitizeHTML(`
      <div class="mdc-doc-icon">📄</div>
      <div class="mdc-doc-info">
        <div class="mdc-doc-title">${doc.title}</div>
        <div class="mdc-doc-meta">${doc.wordCount} words • ${doc.text.substring(0, 50)}...</div>
      </div>
      <button class="mdc-doc-remove" data-id="${doc.id}" aria-label="Remove">×</button>
    `);
    listEl.appendChild(item);

    // Add remove handler
    attachInteractiveHandler(item.querySelector('.mdc-doc-remove'), 'Multi-Doc Remove Button', () =>
      mdc_removeDocument(doc.id)
    );
  });

  // Enable compare button if 2+ documents
  if (compareBtn) {
    compareBtn.disabled = mdc_documents.length < 2;
  }
}

/**
 * Helper to extract text from item (handles both strings and objects)
 * @param {string|Object} item - Item to extract text from
 * @returns {string} Text content
 */
function mdc_extractText(item) {
  if (typeof item === 'string') {
    return item;
  }
  if (typeof item === 'object' && item !== null) {
    // Try common text property names
    return item.text || item.description || item.content || item.message || JSON.stringify(item);
  }
  return String(item);
}

/**
 * Display comparison results
 * @param {Object} result - Comparison result
 */
function mdc_displayResults(result) {
  const resultsEl = document.getElementById('mdc-results');
  if (!resultsEl) {
    return;
  }

  resultsEl.classList.add('visible');
  document.getElementById('mdc-tip').style.display = 'none';

  // Agreement level
  const agreementEl = document.getElementById('mdc-agreement');
  if (agreementEl) {
    agreementEl.textContent = result.agreement_level;
    agreementEl.className = `mdc-agreement ${result.agreement_level}`;
  }

  // Common themes - only show if there are themes
  const themesSection = document.getElementById('mdc-themes-section');
  const themesEl = document.getElementById('mdc-themes');
  if (themesEl && result.commonThemes && result.commonThemes.length > 0) {
    if (themesSection) {
      themesSection.style.display = 'block';
    }
    themesEl.innerHTML = sanitizeHTML(
      result.commonThemes
        .map(t => `<div class="mdc-result-item">• ${mdc_extractText(t)}</div>`)
        .join('')
    );
  } else if (themesSection) {
    themesSection.style.display = 'none';
  }

  // Differences - only show if there are actual differences
  const diffsSection = document.getElementById('mdc-differences-section');
  const diffsEl = document.getElementById('mdc-differences');
  if (diffsEl && result.keyDifferences && result.keyDifferences.length > 0) {
    if (diffsSection) {
      diffsSection.style.display = 'block';
    }
    diffsEl.innerHTML = sanitizeHTML(
      result.keyDifferences
        .map(d => `<div class="mdc-result-item">• ${mdc_extractText(d)}</div>`)
        .join('')
    );
  } else if (diffsSection) {
    diffsSection.style.display = 'none';
  }

  // Contradictions - only show if there are contradictions
  const contradictionsSection = document.getElementById('mdc-contradictions-section');
  const contradictionsEl = document.getElementById('mdc-contradictions');
  if (contradictionsSection && result.contradictions && result.contradictions.length > 0) {
    contradictionsSection.style.display = 'block';
    contradictionsEl.innerHTML = sanitizeHTML(
      result.contradictions
        .map(c => `<div class="mdc-result-item">• ${mdc_extractText(c)}</div>`)
        .join('')
    );
  } else if (contradictionsSection) {
    contradictionsSection.style.display = 'none';
  }

  // Unique insights - only show if there are insights
  const insightsSection = document.getElementById('mdc-insights-section');
  const insightsEl = document.getElementById('mdc-insights');
  if (insightsEl && result.uniqueInsights && result.uniqueInsights.length > 0) {
    if (insightsSection) {
      insightsSection.style.display = 'block';
    }
    insightsEl.innerHTML = sanitizeHTML(
      result.uniqueInsights
        .map(u => {
          const insight = typeof u === 'object' ? u.insight || u.text || '' : u;
          const source = typeof u === 'object' ? u.source : '';
          return source
            ? `<div class="mdc-result-item"><strong>Source ${source}:</strong> ${insight}</div>`
            : `<div class="mdc-result-item">• ${insight}</div>`;
        })
        .join('')
    );
  } else if (insightsSection) {
    insightsSection.style.display = 'none';
  }

  // Synthesis
  const synthesisEl = document.getElementById('mdc-synthesis');
  if (synthesisEl && result.synthesis) {
    synthesisEl.textContent = mdc_extractText(result.synthesis);
  }
}

/**
 * Clear results display
 */
function mdc_clearResults() {
  const resultsEl = document.getElementById('mdc-results');
  if (resultsEl) {
    resultsEl.classList.remove('visible');
  }
  document.getElementById('mdc-tip').style.display = 'block';
}

/**
 * Update loading state
 * @param {boolean} loading
 */
function mdc_updateLoadingState(loading) {
  const loadingEl = document.getElementById('mdc-loading');
  const actionsEl = document.querySelector('.mdc-actions');
  const resultsEl = document.getElementById('mdc-results');

  if (loadingEl) {
    loadingEl.style.display = loading ? 'block' : 'none';
  }
  if (actionsEl) {
    actionsEl.style.display = loading ? 'none' : 'flex';
  }
  if (resultsEl && loading) {
    resultsEl.classList.remove('visible');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the comparison panel
 * @param {string} initialText - Optional initial text to add
 */
function mdc_show(initialText = null) {
  if (mdc_panel) {
    if (mdc_dragCleanup) {
      mdc_dragCleanup();
    }
    mdc_panel.remove();
    mdc_panel = null;
  }

  // Inject CSS to document.head before creating panel
  mdc_injectStyles();

  mdc_panel = mdc_createPanel();
  document.body.appendChild(mdc_panel);

  // Add initial text if provided
  if (initialText) {
    mdc_addDocument(initialText);
  }

  mdc_updateDocumentList();

  // Setup event handlers
  const closeBtn = mdc_panel.querySelector('.mdc-close');
  if (closeBtn) {
    attachInteractiveHandler(closeBtn, 'Multi-Doc Close Button', mdc_hide);
  }

  const addBtn = document.getElementById('mdc-add-btn');
  if (addBtn) {
    attachInteractiveHandler(addBtn, 'Multi-Doc Add Button', () => {
      const selection = window.getSelection().toString().trim();
      if (selection) {
        mdc_addDocument(selection);
      } else {
        alert('Please select some text first');
      }
    });
  }

  const compareBtn = document.getElementById('mdc-compare-btn');
  if (compareBtn) {
    console.log('[MDC] Wiring compare button, disabled:', compareBtn.disabled);
    attachInteractiveHandler(compareBtn, 'Multi-Doc Compare Button', () => {
      console.log(
        '[MDC] Compare button clicked! disabled:',
        compareBtn.disabled,
        'docs:',
        mdc_documents.length
      );
      mdc_compareDocuments().catch(err => console.error('[MDC] compareDocuments threw:', err));
    });
  } else {
    console.error('[MDC] Compare button NOT FOUND in DOM');
  }

  // Drag-to-move on header (Pointer Events API + setPointerCapture)
  // setPointerCapture routes all subsequent pointer events to the header element
  // for the duration of the gesture — no document-level listeners needed, and it
  // works reliably even if the pointer moves outside the element mid-drag.
  const header = mdc_panel.querySelector('.mdc-header');
  if (header) {
    const onPointerDown = e => {
      // Only drag on left button; ignore clicks on the close button
      if (e.button !== 0 || e.target.classList.contains('mdc-close')) {
        return;
      }

      console.log('[MDC] pointerdown on header — starting drag');

      // Switch from right-anchored CSS to explicit left/top for drag
      const rect = mdc_panel.getBoundingClientRect();
      mdc_panel.style.right = 'auto';
      mdc_panel.style.left = `${rect.left}px`;
      mdc_panel.style.top = `${rect.top}px`;

      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      mdc_panel.style.userSelect = 'none';

      // Capture pointer so move/up events route here even outside the element
      header.setPointerCapture(e.pointerId);

      const onMove = evt => {
        const panelW = mdc_panel.offsetWidth;
        const panelH = mdc_panel.offsetHeight;
        const newLeft = Math.max(0, Math.min(evt.clientX - offsetX, window.innerWidth - panelW));
        const newTop = Math.max(0, Math.min(evt.clientY - offsetY, window.innerHeight - panelH));
        mdc_panel.style.left = `${newLeft}px`;
        mdc_panel.style.top = `${newTop}px`;
      };

      const onUp = () => {
        mdc_panel.style.userSelect = '';
        header.removeEventListener('pointermove', onMove);
        header.removeEventListener('pointerup', onUp);
      };

      header.addEventListener('pointermove', onMove);
      header.addEventListener('pointerup', onUp);

      e.preventDefault();
    };

    header.addEventListener('pointerdown', onPointerDown);

    // Store cleanup so mdc_hide can remove the persistent drag listener
    mdc_dragCleanup = () => {
      header.removeEventListener('pointerdown', onPointerDown);
      mdc_dragCleanup = null;
    };
  }

  // Escape to close
  document.addEventListener('keydown', mdc_handleKeydown);

  mdc_panel.focus();
}

/**
 * Hide the panel
 */
function mdc_hide() {
  if (mdc_dragCleanup) {
    mdc_dragCleanup();
  }
  if (mdc_panel) {
    mdc_panel.remove();
    mdc_panel = null;
  }
  document.removeEventListener('keydown', mdc_handleKeydown);
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} e
 */
function mdc_handleKeydown(e) {
  if (e.key === 'Escape' && mdc_panel) {
    mdc_hide();
  }
}

// ============================================================================
// API KEY WARNING
// ============================================================================

/**
 * Show API key warning when cloud mode is enabled but no key is configured
 */
function mdc_showApiKeyWarning() {
  const resultsDiv = mdc_panel?.querySelector('.mdc-results');
  const emptyDiv = mdc_panel?.querySelector('.mdc-empty');

  if (emptyDiv) {
    emptyDiv.style.display = 'block';
    emptyDiv.innerHTML = sanitizeHTML(`
      <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
      <h3 style="margin: 0 0 12px 0; color: #333;">API Key Required</h3>
      <p style="color: #666; margin-bottom: 16px; line-height: 1.5;">
        Cloud AI mode is enabled but no API key is configured.<br>
        Please add your Anthropic API key to use cloud features.
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
        <button class="mdc-open-settings" style="
          background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">⚙️ Open Advanced Options</button>
        <button class="mdc-use-local" style="
          background: #6b7280;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">💻 Use Local AI Instead</button>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 16px;">
        Go to: Extension Popup → Advanced Options → AI tab → Enter API Key
      </p>
    `);

    // Attach handlers for buttons
    const openSettingsBtn = emptyDiv.querySelector('.mdc-open-settings');
    if (openSettingsBtn) {
      attachInteractiveHandler(openSettingsBtn, 'Open Settings Button', () => {
        chrome.runtime.sendMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
        alert(
          'To add your API key:\n\n1. Click the AssisT extension icon\n2. Click "Advanced Options"\n3. Go to the "AI" tab\n4. Select your AI provider and enter your API key\n5. Click Save'
        );
      });
    }

    const useLocalBtn = emptyDiv.querySelector('.mdc-use-local');
    if (useLocalBtn) {
      attachInteractiveHandler(useLocalBtn, 'Use Local AI Button', async () => {
        await chrome.storage.local.set({ aiMode: 'local' });
        console.log('[MultiDocCompare] Switched to local AI mode');
        mdc_showEmptyState();
      });
    }
  }

  if (resultsDiv) {
    resultsDiv.style.display = 'none';
    resultsDiv.classList.remove('visible');
  }
}

/**
 * Show the empty state
 */
function mdc_showEmptyState() {
  const emptyDiv = mdc_panel?.querySelector('.mdc-empty');
  if (emptyDiv) {
    emptyDiv.style.display = 'block';
    emptyDiv.innerHTML = sanitizeHTML(`
      <div class="mdc-empty-icon">📄</div>
      <p>Select text from different sources and add them here to compare.</p>
      <p style="font-size: 13px; margin-top: 12px;">Now using Local AI mode.</p>
    `);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize multi-document comparison
 */
function mdc_init() {
  console.log('[MultiDocCompare] Initializing...');
  injectAIBadgeStyles();

  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.multiDocCompare = {
    show: mdc_show,
    hide: mdc_hide,
    addDocument: mdc_addDocument,
    removeDocument: mdc_removeDocument,
    clearDocuments: mdc_clearDocuments,
    compare: mdc_compareDocuments,
    getDocuments: () => [...mdc_documents],
    settings: mdc_settings,
  };

  console.log('[MultiDocCompare] Initialized and registered');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  mdc_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { mdc_show, mdc_hide, mdc_addDocument, mdc_compareDocuments, mdc_settings };
