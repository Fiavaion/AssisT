/**
 * AssisT Content Script
 * Runs in Isolated World on Canvas VLE pages
 * Handles DOM manipulation, TTS/STT injection, and accessibility adaptations
 *
 * CRITICAL: Operates in isolated execution environment to prevent conflicts
 * with Canvas VLE JavaScript
 */

import { DOMAdapter } from '../adapters/dom-adapter.js';
import { TTSController } from '../engines/tts/tts-controller.js';
import { STTController } from '../engines/stt/stt-controller.js';
import { WAIAdaptManager } from '../adapters/wai-adapt-manager.js';
import { StorageManager } from '../utils/storage-manager.js';

class AssistContentManager {
  constructor() {
    this.isInitialized = false;
    this.domAdapter = null;
    this.ttsController = null;
    this.sttController = null;
    this.waiAdaptManager = null;
    this.settings = null;
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log('[AssisT Content] Initializing on Canvas VLE...');

    try {
      // Load user settings
      this.settings = await StorageManager.getSettings();

      // Initialize core adapters
      this.domAdapter = new DOMAdapter();
      this.waiAdaptManager = new WAIAdaptManager(this.domAdapter);

      // Initialize TTS if enabled
      if (this.settings.tts.enabled) {
        this.ttsController = new TTSController(this.domAdapter, this.settings.tts);
        await this.ttsController.initialize();
      }

      // Initialize STT if enabled
      if (this.settings.stt.enabled) {
        this.sttController = new STTController(this.domAdapter, this.settings.stt);
        await this.sttController.initialize();
      }

      // Apply WAI-Adapt customizations
      await this.applyWAIAdaptations();

      // Inject AssisT UI overlay
      this.injectAssistUI();

      // Set up message listeners
      this.setupMessageHandlers();

      // Set up mutation observer for dynamic content
      this.observeCanvasDOM();

      this.isInitialized = true;
      console.log('[AssisT Content] Initialization complete');

    } catch (error) {
      console.error('[AssisT Content] Initialization failed:', error);
    }
  }

  async applyWAIAdaptations() {
    const { textSpacing, focusMode, numericSimplification } = this.settings.waiAdapt;

    if (textSpacing.enabled) {
      this.waiAdaptManager.applyTextSpacing(textSpacing);
    }

    if (focusMode.enabled) {
      this.waiAdaptManager.enableFocusMode();
    }

    if (numericSimplification.enabled) {
      this.waiAdaptManager.simplifyNumericInfo();
    }
  }

  injectAssistUI() {
    // Create floating control panel
    const panel = document.createElement('div');
    panel.id = 'assist-control-panel';
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', 'AssisT Accessibility Controls');

    panel.innerHTML = `
      <div class="assist-panel-header">
        <h2>AssisT Controls</h2>
        <button id="assist-panel-close" aria-label="Close AssisT Panel">×</button>
      </div>
      <div class="assist-panel-content">
        <button id="assist-tts-toggle" aria-pressed="${this.settings.tts.enabled}">
          Text-to-Speech
        </button>
        <button id="assist-stt-toggle" aria-pressed="${this.settings.stt.enabled}">
          Speech-to-Text
        </button>
        <button id="assist-focus-toggle" aria-pressed="${this.settings.waiAdapt.focusMode.enabled}">
          Focus Mode
        </button>
      </div>
    `;

    document.body.appendChild(panel);

    // Attach event listeners
    this.attachPanelListeners(panel);
  }

  attachPanelListeners(panel) {
    panel.querySelector('#assist-tts-toggle')?.addEventListener('click', () => {
      this.toggleTTS();
    });

    panel.querySelector('#assist-stt-toggle')?.addEventListener('click', () => {
      this.toggleSTT();
    });

    panel.querySelector('#assist-focus-toggle')?.addEventListener('click', () => {
      this.toggleFocusMode();
    });

    panel.querySelector('#assist-panel-close')?.addEventListener('click', () => {
      panel.classList.toggle('assist-panel-hidden');
    });
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'TOGGLE_ASSIST_PANEL':
          this.togglePanel();
          sendResponse({ success: true });
          break;

        case 'UPDATE_SETTINGS':
          this.updateSettings(message.settings);
          sendResponse({ success: true });
          break;

        case 'GET_PAGE_CONTEXT':
          sendResponse({ success: true, context: this.getPageContext() });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }

      return true;
    });
  }

  observeCanvasDOM() {
    const observer = new MutationObserver(mutations => {
      // Re-apply adaptations to dynamically loaded content
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          this.waiAdaptManager.processNewNodes(mutation.addedNodes);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  toggleTTS() {
    if (this.ttsController) {
      this.ttsController.toggle();
    }
  }

  toggleSTT() {
    if (this.sttController) {
      this.sttController.toggle();
    }
  }

  toggleFocusMode() {
    this.waiAdaptManager.toggleFocusMode();
  }

  togglePanel() {
    const panel = document.getElementById('assist-control-panel');
    if (panel) {
      panel.classList.toggle('assist-panel-hidden');
    }
  }

  getPageContext() {
    return {
      url: window.location.href,
      contentType: this.domAdapter.detectContentType(),
      courseId: this.domAdapter.extractCourseId(),
      hasTextContent: this.domAdapter.hasTextContent()
    };
  }

  async updateSettings(newSettings) {
    this.settings = newSettings;
    await this.applyWAIAdaptations();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const assistManager = new AssistContentManager();
    assistManager.initialize();
  });
} else {
  const assistManager = new AssistContentManager();
  assistManager.initialize();
}

console.log('[AssisT Content] Script loaded in Isolated World');
