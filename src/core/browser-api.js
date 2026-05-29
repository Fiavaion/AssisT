/**
 * Cross-browser API abstraction layer.
 *
 * webextension-polyfill provides a consistent Promise-based browser.* API
 * across Chrome, Firefox, and Safari Web Extensions:
 *   - Chrome MV3: wraps chrome.* callbacks into browser.* promises
 *   - Firefox: browser.* is natively promise-based; polyfill is effectively a no-op
 *   - Safari Web Extensions: browser.* is natively available
 *
 * All new code should use `browser` from this module rather than calling
 * `chrome.*` directly. Existing `chrome.*` calls are being migrated
 * progressively; the Firefox port (NLnet deliverable) will complete this
 * migration and verify against the moz-extension:// origin.
 *
 * Chrome-specific APIs with no cross-browser equivalent (Chrome Prompt API,
 * browser-native STT via webkitSpeechRecognition) are intentionally kept as
 * chrome.* calls and capability-detected at runtime — they are disabled with
 * honest UX copy on Firefox. See docs/LESSONS_CONTENT_SCRIPT_INJECTION.md.
 */

import browserPolyfill from 'webextension-polyfill';

export const browser = browserPolyfill;
export default browserPolyfill;
