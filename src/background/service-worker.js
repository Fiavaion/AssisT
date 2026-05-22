/**
 * AssisT Background Service Worker
 * Manages extension lifecycle, message passing, and persistent state
 * Universal accessibility extension for all websites
 */

import { StorageManager } from '../utils/storage-manager.js';
import { MessageRouter } from '../utils/message-router.js';
import { checkGeminiAvailability, generateText as geminiGenerateText } from '../ai/nano-client.js';

self.addEventListener('unhandledrejection', event => {
  console.error('[AssisT SW] Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

self.addEventListener('error', event => {
  console.error('[AssisT SW] Uncaught error:', event.message, event.filename, event.lineno);
});

// ========================================
// SECURITY UTILITIES
// ========================================

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
  return sender.id === chrome.runtime.id;
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
    if (parsed.hostname !== chrome.runtime.id) {
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
      // Allow localhost for local Ollama server
      // URL.port returns string, handle both string and number comparison
      if (hostname === 'localhost' && (parsed.port === '11434' || parsed.port === 11434)) {
        return { valid: true }; // Ollama API
      }
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

/**
 * Return a generic error message safe to forward to content scripts.
 * Full error detail is always logged in the service worker console.
 * @param {Error} err
 * @returns {string}
 */
function sanitizeError(err) {
  const msg = err?.message ?? '';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Network error';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Request timed out';
  }
  if (msg.includes('Ollama') || msg.includes('localhost:11434')) {
    return 'Local AI service error';
  }
  if (msg.includes('API key') || msg.includes('Unauthorized') || msg.includes('401')) {
    return 'API key error';
  }
  return 'An error occurred';
}

// Cloud AI imports
import { claudeGenerate } from '../ai/claude-client.js';
import { REGISTRY } from '../ai/model-registry.js';

import { cloudGenerate, cloudFetchModels, checkCloudAvailability } from '../ai/cloud-router.js';
import { saveSecureAPIKey } from '../core/storage/secure-key-storage.js';

// WebLLM — static data helpers only (no WebGPU needed in service worker)
import {
  getAvailableModels as getWebLLMModels,
  getCachedModels as getWebLLMCachedModels,
} from '../ai/webllm-client.js';

// ── WebLLM Offscreen Document helpers ────────────────────────────────────────
// WebGPU is unavailable in service workers; all model operations run in a
// hidden offscreen page and communicate back via chrome.runtime.sendMessage.

const WEBLLM_OFFSCREEN_URL = 'src/pages/webllm-offscreen/offscreen.html';
const pendingWebLLMRequests = new Map();
let _webllmReqCounter = 0;

async function ensureWebLLMOffscreen() {
  const url = chrome.runtime.getURL(WEBLLM_OFFSCREEN_URL);
  try {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url],
    });
    if (existing.length > 0) {
      return;
    }
  } catch {
    // getContexts not available on older Chrome — attempt create and ignore AlreadyExists
  }
  try {
    await chrome.offscreen.createDocument({
      url: WEBLLM_OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification: 'WebLLM model inference via WebGPU',
    });
  } catch (err) {
    if (!err.message?.includes('Only a single')) {
      throw err;
    }
  }
}

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
      await ensureWebLLMOffscreen();
      chrome.runtime
        .sendMessage({ ...payload, action, target: 'offscreen-webllm', requestId })
        .catch(() => {});
    } catch (err) {
      clearTimeout(timer);
      pendingWebLLMRequests.delete(requestId);
      reject(err);
    }
  });
}

// ========================================
// CONTEXT MENU SETUP (runs on every service worker start)
// ========================================

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
      contexts: ['page', 'link'],
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

  if (details.reason === 'install') {
    // Initialize default settings on first install
    await StorageManager.initializeDefaults();

    console.log('[AssisT] Installation complete! Opening AI setup wizard...');

    // Open AI setup wizard on first install
    // Guard: only open if onboarding hasn't been completed (safety net for re-installs)
    const storage = await chrome.storage.local.get('onboardingComplete');
    if (!storage.onboardingComplete) {
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/pages/ai-setup/ai-setup.html'),
      });
    }
  }

  if (details.reason === 'update') {
    console.log('[AssisT] Extension updated from', details.previousVersion);

    // SECURITY: Migrate legacy plain-text API keys and auto-rotate if needed
    // Note: This is a best-effort operation - may not work in all service worker contexts
    try {
      const { migrateLegacyKeys, autoRotateIfNeeded } = await import(
        '../core/storage/secure-key-storage.js'
      );

      // Migrate any legacy plain-text keys
      const stats = await migrateLegacyKeys();
      if (stats.migrated > 0) {
        console.log(`[AssisT] Migrated ${stats.migrated} credentials to encrypted storage`);
      }

      // Auto-rotate keys if rotation interval has passed
      const rotationResult = await autoRotateIfNeeded();
      if (rotationResult.rotated) {
        console.log(`[AssisT] Auto-rotated ${rotationResult.keysRotated} credentials`);
      }
    } catch (err) {
      // This can fail in service worker context if the module uses browser-only APIs
      // It's not critical - security features will work when accessed from popup/content scripts
      if (err.message?.includes('window') || err.message?.includes('document')) {
        console.log('[AssisT] Security module uses browser APIs - will initialize in page context');
      } else {
        console.warn('[AssisT] Security initialization skipped:', err.message);
      }
    }
  }

  // Context menus are now set up in setupContextMenus() above
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

  if (info.menuItemId === 'describe-image') {
    console.log('[AssisT] Context menu "Describe Image" clicked', info.srcUrl);

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

  // Handle opening AI setup page (dedicated setup wizard)
  if (message.action === 'OPEN_AI_SETUP') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/ai-setup/ai-setup.html'),
    });
    sendResponse({ success: true });
    return false;
  }

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

    console.log('[AssisT] Fetching image:', message.url);

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

  // ── Citation online verification ──────────────────────────────────────────
  // Fetches only the DOI or a short title string — no surrounding student text.
  // CrossRef is tried first (DOI lookup); Semantic Scholar is the title fallback.
  if (message.action === 'CITATION_VERIFY_ONLINE') {
    (async () => {
      const { doi, searchText } = message;
      let result = null;

      try {
        // 1. CrossRef by DOI (most precise — resolves to exact paper metadata)
        if (doi) {
          const resp = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
            headers: { 'User-Agent': 'AssisT-Extension/0.9' },
            signal: AbortSignal.timeout(10000),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.status === 'ok' && data.message) {
              const m = data.message;
              result = {
                found: true,
                source: 'crossref',
                doi: m.DOI,
                title: Array.isArray(m.title) ? m.title[0] : m.title || '',
                authors: m.author
                  ? m.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ')
                  : '',
                year: m.published?.['date-parts']?.[0]?.[0] ?? null,
                journal: Array.isArray(m['container-title'])
                  ? m['container-title'][0]
                  : m['container-title'] || '',
                url: m.URL || `https://doi.org/${m.DOI}`,
              };
            }
          }
        }

        // 2. Semantic Scholar title search (fallback when no DOI)
        if (!result && searchText) {
          const query = searchText
            .substring(0, 120)
            .replace(/[^\w\s]/g, ' ')
            .trim();
          const resp = await fetch(
            `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,venue,externalIds&limit=1`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (resp.ok) {
            const data = await resp.json();
            if (data.data && data.data.length > 0) {
              const p = data.data[0];
              result = {
                found: true,
                source: 'semanticscholar',
                doi: p.externalIds?.DOI || null,
                title: p.title || '',
                authors: p.authors ? p.authors.map(a => a.name).join(', ') : '',
                year: p.year || null,
                journal: p.venue || '',
                url: p.externalIds?.DOI
                  ? `https://doi.org/${p.externalIds.DOI}`
                  : `https://www.semanticscholar.org/paper/${p.paperId}`,
              };
            }
          }
        }
      } catch (err) {
        console.warn('[AssisT] Citation verification error:', err.message);
      }

      sendResponse(result || { found: false });
    })();
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

    console.log('[AssisT] Fetching PDF:', message.url);

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
          sendResponse({ success: false, error: sanitizeError(error) });
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
        sendResponse({ success: false, error: sanitizeError(error) });
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
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Handle LLM mode change notifications (informational only, storage already updated by popup)
  if (message.action === 'LOCAL_LLM_MODE_CHANGED') {
    console.log('[AssisT] Local LLM mode changed:', message.enabled ? 'enabled' : 'disabled');
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'CLOUD_MODE_CHANGED') {
    console.log('[AssisT] Cloud mode changed:', message.enabled ? 'enabled' : 'disabled');
    sendResponse({ success: true });
    return false;
  }

  // Set VRAM tier (Demo Mode)
  if (message.action === 'SET_VRAM_TIER') {
    const tier = message.tier || '8gb';
    const validTiers = ['auto', '2gb', '4gb', '8gb', '12gb', '16gb', '24gb'];
    if (validTiers.includes(tier)) {
      currentVramTier = tier;
      console.log(`[LLM Bridge] VRAM tier set to: ${tier} (default model: ${getDefaultModel()})`);
      sendResponse({ success: true, tier, defaultModel: getDefaultModel() });
    } else {
      sendResponse({ success: false, error: `Invalid tier: ${tier}` });
    }
    return true;
  }

  // Get current VRAM tier
  if (message.action === 'GET_VRAM_TIER') {
    sendResponse({
      success: true,
      tier: currentVramTier,
      defaultModel: getDefaultModel(),
      fallbackModels: getTierFallbackModels(),
    });
    return true;
  }

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
  if (message.action === 'GET_MODEL_PREFERENCES') {
    sendResponse({ success: true, preferences: userModelPreferences });
    return false;
  }

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

        // User's explicit model preference always wins.
        // Task routing only runs as a fallback when the user hasn't chosen a model.
        const stored = await chrome.storage.local.get('ollamaModel');
        if (stored.ollamaModel) {
          options = { ...options, model: stored.ollamaModel };
        } else if (message.taskType || options.taskType) {
          // No user preference — use task routing to find best available model
          try {
            const status = await checkOllamaAvailability();
            if (status.available && status.models.length > 0) {
              const taskType = message.taskType || options.taskType;
              const routing = getOptimalModelForTask(taskType, options.level, status.models);
              options = { ...options, model: routing.model };
              console.log(
                `[LLM Generate] Task "${taskType}" → ${routing.model} (${routing.reason})`
              );
            }
          } catch (availErr) {
            console.warn('[LLM Generate] Model routing skipped:', availErr.message);
          }
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
            ? 'Local AI timed out. Your hardware may be too slow for this request. Try a smaller model (phi3:mini or llama3.2:3b) or switch to Browser AI (WebLLM) in the popup.'
            : sanitizeError(error),
        });
      } finally {
        clearInterval(keepAlive);
      }
    })();
    return true;
  }

  // Task-optimized generation - routes to best model for the task
  if (message.action === 'LOCAL_LLM_TASK_GENERATE') {
    (async () => {
      try {
        // Get available models
        const status = await checkOllamaAvailability();
        if (!status.available) {
          return sendResponse({ success: false, error: 'Ollama not available' });
        }

        // Get optimal model for this task
        const taskType = message.taskType || 'default';
        const level = message.level || null;
        const routing = getOptimalModelForTask(taskType, level, status.models);

        console.log(`[LLM Routing] Task "${taskType}" (${level || 'default'}) → ${routing.model}`);
        console.log(`[LLM Routing] Reason: ${routing.reason}`);

        // Generate with the optimal model
        const result = await ollamaGenerate(message.prompt, {
          ...message.options,
          model: routing.model,
        });

        sendResponse({
          success: true,
          data: result,
          routing: {
            model: routing.model,
            reason: routing.reason,
            matched: routing.matched,
          },
        });
      } catch (error) {
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    })();
    return true;
  }

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
          modelName: message.modelName,
          progress,
        })
        .catch(() => {}); // Ignore if no listeners
    })
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Get available models
  if (message.action === 'LOCAL_LLM_GET_MODELS') {
    getOllamaModels()
      .then(models => sendResponse({ success: true, models }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // ========================================
  // CLOUD LLM MESSAGE HANDLERS (Multi-Provider)
  // ========================================

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
      .then(() => sendResponse({ success: true }))
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
  if (message.action === 'CLOUD_FETCH_MODELS') {
    cloudFetchModels(message.provider, message.apiKey)
      .then(models => sendResponse({ success: true, models }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

  // Get cloud models list — returns models from model-registry
  if (message.action === 'CLOUD_LLM_GET_MODELS') {
    sendResponse({
      success: true,
      models: REGISTRY.anthropic.models,
      featureDefaults: REGISTRY.anthropic.featureDefaults,
    });
    return false;
  }

  // ========================================
  // BENCHMARK MESSAGE HANDLERS
  // ========================================

  // Run a single benchmark test
  if (message.action === 'BENCHMARK_RUN_TEST') {
    runBenchmarkTest(message)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));
    return true;
  }

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

  // ========================================
  // WEBLLM MESSAGE HANDLERS (via Offscreen Document)
  // ========================================
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

  // Progress / completion broadcasts from offscreen — already received by all extension
  // contexts directly, so there's nothing for the service worker to do here.
  if (
    (message.action === 'WEBLLM_PROGRESS' || message.action === 'WEBLLM_DOWNLOAD_COMPLETE') &&
    message.source === 'webllm-offscreen'
  ) {
    return false;
  }

  // Proxy fetch: the offscreen document cannot reach external URLs directly.
  // It sends this message; the SW fetches the URL and caches it in 'tvmjs'
  // (web-llm's own cache name). Both share the same cache because they share
  // the same extension origin (chrome-extension://[id]).
  if (message.action === 'PROXY_FETCH_TO_CACHE') {
    const { url } = message;
    console.log('[WebLLM-SW] PROXY_FETCH_TO_CACHE received:', url?.slice(0, 120));
    if (!url || typeof url !== 'string') {
      console.error('[WebLLM-SW] PROXY_FETCH_TO_CACHE: missing/invalid url');
      sendResponse({ success: false, error: 'Invalid URL' });
      return false;
    }
    (async () => {
      try {
        const cache = await caches.open('tvmjs');
        const existing = await cache.match(url);
        if (existing) {
          console.log('[WebLLM-SW] Cache HIT (skipping fetch):', url.slice(0, 80));
          sendResponse({ success: true, fromCache: true });
          return;
        }
        console.log('[WebLLM-SW] Fetching:', url.slice(0, 80));
        const response = await fetch(url);
        console.log(
          '[WebLLM-SW] Fetch response:',
          response.status,
          response.statusText,
          url.slice(0, 80)
        );
        if (!response.ok) {
          console.error('[WebLLM-SW] Non-OK response:', response.status, url.slice(0, 80));
          sendResponse({
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
          });
          return;
        }
        console.log('[WebLLM-SW] Caching response for:', url.slice(0, 80));
        await cache.put(url, response);
        console.log('[WebLLM-SW] Cached OK:', url.slice(0, 80));
        sendResponse({ success: true });
      } catch (err) {
        console.error(
          '[WebLLM-SW] PROXY_FETCH_TO_CACHE error:',
          err.message,
          'for:',
          url?.slice(0, 80)
        );
        sendResponse({ success: false, error: err.message || 'Fetch failed' });
      }
    })();
    return true; // keep channel open during async fetch
  }

  // Check WebLLM/WebGPU availability
  if (message.action === 'WEBLLM_CHECK') {
    (async () => {
      try {
        const result = await sendToOffscreen('WEBLLM_CHECK');
        sendResponse(result);
      } catch (error) {
        sendResponse({
          success: false,
          available: false,
          status: 'error',
          error: sanitizeError(error),
        });
      }
    })();
    return true;
  }

  // Get available WebLLM models (static data — no offscreen needed)
  if (message.action === 'WEBLLM_GET_MODELS') {
    try {
      const models = getWebLLMModels();
      sendResponse({ success: true, models });
    } catch (error) {
      sendResponse({ success: false, error: sanitizeError(error) });
    }
    return false;
  }

  // Get cached (already downloaded) WebLLM models
  if (message.action === 'WEBLLM_GET_CACHED') {
    (async () => {
      try {
        const cachedModelKeys = await getWebLLMCachedModels();
        sendResponse({ success: true, cachedModels: Array.from(cachedModelKeys) });
      } catch {
        sendResponse({ success: true, cachedModels: [] });
      }
    })();
    return true;
  }

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
  if (message.action === 'WEBLLM_UNLOAD') {
    (async () => {
      try {
        const result = await sendToOffscreen('WEBLLM_UNLOAD');
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    })();
    return true;
  }

  // WebLLM vision support (future enhancement)
  if (message.action === 'WEBLLM_VISION') {
    sendResponse({ success: false, error: 'Vision models not yet supported in WebLLM mode' });
    return false;
  }

  // Route other messages through MessageRouter
  MessageRouter.route(message, sender)
    .then(response => sendResponse({ success: true, data: response }))
    .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));

  return true; // Keep message channel open for async response
});

// ========================================
// LOCAL LLM HELPER FUNCTIONS
// ========================================

const OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Fetch wrapper for Ollama API with CORS handling and helpful error messages
 * @param {string} endpoint - API endpoint (e.g., '/api/tags', '/api/generate')
 * @param {object} options - Fetch options (method, body, signal, etc.)
 * @returns {Promise<Response>} - Fetch response
 * @throws {Error} - With user-friendly error messages for common issues
 */
async function ollamaFetch(endpoint, options = {}) {
  const url = `${OLLAMA_BASE_URL}${endpoint}`;

  // http://localhost:11434 is declared in host_permissions, which grants the
  // service worker an explicit CORS bypass for Ollama. Do not set mode:'cors'
  // explicitly — let Chrome use its default so the host_permissions grant applies.
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
      throw new Error('Cannot connect to Ollama. Is Ollama running? (localhost:11434)');
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
      const visionAvailable = models.some(m => m.includes('llava') || m.includes('bakllava'));

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

    // Check for exact match first
    if (status.models.includes(requestedModel)) {
      return requestedModel;
    }

    // Check for match with :latest tag
    if (status.models.includes(`${requestedModel}:latest`)) {
      return `${requestedModel}:latest`;
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
    const tierFallback = getTierFallbackModels();
    console.log(`[LLM Bridge] Using ${currentVramTier} tier fallback models:`, tierFallback);

    for (const fallback of tierFallback) {
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
 * Task-to-Model Routing Configuration
 * Routes each feature type to optimal models based on benchmarked strengths
 */
const TASK_OPTIMAL_MODELS = {
  // Speed-critical tasks → smaller, faster models
  summarization: {
    priority: ['llama3.2:3b', 'llama3.2', 'phi3:mini', 'gemma3:4b'],
    reason: 'Summarization benefits from fast inference; quality differences minimal',
  },
  // Formatting tasks → structured output
  assignmentBreakdown: {
    priority: ['qwen3:8b-q4_K_M', 'gemma3:4b', 'mistral:7b-instruct'],
    reason: 'Qwen3 and Gemma produce reliable structured output',
  },
  textSimplification: {
    basic: {
      priority: ['llama3.2:3b', 'phi3:mini', 'gemma3:4b'],
      reason: 'Basic simplification needs speed over complexity',
    },
    moderate: {
      priority: ['gemma3:4b', 'qwen3:8b-q4_K_M', 'mistral:7b-instruct'],
      reason: 'Moderate simplification needs balanced capability',
    },
    academic: {
      priority: ['qwen3:8b-q4_K_M', 'mistral:7b-instruct', 'gemma3:4b'],
      reason: 'Academic simplification needs strong reasoning + vocabulary',
    },
  },
  // Structured JSON extraction → Qwen3 has best JSON compliance at 8B
  knowledgeGraph: {
    priority: ['gemma3:4b', 'llama3.2:3b', 'mistral:7b-instruct', 'qwen3:8b-q4_K_M'],
    reason: 'Mistral 7B: fast structured JSON without thinking overhead; gemma3:4b fallback',
  },
  // Reasoning-heavy tasks → Qwen3 excels
  socraticTutor: {
    priority: ['qwen3:8b-q4_K_M', 'mistral:7b-instruct', 'gemma3:4b'],
    reason: 'Socratic questioning requires strong reasoning/pedagogy',
  },
  citationAnalyzer: {
    priority: ['qwen3:8b-q4_K_M', 'mistral:7b-instruct', 'gemma3:4b'],
    reason: 'Citation analysis requires analytical reasoning',
  },
  studyPathGenerator: {
    priority: ['qwen3:8b-q4_K_M', 'mistral:7b-instruct', 'gemma3:4b'],
    reason: 'Study path generation needs structured planning capability',
  },
  // Default fallback
  default: {
    priority: ['qwen3:8b-q4_K_M', 'mistral:7b-instruct', 'gemma3:4b', 'llama3.2:3b'],
    reason: 'Qwen3 as primary default for best instruction following',
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
    const match = availableModels.find(
      m =>
        m === preferredModel || m.startsWith(`${preferredModel}:`) || m.startsWith(preferredModel)
    );
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

/**
 * VRAM Tier Configuration
 * Allows demo mode to simulate different hardware capabilities
 */
let currentVramTier = '8gb'; // Default to 8GB tier

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

const VRAM_TIER_MODELS = {
  auto: {
    default: 'qwen3:8b-q4_K_M',
    fallback: ['qwen3:8b-q4_K_M', 'mistral:7b-instruct', 'gemma3:4b', 'llama3.2:3b', 'phi3:mini'],
  },
  '2gb': {
    default: 'phi3:mini',
    fallback: ['phi3:mini', 'llama3.2', 'llama3.2:1b', 'tinyllama'],
  },
  '4gb': {
    default: 'gemma3:4b',
    fallback: ['gemma3:4b', 'qwen3:4b', 'llama3.2:3b', 'llama3.2', 'phi3:mini'],
  },
  '8gb': {
    default: 'qwen3:8b-q4_K_M',
    fallback: ['qwen3:8b-q4_K_M', 'mistral:7b-instruct', 'mistral:7b', 'gemma3:4b', 'llama3.2:3b'],
  },
  '12gb': {
    default: 'llama3.1:8b',
    fallback: ['llama3.1:8b', 'mixtral:8x7b', 'mistral:7b-instruct', 'qwen2.5:7b'],
  },
  '16gb': {
    default: 'qwen2.5:14b',
    fallback: ['qwen2.5:14b', 'llama3.1:70b-q4', 'llama3.1:8b', 'mixtral:8x7b'],
  },
  '24gb': {
    default: 'llama3.1:70b',
    fallback: ['llama3.1:70b', 'mixtral:8x22b', 'qwen2.5:14b', 'llama3.1:8b'],
  },
};

/**
 * Get the default model for the current VRAM tier
 */
function getDefaultModel() {
  const tierConfig = VRAM_TIER_MODELS[currentVramTier] || VRAM_TIER_MODELS['8gb'];
  return tierConfig.default;
}

/**
 * Get the fallback model list for the current VRAM tier
 */
function getTierFallbackModels() {
  const tierConfig = VRAM_TIER_MODELS[currentVramTier] || VRAM_TIER_MODELS['8gb'];
  return tierConfig.fallback;
}

// ============================================================================
// BENCHMARK TEST RUNNER
// ============================================================================

/**
 * Benchmark prompts for each feature
 */
const BENCHMARK_PROMPTS = {
  textSimplification: (text, level) => {
    const prompts = {
      basic: `Simplify this text for someone with reading difficulties. Use very simple words and short sentences:\n\n${text}\n\nSimplified version:`,
      moderate: `Simplify this academic text while keeping important terms. Add brief definitions in parentheses for difficult words:\n\n${text}\n\nSimplified version:`,
      academic: `Improve the readability of this academic text while preserving scholarly vocabulary. Add definitions for complex terms:\n\n${text}\n\nImproved version:`,
    };
    return prompts[level] || prompts.moderate;
  },

  summarization: (text, level) => {
    const prompts = {
      brief: `Summarize this text in 1-2 sentences:\n\n${text}\n\nSummary:`,
      moderate: `Provide a clear summary of this text in 3-4 sentences, capturing the main points:\n\n${text}\n\nSummary:`,
      detailed: `Provide a comprehensive summary of this text, including key details and supporting points:\n\n${text}\n\nDetailed summary:`,
    };
    return prompts[level] || prompts.brief;
  },

  socraticTutor: text =>
    `You are a Socratic tutor. Generate 3-4 thought-provoking questions to help a student understand this text deeply. Focus on comprehension, analysis, and critical thinking:\n\n${text}\n\nQuestions:`,

  assignmentBreakdown: text =>
    `Break down this assignment into clear, actionable steps. Include estimated time for each step and key requirements:\n\n${text}\n\nBreakdown:`,

  citationAnalyzer: text =>
    `Analyze this text or source for credibility. Assess: source type, potential bias, key claims, and reliability. Provide a credibility score (1-10):\n\n${text}\n\nAnalysis:`,
};

/**
 * Run a single benchmark test
 * @param {Object} params - Test parameters
 * @returns {Promise<Object>} Test result
 */
async function runBenchmarkTest(params) {
  const { feature, model, isCloud, text, level } = params;

  // Build the prompt
  const promptBuilder = BENCHMARK_PROMPTS[feature];
  if (!promptBuilder) {
    return { success: false, error: `Unknown feature: ${feature}` };
  }

  const prompt =
    typeof promptBuilder === 'function'
      ? level
        ? promptBuilder(text, level)
        : promptBuilder(text)
      : promptBuilder;

  const maxTokens = feature === 'summarization' ? 300 : 600;

  try {
    let result;

    if (isCloud) {
      // Cloud model (Claude API)
      result = await claudeGenerate(prompt, {
        model: model,
        maxTokens,
        temperature: 0.3,
      });

      return {
        success: true,
        data: result.content,
        tokens: result.usage?.output_tokens || 0,
        model: model,
        isCloud: true,
      };
    } else {
      // Local model (Ollama) - use model-specific optimization profile
      const profile = getModelProfile(model);
      console.log(`[Benchmark] Using optimized profile for ${model}:`, {
        num_ctx: profile.num_ctx,
        temperature: profile.temperature,
      });

      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        signal: AbortSignal.timeout(120000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false,
          options: {
            num_ctx: profile.num_ctx, // Key optimization
            num_predict: maxTokens,
            temperature: profile.temperature,
            top_p: profile.top_p,
            top_k: profile.top_k,
            repeat_penalty: profile.repeat_penalty,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.response,
        tokens: data.eval_count || 0,
        model: model,
        isCloud: false,
        evalDuration: data.eval_duration,
        totalDuration: data.total_duration,
      };
    }
  } catch (error) {
    console.error('[Benchmark] Test failed:', error);
    return {
      success: false,
      error: error.message,
      model: model,
      isCloud: isCloud,
    };
  }
}

/**
 * Generate text with Ollama (Optimized)
 * Uses model-specific profiles for num_ctx, temperature, etc.
 */
async function ollamaGenerate(prompt, options = {}) {
  const requestedModel = options.model || getDefaultModel();
  const model = await findInstalledModel(requestedModel);

  // Get model-specific optimization profile
  const profile = getModelProfile(model);
  console.log(`[LLM Bridge] Using profile for ${model}:`, {
    num_ctx: profile.num_ctx,
    temperature: options.temperature ?? profile.temperature,
  });

  console.log(`[LLM Bridge] Sending request to Ollama...`);

  let response;
  try {
    response = await ollamaFetch('/api/generate', {
      method: 'POST',
      model: model, // Pass model for better error messages
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        // format:'json' forces Ollama to emit JSON-only output at the inference level
        ...(options.format ? { format: options.format } : {}),
        options: {
          // Core optimization: reduced context window for speed
          num_ctx: options.num_ctx ?? profile.num_ctx,
          // Model-specific temperature (can be overridden)
          temperature: options.temperature ?? profile.temperature,
          // Token prediction limit
          num_predict: options.maxTokens ?? 500,
          // Additional optimizations from profile
          top_p: profile.top_p,
          top_k: profile.top_k,
          repeat_penalty: profile.repeat_penalty,
        },
      }),
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

  // Parse JSON if requested
  if (options.format === 'json') {
    try {
      // Strip <think>...</think> blocks emitted by reasoning models (e.g. qwen3)
      const raw = data.response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : raw;
      // Find JSON object in case there's any leading text remaining
      const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonObjMatch ? jsonObjMatch[0] : jsonStr.trim());
    } catch {
      return { raw: data.response, parseError: true };
    }
  }

  // Validate response is not empty
  if (!data.response || data.response.trim().length === 0) {
    console.warn('[LLM Bridge] Ollama returned empty response');
    throw new Error('Model produced no output - prompt may be unclear or model may be overloaded');
  }

  return data.response;
}

/**
 * Vision model generation with Ollama
 */
async function ollamaVision(imageBase64, prompt, options = {}) {
  const requestedModel = options.model || 'llava';
  const model = await findInstalledModel(requestedModel);

  const response = await ollamaFetch('/api/generate', {
    method: 'POST',
    model: model, // Pass model for better error messages
    body: JSON.stringify({
      model,
      prompt,
      images: [imageBase64],
      stream: false,
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

/**
 * Get list of available models
 */
async function getOllamaModels() {
  const status = await checkOllamaAvailability();
  return status.models;
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

// ========================================
// AUTOMATIC CONTENT SCRIPT INJECTION
// ========================================

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
    console.log('[AssisT] Auto-injecting content script into tab:', tabId, 'URL:', url);
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
 * Tab update listener - automatically inject content script on non-LMS sites
 * when user has <all_urls> permission
 *
 * Uses debouncing to prevent rapid-fire injections during bulk tab operations
 * (e.g., session restore with 20+ tabs)
 */
const injectionQueue = new Set();
const injectionTimers = new Map();
const DEBOUNCE_MS = 100;

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only inject when page has finished loading
  if (changeInfo.status !== 'complete') {
    return;
  }

  // Prevent duplicate injections for the same tab
  if (injectionQueue.has(tabId)) {
    console.log('[AssisT] Tab', tabId, 'already queued for injection, skipping');
    return;
  }

  // Mark tab as queued
  injectionQueue.add(tabId);

  // Clear any existing timer for this tab
  if (injectionTimers.has(tabId)) {
    clearTimeout(injectionTimers.get(tabId));
  }

  // Debounce: Wait 100ms before injecting (in case of rapid page changes)
  const timer = setTimeout(async () => {
    try {
      await maybeInjectContentScript(tabId, tab.url);
    } finally {
      // Clean up tracking
      injectionQueue.delete(tabId);
      injectionTimers.delete(tabId);
    }
  }, DEBOUNCE_MS);

  injectionTimers.set(tabId, timer);
});

// Handle extension icon click (if popup is disabled)
chrome.action.onClicked.addListener(async tab => {
  console.log('[AssisT] Extension icon clicked on tab:', tab.id);

  // Send message to content script to toggle AssisT panel
  chrome.tabs.sendMessage(tab.id, {
    type: 'TOGGLE_ASSIST_PANEL',
  });
});

// ========================================
// PERMISSION HANDLING
// ========================================

/**
 * Permission Change Handlers
 *
 * Simple approach: Permission grant just logs success.
 * Content script injection happens on-demand from popup via INJECT_CONTENT_SCRIPT message.
 */

// Listen for permission changes, inject content scripts, show toast
chrome.permissions.onAdded.addListener(async permissions => {
  console.log('[AssisT] Permissions added:', permissions);
  if (permissions.origins?.includes('<all_urls>')) {
    console.log('[AssisT] ✓ All-sites permission granted - injecting content scripts');

    try {
      // Get all open tabs and inject content script into non-LMS sites
      const allTabs = await chrome.tabs.query({});
      const activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

      // Get content script path from manifest (do once, not per tab)
      const manifest = chrome.runtime.getManifest();
      const contentScriptPath = manifest.content_scripts?.[0]?.js?.[0];

      if (!contentScriptPath) {
        console.error('[AssisT] Content script path not found in manifest');
        return;
      }

      // Filter eligible tabs upfront
      const eligibleTabs = allTabs.filter(
        tab => tab.id && tab.url && !isSystemPage(tab.url) && !isLmsSite(tab.url)
      );

      console.log(
        `[AssisT] Injecting content script into ${eligibleTabs.length} eligible tabs (${allTabs.length} total)`
      );

      // Inject into all eligible tabs using chunked parallelization
      // Process 10 tabs at a time to avoid overwhelming Chrome
      const CHUNK_SIZE = 10;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < eligibleTabs.length; i += CHUNK_SIZE) {
        const chunk = eligibleTabs.slice(i, i + CHUNK_SIZE);

        // Process this chunk in parallel
        await Promise.all(
          chunk.map(tab =>
            chrome.scripting
              .executeScript({
                target: { tabId: tab.id },
                files: [contentScriptPath],
              })
              .then(() => {
                successCount++;
                console.log('[AssisT] ✓ Content script injected into tab:', tab.id);
              })
              .catch(err => {
                failCount++;
                console.log('[AssisT] Could not inject into tab', tab.id, ':', err.message);
              })
          )
        );
      }

      console.log(`[AssisT] Injection complete: ${successCount} success, ${failCount} failed`);

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

console.log('[AssisT] Background service worker initialized');
