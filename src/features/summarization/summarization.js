/**
 * Smart Summarization Feature
 *
 * Provides AI-powered text summarization using local LLM (Ollama).
 * Integrates with the highlight menu for quick access via text selection.
 *
 * Features:
 * - Three summary levels: brief, moderate, detailed
 * - Floating summary panel with copy/TTS options
 * - Graceful fallback when LLM is unavailable
 * - Keyboard accessible (Escape to close)
 * - Settings persistence via Chrome storage
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - Uses service worker bridge for LLM communication
 * - Registers to window.assistFeatures for integration
 *
 * @module features/summarization
 */

import { showToast } from '../../core/ui/toast.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { getAIBadgeInfo, renderAIBadge, injectAIBadgeStyles } from '../../utils/ai-badge.js';
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

let summarization_panel = null;
let summarization_isLoading = false;
let summarization_currentText = '';
let summarization_currentSummary = '';

const summarization_settings = {
  enabled: true,
  defaultLevel: 'brief', // 'brief' | 'moderate' | 'detailed'
  showInHighlightMenu: true,
};

// ============================================================================
// LLM BRIDGE COMMUNICATION
// (Routing delegated to shared/ai-feature-client.js)
// ============================================================================

// ============================================================================
// FALLBACK SUMMARIZATION (No LLM)
// ============================================================================

/**
 * Generate a basic extractive summary when LLM is unavailable
 * Uses sentence scoring based on word frequency
 * @param {string} text - Text to summarize
 * @param {string} level - Summary level
 * @returns {string} Extractive summary
 */
function summarization_fallback(text, level = 'brief') {
  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  if (sentences.length <= 2) {
    return text.trim();
  }

  // Calculate word frequency
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  const wordFreq = {};
  const stopWords = new Set([
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
    'of',
    'to',
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
    'and',
    'but',
    'or',
    'nor',
    'so',
    'yet',
    'both',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'not',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'just',
    'also',
    'now',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'any',
    'both',
    'each',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'he',
    'she',
    'they',
    'them',
    'their',
    'what',
    'which',
    'who',
    'whom',
  ]);

  for (const word of words) {
    if (!stopWords.has(word) && word.length > 2) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  // Score sentences
  const scoredSentences = sentences.map((sentence, index) => {
    const sentenceWords = sentence.toLowerCase().match(/\b[a-z]+\b/g) || [];
    let score = 0;

    for (const word of sentenceWords) {
      score += wordFreq[word] || 0;
    }

    // Boost first sentence
    if (index === 0) {
      score *= 1.5;
    }

    return { sentence: sentence.trim(), score, index };
  });

  // Sort by score and select top sentences
  scoredSentences.sort((a, b) => b.score - a.score);

  const numSentences = level === 'detailed' ? 5 : level === 'moderate' ? 3 : 1;
  const topSentences = scoredSentences.slice(0, Math.min(numSentences, sentences.length));

  // Sort by original order
  topSentences.sort((a, b) => a.index - b.index);

  return topSentences.map(s => s.sentence).join(' ');
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Creates the floating summary panel
 * @returns {HTMLElement} Panel element
 */
function summarization_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-summarization-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Text Summary');
  panel.setAttribute('aria-modal', 'true');

  panel.innerHTML = sanitizeHTML(`
    <div class="assist-summary-header">
      <span class="assist-summary-title">Summary</span>
      <div class="assist-summary-controls">
        <select class="assist-summary-level" aria-label="Summary detail level">
          <option value="brief">Brief</option>
          <option value="moderate">Moderate</option>
          <option value="detailed">Detailed</option>
        </select>
        <button class="assist-summary-close" aria-label="Close summary" title="Close (Esc)">×</button>
      </div>
    </div>
    <div class="assist-summary-status"></div>
    <div class="assist-summary-content" aria-live="polite">
      <p class="assist-summary-placeholder">Select text and click summarize...</p>
    </div>
    <div class="assist-summary-actions">
      <button class="assist-summary-btn assist-summary-copy" aria-label="Copy summary">
        <span class="assist-summary-btn-icon">📋</span> Copy
      </button>
      <button class="assist-summary-btn assist-summary-speak" aria-label="Read summary aloud">
        <span class="assist-summary-btn-icon">🔊</span> Read
      </button>
      <button class="assist-summary-btn assist-summary-regenerate" aria-label="Regenerate summary">
        <span class="assist-summary-btn-icon">🔄</span> Regenerate
      </button>
    </div>
  `);

  // Inject styles
  summarization_injectStyles();

  // Add event listeners
  const closeBtn = panel.querySelector('.assist-summary-close');
  attachInteractiveHandler(closeBtn, 'Summarization Close Button', summarization_hide);

  const levelSelect = panel.querySelector('.assist-summary-level');
  levelSelect.value = summarization_settings.defaultLevel;
  levelSelect.addEventListener('change', e => {
    summarization_settings.defaultLevel = e.target.value;
    if (summarization_currentText) {
      summarization_summarize(summarization_currentText, e.target.value);
    }
  });

  const copyBtn = panel.querySelector('.assist-summary-copy');
  attachInteractiveHandler(copyBtn, 'Summarization Copy Button', summarization_copy);

  const speakBtn = panel.querySelector('.assist-summary-speak');
  attachInteractiveHandler(speakBtn, 'Summarization Speak Button', summarization_speak);

  const regenerateBtn = panel.querySelector('.assist-summary-regenerate');
  attachInteractiveHandler(regenerateBtn, 'Summarization Regenerate Button', () => {
    if (summarization_currentText) {
      summarization_summarize(summarization_currentText, summarization_settings.defaultLevel);
    }
  });

  // Make panel draggable
  summarization_makeDraggable(panel);

  return panel;
}

/**
 * Injects CSS styles for the summarization panel
 */
function summarization_injectStyles() {
  if (document.getElementById('assist-summarization-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'assist-summarization-styles';
  style.textContent = `
    #assist-summarization-panel {
      position: fixed;
      top: 100px;
      right: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      max-height: 500px;
      background: #ffffff;
      color: #333;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      z-index: 999998;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .assist-summary-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      cursor: move;
    }

    .assist-summary-title {
      font-weight: 600;
      font-size: 15px;
    }

    .assist-summary-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .assist-summary-level {
      padding: 4px 8px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      font-size: 12px;
      cursor: pointer;
    }

    .assist-summary-level option {
      color: #333;
      background: white;
    }

    .assist-summary-close {
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

    .assist-summary-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .assist-summary-status {
      padding: 8px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      display: none;
    }

    .assist-summary-status.visible {
      display: block;
    }

    .assist-summary-status.error {
      background: #fff3e0;
      color: #e65100;
    }

    .assist-summary-status[data-assist-clickable]:hover {
      text-decoration: underline;
    }

    .assist-summary-status.success {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .assist-summary-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      line-height: 1.6;
      color: #333;
    }

    .assist-summary-placeholder {
      color: #999;
      font-style: italic;
      text-align: center;
      margin: 20px 0;
    }

    .assist-summary-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 20px;
      color: #666;
    }

    .assist-summary-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e0e0e0;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: assist-spin 0.8s linear infinite;
    }

    @keyframes assist-spin {
      to { transform: rotate(360deg); }
    }

    .assist-summary-text {
      margin: 0;
      white-space: pre-wrap;
    }

    .assist-summary-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #f8f9fa;
      border-top: 1px solid #e0e0e0;
    }

    .assist-summary-btn {
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

    .assist-summary-btn:hover {
      background: #f0f0f0;
      border-color: #ccc;
    }

    .assist-summary-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .assist-summary-btn-icon {
      font-size: 14px;
    }

    /* AI indicator */
    .assist-summary-ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    .assist-summary-fallback-badge {
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

    .assist-summary-cloud-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #00b4db 0%, #0083b0 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    /* Model dropdown in actions bar */
    .assist-summary-model-container {
      display: flex;
      align-items: center;
      margin-right: auto;
    }

    .assist-summary-model-container .assist-model-label {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      margin: 0;
    }

    .assist-summary-model-container .assist-model-icon {
      font-size: 14px;
      line-height: 1;
    }

    .assist-summary-model-select {
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 11px;
      font-family: inherit;
      background: white;
      cursor: pointer;
      min-width: 90px;
    }

    .assist-summary-model-select:hover {
      border-color: #bbb;
    }

    .assist-summary-model-select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      #assist-summarization-panel {
        background: #1e1e1e;
        border-color: #333;
        color: #e0e0e0;
      }

      .assist-summary-content {
        color: #e0e0e0;
      }

      .assist-summary-status {
        background: #2d2d2d;
        border-color: #333;
        color: #aaa;
      }

      .assist-summary-actions {
        background: #252525;
        border-color: #333;
      }

      .assist-summary-btn {
        background: #2d2d2d;
        border-color: #444;
        color: #e0e0e0;
      }

      .assist-summary-btn:hover {
        background: #3d3d3d;
      }

      .assist-summary-model-select {
        background: #2d2d2d;
        color: #e0e0e0;
        border-color: #444;
      }

      .assist-summary-model-select:hover {
        border-color: #666;
      }

      .assist-summary-model-select:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3);
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Make the panel draggable
 * @param {HTMLElement} panel - Panel element
 */
function summarization_makeDraggable(panel) {
  const header = panel.querySelector('.assist-summary-header');
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  header.addEventListener('mousedown', e => {
    if (e.target.closest('.assist-summary-controls')) {
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
    if (!isDragging) {
      return;
    }

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const newLeft = Math.max(
      0,
      Math.min(window.innerWidth - panel.offsetWidth, startLeft + deltaX)
    );
    const newTop = Math.max(
      0,
      Math.min(window.innerHeight - panel.offsetHeight, startTop + deltaY)
    );

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Show the summarization panel
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
function summarization_show(selectionRect = null) {
  if (summarization_panel) {
    summarization_panel.remove();
  }

  summarization_panel = summarization_createPanel();
  document.body.appendChild(summarization_panel);

  // Position near selection if available
  if (selectionRect) {
    const panelRect = summarization_panel.getBoundingClientRect();
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

    summarization_panel.style.left = `${left}px`;
    summarization_panel.style.top = `${top}px`;
    summarization_panel.style.right = 'auto';
  }

  // Add keyboard listener for Escape
  document.addEventListener('keydown', summarization_handleKeydown);

  // Focus the panel for accessibility
  summarization_panel.focus();
}

/**
 * Hide the summarization panel
 */
function summarization_hide() {
  if (summarization_panel) {
    summarization_panel.remove();
    summarization_panel = null;
  }

  document.removeEventListener('keydown', summarization_handleKeydown);
  summarization_isLoading = false;
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} e - Keyboard event
 */
function summarization_handleKeydown(e) {
  if (e.key === 'Escape') {
    summarization_hide();
  }
}

/**
 * Summarize text and update panel
 * @param {string} text - Text to summarize
 * @param {string} level - Summary level
 */
async function summarization_summarize(text, level = 'brief') {
  if (summarization_isLoading || !text || text.trim().length === 0) {
    return;
  }

  summarization_currentText = text;
  summarization_isLoading = true;

  const contentArea = summarization_panel?.querySelector('.assist-summary-content');
  const statusBar = summarization_panel?.querySelector('.assist-summary-status');
  const actionBtns = summarization_panel?.querySelectorAll('.assist-summary-btn');

  // Resolve mode and build the level-aware prompt
  const modeInfo = await getAIMode('summarization');

  if (contentArea) {
    contentArea.innerHTML = sanitizeHTML(`
      <div class="assist-summary-loading">
        <div class="assist-summary-spinner"></div>
        <span>Generating ${level} summary${modeInfo.isOff ? '' : ` with ${modeInfo.displayLabel}`}...</span>
      </div>
    `);
  }

  actionBtns?.forEach(btn => {
    btn.disabled = true;
  });

  try {
    let summary;
    let isAI = false;

    // Check availability before generating
    const availability = await checkAIAvailable(modeInfo);

    if (!availability.available) {
      summarization_isLoading = false;
      actionBtns?.forEach(btn => {
        btn.disabled = false;
      });

      if (availability.needsApiKey) {
        summarization_showApiKeyWarning();
        return;
      }

      // Non-cloud unavailability — use extractive fallback
      summary = summarization_fallback(text, level);
      summarization_currentSummary = summary;

      if (statusBar) {
        setAIStatusBar(statusBar, availability, 'assist-summary-status');
      }
      if (contentArea) {
        contentArea.innerHTML = sanitizeHTML(`
          <p class="assist-summary-text">${escapeHtml(summary)}</p>
          ${renderAIBadge('fallback', 'Basic')}
        `);
      }
      return;
    }

    // Build level-aware prompt
    const levelPrompts = {
      brief: 'Summarize in 1-2 sentences, capturing only the main point:',
      moderate: 'Summarize the key points in a short paragraph (3-4 sentences):',
      detailed:
        'Provide a comprehensive summary with main points and supporting details (5-7 sentences):',
    };
    const prompt = `${levelPrompts[level] || levelPrompts.brief}\n\n${text}\n\nSummary:`;
    // Cloud: full budget. Local: cap at 600 — "5-7 sentences" is ~200 tokens;
    // 600 is generous headroom without risking the ~30s Chrome sendMessage window.
    const cloudMax = level === 'detailed' ? 1500 : level === 'moderate' ? 800 : 400;
    const maxTokens = modeInfo.isLocal ? Math.min(cloudMax, 600) : cloudMax;

    const result = await generateWithAI(prompt, modeInfo, {
      maxTokens,
      temperature: 0.5,
      feature: 'summarization',
    });
    summary = result.text;
    isAI = true;

    if (statusBar) {
      statusBar.textContent = getSuccessStatusMessage(modeInfo, 'summary generated');
      statusBar.className = 'assist-summary-status visible success';
    }

    summarization_currentSummary = summary;

    if (contentArea) {
      const badgeInfo = await getAIBadgeInfo();
      contentArea.innerHTML = sanitizeHTML(`
        <p class="assist-summary-text">${escapeHtml(summary)}</p>
        ${isAI ? renderAIBadge(badgeInfo.mode, badgeInfo.label) : renderAIBadge('fallback', 'Basic')}
      `);
    }
  } catch (error) {
    console.error('[Summarization] Error:', error);

    const fallbackSummary = summarization_fallback(text, level);
    summarization_currentSummary = fallbackSummary;

    if (contentArea) {
      contentArea.innerHTML = sanitizeHTML(`
        <p class="assist-summary-text">${escapeHtml(fallbackSummary)}</p>
        <span class="assist-summary-fallback-badge">Basic</span>
      `);
    }
    if (statusBar) {
      statusBar.textContent = `⚠️ AI unavailable: ${error.message}`;
      statusBar.className = 'assist-summary-status visible error';
    }
  } finally {
    summarization_isLoading = false;
    actionBtns?.forEach(btn => {
      btn.disabled = false;
    });
  }
}

/**
 * Copy the current summary to clipboard
 */
async function summarization_copy() {
  if (!summarization_currentSummary) {
    showToast('No summary to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(summarization_currentSummary);
    showToast('Summary copied to clipboard');
  } catch (error) {
    console.error('[Summarization] Copy failed:', error);
    showToast('Failed to copy summary');
  }
}

/**
 * Read the current summary using TTS
 */
function summarization_speak() {
  if (!summarization_currentSummary) {
    showToast('No summary to read');
    return;
  }

  // Use the global readText function if available
  if (typeof window.readText === 'function') {
    const contentArea = summarization_panel?.querySelector('.assist-summary-content');
    window.readText(summarization_currentSummary, contentArea || document.body);
  } else {
    // Fallback to browser TTS
    const utterance = new SpeechSynthesisUtterance(summarization_currentSummary);
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
// API KEY WARNING
// ============================================================================

/**
 * Show API key warning when cloud mode is enabled but no key is configured
 */
function summarization_showApiKeyWarning() {
  const contentArea = summarization_panel?.querySelector('.assist-summary-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
      <h3 style="margin: 0 0 12px 0; color: #333;">API Key Required</h3>
      <p style="color: #666; margin-bottom: 16px; line-height: 1.5;">
        Cloud AI mode is enabled but no API key is configured.<br>
        Please add your Anthropic API key to use cloud features.
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
        <button class="summary-open-settings" style="
          background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">⚙️ Open Advanced Options</button>
        <button class="summary-use-local" style="
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
    </div>
  `);

  // Attach handlers for buttons
  const openSettingsBtn = contentArea.querySelector('.summary-open-settings');
  if (openSettingsBtn) {
    attachInteractiveHandler(openSettingsBtn, 'Open Settings Button', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
      alert(
        'To add your API key:\n\n1. Click the AssisT extension icon\n2. Click "Advanced Options"\n3. Go to the "AI" tab\n4. Select your AI provider and enter your API key\n5. Click Save'
      );
    });
  }

  const useLocalBtn = contentArea.querySelector('.summary-use-local');
  if (useLocalBtn) {
    attachInteractiveHandler(useLocalBtn, 'Use Local AI Button', async () => {
      await chrome.storage.local.set({ aiMode: 'local' });
      console.log('[Summarization] Switched to local AI mode');
      summarization_showEmptyState();
    });
  }
}

/**
 * Show the empty state
 */
function summarization_showEmptyState() {
  const contentArea = summarization_panel?.querySelector('.assist-summary-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div style="text-align: center; padding: 40px 20px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
      <p>Select text on the page and use Summarize to get a quick summary.</p>
      <p style="font-size: 13px; margin-top: 12px;">Now using Local AI mode.</p>
    </div>
  `);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Main entry point for summarization
 * @param {string} text - Text to summarize
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
function summarization_start(text, selectionRect = null) {
  if (!text || text.trim().length === 0) {
    showToast('No text to summarize');
    return;
  }

  // Show the panel
  summarization_show(selectionRect);

  // Start summarization
  summarization_summarize(text, summarization_settings.defaultLevel);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the summarization feature
 */
function summarization_init() {
  console.log('[Summarization] Initializing...');
  injectAIBadgeStyles();

  // Register feature
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.summarization = {
    start: summarization_start,
    show: summarization_show,
    hide: summarization_hide,
    summarize: summarization_summarize,
    settings: summarization_settings,
  };

  // Load settings from storage
  chrome.storage.local.get(['summarizationSettings'], result => {
    if (result.summarizationSettings) {
      Object.assign(summarization_settings, result.summarizationSettings);
      console.log('[Summarization] Settings loaded:', summarization_settings);
    }
  });

  // Listen for settings updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.summarizationSettings) {
      Object.assign(summarization_settings, changes.summarizationSettings.newValue);
      console.log('[Summarization] Settings updated:', summarization_settings);
    }
  });

  console.log('[Summarization] Feature initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  summarization_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  summarization_start,
  summarization_show,
  summarization_hide,
  summarization_summarize,
  summarization_settings,
};
