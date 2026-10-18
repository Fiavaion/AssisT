/**
 * AssisT shared offscreen document — single host.
 *
 * Chrome permits only ONE offscreen document per extension at a time. This host owns it and routes
 * messages by their `target`:
 *   - `offscreen-citations` → the citation DB handler (eager; lightweight Dexie).
 *   - `offscreen-webllm`    → the WebLLM handler (LAZY-imported on first use so a citation-only
 *                             session never pulls in the heavy @mlc-ai/web-llm bundle).
 *
 * Replacing the former standalone webllm-offscreen document. The citation store lives here because an
 * offscreen page is a stable extension-origin DOM context — fixing the per-website siloing bug.
 */

import { handleCitationMessage } from './citation-handler.js';
import { OFFSCREEN_TARGET_CITATIONS, OFFSCREEN_READY } from '../../config/citation-messages.js';

/** Cache the lazy WebLLM module import so it loads at most once. */
let _webllmModulePromise = null;
function loadWebLLM() {
  if (!_webllmModulePromise) {
    _webllmModulePromise = import('./webllm-handler.js');
  }
  return _webllmModulePromise;
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  // Only the service worker legitimately drives the offscreen document. Reject anything from a
  // different extension (sender.id) or from a tab/content-script context (sender.tab is set for
  // content scripts, never for the service worker) — a content script compromised by page XSS must
  // not reach the citation DB (incl. delete/clear) directly, bypassing the SW's own sender gate.
  if (sender?.id !== chrome.runtime.id || sender?.tab) {
    return false;
  }

  if (message.target === OFFSCREEN_TARGET_CITATIONS) {
    // Async; handler replies over chrome.runtime by requestId. Don't keep the channel open.
    handleCitationMessage(message);
    return false;
  }

  if (message.target === 'offscreen-webllm') {
    loadWebLLM()
      .then(mod => mod.handleWebLLMMessage(message))
      .catch(err => {
        console.error('[assist-offscreen] WebLLM handler failed to load:', err);
        // Reply so the service worker's pending request fails fast instead of timing out (~3 min).
        chrome.runtime
          .sendMessage({
            action: 'WEBLLM_OFFSCREEN_RESPONSE',
            source: 'webllm-offscreen',
            requestId: message.requestId,
            success: false,
            error: `WebLLM handler failed to load: ${err?.message || err}`,
          })
          .catch(() => {});
      });
    return false;
  }

  return false;
});

// The listener above is bound; tell the service worker it may start sending. Nothing is listening
// for a reply, and a worker that is not awake will simply find the document via getContexts.
chrome.runtime.sendMessage({ action: OFFSCREEN_READY }).catch(() => {});
