/**
 * System Detector for AI Setup Wizard
 *
 * Detects hardware and software capabilities to inform AI mode recommendations.
 * Runs in extension page context (NOT service worker) so navigator.gpu is available.
 *
 * Note: WebGPU detection is implemented directly here rather than reusing the offscreen
 * document's WebLLM handler, so the setup page never loads the @mlc-ai/web-llm bundle.
 *
 * @module pages/ai-setup/system-detector
 */

const NO_GPU = { supported: false, gpuName: null, gpuClass: 'unknown' };

const VENDOR_NAMES = { nvidia: 'NVIDIA', amd: 'AMD', ati: 'AMD', intel: 'Intel', apple: 'Apple' };

/**
 * What kind of graphics hardware a WebGPU adapter is, from the little the browser reports.
 *
 * Chrome gives vendor and architecture (an RTX 3080 is "nvidia" / "ampere") and usually no
 * description, and never the graphics memory. So: NVIDIA is always a separate card; Intel is one
 * only on its "-hpg" (Arc desktop) architectures; AMD is a card only when the description says RX
 * or Pro, because an AMD laptop chip reports the same architectures; Apple is its own case.
 *
 * @param {{vendor?: string, architecture?: string, description?: string, isFallbackAdapter?: boolean}} info
 * @returns {'discrete'|'integrated'|'apple'|'software'|'unknown'}
 */
export function classifyGpu(info = {}) {
  if (info.isFallbackAdapter) {
    return 'software';
  }
  const vendor = (info.vendor || '').toLowerCase();
  const architecture = (info.architecture || '').toLowerCase();
  const description = info.description || '';

  if (vendor === 'nvidia') {
    return 'discrete';
  }
  if (vendor === 'intel') {
    return /-hpg$/.test(architecture) ? 'discrete' : 'integrated';
  }
  if (vendor === 'amd' || vendor === 'ati') {
    return /\bRX\s?\d|Radeon\s+(?:\(TM\)\s+)?(?:RX|Pro)\b/i.test(description)
      ? 'discrete'
      : 'unknown';
  }
  if (vendor === 'apple') {
    return 'apple';
  }
  if (vendor) {
    return 'integrated';
  }
  return 'unknown';
}

/**
 * A name for the GPU the student will recognise, using only what the browser reported.
 * @param {{vendor?: string, architecture?: string, description?: string}} info
 * @returns {string}
 */
export function describeGpu(info = {}) {
  if (info.description) {
    return info.description;
  }
  const vendor = (info.vendor || '').toLowerCase();
  const name = VENDOR_NAMES[vendor] || (vendor ? vendor[0].toUpperCase() + vendor.slice(1) : '');
  if (!name) {
    return 'Graphics';
  }
  const arch = info.architecture
    ? ` ${info.architecture[0].toUpperCase()}${info.architecture.slice(1)}`
    : '';
  return `${name}${arch} graphics`;
}

/**
 * Detect WebGPU availability and what kind of GPU it runs on.
 * @returns {Promise<{supported: boolean, gpuName: string|null, gpuClass: string, maxBufferSize?: number}>}
 */
async function detectWebGPU() {
  if (!navigator.gpu) {
    return NO_GPU;
  }

  try {
    // On a laptop with two GPUs, the separate card is the one a model would run on.
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return NO_GPU;
    }

    // adapter.info replaced requestAdapterInfo(), which Chrome has removed.
    const info = adapter.info || {};
    const gpuClass = classifyGpu(info);
    const gpuName = describeGpu(info);
    if (gpuClass === 'software') {
      return { supported: false, gpuName, gpuClass };
    }

    try {
      const device = await adapter.requestDevice();
      device.destroy();
    } catch {
      // device creation failed — WebGPU may not be fully supported
      return { supported: false, gpuName, gpuClass };
    }

    return { supported: true, gpuName, gpuClass, maxBufferSize: adapter.limits?.maxBufferSize };
  } catch {
    return NO_GPU;
  }
}

/** The share of an Apple chip's memory treated as available to its graphics (owner, 2026-10-07). */
export const APPLE_GRAPHICS_SHARE = 0.6;

const GiB = 2 ** 30;

/**
 * The least graphics memory a local model can count on, in GB, or null when it cannot be known.
 *
 * WebGPU never reports graphics memory, so a separate card's is unknown. An Apple chip shares one
 * pool of memory with its graphics, of which about 60% is treated as usable. The browser reports
 * that pool only as navigator.deviceMemory, which Chrome rounds down and caps at 8, so a Mac with
 * 32 GB still reads as 8 and this returns 4.8. The one other real figure is the largest single
 * buffer the graphics will accept (adapter.limits.maxBufferSize): the graphics can hold at least
 * that much, so it raises the floor when it is larger. Neither can say how much more there is.
 *
 * @param {{gpuClass: string, ramGB: number, maxBufferSize?: number}} hardware
 * @returns {number|null}
 */
export function estimateGraphicsMemoryGB({ gpuClass, ramGB, maxBufferSize }) {
  if (gpuClass !== 'apple') {
    return null;
  }
  const shared = (ramGB || 0) * APPLE_GRAPHICS_SHARE;
  const largestBuffer = typeof maxBufferSize === 'number' ? maxBufferSize / GiB : 0;
  return Math.max(shared, largestBuffer);
}

/**
 * The RAM figure in words. navigator.deviceMemory is capped at 8 for privacy, so 8 only ever means
 * "8 GB or more" and saying "8GB RAM" to a student with 32 would be wrong.
 * @param {number} ramGB
 * @returns {string}
 */
export function describeRam(ramGB) {
  return ramGB >= 8 ? '8 GB or more of RAM' : `${ramGB} GB of RAM`;
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
 *
 * `needsPermission` is carried through deliberately. The service worker distinguishes "the host
 * permission for the Ollama origin was never granted" from "nothing answered on that port", and
 * dropping that distinction here is what made the setup page tell students with a perfectly
 * healthy Ollama that it was not running.
 *
 * @returns {Promise<{ available: boolean, models: string[], needsPermission: boolean }>}
 */
async function detectOllamaAvailability() {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      resolve({ available: false, models: [], needsPermission: false });
    }, 6000);

    chrome.runtime.sendMessage({ action: 'SYSTEM_ASSESS_OLLAMA' }, response => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError || !response) {
        resolve({ available: false, models: [], needsPermission: false });
      } else {
        resolve({
          available: response.available || false,
          models: response.models || [],
          needsPermission: response.needsPermission === true,
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

  const webgpu = webgpuResult.status === 'fulfilled' ? webgpuResult.value : NO_GPU;
  const ollama =
    ollamaResult.status === 'fulfilled'
      ? ollamaResult.value
      : { available: false, models: [], needsPermission: false };
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
    graphicsMemoryGB: estimateGraphicsMemoryGB({
      gpuClass: webgpu.gpuClass,
      ramGB: memory.ramGB,
      maxBufferSize: webgpu.maxBufferSize,
    }),
    browser,
    network,
    assessedAt: Date.now(),
  };

  // Persist to storage for future reference (but don't block on it)
  chrome.storage.local.set({ systemAssessment: assessment }).catch(() => {});

  return assessment;
}
