/**
 * AssisT Background Service Worker
 * Manages extension lifecycle, message passing, and persistent state
 * Universal accessibility extension for all websites
 */

import browser from '../core/browser-api.js';
import { StorageManager } from '../utils/storage-manager.js';
import { MessageRouter } from '../utils/message-router.js';
import { sanitizeError } from '../utils/sanitize-error.js';
import { getOllamaBaseUrl, hasOllamaPermission } from '../utils/ollama-url.js';
import {
  askOllama,
  answersWithThinkingOff,
  findInstalledTag,
  matchesModelFamily,
  pickVisionModel,
  DEFAULT_CHAT_MODEL,
  RECOMMENDED_PULL_MODEL,
  VISION_MODEL,
  REASONED_WITHOUT_ANSWER_MESSAGE,
} from '../utils/ollama-models.js';
import { createOllamaModelChooser } from '../ai/ollama-model-choice.js';
import { checkGeminiAvailability, generateText as geminiGenerateText } from '../ai/nano-client.js';
import { handleMindMapMessage } from './mindmap-handlers.js';
import { handlePopupOpenMessage } from './popup-open-handler.js';
import { handleThirdPartyMessage } from './third-party-requests.js';
import { handleConsentWindowMessage, handleConsentWindowClosed } from './consent-window.js';
import { debugLog } from '../utils/debug-log.js';
import {
  resetUnchosenOcrAutoPlay,
  forgetTextCustomizationSyncSwitch,
  withdrawAzureSpeech,
  withdrawTranslationKeyField,
  resetUnchosenOnlineVoice,
  forgetNewExperienceSwitch,
  forgetClassicPopupLayout,
  forgetStuckReaderSwitch,
  markSettingsMigrationsDone,
} from '../utils/settings-migrations.js';

/**
 * Tag on broadcasts the service worker sends to every extension context, so that its own listener
 * can recognise them and stop before the message router. Without it, a download's progress ticks
 * were logged as unknown message types.
 */
const BACKGROUND_BROADCAST_SOURCE = 'assist-background';

/**
 * Chooses the local model when the student has not picked one, from what Ollama reports installed,
 * with the list cached briefly. See src/ai/ollama-model-choice.js.
 */
const ollamaModelChooser = createOllamaModelChooser({
  listModels: () => checkOllamaAvailability(),
});

self.addEventListener('unhandledrejection', event => {
  console.error('[AssisT SW] Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

self.addEventListener('error', event => {
  console.error('[AssisT SW] Uncaught error:', event.message, event.filename, event.lineno);
});

/**
 * Validate that a message sender is from this extension
 * @param {chrome.runtime.MessageSender} sender - Message sender object
 * @returns {boolean} True if sender is trusted (from this extension)
 */
function isValidSender(sender) {
  // All trusted messages must originate from this extension's own runtime.
  // This covers both popup messages (no sender.tab) and content script messages
  // (sender.tab present). The extension deliberately supports All Sites Mode
  // via optional <all_urls> permission, so origin is not further restricted here —
  // only code from our own bundle runs as a content script.
  return sender.id === browser.runtime.id;
}

/**
 * Validate URL for safe navigation/fetching
 * Blocks dangerous protocols and internal network addresses
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowFile - Allow file:// protocol (default: false)
 * @param {boolean} options.allowExtension - Allow chrome-extension:// protocol (default: true)
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
function validateURL(url, options = {}) {
  const { allowFile = false, allowExtension = true } = options;

  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Block dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
  if (dangerousProtocols.includes(parsed.protocol)) {
    return { valid: false, error: `Blocked protocol: ${parsed.protocol}` };
  }

  // Handle file:// protocol
  if (parsed.protocol === 'file:') {
    if (!allowFile) {
      return { valid: false, error: 'file:// URLs not allowed' };
    }
    return { valid: true };
  }

  // Handle chrome-extension:// protocol
  if (parsed.protocol === 'chrome-extension:') {
    if (!allowExtension) {
      return { valid: false, error: 'Extension URLs not allowed' };
    }
    // Only allow URLs from this extension
    if (parsed.hostname !== browser.runtime.id) {
      return { valid: false, error: 'External extension URLs not allowed' };
    }
    return { valid: true };
  }

  // Allow http/https
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    // Block internal/private network addresses to prevent SSRF
    const hostname = parsed.hostname.toLowerCase();
    const blockedHostnames = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];

    if (blockedHostnames.includes(hostname)) {
      return { valid: false, error: 'Internal network URLs blocked' };
    }

    // Block private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Pattern);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
        return { valid: false, error: 'Private network IPs blocked' };
      }
    }

    return { valid: true };
  }

  return { valid: false, error: `Unsupported protocol: ${parsed.protocol}` };
}

// Cloud AI imports
import { cloudGenerate, checkCloudAvailability } from '../ai/cloud-router.js';
import { saveSecureAPIKey, migrateLegacyKeys } from '../core/storage/secure-key-storage.js';
import {
  CITATION_DB_OP,
  CITATION_OFFSCREEN_RESPONSE,
  OFFSCREEN_READY,
  OFFSCREEN_STORAGE_GET,
  OFFSCREEN_STORAGE_SET,
  OFFSCREEN_DOCUMENT_PATH,
} from '../config/citation-messages.js';
import { createOffscreenHost } from './offscreen-host.js';
import { authorizeOffscreenStorageRequest } from '../pages/assist-offscreen/offscreen-storage.js';

// ── Shared offscreen document helpers ────────────────────────────────────────
// Chrome permits only ONE offscreen document per extension. A single shared document
// (src/pages/assist-offscreen) hosts both the canonical citation Dexie DB (extension origin, fixing
// the per-website siloing bug) and WebLLM/WebGPU inference (unavailable in service workers). Both
// relays call the one idempotent creator below.

const pendingWebLLMRequests = new Map();
let _webllmReqCounter = 0;

const offscreenHost = createOffscreenHost({ chrome, url: OFFSCREEN_DOCUMENT_PATH });
const ensureAssistOffscreen = () => offscreenHost.ensure();

function sendToOffscreen(action, payload = {}) {
  return new Promise(async (resolve, reject) => {
    const requestId = `wllm_${++_webllmReqCounter}`;
    const timer = setTimeout(() => {
      pendingWebLLMRequests.delete(requestId);
      reject(new Error('WebLLM offscreen request timed out'));
    }, 180_000); // 3 min — enough for a first-time download
    pendingWebLLMRequests.set(requestId, result => {
      clearTimeout(timer);
      resolve(result);
    });
    try {
      await ensureAssistOffscreen();
      // A send that fails never produces a reply, so fail the caller now rather than leaving it
      // to wait out the full timeout for an answer that cannot come.
      chrome.runtime
        .sendMessage({ ...payload, action, target: 'offscreen-webllm', requestId })
        .catch(err => {
          if (pendingWebLLMRequests.delete(requestId)) {
            clearTimeout(timer);
            reject(err);
          }
        });
    } catch (err) {
      clearTimeout(timer);
      pendingWebLLMRequests.delete(requestId);
      reject(err);
    }
  });
}

// ── Citation store offscreen relay ───────────────────────────────────────────
// Content scripts and the popup call the RPC client → CITATION_DB_OP (handled in the onMessage
// listener) → here → the offscreen citation handler → reply matched back by requestId.

const pendingCitationRequests = new Map();
let _citationReqCounter = 0;

function sendToCitationOffscreen(action, args = []) {
  return new Promise(async (resolve, reject) => {
    const requestId = `cit_${++_citationReqCounter}`;
    const timer = setTimeout(() => {
      pendingCitationRequests.delete(requestId);
      reject(new Error('Citation offscreen request timed out'));
    }, 25_000);
    pendingCitationRequests.set(requestId, result => {
      clearTimeout(timer);
      resolve(result);
    });
    try {
      await ensureAssistOffscreen();
      // Same as the WebLLM relay: a failed send means no reply will ever arrive, so fail now.
      chrome.runtime
        .sendMessage({ target: 'offscreen-citations', action, requestId, args })
        .catch(err => {
          if (pendingCitationRequests.delete(requestId)) {
            clearTimeout(timer);
            reject(err);
          }
        });
    } catch (err) {
      clearTimeout(timer);
      pendingCitationRequests.delete(requestId);
      reject(err);
    }
  });
}

/**
 * Create context menus for AssisT features
 * This runs on every service worker startup to ensure menus are always available
 */
function setupContextMenus() {
  // Remove all existing menus first to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    console.log('[AssisT] Setting up context menus...');

    // Create context menu for citation capture
    chrome.contextMenus.create({
      id: 'save-citation',
      title: 'Save Citation',
      contexts: ['page', 'link', 'selection'],
    });

    // Create context menu for image description (AI Vision)
    chrome.contextMenus.create({
      id: 'describe-image',
      title: '🖼️ Describe Image with AI',
      contexts: ['image'],
    });

    console.log('[AssisT] Context menus created');
  });
}

// Setup context menus immediately when service worker starts
setupContextMenus();

// Service worker lifecycle
chrome.runtime.onInstalled.addListener(async details => {
  console.log('[AssisT] Extension installed:', details.reason);

  // Pages already open at this moment, including the very first page of a brand-new install and the
  // Canvas page a student was reading, never produced a tab event this worker was listening for, so
  // offer AssisT to them now. Started first and awaited last: the sweep needs none of the setup
  // below, and waiting for it made those pages wait seconds under load.
  const sweep = injectIntoOpenTabs(`extension ${details.reason}`);
  try {
    if (details.reason === 'install') {
      // Initialize default settings on first install
      await StorageManager.initializeDefaults();

      // Nothing here came from an earlier version, so no update migration may ever treat a choice
      // the student makes from now on as a leftover to reset.
      try {
        await markSettingsMigrationsDone();
      } catch (err) {
        console.warn('[AssisT] Settings migrations not marked done:', err.message);
      }

      console.log('[AssisT] Installation complete! Opening the welcome front door...');

      // First run opens the welcome front door, where AI setup and Discover your tools are two of
      // the guides on offer. Skipped when onboarding already finished (a re-install keeps storage).
      const storage = await chrome.storage.local.get('onboardingComplete');
      if (!storage.onboardingComplete) {
        chrome.tabs.create({
          url: chrome.runtime.getURL('src/pages/welcome/welcome.html'),
        });
      }
    }

    if (details.reason === 'update') {
      console.log('[AssisT] Extension updated from', details.previousVersion);

      // SECURITY: encrypt legacy plain-text API keys and delete the keys of withdrawn providers.
      // Imported statically: Chrome refuses import() in a service worker.
      try {
        const stats = await migrateLegacyKeys();
        if (stats.migrated > 0) {
          console.log(`[AssisT] Migrated ${stats.migrated} credentials to encrypted storage`);
        }
      } catch (err) {
        console.warn('[AssisT] Security initialization skipped:', err.message);
      }

      try {
        if (await resetUnchosenOcrAutoPlay()) {
          console.log('[AssisT] OCR auto-play set to its new default, off');
        }
      } catch (err) {
        console.warn('[AssisT] OCR auto-play default not applied:', err.message);
      }

      try {
        await forgetTextCustomizationSyncSwitch();
      } catch (err) {
        console.warn('[AssisT] Text Customization switch cleanup skipped:', err.message);
      }

      try {
        await withdrawAzureSpeech();
      } catch (err) {
        console.warn('[AssisT] Azure Speech cleanup skipped:', err.message);
      }

      try {
        await withdrawTranslationKeyField();
      } catch (err) {
        console.warn('[AssisT] Translation key field cleanup skipped:', err.message);
      }

      try {
        if (await resetUnchosenOnlineVoice()) {
          console.log('[AssisT] Read-aloud voice set back to the automatic choice');
        }
      } catch (err) {
        console.warn('[AssisT] Read-aloud voice reset skipped:', err.message);
      }

      try {
        await forgetNewExperienceSwitch();
      } catch (err) {
        console.warn('[AssisT] "Try the new AssisT" switch cleanup skipped:', err.message);
      }

      try {
        await forgetClassicPopupLayout();
      } catch (err) {
        console.warn('[AssisT] Classic popup layout cleanup skipped:', err.message);
      }

      try {
        await forgetStuckReaderSwitch();
      } catch (err) {
        console.warn('[AssisT] Stuck-reader switch cleanup skipped:', err.message);
      }
    }

    // Context menus are now set up in setupContextMenus() above
  } finally {
    await sweep;
  }
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-citation') {
    console.log('[AssisT] Context menu "Save Citation" clicked');

    // Send message to content script to save citation
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'SAVE_CITATION',
        selectedText: info.selectionText || '',
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

  if (info.menuItemId === 'describe-image') {
    console.log('[AssisT] Context menu "Describe Image" clicked');
    debugLog('[AssisT] Describe Image srcUrl:', info.srcUrl);

    // Send message to content script to describe the image
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'DESCRIBE_IMAGE',
        imageUrl: info.srcUrl,
      });

      if (response && response.success) {
        console.log('[AssisT] Image description initiated');
      } else {
        console.error('[AssisT] Image description failed:', response?.error);
      }
    } catch (error) {
      console.error('[AssisT] Context menu image error:', error);
    }
  }
});

// Message handling from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // SECURITY: Validate sender is from this extension
  if (!isValidSender(sender)) {
    console.warn('[AssisT Security] Rejected message from untrusted sender:', sender);
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return false;
  }

  // Citation DB operations from content scripts / popup — relay to the canonical store in the shared
  // offscreen document. The reply is the offscreen handler's { ok, result?, error? } envelope.
  if (message.type === CITATION_DB_OP) {
    sendToCitationOffscreen(message.op, message.args || [])
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true; // async response
  }

  // Open the full-page citation library — the only citation library surface.
  if (message.type === 'OPEN_CITATION_LIBRARY' || message.action === 'OPEN_CITATION_LIBRARY') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/citation-library/library.html'),
    });
    sendResponse({ success: true });
    return false;
  }

  // Open the citation how-to guide — its own tab, like the library and the discovery quiz.
  if (message.type === 'OPEN_CITATION_GUIDE' || message.action === 'OPEN_CITATION_GUIDE') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/citation-guide/guide.html'),
    });
    sendResponse({ success: true });
    return false;
  }

  // Mind map: open the editor, capture a highlight, map a page, list maps for the picker.
  // The worker owns the writes because a capture can come from any page (see mindmap-handlers.js).
  if (handleMindMapMessage(message, sender, sendResponse)) {
    return true; // async response
  }

  // Every request to a third-party service (dictionary, translation, CrossRef, Semantic Scholar)
  // goes through here, behind the student's consent for that service (ADR 0006).
  if (handleThirdPartyMessage(message, sendResponse)) {
    return true; // async response
  }

  // A page feature's first-use question for a service that needs a Chrome host is asked in an
  // extension window, the only place its Allow can ask Chrome (ADR 0009).
  if (handleConsentWindowMessage(message, sender, sendResponse)) {
    return true; // async response
  }

  // Handle opening discovery quiz page
  if (message.action === 'OPEN_DISCOVERY_QUIZ') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/discovery/discovery.html'),
    });
    sendResponse({ success: true });
    return false;
  }

  // Handle opening demo page

  // The AI panels' Open Settings button, and the setup wizard handing back when it finishes.
  if (handlePopupOpenMessage(message, sendResponse)) {
    return true; // async response
  }

  // Handle opening AI setup page (dedicated setup wizard)
  if (message.action === 'OPEN_AI_SETUP') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/ai-setup/ai-setup.html'),
    });
    sendResponse({ success: true });
    return false;
  }

  // Handle opening the unified onboarding front door (new experience).

  // System assessment: ping Ollama from service worker (pages can't access localhost)
  if (message.action === 'SYSTEM_ASSESS_OLLAMA') {
    checkOllamaAvailability()
      .then(status => sendResponse({ success: true, ...status }))
      .catch(error =>
        sendResponse({ success: false, available: false, models: [], error: sanitizeError(error) })
      );
    return true;
  }

  // Handle on-demand content script injection for non-LMS sites
  if (message.action === 'INJECT_CONTENT_SCRIPT') {
    const tabId = message.tabId;
    console.log('[AssisT] INJECT_CONTENT_SCRIPT requested for tab:', tabId);

    // Get the content script loader path from manifest
    const manifest = chrome.runtime.getManifest();
    let contentScriptPath = null;
    if (manifest.content_scripts && manifest.content_scripts[0]?.js?.[0]) {
      contentScriptPath = manifest.content_scripts[0].js[0];
    }

    if (!contentScriptPath) {
      console.error('[AssisT] Could not find content script path in manifest');
      sendResponse({ success: false, error: 'Content script path not found' });
      return false;
    }

    console.log('[AssisT] Injecting content script:', contentScriptPath);

    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        files: [contentScriptPath],
      })
      .then(() => {
        console.log('[AssisT] ✓ Content script injected successfully');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('[AssisT] Content script injection failed:', error.message);
        sendResponse({ success: false, error: sanitizeError(error) });
      });

    return true; // Keep channel open for async response
  }

  // Handle generic tab opening (with custom URL)
  if (message.action === 'openTab' && message.url) {
    // SECURITY: Validate URL to prevent open redirect attacks
    const validation = validateURL(message.url, { allowFile: false, allowExtension: true });
    if (!validation.valid) {
      console.warn(
        '[AssisT Security] Blocked openTab with invalid URL:',
        message.url,
        validation.error
      );
      sendResponse({ success: false, error: validation.error });
      return false;
    }
    chrome.tabs.create({
      url: message.url,
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

  // Handle image fetch requests (for cross-origin images)
  if (message.action === 'FETCH_IMAGE') {
    // SECURITY: Allow file:// URLs only when the requesting tab is also a file:// page
    // (user already has local file access, same logic as FETCH_PDF)
    const isFileUrl = message.url?.startsWith('file://');
    const senderIsFile = sender?.tab?.url?.startsWith('file://');
    const allowFile = isFileUrl && senderIsFile;

    const validation = validateURL(message.url, { allowFile, allowExtension: false });
    if (!validation.valid) {
      console.warn(
        '[AssisT Security] Blocked FETCH_IMAGE with invalid URL:',
        message.url,
        validation.error
      );
      sendResponse({ success: false, error: validation.error });
      return true;
    }

    console.log('[AssisT] Fetching image');

    const fetchOptions = isFileUrl
      ? { signal: AbortSignal.timeout(30000) }
      : { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(30000) };
    fetch(message.url, fetchOptions)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.blob();
      })
      .then(blob => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            // Return the base64 string without the data URL prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      })
      .then(base64 => {
        console.log(`[AssisT] Fetched image: ${base64.length} chars`);
        sendResponse({ success: true, base64 });
      })
      .catch(error => {
        console.error('[AssisT] Image fetch failed:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      });

    return true; // Keep channel open for async response
  }

  // Handle PDF fetch requests (for local file:// URLs that content scripts can't access)
  if (message.action === 'FETCH_PDF') {
    // SECURITY: Validate URL - allow file:// for local PDFs, but validate http/https
    const validation = validateURL(message.url, { allowFile: true, allowExtension: false });
    if (!validation.valid) {
      console.warn(
        '[AssisT Security] Blocked FETCH_PDF with invalid URL:',
        message.url,
        validation.error
      );
      sendResponse({ success: false, error: validation.error });
      return true;
    }

    console.log('[AssisT] Fetching PDF');

    fetch(message.url, { signal: AbortSignal.timeout(60000) })
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
        sendResponse({ success: false, error: sanitizeError(error) });
      });

    return true; // Keep channel open for async response
  }

  // Handle PDF scroll requests (for Chrome PDF viewer where content scripts don't run)

  // Check if local LLM (Ollama) is available
  if (message.action === 'LOCAL_LLM_CHECK') {
    checkOllamaAvailability()
      .then(status => sendResponse({ success: true, ...status }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Handle LLM mode change notifications (informational only, storage already updated by popup)

  // Set VRAM tier (Demo Mode)

  // Get current VRAM tier

  // Set model preference for a task type
  if (message.action === 'SET_MODEL_PREFERENCE') {
    const { taskType, model } = message;
    if (taskType && model) {
      userModelPreferences[taskType] = model;
      console.log(`[LLM Bridge] Model preference set: ${taskType} → ${model}`);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Missing taskType or model' });
    }
    return false;
  }

  // Get model preferences

  // Generate text with local LLM
  if (message.action === 'LOCAL_LLM_GENERATE') {
    // Keepalive: write to storage every 10s to prevent MV3 service worker suspension during long Ollama calls
    const keepAlive = setInterval(
      () => chrome.storage.local.set({ _sw_keepalive: Date.now() }),
      10000
    );
    (async () => {
      try {
        let options = message.options || {};

        // The student's explicit choice always wins. With no choice stored, the model is picked
        // from what Ollama reports installed — asking for a model nobody has is what used to end
        // in a silent extractive fallback.
        const stored = await chrome.storage.local.get('ollamaModel');
        const taskType = message.taskType || options.taskType || 'default';
        let choice;
        try {
          choice = await ollamaModelChooser.chooseModel({
            storedModel: stored.ollamaModel,
            resolvePreferred: chatModels =>
              getOptimalModelForTask(taskType, options.level, chatModels).model,
          });
        } catch (availErr) {
          console.warn('[LLM Generate] Model routing skipped:', availErr.message);
          choice = { model: null };
        }

        // Nothing installed can generate text. Say so instead of sending a request that fails.
        if (choice.error) {
          sendResponse({ success: false, error: choice.error });
          return;
        }
        if (choice.model) {
          options = { ...options, model: choice.model };
          console.log(`[LLM Generate] Task "${taskType}" → ${choice.model}`);
        }

        const result = await ollamaGenerate(message.prompt, options);
        sendResponse({ success: true, data: result });
      } catch (error) {
        const isTimeout =
          error.name === 'AbortError' ||
          (error.message &&
            (error.message.includes('timeout') ||
              error.message.includes('timed out') ||
              error.message.includes('aborted')));
        sendResponse({
          success: false,
          error: isTimeout
            ? `Local AI timed out. Your hardware may be too slow for this request. Try the smaller model ${RECOMMENDED_PULL_MODEL} or switch to Browser AI (WebLLM) in the popup.`
            : sanitizeError(error),
        });
      } finally {
        clearInterval(keepAlive);
      }
    })();
    return true;
  }

  // Task-optimized generation - routes to best model for the task

  // Vision model generation
  if (message.action === 'LOCAL_LLM_VISION') {
    ollamaVision(message.image, message.prompt, message.options || {})
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Install a model
  if (message.action === 'LOCAL_LLM_INSTALL_MODEL') {
    ollamaInstallModel(message.modelName, progress => {
      // Send progress updates via broadcast (content scripts listen)
      chrome.runtime
        .sendMessage({
          type: 'LLM_INSTALL_PROGRESS',
          source: BACKGROUND_BROADCAST_SOURCE,
          modelName: message.modelName,
          progress,
        })
        .catch(() => {}); // Ignore if no listeners
    })
      .then(() => {
        // A model has just arrived; the cached /api/tags list no longer describes the machine.
        ollamaModelChooser.forget();
        sendResponse({ success: true });
      })
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Get available models

  // Check if cloud mode is available
  if (message.action === 'CLOUD_LLM_CHECK') {
    checkCloudAvailability()
      .then(status => sendResponse({ success: true, ...status }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Save API key securely (called from ai-setup wizard which can't import secure-key-storage directly)
  if (message.action === 'SAVE_API_KEY') {
    const { provider, apiKey } = message;
    if (!provider || !apiKey) {
      sendResponse({ success: false, error: 'provider and apiKey are required' });
      return false;
    }
    saveSecureAPIKey(provider, apiKey)
      .then(saved =>
        sendResponse(
          saved ? { success: true } : { success: false, error: 'The key could not be stored' }
        )
      )
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Generate text with active cloud provider (routes via cloud-router)
  if (message.action === 'CLOUD_LLM_GENERATE') {
    cloudGenerate(message.prompt, message.options || {})
      .then(result =>
        sendResponse({
          success: true,
          data: result.content,
          usage: result.usage,
        })
      )
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Cloud vision: send image + prompt to cloud provider (Anthropic supports base64 images)
  if (message.action === 'CLOUD_LLM_VISION') {
    cloudGenerate(message.prompt, {
      ...(message.options || {}),
      image: message.image,
      imageMediaType: message.imageMediaType || 'image/jpeg',
    })
      .then(result =>
        sendResponse({
          success: true,
          data: result.content,
          usage: result.usage,
        })
      )
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Fetch available models for a provider (dynamic list)

  // Get cloud models list — returns models from model-registry

  // Run a single benchmark test

  // Handle Gemini Nano availability check
  if (message.action === 'GEMINI_LLM_CHECK') {
    checkGeminiAvailability()
      .then(availability => {
        sendResponse({ success: true, ...availability });
      })
      .catch(error => {
        console.error('[AssisT]', error);
        sendResponse({
          success: false,
          available: false,
          status: 'error',
          error: sanitizeError(error),
        });
      });
    return true; // Keep channel open for async response
  }

  // Handle Gemini Nano text generation request
  if (message.action === 'GEMINI_LLM_REQUEST') {
    const { prompt, options } = message;

    if (!prompt) {
      sendResponse({ success: false, error: 'Prompt is required' });
      return false;
    }

    console.log('[Gemini] Generation request received, prompt length:', prompt.length);

    geminiGenerateText(prompt, options || {})
      .then(text => {
        console.log('[Gemini] Generation complete, response length:', text.length);
        sendResponse({ success: true, text });
      })
      .catch(error => {
        console.error('[Gemini] Generation error:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      });

    return true; // Keep channel open for async response
  }

  // WebGPU is unavailable in service workers. All model operations are
  // forwarded to src/pages/webllm-offscreen/offscreen.html which has
  // full DOM + WebGPU access. Responses return via WEBLLM_OFFSCREEN_RESPONSE.

  // Responses from the offscreen document — resolve pending promises
  if (message.action === 'WEBLLM_OFFSCREEN_RESPONSE') {
    const { requestId, ...result } = message;
    const resolve = pendingWebLLMRequests.get(requestId);
    if (resolve) {
      pendingWebLLMRequests.delete(requestId);
      resolve(result);
    }
    return false;
  }

  // Storage on behalf of the offscreen document. That realm has no `chrome.storage` object at all —
  // only `chrome.runtime` — so the citation projection, the migration flag and the WebLLM model
  // memory all pass through here. The gate (sender must be our offscreen document, key must be one
  // of the four it owns) lives beside the client in offscreen-storage.js.
  if (message.action === OFFSCREEN_STORAGE_GET || message.action === OFFSCREEN_STORAGE_SET) {
    const request = authorizeOffscreenStorageRequest(message, sender, {
      extensionId: chrome.runtime.id,
      offscreenUrl: OFFSCREEN_DOCUMENT_PATH,
    });
    if (!request.ok) {
      console.warn('[AssisT Security] Refused an offscreen storage request:', request.error);
      sendResponse(request);
      return false;
    }
    (async () => {
      try {
        const result =
          request.action === OFFSCREEN_STORAGE_GET
            ? await chrome.storage.local.get(request.keys)
            : await chrome.storage.local.set(request.items);
        sendResponse({ ok: true, result: result ?? null });
      } catch (error) {
        sendResponse({ ok: false, error: sanitizeError(error) });
      }
    })();
    return true; // async response
  }

  // The offscreen document has bound its listener; requests waiting on creation may go.
  if (message.action === OFFSCREEN_READY) {
    offscreenHost.markReady();
    return false;
  }

  // Citation DB responses from the offscreen handler — resolve the matching pending request.
  if (message.action === CITATION_OFFSCREEN_RESPONSE) {
    const { requestId, ...result } = message;
    const resolve = pendingCitationRequests.get(requestId);
    if (resolve) {
      pendingCitationRequests.delete(requestId);
      resolve(result);
    }
    return false;
  }

  // The service worker's own broadcasts come back to it. A download ticks progress many times a
  // second, and with no branch here each tick fell through to MessageRouter.route and logged
  // "Unknown message type". Same shape as the offscreen guard below.
  if (message.type === 'LLM_INSTALL_PROGRESS' && message.source === BACKGROUND_BROADCAST_SOURCE) {
    return false;
  }

  // Progress / completion broadcasts from offscreen — already received by all extension
  // contexts directly, so there's nothing for the service worker to do here.
  if (
    (message.action === 'WEBLLM_PROGRESS' || message.action === 'WEBLLM_DOWNLOAD_COMPLETE') &&
    message.source === 'webllm-offscreen'
  ) {
    return false;
  }

  // Check WebLLM/WebGPU availability

  // Get available WebLLM models (static data — no offscreen needed)

  // Get cached (already downloaded) WebLLM models

  // Initialize WebLLM with specific model
  if (message.action === 'WEBLLM_INITIALIZE') {
    const { modelKey } = message;
    if (!modelKey) {
      sendResponse({ success: false, error: 'Model key required' });
      return false;
    }
    (async () => {
      try {
        const result = await sendToOffscreen('WEBLLM_INITIALIZE', { modelKey });
        if (result.success) {
          // Persist cached model so the wizard can detect it without IndexedDB guessing
          const stored = await chrome.storage.local.get(['webllmCachedModels']);
          const cachedSet = new Set(stored.webllmCachedModels || []);
          cachedSet.add(modelKey);
          await chrome.storage.local.set({ webllmCachedModels: Array.from(cachedSet) });
        }
        sendResponse(result);
      } catch (error) {
        console.error('[WebLLM] Initialization failed:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    })();
    return true;
  }

  // Generate text with WebLLM
  if (message.action === 'WEBLLM_GENERATE') {
    const { prompt, options } = message;
    if (!prompt) {
      sendResponse({ success: false, error: 'Prompt required' });
      return false;
    }
    (async () => {
      try {
        const result = await sendToOffscreen('WEBLLM_GENERATE', { prompt, options });
        sendResponse(result);
      } catch (error) {
        console.error('[WebLLM] Generation failed:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    })();
    return true;
  }

  // Get WebLLM engine status
  if (message.action === 'WEBLLM_STATUS') {
    (async () => {
      try {
        const result = await sendToOffscreen('WEBLLM_STATUS');
        sendResponse(result);
      } catch {
        sendResponse({ success: true, status: { ready: false, loading: false, model: null } });
      }
    })();
    return true;
  }

  // Unload WebLLM model (free memory)

  // Clear all WebLLM cached model data
  if (message.action === 'WEBLLM_CLEAR_CACHE') {
    (async () => {
      try {
        const result = await sendToOffscreen('WEBLLM_CLEAR_CACHE');
        await chrome.storage.local.remove([
          'webllmCachedModels',
          'webllmModel',
          'webllmTaskModels',
        ]);
        sendResponse({ success: true, ...result });
      } catch (error) {
        console.error('[WebLLM] Cache clear failed:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    })();
    return true;
  }

  // WebLLM vision support (future enhancement)

  // Route other messages through MessageRouter
  MessageRouter.route(message, sender)
    .then(response => sendResponse({ success: true, data: response }))
    .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));

  return true; // Keep message channel open for async response
});

/**
 * Fetch wrapper for Ollama API with CORS handling and helpful error messages.
 * The endpoint is resolved per call from settings (default localhost, or an
 * institution's central Ollama server) — see src/utils/ollama-url.js.
 * @param {string} endpoint - API endpoint (e.g., '/api/tags', '/api/generate')
 * @param {object} options - Fetch options (method, body, signal, etc.)
 * @returns {Promise<Response>} - Fetch response
 * @throws {Error} - With user-friendly error messages for common issues
 */
async function ollamaFetch(endpoint, options = {}) {
  const baseUrl = await getOllamaBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  // Every Ollama origin — the loopback default included — is an optional host permission, asked
  // for when the student turns local AI on (ADR 0002). Without the grant this fetch fails as a
  // plain network error, which reads exactly like Ollama not running and sends people off
  // restarting a server that was fine. So check first and say what is actually wrong.
  if (!(await hasOllamaPermission(baseUrl))) {
    const error = new Error(
      `AssisT does not have permission to reach local AI at ${baseUrl} yet. ` +
        'Open the AssisT popup, choose Local AI, and select Allow when Chrome asks.'
    );
    error.code = 'no-permission';
    throw error;
  }

  // The grant also gives the service worker an explicit CORS bypass for Ollama. Do not set
  // mode:'cors' explicitly — let Chrome use its default so the grant applies.
  const fetchOptions = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, fetchOptions);

    // Handle 403 errors (rare, but could indicate auth issues)
    if (response.status === 403) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Ollama returned 403 Forbidden: ${errorText || 'Access denied'}`);
    }

    return response;
  } catch (error) {
    // Network errors (Ollama not running or unreachable)
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(`Cannot connect to Ollama. Is Ollama running? (${baseUrl})`);
    }
    // Re-throw our custom errors or other errors
    throw error;
  }
}

/**
 * Check if Ollama is running and get available models
 */
async function checkOllamaAvailability() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await ollamaFetch('/api/tags', {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const models = data.models?.map(m => m.name) || [];
      const visionAvailable = Boolean(pickVisionModel(models));

      console.log('[LLM Bridge] Ollama available. Models:', models);

      return {
        available: true,
        models,
        visionAvailable,
      };
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.log('[LLM Bridge] Ollama not available:', error.message);
    }
    // A missing host permission is not "Ollama is offline", and telling a student to start a
    // server that is already running is worse than saying nothing. Name the real cause.
    if (error.code === 'no-permission') {
      return {
        available: false,
        models: [],
        visionAvailable: false,
        needsPermission: true,
        message: error.message,
      };
    }
  }

  return {
    available: false,
    models: [],
    visionAvailable: false,
  };
}

/**
 * Find the best matching installed model with intelligent fallback
 * @param {string} requestedModel - The model name requested (e.g., 'gemma3:4b')
 * @returns {Promise<string>} - The actual installed model name
 */
async function findInstalledModel(requestedModel) {
  try {
    const status = await checkOllamaAvailability();
    if (!status.available || !status.models.length) {
      return requestedModel; // Return as-is, will fail with clear error
    }

    // The same model under any of its names, e.g. qwen3.5:9b installed as qwen3.5:latest
    const sameModel = findInstalledTag(status.models, requestedModel);
    if (sameModel) {
      return sameModel;
    }

    // Check for any model starting with the requested name
    const matchingModel = status.models.find(
      m => m.startsWith(requestedModel) || m.startsWith(`${requestedModel}:`)
    );

    if (matchingModel) {
      console.log(`[LLM Bridge] Resolved '${requestedModel}' to '${matchingModel}'`);
      return matchingModel;
    }

    // Try fallback models based on current VRAM tier
    for (const fallback of FALLBACK_MODELS) {
      const fallbackMatch = status.models.find(
        m => m === fallback || m.startsWith(`${fallback}:`) || m.startsWith(fallback)
      );
      if (fallbackMatch) {
        console.log(
          `[LLM Bridge] Model '${requestedModel}' not found, using fallback '${fallbackMatch}'`
        );
        return fallbackMatch;
      }
    }

    // Last resort: return first available model
    console.log(`[LLM Bridge] No preferred model found, using '${status.models[0]}'`);
    return status.models[0];
  } catch (error) {
    console.warn('[LLM Bridge] Error finding model:', error);
    return requestedModel;
  }
}

/**
 * Model-Specific Optimization Profiles
 * Based on research: https://docs.ollama.com/context-length
 * https://ai.google.dev/gemma/docs/core/prompt-structure
 */
const MODEL_OPTIMIZATION_PROFILES = {
  // Gemma 3 4B - Optimized for structured output
  'gemma3:4b': {
    num_ctx: 4096, // Reduced from 8k default for speed
    temperature: 0.7, // Google's recommended range
    top_k: 40,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ['formatting', 'structure', 'definitions'],
  },
  gemma3: {
    num_ctx: 4096,
    temperature: 0.7,
    top_k: 40,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ['formatting', 'structure', 'definitions'],
  },
  // Mistral 7B - Optimized for reasoning (was slow due to 32k default context)
  'mistral:7b-instruct': {
    num_ctx: 4096, // Critical: reduced from 32k default
    temperature: 0.4, // Lower for educational content
    top_p: 0.9,
    repeat_penalty: 1.15, // Slight increase for less repetition
    strengths: ['reasoning', 'pedagogy', 'analysis'],
  },
  'mistral:7b': {
    num_ctx: 4096,
    temperature: 0.4,
    top_p: 0.9,
    repeat_penalty: 1.15,
    strengths: ['reasoning', 'pedagogy', 'analysis'],
  },
  // Llama 3.2 - Optimized for speed
  'llama3.2': {
    num_ctx: 2048, // Minimal context for max speed
    temperature: 0.6,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ['speed', 'simple-text', 'summarization'],
  },
  'llama3.2:3b': {
    num_ctx: 2048,
    temperature: 0.6,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ['speed', 'simple-text', 'summarization'],
  },
  // Phi3 Mini - Balance of quality and speed
  'phi3:mini': {
    num_ctx: 2048, // Reduced for speed
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ['general', 'fallback'],
  },
  // Qwen 2.5 7B - Good for academic text
  'qwen2.5:7b': {
    num_ctx: 4096,
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: ['academic', 'multilingual'],
  },
  // Default fallback profile
  default: {
    num_ctx: 4096,
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1,
    strengths: [],
  },
};

/**
 * Task-to-Model Routing Configuration: which installed model each feature prefers, best first.
 *
 * qwen3.5 leads everywhere: with thinking off it answers directly and quickly (measured on Ollama
 * 0.33.3: about a second for a short answer, 136 tokens for the tutor's JSON). The small qwen3
 * model AssisT offers follows. The rest are models students installed from earlier versions, kept
 * so their AssisT still picks a sensible one. Names are matched by family (matchesModelFamily), so
 * the qwen3 entry also matches a qwen3:4b or qwen3:8b the student already has.
 */
const OFFERED_MODELS = [DEFAULT_CHAT_MODEL, RECOMMENDED_PULL_MODEL];
const TASK_OPTIMAL_MODELS = {
  // Speed-critical tasks: a small model that does not think first beats a larger one that does.
  summarization: {
    priority: [DEFAULT_CHAT_MODEL, 'llama3.2:3b', 'gemma3:4b', RECOMMENDED_PULL_MODEL],
    reason: 'Summarization benefits from fast inference; quality differences minimal',
  },
  assignmentBreakdown: {
    priority: [...OFFERED_MODELS, 'gemma3:4b', 'mistral:7b-instruct'],
    reason: 'Structured output',
  },
  textSimplification: {
    basic: {
      priority: [DEFAULT_CHAT_MODEL, 'llama3.2:3b', 'gemma3:4b', RECOMMENDED_PULL_MODEL],
      reason: 'Basic simplification needs speed over complexity',
    },
    moderate: {
      priority: [...OFFERED_MODELS, 'gemma3:4b', 'mistral:7b-instruct'],
      reason: 'Moderate simplification needs balanced capability',
    },
    academic: {
      priority: [...OFFERED_MODELS, 'mistral:7b-instruct', 'gemma3:4b'],
      reason: 'Academic simplification needs strong reasoning + vocabulary',
    },
  },
  knowledgeGraph: {
    priority: [DEFAULT_CHAT_MODEL, 'gemma3:4b', 'llama3.2:3b', 'mistral:7b-instruct'],
    reason: 'Structured JSON without thinking overhead',
  },
  socraticTutor: {
    priority: [...OFFERED_MODELS, 'mistral:7b-instruct', 'gemma3:4b'],
    reason: 'Socratic questioning requires strong reasoning/pedagogy',
  },
  citationAnalyzer: {
    priority: [...OFFERED_MODELS, 'mistral:7b-instruct', 'gemma3:4b'],
    reason: 'Citation analysis requires analytical reasoning',
  },
  studyPathGenerator: {
    priority: [...OFFERED_MODELS, 'mistral:7b-instruct', 'gemma3:4b'],
    reason: 'Study path generation needs structured planning capability',
  },
  default: {
    priority: [...OFFERED_MODELS, 'mistral:7b-instruct', 'gemma3:4b', 'llama3.2:3b'],
    reason: 'The models AssisT offers first, then earlier installs',
  },
};

/**
 * Get the optimal model for a specific task
 * @param {string} taskType - The feature/task type (e.g., 'summarization', 'socraticTutor')
 * @param {string} level - Optional sub-level for tasks with multiple modes
 * @param {string[]} availableModels - List of installed models
 * @returns {Object} - { model: string, reason: string }
 */
// Map task types to preference categories
const TASK_TO_PREFERENCE_CATEGORY = {
  // General tasks
  summarization: 'general',
  multiDocCompare: 'general',

  // Academic tasks
  textSimplification: 'academic',
  socraticTutor: 'academic',
  assignmentBreakdown: 'academic',
  knowledgeGraph: 'academic',
  citationAnalyzer: 'academic',
  studyPathGenerator: 'academic',

  // Vision tasks
  imageUnderstanding: 'vision',

  // Code tasks
  codeAnalysis: 'code',
  codeGeneration: 'code',

  // Default fallback
  default: 'general',
};

function getOptimalModelForTask(taskType, level = null, availableModels = []) {
  // Check user preferences first
  const prefCategory = TASK_TO_PREFERENCE_CATEGORY[taskType] || 'general';
  const userPref = userModelPreferences[prefCategory];

  if (userPref && userPref !== 'auto' && availableModels.length > 0) {
    // User has set a specific preference - check if it's available
    const userMatch = availableModels.find(
      m => m === userPref || m.startsWith(`${userPref}:`) || m.startsWith(userPref)
    );
    if (userMatch) {
      console.log(`[LLM Routing] Using user preference: ${prefCategory} → ${userMatch}`);
      return {
        model: userMatch,
        reason: `User preference for ${prefCategory} tasks`,
        matched: true,
        userPreference: true,
      };
    }
  }

  // Get task configuration
  let taskConfig = TASK_OPTIMAL_MODELS[taskType];

  // Handle tasks with sub-levels (like textSimplification)
  if (taskConfig && level && taskConfig[level]) {
    taskConfig = taskConfig[level];
  }

  // Fallback to default if task not found
  if (!taskConfig || !taskConfig.priority) {
    taskConfig = TASK_OPTIMAL_MODELS.default;
  }

  // If no available models provided, return first priority
  if (!availableModels.length) {
    return {
      model: taskConfig.priority[0],
      reason: taskConfig.reason,
      matched: false,
    };
  }

  // Find first matching installed model
  for (const preferredModel of taskConfig.priority) {
    // Family-aware: the priority lists name the tags the project measured against, and a student
    // has whatever size and quantisation they pulled.
    const match = availableModels.find(m => matchesModelFamily(m, preferredModel));
    if (match) {
      return {
        model: match,
        reason: taskConfig.reason,
        matched: true,
      };
    }
  }

  // No match found - return first available
  return {
    model: availableModels[0],
    reason: 'No optimal model available, using fallback',
    matched: false,
  };
}

/**
 * Get optimization profile for a model
 * @param {string} model - Model name
 * @returns {Object} Optimization parameters
 */
function getModelProfile(model) {
  // Try exact match first
  if (MODEL_OPTIMIZATION_PROFILES[model]) {
    return MODEL_OPTIMIZATION_PROFILES[model];
  }
  // Try prefix match (e.g., 'gemma3:4b-instruct-q4' -> 'gemma3')
  for (const [key, profile] of Object.entries(MODEL_OPTIMIZATION_PROFILES)) {
    if (model.startsWith(key)) {
      return profile;
    }
  }
  return MODEL_OPTIMIZATION_PROFILES['default'];
}

// User model preferences by task type (general, academic, vision, code)
let userModelPreferences = {
  general: 'auto',
  academic: 'auto',
  vision: 'auto',
  code: 'auto',
};

// Load model preferences from storage on startup
(async () => {
  const result = await chrome.storage.local.get('modelPreferences');
  if (result.modelPreferences) {
    userModelPreferences = { ...userModelPreferences, ...result.modelPreferences };
  }
})();

/**
 * Installed models to fall back on, best first, when the one asked for is not installed. The two
 * AssisT offers come first; the rest are models students installed from earlier versions.
 */
const FALLBACK_MODELS = [
  DEFAULT_CHAT_MODEL,
  RECOMMENDED_PULL_MODEL,
  'gemma3:4b',
  'llama3.1:8b',
  'mistral:7b',
  'llama3.2:3b',
];

/**
 * Generate text with Ollama (Optimized)
 * Uses model-specific profiles for num_ctx, temperature, etc.
 */
async function ollamaGenerate(prompt, options = {}) {
  const requestedModel = options.model || DEFAULT_CHAT_MODEL;
  const model = await findInstalledModel(requestedModel);

  // Get model-specific optimization profile
  const profile = getModelProfile(model);
  console.log(`[LLM Bridge] Using profile for ${model}:`, {
    num_ctx: profile.num_ctx,
    temperature: options.temperature ?? profile.temperature,
  });

  // The request body and the one retry with thinking off are decided in one tested place
  // (askOllama); what they rest on was measured against the running Ollama.
  const send = async body => {
    console.log(`[LLM Bridge] Sending request to Ollama...`);
    let response;
    try {
      response = await ollamaFetch('/api/generate', {
        method: 'POST',
        model: model, // Pass model for better error messages
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeout || 60000),
      });
    } catch (fetchError) {
      console.error(`[LLM Bridge] Fetch error:`, fetchError.message);
      throw fetchError;
    }

    console.log(`[LLM Bridge] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[LLM Bridge] Request failed: ${response.status} ${errorText}`);
      throw new Error(`Ollama request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log(`[LLM Bridge] Response received, length: ${data.response?.length || 0} chars`);
    return data;
  };

  // Separate the answer from any reasoning ONCE, for every caller and both output shapes, because
  // everything past this line treats what it holds as the model's answer. A model that thought
  // until it ran out of room has already had one more go with thinking off by this point.
  const { answer, problem, retried } = await askOllama({ model, prompt, options, profile, send });
  if (retried) {
    console.warn(`[LLM Bridge] ${model} reasoned past its budget; retried with thinking off`);
  }

  if (problem) {
    // Two different failures, and telling them apart is the difference between a student retrying
    // forever and a student changing the one setting that would have fixed it.
    if (problem === 'reasoned-without-answering') {
      console.warn(`[LLM Bridge] ${model} reasoned past its budget without answering`);
      throw new Error(REASONED_WITHOUT_ANSWER_MESSAGE);
    }
    console.warn('[LLM Bridge] Ollama returned empty response');
    throw new Error('Model produced no output - prompt may be unclear or model may be overloaded');
  }

  // Parse JSON if requested
  if (options.format === 'json') {
    try {
      const jsonMatch = answer.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : answer;
      // Find JSON object in case there's any leading text remaining
      const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonObjMatch ? jsonObjMatch[0] : jsonStr.trim());
    } catch {
      return { raw: answer, parseError: true };
    }
  }

  return answer;
}

/**
 * Vision model generation with Ollama
 */
async function ollamaVision(imageBase64, prompt, options = {}) {
  const status = await checkOllamaAvailability();
  const requestedModel = options.model || pickVisionModel(status.models) || VISION_MODEL;
  const model = await findInstalledModel(requestedModel);

  const response = await ollamaFetch('/api/generate', {
    method: 'POST',
    model: model, // Pass model for better error messages
    body: JSON.stringify({
      model,
      prompt,
      images: [imageBase64],
      stream: false,
      // Measured: qwen3.5 describes an image in about a second with thinking off, and spends
      // 650 tokens thinking first without it.
      ...(answersWithThinkingOff(model) ? { think: false } : {}),
      options: {
        temperature: options.temperature ?? 0.5,
        num_predict: options.maxTokens ?? 1000,
      },
    }),
    signal: AbortSignal.timeout(options.timeout || 60000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Vision request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Install/pull a model via Ollama
 */
async function ollamaInstallModel(modelName, onProgress = null) {
  console.log(`[LLM Bridge] Installing model: ${modelName}`);

  let response;
  try {
    // Ollama pull API - just needs the model name
    response = await ollamaFetch('/api/pull', {
      method: 'POST',
      model: modelName, // Pass model for better error messages
      headers: {
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({ name: modelName }),
    });
  } catch (networkError) {
    console.error('[LLM Bridge] Network error connecting to Ollama:', networkError);
    throw networkError; // Re-throw ollamaFetch errors (already formatted)
  }

  console.log(`[LLM Bridge] Pull response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`[LLM Bridge] Pull failed: ${response.status} - ${errorText}`);

    if (response.status === 403) {
      // CORS issue - Ollama blocks POST requests from browser extensions by default
      throw new Error(
        'CORS blocked (403). To fix, restart Ollama with:\n' +
          'OLLAMA_ORIGINS=* ollama serve\n\n' +
          'Or install models in terminal:\n' +
          'ollama pull ' +
          modelName
      );
    }
    throw new Error(`Failed to start model download: ${response.status} - ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lastProgressUpdate = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const progress = JSON.parse(line);

        // Check for error in progress
        if (progress.error) {
          throw new Error(progress.error);
        }

        // Send progress updates (throttled to every 500ms)
        const now = Date.now();
        if (onProgress && progress.total && now - lastProgressUpdate > 500) {
          lastProgressUpdate = now;
          onProgress({
            status: progress.status,
            completed: progress.completed || 0,
            total: progress.total,
            percent: Math.round((progress.completed / progress.total) * 100),
          });
        }
      } catch (e) {
        if (e.message && !e.message.includes('JSON')) {
          throw e; // Re-throw non-JSON errors
        }
        // Ignore JSON parse errors
      }
    }
  }

  console.log(`[LLM Bridge] Model ${modelName} installed successfully`);
  return true;
}

// Tab activation listener for context-aware features
chrome.tabs.onActivated.addListener(async activeInfo => {
  try {
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
    // Content script injection is now handled by dynamic registration
    // via chrome.scripting.registerContentScripts()
  } catch (error) {
    console.log('[AssisT] Tab activation error:', error.message);
  }
});

// LMS domains where content script is auto-injected via manifest
const LMS_DOMAINS = [
  'instructure.com',
  'canvas.com',
  'moodle.org',
  'moodlecloud.com',
  'classroom.google.com',
  'docs.google.com',
];

/**
 * Check if a URL is an LMS site (where content script auto-loads via manifest)
 */
function isLmsSite(url) {
  if (!url) {
    return false;
  }
  return LMS_DOMAINS.some(domain => url.includes(domain));
}

/**
 * Check if a URL is a browser system page that can't have scripts injected
 */
function isSystemPage(url) {
  if (!url) {
    return true;
  }
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    // file:// URLs are allowed if user enables "Allow access to file URLs" in chrome://extensions
    url.startsWith('devtools://')
  );
}

/**
 * Tabs with an injection attempt in flight.
 *
 * Every caller that puts the content script into a page goes through `withTabInjectionGuard`, so a
 * tab finishing loading and a catch-up sweep cannot both reach the same tab at the same moment.
 * Nothing in the page stops a second evaluation, so a duplicate means two of every listener and two
 * of every floating control.
 *
 * Losing the map to a worker shutdown costs nothing: the worst case is a fresh attempt, and the
 * first thing an attempt does is ask the page whether the script is already there.
 *
 * Each entry holds the attempt to run once the current one finishes, if another caller arrived
 * meanwhile.
 */
const injecting = new Map();

/**
 * Run injection attempts for a tab one at a time, and never drop one.
 *
 * A caller that arrives while an attempt is running for the tab is queued, not turned away: the
 * page may have navigated and finished loading again, and the attempt in flight may have gone into
 * the page it replaced. Turned away, that page never got AssisT. Only the latest queued attempt
 * runs, since it carries the newest view of the tab, and it starts by asking the page whether the
 * script is already there, so a queued attempt never adds a second copy. It runs inside the first
 * caller's await, which keeps the worker alive until it is done.
 *
 * @param {number} tabId
 * @param {() => Promise<void>} attempt
 */
async function withTabInjectionGuard(tabId, attempt) {
  const running = injecting.get(tabId);
  if (running) {
    running.next = attempt;
    return;
  }
  const entry = { next: attempt };
  injecting.set(tabId, entry);
  try {
    while (entry.next) {
      const current = entry.next;
      entry.next = null;
      await current();
    }
  } finally {
    injecting.delete(tabId);
  }
}

/**
 * Inject content script into a tab if user has <all_urls> permission
 * and the tab is not an LMS site (which auto-loads via manifest)
 */
async function maybeInjectContentScript(tabId, url) {
  // Skip system pages
  if (isSystemPage(url)) {
    return;
  }

  // Skip LMS sites - they auto-load via manifest
  if (isLmsSite(url)) {
    return;
  }

  // Check if user has <all_urls> permission
  let hasAllUrls = false;
  try {
    hasAllUrls = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  } catch {
    return;
  }

  if (!hasAllUrls) {
    return;
  }

  // Check if content script is already loaded
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response?.loaded || response?.success) {
      console.log('[AssisT] Content script already loaded in tab:', tabId);
      return;
    }
  } catch {
    // Content script not loaded, proceed with injection
  }

  // Get content script path from manifest
  const manifest = chrome.runtime.getManifest();
  const contentScriptPath = manifest.content_scripts?.[0]?.js?.[0];
  if (!contentScriptPath) {
    console.error('[AssisT] Could not find content script path in manifest');
    return;
  }

  // Inject the content script
  try {
    console.log('[AssisT] Auto-injecting content script into tab:', tabId);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [contentScriptPath],
    });
    console.log('[AssisT] ✓ Content script auto-injected successfully');
  } catch (error) {
    console.log('[AssisT] Content script injection failed:', error.message);
  }
}

/**
 * Catch up on pages that were already open when something changed.
 *
 * A page only gets AssisT when it loads, so a page already sitting open at the moment of an install,
 * an update, a browser restart, or the student granting access to all sites has already missed its
 * chance. Without this, the answer to "I just installed it and nothing happens" is "reload the page",
 * which is not an answer.
 *
 * Two kinds of tab need different treatment, and the difference is the permission:
 *
 * - A learning platform page is matched by the manifest, so no permission is needed and none is held
 *   at install time. `maybeInjectContentScript` deliberately skips these, because normally the
 *   browser handles them. On an already-open tab nobody has handled them, so they are injected here
 *   directly. This is the Success Metric path: a student who installs AssisT while looking at a
 *   Canvas assignment should see the reader without touching the address bar.
 * - Any other page needs access to all sites, which is optional and, on a fresh install, not yet
 *   granted. Those go through `maybeInjectContentScript`, which checks the permission, skips system
 *   pages, and asks the page whether the script is already there before adding it again.
 *
 * @param {string} reason - for the log, so a student's console says why this happened.
 */
async function injectIntoOpenTabs(reason) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  const candidates = tabs.filter(tab => tab.id && tab.url && !isSystemPage(tab.url));
  if (candidates.length === 0) {
    return;
  }

  const contentScriptPath = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0];
  console.log(`[AssisT] Catching up on ${candidates.length} open tabs (${reason})`);

  for (const tab of candidates) {
    // One at a time, and never a tab someone else is already injecting: each is cheap, and a slow
    // tab must not hold up the rest.
    await withTabInjectionGuard(tab.id, async () => {
      if (isLmsSite(tab.url)) {
        if (!contentScriptPath) {
          return;
        }
        // Already there? Then leave it alone: a second copy means two of every control.
        try {
          const answer = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
          if (answer?.loaded || answer?.success) {
            return;
          }
        } catch {
          // No answer means nothing is listening yet, which is what we are here to fix.
        }
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [contentScriptPath],
          });
        } catch (error) {
          console.log('[AssisT] Could not reach tab', tab.id, ':', error.message);
        }
        return;
      }
      await maybeInjectContentScript(tab.id, tab.url);
    });
  }
}

// A restart leaves every restored tab without AssisT until it is reloaded, so sweep them.
chrome.runtime.onStartup.addListener(async () => {
  await injectIntoOpenTabs('browser started');
});

/**
 * Tab update listener: on a site the manifest does not match, AssisT's own script has to be put
 * into the page from here, once the student has granted access to all sites.
 *
 * The work happens INSIDE the listener, awaited, and never on a timer. This worker is not a page:
 * the browser keeps it alive while an event it handed us is still being awaited, and shuts it down
 * once we stop. A `setTimeout` is not something it waits for, so a timer armed here and due in
 * 100ms is simply lost if the shutdown lands first — which it often does, because a page finishing
 * loading is usually the last thing asked of this worker. That was a real defect, not a theoretical
 * one: on the same article, injection worked three times and never happened at all twice, with
 * nothing logged and nothing said to the student, because the timer died with the worker.
 *
 * Duplicate suppression is `withTabInjectionGuard`, the one in-flight set every caller shares, so a
 * catch-up sweep running at the same moment cannot inject this tab a second time.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only inject when page has finished loading
  if (changeInfo.status !== 'complete') {
    return;
  }

  await withTabInjectionGuard(tabId, async () => {
    // Re-read the tab: on a fast redirect the url handed to the listener can already be stale,
    // and injecting against the wrong origin is worse than not injecting.
    let url = tab?.url;
    try {
      const fresh = await chrome.tabs.get(tabId);
      url = fresh?.url || url;
    } catch {
      // Tab closed while we were asking — fall back to the url the event carried.
    }
    await maybeInjectContentScript(tabId, url);
  });
});

/**
 * Permission Change Handlers
 *
 * Granting access to all sites catches up every page already open, through the same sweep an
 * install and a browser restart use — one path, one in-flight guard, so a sweep and a tab that has
 * just finished loading cannot put the script into the same page twice. The student then sees the
 * confirmation on the page they are looking at.
 */

// Listen for permission changes, inject content scripts, show toast
chrome.permissions.onAdded.addListener(async permissions => {
  console.log('[AssisT] Permissions added:', permissions);
  if (permissions.origins?.includes('<all_urls>')) {
    console.log('[AssisT] ✓ All-sites permission granted - injecting content scripts');

    try {
      // Read the active tab before the sweep, so the confirmation lands on the page the student was
      // looking at when they granted it.
      const activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

      await injectIntoOpenTabs('all-sites granted');

      // Show success toast on active tab
      if (activeTab?.id) {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            // Remove any existing toast
            const existing = document.getElementById('assist-permission-toast');
            if (existing) {
              existing.remove();
            }

            const toast = document.createElement('div');
            toast.id = 'assist-permission-toast';
            toast.innerHTML = `
              <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                padding: 32px 48px;
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                z-index: 2147483647;
                text-align: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: assistToastIn 0.3s ease-out;
              ">
                <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                <div style="font-size: 24px; font-weight: bold; margin-bottom: 12px;">Permission Granted!</div>
                <div style="font-size: 18px; opacity: 0.95;">AssisT is now ready on all websites</div>
              </div>
              <div id="assist-permission-toast-backdrop" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2147483646;
                cursor: pointer;
              "></div>
              <style>
                @keyframes assistToastIn {
                  from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
                  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
              </style>
            `;
            document.body.appendChild(toast);

            // Add click handler to backdrop (CSP-compliant - no inline handlers)
            const backdrop = document.getElementById('assist-permission-toast-backdrop');
            if (backdrop) {
              backdrop.addEventListener('click', () => {
                const t = document.getElementById('assist-permission-toast');
                if (t) {
                  t.remove();
                }
              });
            }

            // Auto-dismiss after 3 seconds
            setTimeout(() => {
              const t = document.getElementById('assist-permission-toast');
              if (t) {
                t.remove();
              }
            }, 3000);
          },
        });
        console.log('[AssisT] ✓ Permission toast shown');
      }
    } catch (error) {
      console.log('[AssisT] Permission handler error:', error.message);
    }
  }
});

chrome.permissions.onRemoved.addListener(permissions => {
  console.log('[AssisT] Permissions removed:', permissions);
});

// A consent window closed without an answer: the page that asked hears "no answer" (ADR 0009).
chrome.windows.onRemoved.addListener(windowId => {
  handleConsentWindowClosed(windowId).catch(error => {
    console.error('[AssisT] Could not close out a consent question:', error);
  });
});

console.log('[AssisT] Background service worker initialized');
