/**
 * Assignment Breakdown Assistant Feature
 *
 * Provides AI-powered assignment analysis using local LLM (Ollama).
 * Transforms complex assignment descriptions into actionable checklists
 * with clear steps, time estimates, and study tips.
 *
 * Features:
 * - Automatic task extraction from assignment text
 * - Checklist generation with checkable items
 * - Time estimation for each task
 * - Key requirements identification
 * - Study tips and approach suggestions
 * - Graceful fallback when LLM unavailable
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - Uses service worker bridge for LLM communication
 * - Registers to window.assistFeatures for integration
 *
 * @module features/assignmentBreakdown
 */

import { showToast } from '../../core/ui/toast.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let breakdown_panel = null;
let breakdown_isLoading = false;
let breakdown_currentText = '';
let breakdown_currentResult = null;
const breakdown_checkedItems = new Set();

const breakdown_settings = {
  enabled: true,
  showInHighlightMenu: true,
  includeTimeEstimates: true,
  includeStudyTips: true,
};

// ============================================================================
// LLM BRIDGE COMMUNICATION
// ============================================================================

/**
 * Check if local LLM is available
 * @returns {Promise<{available: boolean, models: string[]}>}
 */
async function breakdown_checkLLM() {
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
    console.warn('[AssignmentBreakdown] LLM check failed:', error);
    return { available: false, models: [] };
  }
}

/**
 * Generate assignment breakdown using local LLM
 * @param {string} text - Assignment text to analyze
 * @returns {Promise<Object>} The breakdown result
 */
async function breakdown_generate(text) {
  const prompt = `You are an educational assistant helping students with learning difficulties break down assignments into manageable steps.

Analyze this assignment and provide a structured breakdown in JSON format:

ASSIGNMENT TEXT:
${text}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "title": "Brief title for this assignment",
  "summary": "One sentence summary of what's required",
  "tasks": [
    {
      "step": 1,
      "task": "Clear action item description",
      "timeEstimate": "15-30 minutes",
      "tips": "Helpful tip for this step"
    }
  ],
  "keyRequirements": ["requirement 1", "requirement 2"],
  "deadline": "Extract deadline if mentioned, otherwise null",
  "wordCount": "Extract word count requirement if mentioned, otherwise null",
  "overallTips": "General advice for approaching this assignment"
}

Important:
- Break into 3-7 clear, actionable steps
- Use simple, clear language
- Time estimates should be realistic for students
- Tips should be practical and specific`;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_GENERATE',
      prompt,
      options: {
        maxTokens: 800,
        temperature: 0.3,
      },
    });

    if (response && response.success) {
      // Try to parse JSON from response
      try {
        // Clean response - remove any markdown code blocks if present
        let jsonStr = response.data.trim();
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        return JSON.parse(jsonStr);
      } catch {
        console.warn('[AssignmentBreakdown] JSON parse failed, using raw response');
        // Return a basic structure with the raw text
        return {
          title: 'Assignment Analysis',
          summary: response.data.substring(0, 200),
          tasks: [{ step: 1, task: response.data, timeEstimate: 'Varies', tips: '' }],
          keyRequirements: [],
          overallTips: '',
        };
      }
    }

    throw new Error(response?.error || 'Breakdown generation failed');
  } catch (error) {
    console.error('[AssignmentBreakdown] Generation failed:', error);
    throw error;
  }
}

// ============================================================================
// FALLBACK BREAKDOWN (No LLM)
// ============================================================================

/**
 * Keywords that often indicate tasks or requirements
 */
const breakdown_taskIndicators = [
  'write',
  'create',
  'develop',
  'analyze',
  'research',
  'submit',
  'complete',
  'prepare',
  'include',
  'provide',
  'demonstrate',
  'explain',
  'describe',
  'discuss',
  'compare',
  'evaluate',
  'identify',
  'outline',
  'summarize',
  'review',
  'present',
];

/**
 * Keywords that indicate requirements
 */
const breakdown_requirementIndicators = [
  'must',
  'should',
  'required',
  'minimum',
  'at least',
  'no more than',
  'maximum',
  'include',
  'format',
  'citation',
  'reference',
  'word',
  'page',
  'deadline',
  'due',
];

/**
 * Extract sentences that contain task indicators
 * @param {string} text - Assignment text
 * @returns {string[]} Array of task sentences
 */
function breakdown_extractTasks(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const tasks = [];

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    for (const indicator of breakdown_taskIndicators) {
      if (lowerSentence.includes(indicator)) {
        const cleanTask = sentence.trim().replace(/^\d+[\.\)]\s*/, '');
        if (cleanTask.length > 10 && !tasks.includes(cleanTask)) {
          tasks.push(cleanTask);
        }
        break;
      }
    }
  }

  // If no tasks found, split by common list patterns
  if (tasks.length === 0) {
    const listItems = text.match(/(?:^|\n)\s*(?:\d+[\.\)]|\-|\•|\*)\s*[^\n]+/g);
    if (listItems) {
      for (const item of listItems) {
        const cleanItem = item.trim().replace(/^[\d\.\)\-\•\*\s]+/, '');
        if (cleanItem.length > 10) {
          tasks.push(cleanItem);
        }
      }
    }
  }

  // If still no tasks, just split into paragraphs
  if (tasks.length === 0) {
    const paragraphs = text.split(/\n\n+/);
    for (const para of paragraphs.slice(0, 5)) {
      if (para.trim().length > 20) {
        tasks.push(para.trim().substring(0, 200));
      }
    }
  }

  return tasks.slice(0, 7); // Max 7 tasks
}

/**
 * Extract requirements from text
 * @param {string} text - Assignment text
 * @returns {string[]} Array of requirements
 */
function breakdown_extractRequirements(text) {
  const requirements = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    for (const indicator of breakdown_requirementIndicators) {
      if (lowerSentence.includes(indicator)) {
        const cleanReq = sentence.trim();
        if (cleanReq.length > 10 && cleanReq.length < 200 && !requirements.includes(cleanReq)) {
          requirements.push(cleanReq);
        }
        break;
      }
    }
  }

  return requirements.slice(0, 5); // Max 5 requirements
}

/**
 * Extract deadline from text
 * @param {string} text - Assignment text
 * @returns {string|null} Deadline if found
 */
function breakdown_extractDeadline(text) {
  const datePatterns = [
    /due\s*(?:by|on|date)?:?\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
    /deadline:?\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
    /submit\s*(?:by|before):?\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract word count from text
 * @param {string} text - Assignment text
 * @returns {string|null} Word count if found
 */
function breakdown_extractWordCount(text) {
  const patterns = [
    /(\d{2,4})\s*(?:\-|\–|to)\s*(\d{2,4})\s*words?/i,
    /(?:minimum|at least|approximately|about|around)\s*(\d{2,4})\s*words?/i,
    /(\d{2,4})\s*words?\s*(?:minimum|maximum|max|min)/i,
    /word\s*(?:count|limit):?\s*(\d{2,4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        return `${match[1]}-${match[2]} words`;
      }
      return `${match[1]} words`;
    }
  }

  return null;
}

/**
 * Estimate time for a task based on its content
 * @param {string} task - Task description
 * @returns {string} Time estimate
 */
function breakdown_estimateTime(task) {
  const lowerTask = task.toLowerCase();

  if (lowerTask.includes('research') || lowerTask.includes('analyze')) {
    return '30-60 minutes';
  }
  if (lowerTask.includes('write') || lowerTask.includes('essay') || lowerTask.includes('paper')) {
    return '1-2 hours';
  }
  if (lowerTask.includes('read') || lowerTask.includes('review')) {
    return '20-40 minutes';
  }
  if (lowerTask.includes('outline') || lowerTask.includes('plan')) {
    return '15-30 minutes';
  }
  if (
    lowerTask.includes('edit') ||
    lowerTask.includes('proofread') ||
    lowerTask.includes('revise')
  ) {
    return '20-30 minutes';
  }
  if (lowerTask.includes('submit') || lowerTask.includes('upload')) {
    return '5-10 minutes';
  }

  return '15-30 minutes';
}

/**
 * Generate breakdown using rule-based approach when LLM is unavailable
 * @param {string} text - Assignment text
 * @returns {Object} Breakdown result
 */
function breakdown_fallback(text) {
  const tasks = breakdown_extractTasks(text);
  const requirements = breakdown_extractRequirements(text);
  const deadline = breakdown_extractDeadline(text);
  const wordCount = breakdown_extractWordCount(text);

  // Generate title from first significant words
  const firstSentence = text.match(/^[^.!?]+/)?.[0] || text.substring(0, 50);
  const title = firstSentence.length > 60 ? firstSentence.substring(0, 57) + '...' : firstSentence;

  return {
    title: title.trim(),
    summary: 'Assignment broken down into actionable steps',
    tasks: tasks.map((task, index) => ({
      step: index + 1,
      task: task,
      timeEstimate: breakdown_estimateTime(task),
      tips: '',
    })),
    keyRequirements: requirements,
    deadline,
    wordCount,
    overallTips:
      'Start with the first step and work through systematically. Take breaks between major sections.',
  };
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Creates the floating breakdown panel
 * @returns {HTMLElement} Panel element
 */
function breakdown_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-breakdown-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Assignment Breakdown');
  panel.setAttribute('aria-modal', 'true');

  panel.innerHTML = `
    <div class="assist-breakdown-header">
      <span class="assist-breakdown-title">📋 Assignment Breakdown</span>
      <div class="assist-breakdown-controls">
        <button class="assist-breakdown-close" aria-label="Close" title="Close (Esc)">×</button>
      </div>
    </div>
    <div class="assist-breakdown-status"></div>
    <div class="assist-breakdown-content" aria-live="polite">
      <p class="assist-breakdown-placeholder">Select assignment text and click breakdown...</p>
    </div>
    <div class="assist-breakdown-actions">
      <button class="assist-breakdown-btn assist-breakdown-copy" aria-label="Copy as checklist">
        <span class="assist-breakdown-btn-icon">📋</span> Copy List
      </button>
      <button class="assist-breakdown-btn assist-breakdown-speak" aria-label="Read breakdown aloud">
        <span class="assist-breakdown-btn-icon">🔊</span> Read
      </button>
      <button class="assist-breakdown-btn assist-breakdown-regenerate" aria-label="Regenerate breakdown">
        <span class="assist-breakdown-btn-icon">🔄</span> Regenerate
      </button>
    </div>
  `;

  // Inject styles
  breakdown_injectStyles();

  // Add event listeners
  const closeBtn = panel.querySelector('.assist-breakdown-close');
  closeBtn.addEventListener('click', breakdown_hide);

  const copyBtn = panel.querySelector('.assist-breakdown-copy');
  copyBtn.addEventListener('click', breakdown_copy);

  const speakBtn = panel.querySelector('.assist-breakdown-speak');
  speakBtn.addEventListener('click', breakdown_speak);

  const regenerateBtn = panel.querySelector('.assist-breakdown-regenerate');
  regenerateBtn.addEventListener('click', () => {
    if (breakdown_currentText) {
      breakdown_analyze(breakdown_currentText);
    }
  });

  // Make panel draggable
  breakdown_makeDraggable(panel);

  return panel;
}

/**
 * Injects CSS styles for the breakdown panel
 */
function breakdown_injectStyles() {
  if (document.getElementById('assist-breakdown-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'assist-breakdown-styles';
  style.textContent = `
    #assist-breakdown-panel {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 450px;
      max-width: calc(100vw - 40px);
      max-height: 70vh;
      background: #ffffff;
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

    .assist-breakdown-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
      color: white;
      cursor: move;
    }

    .assist-breakdown-title {
      font-weight: 600;
      font-size: 15px;
    }

    .assist-breakdown-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .assist-breakdown-close {
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

    .assist-breakdown-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .assist-breakdown-status {
      padding: 8px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      display: none;
    }

    .assist-breakdown-status.visible {
      display: block;
    }

    .assist-breakdown-status.error {
      background: #fff3e0;
      color: #e65100;
    }

    .assist-breakdown-status.success {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .assist-breakdown-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      line-height: 1.6;
      color: #333;
    }

    .assist-breakdown-placeholder {
      color: #999;
      font-style: italic;
      text-align: center;
      margin: 20px 0;
    }

    .assist-breakdown-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 20px;
      color: #666;
    }

    .assist-breakdown-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e0e0e0;
      border-top-color: #FF6B6B;
      border-radius: 50%;
      animation: assist-breakdown-spin 0.8s linear infinite;
    }

    @keyframes assist-breakdown-spin {
      to { transform: rotate(360deg); }
    }

    /* Breakdown content sections */
    .assist-breakdown-summary {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .assist-breakdown-summary-title {
      font-weight: 600;
      font-size: 15px;
      color: #333;
      margin-bottom: 8px;
    }

    .assist-breakdown-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }

    .assist-breakdown-meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: #e3f2fd;
      color: #1565c0;
      border-radius: 4px;
      font-size: 12px;
    }

    .assist-breakdown-tasks {
      margin-bottom: 16px;
    }

    .assist-breakdown-tasks-title {
      font-weight: 600;
      font-size: 14px;
      color: #333;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .assist-breakdown-task {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px;
      background: #fafafa;
      border-radius: 6px;
      margin-bottom: 8px;
      transition: background 0.2s;
    }

    .assist-breakdown-task:hover {
      background: #f0f0f0;
    }

    .assist-breakdown-task.completed {
      opacity: 0.6;
      text-decoration: line-through;
    }

    .assist-breakdown-task-checkbox {
      width: 20px;
      height: 20px;
      border: 2px solid #ccc;
      border-radius: 4px;
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .assist-breakdown-task-checkbox:hover {
      border-color: #FF6B6B;
    }

    .assist-breakdown-task-checkbox.checked {
      background: #4CAF50;
      border-color: #4CAF50;
      color: white;
    }

    .assist-breakdown-task-content {
      flex: 1;
    }

    .assist-breakdown-task-step {
      font-weight: 600;
      color: #FF6B6B;
      margin-right: 6px;
    }

    .assist-breakdown-task-text {
      color: #333;
    }

    .assist-breakdown-task-meta {
      display: flex;
      gap: 12px;
      margin-top: 6px;
      font-size: 12px;
      color: #666;
    }

    .assist-breakdown-task-time {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .assist-breakdown-task-tip {
      font-style: italic;
      color: #888;
    }

    .assist-breakdown-requirements {
      margin-bottom: 16px;
    }

    .assist-breakdown-requirements-title {
      font-weight: 600;
      font-size: 14px;
      color: #333;
      margin-bottom: 8px;
    }

    .assist-breakdown-requirement {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 13px;
      color: #555;
    }

    .assist-breakdown-requirement::before {
      content: "•";
      color: #FF6B6B;
      font-weight: bold;
    }

    .assist-breakdown-tips {
      background: #fff3e0;
      padding: 12px;
      border-radius: 8px;
      border-left: 4px solid #ff9800;
    }

    .assist-breakdown-tips-title {
      font-weight: 600;
      font-size: 13px;
      color: #e65100;
      margin-bottom: 6px;
    }

    .assist-breakdown-tips-text {
      font-size: 13px;
      color: #555;
    }

    .assist-breakdown-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #f8f9fa;
      border-top: 1px solid #e0e0e0;
    }

    .assist-breakdown-btn {
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

    .assist-breakdown-btn:hover {
      background: #f0f0f0;
      border-color: #ccc;
    }

    .assist-breakdown-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .assist-breakdown-btn-icon {
      font-size: 14px;
    }

    /* Badges */
    .assist-breakdown-ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    .assist-breakdown-fallback-badge {
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

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      #assist-breakdown-panel {
        background: #1e1e1e;
        border-color: #333;
        color: #e0e0e0;
      }

      .assist-breakdown-content {
        color: #e0e0e0;
      }

      .assist-breakdown-summary {
        background: #2d2d2d;
      }

      .assist-breakdown-summary-title {
        color: #e0e0e0;
      }

      .assist-breakdown-task {
        background: #2a2a2a;
      }

      .assist-breakdown-task:hover {
        background: #333;
      }

      .assist-breakdown-task-text {
        color: #e0e0e0;
      }

      .assist-breakdown-tasks-title,
      .assist-breakdown-requirements-title {
        color: #e0e0e0;
      }

      .assist-breakdown-status {
        background: #2d2d2d;
        border-color: #333;
        color: #aaa;
      }

      .assist-breakdown-actions {
        background: #252525;
        border-color: #333;
      }

      .assist-breakdown-btn {
        background: #2d2d2d;
        border-color: #444;
        color: #e0e0e0;
      }

      .assist-breakdown-btn:hover {
        background: #3d3d3d;
      }

      .assist-breakdown-tips {
        background: #3d3021;
        border-left-color: #ff9800;
      }

      .assist-breakdown-tips-text {
        color: #ccc;
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Make the panel draggable
 * @param {HTMLElement} panel - Panel element
 */
function breakdown_makeDraggable(panel) {
  const header = panel.querySelector('.assist-breakdown-header');
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  header.addEventListener('mousedown', e => {
    if (e.target.closest('.assist-breakdown-controls')) {
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

/**
 * Render the breakdown result in the panel
 * @param {Object} result - Breakdown result object
 * @param {boolean} isAI - Whether result was AI-generated
 */
function breakdown_renderResult(result, isAI) {
  const contentArea = breakdown_panel?.querySelector('.assist-breakdown-content');
  if (!contentArea) {
    return;
  }

  const badge = isAI
    ? '<span class="assist-breakdown-ai-badge">AI</span>'
    : '<span class="assist-breakdown-fallback-badge">Basic</span>';

  let html = `
    <div class="assist-breakdown-summary">
      <div class="assist-breakdown-summary-title">${escapeHtml(result.title)} ${badge}</div>
      <div>${escapeHtml(result.summary)}</div>
      <div class="assist-breakdown-meta">
        ${result.deadline ? `<span class="assist-breakdown-meta-item">📅 Due: ${escapeHtml(result.deadline)}</span>` : ''}
        ${result.wordCount ? `<span class="assist-breakdown-meta-item">📝 ${escapeHtml(result.wordCount)}</span>` : ''}
      </div>
    </div>
  `;

  // Tasks section
  if (result.tasks && result.tasks.length > 0) {
    html += `
      <div class="assist-breakdown-tasks">
        <div class="assist-breakdown-tasks-title">✅ Steps to Complete</div>
    `;

    for (const task of result.tasks) {
      const isChecked = breakdown_checkedItems.has(task.step);
      html += `
        <div class="assist-breakdown-task ${isChecked ? 'completed' : ''}" data-step="${task.step}">
          <div class="assist-breakdown-task-checkbox ${isChecked ? 'checked' : ''}"
               onclick="window.assistFeatures?.assignmentBreakdown?.toggleTask(${task.step})"
               role="checkbox"
               aria-checked="${isChecked}"
               tabindex="0">
            ${isChecked ? '✓' : ''}
          </div>
          <div class="assist-breakdown-task-content">
            <div>
              <span class="assist-breakdown-task-step">Step ${task.step}:</span>
              <span class="assist-breakdown-task-text">${escapeHtml(task.task)}</span>
            </div>
            <div class="assist-breakdown-task-meta">
              ${task.timeEstimate ? `<span class="assist-breakdown-task-time">⏱️ ${escapeHtml(task.timeEstimate)}</span>` : ''}
              ${task.tips ? `<span class="assist-breakdown-task-tip">💡 ${escapeHtml(task.tips)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    html += '</div>';
  }

  // Requirements section
  if (result.keyRequirements && result.keyRequirements.length > 0) {
    html += `
      <div class="assist-breakdown-requirements">
        <div class="assist-breakdown-requirements-title">📌 Key Requirements</div>
    `;

    for (const req of result.keyRequirements) {
      html += `<div class="assist-breakdown-requirement">${escapeHtml(req)}</div>`;
    }

    html += '</div>';
  }

  // Tips section
  if (result.overallTips) {
    html += `
      <div class="assist-breakdown-tips">
        <div class="assist-breakdown-tips-title">💡 Study Tip</div>
        <div class="assist-breakdown-tips-text">${escapeHtml(result.overallTips)}</div>
      </div>
    `;
  }

  contentArea.innerHTML = html;
}

/**
 * Toggle task completion
 * @param {number} step - Step number
 */
function breakdown_toggleTask(step) {
  if (breakdown_checkedItems.has(step)) {
    breakdown_checkedItems.delete(step);
  } else {
    breakdown_checkedItems.add(step);
  }

  // Re-render with current result
  if (breakdown_currentResult) {
    const statusBar = breakdown_panel?.querySelector('.assist-breakdown-status');
    const isAI = statusBar?.classList.contains('success');
    breakdown_renderResult(breakdown_currentResult, isAI);
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Show the breakdown panel
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
function breakdown_show(selectionRect = null) {
  if (breakdown_panel) {
    breakdown_panel.remove();
  }

  // Reset checked items for new breakdown
  breakdown_checkedItems.clear();

  breakdown_panel = breakdown_createPanel();
  document.body.appendChild(breakdown_panel);

  // Position near selection if available
  if (selectionRect) {
    const panelRect = breakdown_panel.getBoundingClientRect();
    let left = selectionRect.right + 10;
    let top = selectionRect.top;

    // Adjust if would be off-screen
    if (left + panelRect.width > window.innerWidth - 20) {
      left = Math.max(20, selectionRect.left - panelRect.width - 10);
    }

    if (top + panelRect.height > window.innerHeight - 20) {
      top = Math.max(20, window.innerHeight - panelRect.height - 20);
    }

    breakdown_panel.style.left = `${left}px`;
    breakdown_panel.style.top = `${top}px`;
    breakdown_panel.style.right = 'auto';
  }

  // Add keyboard listener for Escape
  document.addEventListener('keydown', breakdown_handleKeydown);

  // Focus the panel for accessibility
  breakdown_panel.focus();
}

/**
 * Hide the breakdown panel
 */
function breakdown_hide() {
  if (breakdown_panel) {
    breakdown_panel.remove();
    breakdown_panel = null;
  }

  document.removeEventListener('keydown', breakdown_handleKeydown);
  breakdown_isLoading = false;
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} e - Keyboard event
 */
function breakdown_handleKeydown(e) {
  if (e.key === 'Escape') {
    breakdown_hide();
  }
}

/**
 * Analyze text and update panel
 * @param {string} text - Assignment text to analyze
 */
async function breakdown_analyze(text) {
  if (breakdown_isLoading || !text || text.trim().length === 0) {
    return;
  }

  breakdown_currentText = text;
  breakdown_isLoading = true;

  // Show loading state
  const contentArea = breakdown_panel?.querySelector('.assist-breakdown-content');
  const statusBar = breakdown_panel?.querySelector('.assist-breakdown-status');
  const actionBtns = breakdown_panel?.querySelectorAll('.assist-breakdown-btn');

  if (contentArea) {
    contentArea.innerHTML = `
      <div class="assist-breakdown-loading">
        <div class="assist-breakdown-spinner"></div>
        <span>Analyzing assignment...</span>
      </div>
    `;
  }

  // Disable action buttons
  actionBtns?.forEach(btn => {
    btn.disabled = true;
  });

  try {
    // Check LLM availability
    const llmStatus = await breakdown_checkLLM();

    let result;
    let isAI = false;

    if (llmStatus.available) {
      // Use AI breakdown
      result = await breakdown_generate(text);
      isAI = true;

      if (statusBar) {
        statusBar.textContent = '✨ AI-powered breakdown complete';
        statusBar.className = 'assist-breakdown-status visible success';
      }
    } else {
      // Fall back to rule-based breakdown
      result = breakdown_fallback(text);

      if (statusBar) {
        statusBar.textContent = '⚠️ Using basic analysis (Ollama not available)';
        statusBar.className = 'assist-breakdown-status visible';
      }
    }

    breakdown_currentResult = result;
    breakdown_renderResult(result, isAI);
  } catch (error) {
    console.error('[AssignmentBreakdown] Error:', error);

    // Fall back to rule-based breakdown
    const fallbackResult = breakdown_fallback(text);
    breakdown_currentResult = fallbackResult;
    breakdown_renderResult(fallbackResult, false);

    if (statusBar) {
      statusBar.textContent = `⚠️ AI unavailable: ${error.message}`;
      statusBar.className = 'assist-breakdown-status visible error';
    }
  } finally {
    breakdown_isLoading = false;

    // Re-enable action buttons
    actionBtns?.forEach(btn => {
      btn.disabled = false;
    });
  }
}

/**
 * Copy the current breakdown as a checklist to clipboard
 */
async function breakdown_copy() {
  if (!breakdown_currentResult) {
    showToast('No breakdown to copy');
    return;
  }

  // Format as markdown checklist
  let text = `# ${breakdown_currentResult.title}\n\n`;
  text += `${breakdown_currentResult.summary}\n\n`;

  if (breakdown_currentResult.deadline) {
    text += `📅 Due: ${breakdown_currentResult.deadline}\n`;
  }
  if (breakdown_currentResult.wordCount) {
    text += `📝 ${breakdown_currentResult.wordCount}\n`;
  }
  text += '\n';

  text += '## Steps to Complete\n\n';
  for (const task of breakdown_currentResult.tasks) {
    const checkbox = breakdown_checkedItems.has(task.step) ? '[x]' : '[ ]';
    text += `${checkbox} **Step ${task.step}:** ${task.task}`;
    if (task.timeEstimate) {
      text += ` (${task.timeEstimate})`;
    }
    text += '\n';
    if (task.tips) {
      text += `   💡 ${task.tips}\n`;
    }
  }

  if (breakdown_currentResult.keyRequirements?.length > 0) {
    text += '\n## Key Requirements\n\n';
    for (const req of breakdown_currentResult.keyRequirements) {
      text += `- ${req}\n`;
    }
  }

  if (breakdown_currentResult.overallTips) {
    text += `\n## Study Tip\n${breakdown_currentResult.overallTips}\n`;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('Checklist copied to clipboard');
  } catch (error) {
    console.error('[AssignmentBreakdown] Copy failed:', error);
    showToast('Failed to copy checklist');
  }
}

/**
 * Read the current breakdown using TTS
 */
function breakdown_speak() {
  if (!breakdown_currentResult) {
    showToast('No breakdown to read');
    return;
  }

  // Format for speech
  let text = `Assignment: ${breakdown_currentResult.title}. `;
  text += `${breakdown_currentResult.summary}. `;

  if (breakdown_currentResult.deadline) {
    text += `Due date: ${breakdown_currentResult.deadline}. `;
  }

  text += 'Here are the steps to complete this assignment. ';
  for (const task of breakdown_currentResult.tasks) {
    text += `Step ${task.step}: ${task.task}. `;
    if (task.timeEstimate) {
      text += `This should take about ${task.timeEstimate}. `;
    }
  }

  if (breakdown_currentResult.overallTips) {
    text += `Study tip: ${breakdown_currentResult.overallTips}`;
  }

  // Use the global readText function if available
  if (typeof window.readText === 'function') {
    const contentArea = breakdown_panel?.querySelector('.assist-breakdown-content');
    window.readText(text, contentArea || document.body);
  } else {
    // Fallback to browser TTS
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
 * Main entry point for assignment breakdown
 * @param {string} text - Assignment text to analyze
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
function breakdown_start(text, selectionRect = null) {
  if (!text || text.trim().length === 0) {
    showToast('No text to analyze');
    return;
  }

  // Show the panel
  breakdown_show(selectionRect);

  // Start analysis
  breakdown_analyze(text);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the assignment breakdown feature
 */
function breakdown_init() {
  console.log('[AssignmentBreakdown] Initializing...');

  // Register feature
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.assignmentBreakdown = {
    start: breakdown_start,
    show: breakdown_show,
    hide: breakdown_hide,
    analyze: breakdown_analyze,
    toggleTask: breakdown_toggleTask,
    settings: breakdown_settings,
  };

  // Load settings from storage
  chrome.storage.local.get(['assignmentBreakdownSettings'], result => {
    if (result.assignmentBreakdownSettings) {
      Object.assign(breakdown_settings, result.assignmentBreakdownSettings);
      console.log('[AssignmentBreakdown] Settings loaded:', breakdown_settings);
    }
  });

  // Listen for settings updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.assignmentBreakdownSettings) {
      Object.assign(breakdown_settings, changes.assignmentBreakdownSettings.newValue);
      console.log('[AssignmentBreakdown] Settings updated:', breakdown_settings);
    }
  });

  console.log('[AssignmentBreakdown] Feature initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  breakdown_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { breakdown_start, breakdown_show, breakdown_hide, breakdown_analyze, breakdown_settings };
