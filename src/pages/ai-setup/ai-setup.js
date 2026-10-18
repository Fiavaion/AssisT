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

import { assess, describeRam } from './system-detector.js';

/** How the scan names each kind of GPU, after the name the browser gives it. */
const GPU_CLASS_LABELS = {
  discrete: ' — separate graphics card',
  apple: ' — Apple chip',
  integrated: ' — built-in graphics',
};
import { recommend, getModeInfo, buildSystemPromptFromProfile } from './recommendation-engine.js';
import {
  attachAccessibleHandler,
  attachAccessibleDelegatedHandler,
} from '../../utils/event-handlers.js';
import {
  filterChatModels,
  pickDefaultChatModel,
  isReasoningModel,
} from '../../utils/ollama-models.js';
import { getCompatibleModels, isCatalogModelInstalled } from './ollama-catalog.js';
import { ollamaPanelState } from './ollama-status.js';
import { ensureOllamaPermission } from '../../utils/ollama-url.js';
import { resolveAiMode } from './setup-mode.js';
import { DESTINATIONS, describeCloudConsent, recordConsent } from '../../utils/consent.js';
import {
  originsFor,
  requestHostPermissions,
  holdsHostPermissions,
} from '../../utils/host-permissions.js';
import { REGISTRY, getHardcodedFallbackModels, resolveModel } from '../../ai/model-registry.js';

// ─── WebLLM Model Data ────────────────────────────────────────────────────────
// Inlined here, as the model list the setup page shows.
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
    'gemma-9b': {
      id: 'gemma-2-9b-it-q4f16_1-MLC',
      name: 'Gemma 2 9B',
      size: '5.4GB',
      vramRequired: '6.5GB',
      description: "Google's Gemma 2 9B — high performance",
      avgSpeed: 'Slower (5–10 tok/s)',
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

const state = {
  step: 0,
  assessment: null,
  recommendation: null,
  // Shown by the Configure screen; only persisted once modeConfirmed is true (see setup-mode.js).
  selectedMode: null,
  modeConfirmed: false,
  profile: { verbosity: 'moderate', readingLevel: 'standard', modality: 'both' },
  testPassed: false,
  taskModels: {}, // per-task WebLLM model overrides
};

/** Record that the student has committed to the mode currently on screen. */
function confirmMode() {
  state.modeConfirmed = true;
}

const STEPS = [
  { id: 'screen-welcome', name: 'Welcome' },
  { id: 'screen-scan', name: 'System Scan' },
  { id: 'screen-recommend', name: 'Recommendation' },
  { id: 'screen-setup', name: 'Configure' },
  { id: 'screen-needs', name: 'Your Needs' },
  { id: 'screen-test', name: 'AI Test' },
  { id: 'screen-done', name: 'Done' },
];
const TOTAL_STEPS = STEPS.length - 1; // Welcome is step 0, not counted

function showScreen(index) {
  state.step = index;

  const fill = document.getElementById('progress-fill');
  const bar = document.getElementById('setup-progress-bar');
  const pct = index === 0 ? 0 : Math.round((index / TOTAL_STEPS) * 100);
  if (fill) {
    fill.style.width = `${pct}%`;
  }
  if (bar) {
    bar.setAttribute('aria-valuenow', index);
  }

  const labelEl = document.getElementById('step-label');
  const nameEl = document.getElementById('step-name');
  if (labelEl) {
    labelEl.textContent = index === 0 ? '' : `Step ${index} of ${TOTAL_STEPS}`;
  }
  if (nameEl) {
    nameEl.textContent = STEPS[index]?.name || '';
  }

  STEPS.forEach((step, i) => {
    const el = document.getElementById(step.id);
    if (el) {
      el.classList.toggle('active', i === index);
    }
  });

  const inits = {
    1: initScan,
    2: initRecommend,
    3: initSetup,
    5: initTest,
    6: initDone,
  };
  if (inits[index]) {
    inits[index]();
  }
}

const nextScreen = () => showScreen(state.step + 1);
const prevScreen = () => showScreen(Math.max(0, state.step - 1));
const skipToEnd = () => {
  // Skipping the wizard means opting out of AI. Anything the student never committed to (the
  // pre-selected recommendation, the initial default) is discarded rather than switched on.
  if (!state.modeConfirmed) {
    state.selectedMode = 'off';
  }
  saveSettings();
  showScreen(STEPS.length - 1);
};

async function initScan() {
  const nextBtn = document.getElementById('btn-scan-next');
  if (nextBtn) {
    nextBtn.disabled = true;
  }

  ['webgpu', 'memory', 'ollama', 'nano'].forEach(id => {
    setScanItem(id, 'Checking…', '<span class="scanning-pulse" aria-hidden="true"></span>');
  });

  try {
    state.assessment = await assess();
    const { webgpu, memory, ollama, nano } = state.assessment;

    setScanItem(
      'webgpu',
      webgpu.supported
        ? `${webgpu.gpuName || 'WebGPU'}${GPU_CLASS_LABELS[webgpu.gpuClass] || ''}`
        : 'Not supported',
      webgpu.supported ? '✅' : '❌'
    );

    setScanItem(
      'memory',
      describeRam(memory.ramGB),
      memory.ramGB >= 4 ? '✅' : memory.ramGB >= 2 ? '⚠️' : '❌'
    );

    if (ollama.available) {
      setScanItem(
        'ollama',
        `Running — ${ollama.models.length} model${ollama.models.length !== 1 ? 's' : ''}`,
        '✅'
      );
    } else if (ollama.needsPermission) {
      // The scan cannot tell whether Ollama is up until it is allowed to look, so it must not
      // claim that it is down.
      setScanItem('ollama', 'Needs your permission to check', '⚠️');
    } else {
      setScanItem('ollama', 'Not running', '➖');
    }

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

/**
 * Removes the mode chooser's delegated handler. Configure → Back → Configure re-runs
 * initRecommend(), which empties the container but not the container itself, so without
 * this the listener stacks and one press confirms the mode once per visit.
 */
let modeChooserCleanup = null;

function initRecommend() {
  if (!state.assessment) {
    return;
  }

  modeChooserCleanup?.();
  modeChooserCleanup = null;

  state.recommendation = recommend(state.assessment);
  state.selectedMode = state.recommendation.recommended;

  const container = document.getElementById('mode-options');
  if (!container) {
    return;
  }
  container.innerHTML = '';

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
  modeChooserCleanup = attachAccessibleDelegatedHandler(
    container,
    '.mode-option',
    'Mode Selection',
    (_e, btn) => {
      container.querySelectorAll('.mode-option').forEach(el => {
        el.classList.remove('selected');
        el.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-checked', 'true');
      state.selectedMode = btn.dataset.mode;
      confirmMode();
    }
  );
}

function initSetup() {
  // The scan can fail before initRecommend() pre-selects anything. Fall back to the cloud panel so
  // Configure is never blank — presentation only, so skipping from here still resolves to 'off'.
  if (!state.selectedMode) {
    state.selectedMode = 'cloud';
  }

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
  renderCloudModelOptions(suggested);
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
  const note = document.getElementById('cloud-consent-note');
  if (note) {
    note.textContent = describeCloudConsent(provider);
  }
  renderCloudModelOptions(provider);
}

function renderCloudModelOptions(provider) {
  const group = document.getElementById('cloud-model-group');
  const select = document.getElementById('cloud-model-select');
  if (!group || !select) {
    return;
  }

  if (provider !== 'google') {
    group.hidden = true;
    return;
  }

  select.innerHTML = getHardcodedFallbackModels('google')
    .map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`)
    .join('');

  // A saved model that has been replaced is shown, and saved, as its replacement.
  const saved = resolveModel('google', state.cloudModel || REGISTRY.google.defaultModel);
  if (select.querySelector(`option[value="${saved}"]`)) {
    select.value = saved;
  }

  group.hidden = false;
}

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
  const permissionStep = document.getElementById('ollama-permission-step');
  const ollama = state.assessment?.ollama;

  // A missing host permission is its own state. It is not "Ollama is not running", and the two
  // need opposite actions from the student: one press of Allow here, versus going away to
  // install and start a server that may well already be running.
  if (ollamaPanelState(ollama) === 'needs-permission') {
    if (statusEl) {
      statusEl.innerHTML =
        '<span class="status-badge warning">⚠️ AssisT needs permission to reach Ollama</span>';
    }
    if (modelsSection) {
      modelsSection.hidden = true;
    }
    if (installSteps) {
      installSteps.hidden = true;
    }
    if (permissionStep) {
      permissionStep.hidden = false;
    }
    renderOllamaModelCatalog([], false);
    return;
  }

  if (permissionStep) {
    permissionStep.hidden = true;
  }

  if (ollamaPanelState(ollama) === 'ready') {
    if (statusEl) {
      statusEl.innerHTML = `<span class="status-badge success">✅ Ollama is running — ${ollama.models.length} model${ollama.models.length > 1 ? 's' : ''} installed</span>`;
    }
    if (modelsSection) {
      modelsSection.hidden = false;
      const select = document.getElementById('ollama-model-select');
      if (select) {
        // Embeddings-only models (e.g. nomic-embed-text) can't generate text —
        // exclude them so "Test Your AI" can't pick one and hit a 400.
        const chatModels = filterChatModels(ollama.models);
        if (chatModels.length > 0) {
          const defaultModel = pickDefaultChatModel(ollama.models);
          select.innerHTML = chatModels
            .map(
              m =>
                `<option value="${escapeHtml(m)}"${m === defaultModel ? ' selected' : ''}>${escapeHtml(m)}</option>`
            )
            .join('');
        } else {
          select.innerHTML =
            '<option value="">No text-generation model installed — download one below</option>';
        }
      }
    }
    if (installSteps) {
      installSteps.hidden = true;
    }
    renderOllamaTaskModels(ollama.models);
    renderOllamaModelCatalog(ollama.models, true);
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
    renderOllamaModelCatalog([], false);
  }
}

/**
 * Render hardware-aware Ollama model download catalog.
 * @param {string[]} installedModels  Models already installed in Ollama.
 * @param {boolean}  hasOllama        True when Ollama is running.
 */
function renderOllamaModelCatalog(installedModels, hasOllama) {
  const container = document.getElementById('ollama-suggested-models');
  if (!container) {
    return;
  }
  container.hidden = false;

  const ramGB = state.assessment?.memory?.ramGB || navigator.deviceMemory || 4;
  const compatible = getCompatibleModels(ramGB, {
    graphicsMemoryGB: state.assessment?.graphicsMemoryGB ?? null,
    installed: installedModels,
  });

  const heading = hasOllama ? 'Get more models' : 'Download a model to get started';
  const subtext = hasOllama
    ? `Add models to your Ollama library. Showing models that fit your system (${describeRam(ramGB)}).`
    : `Once Ollama is running, download a model. Showing models that fit your system (${describeRam(ramGB)}).`;

  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'ollama-catalog-header';
  header.innerHTML = `
    <p class="helper-text"><strong>${escapeHtml(heading)}</strong> — ${escapeHtml(subtext)}</p>`;
  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'ollama-catalog';
  container.appendChild(list);

  compatible.forEach(model => {
    const isInstalled = isCatalogModelInstalled(model, installedModels);

    const card = document.createElement('div');
    card.className = `ollama-model-card${isInstalled ? ' installed' : ''}`;

    card.innerHTML = `
      <div class="ollama-model-header">
        <span class="ollama-model-name">${escapeHtml(model.label)}</span>
        <span class="ollama-model-badge badge-${escapeHtml(model.category)}">${escapeHtml(model.categoryLabel)}</span>
      </div>
      <p class="ollama-model-desc">${escapeHtml(model.description)}</p>
      <div class="ollama-model-footer">
        <span class="ollama-model-meta">${escapeHtml(model.size)} download</span>
        <span class="ollama-model-action"></span>
      </div>
      <div class="ollama-model-progress" hidden>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="progress-bar-fill" style="width:0%"></div>
        </div>
        <p class="progress-text">Starting download…</p>
      </div>`;

    const actionEl = card.querySelector('.ollama-model-action');
    if (isInstalled) {
      actionEl.innerHTML = '<span class="ollama-installed-label">✓ Installed</span>';
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ollama-download-btn';
      btn.setAttribute('aria-label', `Download ${model.label}`);
      btn.textContent = 'Download';
      if (!hasOllama) {
        btn.disabled = true;
        btn.title = 'Start Ollama first';
      }
      attachAccessibleHandler(btn, `Download ${model.label}`, () => {
        downloadOllamaModel(model.name, card);
      });
      actionEl.appendChild(btn);
    }

    list.appendChild(card);
  });
}

/**
 * Trigger an Ollama model pull and update the card with live progress.
 * @param {string}      modelName  Ollama model tag, e.g. 'qwen3.5:9b'.
 * @param {HTMLElement} cardEl     The .ollama-model-card element.
 */
function downloadOllamaModel(modelName, cardEl) {
  const btn = cardEl.querySelector('.ollama-download-btn');
  const progressEl = cardEl.querySelector('.ollama-model-progress');
  const trackEl = cardEl.querySelector('.progress-track');
  const barEl = cardEl.querySelector('.progress-bar-fill');
  const textEl = cardEl.querySelector('.progress-text');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Downloading…';
  }
  if (progressEl) {
    progressEl.hidden = false;
  }

  const progressListener = msg => {
    if (msg.type !== 'LLM_INSTALL_PROGRESS' || msg.modelName !== modelName) {
      return;
    }
    const p = msg.progress || {};
    const pct = p.percent || 0;
    if (barEl) {
      barEl.style.width = `${pct}%`;
    }
    if (trackEl) {
      trackEl.setAttribute('aria-valuenow', pct);
    }
    if (textEl) {
      textEl.textContent = p.status ? `${p.status} — ${pct}%` : `Downloading… ${pct}%`;
    }
  };

  chrome.runtime.onMessage.addListener(progressListener);

  chrome.runtime.sendMessage({ action: 'LOCAL_LLM_INSTALL_MODEL', modelName }, response => {
    chrome.runtime.onMessage.removeListener(progressListener);

    if (response?.success) {
      if (barEl) {
        barEl.style.width = '100%';
      }
      if (trackEl) {
        trackEl.setAttribute('aria-valuenow', 100);
      }
      if (textEl) {
        textEl.textContent = '✓ Model downloaded successfully';
      }
      cardEl.classList.add('installed');
      const actionEl = cardEl.querySelector('.ollama-model-action');
      if (actionEl) {
        actionEl.innerHTML = '<span class="ollama-installed-label">✓ Installed</span>';
      }
      // Refresh the Ollama panel model selector
      recheckOllama();
    } else {
      const err = response?.error || 'Download failed';
      if (textEl) {
        textEl.textContent = `Error: ${err}`;
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Retry';
      }
    }
  });
}

function renderOllamaTaskModels(installedModels) {
  const container = document.getElementById('ollama-task-models');
  if (!container) {
    return;
  }
  container.hidden = false;

  const chatModels = filterChatModels(installedModels);
  const defaultModel = pickDefaultChatModel(installedModels);
  const opts = chatModels
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

  const stored = await new Promise(resolve =>
    chrome.storage.local.get(['webllmModel', 'webllmTaskModels'], r => resolve(r))
  );
  const savedModel = stored.webllmModel || WEBLLM_REGISTRY.defaultModel;
  if (stored.webllmTaskModels) {
    Object.assign(state.taskModels, stored.webllmTaskModels);
  }

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

  if (mode === 'off') {
    return Promise.resolve({
      success: true,
      text: 'AI is disabled. All accessibility features (TTS, STT, highlighting) remain fully available.',
    });
  }

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

    // Reasoning models think before answering, and both the time they take and the room they need
    // follow from that rather than from their size, so the same fact sets the timeout and the token
    // budget below.
    const reasoning = isReasoningModel(modelKey);

    const timeoutMs = (() => {
      // How long the model is likely to take is two separate questions, so answer both and take
      // whichever is longer.
      //
      // Size sets a floor: bigger weights mean slower first tokens, especially on a cold load.
      const bySize = (() => {
        if (/:(34b|70b|72b|110b)|[_:-](f16|fp16|16bit)/.test(modelKey)) {
          return 180_000;
        }
        if (/:(13b|14b|16b|20b|30b|32b|33b)|[_:-]q8/.test(modelKey)) {
          return 120_000;
        }
        if (/:(7b|8b|9b|10b|11b|12b)/.test(modelKey)) {
          return 60_000;
        }
        return 30_000;
      })();

      // Reasoning sets its own floor, independent of size: latency is governed by how much the
      // model chooses to reason rather than by parameter count, so a 4b reasoning model routinely
      // takes longer than a 9b ordinary one. Judging them on size alone failed the setup test
      // against a model that was answering perfectly well, which reads to a student as "the AI is
      // broken".
      return reasoning ? Math.max(bySize, 120_000) : bySize;
    })();

    const timeoutSec = Math.round(timeoutMs / 1000);
    const timer = setTimeout(() => {
      resolve({
        success: false,
        error: `Timed out after ${timeoutSec} seconds. Large models may need more time on first load — try again.`,
      });
    }, timeoutMs);

    // The worker widens this for a reasoning model, which needs room to narrate before it answers.
    const testOptions = { feature: 'summarization', maxTokens: 150 };
    if (mode === 'cloud' && state.cloudModel) {
      testOptions.model = state.cloudModel;
    } else if (mode === 'local' && modelKey) {
      // Test the model the student actually chose. Without this the request falls back to the
      // worker's tier default, so the timeout was calculated for one model while another answered,
      // and picking a different model in the dropdown changed nothing about what was tested.
      testOptions.model = ollamaModelEl.value;
    }
    chrome.runtime.sendMessage({ action, prompt: TEST_PROMPT, options: testOptions }, response => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else if (response?.text || response?.content || response?.data) {
        resolve({ success: true, text: response.text || response.content || response.data });
      } else {
        resolve({ success: false, error: response?.error || 'Empty response from AI' });
      }
    });
  });
}

function initDone() {
  saveSettings();

  const badge = document.getElementById('done-mode-badge');
  if (badge && state.selectedMode) {
    const info = getModeInfo(state.selectedMode);
    badge.textContent = `${info.icon} ${info.title}`;
  }
}

async function saveSettings() {
  const settings = {
    aiMode: resolveAiMode(state),
    userProfile: state.profile,
    systemPromptPrefix: buildSystemPromptFromProfile(state.profile),
    aiSetupComplete: true,
    onboardingComplete: true,
  };

  if (state.selectedMode === 'cloud') {
    const providerEl = document.getElementById('cloud-provider-select');
    const keyEl = document.getElementById('api-key-input');
    if (providerEl) {
      settings.aiProvider = providerEl.value;
      settings.cloudProvider = providerEl.value; // cloud-router.js reads this key
    }
    const modelEl = document.getElementById('cloud-model-select');
    if (modelEl?.value) {
      settings.cloudModel = modelEl.value;
      state.cloudModel = modelEl.value;
    }
    // A key is stored only once Chrome holds the provider's host permission, which the Verify and
    // Continue clicks ask for (requestCloudHostAccess): a key the extension may not use is not kept.
    if (keyEl?.value?.trim() && (await holdsHostPermissions([settings.aiProvider]))) {
      // Save via service worker so it uses encrypted storage (secure_apikey_{provider})
      // ai-setup is a web_accessible_resource and cannot import secure-key-storage directly
      // MUST await the response — key must be written before runAITest() reads it
      const saved = await new Promise(resolve => {
        chrome.runtime.sendMessage(
          { action: 'SAVE_API_KEY', provider: settings.aiProvider, apiKey: keyEl.value.trim() },
          resolve
        );
      });
      // Saving the key, beside the wording that names the provider, is the student's yes to it
      // (ADR 0006); the cloud router sends nothing to a provider without one.
      if (saved?.success) {
        await recordConsent(settings.aiProvider, true);
      }
    }
  }

  if (state.selectedMode === 'webllm') {
    const modelEl = document.getElementById('webllm-model-select');
    if (modelEl) {
      settings.webllmModel = modelEl.value;
    }
    if (Object.keys(state.taskModels).length > 0) {
      settings.webllmTaskModels = { ...state.taskModels };
    }
  }

  if (state.selectedMode === 'local') {
    const modelEl = document.getElementById('ollama-model-select');
    if (modelEl) {
      settings.ollamaModel = modelEl.value;
    }
  }

  await chrome.storage.local.set(settings);
  console.log('[AISetup] Settings saved:', settings.aiMode);
}

/**
 * Ask Chrome for the chosen cloud provider's host (ADR 0006: Anthropic, OpenAI and Perplexity;
 * ADR 0007: Google Gemini). Must be called straight from the click, before anything is awaited:
 * Chrome prompts only inside the gesture.
 * @returns {Promise<boolean>} true when the host is held afterwards, or none was needed
 */
function requestCloudHostAccess() {
  const provider = document.getElementById('cloud-provider-select')?.value || 'anthropic';
  return requestHostPermissions(originsFor([provider]));
}

/** What the student is told when Chrome was refused the provider's host. */
function hostRefusedMessage(action) {
  const provider = document.getElementById('cloud-provider-select')?.value || 'anthropic';
  const service = DESTINATIONS[provider]?.service || provider;
  return `Chrome did not give AssisT access to ${service}, so the key was not saved. Press ${action} again and choose Allow.`;
}

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
    requestCloudHostAccess().then(granted => {
      if (!granted) {
        setStatus(statusEl, 'error', hostRefusedMessage('Verify'));
        return;
      }
      setStatus(statusEl, 'success', '✅ Format looks correct — key saved');
      confirmMode(); // Entering a working key is a commitment to this mode
      saveSettings(); // Persist optimistically
    });
  }
}

function setStatus(el, type, message) {
  if (el) {
    el.innerHTML = `<span class="status-badge ${escapeHtml(type)}">${escapeHtml(message)}</span>`;
  }
}

async function recheckOllama() {
  const statusEl = document.getElementById('ollama-status-display');
  if (statusEl) {
    statusEl.innerHTML = '<span class="status-badge checking">⏳ Checking…</span>';
  }

  const permissionResult = document.getElementById('ollama-permission-result');

  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'SYSTEM_ASSESS_OLLAMA' }, response => {
      if (state.assessment) {
        // Record the whole answer, the permission flag included — recording only the happy
        // case left a stale "not detected" on screen after a student granted access.
        state.assessment.ollama = {
          available: response?.available === true,
          models: response?.models || [],
          needsPermission: response?.needsPermission === true,
        };
      }
      if (permissionResult && response?.available === true) {
        permissionResult.textContent = '';
      }
      renderOllamaPanel();
      resolve();
    });
  });
}

/**
 * Ask Chrome for the Ollama host permission, then look again.
 *
 * Chrome only shows the prompt inside a user gesture, so this runs straight from the button's
 * handler. A refusal is a normal answer, not an error: say what it means and leave the button
 * there to try again.
 *
 * @returns {Promise<void>}
 */
async function requestOllamaAccess() {
  const resultEl = document.getElementById('ollama-permission-result');
  const granted = await ensureOllamaPermission();

  if (!granted) {
    if (resultEl) {
      resultEl.textContent =
        'Permission was not given, so AssisT still cannot reach Ollama. You can press Allow again, or pick a different AI option.';
    }
    return;
  }

  if (resultEl) {
    resultEl.textContent = 'Permission granted. Checking Ollama…';
  }
  await recheckOllama();
}

function initiateModelDownload() {
  const modelEl = document.getElementById('webllm-model-select');
  const progressEl = document.getElementById('download-progress');
  const textEl = document.getElementById('download-status-text');
  const barEl = document.getElementById('download-bar');
  const percentEl = document.getElementById('download-percent');
  const downloadBtn = document.getElementById('btn-download-model');
  const modelKey = modelEl?.value || 'llama-3.2-1b';

  saveSettings();

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

  // Guard against double-handling (broadcast may arrive before SW sendResponse)
  let downloadHandled = false;

  const onSuccess = () => {
    if (downloadHandled) {
      return;
    }
    downloadHandled = true;
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
    // Persist the chosen mode and model immediately so the user doesn't have to
    // manually activate WebLLM in the popup after returning from the wizard.
    state.selectedMode = 'webllm';
    confirmMode();
    chrome.storage.local.set({ aiMode: 'webllm', webllmModel: modelKey });
    renderWebLLMPanel();
  };

  const onError = errMsg => {
    if (downloadHandled) {
      return;
    }
    downloadHandled = true;
    if (textEl) {
      textEl.textContent = `Error: ${errMsg}`;
    }
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Retry download';
    }
  };

  // Single listener handles both live progress and the completion broadcast.
  // The completion broadcast (WEBLLM_DOWNLOAD_COMPLETE) is sent directly by the
  // offscreen document, so it arrives even when the service worker has been killed.
  const progressListener = msg => {
    if (!msg || msg.source !== 'webllm-offscreen') {
      return;
    }

    if (msg.action === 'WEBLLM_PROGRESS' && msg.modelKey === modelKey) {
      if (downloadHandled) {
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
    } else if (msg.action === 'WEBLLM_DOWNLOAD_COMPLETE' && msg.modelKey === modelKey) {
      chrome.runtime.onMessage.removeListener(progressListener);
      if (msg.success) {
        onSuccess();
      } else {
        onError(msg.error || 'Download failed');
      }
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  // Also listen via the service-worker sendResponse path (fast path when SW is alive).
  // If the SW was killed before responding, response will be undefined — in that case
  // we rely on the WEBLLM_DOWNLOAD_COMPLETE broadcast above.
  chrome.runtime.sendMessage({ action: 'WEBLLM_INITIALIZE', modelKey }, response => {
    if (downloadHandled) {
      // Already handled by the WEBLLM_DOWNLOAD_COMPLETE broadcast
      chrome.runtime.onMessage.removeListener(progressListener);
      return;
    }
    if (response?.success) {
      chrome.runtime.onMessage.removeListener(progressListener);
      onSuccess();
    } else if (response) {
      chrome.runtime.onMessage.removeListener(progressListener);
      onError(response.error || 'Download failed');
    }
    // If response is undefined the service worker was killed — keep progressListener
    // active so it can still receive the WEBLLM_DOWNLOAD_COMPLETE broadcast.
  });
}

async function clearWebLLMCache() {
  const btn = $('btn-clear-webllm-cache');
  const statusEl = $('clear-cache-status');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Removing…';
  }
  if (statusEl) {
    statusEl.textContent = '';
  }
  try {
    const response = await new Promise(resolve =>
      chrome.runtime.sendMessage({ action: 'WEBLLM_CLEAR_CACHE' }, resolve)
    );
    if (response?.success) {
      if (statusEl) {
        statusEl.textContent = '✓ All downloaded models removed.';
        statusEl.style.color = 'var(--color-success, #16a34a)';
      }
      if (btn) {
        btn.textContent = '🗑 Remove all downloaded models';
        btn.disabled = false;
      }
      // Refresh the panel so the model list shows as clean
      renderWebLLMPanel();
    } else {
      throw new Error(response?.error || 'Clear failed');
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.style.color = 'var(--color-danger, #dc2626)';
    }
    if (btn) {
      btn.textContent = '🗑 Remove all downloaded models';
      btn.disabled = false;
    }
  }
}

function wireButtons() {
  attachAccessibleHandler($('btn-welcome-start'), 'Start Scan', () => showScreen(1));
  attachAccessibleHandler($('btn-welcome-skip'), 'Skip Setup', skipToEnd);

  attachAccessibleHandler($('btn-scan-next'), 'Scan Continue', nextScreen);
  attachAccessibleHandler($('btn-scan-skip'), 'Scan Skip', skipToEnd);

  attachAccessibleHandler($('btn-recommend-back'), 'Rec Back', prevScreen);
  attachAccessibleHandler($('btn-recommend-next'), 'Use This Mode', nextScreen);
  attachAccessibleHandler($('btn-recommend-skip'), 'Rec Skip', skipToEnd);

  attachAccessibleHandler($('btn-setup-back'), 'Setup Back', prevScreen);
  attachAccessibleHandler($('btn-setup-next'), 'Setup Continue', () => {
    // Continuing past Configure commits to the mode on screen, so a later "Skip" on the
    // optional Needs/Test steps keeps it rather than switching AI off.
    confirmMode();
    const keyEntered = !!document.getElementById('api-key-input')?.value?.trim();
    if (state.selectedMode !== 'cloud' || !keyEntered) {
      nextScreen();
      return;
    }
    requestCloudHostAccess().then(granted => {
      if (granted) {
        nextScreen();
        return;
      }
      setStatus(document.getElementById('api-key-status'), 'error', hostRefusedMessage('Continue'));
    });
  });
  attachAccessibleHandler($('btn-setup-skip'), 'Setup Skip', skipToEnd);

  attachAccessibleHandler($('btn-toggle-key'), 'Toggle Key Visibility', toggleKeyVisibility);
  attachAccessibleHandler($('btn-verify-key'), 'Verify API Key', verifyApiKey);
  const providerSelect = $('cloud-provider-select');
  if (providerSelect) {
    providerSelect.addEventListener('change', () => updateApiKeyLink(providerSelect.value));
  }

  attachAccessibleHandler($('btn-download-model'), 'Download Model', initiateModelDownload);
  attachAccessibleHandler(
    $('btn-clear-webllm-cache'),
    'Remove Downloaded Models',
    clearWebLLMCache
  );

  attachAccessibleHandler($('btn-recheck-ollama'), 'Recheck Ollama', recheckOllama);
  attachAccessibleHandler($('btn-allow-ollama'), 'Allow AssisT to use Ollama', requestOllamaAccess);

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

  attachAccessibleHandler($('btn-test-back'), 'Test Back', prevScreen);
  attachAccessibleHandler($('btn-test-next'), 'Test Continue', nextScreen);
  attachAccessibleHandler($('btn-test-skip'), 'Test Skip', skipToEnd);
  attachAccessibleHandler($('btn-rerun-test'), 'Rerun Test', initTest);

  attachAccessibleHandler($('btn-done-open'), 'Open AssisT', () => {
    // When launched as an onboarding step (?onboarding=1), return to the welcome
    // front door so the orchestrator can mark this track done and continue.
    const params = new URLSearchParams(window.location.search);
    if (params.get('onboarding') === '1' && chrome?.runtime?.getURL) {
      window.location.href =
        chrome.runtime.getURL('src/pages/welcome/welcome.html') + '?resume=1&done=ai-setup';
      return;
    }
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

/** Shorthand for document.getElementById */
const $ = id => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function init() {
  const stored = await new Promise(resolve => {
    chrome.storage.local.get(['aiMode', 'userProfile'], resolve);
  });
  if (stored.aiMode) {
    // A stored mode is a choice already made on a previous run — re-running the wizard and
    // skipping it should leave that choice alone rather than silently switching AI off.
    state.selectedMode = stored.aiMode;
    confirmMode();
  }
  if (stored.userProfile) {
    Object.assign(state.profile, stored.userProfile);
  }

  wireButtons();
  showScreen(0);
}

document.addEventListener('DOMContentLoaded', init);
