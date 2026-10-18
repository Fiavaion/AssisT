/**
 * WebLLM handler — runs inside the shared AssisT offscreen document.
 *
 * Chrome extension service workers cannot access WebGPU. This module runs in the hidden offscreen
 * DOM context (where WebGPU is available) and relays results back to the service worker. It is
 * **lazy-loaded** by the offscreen host (offscreen.js) only when the first `offscreen-webllm`
 * message arrives, so a citation-only session never pulls in the heavy `@mlc-ai/web-llm` bundle.
 *
 * Behaviour is unchanged from the previous standalone webllm-offscreen document — the only change is
 * that the host owns the single `chrome.runtime.onMessage` listener and dispatches here via the
 * exported `handleWebLLMMessage`. The `source: 'webllm-offscreen'` tag on broadcasts is preserved
 * verbatim (ai-setup.js keys its progress UI off it — it is a message identity, not a file path).
 *
 * Message protocol (unchanged):
 *   SW → here:   { target: 'offscreen-webllm', action, requestId, ...payload }
 *   here → SW:   { action: 'WEBLLM_OFFSCREEN_RESPONSE', requestId, ...result }
 *   here → all:  { action: 'WEBLLM_PROGRESS', source: 'webllm-offscreen', modelKey, progress }
 */

import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { REGISTRY } from '../../ai/model-registry.js';
import { webllmModelLibPath } from '../../ai/webllm-model-libs.js';
import { getOffscreenStorage } from './offscreen-storage.js';

const MODEL_CONFIGS = REGISTRY.webllm.models;

/**
 * The engine's model list: web-llm's own description of each model AssisT ships a library for,
 * with `model_lib`, the compiled WebGPU code, pointing at the copy in the package instead of
 * GitHub (ADR 0010). The weights (`model`) still come from Hugging Face. This document is an
 * extension page, so it reads the package directly, with no web_accessible_resources entry.
 *
 * @returns {Object} an appConfig for CreateMLCEngine
 */
function localAppConfig() {
  return {
    ...prebuiltAppConfig,
    model_list: prebuiltAppConfig.model_list
      .filter(record => webllmModelLibPath(record.model_id) !== null)
      .map(record => ({
        ...record,
        model_lib: chrome.runtime.getURL(webllmModelLibPath(record.model_id)),
      })),
  };
}

let engine = null;
let currentModel = null;
let isReady = false;
let isLoading = false;

/**
 * Dispatch one `offscreen-webllm` message. Called by the offscreen host's single listener.
 * @param {Object} message - { action, requestId, ...payload }
 */
export function handleWebLLMMessage(message) {
  const { action, requestId } = message;

  switch (action) {
    case 'WEBLLM_STATUS':
      reply(requestId, { success: true, status: getStatus() });
      break;
    case 'WEBLLM_INITIALIZE':
      handleInitialize(message.modelKey, requestId);
      break;
    case 'WEBLLM_GENERATE':
      handleGenerate(message.prompt, message.options, requestId);
      break;
    case 'WEBLLM_CLEAR_CACHE':
      handleClearCache(requestId);
      break;
    default:
      break;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function reply(requestId, payload) {
  chrome.runtime
    .sendMessage({
      action: 'WEBLLM_OFFSCREEN_RESPONSE',
      source: 'webllm-offscreen',
      requestId,
      ...payload,
    })
    .catch(() => {});
}

function getStatus() {
  return { ready: isReady, loading: isLoading, model: currentModel };
}

// ── Initialise model ──────────────────────────────────────────────────────────

async function handleInitialize(modelKey, requestId) {
  const modelConfig = MODEL_CONFIGS[modelKey];
  if (!modelConfig) {
    reply(requestId, { success: false, error: `Unknown model key: ${modelKey}` });
    return;
  }

  if (isReady && currentModel === modelKey) {
    reply(requestId, { success: true, model: modelKey, status: getStatus() });
    return;
  }

  if (isLoading) {
    reply(requestId, { success: false, error: 'Already loading a model, please wait' });
    return;
  }

  isLoading = true;
  isReady = false;

  try {
    // Offscreen documents are extension pages and share host_permissions with the
    // service worker — they fetch the weights from huggingface.co directly, and the model
    // library from the package. No fetch proxy is needed or wanted: the proxy approach requires
    // the service worker to download entire model shards (hundreds of MB each) before
    // responding, and MV3 service workers are killed mid-transfer, causing the error.
    engine = await CreateMLCEngine(modelConfig.id, {
      appConfig: localAppConfig(),
      initProgressCallback: progress => {
        const pct = Math.round((progress.progress || 0) * 100);
        chrome.runtime
          .sendMessage({
            action: 'WEBLLM_PROGRESS',
            source: 'webllm-offscreen',
            modelKey,
            progress: {
              percent: pct,
              status: progress.text || 'Loading…',
              loaded: pct,
              total: 100,
            },
          })
          .catch(() => {});
      },
    });

    currentModel = modelKey;
    isReady = true;
    isLoading = false;

    // Record the download ourselves — the service worker may be killed before it can. This realm has
    // no chrome.storage, so it goes back through the worker over the storage bridge.
    try {
      const stored = await getOffscreenStorage().get(['webllmCachedModels']);
      const cachedSet = new Set(stored.webllmCachedModels || []);
      cachedSet.add(modelKey);
      await getOffscreenStorage().set({ webllmCachedModels: Array.from(cachedSet) });
    } catch (storageErr) {
      console.warn('[WebLLM Offscreen] Storage write failed:', storageErr);
    }

    chrome.runtime
      .sendMessage({
        action: 'WEBLLM_DOWNLOAD_COMPLETE',
        source: 'webllm-offscreen',
        modelKey,
        success: true,
      })
      .catch(() => {});

    reply(requestId, { success: true, model: modelKey, status: getStatus() });
  } catch (err) {
    isLoading = false;
    isReady = false;
    console.error('[WebLLM Offscreen] Init failed:', err);

    chrome.runtime
      .sendMessage({
        action: 'WEBLLM_DOWNLOAD_COMPLETE',
        source: 'webllm-offscreen',
        modelKey,
        success: false,
        error: err.message || 'WebLLM initialisation failed',
      })
      .catch(() => {});

    reply(requestId, { success: false, error: err.message || 'WebLLM initialisation failed' });
  }
}

// ── Generate ──────────────────────────────────────────────────────────────────

async function handleGenerate(prompt, options, requestId) {
  if (!engine || !isReady) {
    // Auto-init with stored model if not ready
    // A failed read must not sink the request: fall back to the default model rather than rejecting
    // out of this handler, which would leave the caller waiting on a reply that never comes.
    let remembered = {};
    try {
      remembered = await getOffscreenStorage().get(['webllmModel']);
    } catch (storageErr) {
      console.warn('[WebLLM Offscreen] Could not read the remembered model:', storageErr);
    }
    const modelKey = remembered.webllmModel || 'llama-3.2-1b';
    await handleInitialize(modelKey, null); // null requestId — don't reply yet
    if (!isReady) {
      reply(requestId, { success: false, error: 'WebLLM engine not ready' });
      return;
    }
  }

  try {
    const completion = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    });
    const text = completion.choices[0]?.message?.content || '';
    reply(requestId, { success: true, data: text });
  } catch (err) {
    console.error('[WebLLM Offscreen] Generation failed:', err);
    reply(requestId, {
      success: false,
      error: err.message || 'Generation failed',
      requiresInit: err.message?.includes('not initialized') ?? false,
    });
  }
}

// ── Clear cache ───────────────────────────────────────────────────────────────

async function handleClearCache(requestId) {
  try {
    engine = null;
    currentModel = null;
    isReady = false;
    isLoading = false;

    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));

    reply(requestId, { success: true, cleared: keys.length });
  } catch (err) {
    console.error('[WebLLM Offscreen] Cache clear failed:', err);
    reply(requestId, { success: false, error: err.message });
  }
}
