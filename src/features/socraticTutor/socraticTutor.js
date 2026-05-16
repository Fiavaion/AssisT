/**
 * Socratic Tutor Feature
 *
 * Generates thought-provoking questions to help students understand concepts deeply.
 * Instead of giving direct answers, it prompts critical thinking through guided questioning.
 *
 * Features:
 * - AI-generated Socratic questions based on selected text
 * - Multiple question types: comprehension, analysis, synthesis, evaluation
 * - Floating panel with questions and hints
 * - Graceful fallback when LLM is unavailable
 *
 * @module features/socraticTutor
 */

import { showToast } from '../../core/ui/toast.js';
import { Z } from '../../utils/z-index.js';
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

let tutor_panel = null;
let tutor_currentText = '';
let tutor_currentQuestions = null;

const tutor_settings = {
  enabled: true,
  showInHighlightMenu: true,
  questionCount: 4,
  includeHints: true,
};

// ============================================================================
// LLM BRIDGE COMMUNICATION
// ============================================================================

/**
 * Generate Socratic questions using AI
 * @param {string} text - Text to generate questions about
 * @param {import('../shared/ai-feature-client.js').AIMode} modeInfo - AI mode from getAIMode()
 * @returns {Promise<{questions: Object}>} Generated questions object
 */
async function tutor_generate(text, modeInfo) {
  // Truncate input to avoid token overflow
  const truncatedText = text.length > 2500 ? text.substring(0, 2500) + '...' : text;

  const maxTokens = modeInfo.isLocal ? 800 : 900;
  const questionCount = Math.min(tutor_settings.questionCount, 4); // Cap at 4 questions

  // Strict, concise prompt
  const prompt = `TASK: Generate ${questionCount} Socratic questions. Return ONLY valid JSON.

TEXT: "${truncatedText}"

OUTPUT FORMAT (no markdown, no explanation):
{"topic":"5 words max","questions":[{"type":"comprehension|analysis|synthesis|evaluation","question":"max 15 words","hint":"max 10 words","followUp":"max 12 words"}],"thinkingPrompt":"max 15 words"}

RULES:
- Exactly ${questionCount} questions
- Keep all text SHORT
- Simple student-friendly language
- Start with { end with }`;

  try {
    const aiResult = await generateWithAI(prompt, modeInfo, {
      maxTokens,
      temperature: 0.5,
      feature: 'socraticTutor',
    });

    if (aiResult && aiResult.text) {
      // Parse JSON from response
      try {
        // Clean response: remove markdown code blocks (various formats)
        let jsonStr = aiResult.text
          .replace(/```json\s*/gi, '')
          .replace(/```JSON\s*/g, '')
          .replace(/```\s*/g, '')
          .replace(/^\s*json\s*/i, '')
          .trim();

        // Extract JSON object
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        // Clean up common JSON issues
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

        const parsed = JSON.parse(jsonStr);

        if (parsed && Array.isArray(parsed.questions)) {
          console.log('[SocraticTutor] JSON parsed successfully');
          return { questions: parsed };
        }

        throw new Error('Invalid JSON structure');
      } catch (parseError) {
        console.warn('[SocraticTutor] JSON parse failed:', parseError.message);
        console.log('[SocraticTutor] Raw response:', aiResult.text.substring(0, 300));
        // Return fallback structure
        return { questions: tutor_fallback(text) };
      }
    }

    throw new Error('Generation failed');
  } catch (error) {
    console.error('[SocraticTutor] Generation failed:', error);
    throw error;
  }
}

// ============================================================================
// HINT FALLBACKS BY QUESTION TYPE
// ============================================================================

/**
 * Return a type-specific hint when the LLM omits one
 */
function _hintFallbackByType(type) {
  const hints = {
    comprehension: 'Look for the central concept or argument being made.',
    analysis: 'Try breaking down the information into smaller pieces.',
    synthesis: 'Think about similar concepts or real-world examples.',
    evaluation: 'Consider what information might be missing or unclear.',
  };
  return hints[type] || 'Re-read the relevant section carefully.';
}

/** Set of all canned/fallback hint strings — hints matching these are not shown */
const CANNED_HINTS = new Set([
  'Look for the central concept or argument being made.',
  'Try breaking down the information into smaller pieces.',
  'Think about similar concepts or real-world examples.',
  'Consider what information might be missing or unclear.',
  'Re-read the relevant section carefully.',
]);

/**
 * Returns true if the hint is a genuine AI-generated hint worth showing.
 * Rejects canned fallbacks and hints that are too short or generic.
 */
function isUsefulHint(hint) {
  if (!hint || hint.trim().length < 15) {
    return false;
  }
  if (CANNED_HINTS.has(hint.trim())) {
    return false;
  }
  return true;
}

// ============================================================================
// FALLBACK (No LLM)
// ============================================================================

/**
 * Generate basic Socratic questions when LLM is unavailable
 * Uses templates based on text analysis
 * @param {string} text - Text to generate questions about
 * @returns {Object} Basic questions object
 */
function tutor_fallback(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

  const topic = sentences[0]?.substring(0, 50).trim() + '...' || 'Selected text';

  const questions = [
    {
      type: 'comprehension',
      question: 'What is the main idea being presented in this text?',
      hint: 'Look for the central concept or argument being made.',
      followUp: 'How would you explain this to someone who has never heard of it?',
    },
    {
      type: 'analysis',
      question: 'What are the key parts or components of this concept?',
      hint: 'Try breaking down the information into smaller pieces.',
      followUp: 'How do these parts relate to each other?',
    },
    {
      type: 'synthesis',
      question: 'How does this connect to something you already know?',
      hint: 'Think about similar concepts or real-world examples.',
      followUp: 'What would happen if you applied this idea in a different context?',
    },
    {
      type: 'evaluation',
      question: 'What questions do you still have about this topic?',
      hint: 'Consider what information might be missing or unclear.',
      followUp: 'How could you find answers to those questions?',
    },
  ];

  return {
    topic,
    questions,
    thinkingPrompt:
      'Take a moment to reflect: Why might this information be important to understand?',
  };
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

// CSS for Socratic Tutor panel (injected separately to avoid sanitization stripping)
const TUTOR_PANEL_CSS = `
  .assist-tutor-header {
    background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
    color: white;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .assist-tutor-title {
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .assist-tutor-close {
    background: rgba(255,255,255,0.2);
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }
  .assist-tutor-close:hover {
    background: rgba(255,255,255,0.3);
  }
  .assist-tutor-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }
  .assist-tutor-topic {
    font-size: 14px;
    color: #666;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #eee;
  }
  .assist-tutor-question {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    border-left: 4px solid #43e97b;
  }
  .assist-tutor-question-type {
    font-size: 11px;
    text-transform: uppercase;
    color: #666;
    margin-bottom: 8px;
    font-weight: 600;
  }
  .assist-tutor-question-text {
    font-size: 15px;
    color: #333;
    line-height: 1.5;
    margin-bottom: 12px;
  }
  .assist-tutor-hint {
    display: none;
    background: #fff3e0;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 13px;
    color: #e65100;
    margin-bottom: 8px;
  }
  .assist-tutor-hint.visible {
    display: block;
  }
  .assist-tutor-hint-btn {
    background: none;
    border: 1px solid #43e97b;
    color: #43e97b;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .assist-tutor-hint-btn:hover {
    background: #43e97b;
    color: white;
  }
  .assist-tutor-followup {
    display: none;
    font-size: 13px;
    color: #666;
    font-style: italic;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #ddd;
  }
  .assist-tutor-followup.visible {
    display: block;
  }
  .assist-tutor-thinking {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px;
    border-radius: 12px;
    margin-top: 16px;
    font-size: 14px;
    line-height: 1.5;
  }
  .assist-tutor-thinking-label {
    font-size: 12px;
    opacity: 0.8;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  .assist-tutor-loading {
    text-align: center;
    padding: 40px;
    color: #666;
  }
  .assist-tutor-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #43e97b;
    border-radius: 50%;
    margin: 0 auto 16px;
    animation: tutor-spin 1s linear infinite;
  }
  @keyframes tutor-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .assist-tutor-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    margin-left: 8px;
  }
  .assist-tutor-ai-badge {
    background: #43e97b;
    color: white;
  }
  .assist-tutor-fallback-badge {
    background: #ff9800;
    color: white;
  }
  .assist-tutor-cloud-badge {
    background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
    color: white;
  }
  .assist-tutor-controls {
    padding: 12px 20px;
    border-top: 1px solid #eee;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .assist-tutor-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  .assist-tutor-btn-primary {
    background: #43e97b;
    color: white;
  }
  .assist-tutor-btn-primary:hover {
    background: #38d96c;
  }
  .assist-tutor-btn-secondary {
    background: #f0f0f0;
    color: #333;
  }
  .assist-tutor-btn-secondary:hover {
    background: #e0e0e0;
  }
  [data-assist-clickable]:hover {
    text-decoration: underline;
  }
  .assist-tutor-status {
    padding: 8px 20px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    font-size: 12px;
    color: #666;
    display: none;
    flex-shrink: 0;
  }
  .assist-tutor-status.visible {
    display: block;
  }
  .assist-tutor-status.error {
    background: #fff3e0;
    color: #e65100;
  }
  .assist-tutor-status[data-assist-clickable]:hover {
    text-decoration: underline;
  }
  .assist-tutor-status.success {
    background: #e8f5e9;
    color: #2e7d32;
  }
`;

/**
 * Inject Socratic Tutor CSS into document head (once)
 */
function tutor_injectStyles() {
  if (document.getElementById('assist-tutor-styles')) {
    return; // Already injected
  }
  const styleEl = document.createElement('style');
  styleEl.id = 'assist-tutor-styles';
  styleEl.textContent = TUTOR_PANEL_CSS;
  document.head.appendChild(styleEl);
}

/**
 * Create the Socratic tutor panel
 * @returns {HTMLElement}
 */
async function tutor_createPanel() {
  // Inject CSS (only once)
  tutor_injectStyles();

  const panel = document.createElement('div');
  panel.id = 'assist-socratic-tutor-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Socratic Tutor');

  // HTML structure only - CSS is injected separately
  panel.innerHTML = sanitizeHTML(`
    <div class="assist-tutor-header">
      <div class="assist-tutor-title">
        <span>🎓</span>
        <span>Socratic Tutor</span>
      </div>
      <button class="assist-tutor-close" aria-label="Close">&times;</button>
    </div>
    <div class="assist-tutor-status" id="assist-tutor-status"></div>

    <div class="assist-tutor-content">
      <div class="assist-tutor-loading">
        <div class="assist-tutor-spinner"></div>
        <div>Generating thought-provoking questions...</div>
      </div>
    </div>

    <div class="assist-tutor-controls">
      <button class="assist-tutor-btn assist-tutor-btn-secondary" id="assist-tutor-copy">
        📋 Copy Questions
      </button>
      <button class="assist-tutor-btn assist-tutor-btn-primary" id="assist-tutor-new">
        🔄 New Questions
      </button>
    </div>
  `);

  // Close button
  attachInteractiveHandler(
    panel.querySelector('.assist-tutor-close'),
    'Socratic Tutor Close Button',
    () => tutor_hide()
  );

  // Copy button
  attachInteractiveHandler(
    panel.querySelector('#assist-tutor-copy'),
    'Socratic Tutor Copy Button',
    () => tutor_copyQuestions()
  );

  // New questions button
  attachInteractiveHandler(
    panel.querySelector('#assist-tutor-new'),
    'Socratic Tutor New Questions Button',
    async () => {
      if (tutor_currentText) {
        tutor_analyze(tutor_currentText);
      }
    }
  );

  // Close on escape
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      tutor_hide();
    }
  });

  return panel;
}

/**
 * Render questions in the panel
 * @param {Object} result - Questions object
 * @param {boolean} isAI - Whether AI-generated
 * @param {boolean} isCloud - Whether cloud model was used
 * @param {string} modelName - Name of the model used
 */
async function tutor_renderResult(result, isAI, isCloud = false, modelName = '') {
  console.log('[SocraticTutor] tutor_renderResult called with:', {
    result,
    isAI,
    isCloud,
    modelName,
  });
  console.log(
    '[SocraticTutor] Result details - topic:',
    result?.topic,
    'questions:',
    result?.questions?.length
  );

  const contentArea = tutor_panel?.querySelector('.assist-tutor-content');
  if (!contentArea) {
    console.error('[SocraticTutor] No content area found in panel!');
    return;
  }
  console.log('[SocraticTutor] Content area found, rendering...');
  console.log(
    '[SocraticTutor] Panel visibility:',
    tutor_panel?.style.display,
    'Panel in DOM:',
    document.body.contains(tutor_panel)
  );

  const _tutorBadgeInfo = await getAIBadgeInfo();
  const badge = isAI
    ? renderAIBadge(_tutorBadgeInfo.mode, _tutorBadgeInfo.label)
    : renderAIBadge('fallback', 'Basic');

  let html = `
    <div class="assist-tutor-topic">
      <strong>Topic:</strong> ${escapeHtml(result.topic)} ${badge}
    </div>
  `;

  // Render questions
  if (result.questions && result.questions.length > 0) {
    for (let i = 0; i < result.questions.length; i++) {
      const q = result.questions[i];
      const typeLabels = {
        comprehension: '🧠 Comprehension',
        analysis: '🔍 Analysis',
        synthesis: '🔗 Synthesis',
        evaluation: '⚖️ Evaluation',
      };

      const hintText = q.hint || '';
      const showHintButton = isUsefulHint(hintText);

      html += `
        <div class="assist-tutor-question" data-index="${i}">
          <div class="assist-tutor-question-type">${typeLabels[q.type] || q.type}</div>
          <div class="assist-tutor-question-text">${escapeHtml(q.question)}</div>
          ${
            showHintButton
              ? `
          <div class="assist-tutor-hint" id="hint-${i}">
            💡 <strong>Hint:</strong> ${escapeHtml(hintText)}
          </div>
          <div class="assist-tutor-followup" id="followup-${i}">
            ➡️ <strong>Go deeper:</strong> ${escapeHtml(q.followUp || '')}
          </div>
          <button class="assist-tutor-hint-btn" data-hint-index="${i}">
            Show Hint
          </button>`
              : ''
          }
        </div>
      `;
    }
  }

  // Thinking prompt
  if (result.thinkingPrompt) {
    html += `
      <div class="assist-tutor-thinking">
        <div class="assist-tutor-thinking-label">🤔 Reflection</div>
        ${escapeHtml(result.thinkingPrompt)}
      </div>
    `;
  }

  contentArea.innerHTML = sanitizeHTML(html);

  // Attach hint button handlers (onclick attributes stripped by sanitizeHTML)
  const hintButtons = contentArea.querySelectorAll('.assist-tutor-hint-btn');
  hintButtons.forEach(btn => {
    const index = btn.getAttribute('data-hint-index');
    attachInteractiveHandler(btn, `Show Hint ${index}`, () => {
      const hint = document.getElementById(`hint-${index}`);
      const followup = document.getElementById(`followup-${index}`);
      if (hint) {
        hint.classList.toggle('visible');
      }
      if (followup) {
        followup.classList.toggle('visible');
      }
      btn.textContent = btn.textContent.includes('Show') ? 'Hide Hint' : 'Show Hint';
    });
  });

  console.log(
    '[SocraticTutor] Render complete. Content length:',
    contentArea.innerHTML.length,
    'chars'
  );
}

/**
 * Copy questions to clipboard
 */
async function tutor_copyQuestions() {
  if (!tutor_currentQuestions) {
    return;
  }

  let text = `Socratic Questions: ${tutor_currentQuestions.topic}\n\n`;

  tutor_currentQuestions.questions.forEach((q, i) => {
    text += `${i + 1}. [${q.type.toUpperCase()}] ${q.question}\n`;
    if (q.hint) {
      text += `   Hint: ${q.hint}\n`;
    }
    if (q.followUp) {
      text += `   Follow-up: ${q.followUp}\n`;
    }
    text += '\n';
  });

  if (tutor_currentQuestions.thinkingPrompt) {
    text += `Reflection: ${tutor_currentQuestions.thinkingPrompt}\n`;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast?.('Questions copied to clipboard!') || alert('Copied!');
  } catch (e) {
    console.error('[SocraticTutor] Copy failed:', e);
  }
}

/**
 * Escape HTML
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the tutor panel
 */
async function tutor_show() {
  console.log('[SocraticTutor] tutor_show() called');

  // Remove existing panel and overlay
  if (tutor_panel) {
    console.log('[SocraticTutor] Removing existing panel');
    tutor_panel.remove();
  }
  const existingOverlay = document.getElementById('assist-tutor-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Create backdrop overlay first
  const overlay = document.createElement('div');
  overlay.id = 'assist-tutor-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: '999998',
  });
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', () => tutor_hide());

  tutor_panel = await tutor_createPanel();
  console.log('[SocraticTutor] Panel created:', tutor_panel);

  // Apply critical styles directly to element (don't rely on CSS in innerHTML)
  Object.assign(tutor_panel.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '90%',
    maxWidth: '550px',
    maxHeight: '80vh',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    zIndex: Z.MODAL,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  });

  document.body.appendChild(tutor_panel);
  console.log('[SocraticTutor] Panel appended to body');

  // Log computed styles for debugging
  const computedStyle = window.getComputedStyle(tutor_panel);
  console.log(
    '[SocraticTutor] Computed styles - position:',
    computedStyle.position,
    'display:',
    computedStyle.display,
    'zIndex:',
    computedStyle.zIndex,
    'visibility:',
    computedStyle.visibility,
    'opacity:',
    computedStyle.opacity
  );
}

/**
 * Hide the tutor panel
 */
function tutor_hide() {
  console.log('[SocraticTutor] tutor_hide() called');
  if (tutor_panel) {
    tutor_panel.remove();
    tutor_panel = null;
  }
  const overlay = document.getElementById('assist-tutor-overlay');
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Analyze text and show Socratic questions
 * @param {string} text - Text to analyze
 */
async function tutor_analyze(text) {
  if (!text || text.trim().length < 20) {
    showToast?.('Please select more text for Socratic questions') ||
      alert('Please select more text');
    return;
  }

  tutor_currentText = text;

  // Only create panel if it doesn't exist or isn't visible
  if (!tutor_panel || tutor_panel.style.display === 'none') {
    await tutor_show();
  }

  const contentArea = tutor_panel?.querySelector('.assist-tutor-content');

  if (contentArea) {
    contentArea.innerHTML = sanitizeHTML(`
      <div class="assist-tutor-loading">
        <div class="assist-tutor-spinner"></div>
        <div>Generating thought-provoking questions...</div>
      </div>
    `);
  }

  // Get AI mode and check availability
  const modeInfo = await getAIMode('socraticTutor');
  const availability = await checkAIAvailable(modeInfo);

  try {
    let result;
    let isAI = false;

    if (!availability.available) {
      if (availability.needsApiKey) {
        tutor_showApiKeyWarning();
        return;
      }
      // Show status bar and fall back to template-based questions
      const statusBar = tutor_panel?.querySelector('#assist-tutor-status');
      if (statusBar) {
        setAIStatusBar(statusBar, availability, 'assist-tutor-status');
      }
      result = tutor_fallback(text);
    } else {
      const response = await tutor_generate(text, modeInfo);
      result = response.questions;
      isAI = true;
    }

    tutor_currentQuestions = result;
    tutor_renderResult(result, isAI);
    if (isAI) {
      const statusBar = tutor_panel?.querySelector('#assist-tutor-status');
      if (statusBar) {
        statusBar.className = 'assist-tutor-status visible success';
        statusBar.textContent = getSuccessStatusMessage(modeInfo, 'generated');
      }
    }
  } catch (error) {
    console.error('[SocraticTutor] Error:', error);
    const fallback = tutor_fallback(text);
    tutor_currentQuestions = fallback;
    tutor_renderResult(fallback, false);
  }
}

/**
 * Show API key warning when cloud mode is enabled but no key is configured
 */
function tutor_showApiKeyWarning() {
  const contentArea = tutor_panel?.querySelector('.assist-tutor-content');
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
        <button class="tutor-open-settings" style="
          background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">⚙️ Open Advanced Options</button>
        <button class="tutor-use-local" style="
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
  const openSettingsBtn = contentArea.querySelector('.tutor-open-settings');
  if (openSettingsBtn) {
    attachInteractiveHandler(openSettingsBtn, 'Open Settings Button', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
      alert(
        'To add your API key:\n\n1. Click the AssisT extension icon\n2. Click "Advanced Options"\n3. Go to the "AI" tab\n4. Select your AI provider and enter your API key\n5. Click Save'
      );
    });
  }

  const useLocalBtn = contentArea.querySelector('.tutor-use-local');
  if (useLocalBtn) {
    attachInteractiveHandler(useLocalBtn, 'Use Local AI Button', async () => {
      await chrome.storage.local.set({ aiMode: 'local' });
      console.log('[SocraticTutor] Switched to local AI mode');
      tutor_showEmptyState();
    });
  }
}

/**
 * Show the empty state for generating questions
 */
function tutor_showEmptyState() {
  const contentArea = tutor_panel?.querySelector('.assist-tutor-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div style="text-align: center; padding: 40px 20px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 16px;">🤔</div>
      <p>Select text on the page and use Socratic Tutor to generate thought-provoking questions.</p>
      <p style="font-size: 13px; margin-top: 12px;">Now using Local AI mode.</p>
    </div>
  `);
}

/**
 * Start Socratic tutor for text
 * @param {string} text - Text to analyze
 */
async function tutor_start(text) {
  await tutor_analyze(text);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function tutor_init() {
  console.log('[SocraticTutor] Initializing...');
  injectAIBadgeStyles();

  // Register to window for highlight menu integration
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.socraticTutor = {
    start: tutor_start,
    show: tutor_show,
    hide: tutor_hide,
    analyze: tutor_analyze,
    settings: tutor_settings,
  };

  console.log('[SocraticTutor] Initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  tutor_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { tutor_start, tutor_show, tutor_hide, tutor_analyze, tutor_settings };
