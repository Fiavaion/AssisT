/**
 * The worker's answer to "open my AI settings".
 *
 * Eight AI features draw an Open Settings button when no provider is configured, and the AI setup
 * wizard offers to hand back to the popup when it finishes. Both raise a message here, because
 * neither a content script nor an extension page can open the popup itself.
 */

import { sanitizeError } from '../utils/sanitize-error.js';
import { requestPopupSurface, POPUP_SURFACE_AI } from '../utils/popup-open-request.js';

/** The popup, opened as an ordinary extension page when the browser will not draw the real one. */
const POPUP_PAGE = 'src/popup/popup.html';

/**
 * Bring the popup up.
 *
 * `chrome.action.openPopup()` is the real thing, and the browser is entitled to refuse it — it
 * needs a focused window, it wants a recent user gesture, and it does not exist at all before
 * Chrome 127. The popup is also a normal extension page, so a tab of it is a working second best:
 * the student still lands on the settings they were sent for.
 *
 * @returns {Promise<'popup'|'tab'>} Which surface the student got.
 */
async function openPopupSurface() {
  try {
    await chrome.action.openPopup();
    return 'popup';
  } catch (error) {
    console.log('[AssisT] Could not open the popup directly, opening it in a tab:', error?.message);
    await chrome.tabs.create({ url: chrome.runtime.getURL(POPUP_PAGE) });
    return 'tab';
  }
}

/**
 * Handle the two messages that ask for the popup.
 *
 * OPEN_POPUP_ADVANCED_OPTIONS wants the AI settings and leaves a note saying so; OPEN_POPUP is the
 * setup wizard handing back, and wants the popup as the student normally sees it.
 *
 * @param {Object} message - The incoming runtime message.
 * @param {Function} sendResponse - Reply channel; called asynchronously.
 * @returns {boolean} True when this handler has claimed the message.
 */
export function handlePopupOpenMessage(message, sendResponse) {
  const wantsAiSettings = message?.action === 'OPEN_POPUP_ADVANCED_OPTIONS';
  if (!wantsAiSettings && message?.action !== 'OPEN_POPUP') {
    return false;
  }

  (async () => {
    // The note goes down before the popup goes up, so it is already there to be read on mount.
    if (wantsAiSettings) {
      await requestPopupSurface(POPUP_SURFACE_AI);
    }
    return openPopupSurface();
  })()
    .then(surface => sendResponse({ success: true, surface }))
    .catch(error => sendResponse({ success: false, error: sanitizeError(error) }));

  return true;
}
