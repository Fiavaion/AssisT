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
 * Sleep helper for retry delays
 * @param {number} ms - Milliseconds to sleep
 */
function breakdown_sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate assignment breakdown using AI with retry logic
 * @param {string} text - Assignment text to analyze
 * @param {import('../shared/ai-feature-client.js').AIMode} modeInfo - AI mode from getAIMode()
 * @param {number} retryCount - Current retry attempt (internal use)
 * @returns {Promise<{breakdown: Object}>} The breakdown result
 */
async function breakdown_generate(text, modeInfo, retryCount = 0) {
  const MAX_RETRIES = 2; // Max 2 retries (3 total attempts)
  const BASE_DELAY = 1000; // 1 second base delay
  // Truncate very long input text to avoid token overflow
  const truncatedText = text.length > 3000 ? text.substring(0, 3000) + '...' : text;

  // Token limits per mode
  const maxTokens = modeInfo.isLocal ? 800 : 1000;

  // Strict prompt with explicit length constraints to prevent truncation
  const prompt = `TASK: Break down assignment into actionable steps. Return ONLY valid JSON.

ASSIGNMENT:
${truncatedText}

OUTPUT FORMAT (strict JSON, no markdown, no explanation before/after):
{
  "title": "max 10 words",
  "summary": "max 20 words",
  "tasks": [
    {"step": 1, "task": "max 15 words", "timeEstimate": "e.g. 30 min", "tips": "max 15 words"}
  ],
  "keyRequirements": ["max 3 items, 5 words each"],
  "deadline": "date or null",
  "wordCount": "number or null",
  "overallTips": "max 20 words"
}

RULES:
- Exactly 3-5 tasks (no more)
- Keep all text SHORT and simple
- No markdown code blocks
- Start response with { end with }`;

  try {
    const aiResult = await generateWithAI(prompt, modeInfo, {
      maxTokens,
      temperature: 0.2,
      feature: 'assignmentBreakdown',
    });

    if (aiResult && aiResult.text) {
      // Try to parse JSON from response
      try {
        let jsonStr = aiResult.text.trim();

        // Remove markdown code blocks (various formats)
        jsonStr = jsonStr
          .replace(/```json\s*/gi, '')
          .replace(/```JSON\s*/g, '')
          .replace(/```\s*/g, '')
          .replace(/^\s*json\s*/i, ''); // Remove leading "json" if present

        // Try to extract JSON object from the string
        // Find the first { and last } to extract the JSON
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        // Clean up common JSON issues
        jsonStr = jsonStr
          .trim()
          .replace(/,\s*}/g, '}') // Remove trailing commas before }
          .replace(/,\s*]/g, ']'); // Remove trailing commas before ]

        console.log('[AssignmentBreakdown] Parsing JSON:', jsonStr.substring(0, 200) + '...');

        const parsed = JSON.parse(jsonStr);

        // Validate the structure has required fields
        if (parsed && parsed.title && Array.isArray(parsed.tasks)) {
          console.log('[AssignmentBreakdown] JSON parsed successfully:', parsed.title);
          return { breakdown: parsed };
        } else {
          console.warn('[AssignmentBreakdown] JSON missing required fields');
          throw new Error('Invalid JSON structure');
        }
      } catch (parseError) {
        console.warn('[AssignmentBreakdown] JSON parse failed:', parseError.message);
        console.log('[AssignmentBreakdown] Raw response:', aiResult.text.substring(0, 500));

        // Try to extract meaningful content from the response for a better fallback
        const rawText = aiResult.text;

        // Attempt to extract title from truncated JSON
        const titleMatch = rawText.match(/"title"\s*:\s*"([^"]+)"/);
        const summaryMatch = rawText.match(/"summary"\s*:\s*"([^"]+)"/);

        // If we found some data, use it
        const extractedTitle = titleMatch ? titleMatch[1] : 'Assignment Analysis';
        const extractedSummary = summaryMatch
          ? summaryMatch[1]
          : 'AI response was incomplete. Please try again or use a different model.';

        return {
          breakdown: {
            title: extractedTitle,
            summary: extractedSummary,
            tasks: [
              {
                step: 1,
                task: 'AI response was truncated or malformed. Click "Regenerate" to try again, or try a faster model like Haiku.',
                timeEstimate: '-',
                tips: 'Tip: Haiku 4.5 produces more concise, reliable results',
              },
            ],
            keyRequirements: [],
            overallTips: 'The AI response could not be fully processed.',
          },
        };
      }
    }

    throw new Error('Breakdown generation failed');
  } catch (error) {
    console.error(`[AssignmentBreakdown] Generation failed (attempt ${retryCount + 1}):`, error);

    // Check if this is a retryable error (network failures, timeouts)
    const isRetryable =
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('CORS') ||
      error.name === 'TypeError';

    // Retry with exponential backoff if we haven't exceeded max retries
    if (isRetryable && retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retryCount); // Exponential backoff: 1s, 2s, 4s
      console.log(
        `[AssignmentBreakdown] Retrying in ${delay}ms... (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`
      );
      await breakdown_sleep(delay);
      return breakdown_generate(text, modeInfo, retryCount + 1);
    }

    // If not retryable or max retries exceeded, throw the error
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
async function breakdown_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-breakdown-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Assignment Breakdown');
  panel.setAttribute('aria-modal', 'true');

  panel.innerHTML = sanitizeHTML(`
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
  `);

  // Inject styles
  breakdown_injectStyles();

  // Add event listeners
  const closeBtn = panel.querySelector('.assist-breakdown-close');
  attachInteractiveHandler(closeBtn, 'Assignment Breakdown Close Button', breakdown_hide);

  const copyBtn = panel.querySelector('.assist-breakdown-copy');
  attachInteractiveHandler(copyBtn, 'Assignment Breakdown Copy Button', breakdown_copy);

  const speakBtn = panel.querySelector('.assist-breakdown-speak');
  attachInteractiveHandler(speakBtn, 'Assignment Breakdown Speak Button', breakdown_speak);

  const regenerateBtn = panel.querySelector('.assist-breakdown-regenerate');
  attachInteractiveHandler(regenerateBtn, 'Assignment Breakdown Regenerate Button', async () => {
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

    .assist-breakdown-status[data-assist-clickable]:hover {
      text-decoration: underline;
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

    /* Model selector in actions bar */
    .assist-breakdown-model-selector {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      margin-right: auto;
    }

    .assist-breakdown-model-selector.hidden {
      display: none !important;
    }

    .assist-model-icon {
      font-size: 14px;
    }

    .assist-breakdown-model {
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      background: white;
      cursor: pointer;
      min-width: 100px;
    }

    .assist-breakdown-model:focus {
      outline: none;
      border-color: #FF6B6B;
      box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.2);
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

    .assist-breakdown-cloud-badge {
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

      .assist-breakdown-model-selector {
        background: rgba(255, 255, 255, 0.1);
      }

      .assist-breakdown-model {
        background: #2a2a2a;
        color: #e0e0e0;
        border-color: #444;
      }

      .assist-breakdown-model:focus {
        border-color: #FF6B6B;
        box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.3);
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
 * @param {boolean} isCloud - Whether cloud model was used
 * @param {string} modelName - Name of the model used
 */
async function breakdown_renderResult(result, isAI, _isCloud = false, _modelName = '') {
  const contentArea = breakdown_panel?.querySelector('.assist-breakdown-content');
  if (!contentArea) {
    return;
  }

  const _bkBadgeInfo = await getAIBadgeInfo();
  const badge = isAI
    ? renderAIBadge(_bkBadgeInfo.mode, _bkBadgeInfo.label)
    : renderAIBadge('fallback', 'Basic');

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
               data-task-step="${task.step}"
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

  contentArea.innerHTML = sanitizeHTML(html);

  // Attach event handlers to checkboxes (onclick is stripped by sanitizeHTML)
  contentArea.querySelectorAll('.assist-breakdown-task-checkbox').forEach(checkbox => {
    const step = parseInt(checkbox.getAttribute('data-task-step'), 10);
    if (!isNaN(step)) {
      attachInteractiveHandler(checkbox, `Task ${step} Checkbox`, () => {
        breakdown_toggleTask(step);
      });
    }
  });
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
async function breakdown_show(selectionRect = null) {
  if (breakdown_panel) {
    breakdown_panel.remove();
  }

  // Reset checked items for new breakdown
  breakdown_checkedItems.clear();

  breakdown_panel = await breakdown_createPanel();
  document.body.appendChild(breakdown_panel);

  // Position near selection if available
  if (selectionRect) {
    const panelRect = breakdown_panel.getBoundingClientRect();
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
    contentArea.innerHTML = sanitizeHTML(`
      <div class="assist-breakdown-loading">
        <div class="assist-breakdown-spinner"></div>
        <span>Analyzing assignment...</span>
      </div>
    `);
  }

  // Disable action buttons
  actionBtns?.forEach(btn => {
    btn.disabled = true;
  });

  // Get AI mode and check availability
  const modeInfo = await getAIMode('assignmentBreakdown');
  const availability = await checkAIAvailable(modeInfo);

  try {
    let result;
    let isAI = false;

    if (!availability.available) {
      if (availability.needsApiKey) {
        breakdown_isLoading = false;
        actionBtns?.forEach(btn => {
          btn.disabled = false;
        });
        breakdown_showApiKeyWarning();
        return;
      }
      // Fall back to rule-based breakdown
      result = breakdown_fallback(text);

      if (statusBar) {
        setAIStatusBar(statusBar, availability, 'assist-breakdown-status');
      }
    } else {
      // Use AI breakdown
      const response = await breakdown_generate(text, modeInfo);
      result = response.breakdown;
      isAI = true;

      if (statusBar) {
        statusBar.textContent = getSuccessStatusMessage(modeInfo, 'breakdown complete');
        statusBar.className = 'assist-breakdown-status visible success';
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
      // Check if it's a CORS error and provide helpful guidance
      const isCorsError = error.message.includes('CORS') || error.message.includes('403');
      if (isCorsError) {
        statusBar.innerHTML = `
          <div style="padding: 4px 8px;">
            <strong>⚠️ Ollama CORS not configured</strong>
            <details style="margin-top: 6px; font-size: 12px;">
              <summary style="cursor: pointer; color: #ff6b35; font-weight: 600;">
                Click for fix instructions
              </summary>
              <div style="margin-top: 6px; padding: 8px; background: #f9f9f9; border-radius: 4px; line-height: 1.5;">
                <strong>Windows:</strong><br>
                1. Close Ollama (system tray)<br>
                2. Run <code style="background: #e0e0e0; padding: 2px 4px; border-radius: 2px;">start-ollama-cors.bat</code> in AssisT folder<br>
                3. Keep terminal window open<br><br>
                <strong>Mac/Linux:</strong><br>
                1. Stop: <code style="background: #e0e0e0; padding: 2px 4px; border-radius: 2px;">pkill ollama</code><br>
                2. Start: <code style="background: #e0e0e0; padding: 2px 4px; border-radius: 2px;">OLLAMA_ORIGINS=* ollama serve</code><br>
                3. Keep terminal open
              </div>
            </details>
          </div>
        `;
      } else {
        statusBar.textContent = `⚠️ AI unavailable: ${error.message}`;
      }
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
// API KEY WARNING
// ============================================================================

/**
 * Show API key warning when cloud mode is enabled but no key is configured
 */
function breakdown_showApiKeyWarning() {
  const contentArea = breakdown_panel?.querySelector('.assist-breakdown-content');
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
        <button class="breakdown-open-settings" style="
          background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">⚙️ Open Advanced Options</button>
        <button class="breakdown-use-local" style="
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
  const openSettingsBtn = contentArea.querySelector('.breakdown-open-settings');
  if (openSettingsBtn) {
    attachInteractiveHandler(openSettingsBtn, 'Open Settings Button', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
      alert(
        'To add your API key:\n\n1. Click the AssisT extension icon\n2. Click "Advanced Options"\n3. Go to the "AI" tab\n4. Select your AI provider and enter your API key\n5. Click Save'
      );
    });
  }

  const useLocalBtn = contentArea.querySelector('.breakdown-use-local');
  if (useLocalBtn) {
    attachInteractiveHandler(useLocalBtn, 'Use Local AI Button', async () => {
      await chrome.storage.local.set({ aiMode: 'local' });
      console.log('[AssignmentBreakdown] Switched to local AI mode');
      breakdown_showEmptyState();
    });
  }
}

/**
 * Show the empty state
 */
function breakdown_showEmptyState() {
  const contentArea = breakdown_panel?.querySelector('.assist-breakdown-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div style="text-align: center; padding: 40px 20px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
      <p>Select assignment text on the page to get a breakdown of tasks.</p>
      <p style="font-size: 13px; margin-top: 12px;">Now using Local AI mode.</p>
    </div>
  `);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Main entry point for assignment breakdown
 * @param {string} text - Assignment text to analyze
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
async function breakdown_start(text, selectionRect = null) {
  if (!text || text.trim().length === 0) {
    showToast('No text to analyze');
    return;
  }

  // Show the panel
  await breakdown_show(selectionRect);

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
  injectAIBadgeStyles();

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
