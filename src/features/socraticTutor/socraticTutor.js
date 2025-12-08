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

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let tutor_panel = null;
let tutor_isLoading = false;
let tutor_currentText = '';
let tutor_currentQuestions = null;
let tutor_modelDropdown = null; // Cloud model dropdown reference

const tutor_settings = {
  enabled: true,
  showInHighlightMenu: true,
  questionCount: 4,
  includeHints: true,
};

// Cloud model configurations
const TUTOR_MODELS = {
  'local': { id: 'local', name: 'Local', isLocal: true },
  'haiku-4.5': { id: 'claude-haiku-4-5-20251101', name: 'Haiku 4.5' },
  'sonnet-4.5': { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5' },
  'opus-4.5': { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5' }
};

// Benchmark-optimized defaults (Academic Benchmark Report Dec 2025)
// Cloud: Opus 4.5 scored 8.8/10 (best for pedagogical dialogue)
// Local: Gemma3:4b scored 8.8/10 (ties with Opus - remarkable for 4GB model!)
const TUTOR_DEFAULT_LOCAL_MODEL = 'local';
const TUTOR_DEFAULT_CLOUD_MODEL = 'opus-4.5';

// ============================================================================
// LLM BRIDGE COMMUNICATION
// ============================================================================

/**
 * Check if cloud mode is enabled
 * @returns {Promise<boolean>}
 */
async function tutor_isCloudEnabled() {
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
async function tutor_checkLLM() {
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
    console.warn('[SocraticTutor] LLM check failed:', error);
    return { available: false, models: [] };
  }
}

/**
 * Generate Socratic questions using LLM (local or cloud)
 * @param {string} text - Text to generate questions about
 * @param {string} modelKey - Model key to use ('local', 'haiku-4.5', 'sonnet-4.5', 'opus-4.5')
 * @returns {Promise<{questions: Object, isCloud: boolean}>} Generated questions object
 */
async function tutor_generate(text, modelKey = 'local') {
  // Truncate input to avoid token overflow
  const truncatedText = text.length > 2500 ? text.substring(0, 2500) + '...' : text;

  // Model-specific token limits
  const modelTokenLimits = {
    'local': 800,
    'haiku-4.5': 600,
    'sonnet-4.5': 900,
    'opus-4.5': 1100
  };

  const maxTokens = modelTokenLimits[modelKey] || 800;
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
          temperature: 0.5,  // Lower for more reliable JSON
          feature: 'socraticTutor'
        },
      });
    } else {
      // Use local model (Ollama)
      response = await chrome.runtime.sendMessage({
        action: 'LOCAL_LLM_GENERATE',
        prompt,
        options: {
          maxTokens,
          temperature: 0.5,
        },
      });
    }

    if (response && response.success) {
      // Parse JSON from response
      try {
        // Clean response: remove markdown code blocks (various formats)
        let jsonStr = response.data
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
        jsonStr = jsonStr
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');

        const parsed = JSON.parse(jsonStr);

        if (parsed && Array.isArray(parsed.questions)) {
          console.log('[SocraticTutor] JSON parsed successfully');
          return { questions: parsed, isCloud };
        }

        throw new Error('Invalid JSON structure');
      } catch (parseError) {
        console.warn('[SocraticTutor] JSON parse failed:', parseError.message);
        console.log('[SocraticTutor] Raw response:', response.data.substring(0, 300));
        // Return fallback structure
        return { questions: tutor_fallback(text), isCloud };
      }
    }

    throw new Error(response?.error || 'Generation failed');
  } catch (error) {
    console.error('[SocraticTutor] Generation failed:', error);
    throw error;
  }
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
  const words = text.toLowerCase().split(/\s+/);

  // Extract potential key concepts (longer words, capitalized words)
  const keyWords = words
    .filter(w => w.length > 6 || /^[A-Z]/.test(w))
    .slice(0, 5);

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
    thinkingPrompt: 'Take a moment to reflect: Why might this information be important to understand?',
  };
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the Socratic tutor panel
 * @returns {HTMLElement}
 */
async function tutor_createPanel() {
  // Check if cloud mode is enabled
  const cloudEnabled = await tutor_isCloudEnabled();

  const panel = document.createElement('div');
  panel.id = 'assist-socratic-tutor-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Socratic Tutor');

  panel.innerHTML = `
    <style>
      #assist-socratic-tutor-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 550px;
        max-height: 80vh;
        background: white;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

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

      .assist-tutor-model-selector {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 4px;
        margin-right: auto;
      }

      .assist-tutor-model-selector.hidden {
        display: none !important;
      }

      .assist-tutor-model-icon {
        font-size: 14px;
      }

      .assist-tutor-model {
        padding: 4px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
        font-family: inherit;
        background: white;
        cursor: pointer;
        min-width: 100px;
      }

      .assist-tutor-model:focus {
        outline: none;
        border-color: #43e97b;
        box-shadow: 0 0 0 2px rgba(67, 233, 123, 0.2);
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
    </style>

    <div class="assist-tutor-header">
      <div class="assist-tutor-title">
        <span>🎓</span>
        <span>Socratic Tutor</span>
      </div>
      <button class="assist-tutor-close" aria-label="Close">&times;</button>
    </div>

    <div class="assist-tutor-content">
      <div class="assist-tutor-loading">
        <div class="assist-tutor-spinner"></div>
        <div>Generating thought-provoking questions...</div>
      </div>
    </div>

    <div class="assist-tutor-controls">
      <div class="assist-tutor-model-selector ${cloudEnabled ? '' : 'hidden'}">
        <span class="assist-tutor-model-icon" title="AI Model">🤖</span>
        <select class="assist-tutor-model" aria-label="Select AI model">
          <option value="local">Local</option>
          <option value="haiku-4.5">Haiku 4.5</option>
          <option value="sonnet-4.5">Sonnet 4.5</option>
          <option value="opus-4.5">Opus 4.5</option>
        </select>
      </div>
      <button class="assist-tutor-btn assist-tutor-btn-secondary" id="assist-tutor-copy">
        📋 Copy Questions
      </button>
      <button class="assist-tutor-btn assist-tutor-btn-primary" id="assist-tutor-new">
        🔄 New Questions
      </button>
    </div>
  `;

  // Close button
  panel.querySelector('.assist-tutor-close').onclick = () => tutor_hide();

  // Model dropdown event listener
  const modelSelect = panel.querySelector('.assist-tutor-model');
  if (modelSelect) {
    // Set default based on cloud mode (benchmark-optimized)
    modelSelect.value = cloudEnabled ? TUTOR_DEFAULT_CLOUD_MODEL : TUTOR_DEFAULT_LOCAL_MODEL;
    tutor_modelDropdown = modelSelect;

    // Model change triggers regeneration
    modelSelect.addEventListener('change', () => {
      if (tutor_currentText) {
        tutor_analyze(tutor_currentText, modelSelect.value);
      }
    });
  }

  // Copy button
  panel.querySelector('#assist-tutor-copy').onclick = () => tutor_copyQuestions();

  // New questions button
  panel.querySelector('#assist-tutor-new').onclick = () => {
    if (tutor_currentText) {
      const modelKey = tutor_modelDropdown?.value || 'local';
      tutor_analyze(tutor_currentText, modelKey);
    }
  };

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
function tutor_renderResult(result, isAI, isCloud = false, modelName = '') {
  const contentArea = tutor_panel?.querySelector('.assist-tutor-content');
  if (!contentArea) return;

  let badge;
  if (isCloud) {
    badge = `<span class="assist-tutor-badge assist-tutor-cloud-badge">☁️ ${modelName}</span>`;
  } else if (isAI) {
    badge = '<span class="assist-tutor-badge assist-tutor-ai-badge">💻 Local AI</span>';
  } else {
    badge = '<span class="assist-tutor-badge assist-tutor-fallback-badge">Basic</span>';
  }

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

      html += `
        <div class="assist-tutor-question" data-index="${i}">
          <div class="assist-tutor-question-type">${typeLabels[q.type] || q.type}</div>
          <div class="assist-tutor-question-text">${escapeHtml(q.question)}</div>
          <div class="assist-tutor-hint" id="hint-${i}">
            💡 <strong>Hint:</strong> ${escapeHtml(q.hint || 'Think about the key concepts mentioned.')}
          </div>
          <div class="assist-tutor-followup" id="followup-${i}">
            ➡️ <strong>Go deeper:</strong> ${escapeHtml(q.followUp || '')}
          </div>
          <button class="assist-tutor-hint-btn" onclick="document.getElementById('hint-${i}').classList.toggle('visible'); document.getElementById('followup-${i}').classList.toggle('visible'); this.textContent = this.textContent.includes('Show') ? 'Hide Hint' : 'Show Hint';">
            Show Hint
          </button>
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

  contentArea.innerHTML = html;
}

/**
 * Copy questions to clipboard
 */
async function tutor_copyQuestions() {
  if (!tutor_currentQuestions) return;

  let text = `Socratic Questions: ${tutor_currentQuestions.topic}\n\n`;

  tutor_currentQuestions.questions.forEach((q, i) => {
    text += `${i + 1}. [${q.type.toUpperCase()}] ${q.question}\n`;
    if (q.hint) text += `   Hint: ${q.hint}\n`;
    if (q.followUp) text += `   Follow-up: ${q.followUp}\n`;
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
  if (!text) return '';
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
  if (tutor_panel) {
    tutor_panel.remove();
  }
  tutor_panel = await tutor_createPanel();
  document.body.appendChild(tutor_panel);
  tutor_panel.style.display = 'flex';
}

/**
 * Hide the tutor panel
 */
function tutor_hide() {
  if (tutor_panel) {
    tutor_panel.style.display = 'none';
  }
}

/**
 * Analyze text and show Socratic questions
 * @param {string} text - Text to analyze
 * @param {string} modelKey - Model key to use ('local', 'haiku-4.5', 'sonnet-4.5', 'opus-4.5')
 */
async function tutor_analyze(text, modelKey = null) {
  if (!text || text.trim().length < 20) {
    showToast?.('Please select more text for Socratic questions') ||
      alert('Please select more text');
    return;
  }

  // Get model from dropdown if not specified
  if (!modelKey) {
    modelKey = tutor_modelDropdown?.value || 'local';
  }

  tutor_currentText = text;

  // Only create panel if it doesn't exist or isn't visible
  // This preserves the dropdown selection when regenerating
  if (!tutor_panel || tutor_panel.style.display === 'none') {
    await tutor_show();
    // Set dropdown to the requested model after panel creation
    if (tutor_modelDropdown && modelKey) {
      tutor_modelDropdown.value = modelKey;
    }
  }

  const contentArea = tutor_panel?.querySelector('.assist-tutor-content');
  const isCloud = modelKey !== 'local';
  const modelName = TUTOR_MODELS[modelKey]?.name || modelKey;

  if (contentArea) {
    contentArea.innerHTML = `
      <div class="assist-tutor-loading">
        <div class="assist-tutor-spinner"></div>
        <div>Generating thought-provoking questions${isCloud ? ` with ${modelName}` : ''}...</div>
      </div>
    `;
  }

  try {
    let result;
    let isAI = false;
    let usedCloud = false;

    if (isCloud) {
      // Use cloud model (Claude API)
      const response = await tutor_generate(text, modelKey);
      result = response.questions;
      isAI = true;
      usedCloud = true;
    } else {
      // Check local LLM availability
      const llmStatus = await tutor_checkLLM();

      if (llmStatus.available) {
        const response = await tutor_generate(text, 'local');
        result = response.questions;
        isAI = true;
      } else {
        result = tutor_fallback(text);
      }
    }

    tutor_currentQuestions = result;
    tutor_renderResult(result, isAI, usedCloud, modelName);
  } catch (error) {
    console.error('[SocraticTutor] Error:', error);
    const fallback = tutor_fallback(text);
    tutor_currentQuestions = fallback;
    tutor_renderResult(fallback, false, false, '');
  }
}

/**
 * Start Socratic tutor for text
 * @param {string} text - Text to analyze
 */
async function tutor_start(text) {
  // Get model from dropdown (defaults to local when first shown)
  const modelKey = tutor_modelDropdown?.value || TUTOR_DEFAULT_LOCAL_MODEL;
  await tutor_analyze(text, modelKey);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function tutor_init() {
  console.log('[SocraticTutor] Initializing...');

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
