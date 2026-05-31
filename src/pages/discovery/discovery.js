/**
 * Discovery Quiz Main Controller
 * Handles quiz flow, UI interactions, and state management
 */

import { QUESTIONS, getQuestionsForMode } from './questions.js';
import {
  calculateScores,
  getTopRecommendations,
  createProfile,
  applyProfile,
  calculateBestPreset,
  applyPreset,
} from './recommendations.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';

// Note: sanitizeHTML removed - all HTML content is extension-controlled
// (hardcoded in questions.js, no user input) - safe for Chrome Web Store

const state = {
  currentScreen: 'welcome',
  currentQuestion: 0,
  quizMode: 'quick', // 'quick' or 'full'
  activeQuestions: [], // Questions for current mode
  responses: {
    primary: {},
    sub: {},
  },
  recommendations: [],
  scores: {},
  recommendedPreset: null, // Best matching preset
};

const elements = {
  progressFill: null,
  screens: {},
  questionNumber: null,
  questionHeading: null,
  optionsContainer: null,
  tellMeMore: null,
  btnTellMore: null,
  subQuestions: null,
  btnBack: null,
  btnNext: null,
  btnStart: null,
  btnTryDemo: null,
  btnApply: null,
  btnRetake: null,
  btnSkipAll: null,
  recommendationsContainer: null,
  // Quiz mode elements
  quizModeOptions: null,
  // Preset recommendation elements
  presetRecommendation: null,
  presetIcon: null,
  presetName: null,
  presetDesc: null,
  btnApplyPreset: null,
  recommendationsDivider: null,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  bindEvents();
  showScreen('welcome');
  updateProgress();
}

function cacheElements() {
  elements.progressFill = document.getElementById('progress-fill');
  elements.screens = {
    welcome: document.getElementById('screen-welcome'),
    questions: document.getElementById('screen-questions'),
    results: document.getElementById('screen-results'),
  };
  elements.questionNumber = document.getElementById('question-number');
  elements.questionHeading = document.getElementById('question-heading');
  elements.optionsContainer = document.getElementById('options-container');
  elements.tellMeMore = document.getElementById('tell-me-more');
  elements.btnTellMore = document.getElementById('btn-tell-more');
  elements.subQuestions = document.getElementById('sub-questions');
  elements.btnBack = document.getElementById('btn-back');
  elements.btnNext = document.getElementById('btn-next');
  elements.btnStart = document.getElementById('btn-start');
  elements.btnTryDemo = document.getElementById('btn-try-demo');
  elements.btnApply = document.getElementById('btn-apply');
  elements.btnRetake = document.getElementById('btn-retake');
  elements.btnSkipAll = document.getElementById('btn-skip-all');
  elements.recommendationsContainer = document.getElementById('recommendations-container');
  // Quiz mode elements
  elements.quizModeOptions = document.querySelectorAll('.quiz-mode-option');
  // Preset recommendation elements
  elements.presetRecommendation = document.getElementById('preset-recommendation');
  elements.presetIcon = document.getElementById('preset-icon');
  elements.presetName = document.getElementById('preset-name');
  elements.presetDesc = document.getElementById('preset-desc');
  elements.btnApplyPreset = document.getElementById('btn-apply-preset');
  elements.recommendationsDivider = document.getElementById('recommendations-divider');
}

function bindEvents() {
  // NOTE: Discovery page uses standard click events instead of attachInteractiveHandler
  // because it's a standalone page without competing event listeners that would cause
  // the race conditions that mousedown handlers prevent in the popup context.

  if (elements.btnStart) {
    elements.btnStart.addEventListener('click', _e => {
      console.log('[Discovery] Start Quiz button clicked');
      try {
        startQuiz();
      } catch (error) {
        console.error('[Discovery] Start Quiz error:', error);
      }
    });
  } else {
    console.error('[Discovery] btnStart element not found - check HTML IDs');
  }

  if (elements.btnBack) {
    elements.btnBack.addEventListener('click', _e => {
      console.log('[Discovery] Back button clicked');
      try {
        goBack();
      } catch (error) {
        console.error('[Discovery] Back error:', error);
      }
    });
  }
  if (elements.btnNext) {
    elements.btnNext.addEventListener('click', _e => {
      console.log('[Discovery] Next button clicked');
      try {
        goNext();
      } catch (error) {
        console.error('[Discovery] Next error:', error);
      }
    });
  }
  if (elements.btnTellMore) {
    elements.btnTellMore.addEventListener('click', _e => {
      console.log('[Discovery] Tell Me More button clicked');
      try {
        toggleTellMeMore();
      } catch (error) {
        console.error('[Discovery] Tell Me More error:', error);
      }
    });
  }

  if (elements.btnTryDemo) {
    elements.btnTryDemo.addEventListener('click', _e => {
      console.log('[Discovery] Try Demo button clicked');
      try {
        openDemoPage();
      } catch (error) {
        console.error('[Discovery] Try Demo error:', error);
      }
    });
  }
  if (elements.btnApply) {
    elements.btnApply.addEventListener('click', _e => {
      console.log('[Discovery] Apply Profile button clicked');
      try {
        applyAndClose();
      } catch (error) {
        console.error('[Discovery] Apply Profile error:', error);
      }
    });
  }
  if (elements.btnRetake) {
    elements.btnRetake.addEventListener('click', _e => {
      console.log('[Discovery] Retake Quiz button clicked');
      try {
        retakeQuiz();
      } catch (error) {
        console.error('[Discovery] Retake Quiz error:', error);
      }
    });
  }
  if (elements.btnSkipAll) {
    elements.btnSkipAll.addEventListener('click', _e => {
      console.log('[Discovery] Skip All button clicked');
      try {
        skipAll();
      } catch (error) {
        console.error('[Discovery] Skip All error:', error);
      }
    });
  }

  elements.quizModeOptions.forEach(option => {
    option.addEventListener('click', _e => {
      const mode = option.dataset.mode;
      console.log('[Discovery] Quiz mode selected:', mode);
      selectQuizMode(mode);
    });
  });

  if (elements.btnApplyPreset) {
    elements.btnApplyPreset.addEventListener('click', _e => {
      console.log('[Discovery] Apply Preset button clicked');
      try {
        applyPresetAndClose();
      } catch (error) {
        console.error('[Discovery] Apply Preset error:', error);
      }
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', handleKeyboard);
}

function showScreen(screenName) {
  Object.entries(elements.screens).forEach(([name, element]) => {
    if (element) {
      element.classList.toggle('active', name === screenName);
    }
  });
  state.currentScreen = screenName;

  const activeScreen = elements.screens[screenName];
  if (activeScreen) {
    const heading = activeScreen.querySelector('h1, h2');
    if (heading) {
      heading.focus();
    }
  }
}

function updateProgress() {
  const questionsLength = state.activeQuestions.length || QUESTIONS.length;
  const total = questionsLength + 1; // +1 for results
  let current = 0;

  if (state.currentScreen === 'welcome') {
    current = 0;
  } else if (state.currentScreen === 'questions') {
    current = state.currentQuestion + 1;
  } else if (state.currentScreen === 'results') {
    current = total;
  }

  const percentage = (current / total) * 100;
  if (elements.progressFill) {
    elements.progressFill.style.width = `${percentage}%`;
  }

  // Update ARIA
  const progressBar = document.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.setAttribute('aria-valuenow', Math.round(percentage));
  }
}

function selectQuizMode(mode) {
  state.quizMode = mode;

  elements.quizModeOptions.forEach(option => {
    const isSelected = option.dataset.mode === mode;
    option.classList.toggle('selected', isSelected);
    option.querySelector('input[type="radio"]').checked = isSelected;
  });

  console.log('[Discovery] Quiz mode set to:', mode);
}

function startQuiz() {
  state.currentQuestion = 0;
  state.responses = { primary: {}, sub: {} };
  state.activeQuestions = getQuestionsForMode(state.quizMode);
  console.log(
    `[Discovery] Starting ${state.quizMode} quiz with ${state.activeQuestions.length} questions`
  );
  showScreen('questions');
  renderQuestion();
  updateProgress();
}

function goBack() {
  if (state.currentQuestion > 0) {
    state.currentQuestion--;
    renderQuestion();
    updateProgress();
  }
}

function goNext() {
  const currentQ = state.activeQuestions[state.currentQuestion];
  if (state.responses.primary[currentQ.id] === undefined) {
    return; // Must select an option
  }

  if (state.currentQuestion < state.activeQuestions.length - 1) {
    state.currentQuestion++;
    renderQuestion();
    updateProgress();
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  state.scores = calculateScores(state.responses);
  state.recommendations = getTopRecommendations(state.scores, 8);
  state.recommendedPreset = calculateBestPreset(state.responses);
  console.log('[Discovery] Calculated preset:', state.recommendedPreset);
  renderResults();
  showScreen('results');
  updateProgress();
}

function retakeQuiz() {
  state.currentQuestion = 0;
  state.responses = { primary: {}, sub: {} };
  state.scores = {};
  state.recommendations = [];
  state.recommendedPreset = null;
  showScreen('welcome');
  updateProgress();
}

function skipAll() {
  // Close the tab and return to normal browsing
  window.close();
}

function renderQuestion() {
  const question = state.activeQuestions[state.currentQuestion];
  if (!question) {
    return;
  }

  if (elements.questionNumber) {
    elements.questionNumber.textContent = `Question ${state.currentQuestion + 1} of ${state.activeQuestions.length}`;
  }

  if (elements.questionHeading) {
    elements.questionHeading.textContent = question.question;
  }

  renderOptions(question);
  renderSubQuestions(question);
  updateNavigationButtons();
  collapseTellMeMore();
}

function renderOptions(question) {
  if (!elements.optionsContainer) {
    return;
  }

  const selectedValue = state.responses.primary[question.id];

  // Safe innerHTML: content is extension-controlled (from questions.js)
  elements.optionsContainer.innerHTML = question.options
    .map(
      option => `
      <div class="option-item ${selectedValue === option.value ? 'selected' : ''}"
           data-value="${option.value}"
           role="radio"
           aria-checked="${selectedValue === option.value}"
           tabindex="0">
        <input
          type="radio"
          name="q-${question.id}"
          id="opt-${question.id}-${option.value}"
          value="${option.value}"
          ${selectedValue === option.value ? 'checked' : ''}
        >
        <label for="opt-${question.id}-${option.value}">${option.label}</label>
      </div>
    `
    )
    .join('');

  elements.optionsContainer.querySelectorAll('.option-item').forEach(item => {
    attachInteractiveHandler(item, 'Discovery Quiz Option', () =>
      selectOption(question.id, parseInt(item.dataset.value))
    );
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectOption(question.id, parseInt(item.dataset.value));
      }
    });
  });
}

function selectOption(questionId, value) {
  state.responses.primary[questionId] = value;

  elements.optionsContainer?.querySelectorAll('.option-item').forEach(item => {
    const isSelected = parseInt(item.dataset.value) === value;
    item.classList.toggle('selected', isSelected);
    item.setAttribute('aria-checked', isSelected);
    item.querySelector('input[type="radio"]').checked = isSelected;
  });

  updateNavigationButtons();
}

function renderSubQuestions(question) {
  if (!elements.subQuestions) {
    return;
  }

  if (!question.subQuestions || question.subQuestions.length === 0) {
    if (elements.tellMeMore) {
      elements.tellMeMore.style.display = 'none';
    }
    return;
  }

  if (elements.tellMeMore) {
    elements.tellMeMore.style.display = 'block';
  }

  // Safe innerHTML: content is extension-controlled (from questions.js)
  elements.subQuestions.innerHTML = question.subQuestions
    .map(
      subQ => `
      <div class="sub-question-item">
        <input
          type="checkbox"
          id="sub-${subQ.id}"
          ${state.responses.sub[subQ.id] ? 'checked' : ''}
        >
        <label for="sub-${subQ.id}">${subQ.label}</label>
      </div>
    `
    )
    .join('');

  elements.subQuestions.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', e => {
      const subId = e.target.id.replace('sub-', '');
      state.responses.sub[subId] = e.target.checked;
    });
  });
}

function toggleTellMeMore() {
  const isExpanded = elements.btnTellMore?.getAttribute('aria-expanded') === 'true';

  if (isExpanded) {
    collapseTellMeMore();
  } else {
    expandTellMeMore();
  }
}

function expandTellMeMore() {
  if (elements.btnTellMore) {
    elements.btnTellMore.setAttribute('aria-expanded', 'true');
  }
  if (elements.subQuestions) {
    elements.subQuestions.classList.remove('hidden');
    elements.subQuestions.setAttribute('aria-hidden', 'false');
  }
}

function collapseTellMeMore() {
  if (elements.btnTellMore) {
    elements.btnTellMore.setAttribute('aria-expanded', 'false');
  }
  if (elements.subQuestions) {
    elements.subQuestions.classList.add('hidden');
    elements.subQuestions.setAttribute('aria-hidden', 'true');
  }
}

function updateNavigationButtons() {
  const currentQ = state.activeQuestions[state.currentQuestion];
  const hasAnswer = state.responses.primary[currentQ?.id] !== undefined;

  if (elements.btnBack) {
    elements.btnBack.disabled = state.currentQuestion === 0;
  }

  if (elements.btnNext) {
    elements.btnNext.disabled = !hasAnswer;
    const isLastQuestion = state.currentQuestion === state.activeQuestions.length - 1;
    elements.btnNext.textContent = isLastQuestion ? 'See Results' : 'Next';

    // Re-add icon
    if (!elements.btnNext.querySelector('.btn-icon')) {
      const icon = document.createElement('span');
      icon.className = 'btn-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = isLastQuestion ? '✓' : '→';
      elements.btnNext.appendChild(icon);
    } else {
      elements.btnNext.querySelector('.btn-icon').textContent = isLastQuestion ? '✓' : '→';
    }
  }
}

function renderResults() {
  if (!elements.recommendationsContainer) {
    return;
  }

  renderPresetRecommendation();

  if (state.recommendations.length === 0) {
    // Safe innerHTML: hardcoded message (no user input)
    elements.recommendationsContainer.innerHTML = `
      <p class="no-recommendations">
        Based on your responses, you may not need many accessibility features right now.
        Feel free to explore the extension and enable features as needed.
      </p>
    `;
    return;
  }

  elements.recommendationsContainer.innerHTML = state.recommendations
    .map(rec => renderRecommendationCard(rec))
    .join('');

  elements.recommendationsContainer.querySelectorAll('.toggle-switch input').forEach(toggle => {
    toggle.addEventListener('change', e => {
      const featureId = e.target.dataset.featureId;
      if (featureId && state.scores[featureId] !== undefined) {
        // Toggle is purely visual for now - actual enabling happens on Apply
        console.log(`[Discovery] Feature ${featureId} toggled:`, e.target.checked);
      }
    });
  });

  elements.recommendationsContainer.querySelectorAll('.expand-btn').forEach(btn => {
    attachInteractiveHandler(btn, 'Discovery Recommendation Expand Button', e => {
      const card = e.target.closest('.recommendation-card');
      const details = card.querySelector('.card-details');
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';

      btn.setAttribute('aria-expanded', !isExpanded);
      details.classList.toggle('hidden', isExpanded);
      details.setAttribute('aria-hidden', isExpanded);
      btn.querySelector('.expand-text').textContent = isExpanded ? 'Learn more' : 'Show less';
      btn.querySelector('.expand-icon').textContent = isExpanded ? '▼' : '▲';
    });
  });
}

function renderPresetRecommendation() {
  const preset = state.recommendedPreset;

  if (!preset || !elements.presetRecommendation) {
    // Hide preset section if no preset match
    if (elements.presetRecommendation) {
      elements.presetRecommendation.classList.add('hidden');
    }
    if (elements.recommendationsDivider) {
      elements.recommendationsDivider.classList.add('hidden');
    }
    return;
  }

  // Show preset recommendation
  elements.presetRecommendation.classList.remove('hidden');
  if (elements.recommendationsDivider) {
    elements.recommendationsDivider.classList.remove('hidden');
  }

  // Update preset content
  if (elements.presetIcon) {
    elements.presetIcon.textContent = preset.icon;
  }
  if (elements.presetName) {
    elements.presetName.textContent = preset.name;
  }
  if (elements.presetDesc) {
    elements.presetDesc.textContent = preset.description;
  }

  console.log(
    '[Discovery] Showing preset recommendation:',
    preset.name,
    'with score:',
    preset.matchScore
  );
}

function renderRecommendationCard(rec) {
  const tierClass = `${rec.tier}-match`;
  const badgeClass = `badge-${rec.tier}`;
  const detailsId = `details-${rec.id}`;

  return `
    <div class="recommendation-card ${tierClass} fade-in">
      <div class="card-header">
        <span class="recommendation-icon" aria-hidden="true">${rec.icon}</span>
        <div class="recommendation-content">
          <div class="recommendation-title">${rec.name}</div>
          <div class="recommendation-description">${rec.description}</div>
          <div class="card-actions">
            <span class="recommendation-badge ${badgeClass}">${rec.tierLabel}</span>
            <button
              class="expand-btn"
              type="button"
              aria-expanded="false"
              aria-controls="${detailsId}"
            >
              <span class="expand-text">Learn more</span>
              <span class="expand-icon" aria-hidden="true">▼</span>
            </button>
          </div>
        </div>
        <div class="recommendation-toggle">
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked
              data-feature-id="${rec.id}"
              data-setting-key="${rec.settingKey}"
              aria-label="Enable ${rec.name}"
            >
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="card-details hidden" id="${detailsId}" aria-hidden="true">
        <p class="detailed-description">${rec.detailedDescription || rec.description}</p>
        ${rec.howToUse ? `<p class="how-to-use"><strong>How to use:</strong> ${rec.howToUse}</p>` : ''}
      </div>
    </div>
  `;
}

async function applyAndClose() {
  // Gather enabled features from toggles
  const enabledFeatures = [];
  elements.recommendationsContainer?.querySelectorAll('.toggle-switch input').forEach(toggle => {
    if (toggle.checked && toggle.dataset.settingKey) {
      enabledFeatures.push(toggle.dataset.settingKey);
    }
  });

  // Create and apply profile
  const profile = createProfile(state.scores);
  profile.enabledFeatures = enabledFeatures;

  try {
    await applyProfile(profile);
    console.log('[Discovery] Profile applied successfully');

    // Show success message briefly then close
    showSuccessMessage('Your settings have been applied!');

    setTimeout(() => {
      window.close();
    }, 1500);
  } catch (error) {
    console.error('[Discovery] Failed to apply profile:', error);
    alert('There was an error saving your preferences. Please try again.');
  }
}

/**
 * Apply the recommended preset and close the quiz
 */
async function applyPresetAndClose() {
  const preset = state.recommendedPreset;
  if (!preset) {
    console.error('[Discovery] No preset to apply');
    return;
  }

  try {
    await applyPreset(preset);
    console.log('[Discovery] Preset applied successfully:', preset.name);

    // Show success message briefly then close
    showSuccessMessage(`${preset.name} preset applied!`);

    setTimeout(() => {
      window.close();
    }, 1500);
  } catch (error) {
    console.error('[Discovery] Failed to apply preset:', error);
    alert('There was an error applying the preset. Please try again.');
  }
}

function openDemoPage() {
  // Open demo page in new tab
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/demo/demo.html'),
    });
  } else {
    // Fallback for development
    window.open('../demo/demo.html', '_blank');
  }
}

function showSuccessMessage(message) {
  const toast = document.createElement('div');
  toast.className = 'success-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #16a34a;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    z-index: 1000;
    animation: fadeIn 200ms ease-out;
  `;
  document.body.appendChild(toast);
}

function handleKeyboard(e) {
  // Only handle in questions screen
  if (state.currentScreen !== 'questions') {
    return;
  }

  const question = state.activeQuestions[state.currentQuestion];
  const currentAnswer = state.responses.primary[question?.id];

  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      e.preventDefault();
      if (currentAnswer !== undefined && currentAnswer < 3) {
        selectOption(question.id, currentAnswer + 1);
      } else if (currentAnswer === undefined) {
        selectOption(question.id, 0);
      }
      break;

    case 'ArrowUp':
    case 'ArrowLeft':
      e.preventDefault();
      if (currentAnswer !== undefined && currentAnswer > 0) {
        selectOption(question.id, currentAnswer - 1);
      } else if (currentAnswer === undefined) {
        selectOption(question.id, 3);
      }
      break;

    case 'Enter':
      if (!elements.btnNext?.disabled) {
        goNext();
      }
      break;

    case 'Backspace':
      if (state.currentQuestion > 0) {
        goBack();
      }
      break;

    case '1':
    case '2':
    case '3':
    case '4':
      selectOption(question.id, parseInt(e.key) - 1);
      break;
  }
}

export { state, startQuiz, goNext, goBack, selectOption, finishQuiz };
