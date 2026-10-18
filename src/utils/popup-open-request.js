/**
 * The note the service worker leaves for a popup that does not exist yet.
 *
 * A content script cannot open the popup, and the popup cannot be told anything until the browser
 * has drawn it, so "open my AI settings" travels in two parts: the worker writes down which
 * settings were asked for and brings the popup up, and the popup reads the note as it mounts.
 *
 * The note is spent on reading. A request that survived would drag the Advanced Options modal open
 * every subsequent time the student opened the popup.
 */

/** Storage key holding the pending request. */
export const POPUP_OPEN_REQUEST_KEY = 'popupOpenRequest';

/** The Advanced Options modal, on its AI tab. */
export const POPUP_SURFACE_AI = 'ai';

/**
 * Session storage where the browser has it — a request that outlived the browser session would be
 * a surprise days later — and local storage everywhere else.
 * @returns {Object} A chrome.storage area.
 */
function requestStore() {
  return chrome.storage.session || chrome.storage.local;
}

/**
 * Ask the next popup to open on a particular surface.
 * @param {string} surface - One of the POPUP_SURFACE_* values.
 * @returns {Promise<void>}
 */
export async function requestPopupSurface(surface) {
  await requestStore().set({ [POPUP_OPEN_REQUEST_KEY]: surface });
}

/**
 * Read the pending request and clear it, so it is honoured exactly once.
 * @returns {Promise<string|null>} The requested surface, or null when nothing was asked for.
 */
export async function takePopupSurfaceRequest() {
  const store = requestStore();
  const { [POPUP_OPEN_REQUEST_KEY]: surface = null } = await store.get(POPUP_OPEN_REQUEST_KEY);
  if (surface) {
    await store.remove(POPUP_OPEN_REQUEST_KEY);
  }
  return surface;
}
