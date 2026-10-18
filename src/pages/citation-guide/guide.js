/**
 * Citation guide page.
 *
 * The page itself is prose — static markup, readable with scripting off. The only behaviour is the
 * deep link, twice: a student reading about the library should be able to open the real one and
 * follow along rather than picture it.
 *
 * The library is opened by asking the service worker, which is what every other route to it does
 * (`OPEN_CITATION_LIBRARY`), so there is one place that decides where the library lives.
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';

/** The ids of the two "open the library" buttons — one in the banner, one in the footer. */
export const OPEN_LIBRARY_BUTTON_IDS = Object.freeze([
  'btn-guide-open-library',
  'btn-guide-open-library-footer',
]);

/** Said out loud when the message cannot be delivered, rather than failing silently. */
const FAILURE_MESSAGE = 'Could not open the library. Try the 📚 Library button in the popup.';

/**
 * Ask the service worker to open the full-page citation library in a new tab.
 * @returns {Promise<boolean>} true when the request was delivered
 */
export async function openCitationLibrary() {
  try {
    await chrome.runtime.sendMessage({ type: 'OPEN_CITATION_LIBRARY' });
    return true;
  } catch (err) {
    console.error('[citation-guide] could not open the library:', err);
    return false;
  }
}

/**
 * Wire the page's deep links.
 *
 * Returns a cleanup for the handlers it attached, so a test — or a future caller that mounts the
 * page more than once — can take them off again.
 *
 * @returns {() => void}
 */
export function initGuide() {
  const status = document.getElementById('guide-status');
  const cleanups = [];

  for (const id of OPEN_LIBRARY_BUTTON_IDS) {
    const button = document.getElementById(id);
    if (!button) {
      continue;
    }
    cleanups.push(
      attachAccessibleHandler(button, 'Open your citation library', async () => {
        const ok = await openCitationLibrary();
        if (status) {
          status.textContent = ok ? '' : FAILURE_MESSAGE;
        }
      })
    );
  }

  return () => cleanups.forEach(cleanup => cleanup());
}

if (typeof document !== 'undefined') {
  initGuide();
}

export default { initGuide, openCitationLibrary, OPEN_LIBRARY_BUTTON_IDS };
