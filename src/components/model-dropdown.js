/**
 * Model Dropdown Component for AssisT Cloud AI Mode
 *
 * Provides a reusable dropdown component for selecting AI models
 * in feature panels. Supports local (Ollama) and cloud (Claude 4.5) models.
 *
 * @module components/model-dropdown
 */

import { sanitizeHTML } from '../utils/sanitize.js';

// Cloud model configurations (internal keys for feature defaults)
const CLOUD_MODELS = {
  local: {
    id: 'local',
    name: 'Local (Ollama)',
    shortName: 'Local',
    description: 'Offline processing',
    isLocal: true,
  },
  'haiku-4.5': {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku 4.5',
    shortName: 'Haiku',
    description: 'Fast',
  },
  'sonnet-4.6': {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    shortName: 'Sonnet',
    description: 'Balanced',
  },
  'opus-4.6': {
    id: 'claude-opus-4-6',
    name: 'Opus 4.6',
    shortName: 'Opus',
    description: 'Best',
  },
};

// Feature default models
const FEATURE_DEFAULTS = {
  summarization: 'haiku-4.5',
  textSimplification: 'sonnet-4.6',
  assignmentBreakdown: 'sonnet-4.6',
  citationAnalyzer: 'sonnet-4.6',
  socraticTutor: 'opus-4.6',
  imageUnderstanding: 'sonnet-4.6',
  studyPathGenerator: 'sonnet-4.6',
  multiDocCompare: 'opus-4.6',
};

/**
 * Check if cloud mode is enabled
 * @returns {Promise<boolean>}
 */
async function isCloudModeEnabled() {
  try {
    const result = await chrome.storage.local.get(['cloudModeEnabled']);
    return result.cloudModeEnabled === true;
  } catch (error) {
    console.warn('[ModelDropdown] Failed to check cloud mode:', error);
    return false;
  }
}

/**
 * Get the default model for a feature
 * @param {string} featureName - Feature name
 * @returns {string} Model key
 */
function getDefaultModel(featureName) {
  return FEATURE_DEFAULTS[featureName] || 'sonnet-4.6';
}

/**
 * Create a model dropdown element
 *
 * @param {string} featureName - The feature name (e.g., 'summarization')
 * @param {Object} options - Configuration options
 * @param {function} options.onChange - Callback when model changes
 * @param {boolean} options.compact - Use compact styling
 * @returns {Object} { container, select, getSelectedModel, setModel }
 */
function createModelDropdown(featureName, options = {}) {
  const defaultModel = getDefaultModel(featureName);

  // Create container
  const container = document.createElement('div');
  container.className = 'assist-model-selector';
  if (options.compact) {
    container.classList.add('compact');
  }

  // Create label and select
  container.innerHTML = sanitizeHTML(`
    <label class="assist-model-label">
      <span class="assist-model-icon" title="AI Model">🤖</span>
      <select class="assist-model-select" aria-label="Select AI model for ${featureName}">
        <option value="local">Local</option>
        <option value="haiku-4.5">Haiku 4.5</option>
        <option value="sonnet-4.6">Sonnet 4.6</option>
        <option value="opus-4.6">Opus 4.6</option>
      </select>
    </label>
  `);

  const select = container.querySelector('select');
  select.value = defaultModel;

  // Add change handler
  if (options.onChange) {
    select.addEventListener('change', e => {
      options.onChange(e.target.value, CLOUD_MODELS[e.target.value]);
    });
  }

  return {
    container,
    select,
    getSelectedModel: () => select.value,
    setModel: modelKey => {
      if (CLOUD_MODELS[modelKey]) {
        select.value = modelKey;
      }
    },
    getModelConfig: () => CLOUD_MODELS[select.value] || CLOUD_MODELS['local'],
    isCloudModel: () => select.value !== 'local',
  };
}

/**
 * Inject model dropdown styles into the document
 * Call this once when feature initializes
 */
function injectModelDropdownStyles() {
  if (document.getElementById('assist-model-dropdown-styles')) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'assist-model-dropdown-styles';
  style.textContent = `
    .assist-model-selector {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      font-size: 12px;
    }

    .assist-model-selector.compact {
      padding: 2px 6px;
    }

    .assist-model-selector.compact .assist-model-select {
      padding: 2px 4px;
      font-size: 11px;
    }

    .assist-model-label {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      margin: 0;
    }

    .assist-model-icon {
      font-size: 14px;
      line-height: 1;
    }

    .assist-model-select {
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      background: white;
      cursor: pointer;
      min-width: 100px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .assist-model-select:hover {
      border-color: #bbb;
    }

    .assist-model-select:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    .assist-model-select option {
      padding: 4px 8px;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .assist-model-selector {
        background: rgba(255, 255, 255, 0.1);
      }

      .assist-model-select {
        background: #2a2a2a;
        color: #e0e0e0;
        border-color: #444;
      }

      .assist-model-select:hover {
        border-color: #666;
      }

      .assist-model-select:focus {
        border-color: #64b5f6;
        box-shadow: 0 0 0 2px rgba(100, 181, 246, 0.3);
      }
    }

    /* Status indicator for cloud models */
    .assist-model-selector[data-cloud="true"]::after {
      content: "☁️";
      font-size: 10px;
      margin-left: 2px;
    }

    .assist-model-selector[data-cloud="false"]::after {
      content: "💻";
      font-size: 10px;
      margin-left: 2px;
    }

    /* Hidden state when cloud mode is disabled */
    .assist-model-selector.hidden {
      display: none !important;
    }
  `;

  document.head.appendChild(style);
}

/**
 * Helper to generate AI request with model routing
 *
 * @param {string} prompt - The prompt to send
 * @param {string} modelKey - Model key from dropdown (e.g., 'sonnet-4.5' or 'local')
 * @param {Object} options - Additional options
 * @param {string} options.feature - Feature name for usage tracking
 * @param {number} options.maxTokens - Max tokens to generate
 * @param {number} options.temperature - Temperature for generation
 * @returns {Promise<{success: boolean, data: string, usage?: Object, error?: string}>}
 */
async function generateWithModel(prompt, modelKey, options = {}) {
  const isCloud = modelKey !== 'local';

  if (isCloud) {
    // Cloud generation via Claude API
    const response = await chrome.runtime.sendMessage({
      action: 'CLOUD_LLM_GENERATE',
      prompt,
      options: {
        model: modelKey,
        feature: options.feature,
        maxTokens: options.maxTokens || 1024,
        temperature: options.temperature || 0.7,
      },
    });

    return response;
  } else {
    // Local generation via Ollama
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_GENERATE',
      prompt,
      options: {
        maxTokens: options.maxTokens || 500,
        temperature: options.temperature || 0.7,
      },
    });

    return response;
  }
}

// Export functions for use in feature modules
export {
  createModelDropdown,
  injectModelDropdownStyles,
  isCloudModeEnabled,
  getDefaultModel,
  generateWithModel,
  CLOUD_MODELS,
  FEATURE_DEFAULTS,
};

export default {
  createModelDropdown,
  injectModelDropdownStyles,
  isCloudModeEnabled,
  getDefaultModel,
  generateWithModel,
  CLOUD_MODELS,
  FEATURE_DEFAULTS,
};
