/**
 * Configurable Ollama endpoint — one shared source of truth for where local AI lives.
 *
 * By default the extension talks to Ollama on the student's own machine
 * (http://localhost:11434). That loopback origin is an OPTIONAL host permission, asked for the
 * first time a student turns local AI on rather than at install (ADR 0002). An institution can
 * instead run one Ollama
 * server on a lab machine and point every seat at it — so this module owns: the default, the
 * validation of a user-supplied endpoint (clean http(s) origin only), the stored override, and the
 * permission-gated change flow (every origin, the default included, must be granted before it is
 * ever used). All fetch paths read the URL through here; nothing else may hardcode it.
 *
 * Privacy note: a custom endpoint moves inference from on-device to the configured server — still
 * never a third-party cloud, but the settings UI must say so plainly.
 */

/** The out-of-the-box endpoint — Ollama's default local port. */
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/** chrome.storage.local key holding a custom endpoint origin (absent = default). */
export const OLLAMA_BASE_URL_STORAGE = 'ollamaBaseUrl';

/**
 * Normalise a user-supplied endpoint to a bare http(s) origin.
 * Accepts `host:port` shorthand (http assumed); strips paths/slashes/whitespace; rejects
 * credentials, query strings, and any non-http(s) scheme. Never throws.
 * @param {*} input
 * @returns {string|null} canonical origin (no trailing slash), or null when unusable
 */
export function normaliseOllamaBaseUrl(input) {
  if (typeof input !== 'string') {
    return null;
  }
  let candidate = input.trim();
  if (!candidate) {
    return null;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    // Bare host[:port] shorthand — assume plain http (typical for a LAN Ollama).
    if (/^[a-z0-9.-]+(:\d{1,5})?$/i.test(candidate)) {
      candidate = `http://${candidate}`;
    } else {
      return null;
    }
  }
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  return url.origin;
}

/**
 * The optional-host-permission match pattern for a normalised origin.
 * @param {string} baseUrl
 * @returns {string}
 */
export function ollamaOriginPattern(baseUrl) {
  return `${baseUrl}/*`;
}

/**
 * Resolve the active Ollama base URL: a stored, still-valid override, else the default.
 * Junk or unreadable storage degrades to the default — a bad value can never reach a fetch.
 * @returns {Promise<string>}
 */
export async function getOllamaBaseUrl() {
  try {
    const result = await chrome.storage.local.get(OLLAMA_BASE_URL_STORAGE);
    const stored = result && result[OLLAMA_BASE_URL_STORAGE];
    const normalised = normaliseOllamaBaseUrl(stored);
    return normalised || DEFAULT_OLLAMA_BASE_URL;
  } catch {
    return DEFAULT_OLLAMA_BASE_URL;
  }
}

/**
 * Is the host permission for an Ollama origin already held?
 *
 * The service worker asks this before every call, so a missing grant reads as a sentence a
 * student can act on instead of a network error that looks like Ollama being switched off.
 *
 * @param {string} [baseUrl] - defaults to the active endpoint
 * @param {{ hasPermission?: (pattern: string) => Promise<boolean> }} [deps]
 * @returns {Promise<boolean>} false when the grant is missing or unreadable
 */
export async function hasOllamaPermission(baseUrl, deps = {}) {
  const {
    hasPermission = async pattern => chrome.permissions.contains({ origins: [pattern] }),
  } = deps;
  const url = baseUrl || (await getOllamaBaseUrl());
  try {
    return (await hasPermission(ollamaOriginPattern(url))) === true;
  } catch {
    return false;
  }
}

/**
 * Hold the host permission for an Ollama origin, asking for it if it is not held yet.
 *
 * This is what makes the loopback origin an optional permission rather than an install-time one:
 * nothing is requested until a student actually turns local AI on. Chrome only shows the prompt
 * inside a user gesture, so call this from the handler for the press that turned it on.
 *
 * @param {string} [baseUrl] - defaults to the active endpoint
 * @param {{ hasPermission?: Function, requestPermission?: (pattern: string) => Promise<boolean> }} [deps]
 * @returns {Promise<boolean>} true when the permission is held afterwards
 */
export async function ensureOllamaPermission(baseUrl, deps = {}) {
  const {
    requestPermission = async pattern => chrome.permissions.request({ origins: [pattern] }),
  } = deps;
  const url = baseUrl || (await getOllamaBaseUrl());
  if (await hasOllamaPermission(url, deps)) {
    return true;
  }
  try {
    return (await requestPermission(ollamaOriginPattern(url))) === true;
  } catch {
    // A request outside a user gesture rejects. That is a denial, never a crash.
    return false;
  }
}

/**
 * Apply a user's endpoint change end-to-end: validate → hold the host permission → persist.
 * Must be called from a user gesture, because a permission prompt may show — for the default
 * loopback endpoint too, which is no longer granted at install (ADR 0002).
 * @param {string} input - raw text from the settings field; empty resets to the default
 * @param {{ hasPermission?: Function, requestPermission?: (pattern: string) => Promise<boolean> }} [deps]
 *   Both are injectable for tests; they default to chrome.permissions.
 * @returns {Promise<{ ok: true, url: string, isDefault: boolean } | { ok: false, reason: 'invalid'|'permission' }>}
 */
export async function applyOllamaBaseUrlChange(input, deps = {}) {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  const url = trimmed ? normaliseOllamaBaseUrl(trimmed) : DEFAULT_OLLAMA_BASE_URL;
  if (!url) {
    return { ok: false, reason: 'invalid' };
  }

  if (!(await ensureOllamaPermission(url, deps))) {
    return { ok: false, reason: 'permission' };
  }

  if (url === DEFAULT_OLLAMA_BASE_URL) {
    await chrome.storage.local.remove(OLLAMA_BASE_URL_STORAGE);
    return { ok: true, url, isDefault: true };
  }

  await chrome.storage.local.set({ [OLLAMA_BASE_URL_STORAGE]: url });
  return { ok: true, url, isDefault: false };
}
