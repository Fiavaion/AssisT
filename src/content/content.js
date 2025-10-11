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

      // Set up keyboard shortcuts
      this.setupKeyboardShortcuts();

      // Set up click-to-read functionality
      this.setupClickToRead();

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
      console.log('[AssisT Content] Received message:', message.type);

      switch (message.type) {
        case 'TTS_COMMAND':
          this.handleTTSCommand(message.data);
          sendResponse({ success: true });
          break;

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

  async handleTTSCommand(data) {
    const { command } = data;
    console.log('[AssisT Content] Handling TTS command:', command);

    // Initialize TTS if not already done
    if (!this.ttsController && this.settings.tts.enabled) {
      this.ttsController = new TTSController(this.domAdapter, this.settings.tts);
      await this.ttsController.initialize();
    }

    if (!this.ttsController) {
      console.warn('[AssisT Content] TTS Controller not available');
      return;
    }

    switch (command) {
      case 'readPage':
        await this.ttsController.readPageContent();
        break;
      case 'pause':
        this.ttsController.pause();
        break;
      case 'resume':
        this.ttsController.resume();
        break;
      case 'stop':
        this.ttsController.stop();
        break;
      case 'enable':
        this.ttsController.enable();
        break;
      case 'disable':
        this.ttsController.disable();
        break;
      case 'setVoice':
        this.ttsController.setVoice(data.voice);
        break;
      case 'setRate':
        this.ttsController.setRate(data.rate);
        break;
      case 'setPitch':
        this.ttsController.setPitch(data.pitch);
        break;
      case 'setVolume':
        this.ttsController.setVolume(data.volume);
        break;
      case 'setHighlighting':
        this.ttsController.settings.highlightEnabled = data.enabled;
        break;
      case 'setHighlightColor':
        this.ttsController.settings.highlightColor = data.color;
        break;
      case 'setHighlightOpacity':
        this.ttsController.settings.highlightOpacity = data.opacity;
        break;
      case 'readParagraph':
        await this.ttsController.readText(data.text);
        break;
      default:
        console.warn('[AssisT Content] Unknown TTS command:', command);
    }
  }

  setupKeyboardShortcuts() {
    console.log('[AssisT Content] Setting up keyboard shortcuts');

    document.addEventListener('keydown', async (e) => {
      // Ignore if user is typing in an input field
      if (e.target.matches('input, textarea, [contenteditable="true"]')) {
        return;
      }

      // Spacebar: Pause/Resume TTS
      if (e.code === 'Space' && this.ttsController) {
        e.preventDefault();
        if (this.ttsController.isPlaying) {
          this.ttsController.pause();
          console.log('[AssisT Content] Paused via spacebar');
        } else if (this.ttsController.isPaused) {
          this.ttsController.resume();
          console.log('[AssisT Content] Resumed via spacebar');
        }
      }

      // Plus/Equals: Increase speed
      if ((e.code === 'Equal' || e.code === 'NumpadAdd') && (e.shiftKey || e.code === 'NumpadAdd')) {
        e.preventDefault();
        if (this.ttsController) {
          const newRate = Math.min(2.0, this.ttsController.settings.rate + 0.1);
          this.ttsController.setRate(newRate);
          console.log('[AssisT Content] Speed increased to:', newRate.toFixed(1));
          this.showToast(`Speed: ${newRate.toFixed(1)}x`);
        }
      }

      // Minus: Decrease speed
      if ((e.code === 'Minus' || e.code === 'NumpadSubtract')) {
        e.preventDefault();
        if (this.ttsController) {
          const newRate = Math.max(0.5, this.ttsController.settings.rate - 0.1);
          this.ttsController.setRate(newRate);
          console.log('[AssisT Content] Speed decreased to:', newRate.toFixed(1));
          this.showToast(`Speed: ${newRate.toFixed(1)}x`);
        }
      }
    });
  }

  setupClickToRead() {
    console.log('[AssisT Content] Setting up click-to-read functionality');

    document.addEventListener('click', async (e) => {
      // Only process if TTS is enabled and Ctrl key is held
      if (!this.settings.tts.enabled || !e.ctrlKey) {
        return;
      }

      // Find the closest paragraph or text container
      let target = e.target;
      let paragraph = null;

      // Look for paragraph, div, or other text containers
      while (target && target !== document.body) {
        if (target.matches('p, div.user_content, div.description, article, section, li')) {
          paragraph = target;
          break;
        }
        target = target.parentElement;
      }

      if (paragraph) {
        e.preventDefault();
        e.stopPropagation();

        const text = paragraph.textContent.trim();
        if (text) {
          console.log('[AssisT Content] Reading clicked paragraph:', text.substring(0, 50) + '...');

          // Initialize TTS if needed
          if (!this.ttsController) {
            this.ttsController = new TTSController(this.domAdapter, this.settings.tts);
            await this.ttsController.initialize();
          }

          // Stop current reading
          this.ttsController.stop();

          // Read the paragraph with highlighting
          await this.ttsController.readText(text, paragraph);
        }
      }
    });
  }

  showToast(message) {
    // Remove existing toast
    const existingToast = document.getElementById('assist-toast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create toast
    const toast = document.createElement('div');
    toast.id = 'assist-toast';
    toast.className = 'assist-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(33, 150, 243, 0.95);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    // Remove after 2 seconds
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
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
