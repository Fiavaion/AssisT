/**
 * AI Setup Wizard Controller
 *
 * 8-screen wizard (step 0–7): Welcome → Scan → Recommend → Setup →
 * Needs Assessment → AI Test → Features → Done
 *
 * Persists all settings to chrome.storage.local.
 *
 * @module pages/ai-setup/ai-setup
 */

import { assess } from './system-detector.js';
import { recommend, getModeInfo, buildSystemPromptFromProfile } from './recommendation-engine.js';
import { attachAccessibleHandler, attachDelegatedHandler } from '../../utils/event-handlers.js';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  step: 0,
  assessment: null,
  recommendation: null,
  selectedMode: 'cloud',
  profile: { verbosity: 'moderate', readingLevel: 'standard', modality: 'both' },
  features: {},
  testPassed: false,
};

// ─── Wizard Steps ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'screen-welcome', name: 'Welcome' },
  { id: 'screen-scan', name: 'System Scan' },
  { id: 'screen-recommend', name: 'Recommendation' },
  { id: 'screen-setup', name: 'Configure' },
  { id: 'screen-needs', name: 'Your Needs' },
  { id: 'screen-test', name: 'AI Test' },
  { id: 'screen-features', name: 'Features' },
  { id: 'screen-done', name: 'Done' },
];
const TOTAL_STEPS = STEPS.length - 1; // Welcome is step 0, not counted

// ─── All Features (for recommendation engine) ─────────────────────────────────
const ALL_FEATURES = [
  {
    key: 'summarization',
    name: 'AI Summarisation',
    desc: 'Condense long texts into key points',
    always: true,
  },
  {
    key: 'textSimplification',
    name: 'Text Simplification',
    desc: 'Rewrite complex text in plain language',
    always: true,
  },
  {
    key: 'assignmentBreakdown',
    name: 'Assignment Breakdown',
    desc: 'Break complex tasks into manageable steps',
    verbosity: ['moderate', 'brief'],
  },
  {
    key: 'socraticTutor',
    name: 'Socratic Tutor',
    desc: 'Get guided hints rather than direct answers',
    verbosity: ['detailed', 'moderate'],
  },
  {
    key: 'studyPathGenerator',
    name: 'Study Path Generator',
    desc: 'Create a personalised learning roadmap',
    verbosity: ['detailed'],
  },
  {
    key: 'citationAnalyzer',
    name: 'Citation Analyser',
    desc: 'Verify and format academic references',
    readingLevel: ['standard', 'advanced'],
  },
  {
    key: 'knowledgeGraph',
    name: 'Knowledge Graph',
    desc: 'Visualise connections between concepts',
    modality: ['visual', 'both'],
  },
  {
    key: 'emotionalTTS',
    name: 'Expressive TTS',
    desc: 'Text-to-speech with natural intonation',
    modality: ['auditory', 'both'],
  },
  {
    key: 'multiDocCompare',
    name: 'Multi-Document Compare',
    desc: 'Find similarities and differences across sources',
    readingLevel: ['advanced', 'standard'],
  },
];

// ─── Navigation ───────────────────────────────────────────────────────────────
function showScreen(index) {
  state.step = index;

  // Progress bar (step 0 = 0%, step 7 = 100%)
  const fill = document.getElementById('progress-fill');
  const bar = document.getElementById('setup-progress-bar');
  const pct = index === 0 ? 0 : Math.round((index / TOTAL_STEPS) * 100);
  if (fill) {
    fill.style.width = `${pct}%`;
  }
  if (bar) {
    bar.setAttribute('aria-valuenow', index);
  }

  // Step label
  const labelEl = document.getElementById('step-label');
  const nameEl = document.getElementById('step-name');
  if (labelEl) {
    labelEl.textContent = index === 0 ? '' : `Step ${index} of ${TOTAL_STEPS}`;
  }
  if (nameEl) {
    nameEl.textContent = STEPS[index]?.name || '';
  }

  // Show/hide screens
  STEPS.forEach((step, i) => {
    const el = document.getElementById(step.id);
    if (el) {
      el.classList.toggle('active', i === index);
    }
  });

  // Screen-specific initialisation
  const inits = {
    1: initScan,
    2: initRecommend,
    3: initSetup,
    5: initTest,
    6: initFeatures,
    7: initDone,
  };
  if (inits[index]) {
    inits[index]();
  }
}

const nextScreen = () => showScreen(state.step + 1);
const prevScreen = () => showScreen(Math.max(0, state.step - 1));
const skipToEnd = () => {
  saveSettings();
  showScreen(STEPS.length - 1);
};

// ─── Step 1: System Scan ──────────────────────────────────────────────────────
async function initScan() {
  const nextBtn = document.getElementById('btn-scan-next');
  if (nextBtn) {
    nextBtn.disabled = true;
  }

  // Reset to scanning state
  ['webgpu', 'memory', 'ollama', 'nano'].forEach(id => {
    setScanItem(id, 'Checking…', '<span class="scanning-pulse" aria-hidden="true"></span>');
  });

  try {
    state.assessment = await assess();
    const { webgpu, memory, ollama, nano } = state.assessment;

    setScanItem(
      'webgpu',
      webgpu.supported ? `${webgpu.gpuName || 'WebGPU'} (${webgpu.tier})` : 'Not supported',
      webgpu.supported ? '✅' : '❌'
    );

    setScanItem(
      'memory',
      `${memory.ramGB}GB RAM`,
      memory.ramGB >= 4 ? '✅' : memory.ramGB >= 2 ? '⚠️' : '❌'
    );

    setScanItem(
      'ollama',
      ollama.available
        ? `Running — ${ollama.models.length} model${ollama.models.length !== 1 ? 's' : ''}`
        : 'Not running',
      ollama.available ? '✅' : '➖'
    );

    const nanoLabels = {
      ready: 'Available',
      'needs-download': 'Needs download',
      'not-supported': 'Not available',
      error: 'Not available',
    };
    setScanItem(
      'nano',
      nanoLabels[nano.status] || 'Not available',
      nano.available ? '✅' : nano.status === 'needs-download' ? '⚠️' : '➖'
    );

    if (nextBtn) {
      nextBtn.disabled = false;
    }
    // Auto-advance after a brief pause so users can read results
    setTimeout(() => {
      if (state.step === 1) {
        nextScreen();
      }
    }, 2000);
  } catch (err) {
    console.error('[AISetup] Scan error:', err);
    ['webgpu', 'memory', 'ollama', 'nano'].forEach(id => setScanItem(id, 'Check failed', '❌'));
    if (nextBtn) {
      nextBtn.disabled = false;
    }
  }
}

function setScanItem(id, value, status) {
  const valueEl = document.getElementById(`scan-${id}-value`);
  const statusEl = document.getElementById(`scan-${id}-status`);
  if (valueEl) {
    valueEl.textContent = value;
  }
  if (statusEl) {
    statusEl.innerHTML = status;
  }
}

// ─── Step 2: AI Recommendation ────────────────────────────────────────────────
function initRecommend() {
  if (!state.assessment) {
    return;
  }

  state.recommendation = recommend(state.assessment);
  state.selectedMode = state.recommendation.recommended;

  const container = document.getElementById('mode-options');
  if (!container) {
    return;
  }
  container.innerHTML = '';

  // Deduplicated list: recommended first, then alternatives, then 'off'
  const modes = [
    state.recommendation.recommended,
    ...state.recommendation.alternatives,
    'off',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  modes.forEach(mode => {
    const info = getModeInfo(mode);
    const isRecommended = mode === state.recommendation.recommended;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mode-option${isRecommended ? ' recommended selected' : ''}`;
    btn.dataset.mode = mode;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(isRecommended));

    const prosHTML = info.pros.map(p => `<li>${escapeHtml(p)}</li>`).join('');
    const reasoningHTML = isRecommended
      ? `<div class="mode-reasoning">${escapeHtml(state.recommendation.reasoning)}</div>`
      : '';

    btn.innerHTML = `
      <span class="mode-icon" aria-hidden="true">${info.icon}</span>
      <div class="mode-info">
        <div class="mode-title">${escapeHtml(info.title)}</div>
        <div class="mode-subtitle">${escapeHtml(info.subtitle)}</div>
        ${reasoningHTML}
        <ul class="mode-pros">${prosHTML}</ul>
      </div>`;

    container.appendChild(btn);
  });

  // Wire selection via delegated handler (dynamic content)
  attachDelegatedHandler(container, '.mode-option', 'Mode Selection', (_e, btn) => {
    container.querySelectorAll('.mode-option').forEach(el => {
      el.classList.remove('selected');
      el.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('selected');
    btn.setAttribute('aria-checked', 'true');
    state.selectedMode = btn.dataset.mode;
  });
}

// ─── Step 3: Guided Setup ─────────────────────────────────────────────────────
function initSetup() {
  // Hide all panels
  ['cloud', 'webllm', 'ollama', 'nano', 'off'].forEach(p => {
    const el = document.getElementById(`panel-${p}`);
    if (el) {
      el.hidden = true;
    }
  });

  const panelMap = {
    cloud: 'cloud',
    local: 'ollama',
    webllm: 'webllm',
    'gemini-nano': 'nano',
    off: 'off',
  };
  const panelId = panelMap[state.selectedMode] || 'cloud';
  const panel = document.getElementById(`panel-${panelId}`);
  if (panel) {
    panel.hidden = false;
  }

  if (state.selectedMode === 'local') {
    renderOllamaPanel();
  }
  if (state.selectedMode === 'gemini-nano') {
    renderNanoPanel();
  }
  if (state.selectedMode === 'cloud') {
    prefillCloudPanel();
  }
}

function prefillCloudPanel() {
  const suggested = state.recommendation?.details?.suggestedProvider || 'anthropic';
  const select = document.getElementById('cloud-provider-select');
  if (select) {
    select.value = suggested;
  }
  updateApiKeyLink(suggested);
}

function updateApiKeyLink(provider) {
  const links = {
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    google: 'https://aistudio.google.com/apikey',
    perplexity: 'https://www.perplexity.ai/settings/api',
  };
  const link = document.getElementById('api-key-link');
  if (link) {
    link.href = links[provider] || '#';
  }
}

function renderOllamaPanel() {
  const statusEl = document.getElementById('ollama-status-display');
  const modelsSection = document.getElementById('ollama-models-section');
  const installSteps = document.getElementById('ollama-install-steps');
  const ollama = state.assessment?.ollama;

  if (ollama?.available && ollama.models.length > 0) {
    if (statusEl) {
      statusEl.innerHTML = '<span class="status-badge success">✅ Ollama is running</span>';
    }
    if (modelsSection) {
      modelsSection.hidden = false;
      const select = document.getElementById('ollama-model-select');
      if (select) {
        select.innerHTML = ollama.models
          .map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
          .join('');
      }
    }
    if (installSteps) {
      installSteps.hidden = true;
    }
  } else {
    if (statusEl) {
      statusEl.innerHTML = '<span class="status-badge error">❌ Ollama not detected</span>';
    }
    if (modelsSection) {
      modelsSection.hidden = true;
    }
    if (installSteps) {
      installSteps.hidden = false;
    }
  }
}

function renderNanoPanel() {
  const statusEl = document.getElementById('nano-status-display');
  if (!statusEl) {
    return;
  }

  const nano = state.assessment?.nano;
  if (nano?.available) {
    statusEl.innerHTML = '<span class="status-badge success">✅ Gemini Nano is ready</span>';
  } else if (nano?.status === 'needs-download') {
    statusEl.innerHTML = `
      <span class="status-badge checking">⏳ Needs one-time download</span>
      <p class="helper-text" style="margin-top: var(--space-sm);">
        Chrome will download the model in the background. This may take a few minutes.
      </p>`;
  } else {
    statusEl.innerHTML = `
      <span class="status-badge error">❌ Gemini Nano not available</span>
      <p class="helper-text" style="margin-top: var(--space-sm);">
        Requires Chrome Dev / Canary with the Prompt API flag enabled.
      </p>`;
  }
}

// ─── Step 5: AI Test ──────────────────────────────────────────────────────────
const TEST_PROMPT = 'Explain what a bibliography is, simply. One or two sentences.';

async function initTest() {
  const responseArea = document.getElementById('test-response-area');
  const nextBtn = document.getElementById('btn-test-next');
  const actionsEl = document.getElementById('test-actions');

  if (!responseArea) {
    return;
  }
  if (nextBtn) {
    nextBtn.disabled = true;
  }
  if (actionsEl) {
    actionsEl.hidden = true;
  }

  responseArea.innerHTML = `
    <div class="test-response-box">
      <div class="test-loading">
        <span class="scanning-pulse" aria-hidden="true"></span>
        <span>Sending test message…</span>
      </div>
    </div>`;

  // Persist current settings so the service worker uses the right provider
  await saveSettings();

  let result;
  try {
    result = await runAITest();
  } catch (err) {
    result = { success: false, error: err.message };
  }

  if (result.success && result.text) {
    state.testPassed = true;
    responseArea.innerHTML = `
      <div class="test-response-box" role="region" aria-label="AI response">
        ${escapeHtml(result.text)}
      </div>`;
    if (nextBtn) {
      nextBtn.disabled = false;
    }
  } else {
    responseArea.innerHTML = `
      <div class="test-response-box">
        <span class="status-badge error">Test failed</span>
        <p class="helper-text" style="margin-top: var(--space-sm);">
          ${escapeHtml(result.error || 'No response from AI')}.<br>
          Check your API key or AI mode, then try again.
        </p>
      </div>`;
    if (nextBtn) {
      nextBtn.disabled = false;
    } // Allow skipping past a failed test
  }

  if (actionsEl) {
    actionsEl.hidden = false;
  }
}

function runAITest() {
  const mode = state.selectedMode;

  // WebLLM: model not loaded yet, show informational message
  if (mode === 'webllm') {
    return Promise.resolve({
      success: true,
      text: 'Browser AI (WebLLM) is configured. Your model will download automatically the first time you use an AI feature.',
    });
  }

  // No AI
  if (mode === 'off') {
    return Promise.resolve({
      success: true,
      text: 'AI is disabled. All accessibility features (TTS, STT, highlighting) remain fully available.',
    });
  }

  // Gemini Nano — direct API
  if (mode === 'gemini-nano' && window.ai?.languageModel) {
    return window.ai.languageModel
      .create()
      .then(session => session.prompt(TEST_PROMPT))
      .then(text => ({ success: true, text }))
      .catch(err => ({ success: false, error: err.message }));
  }

  // Cloud or Local — route through service worker
  return new Promise(resolve => {
    const actionMap = { cloud: 'CLOUD_LLM_GENERATE', local: 'OLLAMA_GENERATE' };
    const action = actionMap[mode] || 'CLOUD_LLM_GENERATE';

    const timer = setTimeout(() => {
      resolve({ success: false, error: 'Timed out after 30 seconds' });
    }, 30_000);

    chrome.runtime.sendMessage(
      { action, prompt: TEST_PROMPT, feature: 'summarization', maxTokens: 150 },
      response => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else if (response?.text || response?.content) {
          resolve({ success: true, text: response.text || response.content });
        } else {
          resolve({ success: false, error: response?.error || 'Empty response from AI' });
        }
      }
    );
  });
}

// ─── Step 6: Feature Recommendations ─────────────────────────────────────────
function initFeatures() {
  const container = document.getElementById('feature-recs');
  if (!container) {
    return;
  }
  container.innerHTML = '';

  const p = state.profile;

  // Score each feature against the user's profile
  const shown = ALL_FEATURES.filter(f => {
    if (f.always) {
      return true;
    }
    if (f.modality && !f.modality.includes(p.modality)) {
      return false;
    }
    if (f.readingLevel && !f.readingLevel.includes(p.readingLevel)) {
      return false;
    }
    if (f.verbosity && !f.verbosity.includes(p.verbosity)) {
      return false;
    }
    return true;
  });

  // Default enabled
  shown.forEach(f => {
    if (state.features[f.key] === undefined) {
      state.features[f.key] = true;
    }
  });

  shown.forEach(f => {
    const isOn = state.features[f.key] !== false;
    const checkId = `feat-${f.key}`;

    const div = document.createElement('div');
    div.className = 'feature-rec-item';
    div.innerHTML = `
      <div class="feature-rec-info">
        <div class="feature-rec-name">${escapeHtml(f.name)}</div>
        <div class="feature-rec-desc">${escapeHtml(f.desc)}</div>
      </div>
      <label class="toggle" for="${checkId}" aria-label="Enable ${escapeHtml(f.name)}">
        <input type="checkbox" id="${checkId}" ${isOn ? 'checked' : ''} />
        <span class="toggle-track" aria-hidden="true"></span>
      </label>`;

    div.querySelector('input').addEventListener('change', e => {
      state.features[f.key] = e.target.checked;
    });

    container.appendChild(div);
  });
}

// ─── Step 7: Done ─────────────────────────────────────────────────────────────
function initDone() {
  saveSettings();

  const badge = document.getElementById('done-mode-badge');
  if (badge && state.selectedMode) {
    const info = getModeInfo(state.selectedMode);
    badge.textContent = `${info.icon} ${info.title}`;
  }
}

// ─── Settings Persistence ─────────────────────────────────────────────────────
async function saveSettings() {
  const settings = {
    aiMode: state.selectedMode || 'cloud',
    userProfile: state.profile,
    enabledFeatures: state.features,
    systemPromptPrefix: buildSystemPromptFromProfile(state.profile),
    aiSetupComplete: true,
    onboardingComplete: true,
  };

  // Cloud: persist provider + key
  if (state.selectedMode === 'cloud') {
    const providerEl = document.getElementById('cloud-provider-select');
    const keyEl = document.getElementById('api-key-input');
    if (providerEl) {
      settings.aiProvider = providerEl.value;
    }
    if (keyEl?.value?.trim()) {
      const existing = (await getStored('apiKeys')) || {};
      existing[settings.aiProvider] = keyEl.value.trim();
      settings.apiKeys = existing;
    }
  }

  // WebLLM: persist selected model
  if (state.selectedMode === 'webllm') {
    const modelEl = document.getElementById('webllm-model-select');
    if (modelEl) {
      settings.webllmModel = modelEl.value;
    }
  }

  // Ollama: persist selected model
  if (state.selectedMode === 'local') {
    const modelEl = document.getElementById('ollama-model-select');
    if (modelEl) {
      settings.ollamaModel = modelEl.value;
    }
  }

  await chrome.storage.local.set(settings);
  console.log('[AISetup] Settings saved:', settings.aiMode);
}

function getStored(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => resolve(result[key] ?? null));
  });
}

// ─── API Key Verification (client-side format check) ──────────────────────────
function verifyApiKey() {
  const keyEl = document.getElementById('api-key-input');
  const statusEl = document.getElementById('api-key-status');
  const providerEl = document.getElementById('cloud-provider-select');
  const provider = providerEl?.value || 'anthropic';
  const key = keyEl?.value?.trim() || '';

  if (!key) {
    setStatus(statusEl, 'error', 'Please enter an API key');
    return;
  }

  const patterns = {
    anthropic: /^sk-ant-/,
    openai: /^sk-/,
    google: /^AI/,
    perplexity: /^pplx-/,
  };

  const pattern = patterns[provider];
  if (pattern && !pattern.test(key)) {
    setStatus(statusEl, 'error', `This doesn't look like a ${provider} key — check and try again`);
  } else {
    setStatus(statusEl, 'success', '✅ Format looks correct — key saved');
    saveSettings(); // Persist optimistically
  }
}

function setStatus(el, type, message) {
  if (el) {
    el.innerHTML = `<span class="status-badge ${escapeHtml(type)}">${escapeHtml(message)}</span>`;
  }
}

// ─── Ollama Recheck ────────────────────────────────────────────────────────────
async function recheckOllama() {
  const statusEl = document.getElementById('ollama-status-display');
  if (statusEl) {
    statusEl.innerHTML = '<span class="status-badge checking">⏳ Checking…</span>';
  }

  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'SYSTEM_ASSESS_OLLAMA' }, response => {
      if (response?.available && state.assessment) {
        state.assessment.ollama = { available: true, models: response.models || [] };
      }
      renderOllamaPanel();
      resolve();
    });
  });
}

// ─── WebLLM Download ──────────────────────────────────────────────────────────
function initiateModelDownload() {
  const modelEl = document.getElementById('webllm-model-select');
  const progressEl = document.getElementById('download-progress');
  const textEl = document.getElementById('download-status-text');
  const modelKey = modelEl?.value || 'llama-3.2-1b';

  if (progressEl) {
    progressEl.hidden = false;
  }
  if (textEl) {
    textEl.textContent = 'Download will start automatically on first use.';
  }

  // Save selected model now
  saveSettings();

  // Notify the service worker so it can warm up if possible
  chrome.runtime.sendMessage({ action: 'WEBLLM_PRELOAD_MODEL', modelKey }, () => {
    if (chrome.runtime.lastError) {
      return;
    } // silent — service worker may not handle this yet
    if (textEl) {
      textEl.textContent = 'Model queued — it will download on first use.';
    }
  });
}

// ─── Button Wiring ────────────────────────────────────────────────────────────
function wireButtons() {
  // Step 0: Welcome
  attachAccessibleHandler($('btn-welcome-start'), 'Start Scan', () => showScreen(1));
  attachAccessibleHandler($('btn-welcome-skip'), 'Skip Setup', skipToEnd);

  // Step 1: Scan
  attachAccessibleHandler($('btn-scan-next'), 'Scan Continue', nextScreen);
  attachAccessibleHandler($('btn-scan-skip'), 'Scan Skip', skipToEnd);

  // Step 2: Recommendation
  attachAccessibleHandler($('btn-recommend-back'), 'Rec Back', prevScreen);
  attachAccessibleHandler($('btn-recommend-next'), 'Use This Mode', nextScreen);
  attachAccessibleHandler($('btn-recommend-skip'), 'Rec Skip', skipToEnd);

  // Step 3: Setup
  attachAccessibleHandler($('btn-setup-back'), 'Setup Back', prevScreen);
  attachAccessibleHandler($('btn-setup-next'), 'Setup Continue', nextScreen);
  attachAccessibleHandler($('btn-setup-skip'), 'Setup Skip', skipToEnd);

  // Cloud sub-panel
  attachAccessibleHandler($('btn-toggle-key'), 'Toggle Key Visibility', toggleKeyVisibility);
  attachAccessibleHandler($('btn-verify-key'), 'Verify API Key', verifyApiKey);
  const providerSelect = $('cloud-provider-select');
  if (providerSelect) {
    providerSelect.addEventListener('change', () => updateApiKeyLink(providerSelect.value));
  }

  // WebLLM sub-panel
  attachAccessibleHandler($('btn-download-model'), 'Download Model', initiateModelDownload);

  // Ollama sub-panel
  attachAccessibleHandler($('btn-recheck-ollama'), 'Recheck Ollama', recheckOllama);

  // Step 4: Needs Assessment — static answer-option buttons
  document.querySelectorAll('.answer-option').forEach(btn => {
    attachAccessibleHandler(btn, `Answer ${btn.dataset.group}:${btn.dataset.value}`, () => {
      const group = btn.dataset.group;
      document.querySelectorAll(`.answer-option[data-group="${group}"]`).forEach(el => {
        el.classList.remove('selected');
        el.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-checked', 'true');
      state.profile[group] = btn.dataset.value;
    });
  });

  attachAccessibleHandler($('btn-needs-back'), 'Needs Back', prevScreen);
  attachAccessibleHandler($('btn-needs-next'), 'Needs Continue', nextScreen);
  attachAccessibleHandler($('btn-needs-skip'), 'Needs Skip', skipToEnd);

  // Step 5: Test
  attachAccessibleHandler($('btn-test-back'), 'Test Back', prevScreen);
  attachAccessibleHandler($('btn-test-next'), 'Test Continue', nextScreen);
  attachAccessibleHandler($('btn-test-skip'), 'Test Skip', skipToEnd);
  attachAccessibleHandler($('btn-rerun-test'), 'Rerun Test', initTest);

  // Step 6: Features
  attachAccessibleHandler($('btn-features-back'), 'Features Back', prevScreen);
  attachAccessibleHandler($('btn-features-skip'), 'Features Skip', skipToEnd);
  attachAccessibleHandler($('btn-features-apply'), 'Apply Features', () => {
    saveSettings();
    showScreen(STEPS.length - 1);
  });

  // Step 7: Done
  attachAccessibleHandler($('btn-done-open'), 'Open AssisT', () => {
    // Signal popup to open (best-effort; may not work in all contexts)
    chrome.runtime.sendMessage({ action: 'OPEN_POPUP' }, () => {
      /* ignore errors */
    });
    window.close();
  });
}

function toggleKeyVisibility() {
  const input = $('api-key-input');
  const btn = $('btn-toggle-key');
  if (!input) {
    return;
  }
  const nowVisible = input.type === 'password';
  input.type = nowVisible ? 'text' : 'password';
  if (btn) {
    btn.textContent = nowVisible ? 'Hide' : 'Show';
    btn.setAttribute('aria-label', nowVisible ? 'Hide API key' : 'Show API key');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Shorthand for document.getElementById */
const $ = id => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  // Restore any previously-saved settings
  const stored = await new Promise(resolve => {
    chrome.storage.local.get(['aiMode', 'userProfile', 'enabledFeatures'], resolve);
  });
  if (stored.aiMode) {
    state.selectedMode = stored.aiMode;
  }
  if (stored.userProfile) {
    Object.assign(state.profile, stored.userProfile);
  }
  if (stored.enabledFeatures) {
    state.features = stored.enabledFeatures;
  }

  wireButtons();
  showScreen(0);
}

document.addEventListener('DOMContentLoaded', init);
