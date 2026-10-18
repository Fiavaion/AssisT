/**
 * The one shared offscreen document, created on demand and handed over only once it is listening.
 *
 * Chrome allows a single offscreen document per extension, and `chrome.offscreen.createDocument`
 * resolves when the document exists, not when its module script has bound `onMessage`. Sending in
 * that gap fails with "Receiving end does not exist" and the first request from a freshly opened
 * citation library used to die exactly there. The document announces itself with `OFFSCREEN_READY`
 * once its listener is bound; `ensure()` waits for that after creating it, and concurrent callers
 * share the one creation.
 *
 * `chrome` is injected so the module can be tested without a browser.
 */

/**
 * @param {Object} options
 * @param {typeof chrome} options.chrome - The extension API
 * @param {string} options.url - Offscreen page path relative to the extension root
 * @param {number} [options.readyTimeoutMs] - How long to wait for the ready signal after creating
 * @returns {{ ensure: () => Promise<void>, markReady: () => void }}
 */
export function createOffscreenHost({ chrome, url, readyTimeoutMs = 5000 }) {
  let ensuring = null;
  let readyResolve = null;

  /** @returns {Promise<boolean|null>} null when getContexts is unavailable (older Chrome) */
  async function exists() {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(url)],
      });
      return contexts.length > 0;
    } catch {
      return null;
    }
  }

  async function create() {
    if (await exists()) {
      return;
    }
    const ready = new Promise(resolve => {
      readyResolve = resolve;
    });
    try {
      await chrome.offscreen.createDocument({
        url,
        reasons: ['WORKERS'],
        justification: 'Citation database (IndexedDB) and WebLLM model inference via WebGPU',
      });
    } catch (err) {
      readyResolve = null;
      if (err?.message?.includes('Only a single')) {
        // Older Chrome without getContexts: the document is already there and already listening.
        return;
      }
      throw err;
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('The offscreen document did not become ready in time')),
        readyTimeoutMs
      );
    });
    try {
      await Promise.race([ready, timeout]);
    } finally {
      clearTimeout(timer);
      readyResolve = null;
    }
  }

  function ensure() {
    if (!ensuring) {
      ensuring = create().finally(() => {
        ensuring = null;
      });
    }
    return ensuring;
  }

  function markReady() {
    readyResolve?.();
  }

  return { ensure, markReady };
}
