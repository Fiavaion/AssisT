/**
 * System Detector for AI Setup Wizard
 *
 * Detects hardware and software capabilities to inform AI mode recommendations.
 * Runs in extension page context (NOT service worker) so navigator.gpu is available.
 *
 * Note: WebGPU detection is implemented directly here (not imported from webllm-client.js)
 * to avoid loading the entire @mlc-ai/web-llm bundle on the setup page.
 *
 * @module pages/ai-setup/system-detector
 */

/**
 * Detect WebGPU availability and GPU info
 * @returns {Promise<{supported: boolean, gpuName: string, tier: string}>}
 */
async function detectWebGPU() {
  if (!navigator.gpu) {
    return { supported: false, gpuName: null, tier: 'none' };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return { supported: false, gpuName: null, tier: 'none' };
    }

    let gpuName = 'WebGPU GPU';
    try {
      const info = await adapter.requestAdapterInfo();
      gpuName = info?.description || info?.device || 'WebGPU GPU';
    } catch {
      // requestAdapterInfo() not available in all browsers
    }

    // Check limits to estimate VRAM tier
    const limits = adapter.limits;
    const maxBufferSize = limits?.maxBufferSize || 0;

    // Estimate VRAM tier from max buffer size
    let tier = 'low';
    if (maxBufferSize >= 4 * 1024 * 1024 * 1024) {
      tier = 'high'; // >= 4GB buffer suggests high-end GPU
    } else if (maxBufferSize >= 2 * 1024 * 1024 * 1024) {
      tier = 'medium'; // >= 2GB buffer
    }

    // Clean up test device
    try {
      const device = await adapter.requestDevice();
      device.destroy();
    } catch {
      // device creation failed — WebGPU may not be fully supported
      return { supported: false, gpuName, tier: 'none' };
    }

    return { supported: true, gpuName, tier };
  } catch {
    return { supported: false, gpuName: null, tier: 'none' };
  }
}

/**
 * Detect available device memory
 * @returns {{ ramGB: number, tier: 'low' | 'medium' | 'high' }}
 */
function detectDeviceMemory() {
  // navigator.deviceMemory returns an approximation in GB (1, 2, 4, 8, 16, 32)
  const ramGB = navigator.deviceMemory || 4; // Default to 4GB if API not available

  let tier = 'low';
  if (ramGB >= 8) {
    tier = 'high';
  } else if (ramGB >= 4) {
    tier = 'medium';
  }

  return { ramGB, tier };
}

/**
 * Check if Ollama is available (sends message to service worker — the only context
 * that can access localhost without CORS from an extension page)
 * @returns {Promise<{ available: boolean, models: string[] }>}
 */
async function detectOllamaAvailability() {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      resolve({ available: false, models: [] });
    }, 6000);

    chrome.runtime.sendMessage({ action: 'SYSTEM_ASSESS_OLLAMA' }, response => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError || !response) {
        resolve({ available: false, models: [] });
      } else {
        resolve({
          available: response.available || false,
          models: response.models || [],
        });
      }
    });
  });
}

/**
 * Check if Gemini Nano (Chrome Prompt API) is available
 * @returns {Promise<{ available: boolean, status: string }>}
 */
async function detectGeminiNano() {
  try {
    if (!window.ai || !window.ai.languageModel) {
      return { available: false, status: 'not-supported' };
    }

    const availability = await window.ai.languageModel.availability();

    if (availability === 'readily') {
      return { available: true, status: 'ready' };
    } else if (availability === 'after-download') {
      return { available: false, status: 'needs-download' };
    } else {
      return { available: false, status: 'not-supported' };
    }
  } catch {
    return { available: false, status: 'error' };
  }
}

/**
 * Detect browser version and compatibility
 * @returns {{ browser: string, version: number, meetsMinimum: boolean }}
 */
function detectBrowserVersion() {
  const ua = navigator.userAgent;
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  const version = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;

  return {
    browser: 'Chrome',
    version,
    meetsMinimum: version >= 113, // Minimum for WebGPU
  };
}

/**
 * Detect network connectivity (basic check)
 * @returns {{ online: boolean, connectionType: string }}
 */
function detectNetwork() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    online: navigator.onLine,
    connectionType: connection?.effectiveType || 'unknown',
  };
}

/**
 * Run full system assessment.
 * Runs all detectors as simultaneously as possible.
 * @returns {Promise<SystemAssessment>}
 */
export async function assess() {
  const [webgpuResult, ollamaResult, nanoResult] = await Promise.allSettled([
    detectWebGPU(),
    detectOllamaAvailability(),
    detectGeminiNano(),
  ]);

  const webgpu =
    webgpuResult.status === 'fulfilled'
      ? webgpuResult.value
      : { supported: false, gpuName: null, tier: 'none' };
  const ollama =
    ollamaResult.status === 'fulfilled' ? ollamaResult.value : { available: false, models: [] };
  const nano =
    nanoResult.status === 'fulfilled' ? nanoResult.value : { available: false, status: 'error' };
  const memory = detectDeviceMemory();
  const browser = detectBrowserVersion();
  const network = detectNetwork();

  const assessment = {
    webgpu,
    ollama,
    nano,
    memory,
    browser,
    network,
    assessedAt: Date.now(),
  };

  // Persist to storage for future reference (but don't block on it)
  chrome.storage.local.set({ systemAssessment: assessment }).catch(() => {});

  return assessment;
}
