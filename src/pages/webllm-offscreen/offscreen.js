/**
 * WebLLM Offscreen Document
 *
 * Chrome extension service workers cannot access WebGPU. This page runs in a
 * hidden DOM context (chrome.offscreen) where WebGPU is available, and relays
 * results back to the service worker via chrome.runtime.sendMessage.
 *
 * Message protocol:
 *   SW → here:   { target: 'offscreen-webllm', action, requestId, ...payload }
 *   here → SW:   { action: 'WEBLLM_OFFSCREEN_RESPONSE', requestId, ...result }
 *   here → all:  { action: 'WEBLLM_PROGRESS', source: 'webllm-offscreen', modelKey, progress }
 */

import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { REGISTRY } from '../../ai/model-registry.js';

const MODEL_CONFIGS = REGISTRY.webllm.models;

let engine = null;
let currentModel = null;
let isReady = false;
let isLoading = false;

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.target !== 'offscreen-webllm') {
    return false;
  }

  const { action, requestId } = message;

  switch (action) {
    case 'WEBLLM_CHECK':
      handleCheck(requestId);
      break;
    case 'WEBLLM_STATUS':
      reply(requestId, { success: true, status: getStatus() });
      break;
    case 'WEBLLM_INITIALIZE':
      handleInitialize(message.modelKey, requestId);
      break;
    case 'WEBLLM_GENERATE':
      handleGenerate(message.prompt, message.options, requestId);
      break;
    case 'WEBLLM_UNLOAD':
      handleUnload(requestId);
      break;
    default:
      break;
  }

  return false;
});

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

// ── WebGPU check ─────────────────────────────────────────────────────────────

async function handleCheck(requestId) {
  if (!navigator.gpu) {
    reply(requestId, {
      success: true,
      available: false,
      status: 'not-supported',
      error: 'WebGPU not available — requires Chrome 113+',
    });
    return;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      reply(requestId, { success: true, available: false, status: 'no-adapter' });
      return;
    }
    let gpuName = 'WebGPU Adapter';
    try {
      const info = await adapter.requestAdapterInfo();
      gpuName = info?.description || info?.device || gpuName;
    } catch {
      /* optional */
    }
    reply(requestId, { success: true, available: true, status: 'ready', gpu: gpuName });
  } catch (err) {
    reply(requestId, {
      success: true,
      available: false,
      status: 'error',
      error: err.message,
    });
  }
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
    // service worker — they can fetch from huggingface.co / raw.githubusercontent.com
    // directly. No fetch proxy is needed or wanted: the proxy approach requires the
    // service worker to download entire model shards (hundreds of MB each) before
    // responding, and MV3 service workers are killed mid-transfer, causing the error.
    engine = await CreateMLCEngine(modelConfig.id, {
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

    // Write to storage directly — the service worker may be killed before it can do this
    try {
      const stored = await new Promise(resolve =>
        chrome.storage.local.get(['webllmCachedModels'], resolve)
      );
      const cachedSet = new Set(stored.webllmCachedModels || []);
      cachedSet.add(modelKey);
      await chrome.storage.local.set({ webllmCachedModels: Array.from(cachedSet) });
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
    const { webllmModel } = await chrome.storage.local.get(['webllmModel']);
    const modelKey = webllmModel || 'llama-3.2-1b';
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

// ── Unload ────────────────────────────────────────────────────────────────────

async function handleUnload(requestId) {
  engine = null;
  currentModel = null;
  isReady = false;
  isLoading = false;
  reply(requestId, { success: true });
}
