/**
 * AssisT Background Service Worker
 * Manages extension lifecycle, message passing, and persistent state
 * Universal accessibility extension for all websites
 */

import { StorageManager } from '../utils/storage-manager.js';
import { MessageRouter } from '../utils/message-router.js';

// Service worker lifecycle
chrome.runtime.onInstalled.addListener(async details => {
  console.log('[AssisT] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // Initialize default settings on first install
    await StorageManager.initializeDefaults();

    console.log('[AssisT] Installation complete! Click the extension icon to get started.');

    // Open welcome page (disabled for now - welcome.html not created yet)
    // chrome.tabs.create({
    //   url: chrome.runtime.getURL('src/popup/welcome.html')
    // });
  }

  if (details.reason === 'update') {
    console.log('[AssisT] Extension updated from', details.previousVersion);
    // Handle migration if needed
  }

  // Create context menu for citation capture
  chrome.contextMenus.create({
    id: 'save-citation',
    title: 'Save Citation',
    contexts: ['page', 'link'],
  });
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-citation') {
    console.log('[AssisT] Context menu "Save Citation" clicked');

    // Send message to content script to save citation
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'SAVE_CITATION',
      });

      if (response && response.success) {
        console.log('[AssisT] Citation saved via context menu');
      } else {
        console.error('[AssisT] Citation save failed via context menu');
      }
    } catch (error) {
      console.error('[AssisT] Context menu citation error:', error);
    }
  }
});

// Message handling from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle opening discovery quiz page
  if (message.action === 'OPEN_DISCOVERY_QUIZ') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/discovery/discovery.html'),
    });
    sendResponse({ success: true });
    return false;
  }

  // Handle opening demo page
  if (message.action === 'OPEN_DEMO_PAGE') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/demo/demo.html'),
    });
    sendResponse({ success: true });
    return false;
  }

  // Handle screenshot capture requests
  if (message.action === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: message.options?.format || 'png' }, dataUrl => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    return true; // Keep channel open for async response
  }

  // Handle PDF fetch requests (for local file:// URLs that content scripts can't access)
  if (message.action === 'FETCH_PDF') {
    console.log('[AssisT] Fetching PDF:', message.url);

    fetch(message.url)
      .then(response => {
        if (!response.ok && !message.url.startsWith('file://')) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        console.log(`[AssisT] Fetched PDF: ${arrayBuffer.byteLength} bytes`);
        // Convert ArrayBuffer to Array for Chrome message passing
        // ArrayBuffer cannot be directly sent via chrome.runtime.sendMessage
        const uint8Array = new Uint8Array(arrayBuffer);
        const dataArray = Array.from(uint8Array);
        sendResponse({ success: true, data: dataArray, byteLength: arrayBuffer.byteLength });
      })
      .catch(error => {
        console.error('[AssisT] PDF fetch failed:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  }

  // Handle PDF scroll requests (for Chrome PDF viewer where content scripts don't run)
  if (message.action === 'SCROLL_PDF') {
    const tabId = sender.tab?.id || message.tabId;

    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID provided' });
      return false;
    }

    // Handle special PAGE_DOWN command for multi-page PDF capture
    if (message.scrollY === 'PAGE_DOWN') {
      chrome.scripting
        .executeScript({
          target: { tabId: tabId },
          func: () => {
            console.log('[PDF Page Down] Simulating Page Down keypress');

            // Try multiple methods to trigger page navigation

            // Method 1: Dispatch actual keyboard event (Page Down key)
            const pageDownEvent = new KeyboardEvent('keydown', {
              key: 'PageDown',
              code: 'PageDown',
              keyCode: 34,
              which: 34,
              bubbles: true,
              cancelable: true,
            });
            document.dispatchEvent(pageDownEvent);

            // Method 2: Try arrow down multiple times (one page worth)
            for (let i = 0; i < 10; i++) {
              const arrowDownEvent = new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                code: 'ArrowDown',
                keyCode: 40,
                which: 40,
                bubbles: true,
                cancelable: true,
              });
              document.dispatchEvent(arrowDownEvent);
            }

            // Method 3: Try scrollBy as fallback
            window.scrollBy(0, window.innerHeight);

            const newY = window.scrollY;
            console.log('[PDF Page Down] Result scroll position:', newY);
            return newY;
          },
        })
        .then(results => {
          const actualScrollY =
            results && results[0] && results[0].result !== undefined ? results[0].result : -1;
          console.log('[AssisT] PDF Page Down result:', actualScrollY);
          sendResponse({ success: true, actualScrollY });
        })
        .catch(error => {
          console.error('[AssisT] PDF Page Down failed:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true; // Keep channel open for async response
    }

    // Handle numeric scroll position (legacy support)
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: scrollY => {
          console.log('[PDF Scroll Injection] Attempting to scroll to', scrollY);
          console.log(
            '[PDF Scroll Injection] Initial state - window.scrollY:',
            window.scrollY,
            'docElement.scrollTop:',
            document.documentElement.scrollTop
          );

          // Try window.scrollTo first
          window.scrollTo(0, scrollY);
          console.log('[PDF Scroll Injection] After window.scrollTo:', window.scrollY);

          // Try scrollingElement (best practice for cross-browser compatibility)
          if (window.scrollY === 0 && scrollY > 0 && document.scrollingElement) {
            console.log('[PDF Scroll Injection] Trying document.scrollingElement');
            document.scrollingElement.scrollTop = scrollY;
            console.log(
              '[PDF Scroll Injection] After scrollingElement:',
              document.scrollingElement.scrollTop
            );
          }

          // Try documentElement
          if (window.scrollY === 0 && scrollY > 0) {
            console.log('[PDF Scroll Injection] Trying document.documentElement');
            document.documentElement.scrollTop = scrollY;
            console.log(
              '[PDF Scroll Injection] After documentElement:',
              document.documentElement.scrollTop
            );
          }

          // Try body
          if (window.scrollY === 0 && scrollY > 0 && document.body) {
            console.log('[PDF Scroll Injection] Trying document.body');
            document.body.scrollTop = scrollY;
            console.log('[PDF Scroll Injection] After body:', document.body?.scrollTop);
          }

          // Try scrollBy as last resort
          if (window.scrollY === 0 && scrollY > 0) {
            console.log('[PDF Scroll Injection] Trying window.scrollBy');
            window.scrollBy(0, scrollY);
            console.log('[PDF Scroll Injection] After scrollBy:', window.scrollY);
          }

          const actualScroll =
            window.scrollY ||
            document.documentElement.scrollTop ||
            document.scrollingElement?.scrollTop ||
            document.body?.scrollTop ||
            0;
          console.log('[PDF Scroll Injection] Final scroll position:', actualScroll);
          console.log(
            '[PDF Scroll Injection] ScrollHeight:',
            document.documentElement.scrollHeight,
            'ClientHeight:',
            document.documentElement.clientHeight
          );
          return actualScroll;
        },
        args: [message.scrollY],
      })
      .then(results => {
        const actualScrollY =
          results && results[0] && results[0].result !== undefined ? results[0].result : -1;
        console.log('[AssisT] PDF scroll injection result:', actualScrollY);
        sendResponse({ success: true, actualScrollY });
      })
      .catch(error => {
        console.error('[AssisT] PDF scroll failed:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  }

  // ========================================
  // LOCAL LLM MESSAGE HANDLERS
  // ========================================

  // Check if local LLM (Ollama) is available
  if (message.action === 'LOCAL_LLM_CHECK') {
    checkOllamaAvailability()
      .then(status => sendResponse({ success: true, ...status }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Generate text with local LLM
  if (message.action === 'LOCAL_LLM_GENERATE') {
    ollamaGenerate(message.prompt, message.options || {})
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Vision model generation
  if (message.action === 'LOCAL_LLM_VISION') {
    ollamaVision(message.image, message.prompt, message.options || {})
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Install a model
  if (message.action === 'LOCAL_LLM_INSTALL_MODEL') {
    ollamaInstallModel(message.modelName, progress => {
      // Send progress updates via broadcast (content scripts listen)
      chrome.runtime.sendMessage({
        type: 'LLM_INSTALL_PROGRESS',
        modelName: message.modelName,
        progress
      }).catch(() => {}); // Ignore if no listeners
    })
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Get available models
  if (message.action === 'LOCAL_LLM_GET_MODELS') {
    getOllamaModels()
      .then(models => sendResponse({ success: true, models }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Route other messages through MessageRouter
  MessageRouter.route(message, sender)
    .then(response => sendResponse({ success: true, data: response }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true; // Keep message channel open for async response
});

// ========================================
// LOCAL LLM HELPER FUNCTIONS
// ========================================

const OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Check if Ollama is running and get available models
 */
async function checkOllamaAvailability() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const models = data.models?.map(m => m.name) || [];
      const visionAvailable = models.some(m => m.includes('llava') || m.includes('bakllava'));

      console.log('[LLM Bridge] Ollama available. Models:', models);

      return {
        available: true,
        models,
        visionAvailable
      };
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.log('[LLM Bridge] Ollama not available:', error.message);
    }
  }

  return {
    available: false,
    models: [],
    visionAvailable: false
  };
}

/**
 * Generate text with Ollama
 */
async function ollamaGenerate(prompt, options = {}) {
  const model = options.model || 'llama3.2';

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 500
      }
    }),
    signal: AbortSignal.timeout(options.timeout || 30000)
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status}`);
  }

  const data = await response.json();

  // Parse JSON if requested
  if (options.format === 'json') {
    try {
      const jsonMatch = data.response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : data.response;
      return JSON.parse(jsonStr.trim());
    } catch (e) {
      return { raw: data.response, parseError: true };
    }
  }

  return data.response;
}

/**
 * Vision model generation with Ollama
 */
async function ollamaVision(imageBase64, prompt, options = {}) {
  const model = options.model || 'llava';

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: [imageBase64],
      stream: false,
      options: {
        temperature: options.temperature ?? 0.5,
        num_predict: options.maxTokens ?? 1000
      }
    }),
    signal: AbortSignal.timeout(options.timeout || 60000)
  });

  if (!response.ok) {
    throw new Error(`Vision request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Install/pull a model via Ollama
 */
async function ollamaInstallModel(modelName, onProgress = null) {
  console.log(`[LLM Bridge] Installing model: ${modelName}`);

  const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true })
  });

  if (!response.ok) {
    throw new Error(`Failed to start model download: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const progress = JSON.parse(line);
        if (onProgress && progress.total) {
          onProgress({
            status: progress.status,
            completed: progress.completed || 0,
            total: progress.total,
            percent: Math.round((progress.completed / progress.total) * 100)
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  console.log(`[LLM Bridge] Model ${modelName} installed`);
  return true;
}

/**
 * Get list of available models
 */
async function getOllamaModels() {
  const status = await checkOllamaAvailability();
  return status.models;
}

// Tab activation listener for context-aware features
chrome.tabs.onActivated.addListener(async activeInfo => {
  const tab = await chrome.tabs.get(activeInfo.tabId);

  // Skip browser system pages
  if (
    tab.url &&
    (tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:'))
  ) {
    return;
  }

  console.log('[AssisT] Tab activated:', tab.id);
});

// Handle extension icon click (if popup is disabled)
chrome.action.onClicked.addListener(async tab => {
  console.log('[AssisT] Extension icon clicked on tab:', tab.id);

  // Send message to content script to toggle AssisT panel
  chrome.tabs.sendMessage(tab.id, {
    type: 'TOGGLE_ASSIST_PANEL',
  });
});

console.log('[AssisT] Background service worker initialized');
