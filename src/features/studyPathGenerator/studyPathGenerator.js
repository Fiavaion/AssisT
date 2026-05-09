/**
 * Study Path Generator Feature
 *
 * Analyzes learning content and generates personalized study paths
 * with prerequisite mapping, learning objectives, and progress tracking.
 *
 * Features:
 * - Extract topics and concepts from content
 * - Generate ordered learning path
 * - Identify prerequisites and dependencies
 * - Create study schedule suggestions
 * - Track progress through path
 *
 * @module features/studyPathGenerator
 */

import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { injectAIBadgeStyles } from '../../utils/ai-badge.js';
import {
  getAIMode,
  checkAIAvailable,
  generateWithAI,
  getSuccessStatusMessage,
  getUnavailableStatusMessage,
  setAIStatusBar,
} from '../shared/ai-feature-client.js';

// ============================================================================
// CSS STYLES (injected separately to avoid innerHTML overwriting)
// ============================================================================

const SPG_PANEL_CSS = `
  #assist-spg-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 650px;
    max-width: 90vw;
    max-height: 85vh;
    background: white;
    color: #333;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    z-index: 999998;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .spg-header {
    background: linear-gradient(135deg, #5f2c82 0%, #49a09d 100%);
    color: white;
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .spg-header-info h3 {
    margin: 0 0 4px 0;
    font-size: 20px;
    font-weight: 600;
    color: #ffffff !important;
  }

  .spg-header-meta {
    font-size: 13px;
    opacity: 0.9;
    color: #ffffff !important;
  }

  .spg-close {
    background: rgba(255,255,255,0.2);
    border: none;
    color: white;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .spg-close:hover {
    background: rgba(255,255,255,0.3);
  }

  .spg-content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .spg-progress-bar {
    background: #f0f0f0;
    border-radius: 10px;
    height: 8px;
    margin-bottom: 20px;
    overflow: hidden;
  }

  .spg-progress-fill {
    background: linear-gradient(90deg, #5f2c82, #49a09d);
    height: 100%;
    transition: width 0.3s ease;
  }

  .spg-progress-text {
    font-size: 13px;
    color: #666;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
  }

  .spg-topic {
    background: #f8f9fa;
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
    border: 2px solid transparent;
    transition: border-color 0.2s;
  }

  .spg-topic.completed {
    border-color: #4CAF50;
    background: #f1f8f1;
  }

  .spg-topic-header {
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
  }

  .spg-topic-header:hover {
    background: rgba(0,0,0,0.02);
  }

  .spg-topic-checkbox {
    width: 24px;
    height: 24px;
    border: 2px solid #ccc;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .spg-topic.completed .spg-topic-checkbox {
    background: #4CAF50;
    border-color: #4CAF50;
    color: white;
  }

  .spg-topic-info {
    flex: 1;
  }

  .spg-topic-title {
    font-weight: 600;
    font-size: 15px;
    margin-bottom: 4px;
  }

  .spg-topic-meta {
    font-size: 12px;
    color: #666;
    display: flex;
    gap: 12px;
  }

  .spg-topic-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
  }

  .spg-topic-badge.easy {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .spg-topic-badge.medium {
    background: #fff3e0;
    color: #ef6c00;
  }

  .spg-topic-badge.hard {
    background: #ffebee;
    color: #c62828;
  }

  .spg-topic-expand {
    font-size: 18px;
    color: #999;
    transition: transform 0.2s;
  }

  .spg-topic.expanded .spg-topic-expand {
    transform: rotate(180deg);
  }

  .spg-topic-details {
    display: none;
    padding: 0 16px 16px;
    border-top: 1px solid #eee;
  }

  .spg-topic.expanded .spg-topic-details {
    display: block;
  }

  .spg-detail-section {
    margin-top: 12px;
  }

  .spg-detail-section h5 {
    margin: 0 0 6px 0;
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
  }

  .spg-detail-list {
    font-size: 13px;
  }

  .spg-detail-item {
    padding: 4px 0;
    padding-left: 16px;
    position: relative;
  }

  .spg-detail-item::before {
    content: '•';
    position: absolute;
    left: 0;
    color: #5f2c82;
  }

  .spg-key-terms {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .spg-key-term {
    background: #e3f2fd;
    color: #1976d2;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
  }

  .spg-practice {
    background: #fff8e1;
    padding: 12px;
    border-radius: 8px;
    font-size: 13px;
    color: #f57f17;
  }

  .spg-loading {
    text-align: center;
    padding: 60px;
  }

  .spg-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #f0f0f0;
    border-top-color: #5f2c82;
    border-radius: 50%;
    animation: spg-spin 1s linear infinite;
    margin: 0 auto 20px;
  }

  @keyframes spg-spin {
    to { transform: rotate(360deg); }
  }

  .spg-tips {
    background: #f1f8e9;
    border: 1px solid #c8e6c9;
    border-radius: 12px;
    padding: 16px;
    margin-top: 20px;
  }

  .spg-tips h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1b5e20;
  }

  .spg-tip-item {
    font-size: 13px;
    color: #2e7d32;
    padding: 4px 0;
    line-height: 1.5;
  }

  .spg-empty {
    text-align: center;
    padding: 60px;
    color: #666;
  }

  .spg-empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .spg-generate-btn {
    background: linear-gradient(135deg, #5f2c82 0%, #49a09d 100%);
    color: white;
    border: none;
    padding: 14px 28px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    margin-top: 16px;
  }

  .spg-generate-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(95, 44, 130, 0.3);
  }

  .spg-status {
    padding: 8px 20px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    font-size: 12px;
    color: #666;
    display: none;
    flex-shrink: 0;
  }

  .spg-status.visible {
    display: block;
  }

  .spg-status.error {
    background: #fff3e0;
    color: #e65100;
  }

  .spg-status[data-assist-clickable]:hover {
    text-decoration: underline;
  }

  .spg-status.success {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .spg-path-actions {
    display: flex;
    gap: 8px;
    padding: 12px 0 4px;
    border-top: 1px solid #e0e0e0;
    margin-top: 16px;
  }

  .spg-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 9px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: white;
    color: #333;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .spg-action-btn:hover {
    background: #f0f0f0;
    border-color: #ccc;
  }

  .spg-action-btn.active {
    background: linear-gradient(135deg, #5f2c82 0%, #49a09d 100%);
    color: white;
    border-color: transparent;
  }

  .spg-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/**
 * Inject CSS styles into document head
 */
function spg_injectStyles() {
  if (document.getElementById('assist-spg-styles')) {
    return; // Already injected
  }
  const styleEl = document.createElement('style');
  styleEl.id = 'assist-spg-styles';
  styleEl.textContent = SPG_PANEL_CSS;
  document.head.appendChild(styleEl);
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let spg_panel = null;
let spg_isLoading = false;
let spg_currentPath = null;
let spg_progress = {};

const spg_settings = {
  studyHoursPerDay: 2,
  difficultyPreference: 'balanced', // easy-first, hard-first, balanced
  includeReview: true,
};

// ============================================================================
// AI STUDY PATH GENERATION
// ============================================================================

/**
 * Generate study path from content
 * @param {string} text - Content to analyze
 * @returns {Promise<Object>} Study path
 */
async function spg_generatePath(text) {
  if (!text || text.trim().length < 100) {
    throw new Error('Not enough content to generate a study path');
  }

  spg_isLoading = true;
  spg_updateLoadingState(true);

  // Get current AI mode
  const modeInfo = await getAIMode('studyPathGenerator');
  const availability = await checkAIAvailable(modeInfo);

  if (!availability.available) {
    spg_isLoading = false;
    spg_updateLoadingState(false);
    if (availability.needsApiKey) {
      spg_showApiKeyWarning();
      return null;
    }
    // Show status bar and fall back to heuristic
    const statusBar = spg_panel?.querySelector('#spg-status');
    if (statusBar) {
      setAIStatusBar(statusBar, availability, 'spg-status');
    }
    const fallback = spg_heuristicGenerate(text);
    fallback._generatedBy = `Heuristic (${getUnavailableStatusMessage(availability)})`;
    spg_currentPath = fallback;
    spg_displayPath(fallback);
    return fallback;
  }

  console.log(`[StudyPathGenerator] Using AI mode: ${modeInfo.displayLabel}`);

  const prompt = `You are an expert learning designer. Analyze this educational content and create a structured study path.

CONTENT:
"""
${text.substring(0, 4000)}
"""

Create a study path in this exact JSON format:
{
  "title": "Study path title",
  "estimatedHours": 3,
  "difficulty": "intermediate",
  "topics": [
    {
      "id": 1,
      "title": "Topic name",
      "description": "One sentence description.",
      "objectives": ["Objective 1", "Objective 2"],
      "prerequisites": [],
      "estimatedMinutes": 30,
      "difficulty": "easy",
      "keyTerms": ["term1", "term2"]
    },
    {
      "id": 2,
      "title": "Second topic",
      "description": "One sentence description.",
      "objectives": ["Objective 1"],
      "prerequisites": [1],
      "estimatedMinutes": 45,
      "difficulty": "medium",
      "keyTerms": ["term3"]
    }
  ],
  "suggestedOrder": [1, 2],
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}

Rules:
- Create 4-6 logical topics from the content
- Order topics from foundational to advanced
- Keep descriptions to ONE sentence each
- Limit objectives to 2 per topic
- Limit keyTerms to 3 per topic
- Difficulty levels: easy, medium, hard
- Respond with ONLY valid JSON, no extra text`;

  try {
    const aiResult = await generateWithAI(prompt, modeInfo, {
      maxTokens: 8192,
      temperature: 0.4,
      feature: 'studyPathGenerator',
      noCache: true,
    });

    if (aiResult && aiResult.text) {
      console.log(`[StudyPathGenerator] AI response received (${modeInfo.displayLabel})`);
      console.log(
        '[StudyPathGenerator] Raw response (first 500 chars):',
        aiResult.text?.substring(0, 500)
      );

      let rawData = aiResult.text || '';

      // Step 1: Strip markdown code fences if present (```json ... ```)
      const codeBlockMatch = rawData.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        rawData = codeBlockMatch[1].trim();
        console.log('[StudyPathGenerator] Stripped code block');
      }

      // Step 2: Find start of JSON object
      const startIdx = rawData.indexOf('{');
      if (startIdx !== -1) {
        rawData = rawData.slice(startIdx);

        // Step 3: Try complete {..} match first (most reliable)
        let parsed = null;
        const completeMatch = rawData.match(/\{[\s\S]*\}/);
        if (completeMatch) {
          try {
            parsed = JSON.parse(completeMatch[0]);
          } catch (e) {
            console.warn('[StudyPathGenerator] Complete match parse failed:', e.message);
          }
        }

        // Step 4: If complete match failed, try raw from {
        if (!parsed) {
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            console.warn('[StudyPathGenerator] Raw parse failed:', e.message);
            console.log('[StudyPathGenerator] Failed JSON (first 300):', rawData.substring(0, 300));
          }
        }

        if (parsed) {
          spg_currentPath = spg_enhancePath(parsed);
          spg_currentPath._generatedBy = getSuccessStatusMessage(modeInfo, 'study path generated');
          spg_displayPath(spg_currentPath);
          const statusBar = spg_panel?.querySelector('#spg-status');
          if (statusBar) {
            statusBar.className = 'spg-status visible success';
            statusBar.textContent = spg_currentPath._generatedBy;
          }
          return spg_currentPath;
        }
      }
    }

    // Fallback to heuristic generation
    console.log('[StudyPathGenerator] Using heuristic generation');
    const fallback = spg_heuristicGenerate(text);
    fallback._generatedBy = 'Heuristic (AI unavailable)';
    spg_currentPath = fallback;
    spg_displayPath(fallback);
    return fallback;
  } catch (error) {
    console.error('[StudyPathGenerator] Generation failed:', error);
    const fallback = spg_heuristicGenerate(text);
    fallback._generatedBy = 'Heuristic (AI parse error — retry)';
    spg_currentPath = fallback;
    spg_displayPath(fallback);
    return fallback;
  } finally {
    spg_isLoading = false;
    spg_updateLoadingState(false);
  }
}

/**
 * Show warning when cloud mode is selected but no API key is configured
 */
function spg_showApiKeyWarning() {
  const contentArea = spg_panel?.querySelector('.spg-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div class="spg-empty">
      <div class="spg-empty-icon">🔑</div>
      <h3 style="margin: 0 0 12px 0; color: #333;">API Key Required</h3>
      <p style="color: #666; margin-bottom: 16px; line-height: 1.5;">
        Cloud AI mode is enabled but no API key is configured.<br>
        Please add your Anthropic API key to use cloud features.
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
        <button class="spg-generate-btn" id="spg-open-settings" style="background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);">
          ⚙️ Open Advanced Options
        </button>
        <button class="spg-generate-btn" id="spg-use-local" style="background: #6b7280;">
          💻 Use Local AI Instead
        </button>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 16px;">
        Go to: Extension Popup → Advanced Options → AI tab → Enter API Key
      </p>
    </div>
  `);

  // Attach handlers for buttons
  const openSettingsBtn = contentArea.querySelector('#spg-open-settings');
  if (openSettingsBtn) {
    attachInteractiveHandler(openSettingsBtn, 'Open Settings Button', () => {
      // Open the popup's advanced options
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
      // Also show an alert with instructions
      alert(
        'To add your API key:\n\n1. Click the AssisT extension icon\n2. Click "Advanced Options"\n3. Go to the "AI" tab\n4. Select your AI provider and enter your API key\n5. Click Save'
      );
    });
  }

  const useLocalBtn = contentArea.querySelector('#spg-use-local');
  if (useLocalBtn) {
    attachInteractiveHandler(useLocalBtn, 'Use Local AI Button', async () => {
      // Switch to local mode
      await chrome.storage.local.set({ aiMode: 'local' });
      console.log('[StudyPathGenerator] Switched to local AI mode');
      // Show the empty state again so user can generate
      spg_showEmptyState();
    });
  }
}

/**
 * Show the empty state for generating a study path
 */
function spg_showEmptyState() {
  const contentArea = spg_panel?.querySelector('.spg-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div class="spg-empty" id="spg-empty-state">
      <div class="spg-empty-icon">📚</div>
      <div>Select educational content to generate a personalized study path</div>
      <button class="spg-generate-btn" id="spg-generate">Generate Study Path</button>
    </div>
  `);

  // Re-attach generate button handler
  const generateBtn = contentArea.querySelector('#spg-generate');
  if (generateBtn) {
    attachInteractiveHandler(generateBtn, 'Study Path Generate Button', () => {
      const selection = window.getSelection().toString().trim();
      if (selection && selection.length > 100) {
        spg_generatePath(selection);
      } else {
        alert('Please select more text (at least 100 characters) to generate a study path.');
      }
    });
  }
}

/**
 * Enhance path with additional metadata
 * @param {Object} path - Generated path
 * @returns {Object} Enhanced path
 */
function spg_enhancePath(path) {
  // Ensure all topics have IDs
  path.topics = path.topics.map((topic, index) => ({
    ...topic,
    id: topic.id || index + 1,
    completed: spg_progress[topic.id] || false,
  }));

  // Calculate total time if not provided
  if (!path.estimatedHours) {
    const totalMinutes = path.topics.reduce((sum, t) => sum + (t.estimatedMinutes || 30), 0);
    path.estimatedHours = Math.ceil(totalMinutes / 60);
  }

  // Generate suggested order if not provided
  if (!path.suggestedOrder) {
    path.suggestedOrder = path.topics.map(t => t.id);
  }

  return path;
}

/**
 * Heuristic path generation fallback
 * @param {string} text - Content
 * @returns {Object} Generated path
 */
function spg_heuristicGenerate(text) {
  // Extract potential topics from headers, bold text, numbered items
  const lines = text.split('\n');
  const topics = [];
  let topicId = 1;

  // Look for structural elements
  const headerPattern = /^#+\s+(.+)$|^(.+):$|^\d+\.\s+(.+)$/;
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

  // Extract main concepts
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/);
  const wordFreq = {};
  words.filter(w => w.length > 5).forEach(w => (wordFreq[w] = (wordFreq[w] || 0) + 1));
  const keyTerms = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  // Create topics from structure or generate default ones
  lines.forEach(line => {
    const match = line.match(headerPattern);
    if (match && topics.length < 7) {
      const title = match[1] || match[2] || match[3];
      if (title && title.length > 3 && title.length < 100) {
        topics.push({
          id: topicId++,
          title: title.trim(),
          description: `Understanding ${title.toLowerCase()}`,
          objectives: [`Understand the concept of ${title.toLowerCase()}`],
          prerequisites: topicId > 2 ? [topicId - 2] : [],
          estimatedMinutes: 30,
          difficulty: topicId <= 2 ? 'easy' : topicId <= 4 ? 'medium' : 'hard',
          keyTerms: keyTerms.slice((topicId - 1) * 2, topicId * 2),
          practiceQuestions: [`What are the main points about ${title.toLowerCase()}?`],
          completed: false,
        });
      }
    }
  });

  // If no structure found, create generic topics
  if (topics.length < 2) {
    const chunks = Math.min(5, Math.ceil(sentences.length / 10));
    for (let i = 0; i < chunks; i++) {
      topics.push({
        id: i + 1,
        title: `Section ${i + 1}: ${keyTerms[i] || 'Core Concepts'}`,
        description: `Study section ${i + 1} of the material`,
        objectives: ['Master the key concepts in this section'],
        prerequisites: i > 0 ? [i] : [],
        estimatedMinutes: 25,
        difficulty: i === 0 ? 'easy' : i < 3 ? 'medium' : 'hard',
        keyTerms: keyTerms.slice(i * 3, (i + 1) * 3),
        practiceQuestions: ['Summarize the main ideas from this section'],
        completed: false,
      });
    }
  }

  const totalMinutes = topics.reduce((sum, t) => sum + t.estimatedMinutes, 0);

  return {
    title:
      'Study Path: ' +
      (keyTerms[0] ? keyTerms[0].charAt(0).toUpperCase() + keyTerms[0].slice(1) : 'Content Review'),
    estimatedHours: Math.ceil(totalMinutes / 60),
    difficulty: 'intermediate',
    topics,
    suggestedOrder: topics.map(t => t.id),
    reviewSchedule: {
      day1: topics.slice(0, 2).map(t => t.id),
      day3: topics.map(t => t.id),
      day7: topics.map(t => t.id),
    },
    tips: [
      'Start with the foundational topics before moving to advanced ones',
      'Take breaks every 25-30 minutes for better retention',
      'Review completed sections before starting new ones',
    ],
    isHeuristic: true,
  };
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Mark topic as completed
 * @param {number} topicId - Topic ID
 */
function spg_markComplete(topicId) {
  spg_progress[topicId] = true;

  if (spg_currentPath) {
    const topic = spg_currentPath.topics.find(t => t.id === topicId);
    if (topic) {
      topic.completed = true;
    }
    spg_updateProgressDisplay();
  }

  // Save progress
  spg_saveProgress();
}

/**
 * Mark topic as incomplete
 * @param {number} topicId - Topic ID
 */
function spg_markIncomplete(topicId) {
  spg_progress[topicId] = false;

  if (spg_currentPath) {
    const topic = spg_currentPath.topics.find(t => t.id === topicId);
    if (topic) {
      topic.completed = false;
    }
    spg_updateProgressDisplay();
  }

  spg_saveProgress();
}

/**
 * Save progress to storage
 */
async function spg_saveProgress() {
  try {
    await chrome.storage.local.set({ studyPathProgress: spg_progress });
  } catch (e) {
    console.warn('[StudyPathGenerator] Could not save progress:', e);
  }
}

/**
 * Load progress from storage
 */
async function spg_loadProgress() {
  try {
    const result = await chrome.storage.local.get('studyPathProgress');
    if (result.studyPathProgress) {
      spg_progress = result.studyPathProgress;
    }
  } catch (e) {
    console.warn('[StudyPathGenerator] Could not load progress:', e);
  }
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the study path panel
 * @returns {HTMLElement}
 */
function spg_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-spg-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Study Path Generator');
  panel.tabIndex = -1;

  // CSS is injected into document.head via spg_injectStyles()
  // Using direct innerHTML assignment (not +=) to preserve DOM structure
  panel.innerHTML = `
    <div class="spg-header">
      <div class="spg-header-info">
        <h3>📚 Study Path</h3>
        <div class="spg-header-meta" id="spg-header-meta">Generate a personalized learning path</div>
      </div>
      <button class="spg-close" aria-label="Close">&times;</button>
    </div>
    <div class="spg-status" id="spg-status"></div>
    <div class="spg-content">
      <div class="spg-loading" id="spg-loading" style="display: none;">
        <div class="spg-spinner"></div>
        <div style="font-size: 16px; color: #333;">Analyzing content...</div>
        <div style="font-size: 13px; color: #666; margin-top: 8px;">Creating your personalized study path</div>
      </div>

      <div class="spg-empty" id="spg-empty">
        <div class="spg-empty-icon">🎓</div>
        <div style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">Ready to Learn?</div>
        <div style="font-size: 14px;">Select text from your study material and generate a structured learning path.</div>
        <button class="spg-generate-btn" id="spg-generate-btn">Generate Study Path</button>
      </div>

      <div id="spg-path-content" style="display: none;">
        <div class="spg-progress-text">
          <span id="spg-progress-label">0 of 0 topics completed</span>
          <span id="spg-time-estimate"></span>
        </div>
        <div class="spg-progress-bar">
          <div class="spg-progress-fill" id="spg-progress-fill" style="width: 0%"></div>
        </div>

        <div id="spg-topics"></div>

        <div class="spg-tips" id="spg-tips">
          <h4>💡 Study Tips</h4>
          <div id="spg-tips-list"></div>
        </div>

        <div class="spg-path-actions">
          <button class="spg-action-btn" id="spg-copy-all-btn" aria-label="Copy all study path content to clipboard">
            📋 Copy All
          </button>
          <button class="spg-action-btn" id="spg-read-all-btn" aria-label="Read all study path content aloud">
            🔊 Read All
          </button>
        </div>
      </div>
    </div>
  `;

  return panel;
}

/**
 * Build plain-text summary of the full study path for copying
 * @param {Object} path
 * @returns {string}
 */
function spg_buildCopyText(path) {
  const lines = [`📚 Study Path: ${path.title || 'Untitled'}`];
  lines.push(
    `Estimated: ${path.estimatedHours} hours • ${path.topics.length} topics • ${path.difficulty}`
  );
  lines.push('');

  path.topics.forEach((t, i) => {
    lines.push(`Topic ${i + 1}: ${t.title} (${t.estimatedMinutes} min • ${t.difficulty})`);
    if (t.description) {
      lines.push(`  ${t.description}`);
    }
    if (t.objectives && t.objectives.length) {
      lines.push('  Learning objectives:');
      t.objectives.forEach(o => lines.push(`    • ${o}`));
    }
    if (t.keyTerms && t.keyTerms.length) {
      lines.push(`  Key terms: ${t.keyTerms.join(', ')}`);
    }
    lines.push('');
  });

  if (path.tips && path.tips.length) {
    lines.push('💡 Study Tips:');
    path.tips.forEach(t => lines.push(`  • ${t}`));
  }

  return lines.join('\n');
}

/** @type {SpeechSynthesisUtterance|null} */
let spg_utterance = null;

/**
 * Wait for speechSynthesis voices to be available
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
function spg_ensureVoicesLoaded() {
  return new Promise(resolve => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    const onChanged = () => {
      const loaded = window.speechSynthesis.getVoices();
      if (loaded.length > 0) {
        window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
        resolve(loaded);
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', onChanged);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
      resolve(window.speechSynthesis.getVoices());
    }, 2000);
  });
}

/**
 * Read all study path text aloud using TTS
 * @param {Object} path
 * @param {HTMLElement} btn
 */
async function spg_readAll(path, btn) {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    spg_utterance = null;
    btn.classList.remove('active');
    btn.textContent = '🔊 Read All';
    return;
  }

  const text = spg_buildCopyText(path);
  spg_utterance = new SpeechSynthesisUtterance(text);

  try {
    // Correct storage: assist_settings lives in chrome.storage.local
    const stored = await chrome.storage.local.get(['assist_settings']);
    const tts = stored.assist_settings?.tts || {};
    spg_utterance.rate = tts.rate || 1.0;
    spg_utterance.pitch = tts.pitch || 1.0;
    spg_utterance.volume = tts.volume || 1.0;
    if (tts.voice && tts.voice !== 'default') {
      // Wait for voices to be available before matching by name
      const voices = await spg_ensureVoicesLoaded();
      const match = voices.find(v => v.name === tts.voice);
      if (match) {
        spg_utterance.voice = match;
      }
    }
  } catch {
    // Use browser defaults if storage fails
  }

  btn.classList.add('active');
  btn.textContent = '⏹ Stop';

  spg_utterance.onend = () => {
    btn.classList.remove('active');
    btn.textContent = '🔊 Read All';
    spg_utterance = null;
  };
  spg_utterance.onerror = () => {
    btn.classList.remove('active');
    btn.textContent = '🔊 Read All';
    spg_utterance = null;
  };

  window.speechSynthesis.speak(spg_utterance);
}

/**
 * Display the generated study path
 * @param {Object} path - Study path
 */
function spg_displayPath(path) {
  const emptyEl = document.getElementById('spg-empty');
  const contentEl = document.getElementById('spg-path-content');
  const headerMeta = document.getElementById('spg-header-meta');

  if (emptyEl) {
    emptyEl.style.display = 'none';
  }
  if (contentEl) {
    contentEl.style.display = 'block';
  }

  // Update header — show study stats and AI source on separate lines
  if (headerMeta) {
    const generatedByLabel = path._generatedBy || '';
    const aiIndicator = generatedByLabel.startsWith('Cloud')
      ? `☁️ ${generatedByLabel}`
      : generatedByLabel === 'Local AI'
        ? '💻 Local AI'
        : generatedByLabel
          ? `⚠️ ${generatedByLabel}`
          : '';
    const statsLine = `${path.estimatedHours} hours • ${path.topics.length} topics • ${path.difficulty}`;
    headerMeta.innerHTML = `<span>${statsLine}</span>${aiIndicator ? `<br><span style="font-size:11px;opacity:0.85">${aiIndicator}</span>` : ''}`;
  }

  // Update time estimate
  const timeEst = document.getElementById('spg-time-estimate');
  if (timeEst) {
    timeEst.textContent = `~${path.estimatedHours} hours total`;
  }

  // Render topics
  const topicsEl = document.getElementById('spg-topics');
  if (topicsEl) {
    topicsEl.innerHTML = sanitizeHTML(
      path.topics
        .map(
          topic => `
      <div class="spg-topic ${topic.completed ? 'completed' : ''}" data-id="${topic.id}">
        <div class="spg-topic-header">
          <div class="spg-topic-checkbox">${topic.completed ? '✓' : ''}</div>
          <div class="spg-topic-info">
            <div class="spg-topic-title">${topic.title}</div>
            <div class="spg-topic-meta">
              <span>${topic.estimatedMinutes} min</span>
              <span class="spg-topic-badge ${topic.difficulty}">${topic.difficulty}</span>
              ${topic.prerequisites.length > 0 ? `<span>Requires: Topic ${topic.prerequisites.join(', ')}</span>` : ''}
            </div>
          </div>
          <div class="spg-topic-expand">▼</div>
        </div>
        <div class="spg-topic-details">
          <div class="spg-detail-section">
            <h5>Description</h5>
            <div class="spg-detail-list">${topic.description}</div>
          </div>
          ${
            topic.objectives && topic.objectives.length > 0
              ? `
          <div class="spg-detail-section">
            <h5>Learning Objectives</h5>
            <div class="spg-detail-list">
              ${topic.objectives.map(o => `<div class="spg-detail-item">${o}</div>`).join('')}
            </div>
          </div>
          `
              : ''
          }
          ${
            topic.keyTerms && topic.keyTerms.length > 0
              ? `
          <div class="spg-detail-section">
            <h5>Key Terms</h5>
            <div class="spg-key-terms">
              ${topic.keyTerms.map(t => `<span class="spg-key-term">${t}</span>`).join('')}
            </div>
          </div>
          `
              : ''
          }
          ${
            topic.practiceQuestions && topic.practiceQuestions.length > 0
              ? `
          <div class="spg-detail-section">
            <h5>Practice Question</h5>
            <div class="spg-practice">${topic.practiceQuestions[0]}</div>
          </div>
          `
              : ''
          }
        </div>
      </div>
    `
        )
        .join('')
    );

    // Add event listeners
    topicsEl.querySelectorAll('.spg-topic').forEach(el => {
      const header = el.querySelector('.spg-topic-header');
      const checkbox = el.querySelector('.spg-topic-checkbox');
      const topicId = parseInt(el.dataset.id);

      // Toggle expand
      attachInteractiveHandler(header, 'Study Path Topic Header', e => {
        if (!e.target.closest('.spg-topic-checkbox')) {
          el.classList.toggle('expanded');
        }
      });

      // Toggle completion
      attachInteractiveHandler(checkbox, 'Study Path Topic Checkbox', e => {
        e.stopPropagation();
        if (el.classList.contains('completed')) {
          spg_markIncomplete(topicId);
          el.classList.remove('completed');
          checkbox.textContent = '';
        } else {
          spg_markComplete(topicId);
          el.classList.add('completed');
          checkbox.textContent = '✓';
        }
      });
    });
  }

  // Render tips
  const tipsEl = document.getElementById('spg-tips-list');
  if (tipsEl && path.tips) {
    tipsEl.innerHTML = sanitizeHTML(
      path.tips.map(t => `<div class="spg-tip-item">• ${t}</div>`).join('')
    );
  }

  // Wire up Copy All and Read All buttons
  const copyBtn = document.getElementById('spg-copy-all-btn');
  if (copyBtn) {
    attachInteractiveHandler(copyBtn, 'Study Path Copy All', async () => {
      const text = spg_buildCopyText(path);
      try {
        await navigator.clipboard.writeText(text);
        const orig = copyBtn.textContent.trim();
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => {
          copyBtn.textContent = orig;
        }, 2000);
      } catch {
        copyBtn.textContent = '❌ Failed';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy All';
        }, 2000);
      }
    });
  }

  const readBtn = document.getElementById('spg-read-all-btn');
  if (readBtn) {
    attachInteractiveHandler(readBtn, 'Study Path Read All', () => {
      spg_readAll(path, readBtn);
    });
  }

  spg_updateProgressDisplay();
}

/**
 * Update progress display
 */
function spg_updateProgressDisplay() {
  if (!spg_currentPath) {
    return;
  }

  const completed = spg_currentPath.topics.filter(t => t.completed).length;
  const total = spg_currentPath.topics.length;
  const percent = total > 0 ? (completed / total) * 100 : 0;

  const progressLabel = document.getElementById('spg-progress-label');
  if (progressLabel) {
    progressLabel.textContent = `${completed} of ${total} topics completed`;
  }

  const progressFill = document.getElementById('spg-progress-fill');
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
}

/**
 * Update loading state
 * @param {boolean} loading
 */
function spg_updateLoadingState(loading) {
  const loadingEl = document.getElementById('spg-loading');
  const emptyEl = document.getElementById('spg-empty');
  const contentEl = document.getElementById('spg-path-content');

  if (loadingEl) {
    loadingEl.style.display = loading ? 'block' : 'none';
  }
  if (emptyEl) {
    emptyEl.style.display = loading ? 'none' : spg_currentPath ? 'none' : 'block';
  }
  if (contentEl) {
    contentEl.style.display = loading ? 'none' : spg_currentPath ? 'block' : 'none';
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the study path generator
 * @param {string} text - Optional initial content
 */
function spg_show(text = null) {
  if (spg_panel) {
    spg_panel.remove();
  }

  // Inject CSS into document head (prevents style loss from innerHTML operations)
  spg_injectStyles();

  spg_panel = spg_createPanel();
  document.body.appendChild(spg_panel);

  // Load saved progress
  spg_loadProgress();

  // Setup event handlers
  const closeBtn = spg_panel.querySelector('.spg-close');
  if (closeBtn) {
    attachInteractiveHandler(closeBtn, 'Study Path Close Button', spg_hide);
  }

  const generateBtn = document.getElementById('spg-generate-btn');
  if (generateBtn) {
    attachInteractiveHandler(generateBtn, 'Study Path Generate Button', () => {
      const selection = text || window.getSelection().toString().trim();
      if (selection && selection.length > 100) {
        spg_generatePath(selection);
      } else {
        alert('Please select more text (at least 100 characters) to generate a study path.');
      }
    });
  }

  // If text provided, generate immediately
  if (text && text.length > 100) {
    spg_generatePath(text);
  }

  // Escape to close
  document.addEventListener('keydown', spg_handleKeydown);

  spg_panel.focus();
}

/**
 * Hide the panel
 */
function spg_hide() {
  if (spg_panel) {
    spg_panel.remove();
    spg_panel = null;
  }
  document.removeEventListener('keydown', spg_handleKeydown);
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} e
 */
function spg_handleKeydown(e) {
  if (e.key === 'Escape' && spg_panel) {
    spg_hide();
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize study path generator
 */
function spg_init() {
  console.log('[StudyPathGenerator] Initializing...');
  injectAIBadgeStyles();

  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.studyPathGenerator = {
    show: spg_show,
    hide: spg_hide,
    generate: spg_generatePath,
    getCurrentPath: () => spg_currentPath,
    isLoading: () => spg_isLoading,
    markComplete: spg_markComplete,
    markIncomplete: spg_markIncomplete,
    getProgress: () => ({ ...spg_progress }),
    settings: spg_settings,
  };

  console.log('[StudyPathGenerator] Initialized and registered');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  spg_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { spg_show, spg_hide, spg_generatePath, spg_settings };
