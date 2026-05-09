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

// ─── WebLLM Model Data ────────────────────────────────────────────────────────
// Inlined here: ai-setup is a web_accessible_resource (files copied verbatim,
// not bundled), so imports outside src/pages/ai-setup/ and src/utils/ fail.
const WEBLLM_REGISTRY = {
  defaultModel: 'llama-3.2-1b',
  models: {
    'llama-3.2-1b': {
      id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.2 1B',
      size: '650MB',
      vramRequired: '1.2GB',
      description: 'Fast responses, good for simple tasks',
      avgSpeed: 'Fast (15–25 tok/s)',
      category: 'lightweight',
    },
    'gemma-2b': {
      id: 'gemma-2b-it-q4f16_1-MLC',
      name: 'Gemma 2B',
      size: '1.6GB',
      vramRequired: '2GB',
      description: "Google's efficient small model",
      avgSpeed: 'Fast (15–20 tok/s)',
      category: 'lightweight',
    },
    'llama-3.2-3b': {
      id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.2 3B',
      size: '1.9GB',
      vramRequired: '2.5GB',
      description: 'Better quality than 1B, still fast',
      avgSpeed: 'Moderate (12–18 tok/s)',
      category: 'balanced',
    },
    'phi-3.5-mini': {
      id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
      name: 'Phi-3.5 Mini',
      size: '2.3GB',
      vramRequired: '3GB',
      description: "Microsoft's efficient model",
      avgSpeed: 'Moderate (10–18 tok/s)',
      category: 'balanced',
    },
    'qwen2.5-3b': {
      id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
      name: 'Qwen 2.5 3B',
      size: '1.9GB',
      vramRequired: '2.5GB',
      description: 'High quality reasoning',
      avgSpeed: 'Moderate (12–20 tok/s)',
      category: 'balanced',
    },
    'mistral-7b': {
      id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
      name: 'Mistral 7B',
      size: '4.4GB',
      vramRequired: '6GB',
      description: 'Powerful general-purpose model',
      avgSpeed: 'Slower (6–12 tok/s)',
      category: 'high-quality',
    },
    'llama-3.1-8b': {
      id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.1 8B',
      size: '4.9GB',
      vramRequired: '6.5GB',
      description: "Meta's flagship model",
      avgSpeed: 'Slower (5–10 tok/s)',
      category: 'high-quality',
    },
    'gemma-7b': {
      id: 'gemma-7b-it-q4f16_1-MLC',
      name: 'Gemma 7B',
      size: '4.3GB',
      vramRequired: '5.5GB',
      description: "Google's larger model, high performance",
      avgSpeed: 'Slower (6–11 tok/s)',
      category: 'high-quality',
    },
  },
};

/**
 * Return the set of WebLLM model keys that have been successfully downloaded.
 * Tracked in chrome.storage.local by the service worker after each successful
 * WEBLLM_INITIALIZE call — reliable regardless of how web-llm internally caches files.
 * @returns {Promise<Set<string>>}
 */
async function getCachedWebLLMModels() {
  return new Promise(resolve => {
    chrome.storage.local.get(['webllmCachedModels'], result => {
      resolve(new Set(result.webllmCachedModels || []));
    });
  });
}

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  step: 0,
  assessment: null,
  recommendation: null,
  selectedMode: 'cloud',
  profile: { verbosity: 'moderate', readingLevel: 'standard', modality: 'both' },
  features: {},
  testPassed: false,
  taskModels: {}, // per-task WebLLM model overrides
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
  if (state.selectedMode === 'webllm') {
    renderWebLLMPanel();
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

// Suggested Ollama models to pull if none installed
const OLLAMA_SUGGESTED = [
  {
    name: 'llama3.2',
    label: 'Llama 3.2 (3B) — recommended, balanced',
    pull: 'ollama pull llama3.2',
  },
  {
    name: 'phi3:mini',
    label: 'Phi-3 Mini (3.8B) — fastest, low memory',
    pull: 'ollama pull phi3:mini',
  },
  {
    name: 'mistral',
    label: 'Mistral 7B — best quality, needs ~5GB RAM',
    pull: 'ollama pull mistral',
  },
  {
    name: 'gemma3:4b',
    label: 'Gemma 3 4B — Google, good reasoning',
    pull: 'ollama pull gemma3:4b',
  },
];

const OLLAMA_TASKS = [
  { key: 'summarization', label: 'Summarise text' },
  { key: 'textSimplification', label: 'Simplify text' },
  { key: 'assignmentBreakdown', label: 'Assignment helper' },
  { key: 'socraticTutor', label: 'Socratic tutor' },
  { key: 'studyPathGenerator', label: 'Study path' },
  { key: 'citationAnalyzer', label: 'Citation analysis' },
];

function renderOllamaPanel() {
  const statusEl = document.getElementById('ollama-status-display');
  const modelsSection = document.getElementById('ollama-models-section');
  const installSteps = document.getElementById('ollama-install-steps');
  const ollama = state.assessment?.ollama;

  if (ollama?.available && ollama.models.length > 0) {
    if (statusEl) {
      statusEl.innerHTML = `<span class="status-badge success">✅ Ollama is running — ${ollama.models.length} model${ollama.models.length > 1 ? 's' : ''} installed</span>`;
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
    renderOllamaTaskModels(ollama.models);
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
    renderOllamaSuggestedModels();
  }
}

function renderOllamaSuggestedModels() {
  const container = document.getElementById('ollama-suggested-models');
  if (!container) {
    return;
  }
  container.hidden = false;
  container.innerHTML = `
    <p class="helper-text" style="margin-bottom:var(--space-xs);">Once Ollama is running, pull a model to get started:</p>
    <div class="ollama-model-list">
      ${OLLAMA_SUGGESTED.map(
        m => `
        <div class="ollama-model-item">
          <div style="flex:1;">
            <span class="model-name">${escapeHtml(m.label)}</span>
          </div>
          <code class="code-snippet" style="font-size:0.75rem;user-select:all;">${escapeHtml(m.pull)}</code>
        </div>`
      ).join('')}
    </div>`;
}

function renderOllamaTaskModels(installedModels) {
  const container = document.getElementById('ollama-task-models');
  if (!container) {
    return;
  }
  container.hidden = false;

  const defaultModel = installedModels[0] || '';
  const opts = installedModels
    .map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
    .join('');

  container.innerHTML = `
    <details style="margin-top:var(--space-md);">
      <summary class="helper-link" style="cursor:pointer;">Advanced: assign a different model per task</summary>
      <div style="margin-top:var(--space-sm);">
        ${OLLAMA_TASKS.map(
          task => `
          <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-xs);">
            <label style="flex:1;font-size:0.875rem;">${escapeHtml(task.label)}</label>
            <select class="form-select" style="flex:1;font-size:0.8125rem;"
              aria-label="Model for ${escapeHtml(task.label)}"
              data-task="${escapeHtml(task.key)}">
              <option value="">Default (${escapeHtml(defaultModel)})</option>
              ${opts}
            </select>
          </div>`
        ).join('')}
      </div>
    </details>`;

  // Wire per-task selects — send SET_MODEL_PREFERENCE to service worker on change
  container.querySelectorAll('select[data-task]').forEach(sel => {
    sel.addEventListener('change', () => {
      if (sel.value) {
        chrome.runtime.sendMessage({
          action: 'SET_MODEL_PREFERENCE',
          taskType: sel.dataset.task,
          model: sel.value,
        });
      }
    });
  });
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

// ─── Step 3: WebLLM Panel ─────────────────────────────────────────────────────

const WEBLLM_TASKS = [
  { key: 'summarization', label: 'Summarise text' },
  { key: 'textSimplification', label: 'Simplify text' },
  { key: 'assignmentBreakdown', label: 'Assignment helper' },
  { key: 'socraticTutor', label: 'Socratic tutor' },
  { key: 'studyPathGenerator', label: 'Study path' },
  { key: 'citationAnalyzer', label: 'Citation analysis' },
];

async function renderWebLLMPanel() {
  const select = document.getElementById('webllm-model-select');
  if (!select) {
    return;
  }

  // Load previously saved model and task overrides
  const stored = await new Promise(resolve =>
    chrome.storage.local.get(['webllmModel', 'webllmTaskModels'], r => resolve(r))
  );
  const savedModel = stored.webllmModel || WEBLLM_REGISTRY.defaultModel;
  if (stored.webllmTaskModels) {
    Object.assign(state.taskModels, stored.webllmTaskModels);
  }

  // Detect cached models (best-effort, no WebLLM engine needed)
  const cachedKeys = await getCachedWebLLMModels();

  // Populate model select — cached models first in their own optgroup
  const webllmModels = Object.entries(WEBLLM_REGISTRY.models);
  const cached = webllmModels.filter(([k]) => cachedKeys.has(k));
  const notCached = webllmModels.filter(([k]) => !cachedKeys.has(k));

  const makeOption = ([key, config], downloaded) => {
    const label = downloaded
      ? `✓ ${config.name} — ${config.size} (ready)`
      : `${config.name} — ${config.size}`;
    const colorStyle = downloaded ? ' style="color:#34d399;"' : '';
    return `<option value="${escapeHtml(key)}"${key === savedModel ? ' selected' : ''}${colorStyle}>${escapeHtml(label)}</option>`;
  };

  let html = '';
  if (cached.length > 0) {
    html += `<optgroup label="✓ Already on this device">${cached.map(e => makeOption(e, true)).join('')}</optgroup>`;
  }
  if (notCached.length > 0) {
    html += `<optgroup label="Available to download">${notCached.map(e => makeOption(e, false)).join('')}</optgroup>`;
  }
  select.innerHTML = html;

  // Summary line below select
  const summaryEl = document.getElementById('webllm-cache-summary');
  if (summaryEl) {
    summaryEl.textContent =
      cached.length > 0
        ? `${cached.length} model${cached.length > 1 ? 's' : ''} already downloaded on this device`
        : 'No models downloaded yet — select one and click Download';
    summaryEl.style.color = cached.length > 0 ? '#34d399' : '';
  }

  updateWebLLMStatus(savedModel, cachedKeys);
  select.addEventListener('change', () => updateWebLLMStatus(select.value, cachedKeys));

  renderTaskModels(webllmModels, cachedKeys, savedModel);
}

function updateWebLLMStatus(modelKey, cachedKeys) {
  const statusEl = document.getElementById('webllm-model-status');
  const downloadBtn = document.getElementById('btn-download-model');
  if (!statusEl) {
    return;
  }

  const config = WEBLLM_REGISTRY.models[modelKey];
  if (!config) {
    return;
  }

  if (cachedKeys.has(modelKey)) {
    statusEl.innerHTML = `<span class="status-badge success" style="display:inline-block;margin:var(--space-xs) 0;">✓ ${escapeHtml(config.name)} is already downloaded</span>`;
    if (downloadBtn) {
      downloadBtn.textContent = 'Re-download model';
    }
  } else {
    statusEl.innerHTML = `<span class="helper-text" style="display:block;margin:var(--space-xs) 0;">Needs ${escapeHtml(config.vramRequired)} GPU memory · ${escapeHtml(config.size)} download</span>`;
    if (downloadBtn) {
      downloadBtn.textContent = 'Download model now';
    }
  }
}

function renderTaskModels(webllmModels, cachedKeys, defaultModel) {
  const container = document.getElementById('task-models-list');
  if (!container) {
    return;
  }

  const defaultName = WEBLLM_REGISTRY.models[defaultModel]?.name || defaultModel;

  container.innerHTML = WEBLLM_TASKS.map(task => {
    const override = state.taskModels[task.key] || '';
    const opts = webllmModels
      .map(([key, config]) => {
        const label = cachedKeys.has(key) ? `${config.name} ✓` : config.name;
        return `<option value="${escapeHtml(key)}" ${key === override ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      })
      .join('');
    return `
      <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-xs);">
        <label style="flex:1;font-size:0.875rem;">${escapeHtml(task.label)}</label>
        <select class="form-select" style="flex:1;font-size:0.8125rem;"
          aria-label="Model for ${escapeHtml(task.label)}"
          data-task="${escapeHtml(task.key)}">
          <option value="">Default (${escapeHtml(defaultName)})</option>
          ${opts}
        </select>
      </div>`;
  }).join('');

  container.querySelectorAll('select[data-task]').forEach(sel => {
    sel.addEventListener('change', () => {
      if (sel.value) {
        state.taskModels[sel.dataset.task] = sel.value;
      } else {
        delete state.taskModels[sel.dataset.task];
      }
    });
  });
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

  const loadingTextEl = document.createElement('span');
  loadingTextEl.textContent = 'Sending test message…';
  responseArea.innerHTML = '';
  const loadingBox = document.createElement('div');
  loadingBox.className = 'test-response-box';
  loadingBox.innerHTML =
    '<div class="test-loading"><span class="scanning-pulse" aria-hidden="true"></span></div>';
  loadingBox.querySelector('.test-loading').appendChild(loadingTextEl);
  responseArea.appendChild(loadingBox);

  // For WebLLM: relay download progress into the loading text
  const webllmProgressListener = msg => {
    if (msg.action !== 'WEBLLM_PROGRESS') {
      return;
    }
    const p = msg.progress || {};
    const pct = Math.round(p.percent || 0);
    loadingTextEl.textContent = p.status ? `${p.status} (${pct}%)` : `Initialising model… ${pct}%`;
  };
  if (state.selectedMode === 'webllm') {
    chrome.runtime.onMessage.addListener(webllmProgressListener);
    loadingTextEl.textContent = 'Checking model status…';
  }

  // Persist current settings so the service worker uses the right provider
  await saveSettings();

  let result;
  try {
    result = await runAITest();
  } catch (err) {
    result = { success: false, error: err.message };
  }

  if (state.selectedMode === 'webllm') {
    chrome.runtime.onMessage.removeListener(webllmProgressListener);
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

  // WebLLM — poll until model is ready, then generate
  if (mode === 'webllm') {
    return new Promise(resolve => {
      const deadline = Date.now() + 300_000; // 5 min max

      const pollUntilReady = () => {
        chrome.runtime.sendMessage({ action: 'WEBLLM_STATUS' }, statusResp => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          if (statusResp?.status?.ready) {
            // Model ready — run generate with short token limit for fast response
            const timer = setTimeout(() => {
              resolve({
                success: false,
                error: 'Generation timed out. The model is loaded — try running the test again.',
              });
            }, 120_000);
            chrome.runtime.sendMessage(
              { action: 'WEBLLM_GENERATE', prompt: TEST_PROMPT, options: { maxTokens: 60 } },
              response => {
                clearTimeout(timer);
                if (chrome.runtime.lastError) {
                  resolve({ success: false, error: chrome.runtime.lastError.message });
                  return;
                }
                if (response?.success) {
                  resolve({
                    success: true,
                    text: response.data || response.text || response.content,
                  });
                } else {
                  resolve({ success: false, error: response?.error || 'WebLLM generation failed' });
                }
              }
            );
          } else if (Date.now() < deadline) {
            // Still initialising — poll again in 3 seconds
            setTimeout(pollUntilReady, 3000);
          } else {
            resolve({
              success: false,
              error: 'Timed out waiting for model to load. Try running the test again.',
            });
          }
        });
      };

      pollUntilReady();
    });
  }

  // No AI
  if (mode === 'off') {
    return Promise.resolve({
      success: true,
      text: 'AI is disabled. All accessibility features (TTS, STT, highlighting) remain fully available.',
    });
  }

  // Gemini Nano — direct API (graceful fallback if not yet available)
  if (mode === 'gemini-nano') {
    if (window.ai?.languageModel) {
      return window.ai.languageModel
        .create()
        .then(session => session.prompt(TEST_PROMPT))
        .then(text => ({ success: true, text }))
        .catch(err => ({ success: false, error: err.message }));
    }
    return Promise.resolve({
      success: true,
      text: 'Gemini Nano is configured. Chrome will download the on-device model in the background when first used (requires Chrome Dev/Canary with the Prompt API flag enabled).',
    });
  }

  // Cloud or Local — route through service worker
  return new Promise(resolve => {
    const actionMap = { cloud: 'CLOUD_LLM_GENERATE', local: 'LOCAL_LLM_GENERATE' };
    const action = actionMap[mode];

    if (!action) {
      resolve({
        success: false,
        error: `Unknown AI mode: ${mode}. Please go back and select a mode.`,
      });
      return;
    }

    // Scale timeout based on model size detected from model name/tag.
    // Large quantised or full-precision models need significantly longer first-token latency.
    const ollamaModelEl = document.getElementById('ollama-model-select');
    const modelKey = (ollamaModelEl?.value || '').toLowerCase();
    const timeoutMs = (() => {
      // Very large models: 34b+ or f16/fp16/16bit full-precision weights
      if (/:(34b|70b|72b|110b)|[_:-](f16|fp16|16bit)/.test(modelKey)) {
        return 180_000;
      }
      // Large models: 13b–33b or q8 quantisation
      if (/:(13b|14b|16b|20b|30b|32b|33b)|[_:-]q8/.test(modelKey)) {
        return 120_000;
      }
      // Medium models: 7b–12b
      if (/:(7b|8b|9b|10b|11b|12b)/.test(modelKey)) {
        return 60_000;
      }
      // Small models (default): 1b–6b or cloud
      return 30_000;
    })();

    const timeoutSec = Math.round(timeoutMs / 1000);
    const timer = setTimeout(() => {
      resolve({
        success: false,
        error: `Timed out after ${timeoutSec} seconds. Large models may need more time on first load — try again.`,
      });
    }, timeoutMs);

    chrome.runtime.sendMessage(
      { action, prompt: TEST_PROMPT, feature: 'summarization', maxTokens: 150 },
      response => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else if (response?.text || response?.content || response?.data) {
          resolve({ success: true, text: response.text || response.content || response.data });
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
      settings.cloudProvider = providerEl.value; // cloud-router.js reads this key
    }
    if (keyEl?.value?.trim()) {
      // Save via service worker so it uses encrypted storage (secure_apikey_{provider})
      // ai-setup is a web_accessible_resource and cannot import secure-key-storage directly
      chrome.runtime.sendMessage({
        action: 'SAVE_API_KEY',
        provider: settings.aiProvider,
        apiKey: keyEl.value.trim(),
      });
    }
  }

  // WebLLM: persist selected model and per-task overrides
  if (state.selectedMode === 'webllm') {
    const modelEl = document.getElementById('webllm-model-select');
    if (modelEl) {
      settings.webllmModel = modelEl.value;
    }
    if (Object.keys(state.taskModels).length > 0) {
      settings.webllmTaskModels = { ...state.taskModels };
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
  const barEl = document.getElementById('download-bar');
  const percentEl = document.getElementById('download-percent');
  const downloadBtn = document.getElementById('btn-download-model');
  const modelKey = modelEl?.value || 'llama-3.2-1b';

  // Save selected model
  saveSettings();

  // Show progress UI
  if (progressEl) {
    progressEl.hidden = false;
  }
  if (textEl) {
    textEl.textContent = 'Starting download…';
  }
  if (barEl) {
    barEl.style.width = '0%';
    barEl.setAttribute('aria-valuenow', 0);
  }
  if (percentEl) {
    percentEl.textContent = '0%';
  }
  if (downloadBtn) {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading…';
  }

  // Listen for progress messages from service worker
  const progressListener = msg => {
    if (msg.action !== 'WEBLLM_PROGRESS' || msg.modelKey !== modelKey) {
      return;
    }
    const p = msg.progress || {};
    const pct = Math.min(Math.round(p.percent || 0), 100);
    if (barEl) {
      barEl.style.width = `${pct}%`;
      barEl.setAttribute('aria-valuenow', pct);
    }
    if (percentEl) {
      percentEl.textContent = `${pct}%`;
    }
    if (textEl) {
      textEl.textContent = p.status || 'Downloading…';
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  // Trigger actual download via service worker
  chrome.runtime.sendMessage({ action: 'WEBLLM_INITIALIZE', modelKey }, response => {
    chrome.runtime.onMessage.removeListener(progressListener);

    if (response?.success) {
      if (barEl) {
        barEl.style.width = '100%';
        barEl.setAttribute('aria-valuenow', 100);
      }
      if (percentEl) {
        percentEl.textContent = '100%';
      }
      if (textEl) {
        textEl.textContent = '✓ Model downloaded and ready';
      }
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Re-download model';
      }
      // Refresh the status badge (model is now cached)
      renderWebLLMPanel();
    } else {
      const errMsg = response?.error || 'Download failed';
      if (textEl) {
        textEl.textContent = `Error: ${errMsg}`;
      }
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Retry download';
      }
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
